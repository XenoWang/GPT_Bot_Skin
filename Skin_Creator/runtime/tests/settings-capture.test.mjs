import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {inventory,captureSettings,captureSettingsShell,authoringControls,navigationRoute,navigationObservationMatches,refreshNavigationEvidence,navigationReached,saveNavigation,restoreNavigation,sidebarState} from '../scripts/coverage-runner.mjs';
import {createSession,summary} from '../../scripts/workflow.mjs';

function settingsDom({detachedProfile=false,unexpectedDeparture=false}={}){
 const ui={open:false,current:'general-settings',clicks:[],failCapture:false,failRestore:false,movedAway:false,sidebar:true,label:'Masquer le panneau'};
 const keys=['general-settings','notifications','plugins-settings','account','passwords',...(detachedProfile?['import','profile']:[])];
 const nodes=keys.map(key=>({key,visible:key!=='account',hidden:false,inert:false,isConnected:true,
  getAttribute(name){if(name==='data-settings-panel-slug')return key;if(name==='aria-current')return key===ui.current||key==='account'?'page':null;return null;},
  getBoundingClientRect(){return {width:this.visible?100:0,height:this.visible?24:0};},
  matches(){return false;},
  closest(){return this.inert?this:null;},
  click(){if(ui.failRestore&&ui.movedAway&&key==='general-settings')throw new Error('synthetic restore failure');ui.clicks.push(key);ui.current=key;if(key!=='general-settings')ui.movedAway=true;if(detachedProfile&&key==='profile'||unexpectedDeparture&&key==='notifications')ui.open=false;},
  get textContent(){throw new Error('Settings content must not be read');},get value(){throw new Error('Settings values must not be read');}
 }));
 const frame={getAttribute:()=>String(ui.sidebar)};
 const surface={visible:false,hidden:false,inert:false,getBoundingClientRect(){return {width:this.visible?700:0,height:this.visible?200:0};},closest(){return this.inert?this:null;},get textContent(){throw new Error('Profile content must not be read');},get value(){throw new Error('Profile value must not be read');}};
 const toggle={inert:false,getAttribute:name=>name==='aria-label'?ui.label:null,getBoundingClientRect:()=>({width:20,height:20}),closest(){return this.inert?this:null;},disabled:false,click(){ui.sidebar=!ui.sidebar;}};
 const document={activeElement:null,querySelector:selector=>selector==='[data-app-shell-frame]'?frame:null,querySelectorAll(selector){
  if(selector==='button[aria-label]')return [toggle];
  if(selector==="[data-app-shell-main-surface] section[class~='group/profile-section']")return [surface];
  if(!ui.open)return [];
  if(['[data-settings-panel-slug]','[data-sidebar-destination],[data-settings-panel-slug]'].includes(selector))return nodes;
  const match=/^\[data-settings-panel-slug="([a-z-]+)"\]$/.exec(selector);
  return match?nodes.filter(n=>n.key===match[1]):[];
 }};
 const context=vm.createContext({document,window:{},getComputedStyle:n=>({visibility:n.hidden?'hidden':'visible',display:'block'}),requestAnimationFrame:fn=>fn(0)});
 const evaluate=async expression=>{const value=await vm.runInContext(expression,context);return value===undefined?null:JSON.parse(JSON.stringify(value));};
 return {ui,nodes,toggle,surface,document,evaluate};
}

