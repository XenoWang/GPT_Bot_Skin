import {readFile,writeFile,mkdir,copyFile,realpath,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateManifest,validatePack,requiredAssets,validateTranslations} from '../renderer/core.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function readTranslations(directory=path.join(ROOT,'locales')){
 const root=await realpath(directory),translations={},files=(await readdir(root)).filter(n=>n.endsWith('.json')).sort();if(files.length>64)throw new Error('Too many translation files');
 for(const name of files){
  const file=await realpath(path.join(root,name));if(path.dirname(file)!==root)throw new Error('Translation file escapes its folder');const bytes=await readFile(file);if(bytes.length>128*1024)throw new Error('Translation file exceeds 128 KiB');
  const entry=JSON.parse(bytes.toString('utf8'));if(name!==entry.locale+'.json'||Object.hasOwn(translations,entry.locale))throw new Error('Translation filename or locale is invalid');Object.defineProperty(translations,entry.locale,{value:entry,enumerable:true,writable:true,configurable:true});
 }
 return validateTranslations(translations);
}
export async function readPack(directory){
 const root=await realpath(directory);const mpath=await realpath(path.join(root,'manifest.json'));if(path.dirname(mpath)!==root)throw new Error('主题配置不能位于文件夹外');
 const manifest=validateManifest(JSON.parse(await readFile(mpath,'utf8'))),assets={};
 for(const relative of requiredAssets(manifest)){
  const resolved=await realpath(path.join(root,relative));const rel=path.relative(root,resolved);if(rel.startsWith('..')||path.isAbsolute(rel))throw new Error('素材越过主题文件夹');
  const bytes=await readFile(resolved);if(bytes.length>20*1024*1024)throw new Error('单张素材超过 20 MiB');
  const ext=path.extname(relative).toLowerCase(),mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[ext];
  const valid=mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!valid)throw new Error('图片文件头与格式不符');assets[relative]=`data:${mime};base64,${bytes.toString('base64')}`;
 }
 return validatePack({manifest,assets});
}
export async function build(output=path.join(ROOT,'dist')){
 const pack=await readPack(path.join(ROOT,'themes','kurumi-twilight'));await mkdir(output,{recursive:true});
 for(const name of ['core.mjs','runtime.mjs'])await copyFile(path.join(ROOT,'renderer',name),path.join(output,name));
 await copyFile(path.join(ROOT,'adapters','codex-26.1103.json'),path.join(output,'adapter.json'));
 await writeFile(path.join(output,'builtin.json'),JSON.stringify(pack));await writeFile(path.join(output,'locales.json'),JSON.stringify(await readTranslations()));return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await build());
