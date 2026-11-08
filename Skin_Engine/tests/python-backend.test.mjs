import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ownerCommand,localeCommand,pythonBackend} from '../scripts/host-tools.mjs';
const scripts=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts');
test('default and explicit legacy backends retain the original PowerShell command contract',()=>{
 const state=path.resolve('fixture with spaces','session.json');
 for(const env of [{},{CODEX_SKIN_HOST_BACKEND:'powershell'}]){
  assert.deepEqual(ownerCommand(state,env),{file:'powershell.exe',args:['-NoProfile','-File',path.join(scripts,'Assert-CdpOwner.ps1'),'-StatePath',state]});
  assert.deepEqual(localeCommand(env),{file:'powershell.exe',args:['-NoProfile','-Command','(Get-UICulture).Name']});
 }
});
test('Python selection uses the exact interpreter and preserves path arguments without a shell',()=>{
 const python=path.resolve('interpreter directory','python.exe'),state=path.resolve('session directory','a & b.json'),env={CODEX_SKIN_HOST_BACKEND:'python',CODEX_SKIN_PYTHON:python};
 assert.deepEqual(ownerCommand(state,env),{file:python,args:['-X','utf8',path.join(scripts,'python_launcher.py'),'assert-owner','--state',state]});
 assert.deepEqual(localeCommand(env),{file:python,args:['-X','utf8',path.join(scripts,'python_launcher.py'),'locale']});
 assert.equal(pythonBackend(env),python);
});
test('invalid explicit backends never fall back to a different host',()=>{
 for(const env of [{CODEX_SKIN_HOST_BACKEND:'unknown'},{CODEX_SKIN_HOST_BACKEND:'python'},{CODEX_SKIN_HOST_BACKEND:'python',CODEX_SKIN_PYTHON:'relative/python.exe'}])assert.throws(()=>ownerCommand('session.json',env),/Invalid/);
});
