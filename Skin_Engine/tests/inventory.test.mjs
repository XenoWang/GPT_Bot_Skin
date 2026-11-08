import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {captureRegions,makeCatalog,mergeReports,run} from '../scripts/inspect-ui-regions.mjs';

const report=()=>({schemaVersion:1,kind:'codex-ui-inventory',clientVersion:'1.2.3',adapterVersion:'1.2.3',coverageLabels:['home'],samples:[{regionCoverage:[{key:'chat',matched:2,visible:1},{key:'sidebar',matched:1,visible:0}],candidates:[]}]});

test('catalog distinguishes observed, hidden and unobserved without enabling regions',()=>{
 const c=makeCatalog(report(),{en:{regions:{chat:'Main scene'}},'zh-CN':{regions:{chat:'主背景'}}});
 assert.equal(c.regions.length,28);assert.equal(c.regions.find(r=>r.key==='chat').status,'observed');assert.equal(c.regions.find(r=>r.key==='sidebar').status,'loaded-hidden');assert.equal(c.regions.find(r=>r.key==='dialogs').status,'not-observed');
 assert.equal(c.regions.find(r=>r.key==='chat').label.en,'Main scene');assert.equal(c.regions.find(r=>r.key==='chat').requiresAdapterReview,false);assert.equal(c.regions.find(r=>r.key==='dialogs').requiresAdapterReview,true);assert.ok(c.regions.every(r=>r.enabledByDefault===false));
 const r=report();r.samples[0].regionCoverage.push({key:'arbitrary-module',matched:1,visible:1});assert.ok(!makeCatalog(r).regions.some(x=>x.key==='arbitrary-module'));
  r.clientVersion='unsupported';assert.equal(makeCatalog(r).regions.find(x=>x.key==='chat').requiresAdapterReview,true);
});

test('merging requires equal versions and preserves per-state observations',()=>{
 const a=report(),b=report();b.coverageLabels=['dialog'];b.samples[0].regionCoverage=[{key:'dialogs',matched:1,visible:1}];const before=JSON.stringify([a,b]);
 const merged=mergeReports([a,b]);assert.deepEqual(merged.coverageLabels,['home','dialog']);assert.equal(merged.samples.length,2);assert.equal(makeCatalog(merged).regions.find(x=>x.key==='dialogs').status,'observed');assert.equal(JSON.stringify([a,b]),before);
 b.clientVersion='different';assert.throws(()=>mergeReports([a,b]),/same client/);b.clientVersion=a.clientVersion;b.adapterVersion='different';assert.throws(()=>mergeReports([a,b]),/same client/);assert.throws(()=>mergeReports([]));
});

test('scanner uses structural observations, including open shadow roots, without content reads',t=>{
 const names=['document','getComputedStyle','innerWidth','innerHeight'],old=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));t.after(()=>{for(const[k,d]of old){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 class Element{
  constructor(tag,{hidden=false,secret=false,attrs=[]}={}){this.nodeType=1;this.localName=tag;this.hidden=hidden;this.secret=secret;this.attrs=attrs;this.children=[];this.queries=new Map();}
  get textContent(){throw new Error('Content text must not be read');}get value(){throw new Error('Input values must not be read');}get innerHTML(){throw new Error('Markup must not be read');}
  matches(s){return s.startsWith('[contenteditable]')&&this.secret;}
  closest(){return null;}
  getAttribute(k){assert.equal(k,'role');return this.localName==='nav'?'navigation':null;}
  hasAttribute(k){return this.attrs.includes(k);}
  getAttributeNames(){return this.attrs;}
  getBoundingClientRect(){return {x:12,y:20,width:this.hidden?0:100,height:this.hidden?0:40};}
  querySelectorAll(s){if(s==='bad[')throw new Error('invalid selector');return this.queries.get(s)??[];}
 }
 const doc=new Element('document'),main=new Element('main',{attrs:['data-app-shell-main-surface','data-private-value']}),hidden=new Element('aside',{hidden:true}),input=new Element('input',{secret:true}),nested=new Element('nav'),shadow=new Element('shadow');
 main.children=[input];input.children=[new Element('dialog')];main.shadowRoot=shadow;shadow.children=[nested];doc.children=[main,hidden];doc.queries.set('.main',[main]);doc.queries.set('.hidden',[hidden]);shadow.queries.set('.nav',[nested]);
 globalThis.document=doc;globalThis.innerWidth=1000;globalThis.innerHeight=800;globalThis.getComputedStyle=n=>({display:'block',visibility:n.hidden?'hidden':'visible',backgroundColor:'rgba(0, 0, 0, 0)',backgroundImage:'none',borderWidth:'1px',position:'relative'});
 const r=captureRegions({regions:{chat:['.main'],sidebar:['.hidden'],menus:['.nav'],dialogs:['.missing','bad[']}});
 assert.deepEqual(r.viewport,[1000,800]);assert.equal(r.shadowRoots,1);assert.equal(r.regionCoverage.find(x=>x.key==='menus').visible,1);assert.equal(r.regionCoverage.find(x=>x.key==='sidebar').status,'loaded-hidden');assert.deepEqual(r.regionCoverage.find(x=>x.key==='dialogs').selectorErrors,['bad[']);
 assert.ok(!r.candidates.some(x=>x.tag==='input'||x.tag==='dialog'));assert.deepEqual(r.regionCoverage[0].samples[0].attributes,['data-app-shell-main-surface']);assert.equal(r.truncated,false);
});

test('offline merge writes both reports exclusively and leaves inputs unchanged',async t=>{
 const dir=await mkdtemp(path.join(process.env.CODEX_THEME_TEST_ROOT,'inventory-'));t.after(()=>rm(dir,{recursive:true,force:true}));const input=path.join(dir,'input.json'),output=path.join(dir,'combined.json'),source=JSON.stringify(report());await writeFile(input,source);
 const result=await run(['--merge',input,'--out',output]);assert.equal(result.catalog.regions.length,28);assert.equal(JSON.parse(await readFile(output,'utf8')).kind,'codex-ui-inventory');assert.equal(JSON.parse(await readFile(output.replace('.json','.regions.json'),'utf8')).regions.find(x=>x.key==='chat').status,'observed');assert.equal(await readFile(input,'utf8'),source);
 const saved=await readFile(output);await assert.rejects(run(['--merge',input,'--out',output]),/EEXIST/);assert.deepEqual(await readFile(output),saved);await assert.rejects(run(['--merge',input,'--out',input]),/overwrite input/);await assert.rejects(run(['--state','unused','--out',output,'--label','private page text']),/non-personal/);
});
