import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {auditControlContrast} from '../scripts/contrast-audit.mjs';

function fixture({background='rgb(255, 255, 255)',image=false,paint=true,protectedPage=false}={}){
 const all=[];
 function node(tag,css={},attrs={}){
  const n={nodeType:1,localName:tag,attrs:{...attrs},children:[],childNodes:[],parentElement:null,css:{color:'rgb(0, 0, 0)',backgroundColor:'rgba(0, 0, 0, 0)',backgroundImage:'none',opacity:'1',display:'block',visibility:'visible',fill:'none',stroke:'none',...css},rect:{x:10,y:10,left:10,top:10,right:110,bottom:30,width:100,height:20},getBoundingClientRect(){return this.rect;},getAttribute(k){return this.attrs[k]??null;},hasAttribute(k){return Object.hasOwn(this.attrs,k);},getRootNode(){return {};},get textContent(){throw Error('No text reads');},get value(){throw Error('No value reads');},get innerHTML(){throw Error('No markup reads');},matches(s){return s==='input,textarea,select,[contenteditable="true"]'?['input','textarea','select'].includes(tag)||this.attrs.contenteditable==='true':false;},closest(s){for(let p=this;p;p=p.parentElement){if(s.includes('[inert]')&&p.attrs.inert!==undefined||s.includes('[disabled]')&&p.attrs.disabled!==undefined||s.includes('[aria-disabled="true"]')&&p.attrs['aria-disabled']==='true'||s.includes('[aria-hidden="true"]')&&p.attrs['aria-hidden']==='true'||s==='pre,code,[data-code-block]'&&(['pre','code'].includes(p.localName)||p.attrs['data-code-block']!==undefined))return p;}return null;},querySelectorAll(s){const out=[];function walk(p){for(const c of p.children){if(s==='path,line,polyline,polygon,circle,rect'?s.split(',').includes(c.localName):c.localName!=='path')out.push(c);walk(c);}}walk(this);return out;}};
  all.push(n);return n;
 }
 const root=node('div',{backgroundColor:background},{'data-codex-appearance':'composer',...(image?{'data-codex-appearance-bg':''}:{})});
 const append=(n,parent=root,text=false)=>{n.parentElement=parent;parent.children.push(n);parent.childNodes.push(n);if(text)n.childNodes.push({nodeType:3,get textContent(){throw Error('No text reads');},get nodeValue(){throw Error('No text reads');}});return n;};
 const nav=node('button',{}, {'aria-current':'page'});
 const queries=[];
 const context=vm.createContext({innerWidth:500,innerHeight:500,window:{__codexAppearanceRevision:'b'.repeat(64),__codexAppearanceV1:{creator:{revision:'a'.repeat(64),stage:'complete'},pack:{manifest:{regions:{composer:paint?{style:{text:'#000000'}}:{}}}},dialog:{open:false}}},document:{querySelectorAll(q){queries.push(q);if(q==='[data-settings-panel-slug="passwords"]')return protectedPage?[nav]:[];if(protectedPage)throw Error('Protected contents were queried');return [root];},createRange(){return {selectNodeContents(n){assert.equal(n.nodeType,3);},getBoundingClientRect(){return {width:8,height:12};}};}},getComputedStyle:n=>n.css});
 return {node,append,root,queries,run:()=>JSON.parse(JSON.stringify(vm.runInContext('('+auditControlContrast.toString()+')()',context)))};
}

test('rendered contrast detects white-on-white text and aria-hidden icons without content reads',()=>{
 const f=fixture();f.append(f.node('span',{color:'rgb(0, 0, 0)'}),f.root,true);f.append(f.node('span',{color:'color(srgb 1 1 1)'}),f.root,true);
 const icon=f.append(f.node('svg',{}, {'aria-hidden':'true'}));f.append(f.node('path',{fill:'rgb(255, 255, 255)'}),icon);
 const r=f.run();assert.equal(r.passed,false);assert.equal(r.checkedText,2);assert.equal(r.checkedIcons,1);assert.equal(r.violations.length,2);assert.deepEqual(r.violations.map(v=>[v.kind,v.contrast,v.minimum]),[['text',1,4.5],['icon',1,3]]);
});

test('independent solid and alpha cases reject dark-on-dark and half-black over white',()=>{
 const dark=fixture({background:'rgb(45, 45, 45)'});dark.append(dark.node('span',{color:'rgb(0, 0, 0)'}),dark.root,true);assert.equal(dark.run().violations[0].contrast,1.52);
 const alpha=fixture();alpha.append(alpha.node('span',{color:'rgba(0, 0, 0, 0.5)'}),alpha.root,true);assert.equal(alpha.run().violations[0].contrast,3.98);
 const good=fixture();good.append(good.node('span',{color:'rgb(0, 0, 0)'}),good.root,true);const r=good.run();assert.equal(r.passed,true);assert.equal(r.checkedText,1);assert.deepEqual(r.violations,[]);
});

test('image backgrounds and semantic or disabled content remain explicit limits',()=>{
 const image=fixture({background:'rgba(0, 0, 0, 0)',image:true});image.append(image.node('span',{color:'rgb(255, 255, 255)'}),image.root,true);const r=image.run();assert.equal(r.passed,false);assert.equal(r.skipped.imageOrUnknown,1);assert.equal(r.checkedText,0);
 const f=fixture();f.append(f.node('span',{color:'rgb(0, 180, 30)'}),f.root,true);f.append(f.node('span',{color:'rgb(255, 255, 255)'},{'aria-disabled':'true'}),f.root,true);f.append(f.node('span',{color:'rgb(0, 0, 0)'}),f.root,true);const result=f.run();assert.equal(result.passed,true);assert.equal(result.skipped.semantic,1);assert.equal(result.skipped.disabledOrHidden,1);assert.equal(result.checkedText,1);
 const native=fixture({paint:false});assert.equal(native.run().notApplicable,true);assert.equal(native.run().checkedText,0);
});

test('protected settings are rejected before any content traversal',()=>{
 const f=fixture({protectedPage:true});assert.throws(f.run,/protected settings/);assert.deepEqual(f.queries,['[data-settings-panel-slug="passwords"]']);
});
