import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Connection,endpointJSON,pageTarget,debuggerAddress,PROBE} from './cdp-transport.mjs';
import {ownerCommand} from './host-tools.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));

export async function managedPage(statePath,targetId){
 const bytes=await readFile(statePath);if(bytes.length>32768)throw new Error('Session file too large');
 const state=JSON.parse(bytes.toString('utf8'));
 const command=ownerCommand(statePath);await promisify(execFile)(command.file,command.args,{windowsHide:true,timeout:15000,maxBuffer:65536});
 const browserURL=debuggerAddress((await endpointJSON(state.port,'/json/version')).webSocketDebuggerUrl,state.port,'browser',state.browserId).url;
 const candidates=(await endpointJSON(state.port,'/json/list')).filter(t=>pageTarget(t,state.port)&&(!targetId||t.id===targetId));
 const open=[];
 try{
  for(const t of candidates.slice(0,8)){
   const c=await new Connection(t.webSocketDebuggerUrl).open();open.push({c,t});
   const p=await c.evaluate(PROBE);open.at(-1).eligible=!!(p?.shell&&p.sidebar&&p.main);
   open.at(-1).focused=await c.evaluate('document.hasFocus()');
  }
  const valid=open.filter(p=>p.eligible),focused=valid.filter(p=>p.focused);
  const selected=targetId?valid[0]:(valid.length===1?valid[0]:focused.length===1?focused[0]:null);
  if(!selected)throw new Error('No unambiguous verified native window; select a target explicitly');
  for(const p of open)if(p!==selected)p.c.close();
  const browser=await new Connection(browserURL).open();
  return {page:selected.c,browser,targetId:selected.t.id,clientVersion:String(state.packageFullName??'').match(/^OpenAI\.Codex_([0-9.]+)_/)?.[1]??'unknown',close(){selected.c.close();browser.close();}};
 }catch(e){for(const p of open)p.c.close();throw e;}
}
