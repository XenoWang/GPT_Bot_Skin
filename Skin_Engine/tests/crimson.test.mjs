import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateManifest,decorationCss,declarations} from '../renderer/core.mjs';
import {Appearance} from '../renderer/runtime.mjs';
const theme=()=>({schemaVersion:1,id:'crimson-example',name:'绯红示例',hover:{surface:'#A71032',surfaceOpacity:.6},regions:{navigation:{enabled:true,gradient:{angle:180,stops:[{color:'#18050C',at:0},{color:'#500B1D',at:1}]},ornament:{pattern:'rose-vines',orientation:'vertical',color:'#A71032',accent:'#B87A77',opacity:.38,scale:1}}}});
const current=async()=>JSON.parse(await readFile(new URL('../themes/kurumi-twilight/manifest.json',import.meta.url),'utf8'));

test('user crimson bubble and black composer retain font settings',async()=>{
 const m=validateManifest(await current());
 const s=m.regions.userMessages.style;assert.equal(s.surface,'#A71032');assert.equal(s.surfaceOpacity,.7);assert.equal(s.border,'#FFFFFF');assert.equal(s.borderWidth,1);
 assert.equal(m.regions.assistantMessages.enabled,false);assert.deepEqual(m.regions.assistantMessages.style,{});
 assert.equal(m.regions.composer.style.surface,'#000000');assert.equal(m.regions.composer.style.surfaceOpacity,1);assert.equal(m.regions.dialogs.enabled,true);
 for(const name of ['userMessages','assistantMessages','composer','navigation','titlebar','rightPanel'])for(const key of ['text','fontFamily','fontSize','lineHeight'])assert.equal(m.regions[name].style[key],undefined);
 assert.deepEqual(m.hover,{surface:'#A71032',surfaceOpacity:.6});assert.equal(m.regions.navigation.background,undefined);assert.equal(m.regions.titlebar.background,undefined);assert.ok(m.regions.rightPanel.gradient);
});

test('decoration input rejects arbitrary code, remote sources and invalid coefficients',()=>{
 const changes=[
  m=>m.hover.surface='url(https://example.com)',m=>m.hover.surfaceOpacity=1.1,m=>m.hover.css='body{}',
  m=>m.regions.navigation.gradient.angle=NaN,m=>m.regions.navigation.gradient.stops.reverse(),m=>m.regions.navigation.gradient.stops=[{color:'#FFFFFF',at:0}],
  m=>m.regions.navigation.gradient.stops[0].color='red;background:url(x)',m=>m.regions.navigation.ornament.pattern='<svg onload=alert(1)>',
  m=>m.regions.navigation.ornament.svg='<svg/>',m=>m.regions.navigation.ornament.opacity=-.1,m=>m.regions.navigation.ornament.scale=20,
  m=>m.regions.navigation.ornament.orientation='arbitrary',m=>m.regions.navigation.background={asset:'assets/a.png'}
 ];
 for(const change of changes){const m=theme();change(m);assert.throws(()=>validateManifest(m));}
});

