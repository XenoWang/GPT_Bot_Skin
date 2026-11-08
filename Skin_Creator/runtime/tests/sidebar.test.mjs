import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManifest,validatePack,requiredAssets,sidebarSections,fitImage} from '../renderer/core.mjs';
const background=asset=>({asset,blackOverlay:.7,subject:[0,0,1,1],fit:'contain',maxScale:1,blurFill:true});
const theme=()=>({schemaVersion:1,id:'split-example',name:'分区示例',regions:{sidebar:{enabled:true,background:background('assets/body.png')}},sidebarLayout:{mode:'split',header:{...background('assets/header.png'),blackOverlay:.5},divider:{color:'#8791a3',opacity:.5,width:1,inset:12}}});

test('merged and split layouts retain independent header and body parameters',()=>{
 for(const mode of ['merged','split']){const m=theme();m.sidebarLayout.mode=mode;const result=validateManifest(m);assert.equal(result.sidebarLayout.mode,mode);assert.equal(result.regions.sidebar.background.blackOverlay,.7);assert.equal(result.sidebarLayout.header.blackOverlay,.5);assert.equal(result.sidebarLayout.divider.width,1);}
 const old=theme();delete old.sidebarLayout;assert.equal(validateManifest(old).sidebarLayout,undefined);
});
test('both images remain required for instant switching, missing header is rejected',()=>{
 const m=theme();m.sidebarLayout.mode='merged';assert.deepEqual(requiredAssets(m),['assets/body.png','assets/header.png']);
 assert.throws(()=>validatePack({manifest:m,assets:{'assets/body.png':'data:image/png;base64,AAAA'}}));
});
test('split configuration rejects unsafe references and invalid divider geometry',()=>{
 for(const mode of ['other',null,true]){const m=theme();m.sidebarLayout.mode=mode;assert.throws(()=>validateManifest(m));}
 for(const opacity of [-1,2,NaN,'0.5']){const m=theme();m.sidebarLayout.header.blackOverlay=opacity;assert.throws(()=>validateManifest(m));}
 for(const [key,value]of [['width',-1],['width',5],['opacity',2],['inset',100],['color','url(https://example.com)']]){const m=theme();m.sidebarLayout.divider[key]=value;assert.throws(()=>validateManifest(m));}
 const m=theme();m.sidebarLayout.header.asset='assets/../private.png';assert.throws(()=>validateManifest(m));
 const selector=theme();selector.sidebarLayout.selector='body';assert.throws(()=>validateManifest(selector));
});
test('split follows measured native header; merged and unavailable header use full body',()=>{
 assert.deepEqual(sidebarSections(708,121,'split'),{split:true,headerHeight:121,bodyTop:121,bodyHeight:587});
 assert.deepEqual(sidebarSections(1032,160,'split'),{split:true,headerHeight:160,bodyTop:160,bodyHeight:872});
 assert.deepEqual(sidebarSections(708,121,'merged'),{split:false,headerHeight:0,bodyTop:0,bodyHeight:708});
 for(const missing of [NaN,undefined,0,900])assert.deepEqual(sidebarSections(708,missing,'split'),{split:false,headerHeight:0,bodyTop:0,bodyHeight:708});
});
test('portrait subject stays in the reduced project region without upscaling',()=>{
 const sw=724,sh=2172,roi=[110/sw,225/sh,605/sw,2100/sh];
 const fit=fitImage(296,587,sw,sh,roi);
 assert.ok(fit.scale<=1);assert.ok(Math.abs(fit.width/fit.height-sw/sh)<1e-10);
 assert.ok(fit.y+225*fit.scale>=-1e-9);assert.ok(fit.y+2100*fit.scale<=587+1e-9);
 assert.ok(fit.x+110*fit.scale>=-1e-9);assert.ok(fit.x+605*fit.scale<=296+1e-9);
});
