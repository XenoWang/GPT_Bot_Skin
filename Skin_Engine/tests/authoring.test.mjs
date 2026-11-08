import test from 'node:test';
import assert from 'node:assert/strict';
import {installAuthoring} from '../renderer/authoring.mjs';
import {validatePack} from '../renderer/core.mjs';
import {loadLocales,localeBundle} from '../../Skin_Creator/scripts/localization.mjs';
const locales=await loadLocales(),locale=localeBundle(locales,'zh-CN');
const pack=id=>({manifest:{schemaVersion:1,id,name:id,regions:{composer:{enabled:true,style:{surface:'#101010'}}}},assets:{}});
class Node{
 constructor(tag){this.tag=tag;this.children=[];this.attributes=new Map();this.style={};this.hidden=false;this.checked=false;}
 append(...nodes){for(const n of nodes){n.remove();n.parent=this;this.children.push(n);}}
 remove(){if(this.parent){const siblings=this.parent.children;siblings.splice(siblings.indexOf(this),1);this.parent=null;}}
 setAttribute(k,v){this.attributes.set(k,v);}
 querySelector(selector){return this.children.find(n=>n.attributes.has(selector.slice(1,-1)))??this.children.map(n=>n.querySelector(selector)).find(Boolean)??null;}
}
function fixture(t){
 const old=Object.getOwnPropertyDescriptor(globalThis,'document');globalThis.document={createElement:tag=>new Node(tag)};t.after(()=>{if(old)Object.defineProperty(globalThis,'document',old);else delete globalThis.document;});
 const original=pack('installed'),panelBody=new Node('body'),control=new Node('original-controls');panelBody.append(control);
 const state={writes:0,activations:[]};
 const app={features:{sharedScene:1},packs:new Map([['installed',original]]),pack:original,active:'installed',dimensions:{},language:'en',languagePreference:'auto',panelBody,mounted:new Map(),counts:{chat:1},opacityPreferences:{installed:{alpha:.7}},layoutPreferences:{installed:'split'},store:new Proxy({}, {get(){return ()=>{state.writes++;throw new Error('Preview must not persist');};}}),dialog:{open:false,showModal(){this.open=true;}},async decode(){return {};},clear(){this.mounted.clear();},refresh(){if(this.failFor===this.active)throw new Error('render failed');},localizePanel(){},renderList(){},async activate(id){state.activations.push(id);this.active=id;}};
 return {app,control,original,state,api:installAuthoring(app,validatePack)};
}
const descendants=node=>[node,...node.children.flatMap(descendants)];
test('temporary preview replaces itself without installing a pack or changing stored preferences',async t=>{
 const {app,api,control,original,state}=fixture(t),before=JSON.stringify([app.opacityPreferences,app.layoutPreferences]);
 const first=await api.preview(pack('draft'),'a'.repeat(64),'background',locale);assert.equal(first.applied,true);assert.equal(app.pack.manifest.id,'draft');assert.equal(control.hidden,true);assert.equal(app.packs.size,1);
 assert.ok(descendants(app.panelBody).some(n=>n.textContent==='创作预览（尚未安装为皮肤）'));
 await api.preview(pack('draft'),'b'.repeat(64),'complete',locale);assert.equal(app.panelBody.children.length,2);assert.equal(api.revision,'b'.repeat(64));assert.equal(state.writes,0);assert.equal(JSON.stringify([app.opacityPreferences,app.layoutPreferences]),before);
 assert.deepEqual(api.restore(),{restored:true});assert.equal(app.pack,original);assert.equal(app.active,'installed');assert.equal(app.language,'en');assert.equal(app.languagePreference,'auto');assert.equal(control.hidden,false);assert.deepEqual(app.panelBody.children,[control]);assert.equal(api.receipt,null);assert.equal(state.writes,0);
});
test('decode and rendering failures leave the prior appearance and controls usable',async t=>{
 const {app,api,original,control,state}=fixture(t);app.decode=async()=>{throw new Error('decode failed');};await assert.rejects(api.preview(pack('draft'),'a'.repeat(64),'background',locale),/decode failed/);assert.equal(app.pack,original);assert.equal(control.hidden,false);
 app.decode=async()=>({});app.failFor='draft';await assert.rejects(api.preview(pack('draft'),'a'.repeat(64),'background',locale),/render failed/);assert.equal(app.pack,original);assert.equal(control.hidden,false);assert.equal(app.language,'en');assert.equal(api.revision,null);assert.equal(state.writes,0);
});
test('installed IDs are rejected and normal activation cleanly ends preview',async t=>{
 const {app,api,original,state}=fixture(t);await assert.rejects(api.preview(pack('installed'),'a'.repeat(64),'background',locale),/installed Skin/);assert.equal(app.pack,original);
 await api.preview(pack('draft'),'b'.repeat(64),'background',locale);await app.activate('original');assert.equal(api.revision,null);assert.equal(app.pack,original);assert.deepEqual(state.activations,['original']);assert.equal(state.writes,0);
});
test('palette is an actual multiselect and records only submitted selections of the current revision',async t=>{
 const {app,api}=fixture(t),revision='a'.repeat(64),colors=['#112233','#334455','#556677','#778899','#99AABB'];await api.preview(pack('draft'),revision,'background',locale);api.palette(colors,revision);
 const field=app.panelBody.querySelector('[data-palette]'),boxes=descendants(field).filter(n=>n.tag==='input');assert.equal(boxes.length,5);assert.ok(boxes.every(n=>n.type==='checkbox'));assert.equal(api.choice,null);
 const submit=descendants(field).find(n=>n.tag==='button');submit.onclick();assert.equal(api.choice,null);boxes[1].checked=true;boxes[3].checked=true;submit.onclick();assert.deepEqual(api.choice,{revision,colors:['#334455','#778899']});assert.equal(submit.textContent,'已记录选择');
 assert.throws(()=>api.palette(colors,'b'.repeat(64)),/stale/);await api.preview(pack('draft'),'c'.repeat(64),'background',locale);assert.equal(api.choice,null);
});
test('added language strings and direction reach preview controls without engine source changes',async t=>{
 const {app,api}=fixture(t),translated={...locale,locale:'fr',direction:'rtl',messages:{...locale.messages,'preview.notice':'Aperçu','preview.restore':'Restaurer','palette.title':'Couleurs','palette.confirm':'Valider','palette.recorded':'Enregistré'}};
 await api.preview(pack('draft'),'d'.repeat(64),'background',translated);const section=app.panelBody.children.at(-1);assert.equal(section.dir,'rtl');assert.ok(descendants(section).some(n=>n.textContent==='Restaurer'));api.palette(['#112233','#334455','#556677','#778899'],'d'.repeat(64));assert.ok(descendants(section).some(n=>n.textContent==='Valider'));
});
