import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readPack,readTranslations} from './build.mjs';
import {officialDocument} from './cdp-transport.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function payloadSource(){
 let core=await readFile(path.join(ROOT,'renderer','core.mjs'),'utf8');
 let runtime=await readFile(path.join(ROOT,'renderer','runtime.mjs'),'utf8');
 const start="import {validatePack,validateManifest,requiredAssets,fitImage,declarations,sidebarSections,decorationCss,rgba,chatSceneFit,sidebarsCollapsed,topbarGap,transcriptClipBottom,panoramaFit,opacityOptions,withOpacityOverrides,transcriptFadeStops,regionLabel,skinLanguage,skinText,skinError,skinDisplayName,validateTranslations,scenePlacement} from './core.mjs';";
 const boundary='export async function boot()';
 if(!runtime.startsWith(start)||runtime.split(boundary).length!==2)throw new Error('Runtime packaging contract changed');
 runtime=runtime.slice(start.length,runtime.indexOf(boundary)).replace("const BASE=new URL('.',import.meta.url);",'');
 core=core.replace(/^export /gm,'');runtime=runtime.replace(/^export /gm,'');
 if(/\bimport\s|import\.meta|^export /m.test(core+runtime))throw new Error('Unexpected module dependency');
 const adapter=JSON.parse(await readFile(path.join(ROOT,'adapters','codex-26.1103.json'),'utf8'));
 const translations=await readTranslations();
 const packs=await Promise.all(['kurumi-twilight','neutral-dark'].map(n=>readPack(path.join(ROOT,'themes',n))));
 const revision=createHash('sha256').update(officialDocument.toString()+core+runtime+JSON.stringify({adapter,packs,translations})).digest('hex');
 const text=`(async()=>{\n'use strict';\nif(!(${officialDocument.toString()})(location.protocol,location.hostname,location.pathname))return {blocked:'origin'};\nif(!document.querySelector('[data-app-shell-frame],main.main-surface')||!document.querySelector('aside.app-shell-left-panel,[data-sidebar-navigation-root]'))return {blocked:'shell'};\nif(window.__codexAppearanceRevision===${JSON.stringify(revision)}&&window.__codexAppearanceV1?.style)return {already:true};\nwindow.__codexAppearanceV1?.destroy?.();\n${core}\n${runtime}\nconst packs=${JSON.stringify(packs)};\nconst app=new Appearance(${JSON.stringify(adapter)},validatePack(packs[0]),${JSON.stringify(translations)});\nwindow[KEY]=app;\ntry{for(const p of packs.slice(1)){app.packs.set(p.manifest.id,validatePack(p));}await app.start();app.renderList();window.__codexAppearanceRevision=${JSON.stringify(revision)};return {installed:true,counts:app.counts};}catch(e){app.destroy();throw e;}\n})()`;
 return {text,revision};
}
export async function buildPayload(output=path.join(ROOT,'dist')){const p=await payloadSource();await mkdir(output,{recursive:true});await writeFile(path.join(output,'cdp-payload.js'),p.text);await writeFile(path.join(output,'cdp-payload.json'),JSON.stringify({revision:p.revision,bytes:Buffer.byteLength(p.text)},null,2));return p.revision;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildPayload());
