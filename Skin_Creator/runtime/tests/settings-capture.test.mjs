import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {inventory,captureSettings,authoringControls,navigationRoute,navigationObservationMatches,refreshNavigationEvidence,navigationReached,saveNavigation,sidebarState} from '../scripts/coverage-runner.mjs';

function settingsDom(){
 const ui={open:false,current:'general-settings',clicks:[],failCapture:false,failRestore:false,movedAway:false,sidebar:true,label:'Masquer le panneau'};
 const keys=['general-settings','notifications','plugins-settings','account','passwords'];
 const nodes=keys.map(key=>({key,visible:key!=='account',hidden:false,isConnected:true,
  getAttribute(name){if(name==='data-settings-panel-slug')return key;if(name==='aria-current')return key===ui.current||key==='account'?'page':null;return null;},
  getBoundingClientRect(){return {width:this.visible?100:0,height:this.visible?24:0};},
  matches(){return false;},
  click(){if(ui.failRestore&&ui.movedAway&&key==='general-settings')throw new Error('synthetic restore failure');ui.clicks.push(key);ui.current=key;if(key!=='general-settings')ui.movedAway=true;},
  get textContent(){throw new Error('Settings content must not be read');},get value(){throw new Error('Settings values must not be read');}
 }));
 const frame={getAttribute:()=>String(ui.sidebar)};
 const toggle={getAttribute:name=>name==='aria-label'?ui.label:null,getBoundingClientRect:()=>({width:20,height:20}),disabled:false,click(){ui.sidebar=!ui.sidebar;}};
 const document={activeElement:null,querySelector:selector=>selector==='[data-app-shell-frame]'?frame:null,querySelectorAll(selector){
  if(selector==='button[aria-label]')return [toggle];
  if(!ui.open)return [];
  if(['[data-settings-panel-slug]','[data-sidebar-destination],[data-settings-panel-slug]'].includes(selector))return nodes;
  const match=/^\[data-settings-panel-slug="([a-z-]+)"\]$/.exec(selector);
  return match?nodes.filter(n=>n.key===match[1]):[];
 }};
 const context=vm.createContext({document,window:{},getComputedStyle:n=>({visibility:n.hidden?'hidden':'visible'}),requestAnimationFrame:fn=>fn(0)});
 const evaluate=async expression=>{const value=await vm.runInContext(expression,context);return value===undefined?null:JSON.parse(JSON.stringify(value));};
 return {ui,nodes,evaluate};
}

async function batchFixture(){
 const dom=settingsDom();let size=[1000,700],opened=0,closed=0;const reports=[];
 const page={async evaluate(expression){
  if(expression.includes('function captureRegions')){
   if(dom.ui.failCapture&&dom.ui.current==='notifications')throw new Error('synthetic capture interruption');
   return {viewport:[...size],pixelRatio:1,canvas:{window:[...size],main:[...size]},regionCoverage:['chat','settings','inputs','buttons'].map(key=>({key,matched:1,visible:key==='chat'||dom.ui.open?1:0,selectorErrors:[],samples:[]})),candidates:[]};
  }
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
 return {...dom,report:measured.report,reports,get opened(){return opened;},get closed(){return closed;},run:(options={})=>captureSettings({statePath:'synthetic',previous:measured.report,onProgress:async r=>reports.push(structuredClone(r)),...options},{connect,capture})};
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
 const report={samples:[{label:'home'},{label:'gallery'},{label:'question'}],coverage:{states:[
  {id:'page-home',status:'observed',sample:0,evidence:'native-structure'},
  {id:'page-library',status:'observed',sample:1,evidence:'native-structure',navigationKey:'destination:images'},
  {id:'questions',status:'observed',sample:2,evidence:'native-structure'},
  {id:'settings-passwords',status:'observed',sample:3,navigationKey:'settings:passwords'}
 ]}};
 const controls={navigationAliases:{'page-library':{kind:'destination',key:'updated-images'}},protectedStates:['settings-passwords']};
 const samples=structuredClone(report.samples);
 refreshNavigationEvidence(report,controls);
 assert.equal(report.coverage.states[0].status,'observed');assert.equal(report.coverage.states[0].sample,0);
 assert.equal(report.coverage.states[2].status,'observed');assert.equal(report.coverage.states[2].sample,2);
 assert.equal(report.coverage.states[1].status,'not-observed');assert.equal(report.coverage.states[1].reason,'navigation-mapping-changed');assert.equal(report.coverage.states[1].sample,undefined);
 assert.equal(report.coverage.states[3].reason,'protected-state');assert.equal(report.coverage.states[3].sample,undefined);
 assert.deepEqual(report.samples,samples);
 assert.equal(navigationObservationMatches({id:'page-home',status:'observed'},{kind:'destination',key:'home'}),true);
 assert.equal(navigationObservationMatches({id:'settings-general',status:'observed'},{kind:'settings',key:'general-settings'}),false);
});

test('hidden cached selections do not prove navigation or become restoration targets',async()=>{
 const d=settingsDom();d.ui.open=true;
 assert.equal(await d.evaluate('('+navigationReached.toString()+')("settings","account")'),false);
 const cached=d.nodes.find(n=>n.key==='account');cached.visible=true;cached.hidden=true;
 assert.equal(await d.evaluate('('+navigationReached.toString()+')("settings","account")'),false);
 assert.equal(await d.evaluate('('+navigationReached.toString()+')("settings","general-settings")'),true);
 await d.evaluate('('+saveNavigation.toString()+')()');
 assert.deepEqual(await d.evaluate('window.__codexCreatorNavigation.selected.map(n=>n.key)'),['general-settings']);
});

test('sidebar control labels can be configured without source-language edits',async()=>{
 const d=settingsDom();
 assert.deepEqual(await d.evaluate('('+sidebarState.toString()+')(false,["Masquer le panneau"])'),{requested:true});
 assert.equal(d.ui.sidebar,false);
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
