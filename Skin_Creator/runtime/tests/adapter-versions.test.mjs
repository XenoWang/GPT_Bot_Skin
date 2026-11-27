import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {adapterVersions,registeredProfile,readAdapter,adapterJSON,clientVersionFromState,bindPayloadVersion,CLIENT_VERSION_TOKEN} from '../scripts/adapter-registry.mjs';
import {payloadSource} from '../scripts/build-cdp-payload.mjs';
import {authoringConfiguration,inventory,captureSettings,refreshAdapterMapping} from '../scripts/coverage-runner.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OLD='26.1103.4239.0',CURRENT='26.1111.2228.0';
const save=(file,value)=>writeFile(file,JSON.stringify(value));
async function fixture(t){
 const parent=process.env.CODEX_THEME_TEST_ROOT;assert.ok(parent,'An isolated test parent is required');
 const root=await mkdtemp(path.join(parent,'versioned-'));assert.equal(path.dirname(root),path.resolve(parent));
 t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(path.join(root,'adapters'));
 await save(path.join(root,'adapters/versions.json'),{schemaVersion:1,profiles:{[OLD]:'26.1103',[CURRENT]:'26.1111'}});
 for(const [version,profile,marker]of [[OLD,'26.1103','legacy-layout'],[CURRENT,'26.1111','current-layout']])await save(path.join(root,'adapters','codex-'+profile+'.json'),{version,gate:'[data-shell]',regions:{chat:['.'+marker]},marker});
 return root;
}

test('historical exact profiles retain their render and authoring bindings',async()=>{
 assert.deepEqual(await adapterVersions(),{[OLD]:'26.1103',[CURRENT]:'26.1111','26.1117.3838.0':'26.1117'});
 for(const [version,profile]of [[OLD,'26.1103'],[CURRENT,'26.1111']]){
  assert.equal(await registeredProfile(version),profile);assert.equal((await readAdapter(version)).version,version);
  const config=await authoringConfiguration(version);assert.equal(config.adapter.version,version);assert.equal(config.plan.version,version);assert.equal(config.controls.version,version);
  assert.ok(config.controls.protectedStates.includes('settings-passwords'));assert.ok(config.plan.manualStates.some(s=>s.id==='questions'));
  assert.equal(clientVersionFromState({packageFullName:'OpenAI.Codex_'+version+'_x64__2p2nqsd0c76g0'}),version);
 }
 for(const version of [undefined,'26.1111','26.1111.2227.65535','26.1103.4239.1','26.1111.99999.0','__proto__'])await assert.rejects(registeredProfile(version),/Unsupported client version/);
 for(const state of [{},{packageFullName:'Other.Codex_'+CURRENT+'_x64'},{packageFullName:'OpenAI.Codex_26.1111_x64'}])assert.throws(()=>clientVersionFromState(state),/Unsupported/);
});

test('registry rejects escaping profiles, mismatched file identity and oversized data',async t=>{
 const root=await fixture(t),registry=path.join(root,'adapters/versions.json');
 for(const profiles of [{[CURRENT]:'../outside'},{[CURRENT]:'https://example.com'},{[CURRENT]:'26.1103'},{['x'.repeat(60)]:'26.1111'}]){
  await save(registry,{schemaVersion:1,profiles});await assert.rejects(adapterVersions(root),/Invalid adapter registry/);
 }
 await save(registry,{schemaVersion:1,profiles:{[CURRENT]:'26.1111'}});
 await save(path.join(root,'adapters/codex-26.1111.json'),{version:OLD,gate:'[data-shell]',regions:{}});await assert.rejects(readAdapter(CURRENT,root),/version mismatch/);
 await assert.rejects(adapterJSON('../outside.json',root),/Invalid adapter filename/);
 await writeFile(registry,' '.repeat(256*1024+1));await assert.rejects(adapterVersions(root),/exceeds/);
});

