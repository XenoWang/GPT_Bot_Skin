import http from 'node:http';

export function officialDocument(protocol,hostname,pathname='/'){
 if(protocol!=='app:')return false;
 if(hostname==='-')return ['/index.html','/detached-window.html'].includes(pathname);
 return hostname==='codex'&&['/','/index.html','/detached-window.html'].includes(pathname);
}

export function debuggerAddress(value,port,kind,id){
 if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid CDP port');
 const u=new URL(value);
 if(u.protocol!=='ws:'||u.hostname!=='127.0.0.1'||Number(u.port)!==port||u.username||u.password||u.search||u.hash)throw new Error('CDP must use the exact IPv4 loopback port');
 const m=u.pathname.match(/^\/devtools\/(browser|page)\/([A-Za-z0-9._-]{1,200})$/);
 if(!m||m[1]!==kind||(id!==undefined&&m[2]!==id))throw new Error('CDP target identity mismatch');
 return {url:u.href,id:m[2]};
}
export function pageTarget(target,port){
 if(target?.type!=='page'||typeof target.id!=='string'||!/^[A-Za-z0-9._-]{1,200}$/.test(target.id))return false;
 try{const u=new URL(target.url);if(!officialDocument(u.protocol,u.hostname,u.pathname)||u.username||u.password)return false;debuggerAddress(target.webSocketDebuggerUrl,port,'page',target.id);return true;}catch{return false;}
}
export function endpointJSON(port,endpoint){
 if(!Number.isInteger(port)||port<1024||port>65535||!['/json/version','/json/list'].includes(endpoint))return Promise.reject(new Error('Invalid discovery request'));
 return new Promise((resolve,reject)=>{
  const req=http.get({hostname:'127.0.0.1',port,path:endpoint,agent:false,timeout:3000},res=>{
   if(res.statusCode!==200){res.resume();reject(new Error(`CDP discovery HTTP ${res.statusCode}`));return;}
   const chunks=[];let size=0;
   res.on('data',part=>{size+=part.length;if(size>1024*1024){req.destroy(new Error('CDP discovery response too large'));return;}chunks.push(part);});
   res.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(e){reject(e);}});res.on('error',reject);
  });req.on('timeout',()=>req.destroy(new Error('CDP discovery timed out')));req.on('error',reject);
 });
}
export class Connection {
 constructor(url){this.url=url;this.next=0;this.pending=new Map();this.closed=true;}
 async open(){
  this.ws=new WebSocket(this.url);this.closed=false;
  this.ws.addEventListener('message',event=>{
   let msg;try{msg=JSON.parse(String(event.data));}catch{this.close();return;}
   const p=this.pending.get(msg.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(msg.id);if(msg.error)p.reject(new Error(`CDP ${msg.error.code}: ${msg.error.message}`));else p.resolve(msg.result);
  });
  const ended=()=>{this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP connection closed'));}this.pending.clear();};
  this.ws.addEventListener('close',ended);this.ws.addEventListener('error',ended);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.close();reject(new Error('CDP connection timed out'));},5000);this.ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});this.ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP connection failed'));},{once:true});});return this;
 }
 send(method,params={}){
  if(this.closed)return Promise.reject(new Error('CDP connection closed'));
  return new Promise((resolve,reject)=>{const id=++this.next,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},20000);this.pending.set(id,{resolve,reject,timer});try{this.ws.send(JSON.stringify({id,method,params}));}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});
 }
 async evaluate(expression){const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error('Theme renderer evaluation failed');return r.result?.value;}
 close(){if(this.ws&&this.ws.readyState<2)this.ws.close();this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP connection closed'));}this.pending.clear();}
}

// Booleans and counts only; never read conversation text, cookies or account data.
export const PROBE=`(()=>({
 shell: (${officialDocument.toString()})(location.protocol,location.hostname,location.pathname) && !!document.querySelector('[data-app-shell-frame],main.main-surface'),
 sidebar:!!document.querySelector('aside.app-shell-left-panel,[data-sidebar-navigation-root]'),
 main:!!document.querySelector('[data-app-shell-main-surface],main.main-surface'),
 ready:!!window.__codexAppearanceV1?.style,
 revision:window.__codexAppearanceRevision??null,
 counts:window.__codexAppearanceV1?.counts??null
}))()`;
export const REMOVE=`(()=>{window.__codexAppearanceV1?.destroy?.();delete window.__codexAppearanceRevision;return !document.querySelector('[data-codex-appearance-owned]')})()`;
