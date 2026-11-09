import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readPack,readTranslations} from './build.mjs';
import {officialDocument} from './cdp-transport.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function bundledPacks(root=ROOT){
 let ids=['kurumi-twilight','neutral-dark'];
 try{const bytes=await readFile(path.join(root,'theme-catalog.json'));if(bytes.length>16384)throw new Error('Theme catalog exceeds its limit');const catalog=JSON.parse(bytes.toString('utf8'));if(!catalog||Object.keys(catalog).some(k=>!['schemaVersion','skinIds'].includes(k))||catalog.schemaVersion!==1||!Array.isArray(catalog.skinIds)||catalog.skinIds.length>16||catalog.skinIds[0]!=='kurumi-twilight'||catalog.skinIds[1]!=='neutral-dark'||new Set(catalog.skinIds).size!==catalog.skinIds.length||catalog.skinIds.some(id=>typeof id!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(id)))throw new Error('Invalid theme catalog');ids=catalog.skinIds;}catch(e){if(e.code!=='ENOENT')throw e;}
 const themes=await realpath(path.join(root,'themes'));
 return Promise.all(ids.map(async id=>{const directory=await realpath(path.join(themes,id));if(path.dirname(directory)!==themes)throw new Error('Bundled theme escapes its directory');const pack=await readPack(directory);if(pack.manifest.id!==id)throw new Error('Theme catalog identity mismatch');return pack;}));
}
export async function payloadSource(root=ROOT){
 root=path.resolve(root);
 let core=await readFile(path.join(root,'renderer','core.mjs'),'utf8');
 let runtime=await readFile(path.join(root,'renderer','runtime.mjs'),'utf8');
 const start="import {validatePack,validateManifest,requiredAssets,fitImage,declarations,sidebarSections,decorationCss,rgba,chatSceneFit,sidebarsCollapsed,topbarGap,transcriptClipBottom,panoramaFit,opacityOptions,withOpacityOverrides,transcriptFadeStops,regionLabel,skinLanguage,skinText,skinError,skinDisplayName,validateTranslations,scenePlacement} from './core.mjs';";
 const boundary='export async function boot()';
 if(!runtime.startsWith(start)||runtime.split(boundary).length!==2)throw new Error('Runtime packaging contract changed');
 runtime=runtime.slice(start.length,runtime.indexOf(boundary)).replace("const BASE=new URL('.',import.meta.url);",'');
 core=core.replace(/^export /gm,'');runtime=runtime.replace(/^export /gm,'');
 if(/\bimport\s|import\.meta|^export /m.test(core+runtime))throw new Error('Unexpected module dependency');
 const adapter=JSON.parse(await readFile(path.join(root,'adapters','codex-26.1103.json'),'utf8'));
 const translations=await readTranslations(path.join(root,'locales'));
 const packs=await bundledPacks(root);
 const revision=createHash('sha256').update(officialDocument.toString()+core+runtime+JSON.stringify({adapter,packs,translations})).digest('hex');
 const text=`(async()=>{\n'use strict';\nif(!(${officialDocument.toString()})(location.protocol,location.hostname,location.pathname))return {blocked:'origin'};\nif(!document.querySelector('[data-app-shell-frame],main.main-surface')||!document.querySelector('aside.app-shell-left-panel,[data-sidebar-navigation-root]'))return {blocked:'shell'};\nif(window.__codexAppearanceRevision===${JSON.stringify(revision)}&&window.__codexAppearanceV1?.style)return {already:true};\nwindow.__codexAppearanceV1?.destroy?.();\n${core}\n${runtime}\nconst packs=${JSON.stringify(packs)};\nconst app=new Appearance(${JSON.stringify(adapter)},validatePack(packs[0]),${JSON.stringify(translations)});\nwindow[KEY]=app;\ntry{for(const p of packs.slice(1)){app.packs.set(p.manifest.id,validatePack(p));}await app.start();app.renderList();window.__codexAppearanceRevision=${JSON.stringify(revision)};return {installed:true,counts:app.counts};}catch(e){app.destroy();throw e;}\n})()`;
 return {text,revision};
}
export async function buildPayload(output=path.join(ROOT,'dist'),root=ROOT){const p=await payloadSource(root);await mkdir(output,{recursive:true});await writeFile(path.join(output,'cdp-payload.js'),p.text);await writeFile(path.join(output,'cdp-payload.json'),JSON.stringify({revision:p.revision,bytes:Buffer.byteLength(p.text)},null,2));return p.revision;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildPayload());
