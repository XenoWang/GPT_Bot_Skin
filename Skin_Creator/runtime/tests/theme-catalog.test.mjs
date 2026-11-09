import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundledPacks} from '../scripts/build-cdp-payload.mjs';

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

test('Usage bundles the requested unified Sakura data while Creator retains its original sample set',async()=>{
 const creator=fileURLToPath(new URL('../',import.meta.url)),usage=fileURLToPath(new URL('../../../Skin_Usage/runtime/',import.meta.url));
 assert.deepEqual((await bundledPacks(creator)).map(p=>p.manifest.id),['kurumi-twilight','neutral-dark']);
 const packs=await bundledPacks(usage);assert.deepEqual(packs.map(p=>p.manifest.id),['kurumi-twilight','neutral-dark','spring-sakura']);
 const p=packs[2];assert.equal(p.manifest.schemaVersion,2);assert.equal(p.manifest.scene.scope,'window');assert.equal(p.manifest.scene.background.blackOverlay,.5);assert.equal(p.manifest.regions.assistantMessages.style.surfaceOpacity,0);assert.equal(p.manifest.regions.assistantMessages.style.text,'#FFFFFF');assert.equal(p.manifest.regions.buttons,undefined);assert.deepEqual(Object.keys(p.assets),['assets/scene.png']);
 const source=JSON.parse(await readFile(path.join(usage,'themes','spring-sakura','manifest.json'),'utf8'));assert.equal(source.prompt,undefined);assert.equal(source.confirmations,undefined);assert.equal(source.source,undefined);
});
