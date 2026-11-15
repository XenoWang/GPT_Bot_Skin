import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cropPlan,contrast,readableSurface,paletteCandidates} from '../../scripts/image-math.mjs';
import {createSession,selectLayout,setSource,setPrompt,confirm,choosePalette,buildManifest,backgroundRevision,completeRevision,invalidate,requiredSlots} from '../../scripts/workflow.mjs';
import {loadLocales,selectLanguage,localeBundle,translate,localizeError,validateLocale} from '../../scripts/localization.mjs';
import {writeCatalog} from '../../scripts/catalog.mjs';
import {run} from '../../scripts/creator.mjs';
import {makeCatalog} from '../scripts/inspect-ui-regions.mjs';
import {coverageBlockers,navigateKnown,navigationReached,sidebarState,saveNavigation,restoreNavigation} from '../scripts/coverage-runner.mjs';
import {validateManifest,requiredAssets,scenePlacement,sharedSceneFit,opacityOptions,withOpacityOverrides,decorationCss,controllerButtonImage,declarations} from '../renderer/core.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} versus ${expected}`);
async function temporary(t,parent=process.env.CODEX_THEME_TEST_ROOT){assert.ok(parent,'Isolated test directory is required');await mkdir(parent,{recursive:true});const directory=await mkdtemp(path.join(parent,'creator-'));assert.equal(path.dirname(directory),path.resolve(parent));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}
function sessionFixture(mode='unified'){
 const s=createSession('fixture-skin','Fixture Skin','en'),regions=['titlebar','navigation','sidebar','chat','userMessages','menus'];
 const canvas={window:[1920,1080],main:[1868,1036],mainOrigin:[52,44],sidebarHeaderHeight:120};
 s.inventory={binding:'synthetic-client',clientVersion:'26.1103.4239.0',adapterVersion:'26.1103.4239.0',measurement:{maximized:true,pixelRatio:1,canvas,windowed:{pixelRatio:1,canvas:{window:[1280,720],main:[1228,676],mainOrigin:[52,44],sidebarHeaderHeight:120}}},coverage:{restored:true,states:[{id:'home',status:'observed',regions}]},samples:[{viewport:[1920,1080],label:'home',regionCoverage:[{key:'sidebar',visible:1,matched:1,samples:[{visible:true,rect:[52,44,296,1036]}]}]}]};
 s.catalog={regions:regions.map(key=>({key,requiresAdapterReview:false}))};s.foregrounds={userMessages:['#FFFFFF'],menus:['#FFFFFF'],titlebar:['#FFFFFF'],navigation:['#FFFFFF']};
 selectLayout(s,{mode,language:'en',regions});setSource(s,{kind:'provided'});
 for(const slot of requiredSlots(s))s.assets[slot.id]={file:'unused.png',hash:'a'.repeat(64),target:slot.target,subject:[.45,.3,.55,.7],colors:['#402030','#204030'],overlay:.35};
 return s;
}
function acceptBackground(s){const revision=backgroundRevision(s);s.previews.background={revision,applied:true,uncoveredScene:false};confirm(s,'background',revision,'Synthetic test-user acceptance');}

test('raster decals preserve both scene forms, opacity and acceptance boundaries during later background edits',()=>{
 for(const mode of ['unified','separate']){
  const s=sessionFixture(mode);acceptBackground(s);const before=buildManifest(s),bg=backgroundRevision(s);
  const decal={asset:'assets/decal-badge.png',width:28,placement:'top-right',offset:[154,3],opacity:.9};
  s.decalAssets={[decal.asset]:{hash:'c'.repeat(64)}};
  choosePalette(s,{mode:'custom',colors:['#21192F'],style:{text:'#FFFFFF'},regionStyles:{userMessages:{surface:'#542B87',surfaceOpacity:.85}},decals:{titlebar:[decal],sidebar:[decal]}});
  const full=buildManifest(s,'complete');assert.deepEqual(full.scene,before.scene);assert.deepEqual(full.regions.sidebar.background,before.regions.sidebar.background);assert.equal(backgroundRevision(s),bg);
  assert.deepEqual(requiredAssets(full).filter(x=>x.includes('decal')),['assets/decal-badge.png']);assert.deepEqual(full.regions.titlebar.decals,[decal]);
  const key='regions.titlebar.decals.0.opacity';assert.equal(opacityOptions(full).find(x=>x.key===key).value,.9);const adjusted=withOpacityOverrides(full,{[key]:.3});assert.equal(adjusted.regions.titlebar.decals[0].opacity,.3);assert.equal(adjusted.regions.sidebar.decals[0].opacity,.9);assert.equal(adjusted.regions.userMessages.style.surfaceOpacity,.85);
  const revision=completeRevision(s);s.decalAssets[decal.asset].hash='d'.repeat(64);assert.notEqual(completeRevision(s),revision);assert.equal(backgroundRevision(s),bg);
  s.assets[mode==='unified'?'scene':'chat'].hash='e'.repeat(64);invalidate(s,'background');
  assert.throws(()=>buildManifest(s,'complete'),/Confirm/);assert.equal(buildManifest(s,'background').regions.userMessages,undefined);
  const retained=buildManifest(s,'background',true);assert.equal(retained.regions.userMessages.style.surfaceOpacity,.85);assert.deepEqual(retained.regions.titlebar.decals,[decal]);assert.equal(s.confirmations.background,undefined);assert.equal(s.confirmations.complete,undefined);
 }
 const s=sessionFixture();acceptBackground(s);const before=structuredClone(s);
 assert.throws(()=>choosePalette(s,{mode:'custom',colors:['#21192F'],decals:{titlebar:[{asset:'assets/missing.png',width:24,placement:'top-left',offset:[0,0],opacity:1}]}}),/Register each/);assert.deepEqual(s,before);
});

