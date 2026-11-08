import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {windowController,selectNativeWindow,nativeWindowCommand} from '../scripts/window-control.mjs';
import {inventory} from '../scripts/coverage-runner.mjs';
import {createSession,selectLayout,setSource,choosePalette,buildManifest,backgroundRevision,completeRevision,confirm} from '../../scripts/workflow.mjs';
import {loadLocales,localeBundle,localizeError} from '../../scripts/localization.mjs';

// Independent Win32 placement fixtures: a restored 800x600 rectangle at
// (20,30), with the public SW_SHOWMAXIMIZED value 3.
const placement=()=>({flags:0,showCmd:3,min:[-1,-1],max:[-1,-1],normal:[20,30,820,630]});
const snapshot=()=>({owner:{pid:42,startedTicks:'123456789'},windows:[{handle:'100',foreground:true,placement:placement()}]});
const noWindow=()=>({targetId:'fixture-target',page:{evaluate:async()=>({visible:true,focused:true})},browser:{send:async()=>{throw new Error('CDP -32000: Browser window not found');}}});

test('native fallback restores saved placement after both successful and failed transitions',async()=>{
 for(const fail of [false,true]){
  const calls=[],original=placement();
  const invoke=async(state,operation,token,saved)=>{
   assert.equal(state,'fixture-session');calls.push({operation,token,saved});
   if(operation==='snapshot')return snapshot();
   assert.deepEqual(token,{pid:42,startedTicks:'123456789',handle:'100'});
   if(operation==='maximized'&&fail)throw new Error('owner changed');
   if(operation==='restore'){assert.deepEqual(saved,original);return {handle:'100',placement:structuredClone(saved)};}
   return {handle:'100',placement:{...original,showCmd:operation==='normal'?1:3}};
  };
  const control=await windowController(noWindow(),'fixture-session',{platform:'win32',invoke});
  assert.equal(control.backend,'native');
  try{await control.normal();if(fail)await assert.rejects(control.maximize(),/owner changed/);else await control.maximize();}
  finally{assert.equal(await control.restore(),true);}
  assert.deepEqual(calls.map(x=>x.operation),['snapshot','normal','maximized','restore']);
 }
});

test('native binding rejects ambiguity and wrong receipts; unrelated CDP failures never fall back',async()=>{
 const multiple=snapshot();multiple.windows.push({handle:'200',foreground:false,placement:placement()});
 assert.throws(()=>selectNativeWindow(multiple,false),/unambiguous/);
 assert.equal(selectNativeWindow(multiple,true).token.handle,'100');
 multiple.windows[0].foreground=false;assert.throws(()=>selectNativeWindow(multiple,true),/unambiguous/);
 const minimized=snapshot();minimized.windows.push({handle:'300',foreground:false,placement:{...placement(),showCmd:2}});
 assert.equal(selectNativeWindow(minimized,false).token.handle,'100');
 const wrong=await windowController(noWindow(),'fixture-session',{platform:'win32',invoke:async(_s,op)=>op==='snapshot'?snapshot():{handle:'wrong-window',placement:placement()}});
 await assert.rejects(wrong.maximize(),/not observed/);await assert.rejects(wrong.restore(),/not observed/);
 const broken=noWindow();broken.browser.send=async()=>{throw new Error('CDP connection closed');};
 await assert.rejects(windowController(broken,'fixture-session',{platform:'win32',invoke:async()=>assert.fail('Identity/transport errors must not enable fallback')}),/connection closed/);
 await assert.rejects(windowController(noWindow(),'fixture-session',{platform:'linux',invoke:async()=>assert.fail('Windows-only fallback')}),/Browser window not found/);
});

test('working CDP control retains the original normal rectangle without invoking native helpers',async()=>{
 const original={windowState:'normal',left:20,top:30,width:800,height:600};let current={...original};
 const client={targetId:'fixture',browser:{async send(method,args){
  if(method==='Browser.getWindowForTarget'){assert.equal(args.targetId,'fixture');return {windowId:7,bounds:{...current}};}
  assert.equal(method,'Browser.setWindowBounds');assert.equal(args.windowId,7);current={...current,...args.bounds};return {};
 }}};
 const control=await windowController(client,'fixture',{invoke:async()=>assert.fail('CDP succeeded')});
 await control.normal();await control.maximize();assert.equal(current.windowState,'maximized');
 current={...current,left:77,top:88,width:990,height:700};
 await control.restore();assert.deepEqual(current,original);
});

