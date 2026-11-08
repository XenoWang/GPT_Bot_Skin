import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {opacityOptions,withOpacityOverrides,decorationCss,validateManifest,validateTranslations,skinLanguage,skinText,skinDisplayName,regionLabel} from '../renderer/core.mjs';
import {readTranslations,readPack} from '../scripts/build.mjs';
const translations=await readTranslations();
const {manifest}=await readPack(new URL('../themes/kurumi-twilight/',import.meta.url));
const plain=()=>({schemaVersion:1,id:'plain',name:'Plain',regions:{composer:{enabled:true,style:{surface:'#000000'}},assistantMessages:{enabled:false,style:{surface:'#010203',surfaceOpacity:.4}},userMessages:{enabled:true,style:{border:'#FFFFFF',borderWidth:1}}}});

test('opacity controls enumerate enabled fields and implicit alpha',()=>{
 assert.deepEqual(opacityOptions(plain()).map(({key,value,mask})=>({key,value,mask})),[
  {key:'regions.composer.style.surfaceOpacity',value:1,mask:false},
  {key:'regions.userMessages.style.borderOpacity',value:1,mask:false}
 ]);
 const opts=opacityOptions(manifest,'en',translations),keys=opts.map(x=>x.key);
 assert.equal(opts.length,35);assert.equal(new Set(keys).size,35);
 for(const key of ['regions.titlebar.gradient.opacity','regions.navigation.gradient.opacity','regions.rightPanel.style.surfaceOpacity','regions.profileActivity.style.surfaceOpacity','regions.questions.style.surfaceOpacity','regions.inputs.style.surfaceOpacity','sidebarLayout.header.blackOverlay','sidebarLayout.body.blackOverlay','sidebarLayout.divider.opacity','hover.surfaceOpacity'])assert.ok(keys.includes(key),key);
 assert.ok(!keys.some(k=>k.startsWith('regions.assistantMessages')));
 assert.deepEqual(opts.filter(o=>o.mask).map(o=>[o.key,o.value]),[['regions.sidebar.background.blackOverlay',.7],['regions.chat.background.blackOverlay',.5],['sidebarLayout.header.blackOverlay',.5],['sidebarLayout.body.blackOverlay',.7]]);
 const merged=structuredClone(manifest);merged.sidebarLayout.mode='merged';assert.equal(opacityOptions(merged).length,35);
 merged.regions.sidebar.enabled=false;assert.equal(opacityOptions(merged).length,31);
});

test('overrides preserve source and colors and reject invalid paths or coefficients',()=>{
 const source=plain(),before=JSON.stringify(source);
 const changed=withOpacityOverrides(source,{'regions.composer.style.surfaceOpacity':.7,'regions.userMessages.style.borderOpacity':0});
 assert.equal(changed.regions.composer.style.surface,'#000000');assert.equal(changed.regions.composer.style.surfaceOpacity,.7);assert.equal(changed.regions.userMessages.style.borderOpacity,0);assert.equal(JSON.stringify(source),before);
 for(const value of [-.01,1.01,NaN,Infinity,'0.5',null,true])assert.throws(()=>withOpacityOverrides(source,{'regions.composer.style.surfaceOpacity':value}));
 for(const key of ['regions.assistantMessages.style.surfaceOpacity','regions.composer.style.text','__proto__.polluted','sidebarLayout.header.blackOverlay'])assert.throws(()=>withOpacityOverrides(source,{[key]:.5}));
 assert.throws(()=>withOpacityOverrides(source,[]));assert.equal({}.polluted,undefined);
 for(const alpha of [0,1])assert.equal(withOpacityOverrides(source,{'regions.composer.style.surfaceOpacity':alpha}).regions.composer.style.surfaceOpacity,alpha);
});