test('host payload binding accepts only a supported full version and one fixed placeholder',()=>{
 const metadata={payloadFormat:2,clientVersions:[OLD,CURRENT]},source='(()=>'+JSON.stringify(CLIENT_VERSION_TOKEN)+')()';
 for(const version of [OLD,CURRENT])assert.equal(vm.runInNewContext(bindPayloadVersion(source,metadata,version)),version);
 for(const version of ['26.1111','99.1.2.3','26.1111.2228.0";throw 1;//',null])assert.throws(()=>bindPayloadVersion(source,metadata,version),/Unsupported/);
 for(const bad of [{payloadFormat:1,clientVersions:[OLD]},{payloadFormat:2,clientVersions:[OLD,OLD]},{payloadFormat:2,clientVersions:['invalid']}])assert.throws(()=>bindPayloadVersion(source,bad,OLD),/metadata/);
 assert.throws(()=>bindPayloadVersion('1',metadata,OLD),/binding/);assert.throws(()=>bindPayloadVersion(source+';'+source,metadata,OLD),/binding/);
});

test('production payload dispatches both profiles and does not destroy an app for an unbound or foreign target',async t=>{
 const root=await fixture(t);await mkdir(path.join(root,'renderer'));await mkdir(path.join(root,'locales'));await mkdir(path.join(root,'themes'));
 await copyFile(path.join(ROOT,'renderer/core.mjs'),path.join(root,'renderer/core.mjs'));
 for(const locale of ['en','zh-CN'])await copyFile(path.join(ROOT,'locales',locale+'.json'),path.join(root,'locales',locale+'.json'));
 for(const id of ['kurumi-twilight','neutral-dark']){const folder=path.join(root,'themes',id);await mkdir(folder);await save(path.join(folder,'manifest.json'),{schemaVersion:1,id,name:'Synthetic fixture',regions:{}});}
 // The builder's runtime-module boundary is an explicit packaging contract.
 // Stub only Appearance's UI lifecycle; the real builder, registry and core execute.
 const importLine=(await readFile(path.join(ROOT,'renderer/runtime.mjs'),'utf8')).split('\n')[0].trimEnd();
 await writeFile(path.join(root,'renderer/runtime.mjs'),importLine+`\nconst KEY='__codexAppearanceV1';
export class Appearance {
 constructor(adapter,builtin){this.adapter=adapter;this.style={};this.counts={chat:1};this.packs=new Map([[builtin.manifest.id,builtin]]);window.selected={version:adapter.version,marker:adapter.marker};}
 async start(){window.starts=(window.starts??0)+1;} renderList(){} destroy(){window.destroys=(window.destroys??0)+1;}
}
export async function boot(){}\n`);
 const exactBuild=await payloadSource(root);
 assert.throws(()=>bindPayloadVersion(exactBuild.text,exactBuild,'26.1111.9265.0'),/Unsupported client version/);
 const patch='26.1111.9266.0';
 await save(path.join(root,'adapters/versions.json'),{schemaVersion:2,minimumVersion:CURRENT,profiles:{[OLD]:'26.1103',[CURRENT]:'26.1111',[patch]:patch}});
 await save(path.join(root,'adapters','codex-'+patch+'.json'),{version:patch,gate:'[data-shell]',regions:{chat:['.patch']},marker:'patch-only'});
 const built=await payloadSource(root),makeContext=()=>({structuredClone,location:{protocol:'app:',hostname:'-',pathname:'/index.html'},document:{querySelector:()=>({})},window:{}});
 for(const [version,marker,source]of [[OLD,'legacy-layout',OLD],[CURRENT,'current-layout',CURRENT],['26.1111.9265.0','current-layout',CURRENT],[patch,'patch-only',patch],['26.1111.9266.1','current-layout',CURRENT],['27.0.0.0','current-layout',CURRENT]]){
  const context=makeContext(),result=await new vm.Script(bindPayloadVersion(built.text,built,version)).runInNewContext(context,{timeout:3000});
  assert.equal(result.adapterVersion,version);assert.equal(context.window.selected.marker,marker);assert.equal(context.window.__codexAppearanceV1.adapter.profileVersion??version,source);assert.equal(context.window.starts,1);
 }
 const upgrade=makeContext();upgrade.window.__codexAppearanceRevision=built.revision;upgrade.window.__codexAppearanceV1={style:{},adapter:{version:OLD},destroy(){upgrade.window.destroys=1;}};
 const upgraded=await new vm.Script(bindPayloadVersion(built.text,built,CURRENT)).runInNewContext(upgrade,{timeout:3000});assert.equal(upgraded.adapterVersion,CURRENT);assert.equal(upgrade.window.destroys,1);
 const protectedContext=makeContext();let touched=0;protectedContext.document={querySelector(){touched++;throw Error('Unbound versions cannot inspect the shell');}};protectedContext.window.__codexAppearanceV1={destroy(){touched++;}};
 assert.equal((await new vm.Script(built.text.replace(JSON.stringify(CLIENT_VERSION_TOKEN),JSON.stringify('26.1111.999.0'))).runInNewContext(protectedContext)).blocked,'client-version');assert.equal(touched,0);
 assert.equal((await new vm.Script(built.text).runInNewContext(protectedContext)).blocked,'client-version');assert.equal(touched,0);
 protectedContext.location.protocol='https:';assert.equal((await new vm.Script(bindPayloadVersion(built.text,built,CURRENT)).runInNewContext(protectedContext)).blocked,'origin');assert.equal(touched,0);
});

