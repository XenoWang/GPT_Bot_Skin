import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPayload} from './build-cdp-payload.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Creator orchestration and temporary authoring controls stay outside Usage.
export const SHARED_RUNTIME_FILES=Object.freeze(['renderer/core.mjs','renderer/runtime.mjs','scripts/build-cdp-payload.mjs','scripts/inspect-ui-regions.mjs','scripts/region-capabilities.mjs','scripts/cdp-companion.mjs','scripts/host-tools.mjs','scripts/python_host.py','scripts/python_launcher.py','scripts/Skin-LaunchConfig.ps1','scripts/release_package.py','dist/cdp-payload.js','dist/cdp-payload.json']);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function syncSharedRuntime(usage){
 if(!usage)throw new Error('Pass the explicit destination Usage package path');
 usage=path.resolve(usage);
 const listPath=path.join(usage,'references/runtime-files.json'),list=JSON.parse(await readFile(listPath,'utf8'));
 if(list.state!=='release-content-manifest')throw new Error('Unknown Usage release manifest');
 const before={};for(const name of Object.keys(list.files))if(!SHARED_RUNTIME_FILES.includes(name))before[name]=hash(await readFile(path.join(usage,'runtime',name)));
 await buildPayload(path.join(ROOT,'dist'));
 for(const name of SHARED_RUNTIME_FILES){const bytes=await readFile(path.join(ROOT,name));const output=path.join(usage,'runtime',name);await mkdir(path.dirname(output),{recursive:true});await copyFile(path.join(ROOT,name),output);if(hash(await readFile(output))!==hash(bytes))throw new Error('Release copy mismatch: '+name);list.files[name]=hash(bytes);}
 for(const [name,value]of Object.entries(before))if(hash(await readFile(path.join(usage,'runtime',name)))!==value)throw new Error('Unrelated Usage file changed: '+name);
 await writeFile(listPath,JSON.stringify(list,null,2)+'\n','utf8');return {files:SHARED_RUNTIME_FILES,preserved:Object.keys(before).length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))syncSharedRuntime(process.argv[2]).then(result=>console.log(JSON.stringify(result))).catch(e=>{console.error(e.message);process.exitCode=1;});
