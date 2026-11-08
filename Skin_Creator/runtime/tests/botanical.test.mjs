import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateManifest,validatePack,requiredAssets,declarations,decorationCss} from '../renderer/core.mjs';
import {Appearance} from '../renderer/runtime.mjs';
const current=async()=>JSON.parse(await readFile(new URL('../themes/kurumi-twilight/manifest.json',import.meta.url),'utf8'));
const example=()=>({schemaVersion:1,id:'botanical-example',name:'花藤',regions:{navigation:{enabled:true,gradient:{angle:180,stops:[{color:'#1E0710',at:0},{color:'#0D060A',at:1}]},ornament:{pattern:'image',asset:'assets/vine.png',orientation:'vertical',opacity:.65,scale:1}}}});

test('only user bubbles are styled while popups and change summary use restrained gold',async()=>{
 const m=validateManifest(await current());assert.equal(m.regions.userMessages.enabled,true);assert.equal(m.regions.userMessages.style.surface,'#A71032');
 assert.equal(m.regions.assistantMessages.enabled,false);assert.deepEqual(m.regions.assistantMessages.style,{});
 for(const name of ['dialogs','menus','tooltips']){const r=m.regions[name];assert.equal(r.enabled,true);assert.equal(r.style.border,'#C29B52');assert.equal(r.style.borderOpacity,.45);assert.equal(r.style.borderWidth,1);assert.ok(r.style.surfaceOpacity>=.9);assert.equal(r.style.text,undefined);}
 const summary=m.regions.changeSummary.style;assert.equal(summary.surface,'#050509');assert.equal(summary.surfaceOpacity,.25);assert.equal(summary.border,'#C29B52');assert.equal(summary.borderOpacity,.45);assert.equal(summary.text,undefined);
 assert.deepEqual(m.hover,{surface:'#A71032',surfaceOpacity:.6});assert.equal(m.regions.composer.style.surface,'#000000');
 const adapter=JSON.parse(await readFile(new URL('../adapters/codex-26.1103.json',import.meta.url),'utf8'));
 assert.deepEqual(adapter.regions.changeSummary,['.bg-surface-elevated-secondary:has(> [data-above-composer-fixed-content-portal])',"div:has(> [class~='group/turn-diff-header'])"]);
 assert.ok(adapter.regions.menus.includes("div[role='presentation'].bg-surface-elevated-secondary.shadow-lg"));assert.ok(!adapter.regions.menus.includes('[role="presentation"]'));
 assert.ok(adapter.hoverTargets.some(s=>s.startsWith("[data-codex-appearance~='menus']")));
});

test('independent surface and gold-border alpha never dim foreground text',()=>{
 const css=declarations({surface:'#050509',surfaceOpacity:.25,border:'#C29B52',borderOpacity:.45,borderWidth:1});
 assert.match(css,/background-color:rgba\(5,5,9,0.25\)!important/);assert.match(css,/border-color:rgba\(194,155,82,0.45\)!important/);assert.match(css,/border-width:1px/);
 assert.doesNotMatch(css,/(^|;)opacity:|(^|;)color:|font-/);
 assert.match(declarations({border:'#FFFFFF',borderWidth:1}),/border-color:#FFFFFF!important/);
});

test('raster ornaments require safe local assets and border opacity requires a color',()=>{
 const m=validateManifest(example());assert.deepEqual(requiredAssets(m),['assets/vine.png']);assert.throws(()=>validatePack({manifest:m,assets:{}}));
 assert.throws(()=>validatePack({manifest:m,assets:{'assets/vine.png':'https://example.com/vine.png'}}));
 for(const path of ['https://example.com/vine.png','assets/../private.png','assets/vine.svg']){const invalid=example();invalid.regions.navigation.ornament.asset=path;assert.throws(()=>validateManifest(invalid));}
 const extra=example();extra.regions.navigation.ornament.svg='<svg/>';assert.throws(()=>validateManifest(extra));
 for(const alpha of [-.1,1.1,NaN,'0.45']){const invalid=example();invalid.regions.navigation.style={border:'#C29B52',borderOpacity:alpha};assert.throws(()=>validateManifest(invalid));}
 const orphan=example();orphan.regions.navigation.style={borderOpacity:.45};assert.throws(()=>validateManifest(orphan));
});

test('high-resolution alpha ornaments keep the previously approved gradients',async()=>{
 const m=await current(),stops=[{color:'#1E0710',at:0},{color:'#410819',at:.48},{color:'#0D060A',at:1}];
 for(const [name,angle,orientation]of [['navigation',180,'vertical'],['titlebar',90,'horizontal']]){
  const r=m.regions[name];assert.deepEqual(r.gradient,{angle,stops});assert.equal(r.ornament.pattern,'image');assert.equal(r.ornament.orientation,orientation);
  const bytes=await readFile(new URL('../themes/kurumi-twilight/'+r.ornament.asset,import.meta.url));assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);assert.equal(bytes[25],6);assert.ok(Math.min(w,h)>=512);assert.equal(orientation==='vertical'?h/w:w/h,3);
 }
 assert.notEqual(m.regions.navigation.ornament.asset,m.regions.titlebar.ornament.asset);
});