async function batchFixture(options={}){
 const dom=settingsDom(options);let size=[1000,700],opened=0,closed=0;const reports=[];dom.ui.fullCaptures=0;dom.ui.shellCaptures=0;
 const page={async evaluate(expression){
  if(expression.includes('function captureRegions')){
   dom.ui.fullCaptures++;
   if(dom.ui.failCapture&&dom.ui.current==='notifications')throw new Error('synthetic capture interruption');
   return {viewport:[...size],pixelRatio:1,canvas:{window:[...size],main:[...size]},regionCoverage:['chat','settings','inputs','buttons'].map(key=>({key,matched:1,visible:key==='chat'||dom.ui.open?1:0,selectorErrors:[],samples:[]})),candidates:[]};
  }
  if(expression.includes('function captureSettingsShell')){dom.ui.shellCaptures++;return {scope:'shell-only',viewport:[1000,700],pixelRatio:1,canvas:{window:[1000,700]},regionCoverage:['chat','settings'].map(key=>({key,matched:1,visible:1,selectorErrors:[],samples:[]})),candidates:[],truncated:false};}
  if(!dom.ui.open){
   if(expression.includes('function saveNavigation'))return {ready:true,restorable:false};
   if(expression.includes('function sidebarState'))return {requested:false,reason:'synthetic-unmapped'};
   if(expression.includes('__codexCreatorNavigation?.leftOpen'))return null;
   if(expression.includes('function restoreNavigation'))return true;
  }
  return dom.evaluate(expression);
 }};
 const connect=async(_state,target='settings-fixture')=>{opened++;return {page,targetId:target,clientVersion:'26.1103.4239.0',close(){closed++;}};};
 const measured=await inventory({statePath:'synthetic'},{connect,windows:async()=>({backend:'synthetic',async normal(){size=[1000,700];},async maximize(){size=[1600,900];},async restore(){size=[1000,700];return true;}})});
 dom.ui.open=true;
 const capture=options=>inventory(options,{connect});
 return {...dom,report:measured.report,reports,get opened(){return opened;},get closed(){return closed;},manual:(manualState,extra={})=>capture({statePath:'synthetic',previous:measured.report,manualState,...extra}),run:(options={})=>captureSettings({statePath:'synthetic',previous:measured.report,onProgress:async r=>reports.push(structuredClone(r)),...options},{connect,capture})};
}

test('version configuration maps independently observed native entry names and rejects selector injection',async()=>{
 const controls=await authoringControls();
 assert.deepEqual(navigationRoute('page-library',controls),{kind:'destination',key:'images'});
 assert.deepEqual(navigationRoute('page-settings',controls),{kind:'settings',key:'general-settings'});
 for(const [state,key]of [['settings-general','general-settings'],['settings-plugins','plugins-settings'],['settings-hooks','hooks-settings'],['settings-git','git-settings']])assert.deepEqual(navigationRoute(state,controls),{kind:'settings',key});
 assert.deepEqual(navigationRoute('page-home',controls),{kind:'destination',key:'home'});
 assert.throws(()=>navigationRoute('page-library',{navigationAliases:{'page-library':{kind:'destination',key:'images"] button'}}}),/Invalid navigation mapping/);
 assert.throws(()=>navigationRoute('page-library',{navigationAliases:{'page-library':{kind:'execute',key:'images'}}}),/Invalid navigation mapping/);
});

test('changed aliases invalidate only affected observations and leave independent evidence intact',()=>{
 const report={samples:[{label:'home'},{label:'gallery'},{label:'question'},{label:'protected-fixture'},{label:'external-fixture'}],coverage:{states:[
  {id:'page-home',status:'observed',sample:0,evidence:'native-structure'},
  {id:'page-library',status:'observed',sample:1,evidence:'native-structure',navigationKey:'destination:images'},
  {id:'questions',status:'observed',sample:2,evidence:'native-structure'},
  {id:'settings-passwords',status:'observed',sample:3,navigationKey:'settings:passwords'},
  {id:'settings-profile',status:'observed',sample:4,navigationKey:'settings:profile'}
 ]}};
 const controls={navigationAliases:{'page-library':{kind:'destination',key:'updated-images'}},protectedStates:['settings-passwords'],externalStates:['settings-profile']};
 const samples=structuredClone(report.samples);
 refreshNavigationEvidence(report,controls);
 assert.equal(report.coverage.states[0].status,'observed');assert.equal(report.coverage.states[0].sample,0);
 assert.equal(report.coverage.states[2].status,'observed');assert.equal(report.coverage.states[2].sample,2);
 assert.equal(report.coverage.states[1].status,'not-observed');assert.equal(report.coverage.states[1].reason,'navigation-mapping-changed');assert.equal(report.coverage.states[1].sample,undefined);
 assert.equal(report.coverage.states[3].reason,'protected-state');assert.equal(report.coverage.states[3].sample,undefined);
 assert.equal(report.coverage.states[4].status,'not-observed');assert.equal(report.coverage.states[4].reason,'external-content');assert.equal(report.coverage.states[4].sample,undefined);
 assert.deepEqual(report.samples,samples);
 assert.equal(navigationObservationMatches({id:'page-home',status:'observed'},{kind:'destination',key:'home'}),true);
 assert.equal(navigationObservationMatches({id:'settings-general',status:'observed'},{kind:'settings',key:'general-settings'}),false);
});