test('unknown versions and cross-version captures close connections without navigation or saving stale evidence',async()=>{
 let closed=0;const forbidden=()=>assert.fail('No navigation, capture, window change or evidence write is allowed');
 const client=version=>({clientVersion:version,targetId:'fixture',page:{evaluate:forbidden},close(){closed++;}});
 await assert.rejects(inventory({statePath:'fixture',onProgress:forbidden},{connect:async()=>client('25.65535.65535.65535'),windows:forbidden}),/Unsupported client version/);assert.equal(closed,1);
 const previous={clientVersion:OLD,binding:'old-binding',measurement:{maximized:true},coverage:{states:[{id:'settings-general',status:'not-observed',regions:['settings']}]}};
 await assert.rejects(captureSettings({statePath:'fixture',previous,onProgress:forbidden},{connect:async()=>client(CURRENT),capture:forbidden}),/Re-inventory/);assert.equal(closed,2);
 await assert.rejects(inventory({statePath:'fixture',previous,manualState:'menus',onProgress:forbidden},{connect:async()=>client(CURRENT),windows:forbidden}),/same inventory session/);assert.equal(closed,3);
 const currentInventory={...previous,clientVersion:'26.1111.9265.0'};
 await assert.rejects(captureSettings({statePath:'fixture',previous:currentInventory,onProgress:forbidden},{connect:async()=>client('26.1111.9266.0'),capture:forbidden}),/Re-inventory/);
 assert.equal(closed,4);
});