test('native host dispatch preserves optional Python routing and argument boundaries',()=>{
 const token={pid:42,startedTicks:'123',handle:'100'},saved=placement();
 const ps=nativeWindowCommand('folder with spaces/session.json','restore',token,saved,{});
 assert.equal(ps.file,'powershell.exe');assert.ok(ps.args.some(v=>v.endsWith('Native-CreatorWindow.ps1')));
 assert.equal(ps.args[ps.args.indexOf('-Token')+1],JSON.stringify(token));
 const python=path.resolve('permitted-python.exe');
 const py=nativeWindowCommand('folder with spaces/session.json','restore',token,saved,{CODEX_SKIN_HOST_BACKEND:'python',CODEX_SKIN_PYTHON:python});
 assert.equal(py.file,python);assert.deepEqual(py.args.slice(0,2),['-X','utf8']);
 assert.ok(py.args.some(v=>v.endsWith('native-window.py')));assert.ok(py.args.every(v=>!v.toLowerCase().includes('powershell')));
 assert.equal(py.args[py.args.indexOf('--placement')+1],JSON.stringify(saved));
 assert.throws(()=>nativeWindowCommand('fixture','delete',null,null,{}),/operation/);
});

function inventoryFixture({captureFailure=false,restoreFailure=false}={}){
 let size=[900,700],captures=0,closed=false;const actions=[],reports=[];
 const client={targetId:'fixture',clientVersion:'26.1103.4239.0',close(){closed=true;},page:{async evaluate(expression){
  if(expression.includes('function captureRegions')){
   if(captureFailure&&++captures===3)throw new Error('fixture capture interrupted');
   return {viewport:[...size],pixelRatio:2,canvas:{window:[...size],main:[size[0]-50,size[1]-40],mainOrigin:[50,40]},regionCoverage:[],candidates:[]};
  }
  if(expression.includes('function saveNavigation'))return {ready:true,restorable:false};
  if(expression.includes('function sidebarState'))return {requested:false,reason:'fixture-unmapped'};
  if(expression.includes('__codexCreatorNavigation?.leftOpen'))return null;
  if(expression.includes('function restoreNavigation')){actions.push('navigation-restored');return true;}
  assert.fail('Unexpected DOM operation: '+expression.slice(0,80));
 }}};
 const controller={backend:'native',async normal(){actions.push('normal');size=[800,600];},async maximize(){actions.push('maximized');size=[1600,900];},async restore(){actions.push('restored');size=[900,700];if(restoreFailure)throw new Error('fixture restoration failed');return true;}};
 return {actions,reports,get closed(){return closed;},get size(){return size;},run:()=>inventory({statePath:'fixture',onProgress:async report=>reports.push(structuredClone(report))},{connect:async()=>client,windows:async()=>controller})};
}

test('real inventory orchestration measures supplied viewports and restores after interrupted capture',async()=>{
 const good=inventoryFixture();const {report}=await good.run();
 assert.deepEqual(report.measurement.windowed.canvas.window,[800,600]);assert.deepEqual(report.measurement.canvas.window,[1600,900]);assert.equal(report.measurement.pixelRatio,2);
 assert.equal(report.windowBackend,'native');assert.equal(report.coverage.restored,true);assert.ok(good.closed);assert.deepEqual(good.size,[900,700]);
 assert.deepEqual(good.actions,['normal','maximized','navigation-restored','restored']);
 const interrupted=inventoryFixture({captureFailure:true});await assert.rejects(interrupted.run(),/capture interrupted/);
 assert.ok(interrupted.closed);assert.equal(interrupted.actions.at(-1),'restored');assert.equal(interrupted.reports.at(-1).coverage.restored,true);
});

test('inventory keeps restoration failure as a blocking observation instead of claiming success',async()=>{
 const fixture=inventoryFixture({restoreFailure:true});const {report}=await fixture.run();
 assert.equal(report.coverage.restored,false);assert.match(report.coverage.restoreError,/restoration failed/);assert.ok(fixture.closed);
 const s=skin();s.inventory.coverage.restored=report.coverage.restored;
 assert.throws(()=>buildManifest(s),/navigation-or-window-restoration-incomplete/);
});

