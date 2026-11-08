import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {debuggerAddress,pageTarget,Connection,officialDocument} from '../scripts/cdp-transport.mjs';
import {payloadSource} from '../scripts/build-cdp-payload.mjs';

test('accept only the exact loopback port and browser identity',()=>{
 assert.equal(debuggerAddress('ws://127.0.0.1:9335/devtools/browser/native-123',9335,'browser','native-123').id,'native-123');
 for(const url of [
  'ws://example.com:9335/devtools/browser/native-123','ws://0.0.0.0:9335/devtools/browser/native-123',
  'ws://127.0.0.1:9336/devtools/browser/native-123','wss://127.0.0.1:9335/devtools/browser/native-123',
  'ws://user@127.0.0.1:9335/devtools/browser/native-123','ws://127.0.0.1:9335/devtools/browser/native-123?q=x',
  'ws://127.0.0.1:9335/devtools/browser/native-123#x','ws://127.0.0.1:9335/devtools/page/native-123',
  'ws://127.0.0.1:9335/devtools/browser/other'
 ])assert.throws(()=>debuggerAddress(url,9335,'browser','native-123'));
 for(const port of [0,80,65536,9335.5,NaN,'9335'])assert.throws(()=>debuggerAddress('ws://127.0.0.1:9335/devtools/browser/native-123',port,'browser'));
});
test('never select ordinary web pages, mismatched targets or nested browser contexts',()=>{
 const base={id:'page-123',type:'page',url:'app://codex/',webSocketDebuggerUrl:'ws://127.0.0.1:9335/devtools/page/page-123'};
 assert.equal(pageTarget(base,9335),true);
 for(const url of ['https://chatgpt.com/','http://localhost/','app://other/','app://codex.evil/','app://codex@evil/'])assert.equal(pageTarget({...base,url},9335),false);
 assert.equal(pageTarget({...base,id:'other'},9335),false);
 assert.equal(pageTarget({...base,type:'iframe'},9335),false);
 assert.equal(pageTarget({...base,webSocketDebuggerUrl:'ws://127.0.0.1:9335/devtools/browser/page-123'},9335),false);
});
test('closed connection refuses protocol commands without sending anything',async()=>{
 const c=new Connection('ws://127.0.0.1:9335/devtools/page/example');
 await assert.rejects(c.send('Runtime.evaluate',{expression:'1'}),/closed/);
});
test('current official app://- entrypoints are allowed, other internal paths remain rejected',()=>{
 for(const path of ['/index.html','/detached-window.html']){
  assert.equal(officialDocument('app:','-',path),true);
  assert.equal(pageTarget({id:'native',type:'page',url:'app://-'+path,webSocketDebuggerUrl:'ws://127.0.0.1:9335/devtools/page/native'},9335),true);
 }
 for(const path of ['/','/assets/file.html','/unknown','/index.html/evil'])assert.equal(officialDocument('app:','-',path),false);
 assert.equal(officialDocument('https:','-','/index.html'),false);
 assert.equal(officialDocument('app:','-.example','/index.html'),false);
});
test('built payload is valid classic JavaScript and refuses unrelated documents before mutation',async()=>{
 const {text}=await payloadSource();const script=new vm.Script(text);
 let touched=0;const guard={destroy:()=>{touched++;throw new Error('Must not mutate unrelated page');}};
 const external=await script.runInNewContext({location:{protocol:'https:',hostname:'chatgpt.com'},window:{__codexAppearanceV1:guard}},{timeout:3000});
 assert.equal(external.blocked,'origin');assert.equal(touched,0);
 const unrelated=await script.runInNewContext({location:{protocol:'app:',hostname:'codex'},document:{querySelector:()=>null},window:{__codexAppearanceV1:guard}},{timeout:3000});
 assert.equal(unrelated.blocked,'shell');assert.equal(touched,0);
});
