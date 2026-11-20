import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
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
// Store package versions contain four unsigned 16-bit components.
export function selectProfileVersion(version, versions, minimumVersion) {
 const valid = typeof version === 'string' && /^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){3}$/.test(version);
 if (!valid || version.split('.').some(part => Number(part) > 65535)) return null;
 if (versions.includes(version)) return version;
 if (!minimumVersion || !versions.includes(minimumVersion)) return null;
 const parts = version.split('.').map(Number);
 const minimum = minimumVersion.split('.').map(Number);
 for (let index = 0; index < parts.length; index++) {
  if (parts[index] !== minimum[index]) return parts[index] > minimum[index] ? minimumVersion : null;
 }
 return minimumVersion;
}

// Bind a fresh configuration to the actual client while retaining its source profile.
// Exact matches retain their original shape and saved inventory fingerprints.
export function bindProfile(config, version) {
 return config.version === version ? config : {...config, profileVersion:config.version, version};
}

export async function adapterRegistry(root=ROOT) {
 const registry = await adapterJSON('versions.json',root);
 if (!object(registry) || !object(registry.profiles)) throw new Error('Invalid adapter registry');
 const ranged = registry.schemaVersion === 2;
 const keys = ranged ? ['schemaVersion','profiles','minimumVersion'] : ['schemaVersion','profiles'];
 if ((!ranged && registry.schemaVersion !== 1) || Object.keys(registry).some(k=>!keys.includes(k))) throw new Error('Invalid adapter registry');
 const versions = Object.keys(registry.profiles);
 if (!versions.length || versions.length > 16) throw new Error('Invalid adapter registry');
 for (const [version,profile] of Object.entries(registry.profiles)) {
  if (!selectProfileVersion(version,versions) || typeof profile !== 'string' || !/^\d+(?:\.\d+){1,3}$/.test(profile) || (profile !== version && !version.startsWith(profile+'.'))) throw new Error('Invalid adapter registry');
 }
 if (ranged && !versions.includes(registry.minimumVersion)) throw new Error('Invalid minimum client version');
 return registry;
}
export async function adapterVersions(root=ROOT) {
 return (await adapterRegistry(root)).profiles;
}
export async function resolveProfile(version,root=ROOT) {
 const {profiles,minimumVersion} = await adapterRegistry(root);
 const sourceVersion = selectProfileVersion(version,Object.keys(profiles),minimumVersion);
 if (!sourceVersion) throw new Error('Unsupported client version: '+String(version));
 return {sourceVersion, profile:profiles[sourceVersion]};
}
export async function registeredProfile(version,root=ROOT) {
 return (await resolveProfile(version,root)).profile;
}
export async function readProfileData(kind,version,root=ROOT) {
 const {sourceVersion,profile} = await resolveProfile(version,root);
 const config = await adapterJSON(kind+'-'+profile+'.json',root);
 if (!object(config) || config.version !== sourceVersion) throw new Error('Adapter/client version mismatch');
 return bindProfile(config,version);
}
export async function readAdapter(version,root=ROOT) {
 const adapter = await readProfileData('codex',version,root);
 if (typeof adapter.gate !== 'string' || !object(adapter.regions)) throw new Error('Adapter/client version mismatch');
 return adapter;
}
export function payloadProfileVersion(metadata,version) {
 if (!object(metadata) || ![2,3].includes(metadata.payloadFormat)) throw new Error('Invalid versioned payload metadata');
 const versions = metadata.clientVersions;
 if (!Array.isArray(versions) || !versions.length || versions.length > 16 || new Set(versions).size !== versions.length || versions.some(v=>!selectProfileVersion(v,versions))) throw new Error('Invalid versioned payload metadata');
 const ranged = metadata.payloadFormat === 3;
 if (ranged ? !versions.includes(metadata.minimumVersion) : metadata.minimumVersion !== undefined) throw new Error('Invalid versioned payload metadata');
 const selected = selectProfileVersion(version,versions,metadata.minimumVersion);
 if (!selected) throw new Error('Unsupported client version: '+String(version));
 return selected;
}
// Only the host supplies the verified Store version. Renderer selection uses the bundled policy.
export function bindPayloadVersion(payload,metadata,version) {
 payloadProfileVersion(metadata,version);
 const token = JSON.stringify(CLIENT_VERSION_TOKEN);
 if (typeof payload !== 'string' || payload.split(token).length !== 2) throw new Error('Invalid versioned payload binding');
 return payload.replace(token,JSON.stringify(version));
}