function environment(t){
 class Node{
  constructor(tag){this.tag=tag;this.children=[];this.parentElement=null;this.style={};this.attrs={};this.textContent='';this.isConnected=true;}
  setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}closest(){return null;}
  prepend(n){n.remove();n.parentElement=this;this.children.unshift(n);}append(n){n.remove();n.parentElement=this;this.children.push(n);}
  remove(){if(this.parentElement){const p=this.parentElement;p.children.splice(p.children.indexOf(this),1);this.parentElement=null;}}
 }
 const originals=new Map(['document','getComputedStyle'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));t.after(()=>{for(const [k,d]of originals){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 globalThis.document={createElement:tag=>new Node(tag),querySelector:()=>({}),querySelectorAll:()=>[]};globalThis.getComputedStyle=()=>({position:'static'});
 const a=new Appearance({gate:'shell',regions:{},transparentSurfaces:{}},{manifest:{id:'fixture'}});a.style=new Node('style');a.diagnostics=new Node('status');a.syncManager=()=>{};a.panelBaseCss='native-panel';a.panelStyles=[new Node('style')];return {a,Node};
}

test('raster translucency belongs to the ornament layer and preserves the gradient and controls',t=>{
 const {a,Node}=environment(t),native=new Node('nav'),profile=new Node('profile');native.append(profile);const rule=validateManifest(example()).regions.navigation;
 a.pack={assets:{'assets/vine.png':'data:image/png;base64,AAAA'}};a.tag(native,'navigation');a.mountDecoration(native,'navigation',rule);
 const layer=a.mounted.get(native).layer,art=layer.children[0];assert.match(layer.style.backgroundImage,/linear-gradient/);assert.doesNotMatch(layer.style.backgroundImage,/data:image/);assert.equal(layer.style.opacity,undefined);
 assert.equal(art.style.opacity,'0.65');assert.match(art.style.backgroundImage,/data:image\/png;base64,AAAA/);assert.equal(art.style.backgroundRepeat,'repeat-y');assert.match(art.style.cssText,/pointer-events:none/);assert.deepEqual(native.children,[layer,profile]);
 a.clear();assert.deepEqual(native.children,[profile]);assert.equal(native.getAttribute('data-codex-appearance-bg'),null);
});

test('assistant stays unmarked and manager popup colors are removed with the theme',async t=>{
 const {a,Node}=environment(t),m=await current(),user=new Node('user'),assistant=new Node('assistant');assistant.style.backgroundColor='transparent';assistant.style.padding='0px';
 a.adapter.regions={userMessages:['.user'],assistantMessages:['.assistant'],dialogs:[],changeSummary:[]};document.querySelectorAll=s=>s==='.user'?[user]:s==='.assistant'?[assistant]:[];
 a.pack={manifest:{regions:Object.fromEntries(['userMessages','assistantMessages','dialogs','changeSummary'].map(k=>[k,m.regions[k]]))}};a.refresh();
 assert.equal(user.getAttribute('data-codex-appearance'),'userMessages');assert.equal(assistant.getAttribute('data-codex-appearance'),null);assert.equal(assistant.style.backgroundColor,'transparent');assert.equal(assistant.style.padding,'0px');assert.doesNotMatch(a.style.textContent,/appearance~="assistantMessages"/);
 assert.match(a.panelStyles[0].textContent,/dialog\{background-color:rgba\(22,9,15,0.96\)/);assert.match(a.panelStyles[0].textContent,/border-color:rgba\(194,155,82,0.45\)/);
 assert.match(a.panelStyles[0].textContent,/button,select,input\[type=number\]\{background-color:rgba\(22,9,15,0.96\)/);
 a.clear();a.pack=null;a.refresh();assert.equal(a.style.textContent,'');assert.equal(a.panelStyles[0].textContent,'native-panel');
});

test('change-card row surfaces become transparent without dimming change numbers',async t=>{
 const {a,Node}=environment(t),m=await current(),card=new Node('card'),row=new Node('row'),added=new Node('added');added.style.color='rgb(0, 170, 100)';row.append(added);card.append(row);card.querySelectorAll=s=>s==='.change-row'?[row]:[];
 a.adapter.regions={changeSummary:['.change-card']};a.adapter.transparentSurfaces={changeSummary:['.change-row']};document.querySelectorAll=s=>s==='.change-card'?[card]:[];
 a.pack={manifest:{regions:{changeSummary:m.regions.changeSummary}}};a.refresh();
 assert.equal(card.getAttribute('data-codex-appearance'),'changeSummary');assert.equal(row.getAttribute('data-codex-appearance-clear'),'');assert.equal(added.style.color,'rgb(0, 170, 100)');assert.equal(added.getAttribute('data-codex-appearance-clear'),null);
 assert.match(a.style.textContent,/background-color:rgba\(5,5,9,0.25\)/);assert.match(a.style.textContent,/border-color:rgba\(194,155,82,0.45\)/);assert.equal(card.style.opacity,undefined);
 a.clear();assert.equal(row.getAttribute('data-codex-appearance-clear'),null);assert.deepEqual(card.children,[row]);assert.deepEqual(row.children,[added]);
});
