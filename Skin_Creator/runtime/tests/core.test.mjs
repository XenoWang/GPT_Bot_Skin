import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateManifest,validatePack,fitImage,declarations,REGIONS} from '../renderer/core.mjs';
import {readPack,build} from '../scripts/build.mjs';
const basic=()=>({schemaVersion:1,id:'example',name:'示例',regions:{chat:{enabled:true,background:{asset:'assets/bg.png',blackOverlay:0.5,subject:[0,0,1,1],fit:'contain'}}}});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} versus ${b}`);

test('approved defaults retain original images and exact requested overlays',async()=>{
 const p=await readPack(fileURLToPath(new URL('../themes/kurumi-twilight/',import.meta.url)));
 assert.equal(p.manifest.regions.sidebar.background.blackOverlay,0.7);
 assert.equal(p.manifest.regions.chat.background.blackOverlay,0.5);
 assert.deepEqual(Object.entries(p.manifest.regions).filter(([,r])=>r.enabled).map(([k])=>k).sort(),['changeSummary','chat','codeBlocks','composer','dialogs','inputs','menus','navigation','pageCards','pageHeaders','profileActivity','questions','rightPanel','settings','sidebar','titlebar','tooltips','userMessages']);
 assert.equal(Object.keys(p.manifest.regions).length,28);
});
test('reject execution, remote assets, traversal, CSS escapes and invalid coefficients',()=>{
 for(const asset of ['https://evil.example/a.png','assets/../secret.png','assets/a.svg','assets/./a.png','assets//a.png']){const m=basic();m.regions.chat.background.asset=asset;assert.throws(()=>validateManifest(m));}
 for(const value of [NaN,Infinity,-0.1,1.1,'0.5',true]){const m=basic();m.regions.chat.background.blackOverlay=value;assert.throws(()=>validateManifest(m));}
 for(const property of ['script','css','selectors']){const m=basic();m[property]='arbitrary';assert.throws(()=>validateManifest(m));}
 const m=basic();m.regions.chat.style={fontFamily:'Arial;}body{display:none'};assert.throws(()=>validateManifest(m));
 m.regions.chat.style={surface:'url(https://evil.example)'};assert.throws(()=>validateManifest(m));
 m.regions.chat.style={};m.regions.chat.background.subject=[0.8,0,0.2,1];assert.throws(()=>validateManifest(m));
});
test('missing assets and remote data are rejected; unknown regions cannot widen scope',()=>{
 assert.throws(()=>validatePack({manifest:basic(),assets:{}}));
 assert.throws(()=>validatePack({manifest:basic(),assets:{'assets/bg.png':'https://evil.example/a.png'}}));
 const m=basic();m.regions['body-all']={enabled:true};assert.throws(()=>validateManifest(m));
});
test('geometry agrees with independent hand-computed cases',()=>{
 assert.deepEqual(fitImage(50,100,100,200),{scale:.5,width:50,height:100,x:0,y:0});
 assert.deepEqual(fitImage(100,100,50,50),{scale:1,width:50,height:50,x:25,y:25});
 assert.deepEqual(fitImage(100,200,400,200,[.4,.1,.6,.9]),{scale:1,width:400,height:200,x:-150,y:0});
 const f=fitImage(200,100,100,400,[.1,.2,.9,.8]);close(f.scale,5/12);close(f.y,-100/3);
});
test('foreground preserves aspect ratio, native scale and all protected bounds',()=>{
 const pictures=[[724,2172,[110/724,225/2172,605/724,2100/2172]],[1536,1024,[325/1536,10/1024,1190/1536,1000/1024]]];
 for(const [sw,sh,roi]of pictures)for(const [w,h]of [[296,1032],[296,620],[1568,1032],[900,700],[400,900],[300,200]]){
  const f=fitImage(w,h,sw,sh,roi);assert.ok(f.scale>0&&f.scale<=1);close(f.width/f.height,sw/sh);
  assert.ok(f.x+roi[0]*sw*f.scale>=-1e-9);assert.ok(f.x+roi[2]*sw*f.scale<=w+1e-9);
  assert.ok(f.y+roi[1]*sh*f.scale>=-1e-9);assert.ok(f.y+roi[3]*sh*f.scale<=h+1e-9);
 }
});
test('style output never changes element opacity; background alpha is separate',()=>{
 const css=declarations({surface:'#102030',surfaceOpacity:.3,text:'#ffffff',radius:8});
 assert.match(css,/background-color:rgba\(16,32,48,0.3\)/);assert.match(css,/border-radius:8px/);assert.doesNotMatch(css,/(^|;)opacity:/);
});
test('theme engine build includes native loader resources, not a success marker',async()=>{
 const destination=await mkdtemp(path.join(process.env.CODEX_THEME_TEST_ROOT,'build-'));
 await build(destination);
 const p=validatePack(JSON.parse(await readFile(path.join(destination,'builtin.json'),'utf8')));
 assert.equal(p.manifest.id,'kurumi-twilight');assert.ok(p.assets['assets/sidebar.png'].length>1000);
 assert.equal(REGIONS.length,28);const adapter=JSON.parse(await readFile(path.join(destination,'adapter.json'),'utf8'));
 assert.equal(adapter.regions.chat[0],"[data-app-shell-main-surface='default']");
});