test('gradient alpha affects stops independently of ornament opacity',()=>{
 const m=withOpacityOverrides(manifest,{'regions.titlebar.gradient.opacity':.7});
 assert.equal(m.regions.titlebar.ornament.opacity,.65);assert.equal(manifest.regions.titlebar.gradient.opacity,undefined);
 const css=decorationCss({gradient:m.regions.titlebar.gradient});
 assert.equal(css.backgroundImage,'linear-gradient(90deg,rgba(30,7,16,0.7) 0%,rgba(65,8,25,0.7) 48%,rgba(13,6,10,0.7) 100%)');assert.equal(css.opacity,undefined);
 const drawer=withOpacityOverrides(manifest,{'regions.rightPanel.style.surfaceOpacity':.3}).regions.rightPanel;
 assert.match(decorationCss(drawer).backgroundImage,/rgba\(42,8,18,0.3\)/);
 for(const value of [-1,1.1,'0.2',NaN]){const bad=structuredClone(manifest);bad.regions.titlebar.gradient.opacity=value;assert.throws(()=>validateManifest(bad));}
});

test('language follows app locale and falls back to English Skin labels',()=>{
 for(const [app,wanted]of [['zh','zh-CN'],['zh-Hant','zh-CN'],['en-US','en'],['fr-FR','en'],['','en']])assert.equal(skinLanguage('auto',app,translations),wanted);
 assert.equal(skinLanguage('en','zh-CN',translations),'en');assert.equal(skinLanguage('zh-CN','en',translations),'zh-CN');
 assert.equal(skinText('en','launcher',{},translations),'Skin');assert.equal(skinText('en','title',{},translations),'Skin settings');assert.equal(skinText('en','opacityTitle',{count:35},translations),'Opacity (35 settings)');
 assert.equal(skinDisplayName(manifest,'en',translations),'Kurumi Twilight');assert.equal(regionLabel('profileActivity','en',translations),'Token activity');
 const copy=validateTranslations(translations);copy.en.strings.title='changed';assert.equal(translations.en.strings.title,'Skin settings');
});

test('one additional translation file is discovered and inherits missing English strings',async t=>{
 const folder=await mkdtemp(path.join(process.env.CODEX_THEME_TEST_ROOT,'locales-'));t.after(()=>rm(folder,{recursive:true,force:true}));
 await writeFile(path.join(folder,'en.json'),JSON.stringify(translations.en));
 await writeFile(path.join(folder,'fr.json'),JSON.stringify({locale:'fr',name:'Français',direction:'ltr',menuLabels:['Fichier'],strings:{title:'Réglages Skin'},regions:{},skins:{}}));
 const bundle=await readTranslations(folder);
 assert.deepEqual(Object.keys(bundle),['en','fr']);assert.equal(skinLanguage('auto','fr-CA',bundle),'fr');assert.equal(skinText('fr','title',{},bundle),'Réglages Skin');assert.equal(skinText('fr','closeLabel',{},bundle),'Close Skin settings');assert.equal(skinText('fr','opacityTitle',{count:2},bundle),'Opacity (2 settings)');
 await writeFile(path.join(folder,'fr.json'),JSON.stringify({...bundle.fr,locale:'de'}));await assert.rejects(readTranslations(folder),/filename|locale/);
 await writeFile(path.join(folder,'fr.json'),' '.repeat(128*1024+1));await assert.rejects(readTranslations(folder),/128 KiB/);
});

test('translations reject missing base, unsafe keys, invalid identities and placeholder loss',()=>{
 const changes=[b=>delete b.en,b=>delete b.en.strings.title,b=>b['zh-CN'].locale='zh',b=>b.en.direction='sideways',b=>b.en.menuLabels=[''],b=>b.en.strings.title=14,b=>b['zh-CN'].strings.opacityTitle='count missing',b=>Object.defineProperty(b.en.strings,'__proto__',{value:'unsafe',enumerable:true})];
 for(const change of changes){const b=structuredClone(translations);change(b);assert.throws(()=>validateTranslations(b));}
 const tooMany={en:translations.en};for(let i=0;i<64;i++)tooMany['aa-'+String(i+10)]={locale:'aa-'+String(i+10),name:'Example',strings:{},regions:{},skins:{}};assert.throws(()=>validateTranslations(tooMany),/64/);assert.equal({}.polluted,undefined);
});