test('independent controller keys need no raster assets and remain separate in both scene forms',()=>{
 const symbols=['A','B','X','Y','up','right','down','left'];
 for(const mode of ['unified','separate']){
  const s=sessionFixture(mode),base=buildManifest(s);acceptBackground(s);
  const decals=symbols.map((symbol,i)=>({symbol,color:'#F3EFFF',accent:'#9165BD',width:24,placement:'top-center',offset:[-180+i*40,8],opacity:.8}));
  choosePalette(s,{mode:'custom',colors:['#21192F'],style:{text:'#FFFFFF'},decals:{titlebar:decals}});const m=buildManifest(s,'complete');assert.deepEqual(m.regions.titlebar.decals.map(d=>d.symbol),symbols);assert.deepEqual(m.scene,base.scene);assert.deepEqual(requiredAssets(m),requiredAssets(base));
  assert.equal(opacityOptions(m).filter(o=>o.key.includes('.decals.')).length,8);const changed=withOpacityOverrides(m,{'regions.titlebar.decals.3.opacity':.2});assert.equal(changed.regions.titlebar.decals[3].opacity,.2);assert.equal(changed.regions.titlebar.decals[2].opacity,.8);
  const tooMany=structuredClone(m);tooMany.regions.titlebar.decals.push(decals[0]);assert.throws(()=>validateManifest(tooMany));
  for(const change of [d=>d.symbol='script',d=>d.asset='assets/also.png',d=>d.color='url(x)',d=>d.offset=[-513,0],d=>d.offset=[0,-1]]){const bad=structuredClone(m);change(bad.regions.titlebar.decals[0]);assert.throws(()=>validateManifest(bad));}
 }
 for(const symbol of symbols){const svg=decodeURIComponent(controllerButtonImage(symbol,'#F3EFFF','#9165BD').split(',').slice(1).join(','));assert.match(svg,/viewBox="0 0 64 64"/);assert.doesNotMatch(svg,/<script|onload=|href=/);if(symbol.length===1)assert.ok(svg.includes('>'+symbol+'</text>'));else assert.ok(svg.includes('rotate('+{up:0,right:90,down:180,left:270}[symbol]+' 32 32)'));}
 assert.throws(()=>controllerButtonImage('<script>','#F3EFFF','#9165BD'));
});

test('raster decal data rejects executable, unbounded and legacy-version payloads',()=>{
 const decal={asset:'assets/badge.png',width:24,placement:'top-right',offset:[154,3],opacity:.9};
 const manifest=()=>({schemaVersion:2,id:'decal-data',name:'Decal',regions:{titlebar:{enabled:true,decals:[structuredClone(decal)]}}});
 for(const change of [m=>m.schemaVersion=1,m=>m.regions.titlebar.decals=[],m=>m.regions.titlebar.decals=Array(9).fill(decal),m=>m.regions.titlebar.decals[0].asset='assets/../secret.png',m=>m.regions.titlebar.decals[0].css='position:fixed',m=>m.regions.titlebar.decals[0].width=257,m=>m.regions.titlebar.decals[0].offset=[513,0],m=>m.regions.titlebar.decals[0].opacity=NaN,m=>m.regions.titlebar.decals[0].placement='center']){const m=manifest();change(m);assert.throws(()=>validateManifest(m));}
});