function skin(){
 const s=createSession('spring-fixture','Synthetic spring','zh-CN'),regions=['chat','userMessages','composer','codeBlocks'];
 s.inventory={binding:'synthetic',clientVersion:'26.1103.4239.0',adapterVersion:'26.1103.4239.0',measurement:{maximized:true,pixelRatio:1,canvas:{window:[1600,900],main:[1600,900]},windowed:{pixelRatio:1,canvas:{window:[800,450],main:[800,450]}}},coverage:{restored:true,states:[{id:'fixture',status:'observed',regions}]},samples:[]};
 s.catalog={regions:regions.map(key=>({key,requiresAdapterReview:false}))};
 s.foregrounds={userMessages:['#FFFFFF'],composer:['#FFFFFF'],codeBlocks:['#FFFFFF']};
 selectLayout(s,{mode:'unified',language:'zh-CN',regions});setSource(s,{kind:'provided'});
 s.assets.scene={hash:'a'.repeat(64),target:[1600,900],subject:[.4,.3,.6,.7],colors:['#F8CCD7']};
 const revision=backgroundRevision(s);s.previews.background={revision,applied:true,uncoveredScene:false};confirm(s,'background',revision,'Synthetic fixture acceptance');
 return s;
}
const pink=()=>({mode:'custom',colors:['#F8CCD7'],style:{text:'#000000',border:'#D98BA4',borderWidth:1},regionStyles:{composer:{surface:'#FFE4EC'}}});

test('explicit pink surfaces, black text and a thin border reach the validated manifest unchanged',()=>{
 const s=skin();choosePalette(s,pink());const m=buildManifest(s,'complete');
 assert.deepEqual(m.regions.userMessages.style,{surface:'#F8CCD7',surfaceOpacity:1,text:'#000000',border:'#D98BA4',borderOpacity:1,borderWidth:1});
 assert.equal(m.regions.composer.style.surface,'#FFE4EC');assert.equal(m.regions.composer.style.text,'#000000');
 assert.equal(m.regions.codeBlocks.style.text,undefined);assert.equal(m.scene.scope,'window');
 // No explicit foreground: retain legacy adjustment for white text.
 const old=skin();choosePalette(old,{mode:'custom',colors:['#402030']});
 const legacy=buildManifest(old,'complete');assert.equal(legacy.regions.userMessages.style.surface,'#402030');assert.equal(legacy.regions.userMessages.style.text,undefined);
});

test('invalid explicit styles and equal-color contrast fail without altering accepted state',()=>{
 const s=skin();choosePalette(s,pink());const before=structuredClone(s);
 const bad=[{...pink(),style:{text:'#F8CCD7'}},{...pink(),style:{text:'#000000'},regionStyles:{composer:{surface:'#000000'}}},{...pink(),style:{borderWidth:9}},{...pink(),style:{borderWidth:-1}},{...pink(),style:{borderWidth:'1'}},{...pink(),style:{text:'black'}},{...pink(),style:{css:'body{}'}},{...pink(),regionStyles:{chat:{text:'#000000'}}},{...pink(),regionStyles:{codeBlocks:{text:'#000000'}}},{...pink(),unknown:true},{...pink(),mode:'theme'}];
 for(const input of bad){assert.throws(()=>choosePalette(s,input));assert.deepEqual(s,before);}
});

test('border-only changes invalidate complete acceptance while keeping accepted background',()=>{
 const s=skin();choosePalette(s,pink());const background=backgroundRevision(s),complete=completeRevision(s);
 s.previews.complete={revision:complete,applied:true,uncoveredScene:false};confirm(s,'complete',complete,'Synthetic fixture acceptance');
 choosePalette(s,{...pink(),style:{...pink().style,borderWidth:2}});
 assert.equal(backgroundRevision(s),background);assert.equal(s.confirmations.background.revision,background);
 assert.notEqual(completeRevision(s),complete);assert.equal(s.confirmations.complete,undefined);assert.equal(s.previews.complete,undefined);
});

test('new errors and capability labels remain in selectable language files',async()=>{
 const locales=await loadLocales(),zh=localeBundle(locales,'zh-CN'),en=localeBundle(locales,'en');
 assert.equal(zh.messages['property.borderWidth'],'边框宽度');assert.equal(en.messages['property.borderWidth'],'Border width');
 assert.match(localizeError(zh,'EXPLICIT_CONTRAST_CONFLICT: composer'),/对比度不足.*composer/);
 assert.match(localizeError(zh,'No unambiguous native window; focus the intended Codex window and retry'),/无法唯一确定窗口/);
});
