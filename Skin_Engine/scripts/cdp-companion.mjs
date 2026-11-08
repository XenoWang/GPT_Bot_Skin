import {readFile,writeFile,rename,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {debuggerAddress,pageTarget,endpointJSON,Connection,PROBE,REMOVE} from './cdp-transport.mjs';
import {ownerCommand} from './host-tools.mjs';
const exec=promisify(execFile),HERE=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);const mode=args[0];const statePath=args[1];
if(!['watch','remove','inspect'].includes(mode)||!statePath)throw new Error('Usage: cdp-companion.mjs watch|remove|inspect <state.json>');
const state=JSON.parse(await readFile(statePath,'utf8'));
debuggerAddress(state.browserUrl,state.port,'browser',state.browserId);
const stateDir=path.dirname(path.resolve(statePath));
const stopped=async()=>{try{await access(path.join(stateDir,'stop'));return true;}catch{return false;}};
async function owner(){const command=ownerCommand(statePath);await exec(command.file,command.args,{windowsHide:true,timeout:12000,maxBuffer:64*1024});}
async function identity(){const v=await endpointJSON(state.port,'/json/version');debuggerAddress(v.webSocketDebuggerUrl,state.port,'browser',state.browserId);}
async function status(data){const temp=path.join(stateDir,'status.json.tmp');await writeFile(temp,JSON.stringify({at:new Date().toISOString(),...data},null,2));await rename(temp,path.join(stateDir,'status.json'));}
await owner();await identity();
const anchor=await new Connection(state.browserUrl).open();
const payload=mode==='watch'?await readFile(path.join(HERE,'..','dist','cdp-payload.js'),'utf8'):null;
const revision=mode==='watch'?JSON.parse(await readFile(path.join(HERE,'..','dist','cdp-payload.json'),'utf8')).revision:null;
const sessions=new Map(),failures=new Map();let alive=true,round=0;process.on('SIGINT',()=>alive=false);process.on('SIGTERM',()=>alive=false);
try{
 do{
  if(anchor.closed)break;if(mode==='watch'&&await stopped())break;
  await identity();if(round++%10===0)await owner();
  const list=await endpointJSON(state.port,'/json/list');if(!Array.isArray(list))throw new Error('Invalid target list');
  const targets=list.filter(t=>pageTarget(t,state.port));
  const ids=new Set(targets.map(t=>t.id));for(const [id,c]of sessions)if(!ids.has(id)||c.closed){c.close();sessions.delete(id);}
  let matched=0,installed=0;const counts=[];
  for(const target of targets){
   if((failures.get(target.id)??0)>=3)continue;
   try{
   let c=sessions.get(target.id);if(!c){c=await new Connection(debuggerAddress(target.webSocketDebuggerUrl,state.port,'page',target.id).url).open();sessions.set(target.id,c);}
   const p=await c.evaluate(PROBE);if(!p?.shell||!p.sidebar||!p.main)continue;matched++;
   if(mode==='remove'){if(!await c.evaluate(REMOVE))throw new Error('Theme removal incomplete');}
   else if(mode==='watch'){
    if(!p.ready||p.revision!==revision){if(anchor.closed)break;await c.evaluate(payload);}
    const after=await c.evaluate(PROBE);if(after.ready&&after.revision===revision){installed++;counts.push(after.counts);}
   }else counts.push(p.counts);
   failures.delete(target.id);
   }catch(e){sessions.get(target.id)?.close();sessions.delete(target.id);if(mode!=='watch')throw e;failures.set(target.id,(failures.get(target.id)??0)+1);console.error('Theme attachment temporarily unavailable: '+e.message);}
  }
  const blocked=[...failures].filter(([id,n])=>ids.has(id)&&n>=3).length;
  const record={mode,matched,installed,blockedTargets:blocked,regionCounts:counts,state:mode==='watch'?(blocked?'blocked-injection':installed?'active':'waiting-for-shell'):mode};
  await status(record);if(mode!=='watch'){console.log(JSON.stringify(record));if(!matched)process.exitCode=2;break;}
  if(blocked){process.exitCode=2;break;}await new Promise(r=>setTimeout(r,1500));
 }while(alive&&!anchor.closed);
}catch(e){await status({mode,state:anchor.closed?'client-closed':'stopped-error',error:e.message});process.exitCode=anchor.closed?0:1;}
finally{for(const c of sessions.values())c.close();anchor.close();if(mode==='watch'&&!process.exitCode)await status({mode,state:'stopped'});}
