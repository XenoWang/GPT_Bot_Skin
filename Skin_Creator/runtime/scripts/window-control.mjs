import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pythonBackend} from './host-tools.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const exec=promisify(execFile);
const unavailable=/^CDP (?:-32000: Browser window not found|-32601: .*(?:not found|wasn't found))$/i;

export function nativeWindowCommand(statePath,operation,token,placement,env=process.env){
 if(!['snapshot','normal','maximized','restore'].includes(operation))throw new Error('Invalid native window operation');
 const python=pythonBackend(env),state=path.resolve(statePath);
 const args=python?['-X','utf8',path.join(HERE,'native-window.py'),'--state',state,'--operation',operation]:['-NoProfile','-File',path.join(HERE,'Native-CreatorWindow.ps1'),'-StatePath',state,'-Operation',operation];
 if(token)args.push(python?'--token':'-Token',JSON.stringify(token));
 if(placement)args.push(python?'--placement':'-Placement',JSON.stringify(placement));
 return {file:python??'powershell.exe',args};
}

async function invokeNative(statePath,operation,token,placement){
 const command=nativeWindowCommand(statePath,operation,token,placement);
 const result=await exec(command.file,command.args,{windowsHide:true,timeout:20000,maxBuffer:65536});
 return JSON.parse(result.stdout.replace(/^\uFEFF/,''));
}

function validPlacement(p){
 return p&&Number.isInteger(p.flags)&&p.flags>=0&&p.flags<=7&&[1,3].includes(p.showCmd)&&[['min',2],['max',2],['normal',4]].every(([key,n])=>Array.isArray(p[key])&&p[key].length===n&&p[key].every(v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647))&&p.normal[2]>p.normal[0]&&p.normal[3]>p.normal[1];
}

export function selectNativeWindow(snapshot,focused){
 if(!snapshot?.owner||!Number.isInteger(snapshot.owner.pid)||snapshot.owner.pid<=0||!/^\d+$/.test(snapshot.owner.startedTicks??'')||!Array.isArray(snapshot.windows))throw new Error('Invalid native window inventory');
 const all=snapshot.windows.filter(w=>[1,3].includes(w?.placement?.showCmd));
 if(all.some(w=>!w||typeof w.handle!=='string'||! /^[1-9]\d*$/.test(w.handle)||typeof w.foreground!=='boolean'||!validPlacement(w.placement))||new Set(all.map(w=>w.handle)).size!==all.length)throw new Error('Native inventory requires visible normal or maximized windows');
 const matches=focused?all.filter(w=>w.foreground):[];
 const selected=all.length===1?all[0]:matches.length===1?matches[0]:null;
 if(!selected)throw new Error('No unambiguous native window; focus the intended Codex window and retry');
 return {token:{...snapshot.owner,handle:selected.handle},placement:structuredClone(selected.placement)};
}

function samePlacement(expected,actual){
 return validPlacement(actual)&&actual.showCmd===expected.showCmd&&JSON.stringify(actual.normal)===JSON.stringify(expected.normal);
}

// The optional services argument isolates platform calls in offline tests. It
// is never exposed as a CLI option or accepted from a theme/session payload.
export async function windowController(client,statePath,{platform=process.platform,invoke=invokeNative}={}){
 let initial;
 try{initial=await client.browser.send('Browser.getWindowForTarget',{targetId:client.targetId});}
 catch(error){
  if(platform!=='win32'||!unavailable.test(error.message))throw error;
  const page=await client.page.evaluate('({visible:document.visibilityState==="visible",focused:document.hasFocus()})');
  if(!page?.visible)throw new Error('The selected native page is not visible');
  const {token,placement}=selectNativeWindow(await invoke(statePath,'snapshot'),page.focused===true);
  let changed=false;
  const apply=async operation=>{
   changed=true;
   const observed=await invoke(statePath,operation,token);
   if(observed?.handle!==token.handle||!validPlacement(observed.placement)||observed.placement.showCmd!==(operation==='normal'?1:3))throw new Error('Native window transition was not observed');
  };
  return {backend:'native',normal:()=>apply('normal'),maximize:()=>apply('maximized'),async restore(){
   if(!changed)return true;
   const observed=await invoke(statePath,'restore',token,placement);
   if(observed?.handle!==token.handle||!samePlacement(placement,observed.placement))throw new Error('Native window restoration was not observed');
   changed=false;return true;
  }};
 }
 if(!Number.isInteger(initial?.windowId)||!['normal','maximized'].includes(initial?.bounds?.windowState))throw new Error('Inventory requires a normal or maximized window');
 const windowId=initial.windowId,original=structuredClone(initial.bounds);
 let normal=original.windowState==='normal'?structuredClone(original):null,changed=false;
 const get=async()=>{const found=await client.browser.send('Browser.getWindowForTarget',{targetId:client.targetId});if(found.windowId!==windowId)throw new Error('CDP window identity changed');return found.bounds;};
 const set=async bounds=>{changed=true;await client.browser.send('Browser.setWindowBounds',{windowId,bounds});};
 const wait=async(state,expected)=>{for(let i=0;i<12;i++){const bounds=await get();if(bounds.windowState===state&&(!expected||['left','top','width','height'].every(k=>bounds[k]===expected[k])))return bounds;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('CDP window transition was not observed');};
 return {backend:'cdp',async normal(){if(original.windowState!=='normal'||changed)await set({windowState:'normal'});normal=await wait('normal');},async maximize(){await set({windowState:'maximized'});await wait('maximized');},async restore(){
  if(!changed)return true;
  if(normal){await set({windowState:'normal'});await wait('normal');await set({left:normal.left,top:normal.top,width:normal.width,height:normal.height});}
  if(original.windowState!=='normal')await set({windowState:original.windowState});
  await wait(original.windowState,original.windowState==='normal'?original:null);
  changed=false;return true;
 }};
}
