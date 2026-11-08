import {createHash} from 'node:crypto';
import {validateManifest,SCENE_REGIONS,REGIONS,fitImage} from '../runtime/renderer/core.mjs';
import {coverageBlockers} from '../runtime/scripts/coverage-runner.mjs';
import {paletteCandidates,readableSurface,contrast} from './image-math.mjs';
// Color-bearing content keeps native semantic foregrounds. Explicit text
// affects mapped ordinary surfaces, never a universal descendant selector.
export const PRESERVE_TEXT_REGIONS=Object.freeze(['codeBlocks','toolCards','changeSummary','profileActivity','tables']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function normalizeStyle(value,allowSurface=false){
 if(!object(value)||Object.keys(value).some(k=>!['text','border','borderWidth',...(allowSurface?['surface']:[])].includes(k)))throw new Error('Invalid explicit control style');
 const result={};
 for(const [key,val]of Object.entries(value)){
  if(key==='borderWidth'){if(typeof val!=='number'||!Number.isFinite(val)||val<0||val>8)throw new Error('Border width must be within 0..8');result[key]=val;}
  else{if(typeof val!=='string'||!/^#[\da-f]{6}$/i.test(val))throw new Error('Explicit colors must use #RRGGBB');result[key]=val.toUpperCase();}
 }
 return result;
}
export function controlStyle(palette,key,measured){
 const general={...(palette.style??{})};if(PRESERVE_TEXT_REGIONS.includes(key))delete general.text;
 const explicit={...general,...palette.regionStyles?.[key]},foregrounds=explicit.text?[explicit.text]:measured;
 if(!foregrounds?.length)throw new Error('Missing foreground color samples for '+key);
 let style;
 if(explicit.surface||explicit.text){
  const candidates=explicit.surface?[explicit.surface]:palette.selected;
  const surface=candidates.find(color=>foregrounds.every(f=>contrast(color,f)>=4.5));
  if(!surface)throw new Error('EXPLICIT_CONTRAST_CONFLICT: '+key);
  style={surface,surfaceOpacity:1,border:palette.selected.at(-1),borderOpacity:.65,borderWidth:1};
 }else style=readableSurface(palette.selected,foregrounds);
 if(explicit.text)style.text=explicit.text;
 if(explicit.border){style.border=explicit.border;style.borderOpacity=1;}
 if(explicit.borderWidth!==undefined)style.borderWidth=explicit.borderWidth;
 return style;
}
export const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export function createSession(id,name,systemLanguage='en'){
 validateManifest({schemaVersion:1,id,name,regions:{}});
 if(['kurumi-twilight','neutral-dark'].includes(id))throw new Error('Built-in Skin IDs are reserved');
 return {schemaVersion:1,id,name,createdAt:new Date().toISOString(),suggestedLanguage:systemLanguage,inventory:null,selection:null,source:null,prompt:null,assets:{},palette:null,confirmations:{},previews:{},events:[]};
}
export function invalidate(session,stage){
 if(stage==='prompt'){delete session.confirmations.prompt;session.assets={};}
 if(['prompt','background'].includes(stage)){delete session.confirmations.background;delete session.previews.background;delete session.previews.complete;delete session.confirmations.complete;}
 if(stage==='complete'){delete session.previews.complete;delete session.confirmations.complete;}
}
export function selectLayout(session,choice,availableLocales=['zh-CN','en']){
 if(!session.inventory?.measurement?.maximized)throw new Error('Complete measured inventory before choosing a layout');
 if(!['unified','separate'].includes(choice.mode)||!availableLocales.includes(choice.language))throw new Error('Choose a supported form and installed Creator language');
 const catalog=session.catalog,regions=choice.regions??catalog.regions.filter(r=>!r.requiresAdapterReview).map(r=>r.key);
 if(!regions.length||new Set(regions).size!==regions.length||regions.some(k=>!REGIONS.includes(k)))throw new Error('Invalid region selection');
 const blocked=catalog.regions.filter(r=>regions.includes(r.key)&&r.requiresAdapterReview).map(r=>r.key);
 if(blocked.length)throw new Error('Regions need adapter review: '+blocked.join(', '));
 const excluded=choice.excludedStates??[];
 if(!Array.isArray(excluded)||excluded.some(id=>!session.inventory.coverage.states.some(s=>s.id===id)))throw new Error('Unknown excluded state');
 if(excluded.length&&!(typeof choice.exclusionReason==='string'&&choice.exclusionReason.trim()))throw new Error('Record the user-selected coverage exclusions');
 if(!regions.includes('chat'))throw new Error('A main scene is required');
 const next={mode:choice.mode,language:choice.language,regions,excludedStates:excluded,exclusionReason:choice.exclusionReason??'',sidebarSplit:choice.mode==='separate'&&choice.sidebarSplit===true};
 if(JSON.stringify(next)!==JSON.stringify(session.selection)){const changedImages=!session.selection||next.mode!==session.selection.mode||next.sidebarSplit!==session.selection.sidebarSplit;session.selection=next;if(changedImages)session.prompt=null;invalidate(session,changedImages?'prompt':'background');}
 return next;
}
export function requiredSlots(session){
 if(!session.selection)throw new Error('Choose a layout first');
 const {canvas,pixelRatio}=session.inventory.measurement;
 if(!Number.isFinite(pixelRatio)||pixelRatio<=0||pixelRatio>8)throw new Error('Invalid measured pixel ratio');
 const scaled=pair=>pair.map(n=>Math.ceil(n*pixelRatio));
 if(session.selection.mode==='unified')return [{id:'scene',target:scaled(canvas.window),description:'One complete landscape across the entire native window'}];
 const slots=[{id:'chat',target:scaled(canvas.main),description:'Complete maximized main scene, including space revealed when sidebars close'}];
 const maxRect=key=>session.inventory.samples.flatMap(s=>s.regionCoverage.filter(r=>r.key===key).flatMap(r=>(r.samples??[]).filter(n=>n.visible).map(n=>n.rect))).sort((a,b)=>b[2]*b[3]-a[2]*a[3])[0];
 if(session.selection.regions.includes('sidebar')){
  const rect=maxRect('sidebar');if(!rect)throw new Error('Measure the expanded sidebar first');
  slots.push({id:'sidebar',target:scaled(rect.slice(2)),description:'Independent full sidebar image'});
  if(session.selection.sidebarSplit){const height=canvas.sidebarHeaderHeight;if(!(height>0&&height<rect[3]))throw new Error('Visible sidebar header geometry is required for a split sidebar');slots.push({id:'sidebarHeader',target:scaled([rect[2],height]),description:'Sidebar header'}, {id:'sidebarBody',target:scaled([rect[2],rect[3]-height]),description:'Sidebar body'});}
 }
 return slots;
}
export function setSource(session,input){
 if(!session.selection)throw new Error('Choose layout and language first');
 if(!['provided','generated'].includes(input.kind))throw new Error('Choose provided or generated images');
 const value={kind:input.kind};if(input.kind==='generated'){value.provider=input.provider??'gpt';if(!['gpt','mcp'].includes(value.provider))throw new Error('Unsupported provider');if(value.provider==='mcp'){if(typeof input.providerName!=='string'||!input.providerName.trim())throw new Error('Choose an actual configured MCP provider');value.providerName=input.providerName;}}
 if(JSON.stringify(value)!==JSON.stringify(session.source)){session.source=value;session.prompt=null;invalidate(session,'prompt');}return value;
}
export function setPrompt(session,input){
 if(session.source?.kind!=='generated')throw new Error('Select generation first');
 if(typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>20000)throw new Error('A reviewed prompt is required');
 const value={text:input.prompt,provider:session.source,slots:requiredSlots(session)};value.revision=digest(value);
 if(value.revision!==session.prompt?.revision){session.prompt=value;invalidate(session,'prompt');}return value;
}
export function backgroundRevision(session){return digest({binding:session.inventory?.binding,measurement:session.inventory?.measurement,selection:session.selection,source:session.source,prompt:session.prompt?.revision,assets:Object.fromEntries(Object.entries(session.assets).sort().map(([key,a])=>[key,{hash:a.hash,subject:a.subject,target:a.target,overlay:a.overlay??.35}]))});}
export function completeRevision(session){return digest({background:backgroundRevision(session),palette:session.palette,foregrounds:session.foregrounds});}
export function blockers(session){
 if(!session.selection)return ['layout-not-selected'];
 const blocked=coverageBlockers(session.inventory,session.selection.regions,session.selection.excludedStates);
 for(const region of session.catalog.regions)if(session.selection.regions.includes(region.key)&&region.requiresAdapterReview)blocked.push('adapter:'+region.key);
 if(session.inventory.clientVersion!==session.inventory.adapterVersion)blocked.push('version-mismatch');
 if(session.inventory.coverage.restored===false)blocked.push('navigation-or-window-restoration-incomplete');
 for(const id of requiredSlots(session).map(s=>s.id))if(!session.assets[id])blocked.push('asset:'+id);
 if(session.source?.kind==='generated'&&session.confirmations.prompt?.revision!==session.prompt?.revision)blocked.push('prompt-not-confirmed');
 return blocked;
}
export function buildManifest(session,stage='background'){
 const blocked=blockers(session);if(blocked.length)throw new Error('Resolve or explicitly exclude coverage gaps: '+blocked.join(', '));
 const regions={},image=id=>{const a=session.assets[id];return {asset:'assets/'+id+'.png',blackOverlay:a.overlay??.35,subject:a.subject,fit:'subject-safe',maxScale:1,blurFill:false};};
 const result={schemaVersion:2,id:session.id,name:session.name,regions};
 const surfaces=session.selection.regions.filter(k=>SCENE_REGIONS.includes(k));
 if(session.selection.mode==='unified'){for(const key of surfaces)regions[key]={enabled:true};result.scene={scope:'window',background:image('scene'),regions:surfaces};}
 else{
  regions.chat={enabled:true};result.scene={scope:'main',background:image('chat'),regions:['chat']};
  if(session.selection.regions.includes('sidebar')){regions.sidebar={enabled:true,background:image('sidebar')};if(session.selection.sidebarSplit)result.sidebarLayout={mode:'split',header:image('sidebarHeader'),body:image('sidebarBody')};}
 }
 const asset=session.assets[session.selection.mode==='unified'?'scene':'chat'];result.scene.placements=[];
 for(const measured of [session.inventory.measurement.windowed,session.inventory.measurement].filter(Boolean)){
  const c=measured.canvas,frame=result.scene.scope==='window'?[0,0,...c.window]:[...(c.mainOrigin??[0,0]),...c.main],f=fitImage(frame[2],frame[3],...asset.target,asset.subject,1,'subject-safe');
  if(f.width<frame[2]-.01||f.height<frame[3]-.01)throw new Error('SUBJECT_CONFLICT_WINDOW: the protected subject cannot fill a measured window; revise composition');
  const profile={viewport:c.window,pixelRatio:measured.pixelRatio,frame,source:asset.target,image:[f.x,f.y,f.width,f.height]};
  if(!result.scene.placements.some(p=>JSON.stringify(p)===JSON.stringify(profile)))result.scene.placements.push(profile);
 }
 if(stage==='complete'){
  if(session.confirmations.background?.revision!==backgroundRevision(session)||!session.palette)throw new Error('Confirm the current background and choose colors first');
  if(session.palette.mode==='theme'){const candidates=paletteCandidates(Object.values(session.assets).flatMap(a=>a.colors));if(session.palette.selected.some(c=>!candidates.includes(c)))throw new Error('The background palette changed; review the retained color selection');}
  for(const key of session.selection.regions){
   if(result.scene?.regions.includes(key)||regions[key]?.background)continue;
   if(key==='scrollbars'){regions[key]={enabled:true,style:{surface:session.palette.selected[0],text:session.palette.selected.at(-1)}};continue;}
   regions[key]={enabled:true,style:controlStyle(session.palette,key,session.foregrounds?.[key])};
  }
 }
 return validateManifest(result);
}
export function choosePalette(session,input){
 if(session.confirmations.background?.revision!==backgroundRevision(session))throw new Error('Confirm the current background before choosing control colors');
 if(!object(input)||Object.keys(input).some(k=>!['mode','colors','style','regionStyles'].includes(k)))throw new Error('Invalid palette options');
 if(!['theme','custom'].includes(input.mode)||!Array.isArray(input.colors)||!input.colors.length||input.colors.length>5||new Set(input.colors).size!==input.colors.length||input.colors.some(c=>!/^#[\da-f]{6}$/i.test(c)))throw new Error('Select one to five valid colors');
 if(input.mode!=='custom'&&(input.style!==undefined||input.regionStyles!==undefined))throw new Error('Explicit control styles require custom colors');
 const candidates=paletteCandidates(Object.values(session.assets).flatMap(a=>a.colors));
 if(input.mode==='theme'&&input.colors.some(c=>!candidates.includes(c.toUpperCase())))throw new Error('Select from the displayed palette');
 const palette={mode:input.mode,selected:input.colors.map(c=>c.toUpperCase())};
 if(input.style!==undefined)palette.style=normalizeStyle(input.style);
 if(input.regionStyles!==undefined){
  if(!object(input.regionStyles))throw new Error('Invalid region style overrides');
  palette.regionStyles={};
  for(const [key,value]of Object.entries(input.regionStyles)){
   if(!session.selection.regions.includes(key)||SCENE_REGIONS.includes(key)||key==='scrollbars')throw new Error('Explicit style requires a selected control region: '+key);
   const style=normalizeStyle(value,true);
   if(style.text&&PRESERVE_TEXT_REGIONS.includes(key))throw new Error('Preserve native semantic foregrounds for '+key);
   palette.regionStyles[key]=style;
  }
 }
 // Fail before changing the session; old accepted colors remain recoverable.
 if(input.style!==undefined||input.regionStyles!==undefined)for(const key of session.selection.regions)if(!SCENE_REGIONS.includes(key)&&key!=='scrollbars')controlStyle(palette,key,session.foregrounds?.[key]);
 session.palette=palette;invalidate(session,'complete');return session.palette;
}
export function confirm(session,stage,revision,note){
 if(typeof note!=='string'||!note.trim())throw new Error('Record the actual user confirmation; this command cannot create consent');
 const expected=stage==='prompt'?session.prompt?.revision:stage==='background'?backgroundRevision(session):stage==='complete'?completeRevision(session):null;
 if(!expected||revision!==expected)throw new Error('Stale or unknown confirmation');
 if(stage!=='prompt'&&(session.previews[stage]?.revision!==revision||!session.previews[stage]?.applied||session.previews[stage]?.uncoveredScene))throw new Error('Preview the exact revision and resolve uncovered scene geometry before confirmation');
 if(stage==='complete'&&session.confirmations.background?.revision!==backgroundRevision(session))throw new Error('Background confirmation is stale');
 session.confirmations[stage]={revision,note,at:new Date().toISOString()};return {stage,revision};
}
export function summary(session){
 return {id:session.id,language:session.selection?.language??session.suggestedLanguage,selection:session.selection,source:session.source,inventory:session.inventory?{version:session.inventory.clientVersion,observed:session.inventory.coverage?.states.filter(s=>s.status==='observed').length,gaps:session.inventory.coverage?.states.filter(s=>s.status!=='observed').map(s=>s.id),restored:session.inventory.coverage?.restored}:null,slots:session.selection?requiredSlots(session):[],assets:Object.keys(session.assets),confirmations:Object.keys(session.confirmations),backgroundRevision:session.selection?backgroundRevision(session):null,completeRevision:session.palette?completeRevision(session):null};
}