test('crop follows hand-computed cover geometry and preserves protected bounds',()=>{
 const p=cropPlan([4000,2200],[1920,1080],[.4,.2,.6,.9]);
 close(p.scale,27/55);close(p.crop[0],400/9);close(p.crop[1],0);close(p.crop[2],35200/9);close(p.crop[3],2200);assert.deepEqual(p.target,[1920,1080]);
 const edge=cropPlan([400,200],[200,200],[.55,.1,.95,.9]);assert.deepEqual(edge.crop,[200,0,200,200]);assert.equal(edge.scale,1);
 for(const [source,target,roi]of [[[4000,2200],[1920,1080],[.4,.2,.6,.9]],[[400,200],[200,200],[.55,.1,.95,.9]],[[200,400],[200,200],[.1,.5,.9,.9]]]){
  const r=cropPlan(source,target,roi),[x,y,w,h]=r.crop;
  assert.ok(x<=roi[0]*source[0]+1e-8&&y<=roi[1]*source[1]+1e-8);assert.ok(x+w>=roi[2]*source[0]-1e-8&&y+h>=roi[3]*source[1]-1e-8);assert.ok(r.scale<=1);
 }
});
test('undersized, unfillable and malformed image requests are rejected',()=>{
 assert.throws(()=>cropPlan([1919,1080],[1920,1080],null),/SOURCE_TOO_SMALL/);
 assert.throws(()=>cropPlan([400,200],[200,200],[.1,.1,.9,.9]),/SUBJECT_CONFLICT/);
 for(const subject of [undefined,[.9,0,.1,1],[0,0,NaN,1],[-.1,0,1,1]])assert.throws(()=>cropPlan([400,200],[200,200],subject));
 assert.throws(()=>cropPlan([400,200],[0,200],null));assert.throws(()=>cropPlan([400,200],[true,200],null));
});
test('palette preserves foregrounds and uses independently known contrast cases',()=>{
 assert.equal(contrast('#000000','#FFFFFF'),21);assert.equal(contrast('#402030','#402030'),1);
 const style=readableSurface(['#FFFFFF'],['#FFFFFF']);assert.equal(style.surface,'#666666');assert.equal(style.surfaceOpacity,1);assert.equal(style.text,undefined);
 assert.equal(readableSurface(['#402030'],['#FFFFFF']).surface,'#402030');
 // At ratio 7, black needs L >= .3 while white needs L <= .1: impossible.
 assert.throws(()=>readableSurface(['#FFFFFF'],['#FFFFFF','#000000'],7),/CONTRAST_CONFLICT/);
 const choices=paletteCandidates(['#000000']);assert.equal(choices.length,5);assert.equal(new Set(choices).size,5);
});
test('observed selectors cannot hide version, truncation, error or unknown-structure gaps',()=>{
 const raw={clientVersion:'v',adapterVersion:'v',coverageLabels:['home'],samples:[{regionCoverage:[{key:'chat',matched:1,visible:1,selectorErrors:[],samples:[]}],candidates:[{tag:'aside',role:'complementary',path:'aside:nth-of-type(1)',rect:[0,0,10,10],visible:true,mappedRegions:[]}]}]};
 assert.equal(makeCatalog(raw).regions.find(r=>r.key==='chat').requiresAdapterReview,false);assert.equal(makeCatalog(raw).candidates.length,1);
 for(const change of [r=>r.clientVersion='other',r=>r.samples[0].truncated=true,r=>r.samples[0].regionCoverage[0].selectorErrors=['bad['],r=>r.unconfirmedRegions=['chat'],r=>r.targetLimitReached=true]){const r=structuredClone(raw);change(r);assert.equal(makeCatalog(r).regions.find(x=>x.key==='chat').requiresAdapterReview,true);}
 const coverage={coverage:{states:[{id:'dialog',regions:['dialogs'],status:'not-observed'},{id:'chat',regions:['chat'],status:'observed'}]}};
 assert.deepEqual(coverageBlockers(coverage,['dialogs']),['dialog']);assert.deepEqual(coverageBlockers(coverage,['dialogs'],['dialog']),[]);assert.deepEqual(coverageBlockers(coverage,['chat']),[]);
});
test('stage gates bind acceptance to exact assets without losing explicit palette choices',()=>{
 const s=sessionFixture(),background=backgroundRevision(s);
 assert.throws(()=>confirm(s,'background',background,'User accepts'),/Preview the exact/);assert.throws(()=>choosePalette(s,{mode:'custom',colors:['#402030']}),/Confirm/);
 acceptBackground(s);choosePalette(s,{mode:'custom',colors:['#402030']});const complete=completeRevision(s);
 assert.throws(()=>confirm(s,'complete',complete,'Accept'),/Preview the exact/);
  s.previews.complete={revision:complete,applied:true,uncoveredScene:false};assert.throws(()=>confirm(s,'complete',complete,'Synthetic acceptance'),/actual control contrast/);
  s.previews.complete.contrast={passed:false};assert.throws(()=>confirm(s,'complete',complete,'Synthetic acceptance'),/actual control contrast/);
  s.previews.complete.contrast={passed:true};confirm(s,'complete',complete,'Synthetic acceptance');
 s.assets.scene.hash='b'.repeat(64);invalidate(s,'background');assert.deepEqual(s.palette.selected,['#402030']);assert.equal(s.confirmations.background,undefined);assert.equal(s.confirmations.complete,undefined);assert.notEqual(backgroundRevision(s),background);
 assert.throws(()=>confirm(s,'complete',complete,'Old acceptance'),/Stale/);assert.throws(()=>buildManifest(s,'complete'),/Confirm/);
});
test('generation requires prompt acceptance and form changes invalidate only dependent artifacts',()=>{
 const s=sessionFixture();setSource(s,{kind:'generated',provider:'gpt'});assert.deepEqual(s.assets,{});
 const prompt=setPrompt(s,{prompt:'A quiet landscape; keep the figure away from crop edges.'});assert.equal(prompt.slots.length,1);assert.equal(prompt.provider.provider,'gpt');
 assert.throws(()=>confirm(s,'prompt',prompt.revision,''),/actual user/);confirm(s,'prompt',prompt.revision,'Synthetic acceptance');
 setPrompt(s,{prompt:'A different pose.'});assert.equal(s.confirmations.prompt,undefined);
 const images={...s.assets};selectLayout(s,{...s.selection,language:'zh-CN'});assert.deepEqual(s.assets,images);
 selectLayout(s,{...s.selection,mode:'separate'});assert.equal(s.prompt,null);assert.equal(s.confirmations.prompt,undefined);
});
test('unified and separate manifests use distinct scene semantics and measured precomputation',()=>{
 const s=sessionFixture(),m=buildManifest(s);assert.equal(m.schemaVersion,2);assert.equal(m.scene.scope,'window');assert.equal(m.sidebarLayout,undefined);assert.equal(m.regions.userMessages,undefined);assert.deepEqual(requiredAssets(m),['assets/scene.png']);
 assert.deepEqual(m.scene.placements.map(p=>p.viewport),[[1280,720],[1920,1080]]);assert.deepEqual(m.scene.placements[0].image,[0,0,1280,720]);
 acceptBackground(s);choosePalette(s,{mode:'custom',colors:['#402030']});const complete=buildManifest(s,'complete');assert.equal(complete.regions.userMessages.style.surface,'#402030');assert.equal(complete.regions.userMessages.style.text,undefined);
 const separate=sessionFixture('separate'),p=buildManifest(separate);assert.equal(p.scene.scope,'main');assert.deepEqual(p.scene.regions,['chat']);assert.equal(p.regions.sidebar.background.asset,'assets/sidebar.png');assert.equal(p.chatLayout,undefined);
 assert.deepEqual(requiredSlots(separate).map(s=>s.target),[[1868,1036],[296,1036]]);
});

