import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {managedPage} from './managed-page.mjs';
import {windowController} from './window-control.mjs';
import {captureRegions,makeCatalog} from './inspect-ui-regions.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const settle=()=>new Promise(resolve=>setTimeout(resolve,250));

// Only known navigation attributes and structural state are read. No text/value/URL scraping.
export function navigateKnown(kind,key){
 const visible=n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden';};
 const query=kind==='settings'?`[data-settings-panel-slug="${key}"]`:`[data-sidebar-destination="builtin:${key}"]`;
 const nodes=[...document.querySelectorAll(query)].filter(visible);
 if(nodes.length!==1)return {requested:false,reason:'missing-or-ambiguous-entry'};
 const n=nodes[0];if(n.matches(':disabled,[aria-disabled="true"]'))return {requested:false,reason:'disabled-entry'};
 n.click();return {requested:true};
}
export function navigationReached(kind,key){
 const query=kind==='settings'?`[data-settings-panel-slug="${key}"]`:`[data-sidebar-destination="builtin:${key}"]`;
 return [...document.querySelectorAll(query)].some(n=>n.getAttribute('aria-current')==='page'||n.getAttribute('aria-selected')==='true'||['active','selected','checked'].includes(n.getAttribute('data-state'))||n.getAttribute('data-selected')==='true');
}
export function saveNavigation(){
 const active=document.activeElement;
 if(active?.matches('input,textarea,[contenteditable="true"]'))return {ready:false,reason:'editable-focused'};
 const selected=[...document.querySelectorAll('[data-sidebar-destination],[data-settings-panel-slug]')].filter(n=>n.getAttribute('aria-current')==='page'||n.getAttribute('aria-selected')==='true'||['active','selected','checked'].includes(n.getAttribute('data-state'))||n.getAttribute('data-selected')==='true');
 const frame=document.querySelector('[data-app-shell-frame]');
 window.__codexCreatorNavigation={selected,active,leftOpen:frame?.getAttribute('data-app-shell-sidebar-open')};return {ready:true,restorable:selected.length>0};
}
export function sidebarState(desired){
 const frame=document.querySelector('[data-app-shell-frame]'),value=frame?.getAttribute('data-app-shell-sidebar-open');
 if(!['true','false'].includes(value))return {requested:false,reason:'sidebar-state-unknown'};
 if(value===String(desired))return {requested:true,already:true};
 const labels=['Toggle sidebar','Open sidebar','Close sidebar','切换侧栏','打开侧栏','关闭侧栏'];
 const controls=[...document.querySelectorAll('button[aria-label]')].filter(n=>labels.includes(n.getAttribute('aria-label'))&&n.getBoundingClientRect().width>0&&!n.disabled);
 if(controls.length!==1)return {requested:false,reason:'sidebar-toggle-unmapped'};controls[0].click();return {requested:true};
}
export async function restoreNavigation(required=false){
 const state=window.__codexCreatorNavigation;delete window.__codexCreatorNavigation;
 if(!state)return false;let restored=state.selected.length>0||!required;
 for(const n of state.selected){if(n.isConnected)n.click();else restored=false;}
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 if(required)for(const n of state.selected)if(!n.isConnected||!(n.getAttribute('aria-current')==='page'||n.getAttribute('aria-selected')==='true'||['active','selected','checked'].includes(n.getAttribute('data-state'))||n.getAttribute('data-selected')==='true'))restored=false;
 if(state.active?.isConnected)state.active.focus({preventScroll:true});return restored;
}
export function coverageBlockers(report,regions,excluded=[]){
 const rows=report.coverage?.states??[];
 if(!rows.length)return ['coverage-plan-missing'];
 const allowed=new Set(excluded);
 return rows.filter(s=>s.status!=='observed'&&!allowed.has(s.id)&&s.regions.some(r=>regions.includes(r))).map(s=>s.id);
}
export async function inventory({statePath,targetId,previous=null,onProgress=async()=>{},manualState=null},{connect=managedPage,windows=windowController}={}){
 const adapter=JSON.parse(await readFile(path.join(ROOT,'adapters/codex-26.1103.json'),'utf8'));
 const plan=JSON.parse(await readFile(path.join(ROOT,'adapters/authoring-26.1103.json'),'utf8'));
 const client=await connect(statePath,targetId),{page}=client;
 let windowControl,navigationSaved=false,navigationMoved=false;
 const binding=createHash('sha256').update(JSON.stringify([client.clientVersion,adapter,plan,client.targetId])).digest('hex');
 let report={schemaVersion:1,kind:'codex-ui-inventory',createdAt:new Date().toISOString(),clientVersion:client.clientVersion,adapterVersion:adapter.version,unconfirmedRegions:adapter.unconfirmedRegions??[],coverageLabels:[],samples:[],binding,coverage:{states:[],restored:null},targetLimitReached:false};
 const capture=async(label)=>{const sample=await page.evaluate('('+captureRegions.toString()+')('+JSON.stringify(adapter)+')');sample.label=label;report.samples.push(sample);report.coverageLabels.push(label);return sample;};
 try{
  if(client.clientVersion!==plan.version)throw new Error('Unsupported client version: inventory/adaptation is required before automated navigation');
  if(manualState){
   if(!previous||previous.binding!==binding)throw new Error('Manual capture requires the same inventory session');
   report=structuredClone(previous);const row=report.coverage.states.find(s=>s.id===manualState);if(!row)throw new Error('Unknown coverage state');
   const sample=await capture(manualState);
   const hits=sample.regionCoverage.filter(r=>row.regions.includes(r.key)&&r.visible>0&&!r.selectorErrors.length);
   let evidence=manualState==='existing-chat'?hits.some(r=>r.key==='userMessages'||r.key==='assistantMessages'):manualState==='dot'?await page.evaluate("!!document.querySelector('.messaging-embedded .conversation-viewport')"):manualState==='sidebar-hover'?await page.evaluate("!!document.querySelector('[data-slate-sidebar-peeking=\"true\"]')"):hits.some(r=>r.key===({menus:'menus',dialogs:'dialogs',questions:'questions',drawer:'rightPanel'}[manualState]));
   if(manualState.startsWith('page-')||manualState.startsWith('settings-')){const kind=manualState.startsWith('page-')?'destination':'settings',key=manualState.slice(manualState.indexOf('-')+1);evidence=await page.evaluate('('+navigationReached.toString()+')('+JSON.stringify(kind)+','+JSON.stringify(key)+')');}
   if(['sidebar-expanded','sidebar-collapsed'].includes(manualState))evidence=await page.evaluate('document.querySelector("[data-app-shell-frame]")?.getAttribute("data-app-shell-sidebar-open")==='+JSON.stringify(String(manualState==='sidebar-expanded')));
   if(!evidence||sample.truncated)throw new Error('Requested state was not structurally observed');
   Object.assign(row,{status:'observed',sample:report.samples.length-1,evidence:'native-structure'});await onProgress(report);return {report,catalog:makeCatalog(report)};
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
   const old=resumable&&previous.coverage.states.find(s=>s.id===step.id&&s.status==='observed');
   if(old){report.coverage.states.push({...old,sample:old.sample+3,reused:true});continue;}
   const row={id:step.id,regions:step.regions,status:'not-observed',reason:'unvisited'};report.coverage.states.push(row);
   if(!saved.restorable){row.reason='original-navigation-not-restorable';await onProgress(report);continue;}
   const action=await page.evaluate('('+navigateKnown.toString()+')('+JSON.stringify(step.kind)+','+JSON.stringify(step.key)+')');
   if(action.requested){navigationMoved=true;let reached=false;for(let attempt=0;attempt<8;attempt++){await settle();if(await page.evaluate('('+navigationReached.toString()+')('+JSON.stringify(step.kind)+','+JSON.stringify(step.key)+')')){reached=true;break;}}
    if(reached){const sample=await capture(step.id);row.sample=report.samples.length-1;row.status=sample.truncated?'blocked':'observed';row.reason=sample.truncated?'truncated':null;row.evidence='native-navigation-state';}else row.reason='navigation-postcondition-missing';
   }else row.reason=action.reason;
   await onProgress(report);
  }
  for(const desired of [true,false]){
   const row={id:desired?'sidebar-expanded':'sidebar-collapsed',regions:['chat','sidebar','navigation'],status:'not-observed'};report.coverage.states.push(row);
   const result=await page.evaluate('('+sidebarState.toString()+')('+desired+')');
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
    try{if(navigationSaved){const original=await page.evaluate('window.__codexCreatorNavigation?.leftOpen');if(['true','false'].includes(original)){const result=await page.evaluate('('+sidebarState.toString()+')('+(original==='true')+')');if(!result.requested)restored=false;await settle();if(await page.evaluate('document.querySelector("[data-app-shell-frame]")?.getAttribute("data-app-shell-sidebar-open")')!==original)restored=false;}restored=!!await page.evaluate('('+restoreNavigation.toString()+')('+navigationMoved+')')&&restored;}}catch{restored=false;}
   try{if(windowControl)await windowControl.restore();}catch(error){restored=false;report.coverage.restoreError=error.message;}
    report.coverage.restored=restored;try{await onProgress(report);}catch(e){client.close();throw e;}
  }
  client.close();
 }
}
