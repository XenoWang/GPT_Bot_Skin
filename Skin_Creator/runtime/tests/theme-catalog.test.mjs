import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundledPacks} from '../scripts/build-cdp-payload.mjs';
import {createHash} from 'node:crypto';
import {opacityOptions,withOpacityOverrides} from '../renderer/core.mjs';

async function fixture(t){
 const parent=process.env.CODEX_THEME_TEST_ROOT;assert.ok(parent);const root=await mkdtemp(path.join(parent,'catalog-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const id of ['kurumi-twilight','neutral-dark','extra-skin']){const dir=path.join(root,'themes',id);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'manifest.json'),JSON.stringify({schemaVersion:1,id,name:'Synthetic Skin',regions:{chat:{enabled:true,style:{surface:'#202020'}}}}));}
 return root;
}

test('package catalog adds local data without changing the original default order',async t=>{
 const root=await fixture(t);assert.deepEqual((await bundledPacks(root)).map(p=>p.manifest.id),['kurumi-twilight','neutral-dark']);
 await writeFile(path.join(root,'theme-catalog.json'),JSON.stringify({schemaVersion:1,skinIds:['kurumi-twilight','neutral-dark','extra-skin']}));
 assert.deepEqual((await bundledPacks(root)).map(p=>p.manifest.id),['kurumi-twilight','neutral-dark','extra-skin']);
});

test('catalog rejects traversal duplicates changed defaults identity mismatch and oversized input',async t=>{
 const root=await fixture(t),file=path.join(root,'theme-catalog.json');
 for(const skinIds of [['neutral-dark','kurumi-twilight'],['kurumi-twilight','neutral-dark','../outside'],['kurumi-twilight','neutral-dark','neutral-dark']]){await writeFile(file,JSON.stringify({schemaVersion:1,skinIds}));await assert.rejects(bundledPacks(root),/Invalid theme catalog/);}
 await writeFile(file,' '.repeat(16385));await assert.rejects(bundledPacks(root),/exceeds/);
 await writeFile(file,JSON.stringify({schemaVersion:1,skinIds:['kurumi-twilight','neutral-dark','extra-skin']}));
 await writeFile(path.join(root,'themes','extra-skin','manifest.json'),JSON.stringify({schemaVersion:1,id:'different-skin',name:'Synthetic',regions:{chat:{enabled:true,style:{surface:'#202020'}}}}));await assert.rejects(bundledPacks(root),/identity mismatch/);
});

test('Usage preserves the locked separate theme artwork, split layout and adjustable decoration fields',async()=>{
 const usage=fileURLToPath(new URL('../../../Skin_Usage/runtime/',import.meta.url)),p=(await bundledPacks(usage)).find(p=>p.manifest.id==='planeptune-sisters'),m=p.manifest;
 assert.equal(m.name,'紫耀双星');assert.equal(m.schemaVersion,2);assert.equal(m.scene.scope,'main');assert.deepEqual(m.scene.regions,['chat']);assert.equal(m.sidebarLayout.mode,'split');
 assert.deepEqual(m.scene.placements.map(p=>p.viewport),[[1342,756],[1920,1032]]);assert.deepEqual(m.scene.placements[1].frame,[52,44,1868,988]);
 for(const bg of [m.scene.background,m.regions.sidebar.background,m.sidebarLayout.header,m.sidebarLayout.body]){assert.equal(bg.blackOverlay,.6);assert.equal(bg.blurFill,false);assert.equal(bg.maxScale,1);}
 assert.equal(m.regions.userMessages.style.surface,'#542B87');assert.equal(m.regions.userMessages.style.surfaceOpacity,.85);assert.equal(m.regions.userMessages.style.text,'#FFFFFF');assert.equal(m.regions.assistantMessages.style.surfaceOpacity,0);
 assert.deepEqual(m.regions.titlebar.decals.map(d=>d.symbol??d.asset),['assets/decal-hairclip.png','A','B','X','Y','assets/decal-n.png']);assert.deepEqual(m.regions.navigation.decals.map(d=>d.symbol),['up','left','right','down']);assert.equal(m.regions.sidebar.decals,undefined);
 assert.deepEqual(Object.keys(p.assets).sort(),['assets/chat.png','assets/decal-hairclip.png','assets/decal-n.png','assets/sidebar.png','assets/sidebarBody.png','assets/sidebarHeader.png']);
 // Fingerprint comes from the user-accepted final pose lock, before Usage integration.
 assert.equal(createHash('sha256').update(Buffer.from(p.assets['assets/chat.png'].split(',')[1],'base64')).digest('hex'),'64f8aa1c0cdc2992121324dd0e5085f7b447eb2ae67cc41ff30843876be63090');
 const options=opacityOptions(m);assert.equal(options.length,39);assert.equal(options.filter(o=>o.key.includes('.decals.')).length,10);
 const changed=withOpacityOverrides(m,{'scene.background.blackOverlay':.4,'regions.userMessages.style.surfaceOpacity':.7,'regions.navigation.decals.2.opacity':.3});assert.equal(changed.scene.background.blackOverlay,.4);assert.equal(changed.regions.userMessages.style.surfaceOpacity,.7);assert.equal(changed.regions.navigation.decals[2].opacity,.3);assert.equal(m.scene.background.blackOverlay,.6);assert.equal(m.regions.userMessages.style.surfaceOpacity,.85);
 for(const key of ['source','prompt','confirmations','inventory','events','decalAssets'])assert.equal(m[key],undefined);
});

test('Usage bundles the requested unified Sakura data while Creator retains its original sample set',async()=>{
 const creator=fileURLToPath(new URL('../',import.meta.url)),usage=fileURLToPath(new URL('../../../Skin_Usage/runtime/',import.meta.url));
 assert.deepEqual((await bundledPacks(creator)).map(p=>p.manifest.id),['kurumi-twilight','neutral-dark']);
 const packs=await bundledPacks(usage);assert.deepEqual(packs.map(p=>p.manifest.id),['kurumi-twilight','neutral-dark','spring-sakura','planeptune-sisters']);
 const p=packs[2];assert.equal(p.manifest.schemaVersion,2);assert.equal(p.manifest.scene.scope,'window');assert.equal(p.manifest.scene.background.blackOverlay,.5);assert.equal(p.manifest.regions.assistantMessages.style.surfaceOpacity,0);assert.equal(p.manifest.regions.assistantMessages.style.text,'#FFFFFF');assert.equal(p.manifest.regions.buttons,undefined);assert.deepEqual(Object.keys(p.assets),['assets/scene.png']);
 const source=JSON.parse(await readFile(path.join(usage,'themes','spring-sakura','manifest.json'),'utf8'));assert.equal(source.prompt,undefined);assert.equal(source.confirmations,undefined);assert.equal(source.source,undefined);
});