test('switching unified to split separate and back never reuses the wrong image slots or acceptances',()=>{
 const s=sessionFixture(),measurements=structuredClone(s.inventory.measurement);acceptBackground(s);choosePalette(s,{mode:'custom',colors:['#402030']});
 const revision=completeRevision(s);s.previews.complete={revision,applied:true,uncoveredScene:false,contrast:{passed:true}};confirm(s,'complete',revision,'Synthetic acceptance');
 selectLayout(s,{...s.selection,mode:'separate',sidebarSplit:true});assert.deepEqual(s.assets,{});assert.equal(s.confirmations.background,undefined);assert.equal(s.confirmations.complete,undefined);assert.deepEqual(s.inventory.measurement,measurements);
 assert.deepEqual(requiredSlots(s).map(x=>[x.id,x.target]),[['chat',[1868,1036]],['sidebar',[296,1036]],['sidebarHeader',[296,120]],['sidebarBody',[296,916]]]);
 for(const slot of requiredSlots(s))s.assets[slot.id]={file:'fixture.png',hash:'b'.repeat(64),target:slot.target,subject:[.45,.3,.55,.7],colors:['#402030'],overlay:.35};
 const split=buildManifest(s);assert.equal(split.scene.scope,'main');assert.deepEqual(split.scene.placements.at(-1).frame,[52,44,1868,1036]);assert.equal(split.sidebarLayout.mode,'split');assert.deepEqual(requiredAssets(split).sort(),['assets/chat.png','assets/sidebar.png','assets/sidebarBody.png','assets/sidebarHeader.png']);
 acceptBackground(s);choosePalette(s,{mode:'custom',colors:['#402030']});assert.equal(buildManifest(s,'complete').sidebarLayout.mode,'split');
 selectLayout(s,{...s.selection,mode:'unified'});assert.equal(s.selection.sidebarSplit,false);assert.deepEqual(s.assets,{});assert.deepEqual(requiredSlots(s).map(x=>[x.id,x.target]),[['scene',[1920,1080]]]);
 s.assets.scene={file:'fixture.png',hash:'c'.repeat(64),target:[1920,1080],subject:[.45,.3,.55,.7],colors:['#402030'],overlay:.35};const again=buildManifest(s);assert.equal(again.scene.scope,'window');assert.equal(again.sidebarLayout,undefined);assert.deepEqual(requiredAssets(again),['assets/scene.png']);assert.deepEqual(s.inventory.measurement,measurements);
});
test('separate image forms allow independent header controls while unified scenes retain their images',()=>{
 const options={
  mode:'custom',colors:['#21192F'],style:{text:'#FFFFFF'},
  regionStyles:{
   titlebar:{surface:'#21192F'},navigation:null,
   chatHeader:{surface:null,text:'#FFFFFF'},pageHeaders:{surface:null,text:'#FFFFFF'}
  }
 };
 for(const mode of ['unified','separate']){
  const s=sessionFixture(mode);s.selection.regions.push('chatHeader','pageHeaders');s.catalog.regions.push(...['chatHeader','pageHeaders'].map(key=>({key,requiresAdapterReview:false})));s.foregrounds.chatHeader=s.foregrounds.pageHeaders=['#FFFFFF'];acceptBackground(s);
  const background=backgroundRevision(s),before=buildManifest(s);
  if(mode==='unified'){
   const saved=structuredClone(s);for(const key of ['titlebar','navigation','chatHeader','pageHeaders','chat','sidebar']){assert.throws(()=>choosePalette(s,{...options,regionStyles:{[key]:null}}),/selected control region/);assert.deepEqual(s,saved);}
   choosePalette(s,{mode:'custom',colors:['#21192F'],style:{text:'#FFFFFF'}});const m=buildManifest(s,'complete');assert.equal(m.scene.scope,'window');for(const key of ['titlebar','navigation','chatHeader','pageHeaders']){assert.ok(m.scene.regions.includes(key));assert.equal(m.regions[key].style,undefined);}
  }else{
   choosePalette(s,options);const m=buildManifest(s,'complete');assert.deepEqual(m.scene.regions,['chat']);assert.equal(m.scene.scope,'main');assert.equal(m.regions.titlebar.style.surface,'#21192F');assert.equal(m.regions.navigation,undefined);
   for(const key of ['chatHeader','pageHeaders']){assert.equal(m.regions[key].style.surfaceOpacity,0);assert.equal(m.regions[key].style.text,'#FFFFFF');}
   for(const key of ['chat','sidebar'])assert.throws(()=>choosePalette(s,{...options,regionStyles:{[key]:null}}),/selected control region/);
  }
  assert.deepEqual(buildManifest(s),before);assert.equal(backgroundRevision(s),background);assert.equal(s.confirmations.background.revision,background);
 }
});

