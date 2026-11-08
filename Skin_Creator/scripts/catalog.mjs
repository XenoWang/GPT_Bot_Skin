import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {translate} from './localization.mjs';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function layoutSvg(sample,catalog,bundle){
 const [w,h]=sample.viewport;if(![w,h].every(n=>Number.isFinite(n)&&n>0))throw new Error('Invalid measured viewport');
 const rows=[];for(const [index,region]of catalog.regions.entries()){
  const observed=sample.regionCoverage.find(r=>r.key===region.key);if(!observed)continue;
  for(const box of (observed.samples??[]).filter(s=>s.visible)){
   const [x,y,width,height]=box.rect;if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)continue;
   rows.push({area:width*height,svg:`<g><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#93C5FD" fill-opacity=".08" stroke="${region.requiresAdapterReview?'#D97706':'#2563EB'}"/><text x="${Math.max(0,x)+4}" y="${Math.max(0,y)+15}" font-size="13" fill="#172554">${index+1} ${escape(bundle.regions[region.key]??region.label.en)}</text></g>`});
  }
 }
 rows.sort((a,b)=>b.area-a.area);
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img"><rect width="${w}" height="${h}" fill="#F8FAFC"/>${rows.map(r=>r.svg).join('')}</svg>`;
}
export function formExamplesSvg(sample,bundle){
 const [w,h]=sample.viewport,gap=Math.max(20,w*.05),header=Math.max(40,h*.08),sidebar=sample.regionCoverage.find(r=>r.key==='sidebar')?.samples?.find(n=>n.visible)?.rect;
 const panel=(offset,separate)=>`<g transform="translate(${offset} ${header})"><rect width="${w}" height="${h}" fill="#DBEAFE" stroke="#2563EB"/>${separate&&sidebar?`<rect x="${sidebar[0]}" y="${sidebar[1]}" width="${sidebar[2]}" height="${sidebar[3]}" fill="#FED7AA" stroke="#C2410C"/>`:''}<text x="${w*.65}" y="${h*.5}" text-anchor="middle" font-size="${h*.09}">A</text>${separate&&sidebar?`<text x="${sidebar[0]+sidebar[2]/2}" y="${sidebar[1]+sidebar[3]/2}" text-anchor="middle" font-size="${h*.09}">B</text>`:''}</g>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w*2+gap} ${h+header}"><text x="0" y="${header*.7}" font-size="${header*.6}">${escape(translate(bundle,'form.unified'))}</text><text x="${w+gap}" y="${header*.7}" font-size="${header*.6}">${escape(translate(bundle,'form.separate'))}</text>${panel(0,false)}${panel(w+gap,true)}</svg>`;
}
export async function writeCatalog(directory,report,catalog,bundle){
 await mkdir(directory,{recursive:true});const pages=[];
 const example=report.samples.find(s=>s.regionCoverage.some(r=>r.key==='sidebar'&&(r.samples??[]).some(n=>n.visible)))??report.samples[0];
 if(example){await writeFile(path.join(directory,'form-examples.svg'),formExamplesSvg(example,bundle),'utf8');pages.push(`<figure><figcaption>${escape(translate(bundle,'catalog.examples'))}</figcaption><img src="form-examples.svg" alt="${escape(translate(bundle,'catalog.examples'))}"/></figure>`);}
 const t=(key,values)=>escape(translate(bundle,key,values));
 for(const [i,sample]of report.samples.entries()){const name=`layout-${i+1}.svg`;await writeFile(path.join(directory,name),layoutSvg(sample,catalog,bundle),'utf8');pages.push(`<figure><figcaption>${escape(sample.label??'capture-'+(i+1))}</figcaption><img src="${name}" alt="${t('catalog.layout')}"/></figure>`);}
 const rows=catalog.regions.map((r,i)=>`<tr><td>${i+1}</td><td>${escape(bundle.regions[r.key]??r.label.en)}</td><td>${t('status.'+r.status)}</td><td>${r.configuration.map(k=>t('property.'+(r.key==='scrollbars'&&k==='text'?'scrollbarThumb':k))).join(', ')}</td><td>${r.reasons.map(k=>t('reason.'+k)).join(', ')}</td></tr>`).join('');
 const gaps=(report.coverage?.states??[]).filter(s=>s.status!=='observed').map(s=>`<li>${escape(s.id)}: ${t('reason.'+(s.reason??s.status))}</li>`).join('');
 if(catalog.candidates?.length)pages.unshift(`<section><h2>${t('catalog.candidates')}</h2><ul>${catalog.candidates.map((c,i)=>`<li>C${i+1}: ${escape(c.role??c.tag)} — ${escape(report.samples[c.sample]?.label??'capture')} — ${t(c.visible?'status.observed':'status.loaded-hidden')}</li>`).join('')}</ul></section>`);
 const html=`<!doctype html><html lang="${escape(bundle.locale)}" dir="${bundle.direction}"><meta charset="utf-8"><title>${t('catalog.title')}</title><style>body{font:15px/1.6 system-ui;max-width:1100px;margin:30px auto;padding:0 20px;color:#172554}figure{margin:24px 0}img{width:100%;border:1px solid #cbd5e1}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:8px;text-align:start}</style><h1>${t('catalog.title')}</h1><p>${t('catalog.intro')}</p><table><tr><th>#</th><th>${t('catalog.region')}</th><th>${t('catalog.status')}</th><th>${t('catalog.properties')}</th><th>${t('catalog.review')}</th></tr>${rows}</table><ul>${gaps}</ul>${pages.join('')}</html>`;
 await writeFile(path.join(directory,'index.html'),html,'utf8');return path.join(directory,'index.html');
}
