import test from 'node:test';
import assert from 'node:assert/strict';
import {readTranslations} from '../scripts/build.mjs';
const translations=await readTranslations();
import {readAdapter} from '../scripts/adapter-registry.mjs';
import {authoringConfiguration} from '../scripts/coverage-runner.mjs';
import {bundledPacks} from '../../../Skin_Usage/runtime/scripts/build-cdp-payload.mjs';
import {fileURLToPath} from 'node:url';
import {Appearance} from '../renderer/runtime.mjs';

// A small DOM adapter exercises ownership and lifecycle, not browser layout.
// Profile and native item identities are independent fixtures that must survive.
class Node {
 constructor(tag){this.tag=tag;this.children=[];this.parentElement=null;this.dataset={};this.attributes={};this.styles=new Map();this.style={setProperty:(k,v)=>this.styles.set(k,v)};this.width=36;this.open=false;}
 append(...nodes){for(const n of nodes){n.remove();n.parentElement=this;this.children.push(n);}}
 insertBefore(node,anchor){if(anchor.parentElement!==this)throw new Error('Anchor must be a child');node.remove();node.parentElement=this;this.children.splice(this.children.indexOf(anchor),0,node);}
 get nextElementSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)+1]??null;}
 remove(){if(this.parentElement){const p=this.parentElement;p.children.splice(p.children.indexOf(this),1);this.parentElement=null;}}
 setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k]??null;}replaceChildren(...nodes){for(const n of [...this.children])n.remove();this.append(...nodes);}querySelectorAll(){return [];}
 attachShadow(){this.shadowRoot=new Node('shadow');return this.shadowRoot;}
 cloneNode(){const n=new Node(this.tag);n.textContent=this.textContent;return n;}
 querySelector(selector){return this.matches?.get(selector)??null;}
 getBoundingClientRect(){return {width:this.width};}
 showModal(){this.open=true;this.modal=true;}
 close(){this.open=false;}
}
function setup(t,builtin={manifest:{id:'fixture'}}){
 const names=['document','window','ResizeObserver'],originals=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const body=new Node('body'),head=new Node('head'),rail=new Node('nav'),dock=new Node('list'),home=new Node('home'),profile=new Node('profile'),footer=new Node('footer');
 dock.append(home);footer.append(profile);rail.append(dock,footer);body.append(rail);
 const spec={rail:'native-rail',footer:'native-footer',reference:'native-home'};
 rail.matches=new Map([[spec.footer,footer],[spec.reference,home]]);
 const listeners=new Map(),doc={body,head,createElement:tag=>new Node(tag),querySelector:()=>doc.rail,querySelectorAll:()=>[],documentElement:{lang:'zh-CN'}};doc.rail=rail;
 globalThis.document=doc;globalThis.window={addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}};
 globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;this.watched=new Set();}observe(n){this.watched.add(n);}disconnect(){this.watched.clear();}};
 const app=new Appearance({version:'fixture',managerDock:spec,gate:'fixture',regions:{},transparentSurfaces:{}},builtin,translations);app.style=new Node('style');head.append(app.style);app.makePanel();
 t.after(()=>{for(const [k,d]of originals){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 return {app,doc,body,rail,dock,home,profile,footer,spec,listeners};
}

test('theme entry sits directly above the native footer without moving profile',t=>{
 const {app,body,rail,dock,home,footer,profile}=setup(t);
 assert.deepEqual(rail.children,[dock,app.launcher,footer]);assert.deepEqual(footer.children,[profile]);assert.equal(profile.parentElement,footer);
 assert.deepEqual(dock.children,[home]);assert.equal(app.host.parentElement,body);assert.equal(app.launcher.dataset.docked,'true');
 app.syncManager();app.syncManager();assert.deepEqual(rail.children,[dock,app.launcher,footer]);assert.equal(app.launcher.nextElementSibling,footer);
 assert.deepEqual([...app.managerObserver.watched],[rail,home,footer]);
});

test('entry follows replacement navigation and native control width changes',t=>{
 const {app,doc,body,rail,dock,home,footer,profile,spec}=setup(t);
 const replacement=new Node('nav'),newList=new Node('list'),newFooter=new Node('footer'),newHome=new Node('home'),newProfile=new Node('profile');newHome.width=30;newList.append(newHome);newFooter.append(newProfile);replacement.append(newList,newFooter);replacement.matches=new Map([[spec.footer,newFooter],[spec.reference,newHome]]);
 rail.remove();body.append(replacement);doc.rail=replacement;app.syncManager();
 assert.deepEqual(replacement.children,[newList,app.launcher,newFooter]);assert.deepEqual(newFooter.children,[newProfile]);assert.deepEqual(rail.children,[dock,footer]);assert.deepEqual(dock.children,[home]);assert.deepEqual(footer.children,[profile]);
 assert.deepEqual([...app.managerObserver.watched],[replacement,newHome,newFooter]);assert.equal(app.launcher.styles.get('--appearance-native-size'),'30px');
 newHome.width=24;app.managerObserver.callback();assert.equal(app.launcher.styles.get('--appearance-native-size'),'24px');
});

test('unknown navigation hides floating entry while dialog remains available',t=>{
 const {app,doc,body,dock,home,profile,footer}=setup(t);doc.rail=null;app.syncManager();
 assert.equal(app.launcher.parentElement,body);assert.equal(app.launcher.dataset.docked,'false');assert.deepEqual(dock.children,[home]);assert.deepEqual(footer.children,[profile]);assert.equal(app.managerObserver.watched.size,0);
 app.toggleManager();assert.equal(app.dialog.open,true);assert.equal(app.dialog.modal,true);app.toggleManager();assert.equal(app.dialog.open,false);
});

test('theme shortcut works without taking unrelated keyboard combinations',t=>{
 const {app,listeners}=setup(t);let prevented=0;
 const event={altKey:true,shiftKey:true,ctrlKey:false,metaKey:false,code:'KeyT',repeat:false,defaultPrevented:false,preventDefault:()=>prevented++};
 listeners.get('keydown')(event);assert.equal(app.dialog.open,true);assert.equal(prevented,1);
 listeners.get('keydown')({...event,ctrlKey:true});assert.equal(app.dialog.open,true);assert.equal(prevented,1);
 listeners.get('keydown')({...event,repeat:true});assert.equal(app.dialog.open,true);assert.equal(prevented,1);
 listeners.get('keydown')(event);assert.equal(app.dialog.open,false);assert.equal(prevented,2);
});

test('unloading removes only plugin controls and disconnects handlers',t=>{
 const {app,body,rail,dock,home,footer,profile,listeners}=setup(t);app.toggleManager();app.destroy();
 assert.deepEqual(body.children,[rail]);assert.deepEqual(rail.children,[dock,footer]);assert.deepEqual(dock.children,[home]);assert.deepEqual(footer.children,[profile]);
 assert.equal(app.dialog.open,false);assert.equal(app.managerObserver.watched.size,0);assert.equal(listeners.size,0);
});

const managedPack=id=>({manifest:{schemaVersion:1,id,name:id,regions:{composer:{enabled:true,style:{surface:'#000000',surfaceOpacity:1}},userMessages:{enabled:true,style:{surface:'#A71032',surfaceOpacity:.7}}}},assets:{}});

test('fixed X and live status stay outside the scrolling settings body',t=>{
 const {app}=setup(t),heading=app.topClose.parentElement;
 assert.equal(app.topClose.textContent,'X');assert.equal(heading.parentElement,app.dialog);assert.equal(app.panelBody.parentElement,app.dialog);assert.notEqual(heading,app.panelBody);assert.equal(app.notice.parentElement,app.dialog);assert.ok(!app.panelBody.children.includes(app.topClose));
 app.toggleManager();app.topClose.onclick();assert.equal(app.dialog.open,false);
 assert.match(app.panelBaseCss,/\.manager-heading\{[^}]*flex:none/);assert.match(app.panelBaseCss,/\.panel-scroll\{[^}]*overflow-y:auto/);assert.match(app.panelBaseCss,/dialog\[open\]\{display:flex;flex-direction:column\}/);
});

test('opacity persists independently per Skin and reset affects only the active Skin',async t=>{
 const first=managedPack('first'),second=managedPack('second'),{app}=setup(t,first),saved=[];app.packs.set('second',second);app.decode=async()=>({});app.storageReady=true;app.store.saveOpacities=async x=>saved.push(structuredClone(x));
 await app.activate('first',false);assert.equal(app.opacityFields.children.length,2);
 app.setOpacity('regions.composer.style.surfaceOpacity',.4);await app.saveOpacityPreferences();assert.equal(app.pack.manifest.regions.composer.style.surfaceOpacity,.4);assert.equal(first.manifest.regions.composer.style.surfaceOpacity,1);assert.equal(saved[0].first['regions.composer.style.surfaceOpacity'],.4);
 await app.activate('second',false);assert.equal(app.pack.manifest.regions.composer.style.surfaceOpacity,1);app.setOpacity('regions.composer.style.surfaceOpacity',.8);await app.saveOpacityPreferences();
 await app.activate('first',false);assert.equal(app.pack.manifest.regions.composer.style.surfaceOpacity,.4);await app.resetOpacities();assert.equal(app.pack.manifest.regions.composer.style.surfaceOpacity,1);assert.equal(saved.at(-1).first,undefined);assert.equal(saved.at(-1).second['regions.composer.style.surfaceOpacity'],.8);
 await app.activate('original',false);assert.equal(app.opacityReset.disabled,true);assert.equal(app.opacityFields.children.length,1);assert.equal(app.opacityFields.children[0].tag,'p');assert.equal(app.opacityFields.children[0].textContent,'当前外观没有可调透明度。');
});

test('invalid percentages are rejected and old controls cannot edit another Skin',async t=>{
 const {app}=setup(t,managedPack('first'));app.decode=async()=>({});app.packs.set('second',managedPack('second'));await app.activate('first',false);
 const field=app.opacityFields.children[0],range=field.children[1],number=field.children[2];
 number.value='101';number.onchange();assert.equal(app.pack.manifest.regions.composer.style.surfaceOpacity,1);assert.equal(number.value,'100');
 range.value='70';range.oninput();assert.equal(number.value,'70');assert.equal(app.pack.manifest.regions.composer.style.surfaceOpacity,1);
 range.onchange();assert.equal(app.pack.manifest.regions.composer.style.surfaceOpacity,.7);
 await app.activate('second',false);number.value='25';number.onchange();assert.equal(app.pack.manifest.regions.composer.style.surfaceOpacity,1);assert.equal(app.opacityPreferences.second,undefined);
});

test('language uses GPT declaration or native menu and saves separately from alpha',async t=>{
 const {app,doc}=setup(t,managedPack('first'));app.decode=async()=>({});await app.activate('first',false);app.storageReady=true;const saved=[];app.store.saveLanguage=async x=>saved.push(x);
 doc.documentElement.lang='en-US';await app.setLanguage('auto');assert.equal(app.toggle.textContent,'Skin');assert.equal(app.headingTitle.textContent,'Skin settings');
 doc.documentElement.lang='';doc.getElementById=()=>({textContent:'文件'});await app.setLanguage('auto');assert.equal(app.language,'zh-CN');
 doc.documentElement.lang='fr-FR';await app.setLanguage('auto');assert.equal(app.language,'en');
 await app.setLanguage('zh-CN');assert.equal(app.language,'zh-CN');assert.deepEqual(saved,['auto','auto','auto','zh-CN']);assert.deepEqual(app.opacityPreferences,{});await assert.rejects(app.setLanguage('unknown'));assert.equal(saved.length,4);
});

test('save failures are reported and invalid stored alpha is filtered on activation',async t=>{
 const {app}=setup(t,managedPack('first'));app.decode=async()=>({});await app.activate('first',false);app.storageReady=true;
 app.store.saveOpacities=async()=>{throw new Error('disk unavailable')};app.setOpacity('regions.composer.style.surfaceOpacity',.3);await app.saveOpacityPreferences();assert.equal(app.noticeMessage.key,'opacityFailed');assert.equal(app.pack.manifest.regions.composer.style.surfaceOpacity,.3);
 app.store.saveLanguage=async()=>{throw new Error('disk unavailable')};await app.setLanguage('en');assert.equal(app.noticeMessage.key,'languageFailed');assert.equal(app.toggle.textContent,'Skin');
 app.opacityPreferences.first={'regions.composer.style.surfaceOpacity':.2,'arbitrary.path':.8,'regions.userMessages.style.surfaceOpacity':2};await app.activate('first',false);assert.equal(app.pack.manifest.regions.composer.style.surfaceOpacity,.2);assert.equal(app.pack.manifest.regions.userMessages.style.surfaceOpacity,.7);
});


test('new layout labels all four shipped skins without changing selection IDs or older labels',async t=>{
 const {app}=setup(t);
 const packages=await bundledPacks(fileURLToPath(new URL('../../../Skin_Usage/runtime/',import.meta.url)));
 const ids=['kurumi-twilight','neutral-dark','spring-sakura','planeptune-sisters'];
 app.packs=new Map(packages.map(pack=>[pack.manifest.id,pack]));
 assert.deepEqual([...app.packs.keys()],ids);
 app.bundledSkinIds=new Set(ids);
 app.packs.set('personal',{manifest:{id:'personal',name:'Personal'}});
 app.active='spring-sakura';
 for(const version of ['26.1103.4239.0','26.1111.2228.0','26.1117.3838.0','26.1117.3838.1']){
  app.adapter=await readAdapter(version);
  app.renderList();
  const options=app.select.children;
  assert.deepEqual(options.map(o=>o.value),['original',...ids,'personal']);
  assert.equal(app.select.value,'spring-sakura');
  for(const option of options){
   if(version==='26.1117.3838.0'&&ids.includes(option.value))
    assert.match(option.textContent,/新版使用（26\.1117\.3838\.0）/);
   else assert.doesNotMatch(option.textContent,/新版使用/);
  }
 }
 const {adapter,plan,controls}=await authoringConfiguration('26.1117.3838.0');
 for(const config of [adapter,plan,controls])assert.equal(config.version,'26.1117.3838.0');
 assert.ok(controls.protectedStates.includes('settings-passwords'));
});

test('switching the visible workspace retargets skin marks and ignores unrelated inline style changes',async t=>{
 const {app,doc}=setup(t);
 app.adapter=await readAdapter('26.1117.3838.0');
 app.pack={manifest:{regions:{composer:{enabled:true,style:{surface:'#303030'}}}}};
 const panes=[new Node('div'),new Node('div')],targets=[new Node('div'),new Node('div')];
 let activeIndex=0;
 for(const [index,pane] of panes.entries()){
  pane.contains=n=>n===targets[index];
  pane.matches=q=>q===app.adapter.workspacePane;
  targets[index].closest=()=>null;
  targets[index].matches=()=>false;
  targets[index].removeAttribute=key=>delete targets[index].attributes[key];
 }
 const restore=new Map(['getComputedStyle','requestAnimationFrame'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 t.after(()=>{for(const [k,d] of restore){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 globalThis.getComputedStyle=pane=>({display:pane===panes[activeIndex]?'contents':'none'});
 let callback=null;
 globalThis.requestAnimationFrame=fn=>{callback=fn;return 1;};
 doc.querySelectorAll=q=>q===app.adapter.workspacePane?panes:app.adapter.regions.composer.includes(q)?targets:[];
 app.refresh();
 assert.equal(app.counts.composer,1);
 assert.equal(targets[0].getAttribute('data-codex-appearance'),'composer');
 assert.equal(targets[1].getAttribute('data-codex-appearance'),null);
 app.onMutations([{type:'attributes',attributeName:'style',target:targets[0]}]);
 assert.equal(callback,null);
 activeIndex=1;
 app.onMutations([{type:'attributes',attributeName:'style',target:panes[1]}]);
 assert.equal(typeof callback,'function');callback();
 assert.equal(app.counts.composer,1);
 assert.equal(targets[0].getAttribute('data-codex-appearance'),null);
 assert.equal(targets[1].getAttribute('data-codex-appearance'),'composer');
});

test('new-layout controls retain the original packs and provide all four skins with menus, fields and hover',async t=>{
 const packs=await bundledPacks(fileURLToPath(new URL('../../../Skin_Usage/runtime/',import.meta.url)));
 const old=packs.map(p=>JSON.stringify(p.manifest));
 const expected=new Map([
  ['kurumi-twilight',['#A71032','#16090F','#13090D']],
  ['neutral-dark',['#748196','#20242e','#191d26']],
  ['spring-sakura',['#B95C81','#FFE4EC','#FFE4EC']],
  ['planeptune-sisters',['#8050B5','#100F1B','#1B1527']]
 ]);
 const originalObserver=Object.getOwnPropertyDescriptor(globalThis,'MutationObserver');
 globalThis.MutationObserver=class {observe(){} disconnect(){}};
 t.after(()=>{if(originalObserver)Object.defineProperty(globalThis,'MutationObserver',originalObserver);else delete globalThis.MutationObserver;});
 for(const version of ['26.1117.3838.0','26.1111.2228.0']){
  const {app}=setup(t,packs[0]);
  app.adapter=await readAdapter(version);
  app.packs=new Map(packs.map(p=>[p.manifest.id,p]));
  app.makePanel=()=>{};
  app.syncLanguageWatch=()=>{};
  app.decode=async()=>({});
  app.refresh=()=>{};
  app.store.open=async()=>{throw Error('Synthetic offline storage');};
  await app.start();
  for(const [i,p] of packs.entries()){
   const id=p.manifest.id;await app.activate(id,false);
   const m=app.pack.manifest;
   assert.equal(m.id,id);
   if(version==='26.1117.3838.0'){
    assert.deepEqual([m.hover.surface,m.regions.dialogs.style.surface,m.regions.inputs.style.surface],expected.get(id));
    assert.ok(m.regions.dialogs.enabled&&m.regions.inputs.enabled&&m.regions.menus.enabled);
   }else{
    assert.deepEqual(m.hover,p.manifest.hover);
    assert.deepEqual(m.regions.dialogs,p.manifest.regions.dialogs);
    assert.deepEqual(m.regions.inputs,p.manifest.regions.inputs);
   }
   assert.equal(JSON.stringify(p.manifest),old[i]);
  }
 }
});

test('complete themed border and inset keyboard focus are scoped to the new layout',async t=>{
 const {app}=setup(t);
 app.pack={manifest:{regions:{
  inputs:{enabled:true,style:{surface:'#191018',surfaceOpacity:.85}},
  dialogs:{enabled:true,style:{surface:'#211822',border:'#C29B52',borderOpacity:.45}}
 }}};
 for(const version of ['26.1111.2228.0','26.1117.3838.0']){
  app.adapter=await readAdapter(version);
  app.refresh();
  const css=app.style.textContent;
  if(version==='26.1117.3838.0'){
   assert.ok(css.includes('border:1px solid rgba(194,155,82,0.45)!important'));
   assert.ok(css.includes('outline:2px solid #C29B52!important;outline-offset:-2px!important'));
   assert.ok(css.includes(':has(> input:focus-visible)'));
  }else{
   assert.ok(!css.includes('outline-offset:-2px!important'));
  }
 }
});

test('all four new-layout semantic hover palettes keep readable text without changing old profiles',async()=>{
 const adapter=await readAdapter('26.1117.3838.0');
 const old=await readAdapter('26.1111.2228.0');
 assert.equal(old.controlAppearance,undefined);
 const toRGB=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 function luminance(rgb){
  const linear=rgb.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
 }
 function ratio(a,b){
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
 }
 // Surfaces and hover defaults come from the four skin designs. The minimum
 // is the normal-text contrast requirement, independent of the renderer.
 const cases=[
  ['kurumi-twilight','#13090D','#A71032',.60,'#13090D'],
  ['neutral-dark','#20242e','#748196',.32,'#191d26'],
  ['spring-sakura','#FFE4EC','#B95C81',.30,'#FFE4EC'],
  ['planeptune-sisters','#100F1B','#8050B5',.38,'#1B1527']
 ];
 for(const [id,menu,highlight,opacity,field] of cases){
  const pal=adapter.controlAppearance.palettes[id];
  assert.ok(ratio(toRGB(pal.primary),toRGB(pal.onPrimary))>=4.5,id+' primary');
  const hover=toRGB(highlight).map((v,i)=>v*opacity+toRGB(menu)[i]*(1-opacity));
  const red=toRGB(pal.danger);
  assert.ok(red[0]>red[1]&&red[0]>red[2],id+' danger keeps a red hue');
  assert.ok(ratio(red,hover)>=4.5,id+' destructive action hover');
  assert.ok(ratio(toRGB(pal.link),toRGB(field))>=4.5,id+' settings link');
 }
});

test('new desktop settings paint the section and switch track, not just the search input',async t=>{
 const {app}=setup(t);
 const fills={'kurumi-twilight':'#16090F','neutral-dark':'#20242e','spring-sakura':'#FFE4EC','planeptune-sisters':'#100F1B'};
 const tracks={'kurumi-twilight':'#E0AE61','neutral-dark':'#A7BAD5','spring-sakura':'#9D3D62','planeptune-sisters':'#B59BD1'};
 app.bundledSkinIds=new Set(Object.keys(fills));
 for(const [id,fill] of Object.entries(fills)){
  app.active=id;app.pack={manifest:{regions:{dialogs:{enabled:true,style:{surface:fill}},settings:{enabled:true,style:{surface:fill}},tooltips:{enabled:true,style:{surface:fill}}}}};
  app.adapter=await readAdapter('26.1117.3838.0');app.refresh();
  const css=app.style.textContent;
  assert.ok(!css.includes(app.adapter.settingsChrome.sticky+'{--color-surface:'+fill),id+' fixed toolbar has no painted sheet');
  assert.ok(css.includes('--settings-row-padding-inline:clamp(10px,1.25vw,16px)!important'),id+' inner gutter');
  assert.ok(css.includes('border-radius:var(--radius-2xl,16px)!important'),id+' rounded group');
  assert.ok(css.includes('--switch-track-color-checked:'+tracks[id]),id+' checked track');
  assert.ok(css.includes('[data-codex-appearance~="tooltips"]{--color-text:'),id+' actual preview surface');
  app.adapter=await readAdapter('26.1111.2228.0');app.refresh();
  assert.ok(!app.style.textContent.includes('--settings-row-padding-inline:clamp('),id+' old layout');
 }
});

test('permission cells use the editing surface and framed groups suppress only the adjoining title line',async t=>{
 const {app}=setup(t);
 app.active='planeptune-sisters';app.bundledSkinIds=new Set([app.active]);
 app.pack={manifest:{regions:{
  inputs:{enabled:true,style:{surface:'#1B1527'}},
  settings:{enabled:true,style:{surface:'#21192F'}},
  dialogs:{enabled:true,style:{surface:'#100F1B'}}
 }}};
 app.adapter=await readAdapter('26.1117.3838.0');app.refresh();
 const css=app.style.textContent,chrome=app.adapter.settingsChrome;
 assert.ok(css.includes('--color-background-panel:#1B1527;'),'body cells inherit the input surface');
 assert.ok(css.includes('--color-surface-elevated-secondary:#21192F;'),'headers keep the raised surface');
 assert.ok(css.includes(chrome.framedSectionHeader+'{border-bottom-color:transparent!important}'),'retain header layout and remove its duplicate paint');
 assert.ok(chrome.framedSectionHeader.includes('section:has('));
 app.adapter=await readAdapter('26.1111.2228.0');app.refresh();
 assert.ok(!app.style.textContent.includes('--color-background-panel:#1B1527;'));
});

test('a symbol picker paints its rounded child once and preserves dialog-only skins',async t=>{
 const {app,doc}=setup(t);
 const host=new Node('div'),picker=new Node('div');
 host.append(picker);
 for(const node of [host,picker]){
  node.closest=()=>null;
  node.removeAttribute=key=>delete node.attributes[key];
 }
 host.matches=q=>q==='[data-slot="popover-content"]';
 picker.matches=()=>false;
 host.querySelector=q=>q.includes('[data-symbol-picker]')?picker:null;
 doc.querySelectorAll=q=>{
  if(q.startsWith("[role='dialog']:not("))return [host];
  if(q.includes(" > [data-symbol-picker][role='presentation']"))return [picker];
  return [];
 };
 app.adapter=await readAdapter('26.1117.3838.0');
 const style={surface:'#FFE4EC',text:'#000000',border:'#D98BA4',borderWidth:1};
 app.pack={manifest:{regions:{dialogs:{enabled:true,style},menus:{enabled:true,style}}}};
 app.refresh();
 assert.equal(host.getAttribute('data-codex-appearance'),null);
 assert.equal(picker.getAttribute('data-codex-appearance'),'menus');
 assert.ok(app.style.textContent.includes('--color-codex-icon:#000000!important'));
 app.pack.manifest.regions.menus.enabled=false;
 app.refresh();
 assert.equal(host.getAttribute('data-codex-appearance'),null);
 assert.equal(picker.getAttribute('data-codex-appearance'),'dialogs');
});

test('image composer scopes the model and dictation foregrounds and preserves the legacy route',async t=>{
 const {app}=setup(t);
 const colors=[
  ['kurumi-twilight','#13090D','#DFC8BF','#A71032','#FFFFFF'],
  ['neutral-dark','#191d26','#BEC8D6','#45546A','#FFFFFF'],
  ['spring-sakura','#FFE4EC','#69404E','#F8CCD7','#24161C'],
  ['planeptune-sisters','#1B1527','#D7C8E3','#542B87','#FFFFFF']
 ];
 app.bundledSkinIds=new Set(colors.map(([id])=>id));
 for(const [id,base,ink,hover,hoverInk] of colors){
  app.active=id;app.pack={manifest:{hover:{surface:hover,surfaceOpacity:.5},regions:{inputs:{enabled:true,style:{surface:base}}}}};
  app.adapter=await readAdapter('26.1117.3838.0');app.refresh();
  const {rail,buttons}=app.adapter.imageComposer;
  const css=app.style.textContent;
  assert.ok(rail.startsWith('[data-image-options-composer]'));
  assert.ok(css.includes(rail+'{--composer-layout-surface-background:'+base));
  assert.ok(css.includes('--color-codex-icon:'+ink+';color:'+ink+'!important'));
  assert.ok(css.includes('color:'+hoverInk+'!important;background-color:'+hover+'!important'));
  assert.ok(css.includes(rail+' '+buttons+':not(:disabled'));
  app.adapter=await readAdapter('26.1111.2228.0');app.refresh();
  assert.ok(!app.style.textContent.includes('--composer-layout-surface-background:'+base));
 }
});

test('search and filter wrappers and reasoning slider rows remain transparent across desktop profiles',async t=>{
 const {app}=setup(t);
 app.pack={manifest:{hover:{surface:'#98123D',surfaceOpacity:1},regions:{settings:{enabled:true,style:{surface:'#30182C'}}}}};
 for(const version of ['26.1103.4239.0','26.1111.2228.0','26.1117.3838.0']){
  app.adapter=await readAdapter(version);
  app.refresh();
  const rules=app.style.textContent.split('}').map(rule=>rule.split('{'));
  const clear=rules.filter(([,style])=>style?.includes('background-color:transparent!important')&&style.includes('background-image:none!important')).map(([selector])=>selector);
  const toolbar=clear.find(s=>s.includes('.sticky.bg-surface:has('));
  assert.ok(toolbar?.includes('input')&&toolbar.includes('button'),version+' search and filter toolbars');
  assert.ok(toolbar.includes('::before')&&toolbar.includes('::after'),version+' both outer fades');
  const row=clear.find(s=>s.startsWith('[role="menu"]')&&s.includes('[data-reasoning-slider]'));
  assert.ok(row?.includes('[role="menuitem"]:has([role="slider"])'),version+' semantic slider fallback');
  assert.ok(!row.endsWith(' [role="slider"]'),version+' preserve the native track');
  const hover=rules.find(([s])=>s.startsWith('[role="menu"]')&&s.includes(':hover:not(:disabled)'));
  assert.ok(hover?.[0].includes('[data-reasoning-slider]'),version+' generic hover excludes slider');
 }
});
