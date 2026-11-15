import {readFile,readdir,mkdir,lstat,realpath} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';

const inside=(root,file)=>{const rel=path.relative(root,file);return rel===''||!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);};
const idPattern=/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,12}$/;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function boundedJSON(file,limit){const bytes=await readFile(file);if(bytes.length>limit)throw new Error('Recovery data exceeds its limit');return JSON.parse(bytes.toString('utf8'));}
async function historyDirectory(root,create=false){
 const base=await realpath(root),dir=path.join(base,'.local','recovery');
 for(const part of [path.join(base,'.local'),dir]){
  try{if((await lstat(part)).isSymbolicLink())throw new Error('Recovery path must not use symlinks');}
  catch(e){if(e.code!=='ENOENT')throw e;if(create)await mkdir(part);}
 }
 return dir;
}
async function history(root){
 const dir=await historyDirectory(root);let files;
 try{files=(await readdir(dir)).filter(n=>/^\d{13}-[a-f0-9-]{36}\.json$/.test(n)).sort();}catch(e){if(e.code==='ENOENT')return [];throw e;}
 if(files.length>2000)throw new Error('Recovery history requires archival');
 const result=[];
 for(const name of files){const file=path.join(dir,name);if((await lstat(file)).isSymbolicLink())throw new Error('Recovery path must not use symlinks');const entry=await boundedJSON(file,32768);if(!idPattern.test(entry.id??'')||!['observed','resolved','reopened'].includes(entry.status))throw new Error('Invalid recovery record');result.push(entry);}
 return result;
}
export async function lookupRecovery(root,query,translate){
 if(typeof query!=='string'||!query.trim()||query.length>500)throw new Error('Supply a short recovery query');
 const data=await boundedJSON(path.join(root,'references','recovery-cases.json'),128*1024);
 if(data.schemaVersion!==1||!Array.isArray(data.cases)||data.cases.length>100)throw new Error('Invalid recovery catalog');
 const q=query.toLowerCase(),records=await history(root),matches=[];
 for(const item of data.cases){
  if(!idPattern.test(item.id??'')||item.id.length>100||!Array.isArray(item.terms)||item.terms.length>20||item.terms.some(x=>typeof x!=='string'||!x||x.length>120)||!/^recovery\.case\.[a-z-]+$/.test(item.key??''))throw new Error('Invalid recovery catalog');
  const score=item.id.toLowerCase()===q?100:item.terms.reduce((n,term)=>n+(q.includes(term.toLowerCase())?1:0),0);if(!score)continue;
  const previous=records.filter(x=>x.id===item.id),last=previous.at(-1);
  matches.push({id:item.id,score,title:translate(item.key+'.title'),symptom:translate(item.key+'.symptom'),action:translate(item.key+'.action'),verify:translate(item.key+'.verify'),historyCount:previous.length,...(last?{lastRecord:{status:last.status,resolution:last.resolution,verification:last.verification}}:{})});
 }
 for(const last of [...records].reverse())if(!matches.some(x=>x.id===last.id)&&(q===last.id.toLowerCase()||last.keywords?.some(term=>q.includes(term.toLowerCase()))))matches.push({id:last.id,score:1,title:last.symptom,action:last.resolution,verify:last.verification,historyCount:records.filter(x=>x.id===last.id).length,lastRecord:{status:last.status}});
 matches.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 return {message:translate(matches.length?'recovery.found':'recovery.noMatch'),matches:matches.slice(0,3),matchedCount:matches.length};
}
export async function recoveryForContrast(root,report,translate){
 if(report.passed||!report.violations.length)return null;
 const regions=[...new Set(report.violations.map(v=>v.region).filter(Boolean))].slice(0,3);
 return lookupRecovery(root,[...regions,'foreground'].join(' '),translate);
}
export async function recordRecovery(root,sessionDirectory,input,saveJSON){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['id','status','symptom','resolution','verification','keywords','evidence'].includes(k))||!idPattern.test(input.id??'')||input.id.length>100||!['observed','resolved','reopened'].includes(input.status))throw new Error('Invalid recovery record');
 for(const key of ['symptom','resolution','verification'])if(typeof input[key]!=='string'||input[key].length>2000||key==='symptom'&&!input[key].trim())throw new Error('Invalid recovery record');
 if(!Array.isArray(input.keywords)||input.keywords.length>12||input.keywords.some(x=>typeof x!=='string'||!x.trim()||x.length>120)||!Array.isArray(input.evidence)||input.evidence.length>5)throw new Error('Invalid recovery record');
 if(input.status==='resolved'&&(!input.resolution.trim()||!input.verification.trim()||!input.evidence.length))throw new Error('Resolved recovery requires verification evidence');
 const base=await realpath(root),session=await realpath(sessionDirectory);if(!inside(base,session))throw new Error('Recovery evidence escapes the session');
 const evidence=[];
 for(const name of input.evidence){
  if(typeof name!=='string'||path.isAbsolute(name)||/[\\:\x00-\x1f<>"|?*]/.test(name)||name.split('/').some(x=>!x||x==='..'||x==='.')||name.length>240)throw new Error('Recovery evidence escapes the session');
  const file=await realpath(path.join(session,name));if(!inside(session,file)||(await lstat(path.join(session,name))).isSymbolicLink())throw new Error('Recovery evidence escapes the session');
  if((await lstat(file)).size>20*1024*1024)throw new Error('Recovery data exceeds its limit');const bytes=await readFile(file);
  if(input.status==='resolved'&&name.endsWith('.json')&&JSON.parse(bytes.toString('utf8')).passed===false)throw new Error('Failed evidence cannot mark recovery resolved');
  evidence.push({file:name,sha256:hash(bytes)});
 }
 const entry={...input,evidence,at:new Date().toISOString(),session:path.relative(base,session).split(path.sep).join('/')},dir=await historyDirectory(base,true),file=path.join(dir,Date.now()+'-'+randomUUID()+'.json');
 await saveJSON(file,entry);return {id:entry.id,status:entry.status,record:path.relative(base,file).split(path.sep).join('/'),evidenceCount:evidence.length};
}

// Runs in the verified renderer. Geometry/styles only; no text, values or navigation.
export function diagnoseTitlebar(){
 const app=window.__codexAppearanceV1,adapter=app?.adapter,spec=adapter?.titlebarGap;
 if(!spec)throw new Error('Titlebar diagnostics require a mapped runtime');
 const rule=app.pack?.manifest.regions.titlebar,fillAlpha=rule?.gradient?(rule.gradient.opacity??rule.style?.surfaceOpacity??1):rule?.style?.surface?(rule.style.surfaceOpacity??1):0;
 const themed=rule?.enabled&&(rule.background||rule.ornament||rule.decals?.length||fillAlpha>0||app.pack.manifest.scene?.regions.includes('titlebar'));
 if(!themed)return {kind:'titlebar-diagnostic',clientVersion:adapter.version,passed:false,notApplicable:true,issues:['titlebar-not-themed'],bars:[]};
 const visible=n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&!n.closest('[inert],[aria-hidden="true"]');};
 const bars=[...new Set((adapter.regions.titlebar??[]).flatMap(q=>[...document.querySelectorAll(q)]))].filter(visible),issues=[],results=[];
 if(bars.length!==1)issues.push('titlebar-not-unique');
 for(const bar of bars){
  const rect=bar.getBoundingClientRect(),scope=bar.closest(spec.scope)??document,refs=[...new Set(spec.references.flatMap(q=>[...scope.querySelectorAll(q)]))].filter(n=>n!==bar&&visible(n));
  const edge=refs.length?Math.min(...refs.map(n=>n.getBoundingClientRect().top)):null,delta=edge===null?null:edge-rect.bottom;
  const valid=delta!==null&&delta>=0&&delta<=(spec.maxGap??32),layer=app.mounted?.get(bar)?.layer,box=layer?.getBoundingClientRect(),style=layer?getComputedStyle(layer):null;
  const color=style?.backgroundColor??'',alpha=/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/.exec(color)?.[1];
  const painted=!!layer&&(!!layer.querySelector('img')||!!style.backgroundImage&&style.backgroundImage!=='none'||/^rgb\(/.test(color)||alpha!==undefined&&Number(alpha)>0);
  const covered=valid&&(delta===0||!!box&&box.left<=rect.left+.5&&box.right>=rect.right-.5&&box.bottom>=edge-.5&&painted);
  if(!valid)issues.push('titlebar-reference-unknown');else if(!covered)issues.push('titlebar-background-gap');
  if(style&&(style.pointerEvents!=='none'||style.getPropertyValue('-webkit-app-region')==='drag'))issues.push('titlebar-decoration-intercepts-input');
  results.push({bar:[rect.x,rect.y,rect.width,rect.height],contentTop:edge,gap:valid?delta:null,layer:layer?.getAttribute('data-codex-appearance-owned')??null,layerBox:box?[box.x,box.y,box.width,box.height]:null,painted,covered,pointerEvents:style?.pointerEvents??null});
 }
 return {kind:'titlebar-diagnostic',clientVersion:adapter.version,runtimeRevision:window.__codexAppearanceRevision??null,previewRevision:app.creator?.revision??null,passed:issues.length===0,issues:[...new Set(issues)],bars:results};
}