test('ornaments are local inert vectors above the configured gradient',()=>{
 const m=validateManifest(theme()),style=decorationCss(m.regions.navigation);
 assert.match(style.backgroundImage,/linear-gradient\(180deg,#18050C 0%,#500B1D 100%\)/);
 const svg=decodeURIComponent(style.backgroundImage.match(/^url\("data:image\/svg\+xml,([^"\n]+)"\)/)[1]);
 assert.match(svg,/viewBox="0 0 52 320"/);assert.match(svg,/opacity="0.38"/);
 assert.deepEqual([...new Set([...svg.matchAll(/<\/?([a-z]+)/g)].map(m=>m[1]))].sort(),['g','path','svg']);
 assert.doesNotMatch(svg,/<script|foreignObject|onload=|href=|javascript:/i);
 assert.equal(style.backgroundRepeat,'repeat-y,no-repeat');
 m.regions.navigation.ornament.orientation='horizontal';const horizontal=decorationCss(m.regions.navigation);assert.equal(horizontal.backgroundRepeat,'repeat-x,no-repeat');
 const horizontalSvg=decodeURIComponent(horizontal.backgroundImage.match(/^url\("data:image\/svg\+xml,([^"\n]+)"\)/)[1]);
 assert.match(horizontalSvg,/viewBox="0 0 320 52"/);
});

test('hover changes only background with sixty percent opacity',()=>{
 const css=declarations(theme().hover);
 assert.equal(css,'background-color:rgba(167,16,50,0.6)!important');
 assert.doesNotMatch(css,/(^|;)opacity:|(^|;)color:|font-/);
 const message=declarations({surface:'#A71032',surfaceOpacity:1,border:'#FFFFFF',borderWidth:1});
 assert.match(message,/border-color:#FFFFFF/);assert.match(message,/border-width:1px/);assert.doesNotMatch(message,/(^|;)color:|font-/);
});

function environment(t){
 class Node{
  constructor(tag){this.tag=tag;this.children=[];this.parentElement=null;this.style={};this.attrs={};this.textContent='';}
  setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
  prepend(n){n.remove();n.parentElement=this;this.children.unshift(n);}append(n){n.remove();n.parentElement=this;this.children.push(n);}
  remove(){if(this.parentElement){const p=this.parentElement;p.children.splice(p.children.indexOf(this),1);this.parentElement=null;}}
 }
 const originals=new Map(['document','getComputedStyle'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 t.after(()=>{for(const [k,d]of originals){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 globalThis.document={createElement:tag=>new Node(tag),querySelector:()=>({}),querySelectorAll:()=>[]};globalThis.getComputedStyle=()=>({position:'static'});
 const a=new Appearance({gate:'native-shell',regions:{},transparentSurfaces:{},hoverInteractive:':is(button,a[href])',hoverTargets:['native-shell :is(button,a[href])'],hoverScrollbars:['native-shell *::-webkit-scrollbar-thumb']},{manifest:{id:'fixture'}});
 a.style=new Node('style');a.diagnostics=new Node('status');return {a,Node};
}

test('background decoration preserves native controls and cleans up owned layers only',t=>{
 const {a,Node}=environment(t),rail=new Node('rail'),usage=new Node('usage'),profile=new Node('profile');rail.append(usage);rail.append(profile);rail.style.color='rgb(255, 255, 255)';rail.setAttribute('data-codex-appearance','existing');
 a.tag(rail,'navigation');a.mountDecoration(rail,'navigation',validateManifest(theme()).regions.navigation);
 const layer=a.mounted.get(rail).layer;assert.deepEqual(rail.children,[layer,usage,profile]);assert.match(layer.style.cssText,/pointer-events:none/);assert.match(layer.style.cssText,/z-index:-1/);assert.equal(layer.attrs['aria-hidden'],'true');assert.equal(rail.style.color,'rgb(255, 255, 255)');
 a.clear();assert.deepEqual(rail.children,[usage,profile]);assert.equal(rail.getAttribute('data-codex-appearance'),'existing');assert.equal(rail.getAttribute('data-codex-appearance-bg'),null);assert.equal(rail.getAttribute('data-codex-appearance-static'),null);
});

test('global and manager hover disappear when restoring original appearance',t=>{
 const {a,Node}=environment(t);a.syncManager=()=>{};a.panelBaseCss='base-panel';a.panelStyles=[new Node('style'),new Node('style')];a.pack={manifest:{regions:{},hover:theme().hover}};
 a.refresh();assert.match(a.style.textContent,/:hover:not\(:disabled\)/);assert.match(a.style.textContent,/:not\(:has\(:is\(button,a\[href\]\):hover\)\)/);assert.match(a.style.textContent,/rgba\(167,16,50,0.6\)/);
 for(const s of a.panelStyles)assert.match(s.textContent,/rgba\(167,16,50,0.6\)/);
 a.clear();a.pack=null;a.refresh();assert.equal(a.style.textContent,'');for(const s of a.panelStyles)assert.equal(s.textContent,'base-panel');
});

test('right drawer maps only native background variables and removes them on restore',t=>{
 const {a,Node}=environment(t);a.syncManager=()=>{};a.panelBaseCss='base';a.panelStyles=[new Node('style')];
 a.adapter.nativeComponents={rightPanel:[{selector:'file-tree-container',surfaceVars:['--color-surface','--trees-bg-override'],hoverVars:['--trees-bg-muted-override']}]};
 a.pack={manifest:{regions:{rightPanel:{enabled:true,style:{surface:'#16080E',surfaceOpacity:1}}},hover:theme().hover}};
 a.refresh();const css=a.style.textContent;
 assert.match(css,/\[data-codex-appearance~="rightPanel"\] file-tree-container\{/);
 assert.match(css,/--color-surface:rgba\(22,8,14,1\)!important/);assert.match(css,/--trees-bg-override:rgba\(22,8,14,1\)!important/);
 assert.match(css,/--trees-bg-muted-override:rgba\(167,16,50,0.6\)!important/);assert.doesNotMatch(css,/--trees-fg|--trees-font/);
 a.clear();a.pack=null;a.refresh();assert.equal(a.style.textContent,'');
});

test('adapter targets visible surfaces and only the intended top and right bars',async()=>{
 const a=JSON.parse(await readFile(new URL('../adapters/codex-26.1103.json',import.meta.url),'utf8'));
 // Observed current native surfaces are a contractual boundary, not arbitrary class spelling checks.
 assert.deepEqual(a.regions.userMessages,['[data-user-message-bubble]','.messaging-embedded .message-row.self div.message-bubble']);
 assert.deepEqual(a.regions.composer,["[data-composer-surface-variant]:not([data-composer-utility-bar-variant='home'])","[data-composer-utility-bar-variant='home'] > [data-composer-body]"]);
 assert.deepEqual(a.regions.titlebar,['.ApplicationMenuTopBar-SLuX8q']);assert.deepEqual(a.regions.rightPanel,["aside[data-app-shell-focus-area='right-panel']"]);
 assert.ok(a.regions.assistantMessages.every(s=>!s.includes('data-conversation-role')));assert.ok(a.transparentSurfaces.rightPanel.every(s=>!['body','*','[data-app-shell-frame]'].includes(s)));
});
