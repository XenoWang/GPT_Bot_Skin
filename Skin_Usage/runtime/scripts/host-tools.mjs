import path from 'node:path';
import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));

export function pythonBackend(env=process.env){
 const mode=env.CODEX_SKIN_HOST_BACKEND;
 if(!mode||mode==='powershell')return null;
 if(mode!=='python'||typeof env.CODEX_SKIN_PYTHON!=='string'||!path.isAbsolute(env.CODEX_SKIN_PYTHON))throw new Error('Invalid explicitly selected Python host backend');
 return env.CODEX_SKIN_PYTHON;
}
export function ownerCommand(statePath,env=process.env){
 const python=pythonBackend(env);
 return python?{file:python,args:['-X','utf8',path.join(HERE,'python_launcher.py'),'assert-owner','--state',path.resolve(statePath)]}:{file:'powershell.exe',args:['-NoProfile','-File',path.join(HERE,'Assert-CdpOwner.ps1'),'-StatePath',path.resolve(statePath)]};
}
export function localeCommand(env=process.env){
 const python=pythonBackend(env);
 return python?{file:python,args:['-X','utf8',path.join(HERE,'python_launcher.py'),'locale']}:{file:'powershell.exe',args:['-NoProfile','-Command','(Get-UICulture).Name']};
}
