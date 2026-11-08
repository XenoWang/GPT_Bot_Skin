import {readFile,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const LOCALES=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../locales');
const localePattern=/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/;
const unsafe=new Set(['__proto__','constructor','prototype']);
function textMap(value){if(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([k,v])=>unsafe.has(k)||typeof v!=='string'||v.length>20000))throw new Error('Invalid locale text map');return value;}
export function validateLocale(value,filename){
 if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['locale','name','direction','messages','regions','errors'].includes(k))||!localePattern.test(value.locale??'')||filename!==value.locale+'.json'||typeof value.name!=='string'||!value.name.trim()||value.name.length>80||!['ltr','rtl'].includes(value.direction??'ltr'))throw new Error('Invalid Creator locale file');
 for(const key of ['messages','regions','errors'])if(value[key]!==undefined)textMap(value[key]);
 return {...value,direction:value.direction??'ltr',messages:value.messages??{},regions:value.regions??{},errors:value.errors??{}};
}
export async function loadLocales(directory=LOCALES){
 const root=await realpath(directory),files=(await readdir(root)).filter(n=>n.endsWith('.json')).sort();if(files.length>64)throw new Error('Too many Creator locales');
 const entries=[];for(const name of files){const file=await realpath(path.join(root,name));if(path.dirname(file)!==root)throw new Error('Locale escapes its folder');const bytes=await readFile(file);if(bytes.length>128*1024)throw new Error('Locale file exceeds 128 KiB');const data=validateLocale(JSON.parse(bytes.toString('utf8')),name);entries.push([data.locale,data]);}
 const locales=Object.fromEntries(entries);if(!locales.en)throw new Error('English fallback locale is required');
 const placeholders=s=>[...s.matchAll(/\{([\w]+)\}/g)].map(m=>m[1]).sort().join(',');
 for(const locale of Object.values(locales))for(const [key,value]of Object.entries(locale.messages))if(locales.en.messages[key]!==undefined&&placeholders(value)!==placeholders(locales.en.messages[key]))throw new Error('Locale placeholders do not match English: '+key);
 return locales;
}
export function selectLanguage(locales,preferred){
 if(Object.hasOwn(locales,preferred??''))return preferred;
 const base=String(preferred??'').split('-')[0].toLowerCase();return Object.keys(locales).find(key=>key.split('-')[0].toLowerCase()===base)??'en';
}
export function localeBundle(locales,language){const selected=locales[selectLanguage(locales,language)],base=locales.en;return {...selected,messages:{...base.messages,...selected.messages},regions:{...base.regions,...selected.regions},errors:{...base.errors,...selected.errors}};}
export function translate(bundle,key,values={}){return (bundle.messages[key]??key).replace(/\{([\w]+)\}/g,(all,name)=>Object.hasOwn(values,name)?String(values[name]):all);}
export function localizeError(bundle,message){
 const direct=bundle.errors[message];if(direct)return direct;
 const prefix=Object.keys(bundle.errors).filter(k=>k.endsWith('*')&&k!=='*'&&message.startsWith(k.slice(0,-1))).sort((a,b)=>b.length-a.length)[0];
 if(prefix)return bundle.errors[prefix].replace('{detail}',message.slice(prefix.length-1));
 return (bundle.errors['*']??'{detail}').replace('{detail}',message);
}
