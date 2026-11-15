import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import {mkdtemp,mkdir,copyFile,writeFile,readdir,readFile,rm} from 'node:fs/promises';
import {lookupRecovery,recordRecovery,diagnoseTitlebar,recoveryForContrast} from '../../scripts/recovery.mjs';
import {atomicJSON} from '../../scripts/creator.mjs';
import {loadLocales,localeBundle,translate} from '../../scripts/localization.mjs';

async function sandbox(t){
 const parent=process.env.CODEX_THEME_TEST_ROOT;assert.ok(parent);const root=await mkdtemp(path.join(parent,'recovery-'));assert.equal(path.dirname(root),path.resolve(parent));
 t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(path.join(root,'references'));await mkdir(path.join(root,'work','fixture'),{recursive:true});
 await copyFile(new URL('../../references/recovery-cases.json',import.meta.url),path.join(root,'references','recovery-cases.json'));
 return {root,session:path.join(root,'work','fixture')};
}

test('recovery lookup returns bounded relevant guidance and uses configurable language text',async t=>{
 const {root}=await sandbox(t),locales=await loadLocales(),bundle=localeBundle(locales,'en');
 bundle.messages['recovery.case.titlebar.title']='Synthetic translated title';
 const result=await lookupRecovery(root,'顶栏覆盖',key=>translate(bundle,key));
 assert.equal(result.matches.length,1);assert.equal(result.matches[0].id,'CREATOR-UNIFIED-TITLEBAR-GAP-001');assert.equal(result.matches[0].title,'Synthetic translated title');assert.equal(result.matches[0].historyCount,0);
 const many=await lookupRecovery(root,'titlebar viewport popover 色偏',key=>translate(bundle,key));assert.equal(many.matches.length,3);assert.equal(many.matchedCount,4);
 const unknown=await lookupRecovery(root,'unmatched-synthetic-symptom',key=>translate(bundle,key));assert.deepEqual(unknown.matches,[]);
});

test('contrast failures use region metadata to return foreground guidance without echoing content',async t=>{
 const {root}=await sandbox(t),locales=await loadLocales(),bundle=localeBundle(locales,'zh-CN'),tkey=key=>translate(bundle,key);
 const report={passed:false,violations:[{region:'titlebar',tag:'button',kind:'text',text:'Private fixture sentence must not be echoed'}]};
 const result=await recoveryForContrast(root,report,tkey);assert.equal(result.matches[0].id,'CREATOR-CUSTOM-STYLE-001');assert.ok(result.matches.length<=3);assert.ok(!JSON.stringify(result).includes(report.violations[0].text));
 assert.equal(await recoveryForContrast('not-read-on-success',{passed:true,violations:[]},tkey),null);assert.equal(await recoveryForContrast(root,{passed:false,violations:[]},tkey),null);
});

test('verified recovery records append history and later queries find fixes without editing public cases',async t=>{
 const {root,session}=await sandbox(t),catalog=path.join(root,'references','recovery-cases.json'),before=await readFile(catalog);
 await atomicJSON(path.join(session,'before.json'),{passed:false,issues:['synthetic-gap']});await atomicJSON(path.join(session,'after.json'),{passed:true,scope:'synthetic-only'});
 const input={id:'CREATOR-UNIFIED-TITLEBAR-GAP-001',status:'observed',symptom:'Synthetic gap',resolution:'',verification:'Observed synthetic geometry only',keywords:['titlebar'],evidence:['before.json']};
 const observed=await recordRecovery(root,session,input,atomicJSON);assert.equal(observed.status,'observed');
 const resolved=await recordRecovery(root,session,{...input,status:'resolved',resolution:'Synthetic owned layer extension',verification:'Independent synthetic geometry, not native acceptance',evidence:['after.json']},atomicJSON);
 assert.notEqual(resolved.record,observed.record);const result=await lookupRecovery(root,input.id,key=>key);assert.equal(result.matches[0].historyCount,2);assert.equal(result.matches[0].lastRecord.status,'resolved');assert.equal(result.matches[0].lastRecord.resolution,'Synthetic owned layer extension');
 const saved=JSON.parse(await readFile(path.join(root,resolved.record),'utf8'));assert.match(saved.evidence[0].sha256,/^[a-f0-9]{64}$/);assert.equal(saved.evidence[0].file,'after.json');assert.equal(saved.session,'work/fixture');assert.deepEqual(await readFile(catalog),before);
 const custom={...input,id:'SYNTHETIC-CUSTOM-CASE',status:'resolved',symptom:'Custom local recovery',resolution:'Local-only correction',verification:'Synthetic verification',keywords:['local-custom-topic'],evidence:['after.json']};
 await recordRecovery(root,session,custom,atomicJSON);assert.equal((await lookupRecovery(root,'local-custom-topic',key=>key)).matches[0].id,custom.id);assert.deepEqual(await readFile(catalog),before);
});