test('separate header color failures are rejected before replacing the current palette or acceptance',()=>{
 const s=sessionFixture('separate');s.selection.regions.push('pageHeaders');s.catalog.regions.push({key:'pageHeaders',requiresAdapterReview:false});s.foregrounds.pageHeaders=['#FFFFFF'];acceptBackground(s);
 choosePalette(s,{mode:'custom',colors:['#21192F'],style:{text:'#FFFFFF'}});let saved=structuredClone(s);
 assert.throws(()=>choosePalette(s,{mode:'custom',colors:['#21192F'],style:{text:'#FFFFFF'},regionStyles:{pageHeaders:{surface:'#FFFFFF'}}}),/EXPLICIT_CONTRAST_CONFLICT: pageHeaders/);assert.deepEqual(s,saved);
 delete s.foregrounds.pageHeaders;saved=structuredClone(s);assert.throws(()=>choosePalette(s,{mode:'custom',colors:['#21192F'],style:{border:'#A88AC8'}}),/Missing foreground color samples for pageHeaders/);assert.deepEqual(s,saved);
});

test('custom hover styling is exported in both forms without invalidating accepted backgrounds',()=>{
 for(const mode of ['unified','separate']){
  const s=sessionFixture(mode);acceptBackground(s);const bg=backgroundRevision(s);
  choosePalette(s,{mode:'custom',colors:['#21192F'],style:{text:'#FFFFFF'},hover:{surface:'#8050b5',surfaceOpacity:.38}});
  assert.deepEqual(buildManifest(s,'complete').hover,{surface:'#8050B5',surfaceOpacity:.38});assert.equal(backgroundRevision(s),bg);assert.equal(s.confirmations.background.revision,bg);
  const saved=structuredClone(s);
  for(const hover of [{surface:'#8050B5',surfaceOpacity:1.1},{surface:'#8050B5',surfaceOpacity:-.1},{surface:'#8050B5',surfaceOpacity:'0.38'},{surface:'purple',surfaceOpacity:.38},{surface:'#8050B5',surfaceOpacity:.38,css:'body{}'}]){
   assert.throws(()=>choosePalette(s,{mode:'custom',colors:['#21192F'],style:{text:'#FFFFFF'},hover}),/Invalid hover style/);assert.deepEqual(s,saved);
  }
 }
});