test('hidden cached selections do not prove navigation or become restoration targets',async()=>{
 const d=settingsDom();d.ui.open=true;
 assert.equal(await d.evaluate('('+navigationReached.toString()+')("settings","account")'),false);
 const cached=d.nodes.find(n=>n.key==='account');cached.visible=true;cached.hidden=true;
 assert.equal(await d.evaluate('('+navigationReached.toString()+')("settings","account")'),false);
 cached.hidden=false;cached.inert=true;
 assert.equal(await d.evaluate('('+navigationReached.toString()+')("settings","account")'),false);
 assert.equal(await d.evaluate('('+navigationReached.toString()+')("settings","general-settings")'),true);
 await d.evaluate('('+saveNavigation.toString()+')()');
 assert.deepEqual(await d.evaluate('window.__codexCreatorNavigation.selected.map(n=>n.key)'),['general-settings']);
 d.nodes.find(n=>n.key==='general-settings').inert=true;
 assert.equal(await d.evaluate('('+restoreNavigation.toString()+')(true)'),false);assert.deepEqual(d.ui.clicks,[]);
});

test('sidebar control labels can be configured without source-language edits',async()=>{
 const d=settingsDom();
 assert.deepEqual(await d.evaluate('('+sidebarState.toString()+')(false,["Masquer le panneau"])'),{requested:true});
 assert.equal(d.ui.sidebar,false);
 d.toggle.inert=true;
 assert.deepEqual(await d.evaluate('('+sidebarState.toString()+')(true,["Masquer le panneau"])'),{requested:false,reason:'sidebar-toggle-unmapped'});
 assert.equal(d.ui.sidebar,false);
  d.toggle.inert=false;
 assert.deepEqual(await d.evaluate('('+sidebarState.toString()+')(true,["Unrelated label"])'),{requested:false,reason:'sidebar-toggle-unmapped'});
 assert.equal(d.ui.sidebar,false);
});

test('settings batch captures reachable aliases, preserves missing/protected gaps and restores its starting tab',async()=>{
 const f=await batchFixture();const {report}=await f.run();
 const states=new Map(report.coverage.states.map(row=>[row.id,row]));
 for(const id of ['page-settings','settings-general','settings-notifications','settings-plugins'])assert.equal(states.get(id).status,'observed',id);
 assert.equal(states.get('settings-general').navigationKey,'settings:general-settings');
 assert.equal(states.get('settings-plugins').navigationKey,'settings:plugins-settings');
 assert.equal(states.get('settings-account').status,'not-observed');
 assert.equal(states.get('settings-trusted-contact').status,'not-observed');
 assert.equal(states.get('settings-passwords').reason,'protected-state');
 assert.ok(!f.ui.clicks.includes('passwords'));assert.ok(!f.ui.clicks.includes('account'));
 assert.equal(f.ui.current,'general-settings');assert.equal(report.coverage.settingsRestored,true);assert.equal(report.coverage.restored,true);
 assert.equal(f.opened,f.closed);
});

test('settings batch restores after capture interruption and refuses a different inventory target before navigation',async()=>{
 const interrupted=await batchFixture();interrupted.ui.failCapture=true;
 await assert.rejects(interrupted.run(),/synthetic capture interruption/);
 assert.equal(interrupted.ui.current,'general-settings');assert.equal(interrupted.reports.at(-1).coverage.settingsRestored,true);assert.equal(interrupted.opened,interrupted.closed);
 const foreign=await batchFixture();await assert.rejects(foreign.run({targetId:'another-window'}),/same verified inventory window/);
 assert.deepEqual(foreign.ui.clicks,[]);assert.equal(foreign.opened,foreign.closed);
});

test('settings restoration failure remains a blocking result',async()=>{
 const f=await batchFixture();f.ui.failRestore=true;const {report}=await f.run();
 assert.equal(report.coverage.settingsRestored,false);assert.equal(report.coverage.restored,false);
 assert.equal(report.coverage.restoreError,'Settings navigation restoration was not observed');assert.equal(f.opened,f.closed);
});

