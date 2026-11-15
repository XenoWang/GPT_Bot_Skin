import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const VERSION=/^\d+\.\d+\.\d+\.\d+$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const CLIENT_VERSION_TOKEN='__CODEX_SKIN_VERIFIED_CLIENT_VERSION__';

export function clientVersionFromState(state){
 const match=/^OpenAI\.Codex_(\d+\.\d+\.\d+\.\d+)_/.exec(state?.packageFullName??'');
 if(!match)throw new Error('Unsupported client version: missing official package version');return match[1];
}
export async function adapterJSON(name,root=ROOT){
 if(typeof name!=='string'||!/^[-a-z0-9.]+\.json$/.test(name)||name.includes('..'))throw new Error('Invalid adapter filename');
 const packageRoot=await realpath(root),base=await realpath(path.join(packageRoot,'adapters')),file=await realpath(path.join(base,name));
 if(path.dirname(base)!==packageRoot)throw new Error('Adapter directory escapes its package');
 if(path.dirname(file)!==base)throw new Error('Adapter escapes its package');
 const bytes=await readFile(file);if(bytes.length>256*1024)throw new Error('Adapter data exceeds its limit');return JSON.parse(bytes.toString('utf8'));
}
export async function adapterVersions(root=ROOT){
 const registry=await adapterJSON('versions.json',root);
 if(!object(registry)||Object.keys(registry).some(k=>!['schemaVersion','profiles'].includes(k))||registry.schemaVersion!==1||!object(registry.profiles))throw new Error('Invalid adapter registry');
 const entries=Object.entries(registry.profiles);
 if(!entries.length||entries.length>16||entries.some(([version,profile])=>!VERSION.test(version)||version.length>50||typeof profile!=='string'||!/^\d+(?:\.\d+){1,3}$/.test(profile)||profile.length>50||version!==profile&&!version.startsWith(profile+'.')))throw new Error('Invalid adapter registry');
 return {...registry.profiles};
}
export async function registeredProfile(version,root=ROOT){
 const profiles=await adapterVersions(root);
 if(typeof version!=='string'||!Object.hasOwn(profiles,version))throw new Error('Unsupported client version: '+String(version));return profiles[version];
}
export async function readAdapter(version,root=ROOT){
 const profile=await registeredProfile(version,root),adapter=await adapterJSON('codex-'+profile+'.json',root);
 if(!object(adapter)||adapter.version!==version||typeof adapter.gate!=='string'||!object(adapter.regions))throw new Error('Adapter/client version mismatch');return adapter;
}
// The host binds only a version from its verified Store session. No code comes from a Skin.
export function bindPayloadVersion(payload,metadata,version){
 if(!object(metadata)||metadata.payloadFormat!==2||!Array.isArray(metadata.clientVersions)||!metadata.clientVersions.length||metadata.clientVersions.length>16||new Set(metadata.clientVersions).size!==metadata.clientVersions.length||metadata.clientVersions.some(v=>typeof v!=='string'||v.length>50||!VERSION.test(v)))throw new Error('Invalid versioned payload metadata');
 if(typeof version!=='string'||version.length>50||!VERSION.test(version)||!metadata.clientVersions.includes(version))throw new Error('Unsupported client version: '+String(version));
 const token=JSON.stringify(CLIENT_VERSION_TOKEN);if(typeof payload!=='string'||payload.split(token).length!==2)throw new Error('Invalid versioned payload binding');
 return payload.replace(token,JSON.stringify(version));
}