test('shared scene validation rejects executable data, forged placements and conflicting backgrounds',()=>{
 const original=buildManifest(sessionFixture());for(const mutate of [m=>m.schemaVersion=1,m=>m.scene.regions.push('buttons'),m=>m.scene.css='body{}',m=>m.scene.background.maxScale=2,m=>m.regions.chat.background=m.scene.background,m=>m.scene.placements[0].image[0]=100,m=>m.scene.placements[0].frame[0]=-1]){const m=structuredClone(original);mutate(m);assert.throws(()=>validateManifest(m));}
 assert.equal(opacityOptions(original).filter(o=>o.key==='scene.background.blackOverlay').length,1);
 const adjusted=withOpacityOverrides(original,{'scene.background.blackOverlay':.6});assert.equal(adjusted.scene.background.blackOverlay,.6);assert.equal(original.scene.background.blackOverlay,.35);
});
test('known window geometry is reused and new sizes use a bounded placement cache',()=>{
 const m=buildManifest(sessionFixture()),cache=new Map(),s=m.scene;
 const a=scenePlacement(s,[1280,720],1,[0,0,1280,720],[1920,1080],cache);assert.equal(a.precomputed,true);assert.deepEqual([a.x,a.y,a.width,a.height],[0,0,1280,720]);
 // Object reuse proves the explicitly requested cache hit, rather than re-running fitting.
 assert.equal(scenePlacement(s,[1280,720],1,[0,0,1280,720],[1920,1080],cache),a);
 for(let w=1000;w<1012;w++)scenePlacement(s,[w,600],1,[0,0,w,600],[1920,1080],cache);assert.equal(cache.size,8);
 const first=sharedSceneFit({width:100,height:50,left:0,top:0,sourceWidth:200,sourceHeight:100,subject:[.4,.2,.6,.8]}),second=sharedSceneFit({width:100,height:50,left:30,top:10,sourceWidth:200,sourceHeight:100,subject:[.4,.2,.6,.8]});assert.equal(first.width,100);assert.equal(second.width,100);assert.equal(first.x,second.x+30);assert.equal(first.y,second.y+10);
});
test('a new translation file extends Creator without source edits and preserves English fallback',async t=>{
 const folder=await temporary(t),en={locale:'en',name:'English',messages:{greeting:'Hello {name}',fallback:'Fallback'},regions:{chat:'Main'},errors:{'*':'Error: {detail}'}};
 await writeFile(path.join(folder,'en.json'),JSON.stringify(en));await writeFile(path.join(folder,'fr.json'),JSON.stringify({locale:'fr',name:'Français',messages:{greeting:'Bonjour {name}'},regions:{chat:'Principal'}}));
 const languages=await loadLocales(folder),bundle=localeBundle(languages,'fr-FR');assert.equal(selectLanguage(languages,'fr-FR'),'fr');assert.equal(translate(bundle,'greeting',{name:'A'}),'Bonjour A');assert.equal(translate(bundle,'fallback'),'Fallback');assert.equal(bundle.regions.chat,'Principal');
 const s=sessionFixture();selectLayout(s,{...s.selection,language:'fr'},Object.keys(languages));assert.equal(s.selection.language,'fr');
 await writeFile(path.join(folder,'fr.json'),JSON.stringify({locale:'fr',name:'Français',messages:{greeting:'Bonjour'}}));await assert.rejects(loadLocales(folder),/placeholders/);
 assert.throws(()=>validateLocale({locale:'fr',name:'French',messages:{}},'de.json'));
 const real=localeBundle(await loadLocales(),'zh-CN');assert.equal(translate(real,'palette.confirm'),'确认选色');assert.match(localizeError(real,'SOURCE_TOO_SMALL: provide an image at least 1920x1080'),/1920x1080/);
});
test('numbered catalogs contain structural diagrams and escaped labels, not private content',async t=>{
 const directory=await temporary(t),bundle=localeBundle(await loadLocales(),'en');bundle.regions.chat='<script>private-looking label</script>';
 const raw={clientVersion:'v',adapterVersion:'v',coverageLabels:['home'],coverage:{states:[]},samples:[{label:'home',viewport:[100,50],regionCoverage:[{key:'chat',matched:1,visible:1,samples:[{visible:true,rect:[10,5,80,40]}]}],candidates:[]}]};
 const catalog=makeCatalog(raw);await writeCatalog(directory,raw,catalog,bundle);const svg=await readFile(path.join(directory,'layout-1.svg'),'utf8'),html=await readFile(path.join(directory,'index.html'),'utf8');
 assert.match(svg,/x="10" y="5" width="80" height="40"/);assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));assert.ok(html.includes('form-examples.svg'));assert.ok((await readdir(directory)).includes('layout-1.svg'));
});
test('both image forms preserve bubble alpha and expose independently adjustable corner decoration opacity',()=>{
 for(const mode of ['unified','separate']){
  const s=sessionFixture(mode);acceptBackground(s);const background=backgroundRevision(s);
  const ornament={pattern:'cross-emblem',orientation:'horizontal',color:'#30223F',accent:'#8DC6E8',opacity:.4,scale:.5,placement:'top-right',offset:[6,2]};
  choosePalette(s,{mode:'custom',colors:['#21192F'],style:{text:'#FFFFFF'},regionStyles:{userMessages:{surface:'#542B87',surfaceOpacity:.85}},ornaments:{menus:ornament}});
  const m=buildManifest(s,'complete');assert.equal(m.regions.userMessages.style.surfaceOpacity,.85);assert.equal(m.regions.userMessages.style.text,'#FFFFFF');assert.deepEqual(m.regions.menus.ornament,ornament);assert.equal(backgroundRevision(s),background);
  const options=opacityOptions(m),bubble=options.find(o=>o.key==='regions.userMessages.style.surfaceOpacity'),badge=options.find(o=>o.key==='regions.menus.ornament.opacity');assert.equal(bubble.value,.85);assert.equal(badge.value,.4);
  const adjusted=withOpacityOverrides(m,{[bubble.key]:.7,[badge.key]:.2});assert.equal(adjusted.regions.userMessages.style.surfaceOpacity,.7);assert.equal(adjusted.regions.userMessages.style.text,'#FFFFFF');assert.equal(adjusted.regions.menus.ornament.opacity,.2);assert.equal(m.regions.userMessages.style.surfaceOpacity,.85);
  const css=declarations(m.regions.userMessages.style);assert.match(css,/background-color:rgba\(84,43,135,0.85\)/);assert.doesNotMatch(css,/(^|;)opacity:/);
 }
});