test('standalone native profile entry stays unvisited and cannot remove the settings surface',async()=>{
 // Observed behavior: Profile leaves settings for a standalone native page.
 // The original no-click and restoration oracle remains unchanged.
 const f=await batchFixture({detachedProfile:true});const {report}=await f.run();
 assert.ok(!f.ui.clicks.includes('profile'),'A standalone settings entry must not be clicked by the native batch');
 const profile=report.coverage.states.find(row=>row.id==='settings-profile');
 assert.equal(profile.status,'not-observed');assert.equal(profile.reason,'manual-native-surface');
 assert.equal(f.ui.open,true);assert.equal(f.ui.current,'general-settings');
 assert.equal(report.coverage.settingsRestored,true);assert.equal(f.opened,f.closed);
});

test('manual profile capture requires visible native structure without reading content and binds its mapping',async()=>{
 const f=await batchFixture({detachedProfile:true});f.ui.open=false;
 const original=structuredClone(f.report);
 await assert.rejects(f.manual('settings-profile'),/not structurally observed/);
 f.surface.visible=true;f.surface.hidden=true;
 await assert.rejects(f.manual('settings-profile'),/not structurally observed/);
 f.surface.hidden=false;f.surface.inert=true;
 await assert.rejects(f.manual('settings-profile'),/not structurally observed/);
 f.surface.inert=false;
 const {report}=await f.manual('settings-profile');
 const row=report.coverage.states.find(r=>r.id==='settings-profile');
 assert.equal(row.status,'observed');assert.equal(row.reason,null);assert.equal(row.evidence,'native-structure');
 assert.match(row.navigationKey,/^surface:profile-viewer:[a-f0-9]{64}$/);
 const controls=await authoringControls();refreshNavigationEvidence(report,controls);
 assert.equal(row.status,'observed');
 controls.navigationAliases['settings-profile'].selector="[data-app-shell-main-surface] section[data-updated-profile]";
 refreshNavigationEvidence(report,controls);
 assert.equal(row.status,'not-observed');assert.equal(row.reason,'manual-native-surface');assert.equal(row.sample,undefined);
 assert.deepEqual(f.report,original);assert.deepEqual(f.ui.clicks,[]);assert.equal(f.opened,f.closed);
 await assert.rejects(f.manual('settings-passwords'),/Protected state is not inspected/);
});

test('tool card mapping follows observed direct activity structure and preserves disabled bundled themes',async()=>{
 // Public structural contract from the inspected native activity-card specimen.
 const read=async name=>JSON.parse(await readFile(new URL(name,import.meta.url),'utf8'));
 const adapter=await read('../adapters/codex-26.1103.json');
 assert.deepEqual(adapter.regions.toolCards,['[data-tool-call]',"[data-app-shell-main-surface] div:has(> [class~='group/activity-header'] > button[aria-expanded])"]);
 assert.ok(!adapter.unconfirmedRegions.includes('toolCards'));
 for(const name of ['kurumi-twilight','neutral-dark'])assert.equal((await read('../themes/'+name+'/manifest.json')).regions.toolCards.enabled,false);
});

test('protected shell collector reads only two outer boxes and never traverses contents',()=>{
 const root={inert:false,getBoundingClientRect(){return {x:10.4,y:20.8,width:900.6,height:600.2};},closest(){return this.inert?this:null;},get children(){throw Error('No descendant traversal');},get textContent(){throw Error('No content read');},get value(){throw Error('No value read');},get outerHTML(){throw Error('No markup read');},querySelectorAll(){throw Error('No subtree queries');}};
 const queries=[];let show=true;
 const context=vm.createContext({innerWidth:1000,innerHeight:720,devicePixelRatio:1.25,document:{querySelectorAll(q){queries.push(q);if(!['[data-app-shell-main-surface]','[data-app-shell-main-surface] [class~="group/settings"]'].includes(q))throw Error('Unexpected scope');return show?[root]:[];}},getComputedStyle:()=>({display:'block',visibility:'visible',backgroundColor:'rgb(10,20,30)',color:'rgb(240,240,240)',backgroundImage:'none',borderWidth:'1px',position:'relative'})});
 const run=()=>JSON.parse(JSON.stringify(vm.runInContext('('+captureSettingsShell.toString()+')()',context)));
 const data=run();assert.equal(queries.length,2);assert.equal(data.scope,'shell-only');assert.deepEqual(data.regionCoverage.map(r=>r.key),['chat','settings']);
 assert.deepEqual(data.regionCoverage[0].samples,[{visible:true,rect:[10,21,901,600],background:'rgb(10,20,30)',foreground:'rgb(240,240,240)',hasBackgroundImage:false,border:'1px',position:'relative'}]);
 assert.deepEqual(data.candidates,[]);assert.equal(data.shadowRoots,0);
 root.inert=true;assert.throws(run,/not structurally observed/);root.inert=false;show=false;assert.throws(run,/not structurally observed/);
});

