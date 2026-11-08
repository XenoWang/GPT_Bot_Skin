import {readFile,writeFile,mkdir,rename,unlink,open,lstat,realpath} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createSession,selectLayout,setSource,setPrompt,requiredSlots,backgroundRevision,completeRevision,buildManifest,choosePalette,confirm,invalidate,summary,digest,PRESERVE_TEXT_REGIONS} from './workflow.mjs';
import {cropPlan,paletteCandidates,hex} from './image-math.mjs';
import {writeCatalog} from './catalog.mjs';
import {inventory} from '../runtime/scripts/coverage-runner.mjs';
import {makeCatalog} from '../runtime/scripts/inspect-ui-regions.mjs';
import {managedPage} from '../runtime/scripts/managed-page.mjs';
import {installAuthoring} from '../runtime/renderer/authoring.mjs';
import {validatePack,requiredAssets} from '../runtime/renderer/core.mjs';
import {loadLocales,selectLanguage,localeBundle,translate,localizeError} from './localization.mjs';
import {pythonBackend,localeCommand} from '../runtime/scripts/host-tools.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'..'),exec=promisify(execFile);
let currentLocale;
async function systemLocale(){try{if(process.platform==='win32'){const command=localeCommand(),result=await exec(command.file,command.args,{windowsHide:true,timeout:10000,maxBuffer:4096});return result.stdout.trim();}}catch(error){if(process.env.CODEX_SKIN_HOST_BACKEND==='python')throw error;}return Intl.DateTimeFormat().resolvedOptions().locale;}
const inside=(root,file)=>{const relative=path.relative(root,file);return relative===''||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
const exists=async file=>{try{await lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
export async function atomicJSON(file,value){
 const bytes=JSON.stringify(value,null,2)+'\n',temporary=file+'.'+randomUUID()+'.tmp';
 const handle=await open(temporary,'wx');try{await handle.writeFile(bytes,'utf8');await handle.sync();}finally{await handle.close();}
 try{await rename(temporary,file);}catch(e){await unlink(temporary).catch(()=>{});throw e;}
}
async function sessionDirectory(value){
 if(!value)throw new Error('--session is required (an ignored local directory)');
 const directory=path.resolve(value),allowed=[path.join(ROOT,'.local','creator'),path.join(ROOT,'work')];
 if(!allowed.some(root=>inside(root,directory)))throw new Error('Keep sessions under the package .local/creator/ or work/ directory');
 for(let current=directory;inside(ROOT,current);current=path.dirname(current)){if(await exists(current)&&(await lstat(current)).isSymbolicLink())throw new Error('Session path must not use symlinks/junctions');if(current===ROOT)break;}
 await mkdir(directory,{recursive:true});return directory;
}
async function rejectLinks(file){for(let current=file;;current=path.dirname(current)){if(await exists(current)&&(await lstat(current)).isSymbolicLink())throw new Error('Output path must not use symlinks/junctions');if(path.dirname(current)===current)break;}}
async function lock(directory){
 const file=path.join(directory,'session.lock');
 try{const handle=await open(file,'wx');await handle.writeFile(JSON.stringify({pid:process.pid}));await handle.close();}
 catch(e){if(e.code!=='EEXIST')throw e;const old=JSON.parse(await readFile(file,'utf8'));let alive=true;try{process.kill(old.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}
  if(alive)throw new Error('Another creator command owns this session');await unlink(file);return lock(directory);
 }
 return ()=>unlink(file);
}
function parse(argv){
 const [command,...rest]=argv,args={command};
 const flags=new Set(['session','state','target','id','name','input','slot','subject','stage','revision','note','output','overlay']);
 for(let i=0;i<rest.length;i+=2){const key=rest[i]?.replace(/^--/,'');if(!rest[i]?.startsWith('--')||!flags.has(key)||rest[i+1]===undefined||Object.hasOwn(args,key))throw new Error('Unknown, duplicate or incomplete option');args[key]=rest[i+1];}
 return args;
}
async function inputJSON(file){if(!file)throw new Error('--input JSON file is required');const bytes=await readFile(file);if(bytes.length>128*1024)throw new Error('Input JSON exceeds 128 KiB');return JSON.parse(bytes.toString('utf8'));}
async function codec(directory,spec){
 const specPath=path.join(directory,'codec-'+randomUUID()+'.json');await atomicJSON(specPath,spec);
 try{const python=pythonBackend(),file=python??'powershell.exe',args=python?['-X','utf8',path.join(HERE,'image-codec.py'),'--spec',specPath]:['-NoProfile','-File',path.join(HERE,'image-codec.ps1'),'-SpecPath',specPath];const result=await exec(file,args,{windowsHide:true,maxBuffer:1024*1024,timeout:60000});return JSON.parse(result.stdout.replace(/^\uFEFF/,''));}finally{await unlink(specPath);}
}
async function verifiedAssets(directory,session){
 const assets={};for(const slot of requiredSlots(session)){
  const info=session.assets[slot.id];if(!info)throw new Error('Missing asset '+slot.id);
  const file=path.resolve(directory,info.file),resolved=await realpath(file);
  if(!inside(directory,resolved))throw new Error('Asset escapes the session');
  const bytes=await readFile(resolved);if(digest(bytes)!==info.hash||bytes.length>20*1024*1024)throw new Error('Asset changed or exceeds the pack limit: '+slot.id);
  if(JSON.stringify(info.target)!==JSON.stringify(slot.target))throw new Error('Canvas changed; reprocess '+slot.id);
  assets['assets/'+slot.id+'.png']='data:image/png;base64,'+bytes.toString('base64');
 }
 return assets;
}
async function draftPack(directory,session,stage){
 const manifest=buildManifest(session,stage),all=await verifiedAssets(directory,session),assets=Object.fromEntries(requiredAssets(manifest).map(name=>[name,all[name]]));return validatePack({manifest,assets});
}
async function bridge(args,action){
 if(!args.state)throw new Error('--state must identify the verified managed runtime session');
 const c=await managedPage(args.state,args.target);
 try{
  const version=await c.page.evaluate('window.__codexAppearanceV1?.adapter?.version');
  if(version!==c.clientVersion)throw new Error('Runtime/client version mismatch');
  if(!await c.page.evaluate('!!(window.__codexAppearanceV1?.features?.sharedScene && window.__codexAppearanceV1?.validateCreatorPack)'))throw new Error('Update the managed Skin runtime before previewing');
  // Reuse the runtime validator; no arbitrary expression comes from a pack or session file.
  await c.page.evaluate('('+installAuthoring.toString()+')(window.__codexAppearanceV1,window.__codexAppearanceV1.validateCreatorPack.bind(window.__codexAppearanceV1))');
  return await action(c.page,c.clientVersion);
 }finally{c.close();}
}
function foregroundSamples(report){
 const colors={};for(const sample of report.samples)for(const region of sample.regionCoverage)for(const n of region.samples??[]){if(!n.visible)continue;const match=/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(n.foreground??'');if(!match||match[4]!==undefined&&Number(match[4])!==1)continue;const color=hex(match.slice(1,4).map(Number));(colors[region.key]??=[]).push(color);}
 return Object.fromEntries(Object.entries(colors).map(([k,values])=>[k,[...new Set(values)]]));
}
export async function run(argv=process.argv.slice(2)){
 const locales=await loadLocales(),systemLanguage=selectLanguage(locales,await systemLocale());currentLocale=localeBundle(locales,systemLanguage);
 const args=parse(argv),directory=await sessionDirectory(args.session),sessionFile=path.join(directory,'session.json'),release=await lock(directory);
 try{
  let session=await exists(sessionFile)?JSON.parse(await readFile(sessionFile,'utf8')):null;
  if(!session){if(args.command!=='start')throw new Error('Run start first');session=createSession(args.id??'skin-'+Date.now(),args.name??'My Skin',systemLanguage);await atomicJSON(sessionFile,session);}
  if(session.schemaVersion!==1)throw new Error('Unsupported creator session version');
  currentLocale=localeBundle(locales,session.selection?.language??session.suggestedLanguage);const t=(key,values)=>translate(currentLocale,key,values);
  const save=()=>atomicJSON(sessionFile,session);
  let result;
  switch(args.command){
   case 'start':case 'inventory':case 'capture':{
    if(!args.state)throw new Error('Inventory requires --state; start the bundled managed runtime first');
    const before=session.inventory?.binding,measurement=JSON.stringify(session.inventory?.measurement);
    const data=await inventory({statePath:args.state,targetId:args.target,previous:session.inventory,manualState:args.command==='capture'?args.slot:null,onProgress:async report=>{session.inventory=report;await atomicJSON(path.join(directory,'inventory.json'),report);await save();}});
    session.inventory=data.report;const labels=Object.fromEntries(await Promise.all(['en','zh-CN'].map(async code=>[code,JSON.parse(await readFile(path.join(ROOT,'runtime','locales',code+'.json'),'utf8'))])));
    session.catalog=makeCatalog(data.report,labels);session.foregrounds=foregroundSamples(data.report);
    for(const region of session.catalog.regions)if(!region.sharedScene&&region.key!=='scrollbars'){region.configuration.push('borderWidth');if(!PRESERVE_TEXT_REGIONS.includes(region.key))region.configuration.push('text');}
    if(before!==data.report.binding||measurement!==JSON.stringify(data.report.measurement)){invalidate(session,'prompt');session.selection=null;}
    const catalog=await writeCatalog(path.join(directory,'catalog'),data.report,session.catalog,currentLocale);
    await atomicJSON(path.join(directory,'regions.json'),session.catalog);result={...summary(session),catalog,unclassifiedCandidates:session.catalog.candidates.length,question:t('question.layout')};break;
   }
   case 'status':result=summary(session);break;
   case 'select':{const selection=selectLayout(session,await inputJSON(args.input),Object.keys(locales));currentLocale=localeBundle(locales,selection.language);await writeCatalog(path.join(directory,'catalog'),session.inventory,session.catalog,currentLocale);result={selection,slots:requiredSlots(session),question:t('question.source')};break;}
   case 'source':result=setSource(session,await inputJSON(args.input));break;
   case 'prompt':result=setPrompt(session,await inputJSON(args.input));await atomicJSON(path.join(directory,'generation-request.json'),result);break;
   case 'confirm':{
    if(args.stage!=='prompt')await verifiedAssets(directory,session);
    result=confirm(session,args.stage,args.revision,args.note);break;
   }
   case 'asset':{
    if(!session.source)throw new Error('Choose an image source first');
    if(session.source.kind==='generated'&&(!session.prompt||session.confirmations.prompt?.revision!==session.prompt.revision))throw new Error('User must confirm the current prompt before generation/ingestion');
    const slot=requiredSlots(session).find(s=>s.id===args.slot);if(!slot)throw new Error('Unknown asset slot');
    if(!args.input||args.subject===undefined)throw new Error('Supply --input image and --subject "[left,top,right,bottom]" or explicit "null" after inspecting the image');
    const source=await realpath(args.input),bytes=await readFile(source);if(bytes.length>20*1024*1024)throw new Error('Source exceeds 20 MiB');
    const measured=await codec(directory,{input:source}),plan=cropPlan([measured.width,measured.height],slot.target,JSON.parse(args.subject));
    const key=digest({source:digest(bytes),plan}),relative='assets/'+args.slot+'-'+key.slice(0,16)+'.png',output=path.join(directory,relative),receiptPath=output+'.receipt.json';await mkdir(path.dirname(output),{recursive:true});
    if(await exists(output)){
     if(!await exists(receiptPath))throw new Error('Derived asset has no trusted receipt; retain evidence before recovery');
     const receipt=JSON.parse(await readFile(receiptPath,'utf8'));if(receipt.key!==key||receipt.hash!==digest(await readFile(output)))throw new Error('Derived asset changed; do not refresh its expected hash');
    }else{await codec(directory,{input:source,output,target:slot.target,crop:plan.crop});await atomicJSON(receiptPath,{key,hash:digest(await readFile(output))});}
    if(digest(await readFile(source))!==digest(bytes))throw new Error('Source changed during processing');
    const processed=await codec(directory,{input:output});if(processed.width!==slot.target[0]||processed.height!==slot.target[1])throw new Error('Processed dimensions mismatch');
    const overlay=args.overlay===undefined ? .35 : Number(args.overlay);if(!Number.isFinite(overlay)||overlay<0||overlay>1)throw new Error('Overlay must be within 0..1');
    const info={file:relative,source,sourceHash:digest(bytes),hash:digest(await readFile(output)),target:slot.target,subject:plan.subject,crop:plan.crop,protected:plan.protected,overlay,colors:processed.colors};
    if(JSON.stringify(info)!==JSON.stringify(session.assets[slot.id])){session.assets[slot.id]=info;invalidate(session,'background');}
    result={slot:slot.id,image:output,target:info.target,subject:info.subject,revision:backgroundRevision(session)};break;
   }
   case 'background':{
    const pack=await draftPack(directory,session,'background');await atomicJSON(path.join(directory,'background.manifest.json'),pack.manifest);result={manifest:path.join(directory,'background.manifest.json'),revision:backgroundRevision(session)};break;
   }
   case 'colors':{
    if(!args.input){result={candidates:paletteCandidates(Object.values(session.assets).flatMap(a=>a.colors)),question:t('question.colors')};break;}
    result=choosePalette(session,await inputJSON(args.input));break;
   }
   case 'palette-ui':{
    if(session.confirmations.background?.revision!==backgroundRevision(session))throw new Error('Confirm background first');
    const colors=paletteCandidates(Object.values(session.assets).flatMap(a=>a.colors)),revision=backgroundRevision(session);
    result=await bridge(args,async page=>{const live=await page.evaluate('window.__codexAppearanceV1.creator.revision');if(live!==revision){const pack=await draftPack(directory,session,'background');session.previews.background=await page.evaluate('window.__codexAppearanceV1.creator.preview('+JSON.stringify(pack)+','+JSON.stringify(revision)+',"background",'+JSON.stringify(currentLocale)+')');}return page.evaluate('window.__codexAppearanceV1.creator.palette('+JSON.stringify(colors)+','+JSON.stringify(revision)+')');});break;
   }
   case 'palette-read':{
    const choice=await bridge(args,page=>page.evaluate('window.__codexAppearanceV1.creator.choice'));
    if(!choice||choice.revision!==backgroundRevision(session))throw new Error('No current user checkbox submission');result=choosePalette(session,{mode:'theme',colors:choice.colors});break;
   }
   case 'preview':{
    const stage=args.stage??'background';if(!['background','complete'].includes(stage))throw new Error('Invalid preview stage');
    const pack=await draftPack(directory,session,stage),revision=stage==='background'?backgroundRevision(session):completeRevision(session);
    result=await bridge(args,async(page,version)=>{if(version!==session.inventory.clientVersion)throw new Error('Re-inventory after a version change');return page.evaluate('window.__codexAppearanceV1.creator.preview('+JSON.stringify(pack)+','+JSON.stringify(revision)+','+JSON.stringify(stage)+','+JSON.stringify(currentLocale)+')');});
    if(!result?.applied||result.revision!==revision||result.stage!==stage)throw new Error('Preview receipt mismatch');session.previews[stage]=result;
    await atomicJSON(path.join(directory,stage+'.manifest.json'),pack.manifest);break;
   }
   case 'restore':result=await bridge(args,page=>page.evaluate('window.__codexAppearanceV1.creator.restore()'));session.previews={};break;
   case 'export':{
    if(session.confirmations.complete?.revision!==completeRevision(session))throw new Error('Confirm the current complete preview before exporting');
    const pack=await draftPack(directory,session,'complete');
    const manifest=Buffer.from(JSON.stringify(pack.manifest,null,2)+'\n'),images=Object.entries(pack.assets).map(([name,url])=>[name,Buffer.from(url.split(',')[1],'base64')]);
    if(manifest.length>128*1024||images.length+1>100||manifest.length+images.reduce((n,[,b])=>n+b.length,0)>48*1024*1024)throw new Error('Export exceeds import limits');
    const destination=path.resolve(args.output??path.join(directory,'export',session.id));
    await rejectLinks(destination);
    for(const protectedRoot of ['runtime/themes'])if(inside(path.join(ROOT,protectedRoot),destination))throw new Error('Export to a new folder, not an installed/built-in Skin directory');
    if(await exists(destination))throw new Error('Export destination already exists');
    await mkdir(path.dirname(destination),{recursive:true});await mkdir(destination);await mkdir(path.join(destination,'assets'));
    for(const [name,bytes]of images)await writeFile(path.join(destination,name),bytes,{flag:'wx'});
    await writeFile(path.join(destination,'manifest.json'),manifest,{flag:'wx'});
    for(const [name,bytes]of images)if(digest(await readFile(path.join(destination,name)))!==digest(bytes))throw new Error('Export readback failed');
    session.export={revision:completeRevision(session),path:destination,at:new Date().toISOString()};result={...session.export,files:images.length+1,excludedStates:session.selection.excludedStates};break;
   }
   default:throw new Error('Commands: start, inventory, capture, status, select, source, prompt, confirm, asset, background, colors, palette-ui, palette-read, preview, restore, export');
  }
  if(args.command!=='status'){session.events.push({command:args.command,at:new Date().toISOString()});await save();}
  if(result.slots)result.slots=result.slots.map(slot=>({...slot,description:t('slot.'+slot.id)}));
  return {...result,language:currentLocale.locale,languages:Object.values(locales).map(l=>({locale:l.locale,name:l.name}))};
 }finally{await release();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(currentLocale?localizeError(currentLocale,error.message):error.message);process.exitCode=1;});
