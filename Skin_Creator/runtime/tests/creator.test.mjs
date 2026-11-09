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
import {validateManifest,requiredAssets,scenePlacement,sharedSceneFit,opacityOptions,withOpacityOverrides} from '../renderer/core.mjs';
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
test('safe navigation uses structural postconditions and refuses ambiguous or focused editing states',async t=>{
 const previous=new Map(['document','window','requestAnimationFrame','getComputedStyle'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));t.after(()=>{for(const [k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}});
 let clicks=0,selected=false;const node={isConnected:true,getBoundingClientRect:()=>({width:20,height:20}),getAttribute:k=>k==='aria-current'&&selected?'page':null,closest:()=>null,matches:()=>false,click(){clicks++;selected=true;}};
 globalThis.getComputedStyle=()=>({visibility:'visible'});
 globalThis.window={};globalThis.requestAnimationFrame=fn=>fn();globalThis.document={activeElement:{matches:()=>true},querySelectorAll:()=>[node],querySelector:()=>null};assert.equal(saveNavigation().ready,false);
 document.activeElement={matches:()=>false};assert.equal(navigationReached('destination','home'),false);assert.deepEqual(navigateKnown('destination','home'),{requested:true});assert.equal(clicks,1);assert.equal(navigationReached('destination','home'),true);
 saveNavigation();assert.equal(await restoreNavigation(true),true);document.querySelectorAll=()=>[node,node];assert.equal(navigateKnown('destination','home').requested,false);assert.equal(sidebarState(true).requested,false);
});
test('offline export contains only referenced data and refuses overwrite, stale acceptance and changed assets',async t=>{
 const directory=await temporary(t,path.join(ROOT,'Skin_Creator','work')),s=sessionFixture();
 s.selection.regions=['chat'];s.catalog.regions=[{key:'chat',requiresAdapterReview:false}];s.inventory.coverage.states=[{id:'home',status:'observed',regions:['chat']}];s.inventory.measurement={maximized:true,pixelRatio:1,canvas:{window:[1,1],main:[1,1],mainOrigin:[0,0]},windowed:{pixelRatio:1,canvas:{window:[1,1],main:[1,1],mainOrigin:[0,0]}}};
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII=','base64');await mkdir(path.join(directory,'assets'));await writeFile(path.join(directory,'assets','fixture.png'),png);
  s.assets={scene:{file:'assets/fixture.png',hash:createHash('sha256').update(png).digest('hex'),target:[1,1],subject:[.4,.4,.6,.6],colors:['#402030'],overlay:.35}};acceptBackground(s);choosePalette(s,{mode:'custom',colors:['#402030']});const revision=completeRevision(s);s.previews.complete={revision,applied:true,uncoveredScene:false,contrast:{passed:true}};confirm(s,'complete',revision,'Synthetic acceptance');
 await writeFile(path.join(directory,'session.json'),JSON.stringify(s));const destination=path.join(directory,'result');await run(['export','--session',directory,'--output',destination]);
 assert.deepEqual((await readdir(destination)).sort(),['assets','manifest.json']);assert.deepEqual(await readdir(path.join(destination,'assets')),['scene.png']);assert.deepEqual(await readFile(path.join(destination,'assets','scene.png')),png);
 const manifest=JSON.parse(await readFile(path.join(destination,'manifest.json'),'utf8'));assert.equal(manifest.id,'fixture-skin');assert.equal(manifest.source,undefined);assert.equal(manifest.confirmations,undefined);
 await assert.rejects(run(['export','--session',directory,'--output',destination]),/already exists/);
  s.previews.complete.contrast={passed:false};await writeFile(path.join(directory,'session.json'),JSON.stringify(s));await assert.rejects(run(['export','--session',directory,'--output',path.join(directory,'contrast-blocked')]),/actual control contrast/);assert.equal((await readdir(directory)).includes('contrast-blocked'),false);
  s.previews.complete.contrast={passed:true};await writeFile(path.join(directory,'session.json'),JSON.stringify(s));
 await writeFile(path.join(directory,'assets','fixture.png'),Buffer.from('changed'));await assert.rejects(run(['export','--session',directory,'--output',path.join(directory,'second')]),/Asset changed/);
 assert.equal((await readdir(directory)).includes('second'),false);
});
