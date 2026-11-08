import test from 'node:test';
import assert from 'node:assert/strict';
import {readTranslations} from '../scripts/build.mjs';
const translations=await readTranslations();
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