test('recovery rejects unverified resolution and escaping evidence without appending a record',async t=>{
 const {root,session}=await sandbox(t);await atomicJSON(path.join(session,'failed.json'),{passed:false});await writeFile(path.join(root,'outside.txt'),'synthetic outside-session evidence');
 const input={id:'SYNTHETIC-GUARD-CASE',status:'resolved',symptom:'Synthetic failure',resolution:'Candidate only',verification:'Not proven',keywords:['guard'],evidence:['failed.json']};
 for(const value of [input,{...input,evidence:['../outside.txt']},{...input,evidence:[path.join(root,'outside.txt')]},{...input,evidence:['failed.json:stream']},{...input,verification:'',evidence:[]},{...input,id:'unsafe/path'}])await assert.rejects(recordRecovery(root,session,value,atomicJSON));
 await assert.rejects(readdir(path.join(root,'.local','recovery')),e=>e.code==='ENOENT');assert.equal(await readFile(path.join(root,'outside.txt'),'utf8'),'synthetic outside-session evidence');
});

function diagnostic({paint='solid',bottom=44,width=1000,emptyPaint=false,pointer='none',reference=44,themed=true}={}){
 const rect=(left,top,w,h)=>({x:left,y:top,left,top,right:left+w,bottom:top+h,width:w,height:h});
 const element=(box,css={})=>({box,css,inert:false,getBoundingClientRect(){return this.box;},closest(selector){return selector==='frame'?frame:this.inert?this:null;},get textContent(){throw Error('No content reads');},get value(){throw Error('No field reads');}});
 const frame={querySelectorAll(q){assert.equal(q,'content');return refs;}},bar=element(rect(0,0,1000,36)),content=element(rect(52,reference,948,750-reference)),zero=element(rect(0,0,0,0)),hidden=element(rect(0,0,1000,100),{visibility:'hidden'}),inert=element(rect(0,0,1000,100));inert.inert=true;
 const refs=[zero,hidden,inert,...(reference===null?[]:[content])];
 const layer=element(rect(0,0,width,bottom),{pointerEvents:pointer,backgroundColor:paint==='solid'&&!emptyPaint?'rgba(33, 25, 47, 0.5)':'rgba(0, 0, 0, 0)',backgroundImage:paint==='gradient'&&!emptyPaint?'linear-gradient(#21192F,#542B87)':'none'});
 layer.getAttribute=()=>paint==='shared'?'background-titlebar':'decoration-titlebar';layer.querySelector=q=>{assert.equal(q,'img');return paint==='shared'&&!emptyPaint?{}:null;};
 const rule={enabled:themed,style:{surface:'#21192F'}},manifest={regions:{titlebar:rule}};
 if(paint==='gradient')rule.gradient={opacity:.5};if(paint==='shared')manifest.scene={regions:['titlebar']};
 const app={adapter:{version:'26.1103.4239.0',regions:{titlebar:['bar']},titlebarGap:{scope:'frame',references:['content'],maxGap:32}},pack:{manifest},mounted:new Map([[bar,{layer}]]),creator:{revision:'synthetic-preview'}};
 const context={window:{__codexAppearanceV1:app,__codexAppearanceRevision:'synthetic-runtime'},document:{querySelectorAll(q){assert.equal(q,'bar');return [bar];}},getComputedStyle:n=>({display:'block',visibility:'visible',pointerEvents:'none',backgroundColor:'rgba(0, 0, 0, 0)',backgroundImage:'none',getPropertyValue:()=> 'none',...n.css})};
 return JSON.parse(JSON.stringify(vm.runInNewContext('('+diagnoseTitlebar.toString()+')()',context)));
}

test('titlebar diagnosis requires real painted coverage and ignores cached hidden geometry',()=>{
 for(const paint of ['solid','gradient','shared']){
  const report=diagnostic({paint});assert.equal(report.passed,true);assert.equal(report.bars[0].gap,8);assert.equal(report.bars[0].painted,true);assert.deepEqual(report.bars[0].layerBox,[0,0,1000,44]);
  assert.equal(diagnostic({paint,emptyPaint:true}).passed,false);
 }
 assert.equal(diagnostic({bottom:36}).passed,false);assert.equal(diagnostic({width:900}).passed,false);assert.equal(diagnostic({pointer:'auto'}).passed,false);
 const unknown=diagnostic({reference:null});assert.equal(unknown.passed,false);assert.ok(unknown.issues.includes('titlebar-reference-unknown'));
 const native=diagnostic({themed:false});assert.equal(native.notApplicable,true);assert.equal(native.passed,false);
});