test('corner emblems have bounded data geometry and do not replace legacy decoration semantics',()=>{
 const emblem={pattern:'cross-emblem',orientation:'horizontal',color:'#30223F',accent:'#8DC6E8',opacity:.4,scale:.5,placement:'top-right',offset:[154,8]};
 const css=decorationCss({ornament:emblem});assert.equal(css.backgroundSize,'64px 16px');assert.equal(css.backgroundPosition,'right 154px top 8px');assert.equal(css.backgroundRepeat,'no-repeat');assert.match(decodeURIComponent(css.backgroundImage),/opacity="0.4"/);
 const combined=decorationCss({ornament:emblem,gradient:{angle:90,stops:[{color:'#000000',at:0},{color:'#222222',at:1}]}});assert.equal(combined.backgroundPosition,'right 154px top 8px,center');
 const rose=decorationCss({ornament:{pattern:'rose-vines',orientation:'horizontal',color:'#112233',accent:'#445566',opacity:.3}});assert.equal(rose.backgroundRepeat,'repeat-x');assert.equal(rose.backgroundPosition,'center');
 for(const change of [{offset:[-1,0]},{offset:[0,257]},{offset:[0,NaN]},{offset:[0]},{placement:'url(evil)'},{asset:'assets/bad.png'},{pattern:'arbitrary-svg'}])assert.throws(()=>validateManifest({schemaVersion:1,id:'fixture-skin',name:'Fixture',regions:{menus:{enabled:true,ornament:{...emblem,...change}}}}));
});

test('invalid alpha or ornament configuration cannot replace accepted colors or override shared images',()=>{
 const s=sessionFixture('separate');acceptBackground(s);choosePalette(s,{mode:'custom',colors:['#21192F'],style:{text:'#FFFFFF'}});const before=structuredClone(s);
 const base={mode:'custom',colors:['#21192F'],style:{text:'#FFFFFF'}},badge={pattern:'cross-emblem',orientation:'horizontal',color:'#30223F',accent:'#8DC6E8',opacity:.4};
 for(const input of [...[-.1,1.1,NaN,'0.85'].map(surfaceOpacity=>({...base,regionStyles:{userMessages:{surfaceOpacity}}})),{...base,regionStyles:{userMessages:{surface:null,surfaceOpacity:.85}}},{...base,ornaments:{chat:badge}},{...base,ornaments:{menus:{...badge,pattern:'image',asset:'assets/missing.png'}}},{...base,regionStyles:{menus:null},ornaments:{menus:badge}}]){assert.throws(()=>choosePalette(s,input));assert.deepEqual(s,before);}
 const unified=sessionFixture();acceptBackground(unified);assert.throws(()=>choosePalette(unified,{...base,ornaments:{titlebar:badge}}));
});

