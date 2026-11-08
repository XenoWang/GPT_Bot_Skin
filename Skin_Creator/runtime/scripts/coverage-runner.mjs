import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {managedPage} from './managed-page.mjs';
import {windowController} from './window-control.mjs';
import {captureRegions,makeCatalog} from './inspect-ui-regions.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const settle=()=>new Promise(resolve=>setTimeout(resolve,250));
const bindingFor=(client,adapter,plan)=>createHash('sha256').update(JSON.stringify([client.clientVersion,adapter,plan,client.targetId])).digest('hex');

// Only known navigation attributes and structural state are read. No text/value/URL scraping.
export function navigateKnown(kind,key){
 const visible=n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden'&&!n.closest('[inert],[aria-hidden="true"]');};
 const query=kind==='settings'?`[data-settings-panel-slug="${key}"]`:`[data-sidebar-destination="builtin:${key}"]`;
 const nodes=[...document.querySelectorAll(query)].filter(visible);
 if(nodes.length!==1)return {requested:false,reason:'missing-or-ambiguous-entry'};
 const n=nodes[0];if(n.matches(':disabled,[aria-disabled="true"]'))return {requested:false,reason:'disabled-entry'};
 n.click();return {requested:true};
}
export function navigationReached(kind,key){
 const query=kind==='settings'?`[data-settings-panel-slug="${key}"]`:`[data-sidebar-destination="builtin:${key}"]`;
 return [...document.querySelectorAll(query)].some(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden'&&!n.closest('[inert],[aria-hidden="true"]')&&(n.getAttribute('aria-current')==='page'||n.getAttribute('aria-selected')==='true'||['active','selected','checked'].includes(n.getAttribute('data-state'))||n.getAttribute('data-selected')==='true');});
}
export function saveNavigation(){
 const active=document.activeElement;
 if(active?.matches('input,textarea,[contenteditable="true"]'))return {ready:false,reason:'editable-focused'};
 const selected=[...document.querySelectorAll('[data-sidebar-destination],[data-settings-panel-slug]')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden'&&!n.closest('[inert],[aria-hidden="true"]')&&(n.getAttribute('aria-current')==='page'||n.getAttribute('aria-selected')==='true'||['active','selected','checked'].includes(n.getAttribute('data-state'))||n.getAttribute('data-selected')==='true');});
 const frame=document.querySelector('[data-app-shell-frame]');
 window.__codexCreatorNavigation={selected,active,leftOpen:frame?.getAttribute('data-app-shell-sidebar-open')};return {ready:true,restorable:selected.length>0};
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
 if(!state)return false;let restored=state.selected.length>0||!required;
 for(const n of state.selected){if(available(n))n.click();else restored=false;}
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 if(required)for(const n of state.selected)if(!available(n)||!(n.getAttribute('aria-current')==='page'||n.getAttribute('aria-selected')==='true'||['active','selected','checked'].includes(n.getAttribute('data-state'))||n.getAttribute('data-selected')==='true'))restored=false;
 if(state.active?.isConnected)state.active.focus({preventScroll:true});return restored;
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
 if(!route||!['destination','settings'].includes(route.kind)||typeof route.key!=='string'||!/^[a-z][a-z0-9-]*$/.test(route.key))throw new Error('Invalid navigation mapping');
 return {kind:route.kind,key:route.key};
}
const navigationKey=route=>route.kind+':'+route.key;
const restrictedStateReason=(id,controls)=>controls.protectedStates.includes(id)?'protected-state':controls.externalStates?.includes(id)?'external-content':null;
export function navigationObservationMatches(row,route){
 return row?.status==='observed'&&(row.navigationKey??navigationKey(navigationRoute(row.id)))===navigationKey(route);
}
export function refreshNavigationEvidence(report,controls){
 for(const row of report?.coverage?.states??[]){
  const restriction=restrictedStateReason(row.id,controls);
  const navigation=/^(page|settings)-/.test(row.id);
  if(row.status==='observed'&&(restriction||navigation&&!navigationObservationMatches(row,navigationRoute(row.id,controls)))){
   row.status='not-observed';row.reason=restriction??'navigation-mapping-changed';
   if(row.navigationKey)row.previousNavigationKey=row.navigationKey;
   delete row.sample;delete row.evidence;
  }
 }
 return report;
}
export async function authoringControls(){
 const value=JSON.parse(await readFile(path.join(ROOT,'adapters/authoring-controls-26.1103.json'),'utf8'));
 if(!value||typeof value.version!=='string'||!Array.isArray(value.sidebarToggleLabels)||!Array.isArray(value.protectedStates)||value.externalStates!==undefined&&!Array.isArray(value.externalStates))throw new Error('Invalid authoring controls configuration');
 return value;
}
export function selectedSettingsPage(){
 const nodes=[...document.querySelectorAll('[data-settings-panel-slug]')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden'&&!n.closest('[inert],[aria-hidden="true"]')&&(n.getAttribute('aria-current')==='page'||n.getAttribute('aria-selected')==='true');});
 return nodes.length===1?nodes[0].getAttribute('data-settings-panel-slug'):null;
}
export async function captureSettings({statePath,targetId,previous,onProgress=async()=>{}},{connect=managedPage,capture=inventory}={}){
 if(!previous?.measurement?.maximized||!previous.coverage?.states?.length)throw new Error('Complete measured inventory before batch settings capture');
 const controls=await authoringControls();
 const [adapter,plan]=await Promise.all(['codex-26.1103.json','authoring-26.1103.json'].map(name=>readFile(path.join(ROOT,'adapters',name),'utf8').then(JSON.parse)));
 const client=await connect(statePath,targetId),{page}=client;
 let report=refreshNavigationEvidence(structuredClone(previous),controls),original,moved=false;
 const remember=async value=>{report=value;await onProgress(report);};
 const reached=async key=>{for(let i=0;i<8;i++){await settle();if(await page.evaluate('('+navigationReached.toString()+')("settings",'+JSON.stringify(key)+')'))return true;}return false;};
 try{
  if(client.clientVersion!==controls.version||previous.clientVersion!==client.clientVersion||plan.version!==client.clientVersion)throw new Error('Re-inventory after a version change');
  if(previous.binding!==bindingFor(client,adapter,plan))throw new Error('Batch capture requires the same verified inventory window');
  if(await page.evaluate('!!document.activeElement?.matches(\'input,textarea,[contenteditable="true"]\')'))throw new Error('Inventory paused: leave the editable field without changing its content');
  original=await page.evaluate('('+selectedSettingsPage.toString()+')()');
  if(!original||!/^[a-z][a-z0-9-]*$/.test(original))throw new Error('Open an ordinary settings page before batch capture');
  if([...controls.protectedStates,...(controls.externalStates??[])].some(id=>navigationRoute(id,controls).key===original))throw new Error('Open an ordinary settings page before batch capture');
  report.coverage.settingsInterrupted=false;
  const ids=report.coverage.states.filter(row=>/^(page|settings)-/.test(row.id)&&navigationRoute(row.id,controls).kind==='settings').map(row=>row.id);
  for(const id of ids){
   const row=report.coverage.states.find(item=>item.id===id);
   const restriction=restrictedStateReason(row.id,controls);
   if(restriction){row.status='not-observed';row.reason=restriction;delete row.sample;delete row.evidence;await remember(report);continue;}
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
export async function inventory({statePath,targetId,previous=null,onProgress=async()=>{},manualState=null},{connect=managedPage,windows=windowController}={}){
 const adapter=JSON.parse(await readFile(path.join(ROOT,'adapters/codex-26.1103.json'),'utf8'));
 const plan=JSON.parse(await readFile(path.join(ROOT,'adapters/authoring-26.1103.json'),'utf8'));
 const controls=await authoringControls();
 const client=await connect(statePath,targetId),{page}=client;
 let windowControl,navigationSaved=false,navigationMoved=false;
 const binding=bindingFor(client,adapter,plan);
 let report={schemaVersion:1,kind:'codex-ui-inventory',createdAt:new Date().toISOString(),clientVersion:client.clientVersion,adapterVersion:adapter.version,unconfirmedRegions:adapter.unconfirmedRegions??[],coverageLabels:[],samples:[],binding,coverage:{states:[],restored:null},targetLimitReached:false};
 const capture=async(label)=>{const sample=await page.evaluate('('+captureRegions.toString()+')('+JSON.stringify(adapter)+')');sample.label=label;report.samples.push(sample);report.coverageLabels.push(label);return sample;};
 try{
  if(client.clientVersion!==plan.version||controls.version!==plan.version)throw new Error('Unsupported client version: inventory/adaptation is required before automated navigation');
  if(manualState){
   if(!previous||previous.binding!==binding)throw new Error('Manual capture requires the same inventory session');
   report=structuredClone(previous);const row=report.coverage.states.find(s=>s.id===manualState);if(!row)throw new Error('Unknown coverage state');
   const restriction=restrictedStateReason(manualState,controls);
   if(restriction)throw new Error((restriction==='protected-state'?'Protected state is not inspected: ':'External content is not inspected: ')+manualState);
   const sample=await capture(manualState);
   const hits=sample.regionCoverage.filter(r=>row.regions.includes(r.key)&&r.visible>0&&!r.selectorErrors.length);
   let evidence=manualState==='existing-chat'?hits.some(r=>r.key==='userMessages'||r.key==='assistantMessages'):manualState==='dot'?await page.evaluate("!!document.querySelector('.messaging-embedded .conversation-viewport')"):manualState==='sidebar-hover'?await page.evaluate("!!document.querySelector('[data-slate-sidebar-peeking=\"true\"]')"):hits.some(r=>r.key===({menus:'menus',dialogs:'dialogs',questions:'questions',drawer:'rightPanel'}[manualState]));
   if(manualState.startsWith('page-')||manualState.startsWith('settings-')){const route=navigationRoute(manualState,controls);evidence=await page.evaluate('('+navigationReached.toString()+')('+JSON.stringify(route.kind)+','+JSON.stringify(route.key)+')');if(evidence)row.navigationKey=navigationKey(route);}
   if(['sidebar-expanded','sidebar-collapsed'].includes(manualState))evidence=await page.evaluate('document.querySelector("[data-app-shell-frame]")?.getAttribute("data-app-shell-sidebar-open")==='+JSON.stringify(String(manualState==='sidebar-expanded')));
   if(!evidence||sample.truncated)throw new Error('Requested state was not structurally observed');
   Object.assign(row,{status:'observed',reason:null,sample:report.samples.length-1,evidence:'native-structure'});await onProgress(report);return {report,catalog:makeCatalog(report)};
  }
  windowControl=await windows(client,statePath);
  report.windowBackend=windowControl.backend;
  const saved=await page.evaluate('('+saveNavigation.toString()+')()');navigationSaved=saved.ready;
  if(!saved.ready)throw new Error('Inventory paused: leave the editable field without changing its content');
  await capture('initial');
  await windowControl.normal();await settle();
  const normal=await capture('windowed');
  await windowControl.maximize();await settle();
  const max=await capture('maximized');report.measurement={maximized:true,pixelRatio:max.pixelRatio,canvas:max.canvas,windowed:{pixelRatio:normal.pixelRatio,canvas:normal.canvas}};
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
  return {report,catalog:makeCatalog(report)};
 }finally{
  if(!manualState){
   let restored=true;
   try{if(navigationSaved){const original=await page.evaluate('window.__codexCreatorNavigation?.leftOpen');if(['true','false'].includes(original)){const result=await page.evaluate('('+sidebarState.toString()+')('+(original==='true')+','+JSON.stringify(controls.sidebarToggleLabels)+')');if(!result.requested)restored=false;await settle();if(await page.evaluate('document.querySelector("[data-app-shell-frame]")?.getAttribute("data-app-shell-sidebar-open")')!==original)restored=false;}restored=!!await page.evaluate('('+restoreNavigation.toString()+')('+navigationMoved+')')&&restored;}}catch{restored=false;}
   try{if(windowControl)await windowControl.restore();}catch(error){restored=false;report.coverage.restoreError=error.message;}
    report.coverage.restored=restored;try{await onProgress(report);}catch(e){client.close();throw e;}
  }
  client.close();
 }
}
