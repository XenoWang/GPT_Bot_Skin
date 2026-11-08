import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Connection,endpointJSON,pageTarget,debuggerAddress} from './cdp-transport.mjs';
import {REGIONS} from '../renderer/core.mjs';
import {catalogFromReport} from './region-capabilities.mjs';
import {ownerCommand} from './host-tools.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.dirname(HERE);

// Runs in the official renderer. Never reads text, values, URLs, IDs or account data.
export function captureRegions(adapter){
 const roots=[document],protectedContent='[contenteditable],input,textarea,pre,code,[data-user-message-bubble],[data-markdown-text-style],iframe';
 const candidates=[],candidateNodes=[],mappedNodes=new Map();let visited=0,truncated=false;
 const roles=new Set(['navigation','main','complementary','dialog','alertdialog','menu','listbox','tablist','toolbar','search']);
 const visible=n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';};
 const selector=n=>{const parts=[];for(let i=0;n?.nodeType===1&&i<6;i++,n=n.parentElement){let index=1;for(let s=n.previousElementSibling;s;s=s.previousElementSibling)if(s.localName===n.localName)index++;parts.unshift(n.localName+':nth-of-type('+index+')');}return parts.join(' > ');};
  const describe=(n,rootIndex)=>{const s=getComputedStyle(n),r=n.getBoundingClientRect(),role=n.getAttribute('role');return {rootIndex,path:selector(n),tag:n.localName,role:roles.has(role)?role:null,visible:visible(n),rect:[r.x,r.y,r.width,r.height].map(v=>Math.round(v)),background:s.backgroundColor,foreground:s.color,hasBackgroundImage:s.backgroundImage!=='none',border:s.borderWidth,position:s.position,attributes:n.getAttributeNames().filter(k=>/^data-(app-|sidebar|composer|slot$|state$|code-)/.test(k)).slice(0,12)};};
 function walk(container,rootIndex){
  for(const n of container.children??[]){
   if(++visited>30000){truncated=true;return;}
   if(n.matches('[data-codex-appearance-owned]')||n.matches(protectedContent))continue;
    if(n.shadowRoot){if(roots.length<64){roots.push(n.shadowRoot);walk(n.shadowRoot,roots.length-1);}else truncated=true;}
   const structural=['nav','main','aside','header','footer','dialog'].includes(n.localName)||roles.has(n.getAttribute('role'))||n.hasAttribute('data-app-shell-focus-area');
    if(structural){if(candidates.length<160){candidates.push(describe(n,rootIndex));candidateNodes.push(n);}else truncated=true;}
   walk(n,rootIndex);if(truncated)return;
  }
 }
 walk(document,0);
 const regions=Object.entries(adapter.regions).map(([key,selectors])=>{
  const nodes=new Map(),selectorErrors=[];
  for(let i=0;i<roots.length;i++)for(const query of selectors){try{for(const n of roots[i].querySelectorAll(query)){if(!n.closest('[data-codex-appearance-owned]'))nodes.set(n,i);}}catch{selectorErrors.push(query);}}
  const entries=[...nodes],shown=entries.filter(([n])=>visible(n));
  for(const [n]of entries){if(!mappedNodes.has(n))mappedNodes.set(n,[]);mappedNodes.get(n).push(key);}
  return {key,matched:entries.length,visible:shown.length,status:shown.length?'observed':entries.length?'loaded-hidden':'not-observed',selectorErrors:[...new Set(selectorErrors)],samples:[...shown,...entries.filter(([n])=>!visible(n))].slice(0,3).map(([n,i])=>describe(n,i))};
 });
 for(const [index,node]of candidateNodes.entries())candidates[index].mappedRegions=mappedNodes.get(node)??[];
 const rail=[...document.querySelectorAll(adapter.chatLayoutState?.rail??'[data-app-navigation-rail]')].find(visible),main=[...document.querySelectorAll('[data-app-shell-main-surface]')].find(visible),r=rail?.getBoundingClientRect(),m=main?.getBoundingClientRect();
 const ratio=typeof devicePixelRatio==='number'?devicePixelRatio:1;
 const header=adapter.sidebarHeaderSelector?[...document.querySelectorAll(adapter.sidebarHeaderSelector)].find(visible)?.getBoundingClientRect():null,sidebar=[...document.querySelectorAll('[data-sidebar-navigation-root]')].find(visible)?.getBoundingClientRect();
 return {viewport:[innerWidth,innerHeight],pixelRatio:ratio,canvas:{window:[innerWidth,innerHeight],main:[Math.max(1,innerWidth-(r?.width??0)),innerHeight-(m?.top??0)],mainOrigin:[r&&r.x<innerWidth/2?r.right:0,m?.top??0],rail:r?[r.x,r.y,r.width,r.height]:null,sidebarHeaderHeight:header&&sidebar?header.bottom-sidebar.top:null},regionCoverage:regions,candidates,shadowRoots:roots.length-1,truncated,limitations:['Only loaded DOM and open shadow roots were inspected.','Unopened pages, closed shadow roots and external frames are not covered.','A selector match does not prove visual or interactive correctness.']};
}