test('brief continuation keeps revision and coverage limits without querying the system locale again',async t=>{
 const directory=await temporary(t,path.join(ROOT,'Skin_Creator','work')),s=sessionFixture();await writeFile(path.join(directory,'session.json'),JSON.stringify(s));
 const previous=Object.fromEntries(['CODEX_SKIN_HOST_BACKEND','CODEX_SKIN_PYTHON'].map(k=>[k,process.env[k]]));t.after(()=>{for(const [k,v]of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 process.env.CODEX_SKIN_HOST_BACKEND='python';process.env.CODEX_SKIN_PYTHON=path.join(directory,'nonexistent-python.exe');
 const full=await run(['status','--session',directory]),brief=await run(['status','--session',directory,'--format','brief']);
 assert.equal(brief.mode,full.selection.mode);assert.equal(brief.regions,full.selection.regions.length);assert.deepEqual(brief.inventory,full.inventory);assert.equal(brief.backgroundRevision,full.backgroundRevision);assert.equal(brief.language,full.language);assert.equal(brief.languages,undefined);assert.ok(JSON.stringify(brief).length<JSON.stringify(full).length);
 await assert.rejects(run(['status','--session',directory,'--format','unknown']),/Unknown/);
});

test('safe navigation uses structural postconditions and refuses ambiguous or focused editing states',async t=>{
 const previous=new Map(['document','window','requestAnimationFrame','getComputedStyle'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));t.after(()=>{for(const [k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}});
 let clicks=0,selected=false;const node={isConnected:true,getBoundingClientRect:()=>({width:20,height:20}),getAttribute:k=>k==='data-sidebar-destination'?'builtin:home':k==='aria-current'&&selected?'page':null,closest:()=>null,matches:()=>false,click(){clicks++;selected=true;}};
 globalThis.getComputedStyle=()=>({visibility:'visible'});
 globalThis.window={};globalThis.requestAnimationFrame=fn=>fn();globalThis.document={activeElement:{matches:()=>true},querySelectorAll:selector=>selector.startsWith('[data-sidebar-destination')?[node]:[],querySelector:()=>null};assert.equal(saveNavigation().ready,false);
 document.activeElement={matches:()=>false};assert.equal(navigationReached('destination','home'),false);assert.deepEqual(navigateKnown('destination','home'),{requested:true});assert.equal(clicks,1);assert.equal(navigationReached('destination','home'),true);
 saveNavigation();assert.equal(await restoreNavigation(true),true);document.querySelectorAll=()=>[node,node];assert.equal(navigateKnown('destination','home').requested,false);assert.equal(sidebarState(true).requested,false);
});
test('offline export contains only referenced data and refuses overwrite, stale acceptance and changed assets',async t=>{
 const directory=await temporary(t,path.join(ROOT,'Skin_Creator','work')),s=sessionFixture();
 s.selection.regions=['chat'];s.catalog.regions=[{key:'chat',requiresAdapterReview:false}];s.inventory.coverage.states=[{id:'home',status:'observed',regions:['chat']}];s.inventory.measurement={maximized:true,pixelRatio:1,canvas:{window:[1,1],main:[1,1],mainOrigin:[0,0]},windowed:{pixelRatio:1,canvas:{window:[1,1],main:[1,1],mainOrigin:[0,0]}}};
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII=','base64');await mkdir(path.join(directory,'assets'));await writeFile(path.join(directory,'assets','fixture.png'),png);
 await writeFile(path.join(directory,'assets','decal.png'),png);s.decalAssets={'assets/decal-badge.png':{file:'assets/decal.png',hash:createHash('sha256').update(png).digest('hex'),source:'private-source.png'},'assets/unused.png':{file:'private-unused.png',hash:'not-exported'}};
  s.assets={scene:{file:'assets/fixture.png',hash:createHash('sha256').update(png).digest('hex'),target:[1,1],subject:[.4,.4,.6,.6],colors:['#402030'],overlay:.35}};acceptBackground(s);choosePalette(s,{mode:'custom',colors:['#402030'],decals:{chat:[{asset:'assets/decal-badge.png',width:24,placement:'top-left',offset:[0,0],opacity:.5},{symbol:'A',color:'#F3EFFF',accent:'#9165BD',width:24,placement:'top-center',offset:[-40,8],opacity:.8}]}});const revision=completeRevision(s);s.previews.complete={revision,applied:true,uncoveredScene:false,contrast:{passed:true}};confirm(s,'complete',revision,'Synthetic acceptance');
 await writeFile(path.join(directory,'session.json'),JSON.stringify(s));const destination=path.join(directory,'result');await run(['export','--session',directory,'--output',destination]);
 assert.deepEqual((await readdir(destination)).sort(),['assets','manifest.json']);assert.deepEqual((await readdir(path.join(destination,'assets'))).sort(),['decal-badge.png','scene.png']);assert.deepEqual(await readFile(path.join(destination,'assets','scene.png')),png);assert.deepEqual(await readFile(path.join(destination,'assets','decal-badge.png')),png);
 const manifest=JSON.parse(await readFile(path.join(destination,'manifest.json'),'utf8'));assert.equal(manifest.id,'fixture-skin');assert.equal(manifest.source,undefined);assert.equal(manifest.confirmations,undefined);assert.equal(manifest.regions.chat.decals[1].symbol,'A');assert.equal(manifest.regions.chat.decals[1].asset,undefined);
 await assert.rejects(run(['export','--session',directory,'--output',destination]),/already exists/);
  s.previews.complete.contrast={passed:false};await writeFile(path.join(directory,'session.json'),JSON.stringify(s));await assert.rejects(run(['export','--session',directory,'--output',path.join(directory,'contrast-blocked')]),/actual control contrast/);assert.equal((await readdir(directory)).includes('contrast-blocked'),false);
  s.previews.complete.contrast={passed:true};await writeFile(path.join(directory,'session.json'),JSON.stringify(s));
 await writeFile(path.join(directory,'assets','decal.png'),Buffer.from('changed'));await assert.rejects(run(['export','--session',directory,'--output',path.join(directory,'decal-blocked')]),/Decal changed/);assert.equal((await readdir(directory)).includes('decal-blocked'),false);await writeFile(path.join(directory,'assets','decal.png'),png);
 await writeFile(path.join(directory,'assets','fixture.png'),Buffer.from('changed'));await assert.rejects(run(['export','--session',directory,'--output',path.join(directory,'second')]),/Asset changed/);
 assert.equal((await readdir(directory)).includes('second'),false);
});