function refreshFixture(){
 const oldAdapter={
  version:CURRENT,verification:'previous observation',gate:'[data-shell]',
  regions:{chat:['main'],codeBlocks:['pre'],menus:['[role=menu]']}
 };
 const adapter=structuredClone(oldAdapter);
 adapter.regions.codeBlocks.push('span[data-inline-code]');
 const plan={version:CURRENT,destinations:[],settings:[],manualStates:[]},controls={version:CURRENT,protectedStates:[],externalStates:[],navigationAliases:{}};
 // The existing inventory wire binding hashes this JSON tuple. This independently
 // constructed fixture represents an authentic old profile/window/plan receipt.
 const binding=(a,p=plan,target='fixture-target')=>createHash('sha256').update(JSON.stringify([CURRENT,a,p,target])).digest('hex');
 const region=key=>({key,matched:1,visible:1,status:'observed',selectorErrors:[],samples:[{visible:true,rect:[0,0,100,30],foreground:'rgb(255,255,255)',background:'rgb(0,0,0)'}]});
 const previous={schemaVersion:1,kind:'codex-ui-inventory',clientVersion:CURRENT,adapterVersion:CURRENT,binding:binding(oldAdapter),unconfirmedRegions:[],coverageLabels:['existing-chat','menus'],measurement:{maximized:true,pixelRatio:1,canvas:{window:[1600,900]},windowed:{pixelRatio:1,canvas:{window:[800,600]}}},samples:[{label:'existing-chat',viewport:[800,600],regionCoverage:[region('chat'),region('codeBlocks')]},{label:'menus',viewport:[800,600],regionCoverage:[region('menus')]}],coverage:{restored:true,states:[{id:'existing-chat',regions:['chat','codeBlocks'],status:'observed',sample:0,evidence:'native-structure'},{id:'menus',regions:['menus'],status:'observed',sample:1,evidence:'native-structure'}]}};
 const f={oldAdapter,adapter,plan,previous,clientVersion:CURRENT,targetId:'fixture-target',viewport:[800,600],pixelRatio:1,saved:[],closed:0,reads:0,binding};
 const page={async evaluate(expression){
  f.reads++;
  const document=new Proxy({},{get(){assert.fail('Refresh must not inspect content or navigate');}});
  return vm.runInNewContext(expression,{innerWidth:f.viewport[0],innerHeight:f.viewport[1],devicePixelRatio:f.pixelRatio,document});
 }};
 const connect=async()=>({clientVersion:f.clientVersion,targetId:f.targetId,page,close(){f.closed++;}});
 f.run=()=>refreshAdapterMapping(
  {statePath:'fixture',previous:f.previous,previousAdapter:f.oldAdapter,onProgress:async report=>{f.saved.push(structuredClone(report));}},
  {configuration:async()=>({adapter:f.adapter,plan:f.plan,controls}),connect}
 );
 return f;
}

test('additive pseudo paint refresh preserves measured structure while changing appearance binding',async()=>{
 const f=refreshFixture();f.adapter=structuredClone(f.oldAdapter);f.adapter.transparentPseudoTargets={chat:['.footer::before','.footer::after']};
 const {report,changedPaintRegions,changedRegions}=await f.run();assert.deepEqual(changedPaintRegions,['chat']);assert.deepEqual(changedRegions,[]);assert.notEqual(report.binding,f.previous.binding);assert.deepEqual(report.samples,f.previous.samples);assert.deepEqual(report.measurement,f.previous.measurement);assert.deepEqual(report.coverage,f.previous.coverage);
 for(const next of [{chat:['.footer']},{chat:[]}]){const bad=refreshFixture();bad.oldAdapter.transparentPseudoTargets={chat:['.footer::before']};bad.previous.binding=bad.binding(bad.oldAdapter);bad.adapter=structuredClone(bad.oldAdapter);bad.adapter.transparentPseudoTargets=next;await assert.rejects(bad.run(),/only adds scoped pseudo/);assert.equal(bad.saved.length,0);}
});

test('same-version control refresh invalidates changed samples while preserving independent coverage and geometry',async()=>{
 const f=refreshFixture(),before=structuredClone(f.previous);const {report,catalog,changedRegions,invalidatedStates}=await f.run();
 assert.deepEqual(changedRegions,['codeBlocks']);assert.deepEqual(invalidatedStates,['existing-chat']);assert.equal(report.binding,f.binding(f.adapter));assert.notEqual(report.binding,before.binding);
 assert.equal(report.coverage.states[0].status,'not-observed');assert.equal(report.coverage.states[0].sample,undefined);assert.equal(report.coverage.states[0].evidence,undefined);
 assert.deepEqual(report.coverage.states[1],before.coverage.states[1]);assert.deepEqual(report.samples[1],before.samples[1]);assert.deepEqual(report.measurement,before.measurement);assert.deepEqual(report.samples[0].regionCoverage.map(r=>r.key),['chat']);
 assert.equal(catalog.regions.find(r=>r.key==='codeBlocks').requiresAdapterReview,true);assert.equal(catalog.regions.find(r=>r.key==='menus').requiresAdapterReview,false);
 assert.deepEqual(f.previous,before);assert.equal(f.saved.length,1);assert.equal(f.closed,1);assert.equal(f.reads,1);
});