export function makeCatalog(report,labels={}){
 return catalogFromReport(report,labels);
}

export function mergeReports(reports){
 if(!reports.length||reports.length>64)throw new Error('Expected 1–64 inventory reports');
 const first=reports[0];
 for(const r of reports)if(r.schemaVersion!==1||r.kind!=='codex-ui-inventory'||r.clientVersion!==first.clientVersion||r.adapterVersion!==first.adapterVersion||!Array.isArray(r.samples)||!Array.isArray(r.coverageLabels))throw new Error('Reports must use the same client and adapter versions');
 return {...first,createdAt:new Date().toISOString(),coverageLabels:[...new Set(reports.flatMap(r=>r.coverageLabels))],samples:reports.flatMap(r=>r.samples),targetLimitReached:reports.some(r=>r.targetLimitReached),unconfirmedRegions:[...new Set(reports.flatMap(r=>r.unconfirmedRegions??[]))],coverage:null};
}

export async function run(args=process.argv.slice(2)){
 let statePath,out,label='current',merge=[];
 for(let i=0;i<args.length;i++){
  const flag=args[i];if(!['--state','--out','--label','--merge'].includes(flag)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Usage: --state session.json --out report.json [--label page-state]; or --merge report.json (repeatable) --out report.json');
  const value=args[++i];if(flag==='--state')statePath=value;else if(flag==='--out')out=value;else if(flag==='--label')label=value;else merge.push(value);
 }
 if(!out||path.extname(out).toLowerCase()!=='.json'||!/^[-a-zA-Z0-9_]{1,64}$/.test(label)||Boolean(statePath)===Boolean(merge.length))throw new Error('Choose exactly one mode, a JSON output and a non-personal page-state label');
 const output=path.resolve(out),catalogPath=output.replace(/\.json$/i,'.regions.json');
 const inputs=[statePath,...merge].filter(Boolean).map(p=>path.resolve(p));if(inputs.includes(output)||inputs.includes(catalogPath))throw new Error('Output must not overwrite input');
 const labels=Object.fromEntries(await Promise.all(['en','zh-CN'].map(async code=>[code,JSON.parse(await readFile(path.join(ROOT,'locales',code+'.json'),'utf8'))])));
 let report;
 if(merge.length){report=mergeReports(await Promise.all(merge.map(async p=>{const data=await readFile(p);if(data.length>8*1024*1024)throw new Error('Report too large');return JSON.parse(data.toString('utf8'));})));}
 else{
  const data=await readFile(statePath);if(data.length>32768)throw new Error('Session file too large');const state=JSON.parse(data.toString('utf8'));
  const command=ownerCommand(statePath);await promisify(execFile)(command.file,command.args,{windowsHide:true,timeout:15000,maxBuffer:65536});
  debuggerAddress((await endpointJSON(state.port,'/json/version')).webSocketDebuggerUrl,state.port,'browser',state.browserId);
  const adapter=JSON.parse(await readFile(path.join(ROOT,'adapters','codex-26.1103.json'),'utf8'));
  const samples=[],targets=(await endpointJSON(state.port,'/json/list')).filter(t=>pageTarget(t,state.port));
  if(!targets.length)throw new Error('No allowed native page; do not broaden origin rules automatically');
  for(const t of targets.slice(0,8)){
   const c=await new Connection(t.webSocketDebuggerUrl).open();try{samples.push(await c.evaluate('('+captureRegions.toString()+')('+JSON.stringify(adapter)+')'));}finally{c.close();}
  }
  report={schemaVersion:1,kind:'codex-ui-inventory',createdAt:new Date().toISOString(),clientVersion:String(state.packageFullName??'').match(/^OpenAI\.Codex_([0-9.]+)_/)?.[1]??'unknown',adapterVersion:adapter.version,unconfirmedRegions:adapter.unconfirmedRegions??[],coverageLabels:[label],samples,targetLimitReached:targets.length>8};
 }
 const catalog=makeCatalog(report,labels);await mkdir(path.dirname(output),{recursive:true});
 // Exclusive creation preserves previous captures and private evidence.
 await writeFile(output,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
 await writeFile(catalogPath,JSON.stringify(catalog,null,2),{encoding:'utf8',flag:'wx'});
 console.log(JSON.stringify({report:output,catalog:catalogPath,regions:catalog.regions.length,readOnly:true}));return {report,catalog};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(error=>{console.error(error.message);process.exitCode=1;});
