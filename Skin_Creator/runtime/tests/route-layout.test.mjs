import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chatSceneFit,sidebarsCollapsed,topbarGap,transcriptClipBottom,transcriptFadeStops,panoramaFit,validateManifest,validatePack,requiredAssets,declarations} from '../renderer/core.mjs';
import {Appearance} from '../renderer/runtime.mjs';
const adapter=async()=>JSON.parse(await readFile(new URL('../adapters/codex-26.1103.json',import.meta.url),'utf8'));
const background=()=>({asset:'assets/original.png',blackOverlay:.5,subject:[325/1536,10/1024,1190/1536,1000/1024],fit:'subject-safe',maxScale:1,blurFill:true});
const theme=()=>({schemaVersion:1,id:'route-example',name:'布局示例',regions:{chat:{enabled:true,background:background()}},chatLayout:{leftExtension:'assets/left.png'}});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`);

test('observed native boundaries isolate avatar, transparent tabs, home input and Dot user messages',async()=>{
 const a=await adapter();
 assert.equal(a.profileAvatarSlot,"[data-disabled][data-radix-collection-item] [data-menu-row-content] > [data-leading-icon-slot]:has(> img.rounded-full.size-5)");
 assert.deepEqual(a.regions.rightPanel,["aside[data-app-shell-focus-area='right-panel']"]);
 assert.deepEqual(a.regions.composer,["[data-composer-surface-variant]:not([data-composer-utility-bar-variant='home'])","[data-composer-utility-bar-variant='home'] > [data-composer-body]"]);
 assert.ok(a.regions.userMessages.includes('.messaging-embedded .message-row.self div.message-bubble'));
 assert.ok(a.transparentSurfaces.chat.includes('.messaging-root.messaging-embedded'));assert.ok(a.transparentSurfaces.chat.includes('.thread-pane'));
 assert.ok(a.observedAttributes.includes('data-app-shell-sidebar-open'));assert.ok(a.observedAttributes.includes('data-composer-utility-bar-variant'));assert.ok(!a.observedAttributes.some(x=>x.startsWith('data-codex-appearance')));
});

test('left extension requires both known sidebars closed and a safe original-plus-extension pack',()=>{
 for(const [left,right,wanted]of [[false,false,true],[false,true,false],[true,false,false],[true,true,false],[undefined,false,false],[false,undefined,false],['false',false,false]])assert.equal(sidebarsCollapsed(left,right),wanted);
 const m=validateManifest(theme());assert.deepEqual(requiredAssets(m),['assets/original.png','assets/left.png']);
 assert.throws(()=>validatePack({manifest:m,assets:{'assets/original.png':'data:image/png;base64,AAAA'}}));
 for(const asset of ['https://example.com/a.png','assets/../private.png','assets/a.svg']){const bad=theme();bad.chatLayout.leftExtension=asset;assert.throws(()=>validateManifest(bad));}
 const orphan=theme();delete orphan.regions.chat.background;assert.throws(()=>validateManifest(orphan));
});

test('approved original stays byte-identical and the active panorama is one complete asset',async()=>{
 const m=JSON.parse(await readFile(new URL('../themes/kurumi-twilight/manifest.json',import.meta.url),'utf8'));
 assert.equal(m.regions.chat.background.asset,'assets/chat-panorama.png');assert.deepEqual(m.chatLayout,{mode:'panorama'});assert.equal(m.regions.chat.background.blurFill,false);
 const original=await readFile(new URL('../themes/kurumi-twilight/assets/chat.png',import.meta.url));
 // Fingerprint of the user-approved original, preserved in the preceding executed freeze.
 assert.equal(createHash('sha256').update(original).digest('hex'),'067aca34c61d9180154a1ea5a4821bb5d3d1ec9d536b8c349412f04fa29001c5');
});

test('same viewport keeps the original scene at the same screen coordinate while the pane opens',()=>{
 // Native frame: rail 52 + retained sidebar 296 = reference left 348; right 1338.
 // Height 708 / source 1024 = 0.69140625, width 1062; centered in 990 gives world x 312.
 const shared={paneRight:1338,referenceLeft:348,height:708,sourceWidth:1536,sourceHeight:1024,subject:background().subject};
 for(const paneLeft of [348,349,200,52]){const f=chatSceneFit({...shared,paneLeft});close(f.scale,.69140625);close(f.width,1062);close(f.height,708);close(paneLeft+f.x,312);close(f.y,0);}
 // A separate hand-computed square case checks that a real window resize can adapt.
 const resized=chatSceneFit({paneLeft:100,paneRight:1400,referenceLeft:400,height:700,sourceWidth:1000,sourceHeight:1000,subject:[0,0,1,1],fit:'contain'});
 close(resized.scale,.7);close(resized.width,700);close(100+resized.x,550);
 assert.throws(()=>chatSceneFit({...shared,paneLeft:1400}));
});

function environment(t){
 const all=[],queries=new Map(),raf=[],observers=[];
 const events=()=>({listeners:new Map(),addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);},removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);},emit(type){for(const fn of this.listeners.get(type)??[])fn();}});
 const cssStyle=()=>({values:new Map(),priorities:new Map(),getPropertyValue(k){return this.values.get(k)??'';},getPropertyPriority(k){return this.priorities.get(k)??'';},setProperty(k,v,p=''){this.values.set(k,v);this.priorities.set(k,p);},removeProperty(k){this.values.delete(k);this.priorities.delete(k);}});
 class Node{
  constructor(tag){this.tag=tag;this.nodeType=1;this.children=[];this.parentElement=null;this.style=cssStyle();this.attrs={};this.dataset={};this.textContent='';this.isConnected=true;this.clientWidth=0;this.clientHeight=0;this.queries=new Map();this.selectors=new Set();Object.assign(this,events());all.push(this);}
  setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
  closest(s){for(let n=this;n;n=n.parentElement)if(n.selectors.has(s)||(s==='[data-codex-appearance-owned]'&&n.getAttribute('data-codex-appearance-owned')!==null))return n;return null;}
  contains(n){for(let p=n;p;p=p.parentElement)if(p===this)return true;return false;}
  append(n){n.remove();n.parentElement=this;this.children.push(n);}prepend(n){n.remove();n.parentElement=this;this.children.unshift(n);}
  insertBefore(n,anchor){assert.equal(anchor.parentElement,this);n.remove();n.parentElement=this;this.children.splice(this.children.indexOf(anchor),0,n);}
  remove(){if(this.parentElement){const p=this.parentElement;p.children.splice(p.children.indexOf(this),1);this.parentElement=null;}}
  querySelector(s){const v=this.queries.get(s);return Array.isArray(v)?v[0]??null:v??null;}querySelectorAll(s){const v=this.queries.get(s);return Array.isArray(v)?v:v?[v]:[];}
  getBoundingClientRect(){return this.rect??this.parentElement?.getBoundingClientRect()??{left:0,right:0,top:0,bottom:0,width:0,height:0};}
 }
 const originals=new Map(['document','window','getComputedStyle','ResizeObserver','requestAnimationFrame'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));t.after(()=>{for(const [k,d]of originals){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 globalThis.window=events();
 globalThis.document={createElement:tag=>new Node(tag),querySelector:()=>({}),querySelectorAll:s=>s==='[data-codex-appearance]'?all.filter(n=>n.isConnected&&n.getAttribute('data-codex-appearance')!==null):(queries.get(s)??[])};
 globalThis.getComputedStyle=()=>({position:'relative'});globalThis.requestAnimationFrame=fn=>{raf.push(fn);return raf.length;};
 globalThis.ResizeObserver=class{constructor(fn){this.fn=fn;this.watched=new Set();observers.push(this);}observe(n){this.watched.add(n);}unobserve(n){this.watched.delete(n);}disconnect(){this.watched.clear();}};
 const a=new Appearance({gate:'shell',regions:{},transparentSurfaces:{}},{manifest:{id:'fixture'}});a.style=new Node('style');a.diagnostics=new Node('status');a.syncManager=()=>{};a.panelBaseCss='base';a.panelStyles=[];
 return {a,Node,queries,raf,observers};
}

test('runtime keeps the original image node and exposes sharp scenery only with both bars closed',t=>{
 const {a,Node}=environment(t),frame=new Node('frame'),rail=new Node('rail'),sidebar=new Node('sidebar'),chat=new Node('chat');frame.selectors.add('frame');frame.append(rail);frame.append(sidebar);frame.append(chat);frame.queries.set('rail',rail);frame.queries.set('sidebar',sidebar);rail.rect={right:52};sidebar.clientWidth=296;
 a.adapter.chatLayoutState={frame:'frame',rail:'rail',sidebar:'sidebar',leftOpen:'left-open',rightOpen:'right-open',responsive:'responsive'};frame.setAttribute('left-open','true');frame.setAttribute('right-open','false');frame.setAttribute('responsive','false');
 const box=left=>{chat.rect={left,right:1338,top:44,bottom:752,width:1338-left,height:708};chat.clientWidth=1338-left;chat.clientHeight=708;};box(348);
 const m=theme();a.pack={manifest:m,assets:{'assets/original.png':'original-image','assets/left.png':'left-scenery'}};a.dimensions={'assets/original.png':[1536,1024],'assets/left.png':[1024,1536]};a.mountBackground(chat,'chat',m.regions.chat.background);
 const mounted=a.mounted.get(chat),pane=mounted.layer.children.find(n=>n.getAttribute('data-codex-appearance-part')==='body'),art=pane.children.find(n=>n.getAttribute('data-codex-appearance-image')==='foreground'),blur=pane.children.find(n=>n.style.cssText?.includes('filter:blur')),fill=pane.children.find(n=>n.getAttribute('data-codex-appearance-part')==='extension-fill');
 close(parseFloat(art.style.left)+348,312);assert.equal(art.src,'original-image');assert.equal(fill.style.display,'none');
 frame.setAttribute('left-open','false');box(52);mounted.update();
 close(parseFloat(art.style.left)+52,312);close(parseFloat(art.style.width),1062);assert.equal(art.src,'original-image');assert.equal(fill.src,'left-scenery');assert.equal(fill.style.display,'block');assert.equal(blur.style.display,'none');assert.doesNotMatch(fill.style.cssText,/filter:blur/);assert.equal(mounted.layer.dataset.chatMode,'left-extended');assert.ok(mounted.ro.watched.has(sidebar));
 frame.setAttribute('right-open','true');mounted.update();assert.equal(fill.style.display,'none');assert.equal(blur.style.display,'');close(parseFloat(art.style.left)+52,312);
 a.adapter.chatLayoutState.pageSidebar='page-sidebar';frame.setAttribute('page-sidebar','false');frame.setAttribute('left-open','true');frame.setAttribute('right-open','false');mounted.update();assert.equal(fill.style.display,'block');assert.equal(mounted.layer.dataset.chatMode,'left-extended');close(parseFloat(art.style.left)+52,312);
 frame.setAttribute('page-sidebar','true');mounted.update();assert.equal(fill.style.display,'none');
 assert.equal(pane.children.filter(n=>n.style.cssText?.includes('background:rgba(0,0,0,0.5)')).length,1);
});

test('connected composer nodes lose their old mark when home moves the surface into its body',t=>{
 const {a,Node,queries}=environment(t),outer=new Node('outer'),inner=new Node('inner');outer.append(inner);outer.style.backgroundColor='transparent';
 a.adapter.regions={composer:['surface']};a.pack={manifest:{regions:{composer:{enabled:true,style:{surface:'#000000'}}}}};queries.set('surface',[outer]);a.refresh();assert.equal(outer.getAttribute('data-codex-appearance'),'composer');
 queries.set('surface',[inner]);a.refresh();assert.equal(outer.getAttribute('data-codex-appearance'),null);assert.equal(inner.getAttribute('data-codex-appearance'),'composer');assert.equal(outer.style.backgroundColor,'transparent');assert.deepEqual(outer.children,[inner]);
});

test('returning legacy nodes shed orphan owned markers but keep unrelated tokens',t=>{
 const {a,Node}=environment(t),old=new Node('cached');old.setAttribute('data-codex-appearance','composer foreign');old.setAttribute('data-codex-appearance-bg','');old.setAttribute('data-codex-appearance-static','');
 a.adapter.regions={composer:['current-surface']};a.pack={manifest:{regions:{composer:{enabled:true,style:{surface:'#000000'}}}}};a.refresh();
 assert.equal(old.getAttribute('data-codex-appearance'),'foreign');assert.equal(old.getAttribute('data-codex-appearance-bg'),null);assert.equal(old.getAttribute('data-codex-appearance-static'),null);
});

test('stale decoration and transparent shell markers are removed without removing native children',t=>{
 const {a,Node,queries}=environment(t),nav=new Node('nav'),profile=new Node('profile'),surface=new Node('surface'),shell=new Node('dot-shell');nav.append(profile);surface.append(shell);surface.queries.set('shell',[shell]);
 a.adapter.regions={navigation:['nav'],chat:['surface']};a.adapter.transparentSurfaces={chat:['shell']};a.pack={manifest:{regions:{navigation:{enabled:true,gradient:{angle:180,stops:[{color:'#100000',at:0},{color:'#000000',at:1}]}},chat:{enabled:true,style:{surface:'#000000'}}}}};queries.set('nav',[nav]);queries.set('surface',[surface]);a.refresh();assert.equal(nav.children.length,2);assert.equal(shell.getAttribute('data-codex-appearance-clear'),'');
 queries.set('nav',[]);surface.queries.set('shell',[]);a.refresh();assert.deepEqual(nav.children,[profile]);assert.equal(nav.getAttribute('data-codex-appearance-bg'),null);assert.equal(shell.getAttribute('data-codex-appearance-clear'),null);assert.deepEqual(surface.children,[shell]);
});

test('native layout mutations schedule one refresh and owned mutations do not loop',t=>{
 const {a,Node,raf}=environment(t),native=new Node('native'),owned=new Node('owned');owned.setAttribute('data-codex-appearance-owned','background');let count=0;a.refresh=()=>count++;
 a.onMutations([{type:'attributes',target:native}]);a.onMutations([{type:'attributes',target:native}]);assert.equal(raf.length,1);raf[0]();assert.equal(count,1);assert.equal(a.scheduled,0);
 a.onMutations([{type:'attributes',target:owned}]);a.onMutations([{type:'childList',addedNodes:[owned],removedNodes:[]}]);assert.equal(raf.length,1);
 a.onMutations([{type:'childList',addedNodes:[native],removedNodes:[]}]);assert.equal(raf.length,2);
});

test('avatar sizing is menu-scoped, enabled only with that theme region and removed on restore',async t=>{
 const {a}=environment(t),native=await adapter();a.adapter.profileAvatarSlot=native.profileAvatarSlot;a.adapter.regions={menus:[]};a.pack={manifest:{regions:{menus:{enabled:true,style:{surface:'#13090D'}}}}};a.refresh();
 assert.ok(a.style.textContent.includes('[data-codex-appearance~="menus"] '+native.profileAvatarSlot+'{--icon-leading-size:calc(var(--spacing,4px)*5)!important}'));
 assert.doesNotMatch(a.style.textContent,/img\s*\{.*(?:width|height|border-radius)/);
 a.pack.manifest.regions.menus.enabled=false;a.refresh();assert.doesNotMatch(a.style.textContent,/--icon-leading-size/);
 a.clear();a.pack=null;a.refresh();assert.equal(a.style.textContent,'');
});

test('topbar extension fills only the measured common gap and refuses unknown geometry',()=>{
 assert.equal(topbarGap(36,[44,44]),8);assert.equal(topbarGap(40,[52]),12);
 assert.equal(topbarGap(36,[36,44]),0);assert.equal(topbarGap(36,[20,44]),0);
 assert.equal(topbarGap(36,[]),0);assert.equal(topbarGap(36,[NaN]),0);assert.equal(topbarGap(36,[200]),0);
});

test('topbar gap changes only its owned background and follows layout updates',t=>{
 const {a,Node}=environment(t),frame=new Node('frame'),bar=new Node('bar'),button=new Node('button'),content=new Node('content');frame.selectors.add('frame');frame.append(bar);frame.append(content);bar.append(button);
 bar.rect={left:0,right:1338,top:0,bottom:36,width:1338,height:36};content.rect={left:348,right:1338,top:44,bottom:752,width:990,height:708};frame.queries.set('content',[content]);a.adapter.titlebarGap={scope:'frame',references:['content'],maxGap:32};
 a.tag(bar,'titlebar');a.mountDecoration(bar,'titlebar',{gradient:{angle:90,stops:[{color:'#1E0710',at:0},{color:'#0D060A',at:1}]}});const v=a.mounted.get(bar);
 assert.equal(v.layer.style.bottom,'-8px');assert.equal(bar.rect.height,36);assert.equal(bar.style.height,undefined);assert.deepEqual(bar.children,[v.layer,button]);assert.match(v.layer.style.cssText,/pointer-events:none/);assert.ok(v.ro.watched.has(content));
 assert.match(v.layer.style.cssText,/-webkit-app-region:initial!important/);
 content.rect.top=48;content.rect.height=704;v.update();assert.equal(v.layer.style.bottom,'-12px');content.rect.top=36;content.rect.height=716;v.update();assert.equal(v.layer.style.bottom,'0px');
 a.clear();assert.deepEqual(bar.children,[button]);assert.equal(v.ro.watched.size,0);
});

test('shared titlebar scene fills the measured gap while ignoring cached reference surfaces',t=>{
 const {a,Node}=environment(t),globals=new Map(['innerWidth','innerHeight','devicePixelRatio'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));t.after(()=>{for(const[k,d]of globals){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 globalThis.innerWidth=1338;globalThis.innerHeight=752;globalThis.devicePixelRatio=1;globalThis.getComputedStyle=n=>({position:'relative',visibility:n.hidden?'hidden':'visible'});
 const frame=new Node('frame'),bar=new Node('bar'),button=new Node('button'),content=new Node('content'),hidden=new Node('content'),zero=new Node('content'),inert=new Node('content');frame.selectors.add('frame');frame.append(bar);bar.append(button);
 bar.rect={left:0,right:1338,top:0,bottom:36,width:1338,height:36};bar.clientWidth=1338;bar.clientHeight=36;
 content.rect={left:348,right:1338,top:44,bottom:752,width:990,height:708};
 hidden.rect={left:0,top:0,width:100,height:100};hidden.hidden=true;zero.rect={left:0,top:0,width:0,height:0};inert.rect={left:0,top:0,width:100,height:100};inert.selectors.add('[inert],[aria-hidden="true"]');
 frame.queries.set('content',[hidden,zero,inert,content]);a.adapter.titlebarGap={scope:'frame',references:['content'],maxGap:32};
 const bg={asset:'assets/shared.png',blackOverlay:.12,subject:[.4,.2,.6,.8],fit:'subject-safe',maxScale:1,blurFill:false};a.pack={manifest:{regions:{titlebar:{enabled:true}},scene:{scope:'window',regions:['titlebar'],background:bg}},assets:{'assets/shared.png':'scene-image'}};a.dimensions={'assets/shared.png':[2676,1504]};
 a.mountBackground(bar,'titlebar',bg,true);const mounted=a.mounted.get(bar);
 assert.equal(mounted.layer.style.bottom,'-8px');assert.equal(bar.clientHeight,36);assert.equal(bar.style.height,undefined);assert.equal(mounted.layer.dataset.sceneCovered,'true');
 assert.match(mounted.layer.style.cssText,/-webkit-app-region:initial!important/);
 content.rect.top=48;mounted.update();assert.equal(mounted.layer.style.bottom,'-12px');
 content.rect.top=36;mounted.update();assert.equal(mounted.layer.style.bottom,'0px');
 a.clear();assert.deepEqual(bar.children,[button]);assert.equal(window.listeners.get('resize').size,0);
});

test('footer masks clear with the chat background while the input keeps its black surface',async t=>{
 const {a,Node,queries}=environment(t),native=await adapter(),chat=new Node('chat'),fade=new Node('fade'),solid=new Node('solid'),input=new Node('input');chat.append(fade);chat.append(solid);chat.append(input);
 a.adapter.regions={chat:['chat'],composer:['input']};a.adapter.transparentSurfaces=native.transparentSurfaces;
 chat.queries.set('.background-uNUrfY.pointer-events-none',[fade,solid]);queries.set('chat',[chat]);queries.set('input',[input]);
 a.pack={manifest:{regions:{chat:{enabled:true,style:{surface:'#13090D'}},composer:{enabled:true,style:{surface:'#000000'}}}}};a.refresh();
 assert.equal(fade.getAttribute('data-codex-appearance-clear'),'');assert.equal(solid.getAttribute('data-codex-appearance-clear'),'');assert.equal(input.getAttribute('data-codex-appearance-clear'),null);assert.equal(input.getAttribute('data-codex-appearance'),'composer');
 assert.match(a.style.textContent,/background-color:rgba\(0,0,0,1\)!important/);
 a.pack.manifest.regions.chat.enabled=false;a.refresh();assert.equal(fade.getAttribute('data-codex-appearance-clear'),null);assert.equal(solid.getAttribute('data-codex-appearance-clear'),null);assert.deepEqual(chat.children,[fade,solid,input]);
});

test('rounded sidebar backplate follows the navigation gradient and leaves native shape unchanged',async t=>{
 const {a}=environment(t),native=await adapter();a.adapter.regions={navigation:[]};a.adapter.gradientBackplates=native.gradientBackplates;
 a.pack={manifest:{regions:{navigation:{enabled:true,gradient:{angle:90,stops:[{color:'#1E0710',at:0},{color:'#410819',at:1}]}}}}};a.refresh();
 assert.ok(a.style.textContent.includes("[data-app-shell-left-panel-appearance]:has([data-codex-appearance~='navigation']){background-image:linear-gradient(90deg,#1E0710 0%,#410819 100%)!important;"));
 assert.ok(a.style.textContent.includes('background-size:max(0px,calc(100% - var(--app-shell-navigation-rail-width,52px))) 100%!important'));assert.ok(a.style.textContent.includes(':dir(rtl){background-position:left top!important}'));
 assert.doesNotMatch(a.style.textContent,/border-radius:|width:|height:/);
 a.pack.manifest.regions.navigation.enabled=false;a.refresh();assert.doesNotMatch(a.style.textContent,/background-image:linear-gradient/);a.clear();assert.equal(a.style.textContent,'');
});

test('module and code-block defaults use background alpha without changing message or syntax colors',async()=>{
 const m=validateManifest(JSON.parse(await readFile(new URL('../themes/kurumi-twilight/manifest.json',import.meta.url),'utf8')));
 for(const [name,alpha]of [['pageHeaders',.68],['pageCards',.58],['settings',.72],['codeBlocks',.7],['userMessages',.7]]){
  assert.equal(m.regions[name].enabled,true);assert.equal(m.regions[name].style.surfaceOpacity,alpha);
  for(const key of ['text','fontFamily','fontSize','lineHeight'])assert.equal(m.regions[name].style[key],undefined);
 }
 assert.equal(m.regions.codeBlocks.style.surface,'#050509');assert.equal(m.regions.codeBlocks.style.border,'#C29B52');assert.equal(m.regions.codeBlocks.style.borderWidth,1);assert.equal(m.regions.assistantMessages.enabled,false);
 assert.match(declarations(m.regions.codeBlocks.style),/background-color:rgba\(5,5,9,0.7\)!important/);
 const unsafe={schemaVersion:1,id:'unsafe-module',name:'Unsafe',regions:{pageCards:{enabled:true,style:{surface:'#19080F'},css:'body{}'}}};assert.throws(()=>validateManifest(unsafe));
 const legacy={schemaVersion:1,id:'legacy-module',name:'Legacy',regions:{chat:{enabled:true,style:{surface:'#000000'}}}};assert.equal(validateManifest(legacy).id,'legacy-module');
 const native=await adapter();assert.ok(native.regions.settings.every(s=>s.includes("[class~='group/settings']")&&!s.includes('data-settings-panel-slug')));assert.ok(native.regions.codeBlocks.some(s=>s.includes('[data-code-block]')));
 assert.equal(native.chatLayoutState.pageSidebar,'data-app-shell-page-sidebar');assert.ok(native.observedAttributes.includes('data-app-shell-page-sidebar'));
});

test('module header pseudo-backgrounds and project hover remain scoped and are removed when disabled',async t=>{
 const {a,Node,queries}=environment(t),native=await adapter(),header=new Node('header'),card=new Node('card'),label=new Node('label');label.style.color='rgb(220,220,220)';card.append(label);
 a.adapter.regions={pageHeaders:['header'],pageCards:['card']};a.adapter.transparentPseudoSurfaces=native.transparentPseudoSurfaces;a.adapter.hoverPseudoTargets=native.hoverPseudoTargets;queries.set('header',[header]);queries.set('card',[card]);
 a.pack={manifest:{regions:{pageHeaders:{enabled:true,style:{surface:'#1E0710',surfaceOpacity:.68}},pageCards:{enabled:true,style:{surface:'#19080F',surfaceOpacity:.58}}},hover:{surface:'#A71032',surfaceOpacity:.6}}};a.refresh();
 assert.ok(a.style.textContent.includes('[data-codex-appearance~="pageHeaders"]::before{background-color:transparent!important;background-image:none!important}'));
 assert.ok(a.style.textContent.includes('[data-app-shell-frame] [data-project-row]:hover::before{background-color:rgba(167,16,50,0.6)!important}'));
 assert.equal(label.style.color,'rgb(220,220,220)');assert.equal(card.style.opacity,undefined);assert.equal(header.style.height,undefined);assert.equal(label.getAttribute('data-codex-appearance'),null);
 a.pack.manifest.regions.pageHeaders.enabled=false;delete a.pack.manifest.hover;a.refresh();assert.equal(header.getAttribute('data-codex-appearance'),null);assert.doesNotMatch(a.style.textContent,/pageHeaders|project-row/);
 a.clear();assert.deepEqual(card.children,[label]);assert.equal(a.style.textContent,'');
});

test('black-gold code blocks remove native gray layers without changing syntax or copy controls',async t=>{
 const {a,Node,queries}=environment(t),native=await adapter(),block=new Node('code-block'),bar=new Node('action-bar'),copy=new Node('copy'),source=new Node('source');source.style.color='rgb(170,60,200)';bar.append(copy);block.append(bar);block.append(source);
 a.adapter.regions={codeBlocks:['block']};a.adapter.transparentSurfaces={codeBlocks:native.transparentSurfaces.codeBlocks};a.adapter.clearSurfaceImages=native.clearSurfaceImages;block.queries.set(':scope > .ActionBar-KWWAct',[bar]);queries.set('block',[block]);
 a.pack={manifest:{regions:{codeBlocks:{enabled:true,style:{surface:'#050509',surfaceOpacity:.7,border:'#C29B52',borderOpacity:.55,borderWidth:1}}}}};a.refresh();
 assert.ok(a.style.textContent.includes('[data-codex-appearance~="codeBlocks"]{background-image:none!important}'));assert.match(a.style.textContent,/rgba\(5,5,9,0.7\)/);assert.match(a.style.textContent,/rgba\(194,155,82,0.55\)/);
 assert.equal(bar.getAttribute('data-codex-appearance-clear'),'');assert.equal(copy.getAttribute('data-codex-appearance-clear'),null);assert.equal(source.style.color,'rgb(170,60,200)');assert.deepEqual(bar.children,[copy]);assert.equal(block.style.opacity,undefined);
 a.pack.manifest.regions.codeBlocks.enabled=false;a.refresh();assert.equal(block.getAttribute('data-codex-appearance'),null);assert.equal(bar.getAttribute('data-codex-appearance-clear'),null);assert.doesNotMatch(a.style.textContent,/codeBlocks/);assert.deepEqual(block.children,[bar,source]);
});

test('transparent transcript clipping follows independently calculated input and scroll geometry',()=>{
 const viewport={top:96,bottom:752,left:349,right:1338},composer={top:638,bottom:736,left:475,right:1211};
 // Content bottom 2000 minus input top 638 = 1362, independent of its negative top.
 assert.equal(transcriptClipBottom({bottom:2000,height:2400},viewport,composer),1362);
 assert.equal(transcriptClipBottom({bottom:2000,height:2400},viewport,{...composer,top:538}),1462);
 assert.equal(transcriptClipBottom({bottom:2700,height:3100},viewport,composer),2062);
 assert.equal(transcriptClipBottom({bottom:2700,height:3100},{...viewport,bottom:952},{...composer,top:838,bottom:936}),1862);
 assert.equal(transcriptClipBottom({bottom:600,height:700},viewport,composer),0);
 assert.equal(transcriptClipBottom({bottom:900,height:100},viewport,composer),100);
 for(const input of [{...composer,top:800,bottom:900},{...composer,top:0,bottom:40},{...composer,left:1400,right:1600},{...composer,top:NaN}])assert.equal(transcriptClipBottom({bottom:2000,height:2400},viewport,input),null);
 assert.equal(transcriptClipBottom({bottom:2000,height:0},viewport,composer),null);
});

test('transcript clipping updates on scroll, input growth and window resize and restores owned state',t=>{
 const {a,Node,queries,observers}=environment(t),scope=new Node('viewport'),content=new Node('content'),input=new Node('input'),message=new Node('message');scope.append(content);scope.append(input);content.append(message);
 scope.rect={top:96,bottom:752,left:349,right:1338,width:989,height:656};content.rect={top:-500,bottom:2000,left:359,right:1328,width:969,height:2500};input.rect={top:638,bottom:736,left:475,right:1211,width:736,height:98};scope.scrollHeight=3000;
 scope.queries.set('input',[input]);scope.queries.set('content',[content]);a.adapter.transcriptClips=[{scope:'viewport',content:'content',composer:'input'}];queries.set('[data-codex-appearance~="chat"] viewport',[scope]);a.pack={manifest:{regions:{chat:{enabled:true,style:{surface:'#000000'}}}}};
 const prop='--codex-appearance-clip-bottom';content.style.setProperty(prop,'3px','important');a.syncTranscriptClips();assert.equal(content.style.getPropertyValue(prop),'1362px');assert.equal(input.getAttribute('data-codex-appearance-clip'),null);assert.equal(scope.scrollHeight,3000);
 content.rect.top=-200;content.rect.bottom=2300;scope.emit('scroll');assert.equal(content.style.getPropertyValue(prop),'1662px');input.rect.top=538;input.rect.height=198;observers[0].fn();assert.equal(content.style.getPropertyValue(prop),'1762px');
 scope.rect.bottom=952;scope.rect.height=856;input.rect.top=838;input.rect.bottom=936;input.rect.height=98;window.emit('resize');assert.equal(content.style.getPropertyValue(prop),'1462px');assert.deepEqual(content.children,[message]);
 a.pack.manifest.regions.chat.enabled=false;a.syncTranscriptClips();assert.equal(a.clips.size,0);assert.equal(content.getAttribute('data-codex-appearance-clip'),null);assert.equal(content.style.getPropertyValue(prop),'3px');assert.equal(content.style.getPropertyPriority(prop),'important');assert.equal(scope.listeners.get('scroll').size,0);assert.equal(window.listeners.get('resize').size,0);assert.equal(observers[0].watched.size,0);assert.equal(scope.scrollHeight,3000);
});

test('transcript clipping refuses composite content that contains its input and releases a replaced route',t=>{
 const {a,Node,queries}=environment(t),scope=new Node('viewport'),content=new Node('content'),input=new Node('input');scope.append(content);content.append(input);scope.rect={top:0,bottom:700,left:0,right:1000,width:1000,height:700};content.rect={top:0,bottom:900,left:0,right:1000,width:1000,height:900};input.rect={top:600,bottom:680,left:100,right:900,width:800,height:80};
 scope.queries.set('input',[input]);scope.queries.set('content',[content]);a.adapter.transcriptClips=[{scope:'viewport',content:'content',composer:'input'}];queries.set('[data-codex-appearance~="chat"] viewport',[scope]);a.pack={manifest:{regions:{chat:{enabled:true,style:{surface:'#000000'}}}}};a.syncTranscriptClips();assert.equal(a.clips.size,0);assert.equal(content.getAttribute('data-codex-appearance-clip'),null);
 scope.append(input);a.syncTranscriptClips();assert.equal(content.style.getPropertyValue('--codex-appearance-clip-bottom'),'300px');queries.set('[data-codex-appearance~="chat"] viewport',[]);a.syncTranscriptClips();assert.equal(a.clips.size,0);assert.equal(content.getAttribute('data-codex-appearance-clip'),null);assert.equal(content.style.getPropertyValue('--codex-appearance-clip-bottom'),'');assert.deepEqual(scope.children,[content,input]);
});

test('one panorama retains world coordinates at both measured window sizes',()=>{
 // 2:1 source, height708 -> width1416, right edge1338 -> x=-78.
 // Height984 -> width1968, right edge1916 -> x=-52. Sidebar width296 only changes the crop.
 for(const [right,height,worldX,width]of [[1338,708,-78,1416],[1916,984,-52,1968]])for(const left of [52,200,348]){
  const f=panoramaFit({paneLeft:left,paneRight:right,railRight:52,height,sourceWidth:1774,sourceHeight:887,subject:[.49,.005,.76,.97],maxScale:1.2});
  close(f.width,width);close(f.height,height);close(f.x+left,worldX);close(f.y,0);close(f.width/f.height,2);
 }
 const rtl=panoramaFit({paneLeft:4,paneRight:1868,sceneLeft:4,sceneRight:1868,height:984,sourceWidth:1774,sourceHeight:887,subject:[.49,.005,.76,.97],maxScale:1.2});close(rtl.x+4,-100);
 assert.throws(()=>panoramaFit({paneLeft:100,paneRight:50,railRight:0,height:100,sourceWidth:200,sourceHeight:100}));
 const legacy=theme();legacy.regions.chat.background.maxScale=1.2;assert.throws(()=>validateManifest(legacy));
 const modern=theme();modern.chatLayout={mode:'panorama'};modern.regions.chat.background.maxScale=1.2;assert.equal(validateManifest(modern).regions.chat.background.maxScale,1.2);assert.deepEqual(requiredAssets(modern),['assets/original.png']);
});

test('panorama renderer mounts one sharp image and crops it without recreating the subject',t=>{
 const {a,Node}=environment(t),frame=new Node('frame'),rail=new Node('rail'),sidebar=new Node('sidebar'),chat=new Node('chat');frame.selectors.add('frame');frame.append(rail);frame.append(sidebar);frame.append(chat);frame.queries.set('rail',rail);frame.queries.set('sidebar',sidebar);rail.rect={left:0,right:52};sidebar.clientWidth=296;
 a.adapter.chatLayoutState={frame:'frame',rail:'rail',sidebar:'sidebar',leftOpen:'left',rightOpen:'right'};frame.setAttribute('left','true');frame.setAttribute('right','false');
 const box=(left,right,height)=>{chat.rect={left,right,top:44,bottom:44+height,width:right-left,height};chat.clientWidth=right-left;chat.clientHeight=height;};box(348,1916,984);
 const bg={asset:'assets/panorama.png',blackOverlay:.5,subject:[.49,.005,.76,.97],fit:'cover',maxScale:1.2,blurFill:false};a.pack={manifest:{regions:{chat:{enabled:true,background:bg}},chatLayout:{mode:'panorama'}},assets:{'assets/panorama.png':'whole-scene'}};a.dimensions={'assets/panorama.png':[1774,887]};a.mountBackground(chat,'chat',bg);
 const mounted=a.mounted.get(chat),pane=mounted.layer.children[0],art=pane.children.find(n=>n.tag==='img');assert.equal(pane.children.filter(n=>n.tag==='img').length,1);assert.equal(art.src,'whole-scene');assert.doesNotMatch(art.style.cssText,/filter|blur/);close(parseFloat(art.style.left)+348,-52);
 frame.setAttribute('left','false');box(52,1916,984);mounted.update();assert.equal(pane.children.find(n=>n.tag==='img'),art);close(parseFloat(art.style.left)+52,-52);assert.equal(mounted.layer.dataset.chatMode,'panorama');
 box(52,1338,708);mounted.update();close(parseFloat(art.style.left)+52,-78);close(parseFloat(art.style.height),708);assert.equal(pane.children.filter(n=>n.tag==='img').length,1);
 a.clear();assert.deepEqual(chat.children,[]);
});

test('Dot sibling composer controls clipping while only the message list is masked',async t=>{
 const {a,Node,queries}=environment(t),outer=new Node('dot'),inner=new Node('inner'),scope=new Node('viewport'),content=new Node('messages'),input=new Node('composer');outer.append(inner);inner.append(scope);scope.append(content);outer.append(input);
 outer.selectors.add('dot-with-composer');outer.queries.set('input',[input]);scope.queries.set('content',[content]);
 scope.rect={left:349,right:1916,top:96,bottom:1028,width:1567,height:932};content.rect={left:748,right:1516,top:-1006,bottom:1292.5625,width:768,height:2298.5625};input.rect={left:764,right:1500,top:968,bottom:1012,width:736,height:44};
 a.adapter.transcriptClips=[{scope:'dot-viewport',content:'content',composer:'input',composerScope:'dot-with-composer'}];queries.set('[data-codex-appearance~="chat"] dot-viewport',[scope]);a.pack={manifest:{regions:{chat:{enabled:true,style:{surface:'#000000'}}}}};a.syncTranscriptClips();
 assert.equal(content.style.getPropertyValue('--codex-appearance-clip-bottom'),'324.5625px');assert.equal(input.getAttribute('data-codex-appearance-clip'),null);assert.equal(outer.getAttribute('data-codex-appearance-clip'),null);
 content.rect.bottom+=100;scope.emit('scroll');assert.equal(content.style.getPropertyValue('--codex-appearance-clip-bottom'),'424.5625px');a.clear();assert.equal(content.style.getPropertyValue('--codex-appearance-clip-bottom'),'');assert.equal(scope.listeners.get('scroll').size,0);
 const native=await adapter(),dot=native.transcriptClips.find(x=>x.scope==='.messaging-embedded .conversation-viewport');assert.equal(dot.composerScope,'.messaging-embedded:has([data-composer-surface-variant])');
});

test('top fade uses independent message coordinates and native Settings pseudo height',t=>{
 assert.deepEqual(transcriptFadeStops({top:-252},{top:104,bottom:136}),{start:356,end:388});assert.equal(transcriptFadeStops({top:150},{top:96,bottom:136}),null);assert.equal(transcriptFadeStops({top:0},{top:96,bottom:NaN}),null);
 const {a,Node,queries}=environment(t),scope=new Node('settings'),header=new Node('header'),content=new Node('content');scope.selectors.add('settings');scope.append(header);scope.append(content);scope.queries.set('header',[header]);scope.queries.set('content',[content]);
 scope.rect={left:0,right:1000,top:44,bottom:900,width:1000,height:856};header.rect={left:100,right:800,top:44,bottom:104,width:700,height:60};content.rect={left:100,right:800,top:-252,bottom:748,width:700,height:1000};
 globalThis.getComputedStyle=(n,pseudo)=>({position:'relative',visibility:'visible',height:pseudo==='::after'?'32px':'0px'});
 a.adapter.transcriptClips=[{scope:'settings-scroll',content:'content',composer:'absent',topFade:{scope:'settings',selector:'header',measure:'after'}}];queries.set('[data-codex-appearance~="chat"] settings-scroll',[scope]);a.pack={manifest:{regions:{chat:{enabled:true,style:{surface:'#000000'}}}}};a.syncTranscriptClips();
 assert.equal(content.style.getPropertyValue('--codex-appearance-fade-start'),'356px');assert.equal(content.style.getPropertyValue('--codex-appearance-fade-end'),'388px');assert.equal(header.getAttribute('data-codex-appearance-fade'),null);assert.equal(scope.getAttribute('data-codex-appearance-fade'),null);
 content.rect.top=-352;scope.emit('scroll');assert.equal(content.style.getPropertyValue('--codex-appearance-fade-end'),'488px');a.clear();assert.equal(content.style.getPropertyValue('--codex-appearance-fade-end'),'');assert.equal(scope.listeners.get('scroll').size,0);
});

test('sticky code header clips source only, observes outer scroll and releases capture listeners',t=>{
 const {a,Node,queries}=environment(t),block=new Node('code'),header=new Node('bar'),source=new Node('source');block.selectors.add('code');block.append(header);block.append(source);block.queries.set('bar',[header]);block.queries.set('source',[source]);block.rect={top:0,bottom:600,width:700,height:600};header.rect={top:96,bottom:138,width:700,height:42};source.rect={top:40,bottom:600,width:700,height:560};
 a.adapter.transcriptClips=[{scope:'code',content:'source',composer:'absent',globalScroll:true,excludeWithin:'editor',topFade:{scope:'code',selector:'bar',measure:'edge'}}];queries.set('[data-codex-appearance~="chat"] code',[block]);a.pack={manifest:{regions:{chat:{enabled:true,style:{surface:'#000000'}}}}};a.syncTranscriptClips();
 assert.equal(source.style.getPropertyValue('--codex-appearance-fade-start'),'98px');assert.equal(source.style.getPropertyValue('--codex-appearance-fade-end'),'98px');assert.equal(header.getAttribute('data-codex-appearance-fade'),null);
 source.rect.top=-20;window.emit('scroll');assert.equal(source.style.getPropertyValue('--codex-appearance-fade-start'),'158px');
 block.selectors.add('editor');a.syncTranscriptClips();assert.equal(a.clips.size,0);assert.equal(source.getAttribute('data-codex-appearance-fade'),null);assert.equal(window.listeners.get('scroll').size,0);assert.equal(window.listeners.get('resize').size,0);
});

test('shared surfaces retain old bordered groups and cover ring-only groups and Add headers',async t=>{
 const native=await adapter();
 assert.ok(native.regions.settings.includes("[data-app-shell-main-surface] [class~='group/settings'] .rounded-2xl.border"));assert.ok(native.regions.settings.includes("[data-app-shell-main-surface] [class~='group/settings'] .rounded-2xl.overflow-hidden.ring-1"));
 assert.ok(native.transparentSurfaces.sidebar.includes('[data-slate-sidebar-content]'));assert.ok(native.regions.menus.includes('.suggestionMenu-EeXWU_'));assert.ok(native.regions.questions.includes('[data-codex-composer-request-navigation]'));
 const {a}=environment(t);a.adapter.nativeComponents=native.nativeComponents;a.pack={manifest:{regions:{menus:{enabled:true,style:{surface:'#13090D',surfaceOpacity:.8}},rightPanel:{enabled:true,style:{surface:'#16080E',surfaceOpacity:.4},gradient:{angle:180,stops:[{color:'#2A0812',at:0},{color:'#090609',at:1}]}}},hover:{surface:'#A71032',surfaceOpacity:.6}}};a.refresh();
 assert.match(a.style.textContent,/--suggestion-menu-header-background:rgba\(19,9,13,0.8\)!important/);assert.match(a.style.textContent,/--trees-bg-override:transparent!important/);assert.match(a.style.textContent,/--trees-bg-muted-override:rgba\(167,16,50,0.6\)!important/);
 assert.ok(!a.style.textContent.includes('[data-codex-appearance~="rightPanel"]{background-color:'));a.clear();assert.equal(a.style.textContent,'');
});

test('attachment styling marks only the outer card and leaves preview and hover layers untouched',async t=>{
 const native=await adapter(),{a,Node,queries}=environment(t);
 const card=new Node('div'),base=new Node('span'),hover=new Node('span'),preview=new Node('img');card.append(base);base.append(preview);card.append(hover);preview.src='fixture-image';
 a.adapter.regions={attachments:native.regions.attachments};a.adapter.outermostRegions=native.outermostRegions;
 queries.set('.composer-attachment-surface',[card,base,hover]);
 a.pack={manifest:{regions:{attachments:{enabled:true,style:{surface:'#F8CCD7',text:'#000000',border:'#D98BA4',borderWidth:1}}}}};a.refresh();
 assert.equal(card.getAttribute('data-codex-appearance'),'attachments');assert.equal(base.getAttribute('data-codex-appearance'),null);assert.equal(hover.getAttribute('data-codex-appearance'),null);assert.equal(a.counts.attachments,1);assert.equal(preview.src,'fixture-image');
 a.clear();assert.deepEqual(card.children,[base,hover]);assert.deepEqual(base.children,[preview]);assert.equal(card.getAttribute('data-codex-appearance'),null);
});

test('ordinary foregrounds reach neutral labels and editors without universal semantic overrides',t=>{
 const {a,Node,queries}=environment(t),composer=new Node('composer'),bubble=new Node('bubble'),code=new Node('pre');
 a.adapter.regions={composer:['composer'],userMessages:['bubble'],codeBlocks:['code']};queries.set('composer',[composer]);queries.set('bubble',[bubble]);queries.set('code',[code]);
 a.pack={manifest:{regions:{composer:{enabled:true,style:{surface:'#FFE4EC',text:'#000000'}},userMessages:{enabled:true,style:{surface:'#F8CCD7',text:'#000000'}},codeBlocks:{enabled:true,style:{surface:'#202020'}}}}};a.refresh();
 const css=a.style.textContent;assert.match(css,/--color-codex-description:#000000!important/);assert.match(css,/--button-text-color:#000000!important/);assert.match(css,/\.ProseMirror\{color:#000000!important;caret-color:#000000!important/);assert.match(css,/\[data-markdown-text-tone="user-message"\]\{color:#000000!important/);
 assert.ok(!css.includes(' *{color:'));assert.ok(!css.includes('--color-text-success:'));assert.ok(!css.includes('--color-text-danger:'));
 assert.match(css,/\[data-codex-appearance~="codeBlocks"\]\{background-color:rgba\(32,32,32,1\)!important\}/);
 a.clear();assert.equal(bubble.getAttribute('data-codex-appearance'),null);
});

test('transparent hit controls stay native and summary paint targets its visible inner surface',t=>{
 const {a,Node,queries}=environment(t),gutter=new Node('button'),activity=new Node('button'),ordinary=new Node('button'),outer=new Node('div'),panel=new Node('section');outer.append(panel);
 // Independent native specimens: the gutter is outside the transcript scroller.
 gutter.matches=q=>q.split(',').includes('[data-app-shell-main-surface] nav .vertical-scroll-fade-mask button');activity.matches=q=>q.split(',').includes('[class~="group/activity-header"] > button[aria-expanded]');ordinary.matches=()=>false;outer.matches=q=>q==='[data-slot="popover-content"]';outer.queries.set('[class~="group/summary-panel"]',panel);
 const action=()=>17;gutter.onclick=action;gutter.setAttribute('data-codex-appearance','buttons');a.oldMarks.set(gutter,null);outer.setAttribute('data-codex-appearance','dialogs');a.oldMarks.set(outer,null);
 queries.set('buttons',[gutter,activity,ordinary]);queries.set('dialogs',[outer]);a.adapter.regions={buttons:['buttons'],dialogs:['dialogs']};
 a.pack={manifest:{regions:{buttons:{enabled:true,style:{surface:'#FFE4EC',text:'#000000'}},dialogs:{enabled:true,style:{surface:'#FFE4EC',text:'#000000',border:'#D98BA4',borderWidth:1}}}}};a.refresh();
 assert.equal(a.counts.buttons,1);assert.equal(gutter.getAttribute('data-codex-appearance'),null);assert.equal(activity.getAttribute('data-codex-appearance'),null);assert.equal(ordinary.getAttribute('data-codex-appearance'),'buttons');assert.equal(gutter.onclick,action);
 assert.equal(outer.getAttribute('data-codex-appearance'),null);assert.equal(panel.getAttribute('data-codex-appearance'),'dialogs');assert.match(a.style.textContent,/group\/summary-panel"\]\{--color-surface-elevated-secondary:rgba\(255,228,236,1\)!important/);
 a.clear();assert.deepEqual(outer.children,[panel]);assert.equal(gutter.onclick,action);assert.equal(panel.getAttribute('data-codex-appearance'),null);
});

test('transcript clipping follows the whole composer stack and falls back when its wrapper is hidden',t=>{
 const {a,Node,queries}=environment(t),scope=new Node('scope'),content=new Node('content'),input=new Node('input'),stack=new Node('stack');stack.append(input);stack.selectors.add('[data-codex-composer-reference-drop-target]');
 scope.rect={top:0,bottom:500,width:800,height:500};content.rect={top:0,bottom:1000,width:800,height:1000};input.rect={top:450,bottom:500,width:800,height:50};stack.rect={top:300,bottom:500,width:800,height:200};
 scope.queries.set('content',[content]);scope.queries.set('input',[input]);queries.set('[data-codex-appearance~="chat"] scope',[scope]);a.adapter.transcriptClips=[{scope:'scope',content:'content',composer:'input'}];a.pack={manifest:{regions:{chat:{enabled:true,style:{surface:'#000000'}}}}};a.syncTranscriptClips();
 assert.equal(content.style.getPropertyValue('--codex-appearance-clip-bottom'),'700px');assert.equal(a.clips.get(content).composer,stack);
 stack.rect.top=400;a.clips.get(content).update();assert.equal(content.style.getPropertyValue('--codex-appearance-clip-bottom'),'600px');
 stack.rect.width=0;a.syncTranscriptClips();assert.equal(a.clips.get(content).composer,input);assert.equal(content.style.getPropertyValue('--codex-appearance-clip-bottom'),'550px');
 a.clear();assert.equal(content.getAttribute('data-codex-appearance-clip'),null);
});

test('unified runtime shares one precomputed scene across regions and releases resize listeners',t=>{
 const {a,Node}=environment(t),globals=new Map(['innerWidth','innerHeight','devicePixelRatio'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));t.after(()=>{for(const[k,d]of globals){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 globalThis.innerWidth=1000;globalThis.innerHeight=500;globalThis.devicePixelRatio=1;
 const bg={asset:'assets/shared.png',blackOverlay:.35,subject:[.4,.2,.6,.8],fit:'subject-safe',maxScale:1,blurFill:false};
 const scene={scope:'window',regions:['sidebar','chat'],background:bg,placements:[{viewport:[1000,500],pixelRatio:1,frame:[0,0,1000,500],source:[2000,1000],image:[0,0,1000,500]}]};
 a.pack={manifest:{schemaVersion:2,id:'unified-fixture',name:'Unified fixture',regions:{sidebar:{enabled:true},chat:{enabled:true}},scene},assets:{'assets/shared.png':'shared-image'}};a.dimensions={'assets/shared.png':[2000,1000]};
 const sidebar=new Node('sidebar'),chat=new Node('chat');sidebar.rect={left:20,top:40,right:220,bottom:500,width:200,height:460};sidebar.clientWidth=200;sidebar.clientHeight=460;chat.rect={left:220,top:40,right:1000,bottom:500,width:780,height:460};chat.clientWidth=780;chat.clientHeight=460;
 a.mountBackground(sidebar,'sidebar',bg,true);a.mountBackground(chat,'chat',bg,true);
 const image=node=>a.mounted.get(node).layer.children[0].children.find(n=>n.tag==='img'),first=image(sidebar),second=image(chat);
 assert.equal(first.src,'shared-image');assert.equal(second.src,'shared-image');assert.equal(first.style.width,'1000px');assert.equal(second.style.width,'1000px');close(parseFloat(first.style.left)+20,0);close(parseFloat(second.style.left)+220,0);assert.equal(a.sceneCache.size,1);
 chat.rect.left=20;chat.rect.width=980;chat.clientWidth=980;a.mounted.get(chat).update();assert.equal(image(chat),second);close(parseFloat(second.style.left)+20,0);assert.equal(a.sceneCache.size,1);
 globalThis.innerWidth=800;globalThis.innerHeight=400;window.emit('resize');assert.equal(second.style.width,'800px');assert.equal(a.sceneCache.size,2);assert.equal(sidebar.clientWidth,200);
 a.clear();assert.deepEqual(sidebar.children,[]);assert.deepEqual(chat.children,[]);assert.equal(window.listeners.get('resize').size,0);
});

test('separate main scene uses the full area outside the rail regardless of sidebar width',t=>{
 const {a,Node,queries}=environment(t),globals=new Map(['innerWidth','innerHeight','devicePixelRatio'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));t.after(()=>{for(const[k,d]of globals){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 globalThis.innerWidth=1000;globalThis.innerHeight=500;globalThis.devicePixelRatio=1;
 const rail=new Node('rail'),chat=new Node('chat');rail.rect={left:0,top:44,right:52,bottom:500,width:52,height:456};chat.rect={left:348,top:44,right:1000,bottom:500,width:652,height:456};chat.clientWidth=652;chat.clientHeight=456;queries.set('[data-app-navigation-rail]',[rail]);queries.set('[data-app-shell-main-surface]',[chat]);
 const bg={asset:'assets/main.png',blackOverlay:.2,subject:[.4,.2,.6,.8],fit:'subject-safe',maxScale:1,blurFill:false};a.pack={manifest:{regions:{chat:{enabled:true}},scene:{scope:'main',regions:['chat'],background:bg}},assets:{'assets/main.png':'main-image'}};a.dimensions={'assets/main.png':[1896,912]};a.mountBackground(chat,'chat',bg,true);
 const mounted=a.mounted.get(chat),art=mounted.layer.children[0].children.find(n=>n.tag==='img');assert.equal(art.style.width,'948px');assert.equal(art.style.height,'456px');close(parseFloat(art.style.left)+348,52);close(parseFloat(art.style.top)+44,44);
 chat.rect.left=52;chat.rect.width=948;chat.clientWidth=948;mounted.update();assert.equal(art.style.width,'948px');close(parseFloat(art.style.left)+52,52);assert.equal(a.sceneCache.size,1);a.clear();
});
