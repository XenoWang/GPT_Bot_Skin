import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {managedPage} from './managed-page.mjs';
import {windowController} from './window-control.mjs';
import {captureRegions,makeCatalog} from './inspect-ui-regions.mjs';
import {readProfileData,readAdapter} from './adapter-registry.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const settle=()=>new Promise(resolve=>setTimeout(resolve,250));
const bindingFor=(client,adapter,plan)=>createHash('sha256').update(JSON.stringify([client.clientVersion,adapter,plan,client.targetId])).digest('hex');

export function viewportSnapshot(){return {viewport:[innerWidth,innerHeight],pixelRatio:devicePixelRatio};}
// Window decorations can settle after the native placement acknowledgement.
// Clock/sleep are injectable only for offline orchestration tests, never a Skin option.
export async function stableViewport(page,{now=()=>performance.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const start=now();let previous=null,stableSince=start;
 while(now()-start<=3000){
  const value=await page.evaluate('('+viewportSnapshot.toString()+')()');
  if(!value||!Array.isArray(value.viewport)||value.viewport.length!==2||value.viewport.some(n=>!Number.isInteger(n)||n<=0)||!Number.isFinite(value.pixelRatio)||value.pixelRatio<=0||value.pixelRatio>8)throw new Error('Invalid viewport measurement');
  const key=JSON.stringify(value),time=now();if(time-start>3000)throw new Error('Viewport did not stabilize after window transition');if(key!==previous){previous=key;stableSince=time;}
  if(time-start>=500&&time-stableSince>=240)return value;
  await sleep(80);
 }
 throw new Error('Viewport did not stabilize after window transition');
}
function sameViewport(sample,observed){return !!observed&&sample.pixelRatio===observed.pixelRatio&&JSON.stringify(sample.viewport)===JSON.stringify(observed.viewport);}

// Only known navigation attributes and structural state are read. No text/value/URL scraping.
export function navigateKnown(kind,key){
 if(kind==='surface')return {requested:false,reason:'manual-native-surface'};
 const visible=n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden'&&!n.closest('[inert],[aria-hidden="true"]');};
 const query=kind==='settings'?`[data-settings-panel-slug="${key}"]`:`[data-sidebar-destination="builtin:${key}"]`;
 const nodes=[...document.querySelectorAll(query)].filter(visible);
 if(nodes.length!==1)return {requested:false,reason:'missing-or-ambiguous-entry'};
 const n=nodes[0];if(n.matches(':disabled,[aria-disabled="true"]'))return {requested:false,reason:'disabled-entry'};
 n.click();return {requested:true};
}
export function navigationReached(kind,key,selector){
 if(kind==='surface')return [...document.querySelectorAll(selector)].some(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!n.closest('[inert],[aria-hidden="true"]');});
 const query=kind==='settings'?`[data-settings-panel-slug="${key}"]`:`[data-sidebar-destination="builtin:${key}"]`;
 return [...document.querySelectorAll(query)].some(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden'&&!n.closest('[inert],[aria-hidden="true"]')&&(n.getAttribute('aria-current')==='page'||n.getAttribute('aria-selected')==='true'||['active','selected','checked'].includes(n.getAttribute('data-state'))||n.getAttribute('data-selected')==='true');});
}
export function saveNavigation(){
 const active=document.activeElement;
 if(active?.matches('input,textarea,[contenteditable="true"]'))return {ready:false,reason:'editable-focused'};
 const visible=n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden'&&!n.closest('[inert],[aria-hidden="true"]');};
 const current=n=>n.getAttribute('aria-current')==='page'||n.getAttribute('aria-selected')==='true'||['active','selected','checked'].includes(n.getAttribute('data-state'))||n.getAttribute('data-selected')==='true';
 const selected=[...document.querySelectorAll('[data-sidebar-destination],[data-settings-panel-slug]')].filter(n=>visible(n)&&current(n));
 const routes=selected.map(n=>{const attribute=n.getAttribute('data-settings-panel-slug')!==null?'data-settings-panel-slug':'data-sidebar-destination';return {attribute,value:n.getAttribute(attribute)};});
 const rows=[...document.querySelectorAll('[data-app-action-sidebar-thread-row]')].filter(n=>visible(n)&&(n.getAttribute('data-app-action-sidebar-thread-selected')==='true'||n.getAttribute('aria-current')==='page'));
 const attributes=['data-app-action-sidebar-thread-host-id','data-app-action-sidebar-thread-id','data-app-action-sidebar-thread-kind'];
 const thread=rows.length===1?Object.fromEntries(attributes.map(k=>[k,rows[0].getAttribute(k)])):null;
 const conversation=[...document.querySelectorAll('.thread-scroll-container,.messaging-embedded .conversation-viewport')].some(visible);
 const frame=document.querySelector('[data-app-shell-frame]');
 const restorable=routes.every(route=>typeof route.value==='string'&&route.value.length>0)&&rows.length<=1&&(!thread||Object.values(thread).every(v=>typeof v==='string'&&v.length>0))&&(!conversation||!!thread)&&(routes.length>0||!!thread);
 // Opaque identity stays in renderer memory; reports contain only capability booleans.
 window.__codexCreatorNavigation={selected,routes,thread,restorable,active,leftOpen:frame?.getAttribute('data-app-shell-sidebar-open')};return {ready:true,restorable};
}
export function sidebarState(desired,configuredLabels){
 const frame=document.querySelector('[data-app-shell-frame]'),value=frame?.getAttribute('data-app-shell-sidebar-open');
 if(!['true','false'].includes(value))return {requested:false,reason:'sidebar-state-unknown'};
 if(value===String(desired))return {requested:true,already:true};
 const labels=configuredLabels??['Toggle sidebar','Open sidebar','Close sidebar','切换侧栏','打开侧栏','关闭侧栏'];
 if(!Array.isArray(labels)||!labels.length||labels.some(label=>typeof label!=='string'||!label.trim()))return {requested:false,reason:'sidebar-toggle-unmapped'};
 const controls=[...document.querySelectorAll('button[aria-label]')].filter(n=>{const r=n.getBoundingClientRect();return labels.includes(n.getAttribute('aria-label'))&&r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden'&&!n.closest('[inert],[aria-hidden="true"]')&&!n.disabled;});
 if(controls.length!==1)return {requested:false,reason:'sidebar-toggle-unmapped'};controls[0].click();return {requested:true};
}
export async function restoreNavigation(required=false){
 const available=n=>{if(!n.isConnected)return false;const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden'&&!n.closest('[inert],[aria-hidden="true"]');};
 const state=window.__codexCreatorNavigation;delete window.__codexCreatorNavigation;
 if(!state)return false;
 const current=n=>n.getAttribute('aria-current')==='page'||n.getAttribute('aria-selected')==='true'||['active','selected','checked'].includes(n.getAttribute('data-state'))||n.getAttribute('data-selected')==='true';
 const waitFor=async get=>{for(let attempt=0;attempt<20;attempt++){const value=get();if(value)return value;await new Promise(resolve=>setTimeout(resolve,50));}return null;};
 const unique=(selector,matches)=>{const nodes=[...document.querySelectorAll(selector)].filter(n=>available(n)&&matches(n));return nodes.length===1?nodes[0]:null;};
 try{
  // A resumed inventory may not navigate at all. Clicking "home" here would lose the chat.
  if(!required)return true;
  if(!state.restorable)return false;
  for(const route of state.routes){
   const find=()=>unique('['+route.attribute+']',n=>n.getAttribute(route.attribute)===route.value);
   const node=await waitFor(find);if(!node)return false;node.click();
   if(!await waitFor(()=>{const n=find();return n&&current(n);}))return false;
  }
  if(state.thread){
   const matches=n=>Object.entries(state.thread).every(([key,value])=>n.getAttribute(key)===value);
   const find=()=>unique('[data-app-action-sidebar-thread-row]',matches);
   const node=await waitFor(find);if(!node)return false;node.click();
   if(!await waitFor(()=>{const rows=[...document.querySelectorAll('[data-app-action-sidebar-thread-row]')].filter(n=>available(n)&&(n.getAttribute('data-app-action-sidebar-thread-selected')==='true'||n.getAttribute('aria-current')==='page'));return rows.length===1&&matches(rows[0]);}))return false;
  }
  return true;
 }finally{if(state.active?.isConnected)state.active.focus({preventScroll:true});}
}
export function coverageBlockers(report,regions,excluded=[]){
 const rows=report.coverage?.states??[];
 if(!rows.length)return ['coverage-plan-missing'];
 const allowed=new Set(excluded);
 return rows.filter(s=>s.status!=='observed'&&!allowed.has(s.id)&&s.regions.some(r=>regions.includes(r))).map(s=>s.id);
}
export function navigationRoute(id,controls={}){
 const match=/^(page|settings)-([a-z][a-z0-9-]*)$/.exec(id);
 if(!match)throw new Error('Unknown navigation state');
 const route=controls.navigationAliases?.[id]??{kind:match[1]==='page'?'destination':'settings',key:match[2]};
 if(!route||!['destination','settings','surface'].includes(route.kind)||typeof route.key!=='string'||!/^[a-z][a-z0-9-]*$/.test(route.key)||route.kind==='surface'&&(typeof route.selector!=='string'||!route.selector.startsWith('[data-app-shell-main-surface] ')||route.selector.length>512))throw new Error('Invalid navigation mapping');
 return {kind:route.kind,key:route.key,...(route.kind==='surface'?{selector:route.selector}:{})};
}
const navigationKey=route=>route.kind+':'+route.key+(route.kind==='surface'?':'+createHash('sha256').update(route.selector).digest('hex'):'');
const restrictedStateReason=(id,controls)=>controls.protectedStates.includes(id)?'protected-state':controls.externalStates?.includes(id)?'external-content':null;
const shellKey=(id,controls)=>'native-settings-shell-v1:'+navigationKey(navigationRoute(id,controls));
export function shellObservationMatches(row,report,controls){
 return controls.protectedShellStates?.includes(row.id)&&controls.protectedStates.includes(row.id)&&!controls.externalStates?.includes(row.id)&&row.status==='observed'&&row.scope==='shell-only'&&row.evidence==='native-shell-structure'&&row.shellKey===shellKey(row.id,controls)&&report.samples?.[row.sample]?.scope==='shell-only';
}
// Deliberately separate from captureRegions: never walk a protected page's subtree.
export function captureSettingsShell(){
 const visible=n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!n.closest('[inert],[aria-hidden="true"]');};
 const main=[...document.querySelectorAll('[data-app-shell-main-surface]')].filter(visible);
 const settings=[...document.querySelectorAll('[data-app-shell-main-surface] [class~="group/settings"]')].filter(visible);
 if(main.length!==1||settings.length!==1)throw new Error('Protected settings shell was not structurally observed');
 const regionCoverage=[['chat',main[0]],['settings',settings[0]]].map(([key,n])=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {key,matched:1,visible:1,status:'observed',selectorErrors:[],samples:[{visible:true,rect:[r.x,r.y,r.width,r.height].map(Math.round),background:s.backgroundColor,foreground:s.color,hasBackgroundImage:s.backgroundImage!=='none',border:s.borderWidth,position:s.position}]};});
 return {scope:'shell-only',viewport:[innerWidth,innerHeight],pixelRatio:devicePixelRatio,canvas:{window:[innerWidth,innerHeight]},regionCoverage,candidates:[],shadowRoots:0,truncated:false,limitations:['Only the native main and settings outer containers were inspected.','No descendants, entries, text, values, identifiers, URLs or screenshots were collected.','Protected page contents and controls were not visually accepted.']};
}
export function navigationObservationMatches(row,route){
 return row?.status==='observed'&&(row.navigationKey??navigationKey(navigationRoute(row.id)))===navigationKey(route);
}
export function refreshNavigationEvidence(report,controls){
 for(const row of report?.coverage?.states??[]){
  const restriction=restrictedStateReason(row.id,controls);
  const navigation=/^(page|settings)-/.test(row.id);
  if(row.status==='observed'&&(restriction&&!shellObservationMatches(row,report,controls)||navigation&&!navigationObservationMatches(row,navigationRoute(row.id,controls)))){
   row.status='not-observed';row.reason=restriction??'navigation-mapping-changed';
   if(row.navigationKey)row.previousNavigationKey=row.navigationKey;
   delete row.sample;delete row.evidence;
  }
  if(row.status!=='observed'&&!restriction&&navigation&&navigationRoute(row.id,controls).kind==='surface')row.reason='manual-native-surface';
 }
 return report;
}
export async function authoringControls(version){
 const value=await readProfileData('authoring-controls',version,ROOT);
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid authoring controls configuration');
 if(value.semanticGraphics!==undefined&&(!Array.isArray(value.semanticGraphics)||value.semanticGraphics.length>16||value.semanticGraphics.some(selector=>typeof selector!=='string'||!selector.trim()||selector.length>512)))throw new Error('Invalid authoring controls configuration');
 if(!value||value.version!==version||!Array.isArray(value.sidebarToggleLabels)||!Array.isArray(value.protectedStates)||value.externalStates!==undefined&&!Array.isArray(value.externalStates)||value.protectedShellStates!==undefined&&(!Array.isArray(value.protectedShellStates)||value.protectedShellStates.some(id=>!value.protectedStates.includes(id)||value.externalStates?.includes(id)||navigationRoute(id,value).kind!=='settings')))throw new Error('Invalid authoring controls configuration');
 return value;
}
export async function authoringConfiguration(version){
 const [adapter,plan,controls]=await Promise.all([readAdapter(version,ROOT),readProfileData('authoring',version,ROOT),authoringControls(version)]);
 if(plan?.version!==version||!Array.isArray(plan.destinations)||!Array.isArray(plan.settings)||!Array.isArray(plan.manualStates))throw new Error('Authoring plan/client version mismatch');
 if (plan.profileVersion!==adapter.profileVersion || controls.profileVersion!==adapter.profileVersion) throw new Error('Inconsistent authoring profile selection');
 return {adapter,plan,controls};
}
export async function refreshAdapterMapping({statePath,targetId,previous,previousAdapter,onProgress=async()=>{}},{connect=managedPage,configuration=authoringConfiguration}={}){
 if(previous?.schemaVersion!==1||previous.kind!=='codex-ui-inventory'||!previous.measurement?.maximized||previous.coverage?.restored!==true||!previousAdapter?.regions)throw new Error('Profile refresh requires a complete restored inventory and its previous adapter');
 const client=await connect(statePath,targetId);
 try{
  const {adapter,plan,controls}=await configuration(client.clientVersion);
  if(previous.clientVersion!==client.clientVersion||previous.adapterVersion!==client.clientVersion||previousAdapter.version!==client.clientVersion||previous.binding!==bindingFor(client,previousAdapter,plan))throw new Error('Profile refresh requires the same verified client, window and plan');
  // Adding scoped pseudo-element paint removal does not alter measured geometry
  // or observed native structure. Appearance acceptance is still invalidated by
  // the new binding; removals and every other non-selector change stay blocked.
  const changedPaintRegions=[...new Set([...Object.keys(previousAdapter.transparentPseudoTargets??{}),...Object.keys(adapter.transparentPseudoTargets??{})])].filter(key=>JSON.stringify(previousAdapter.transparentPseudoTargets?.[key])!==JSON.stringify(adapter.transparentPseudoTargets?.[key]));
  for(const key of changedPaintRegions){const old=previousAdapter.transparentPseudoTargets?.[key]??[],next=adapter.transparentPseudoTargets?.[key];if(!Array.isArray(next)||old.some(s=>!next.includes(s))||next.some(s=>typeof s!=='string'||!/^.+::(?:before|after)$/.test(s)))throw new Error('Profile refresh only adds scoped pseudo paint targets');}
  const withoutRegions=value=>{const copy=structuredClone(value);delete copy.regions;delete copy.verification;delete copy.transparentPseudoTargets;return JSON.stringify(copy);};
  if(withoutRegions(previousAdapter)!==withoutRegions(adapter))throw new Error('Profile refresh cannot change layout or non-selector configuration');
  const changedRegions=[...new Set([...Object.keys(previousAdapter.regions),...Object.keys(adapter.regions)])].filter(key=>JSON.stringify(previousAdapter.regions[key])!==JSON.stringify(adapter.regions[key]));
  const controlsOnly=new Set(['userMessages','assistantMessages','toolCards','changeSummary','attachments','codeBlocks','tables','menus','dialogs','settings','pageCards','questions','profileActivity','buttons','inputs','tooltips','scrollbars']);
  if(changedRegions.some(key=>!controlsOnly.has(key)))throw new Error('Profile refresh cannot change scene geometry');
  const current=await client.page.evaluate('('+viewportSnapshot.toString()+')()');
  if(![previous.measurement.windowed,previous.measurement].filter(Boolean).some(p=>sameViewport(current,{viewport:p.canvas.window,pixelRatio:p.pixelRatio})))throw new Error('Profile refresh requires an already measured viewport');
  const report=structuredClone(previous),changed=new Set(changedRegions),invalidatedStates=[];
  for(const sample of report.samples??[])sample.regionCoverage=sample.regionCoverage.filter(row=>!changed.has(row.key));
  for(const row of report.coverage.states)if(row.regions.some(key=>changed.has(key))){row.status='not-observed';row.reason='adapter-selectors-changed';delete row.sample;delete row.evidence;delete row.reused;invalidatedStates.push(row.id);}
  const oldBinding=report.binding;report.binding=bindingFor(client,adapter,plan);report.adapterVersion=adapter.version;
  report.adapterRefreshes=[...(report.adapterRefreshes??[]),{previousBinding:oldBinding,binding:report.binding,changedRegions,changedPaintRegions,invalidatedStates,at:new Date().toISOString()}];
  refreshNavigationEvidence(report,controls);await onProgress(report);
  return {report,catalog:makeCatalog(report),changedRegions,changedPaintRegions,invalidatedStates};
 }finally{client.close();}
}
export function selectedSettingsPage(){
 const nodes=[...document.querySelectorAll('[data-settings-panel-slug]')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden'&&!n.closest('[inert],[aria-hidden="true"]')&&(n.getAttribute('aria-current')==='page'||n.getAttribute('aria-selected')==='true');});
 return nodes.length===1?nodes[0].getAttribute('data-settings-panel-slug'):null;
}
// Public navigation slugs, geometry and counts only. Never enumerate account or editor contents.
export function settingsPanelObservation(){
 const visible=n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&!n.closest('[hidden],[inert],[aria-hidden="true"]')&&getComputedStyle(n).visibility!=='hidden';};
 const tabs=[...document.querySelectorAll('[data-settings-panel-slug]')].filter(visible);
 const slugs=[...new Set(tabs.map(n=>n.getAttribute('data-settings-panel-slug')).filter(k=>/^[a-z][a-z0-9-]{0,64}$/.test(k)))];
 const active=tabs.filter(n=>n.getAttribute('aria-current')==='page'||n.getAttribute('aria-selected')==='true');
 if(active.length!==1||active[0].getAttribute('data-settings-panel-slug')==='passwords')return {slugs,layout:null};
 const selected=active[0],scope=selected.closest('.settings-dialog')??document;
 const panel=[...scope.querySelectorAll('[data-settings-panel]')].find(visible);
 if(!panel||panel.matches('[aria-busy="true"]')||panel.querySelector('[aria-busy="true"]'))return {slugs,layout:null};
 const content=panel.querySelector('[class~="group/settings"]')??panel;
 const r=content.getBoundingClientRect(),controls=content.querySelectorAll('button,input,textarea,select,summary,[role="switch"]').length;
 return {slugs,layout:[Math.round(r.width),Math.round(r.height),controls].join(':')};
}
export async function captureSettings({statePath,targetId,previous,onProgress=async()=>{}},{connect=managedPage,capture=inventory}={}){
 if(!previous?.measurement?.maximized||!previous.coverage?.states?.length)throw new Error('Complete measured inventory before batch settings capture');
 const client=await connect(statePath,targetId),{page}=client;
 let configuration;try{
  configuration=await authoringConfiguration(client.clientVersion);
  if(previous.clientVersion!==client.clientVersion)throw new Error('Re-inventory after a version change');
  if(previous.binding!==bindingFor(client,configuration.adapter,configuration.plan))throw new Error('Batch capture requires the same verified inventory window');
 }catch(error){client.close();throw error;}
 const {adapter,plan,controls}=configuration;
 let report=refreshNavigationEvidence(structuredClone(previous),controls),original,moved=false;
 const remember=async value=>{report=value;await onProgress(report);};
 const observation=()=>page.evaluate('('+settingsPanelObservation.toString()+')()');
 const reached=async key=>{
  let previousLayout=null,stable=0;
  for(let i=0;i<(controls.inspectSettingsNavigation?20:8);i++){
   await settle();
   if(!await page.evaluate('('+navigationReached.toString()+')("settings",'+JSON.stringify(key)+')')){stable=0;previousLayout=null;continue;}
   if(!controls.inspectSettingsNavigation)return true;
   const {layout}=await observation();
   stable=layout&&layout===previousLayout?stable+1:0;previousLayout=layout;
   if(stable>=2)return true;
  }
  return false;
 };
 try{
  if(await page.evaluate('!!document.activeElement?.matches(\'input,textarea,[contenteditable="true"]\')'))throw new Error('Inventory paused: leave the editable field without changing its content');
  original=await page.evaluate('('+selectedSettingsPage.toString()+')()');
  if(!original||!/^[a-z][a-z0-9-]*$/.test(original))throw new Error('Open an ordinary settings page before batch capture');
  if([...controls.protectedStates,...(controls.externalStates??[])].some(id=>navigationRoute(id,controls).key===original))throw new Error('Open an ordinary settings page before batch capture');
  report.coverage.settingsInterrupted=false;
  const ids=report.coverage.states.filter(row=>/^(page|settings)-/.test(row.id)&&navigationRoute(row.id,controls).kind==='settings').map(row=>row.id);
  if(controls.inspectSettingsNavigation){
   const {slugs}=await observation(),mapped=new Set(ids.map(id=>navigationRoute(id,controls).key));
   report.coverage.settingsEntries={available:slugs,unmapped:slugs.filter(slug=>!mapped.has(slug))};
   await remember(report);
  }
  for(const id of ids){
   const row=report.coverage.states.find(item=>item.id===id);
   const restriction=restrictedStateReason(row.id,controls);
   if(restriction){if(shellObservationMatches(row,report,controls))continue;row.status='not-observed';row.reason=restriction;delete row.sample;delete row.evidence;await remember(report);continue;}
   const route=navigationRoute(row.id,controls);
   if(navigationObservationMatches(row,route)){row.reason=null;continue;}
   row.navigationKey=navigationKey(route);
   const action=await page.evaluate('('+navigateKnown.toString()+')("settings",'+JSON.stringify(route.key)+')');
   if(!action.requested){row.status='not-observed';row.reason=action.reason;await remember(report);continue;}
   moved=true;
   if(!await reached(route.key)){
    row.status='not-observed';row.reason='navigation-postcondition-missing';
    const present=await page.evaluate('('+selectedSettingsPage.toString()+')()');
    if(!present){row.reason='settings-surface-lost';report.coverage.settingsInterrupted=true;await remember(report);break;}
    await remember(report);continue;
   }
   const data=await capture({statePath,targetId:client.targetId,previous:report,manualState:row.id,onProgress:remember});
   report=data.report;
  }
  return {report,catalog:makeCatalog(report)};
 }finally{
  let restored=true;
  try{if(moved){const action=await page.evaluate('('+navigateKnown.toString()+')("settings",'+JSON.stringify(original)+')');restored=!!action.requested&&await reached(original);}}catch{restored=false;}
  report.coverage.settingsRestored=restored;
  if(!restored){report.coverage.restored=false;report.coverage.restoreError='Settings navigation restoration was not observed';}
  try{await onProgress(report);}finally{client.close();}
 }
}
export async function inventory({statePath,targetId,previous=null,onProgress=async()=>{},manualState=null,shellOnly=false,authorizationNote=null},{connect=managedPage,windows=windowController,stabilize=stableViewport}={}){
 const client=await connect(statePath,targetId),{page}=client;
 let configuration;try{configuration=await authoringConfiguration(client.clientVersion);}catch(error){client.close();throw error;}
 const {adapter,plan,controls}=configuration;
 let windowControl,navigationSaved=false,navigationMoved=false;
 const binding=bindingFor(client,adapter,plan);
 let report={schemaVersion:1,kind:'codex-ui-inventory',createdAt:new Date().toISOString(),clientVersion:client.clientVersion,adapterVersion:adapter.version,profileVersion:adapter.profileVersion??adapter.version,unconfirmedRegions:adapter.unconfirmedRegions??[],coverageLabels:[],samples:[],binding,coverage:{states:[],restored:null},targetLimitReached:false};
 const capture=async(label)=>{const sample=await page.evaluate('('+captureRegions.toString()+')('+JSON.stringify(adapter)+')');sample.label=label;report.samples.push(sample);report.coverageLabels.push(label);return sample;};
 try{
  if(client.clientVersion!==plan.version||controls.version!==plan.version)throw new Error('Unsupported client version: inventory/adaptation is required before automated navigation');
  if(shellOnly&&(!manualState||!controls.protectedShellStates?.includes(manualState)||typeof authorizationNote!=='string'||!authorizationNote.trim()||authorizationNote.length>2000))throw new Error('Shell capture requires a configured state and actual user authorization note');
  if(manualState){
   if(!previous||previous.binding!==binding)throw new Error('Manual capture requires the same inventory session');
   report=structuredClone(previous);const row=report.coverage.states.find(s=>s.id===manualState);if(!row)throw new Error('Unknown coverage state');
   const restriction=restrictedStateReason(manualState,controls);
   if(shellOnly){
    if(restriction!=='protected-state')throw new Error('Shell capture requires a configured state and actual user authorization note');
    const route=navigationRoute(manualState,controls);
    if(!await page.evaluate('('+navigationReached.toString()+')('+JSON.stringify(route.kind)+','+JSON.stringify(route.key)+')'))throw new Error('Requested state was not structurally observed');
    const sample=await page.evaluate('('+captureSettingsShell.toString()+')()');sample.label=manualState;
    report.samples.push(sample);report.coverageLabels.push(manualState);
    Object.assign(row,{status:'observed',reason:null,sample:report.samples.length-1,evidence:'native-shell-structure',scope:'shell-only',navigationKey:navigationKey(route),shellKey:shellKey(manualState,controls),authorizationNote});
    await onProgress(report);return {report,catalog:makeCatalog(report)};
   }
   if(restriction)throw new Error((restriction==='protected-state'?'Protected state is not inspected: ':'External content is not inspected: ')+manualState);
   const sample=await capture(manualState);
   const hits=sample.regionCoverage.filter(r=>row.regions.includes(r.key)&&r.visible>0&&!r.selectorErrors.length);
   let evidence=manualState==='existing-chat'?hits.some(r=>r.key==='userMessages'||r.key==='assistantMessages'):manualState==='dot'?await page.evaluate("!!document.querySelector('.messaging-embedded .conversation-viewport')"):manualState==='sidebar-hover'?await page.evaluate("!!document.querySelector('[data-slate-sidebar-peeking=\"true\"]')"):hits.some(r=>r.key===({menus:'menus',dialogs:'dialogs',questions:'questions',drawer:'rightPanel'}[manualState]));
   if(manualState.startsWith('page-')||manualState.startsWith('settings-')){const route=navigationRoute(manualState,controls);evidence=await page.evaluate('('+navigationReached.toString()+')('+JSON.stringify(route.kind)+','+JSON.stringify(route.key)+','+JSON.stringify(route.selector??null)+')');if(evidence)row.navigationKey=navigationKey(route);}
   if(['sidebar-expanded','sidebar-collapsed'].includes(manualState))evidence=await page.evaluate('document.querySelector("[data-app-shell-frame]")?.getAttribute("data-app-shell-sidebar-open")==='+JSON.stringify(String(manualState==='sidebar-expanded')));
   if(!evidence||sample.truncated)throw new Error('Requested state was not structurally observed');
   Object.assign(row,{status:'observed',reason:null,sample:report.samples.length-1,evidence:'native-structure'});await onProgress(report);return {report,catalog:makeCatalog(report)};
  }
  windowControl=await windows(client,statePath);
  report.windowBackend=windowControl.backend;
  const saved=await page.evaluate('('+saveNavigation.toString()+')()');navigationSaved=saved.ready;
  if(!saved.ready)throw new Error('Inventory paused: leave the editable field without changing its content');
  await capture('initial');
   await windowControl.normal();const normalViewport=await stabilize(page);
   const normal=await capture('windowed');if(!sameViewport(normal,normalViewport))throw new Error('Viewport changed during inventory capture');
   await windowControl.maximize();const maxViewport=await stabilize(page);
   const max=await capture('maximized');if(!sameViewport(max,maxViewport))throw new Error('Viewport changed during inventory capture');report.measurement={maximized:true,pixelRatio:max.pixelRatio,canvas:max.canvas,windowed:{pixelRatio:normal.pixelRatio,canvas:normal.canvas}};
  const resumable=previous?.binding===binding&&JSON.stringify(previous.measurement)===JSON.stringify(report.measurement);
  if(resumable){report.samples.push(...previous.samples);report.coverageLabels.push(...previous.coverageLabels);}
  const steps=[...plan.destinations.map(key=>({id:'page-'+key,kind:'destination',key,regions:['chat','navigation','sidebar','pageHeaders','pageCards','composer']})),...plan.settings.map(key=>({id:'settings-'+key,kind:'settings',key,regions:['chat','settings','inputs','pageHeaders','buttons']}))];
  for(const step of steps){
   const route=navigationRoute(step.id,controls);
   const restriction=restrictedStateReason(step.id,controls);
   const old=resumable&&!restriction&&previous.coverage.states.find(s=>s.id===step.id&&navigationObservationMatches(s,route));
   if(old){report.coverage.states.push({...old,sample:old.sample+3,reused:true});continue;}
   const row={id:step.id,regions:step.regions,status:'not-observed',reason:'unvisited',navigationKey:navigationKey(route)};report.coverage.states.push(row);
   if(restriction){row.reason=restriction;await onProgress(report);continue;}
   if(!saved.restorable){row.reason='original-navigation-not-restorable';await onProgress(report);continue;}
   const action=await page.evaluate('('+navigateKnown.toString()+')('+JSON.stringify(route.kind)+','+JSON.stringify(route.key)+')');
   if(action.requested){navigationMoved=true;let reached=false;for(let attempt=0;attempt<8;attempt++){await settle();if(await page.evaluate('('+navigationReached.toString()+')('+JSON.stringify(route.kind)+','+JSON.stringify(route.key)+')')){reached=true;break;}}
    if(reached){const sample=await capture(step.id);row.sample=report.samples.length-1;row.status=sample.truncated?'blocked':'observed';row.reason=sample.truncated?'truncated':null;row.evidence='native-navigation-state';}else row.reason='navigation-postcondition-missing';
   }else row.reason=action.reason;
   await onProgress(report);
  }
  for(const desired of [true,false]){
   const row={id:desired?'sidebar-expanded':'sidebar-collapsed',regions:['chat','sidebar','navigation'],status:'not-observed'};report.coverage.states.push(row);
   const result=await page.evaluate('('+sidebarState.toString()+')('+desired+','+JSON.stringify(controls.sidebarToggleLabels)+')');
   if(result.requested){let reached=false;for(let attempt=0;attempt<8;attempt++){await settle();if(await page.evaluate('document.querySelector("[data-app-shell-frame]")?.getAttribute("data-app-shell-sidebar-open")==='+JSON.stringify(String(desired)))){reached=true;break;}}
    if(reached){const sample=await capture(row.id);Object.assign(row,{status:sample.truncated?'blocked':'observed',sample:report.samples.length-1,evidence:'native-sidebar-state'});if(desired&&sample.canvas.sidebarHeaderHeight)report.measurement.canvas.sidebarHeaderHeight=sample.canvas.sidebarHeaderHeight;}else row.reason='sidebar-postcondition-missing';
   }else row.reason=result.reason;
   await onProgress(report);
  }
   for(const step of plan.manualStates){const old=resumable&&previous.coverage.states.find(s=>s.id===step.id&&s.status==='observed');report.coverage.states.push(old?{...old,sample:old.sample+3,reused:true}:{...step,status:'not-observed'});}
   if(!sameViewport(max,await page.evaluate('('+viewportSnapshot.toString()+')()'))){report.measurement.maximized=false;report.measurement.reason='viewport-changed';throw new Error('Viewport changed during inventory capture');}
  return {report,catalog:makeCatalog(report)};
 }finally{
   if(!manualState&&!shellOnly){
   let restored=true;
   try{if(navigationSaved){const original=await page.evaluate('window.__codexCreatorNavigation?.leftOpen');if(['true','false'].includes(original)){const result=await page.evaluate('('+sidebarState.toString()+')('+(original==='true')+','+JSON.stringify(controls.sidebarToggleLabels)+')');if(!result.requested)restored=false;await settle();if(await page.evaluate('document.querySelector("[data-app-shell-frame]")?.getAttribute("data-app-shell-sidebar-open")')!==original)restored=false;}restored=!!await page.evaluate('('+restoreNavigation.toString()+')('+navigationMoved+')')&&restored;}}catch{restored=false;}
   try{if(windowControl)await windowControl.restore();}catch(error){restored=false;report.coverage.restoreError=error.message;}
    report.coverage.restored=restored;try{await onProgress(report);}catch(e){client.close();throw e;}
  }
  client.close();
 }
}