test('partial refresh cannot launder changed versions, windows, plans, geometry or an unproven old profile',async()=>{
 const cases=[
  [f=>{f.clientVersion=OLD;},/same verified/],
  [f=>{f.previous.adapterVersion=OLD;},/same verified/],
  [f=>{f.targetId='different-window';},/same verified/],
  [f=>{f.plan.settings.push('new-page');},/same verified/],
  [f=>{f.oldAdapter.regions.menus.push('unproven');},/same verified/],
  [f=>{f.adapter.gate='different-shell';},/non-selector/],
  [f=>{f.adapter.regions.chat.push('new-main');},/scene geometry/],
  [f=>{f.viewport=[801,600];},/measured viewport/],
  [f=>{f.pixelRatio=2;},/measured viewport/],
  [f=>{f.previous.coverage.restored=false;},/complete restored/,0],
  [f=>{f.previous.kind='unverified-probe';},/complete restored/,0],
  [f=>{f.previous.schemaVersion=2;},/complete restored/,0]
 ];
 for(const [change,error,closed=1]of cases){const f=refreshFixture();change(f);const before=structuredClone(f.previous);await assert.rejects(f.run(),error);assert.deepEqual(f.previous,before);assert.equal(f.saved.length,0);assert.equal(f.closed,closed);}
});

test('metadata-only refresh keeps observations and the current profile maps the actually observed inline span',async()=>{
 const f=refreshFixture();f.adapter=structuredClone(f.oldAdapter);f.adapter.verification='updated review note';
 const {report,changedRegions,invalidatedStates}=await f.run();assert.deepEqual(changedRegions,[]);assert.deepEqual(invalidatedStates,[]);assert.deepEqual(report.coverage,f.previous.coverage);assert.deepEqual(report.samples,f.previous.samples);
 const current=await readAdapter(CURRENT),legacy=await readAdapter(OLD),selector="[data-app-shell-main-surface] :is([data-markdown-text-style],[data-markdown-text-tone]) span[class~='InlineCode-Cddi3Y']";
 assert.ok(current.regions.codeBlocks.includes(selector));assert.ok(!legacy.regions.codeBlocks.includes(selector));
});

test('both packaged registries use the inclusive floor and numeric component order',async()=>{
 const usage=await import('../../../Skin_Usage/runtime/scripts/adapter-registry.mjs');
 const newer=['26.1111.2228.1','26.1111.9265.0','26.1111.9999.0','26.1111.10000.0','26.1112.0.0','26.1117.3837.65535'];
 for(const read of [readAdapter,usage.readAdapter]){
  for(const actual of newer){
   const adapter=await read(actual);
   assert.equal(adapter.version,actual);
   assert.equal(adapter.profileVersion,CURRENT);
  }
  for(const actual of ['26.1117.3838.1','26.1117.4957.0','27.0.0.0','99.1.2.3']){
   const adapter=await read(actual);
   assert.equal(adapter.version,actual);
   assert.equal(adapter.profileVersion,'26.1117.3838.0');
   assert.equal(adapter.bundledSkinLabel,'newLayoutSkin');
  }
  for(const denied of ['26.1111.999.9','26.1111.2227.65535','26.111.65535.0','26.1103.4239.1','27.0.0.x']){
   await assert.rejects(read(denied),/Unsupported client version/);
  }
 }
 for(const actual of ['26.1111.9265.0','26.1117.4957.0','27.0.0.0']){
  const {adapter,plan,controls}=await authoringConfiguration(actual);
  for(const resolved of [adapter,plan,controls]){
   assert.equal(resolved.version,actual);
   assert.equal(resolved.profileVersion,actual==='26.1111.9265.0'?CURRENT:'26.1117.3838.0');
  }
  assert.ok(controls.protectedStates.includes('settings-passwords'));
  assert.ok(plan.manualStates.some(state=>state.id==='questions'));
 }
});
