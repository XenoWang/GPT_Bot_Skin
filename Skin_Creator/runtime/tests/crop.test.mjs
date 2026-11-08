import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fitImage,validateManifest,validatePack,requiredAssets} from '../renderer/core.mjs';
import {Appearance} from '../renderer/runtime.mjs';
import {readPack} from '../scripts/build.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);
const bg=asset=>({asset,blackOverlay:.7,subject:[.2,.1,.8,.95],fit:'cover-top',cropTop:.05,maxScale:1,blurFill:false});
const theme=()=>({schemaVersion:1,id:'crop-example',name:'裁剪示例',regions:{sidebar:{enabled:true,background:bg('assets/merged.png')}},sidebarLayout:{mode:'split',header:{...bg('assets/header.png'),blackOverlay:.5,fit:'cover',cropTop:undefined},body:bg('assets/split.png')}});

test('portrait removes approved top background and crops the remaining excess below',()=>{
 // 600x1800, remove 90 source pixels; width 300 requires 1/2 scale.
 // Full image is 300x900 at y=-45, so a 600px region crops 255px below.
 const f=fitImage(300,600,600,1800,[.2,.1,.8,.95],1,'cover-top',.05);
 close(f.scale,.5);close(f.width,300);close(f.height,900);close(f.x,0);close(f.y,-45);
 close(f.y+f.height-600,255);close(f.y+180*f.scale,45);
 // Taller region must cover the remaining 1710 source pixels, not leave a bottom gap.
 const tall=fitImage(300,900,600,1800,[.2,.1,.8,.95],1,'cover-top',.05);
 close(tall.scale,10/19);close(tall.y,-900/19);close(tall.y+tall.height,900);
});

test('header cover fills the full native area and portraits preserve their protected top',()=>{
 const h=fitImage(296,121,2172,724,[.14,.10,.985,.93],1,'cover');
 close(h.width,363);close(h.height,121);close(h.x,-56.1875);close(h.y,0);
 for(const [w,height]of [[296,587],[296,911],[250,500],[360,900]]){
  const f=fitImage(w,height,887,1774,[.16,.16,.86,.99],1,'cover-top',.08);
  assert.ok(f.scale<=1);close(f.width/f.height,.5);
  assert.ok(f.x<=1e-8&&f.x+f.width>=w-1e-8);assert.ok(f.y+f.height>=height-1e-8);
  assert.ok(f.y+.16*1774*f.scale>=0);
 }
});

test('independent split asset is required in both modes and unsafe crops are rejected',()=>{
 for(const mode of ['merged','split']){const m=theme();m.sidebarLayout.mode=mode;validateManifest(m);assert.deepEqual(requiredAssets(m),['assets/merged.png','assets/header.png','assets/split.png']);assert.throws(()=>validatePack({manifest:m,assets:{'assets/merged.png':'data:image/png;base64,AAAA','assets/header.png':'data:image/png;base64,AAAA'}}));}
 for(const cropTop of [-.1,.10001,NaN,'0.05']){const m=theme();m.sidebarLayout.body.cropTop=cropTop;assert.throws(()=>validateManifest(m));}
 const invalid=theme();invalid.sidebarLayout.body.asset='assets/../private.png';assert.throws(()=>validateManifest(invalid));
 const incompatible=theme();incompatible.sidebarLayout.body.fit='contain';assert.throws(()=>validateManifest(incompatible));
});

test('built-in sidebar uses independent clear images without touching the navigation rail',async()=>{
 const p=await readPack(new URL('../themes/kurumi-twilight/',import.meta.url));
 const merged=p.manifest.regions.sidebar.background,{header,body}=p.manifest.sidebarLayout;
 assert.notEqual(merged.asset,body.asset);assert.notEqual(p.assets[merged.asset],p.assets[body.asset]);
 for(const item of [merged,header,body])assert.equal(item.blurFill,false);
 assert.equal(merged.blackOverlay,.7);assert.equal(body.blackOverlay,.7);assert.equal(header.blackOverlay,.5);
 // This selector boundary is an explicit user requirement, based on the observed native DOM.
 const adapter=JSON.parse(await readFile(new URL('../adapters/codex-26.1103.json',import.meta.url),'utf8'));
 assert.deepEqual(adapter.regions.sidebar,['[data-sidebar-navigation-root]']);
 // Navigation color and vines are now authorized; portrait images still stay in the workspace sidebar.
 assert.equal(p.manifest.regions.navigation.background,undefined);
});

test('rendering selects the split image and restores merged image when the header disappears',t=>{
 class Node{
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.attrs={};this.dataset={};this.parentElement=null;}
  setAttribute(k,v){this.attrs[k]=v;}remove(){if(this.parentElement){const p=this.parentElement;p.children.splice(p.children.indexOf(this),1);this.parentElement=null;}}
  append(n){n.remove();n.parentElement=this;this.children.push(n);}prepend(n){n.remove();n.parentElement=this;this.children.unshift(n);}
 }
 const originals=new Map(['document','ResizeObserver','getComputedStyle'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 t.after(()=>{for(const [k,d]of originals){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 globalThis.document={createElement:tag=>new Node(tag)};globalThis.getComputedStyle=n=>({position:'relative',visibility:n.hidden?'hidden':'visible'});
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
 const zeroHeader={getBoundingClientRect:()=>({bottom:0,width:0,height:0})},hiddenHeader={hidden:true,getBoundingClientRect:()=>({bottom:165,width:300,height:121})},nativeHeader={getBoundingClientRect:()=>({bottom:165,width:300,height:121})},sidebar=new Node('sidebar'),rail=new Node('rail');let hasHeader=true;
 sidebar.clientWidth=300;sidebar.clientHeight=708;sidebar.getBoundingClientRect=()=>({top:44});sidebar.querySelectorAll=()=>hasHeader?[zeroHeader,hiddenHeader,nativeHeader]:[zeroHeader,hiddenHeader];
 const m=theme(),a=new Appearance({sidebarHeaderSelector:'.native-header'},{manifest:m});a.pack={manifest:m,assets:{'assets/merged.png':'merged-image','assets/header.png':'header-image','assets/split.png':'split-image'}};a.dimensions={'assets/merged.png':[600,1800],'assets/header.png':[900,300],'assets/split.png':[600,1200]};
 a.mountBackground(sidebar,'sidebar',m.regions.sidebar.background);const mounted=a.mounted.get(sidebar),part=name=>mounted.layer.children.find(n=>n.attrs['data-codex-appearance-part']===name);
 assert.equal(mounted.layer.parentElement,sidebar);assert.deepEqual(rail.children,[]);assert.deepEqual(rail.attrs,{});
 assert.equal(mounted.layer.dataset.bodyAsset,'assets/split.png');assert.equal(part('body').style.display,'none');assert.equal(part('split-body').style.height,'587px');
 for(const name of ['body','split-body','header'])assert.equal(part(name).children.filter(n=>n.tag==='img').length,1);
 m.sidebarLayout.mode='merged';mounted.update();assert.equal(mounted.layer.dataset.bodyAsset,'assets/merged.png');assert.equal(part('split-body').style.display,'none');assert.equal(part('body').style.height,'708px');
 m.sidebarLayout.mode='split';hasHeader=false;mounted.update();assert.equal(mounted.layer.dataset.bodyAsset,'assets/merged.png');assert.equal(part('header').style.display,'none');assert.equal(mounted.layer.dataset.layoutFallback,'true');
});