test('protected shell capture requires explicit scope and target proof while ordinary collection remains blocked',async()=>{
 const f=await batchFixture(),baseline=f.ui.fullCaptures;
 let writes=0;await assert.rejects(f.manual(null,{shellOnly:true,authorizationNote:'Explicit outer-layout permission',onProgress:async()=>writes++}),/actual user authorization/);assert.equal(writes,0);
 await assert.rejects(f.manual('settings-passwords',{shellOnly:true}),/actual user authorization/);
 await assert.rejects(f.manual('settings-general',{shellOnly:true,authorizationNote:'Explicit outer-layout permission'}),/actual user authorization/);
 await assert.rejects(f.manual('settings-passwords',{shellOnly:true,authorizationNote:'Explicit outer-layout permission'}),/not structurally observed/);
 f.ui.current='passwords';await assert.rejects(f.manual('settings-passwords'),/Protected state/);
 const original=structuredClone(f.report),{report}=await f.manual('settings-passwords',{shellOnly:true,authorizationNote:'Explicit outer-layout permission'});
 assert.equal(f.ui.fullCaptures,baseline);assert.equal(f.ui.shellCaptures,1);assert.deepEqual(f.ui.clicks,[]);assert.deepEqual(f.report,original);
 const row=report.coverage.states.find(r=>r.id==='settings-passwords');assert.equal(row.status,'observed');assert.equal(row.scope,'shell-only');assert.equal(row.evidence,'native-shell-structure');
 const session=createSession('shell-fixture','Shell fixture','en');session.inventory=report;assert.deepEqual(summary(session).inventory.shellOnlyStates,['settings-passwords']);
 const controls=await authoringControls();refreshNavigationEvidence(report,controls);assert.equal(row.status,'observed');
 f.ui.current='general-settings';const batch=await f.run({previous:report});assert.ok(!f.ui.clicks.includes('passwords'));assert.equal(batch.report.coverage.states.find(r=>r.id==='settings-passwords').scope,'shell-only');
 controls.protectedShellStates=[];refreshNavigationEvidence(report,controls);assert.equal(row.status,'not-observed');assert.equal(row.reason,'protected-state');assert.equal(row.sample,undefined);assert.equal(f.opened,f.closed);
});

test('unexpected departure stops the batch without rewriting unvisited entries as missing',async()=>{
 const f=await batchFixture({unexpectedDeparture:true});
 const before=structuredClone(f.report.coverage.states.find(row=>row.id==='settings-plugins'));
 const {report}=await f.run();
 assert.equal(report.coverage.settingsInterrupted,true);assert.equal(report.coverage.restored,false);
 assert.equal(report.coverage.states.find(row=>row.id==='settings-notifications').reason,'settings-surface-lost');
 assert.deepEqual(report.coverage.states.find(row=>row.id==='settings-plugins'),before);
 assert.ok(!f.ui.clicks.includes('plugins-settings'));assert.equal(f.opened,f.closed);
});

test('focused editable fields pause the settings batch without reading or changing their value',async()=>{
 const f=await batchFixture();
 f.document.activeElement={matches:()=>true,get value(){throw new Error('Draft value must not be read');}};
 await assert.rejects(f.run(),/leave the editable field/);
 assert.deepEqual(f.ui.clicks,[]);assert.equal(f.ui.current,'general-settings');assert.equal(f.opened,f.closed);
});
