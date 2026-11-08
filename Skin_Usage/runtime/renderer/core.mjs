// Theme packs are data, never executable scripts or arbitrary CSS.
export const REGIONS = Object.freeze(['titlebar','navigation','sidebar','sidebarRows','chatHeader','chat','userMessages','assistantMessages','toolCards','changeSummary','composer','attachments','codeBlocks','tables','rightPanel','bottomPanel','tabs','menus','dialogs','settings','pageHeaders','pageCards','questions','profileActivity','buttons','inputs','tooltips','scrollbars']);
export const SCENE_REGIONS = Object.freeze(['titlebar','navigation','sidebar','chatHeader','chat','rightPanel','bottomPanel','tabs','pageHeaders']);
const STYLE_KEYS = new Set(['surface','surfaceOpacity','text','border','borderOpacity','borderWidth','radius','padding','gap','fontFamily','fontSize','lineHeight','shadow']);
const NUMBERS = {surfaceOpacity:[0,1],borderOpacity:[0,1],borderWidth:[0,8],radius:[0,64],padding:[0,64],gap:[0,64],fontSize:[10,48],lineHeight:[1,3]};
export const regionLabel=(name,language='zh-CN',translations={})=>translations[language]?.regions?.[name]??translations.en?.regions?.[name]??name;
const fail = text => {throw new Error(text);};
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const keys = (value, allowed, label) => {if(!object(value))fail(`${label}: 需要对象`);for(const k of Object.keys(value))if(!allowed.includes(k))fail(`${label}: 不支持字段 ${k}`);};
const number = (v, min, max, label) => {if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(`${label}: 范围 ${min}–${max}`);return v;};
const color = (v,label) => {if(typeof v!=='string'||!/^#[a-f0-9]{6}$/i.test(v))fail(`${label}: 需要六位十六进制颜色`);};
export function assetPath(path) {
  if(typeof path!=='string'||path.length>240||!/^assets\/[A-Za-z0-9_./-]+\.(png|jpe?g|webp)$/i.test(path)||path.split('/').some(x=>x==='..'||x==='.'||!x))fail('素材必须是 assets/ 内的 PNG、JPEG 或 WebP 相对路径');
  return path;
}
export function validateManifest(input) {
  keys(input,['schemaVersion','id','name','description','regions','sidebarLayout','chatLayout','hover','scene'],'主题');
  if(![1,2].includes(input.schemaVersion))fail('不支持的主题格式版本');
  if(input.schemaVersion===1&&input.scene!==undefined)fail('共享场景需要主题格式版本 2');
  if(typeof input.id!=='string'||!/^[-a-z0-9]{1,64}$/.test(input.id)||input.id==='original')fail('主题 id 无效');
  if(typeof input.name!=='string'||!input.name.trim()||input.name.length>80)fail('主题名称无效');
  if(input.description!==undefined&&(typeof input.description!=='string'||input.description.length>500))fail('主题说明过长');
  keys(input.regions,REGIONS,'区域');
  if(input.hover!==undefined){keys(input.hover,['surface','surfaceOpacity'],'hover');color(input.hover.surface,'hover.surface');number(input.hover.surfaceOpacity,0,1,'hover.surfaceOpacity');}
  for(const [region,rule] of Object.entries(input.regions)) {
    keys(rule,['enabled','style','background','gradient','ornament'],region);
    if(typeof rule.enabled!=='boolean')fail(`${region}: enabled 必须是布尔值`);
    if(rule.background&&(rule.gradient||rule.ornament))fail('图片背景与矢量装饰应分属独立区域');
    if(rule.gradient!==undefined){
      keys(rule.gradient,['angle','stops','opacity'],`${region}.gradient`);number(rule.gradient.angle,-360,360,'渐变角度');if(rule.gradient.opacity!==undefined)number(rule.gradient.opacity,0,1,'渐变透明度');
      if(!Array.isArray(rule.gradient.stops)||rule.gradient.stops.length<2||rule.gradient.stops.length>6)fail('渐变需要 2–6 个色标');
      let previous=-1;for(const stop of rule.gradient.stops){keys(stop,['color','at'],'渐变色标');color(stop.color,'色标颜色');number(stop.at,0,1,'色标位置');if(stop.at<=previous)fail('色标位置必须递增');previous=stop.at;}
    }
    if(rule.ornament!==undefined){
      const o=rule.ornament;keys(o,['pattern','orientation','color','accent','opacity','scale','asset'],`${region}.ornament`);
      if(!['rose-vines','image'].includes(o.pattern)||!['vertical','horizontal'].includes(o.orientation))fail('不支持的装饰图案');
      if(o.pattern==='image'){assetPath(o.asset);if(o.color!==undefined||o.accent!==undefined)fail('图片装饰使用素材颜色');}else{color(o.color,'花朵颜色');color(o.accent,'藤蔓颜色');if(o.asset!==undefined)fail('矢量图案不接受外部素材');}
      number(o.opacity,0,1,'装饰透明度');if(o.scale!==undefined)number(o.scale,.5,2,'装饰比例');
    }
    if(rule.style!==undefined) {
      keys(rule.style,[...STYLE_KEYS],`${region}.style`);
      for(const [k,v] of Object.entries(rule.style)) {
        if(NUMBERS[k])number(v,...NUMBERS[k],k);
        else if(['surface','text','border'].includes(k)) {if(typeof v!=='string'||!/^#[a-f0-9]{6}$/i.test(v))fail(`${k}: 需要六位十六进制颜色`);}
        else if(k==='fontFamily') {if(typeof v!=='string'||!v.length||v.length>150||!/^[\p{L}\p{N} ,_-]+$/u.test(v))fail('字体名包含不支持的字符');}
        else if(k==='shadow'&&!['none','soft','deep'].includes(v))fail('shadow 无效');
      }
      if(rule.style.surfaceOpacity!==undefined&&!rule.style.surface)fail('surfaceOpacity 需要 surface 颜色');
      if(rule.style.borderOpacity!==undefined&&!rule.style.border)fail('borderOpacity 需要 border 颜色');
    }
    if(rule.background!==undefined) {
      const bg=rule.background;
      keys(bg,['asset','blackOverlay','subject','fit','maxScale','blurFill','cropTop'],`${region}.background`);
      assetPath(bg.asset);number(bg.blackOverlay,0,1,'黑色蒙层');
      if(!['subject-safe','contain','cover','cover-top'].includes(bg.fit))fail('不支持的缩放模式');
      if(bg.maxScale!==undefined)number(bg.maxScale,0.1,region==='chat'&&input.chatLayout?.mode==='panorama'?2:1,'最大缩放');
      if(bg.blurFill!==undefined&&typeof bg.blurFill!=='boolean')fail('blurFill 必须是布尔值');
      if(!Array.isArray(bg.subject)||bg.subject.length!==4)fail('subject 需要四个归一化边界坐标');
      bg.subject.forEach(v=>number(v,0,1,'人物边界'));
      if(bg.subject[0]>=bg.subject[2]||bg.subject[1]>=bg.subject[3])fail('人物边界必须具有正面积');
      if(bg.cropTop!==undefined){number(bg.cropTop,0,bg.subject[1],'顶部裁剪');if(bg.fit!=='cover-top')fail('顶部裁剪仅用于 cover-top');}
    }
  }
  if(input.sidebarLayout!==undefined){
    const layout=input.sidebarLayout;
    keys(layout,['mode','header','body','divider'],'sidebarLayout');
    if(!['merged','split'].includes(layout.mode))fail('侧栏模式必须为 merged 或 split');
    if(!layout.header)fail('分区配置需要顶部图片');
    // Reuse the exact background contract without allowing a new selector or script.
    validateManifest({schemaVersion:1,id:'header-validation',name:'header',regions:{sidebar:{enabled:true,background:layout.header}}});
    if(layout.body!==undefined)validateManifest({schemaVersion:1,id:'body-validation',name:'body',regions:{sidebar:{enabled:true,background:layout.body}}});
    if(layout.divider!==undefined){
      keys(layout.divider,['color','opacity','width','inset'],'divider');
      const d=layout.divider;
      if(typeof d.color!=='string'||!/^#[a-f0-9]{6}$/i.test(d.color))fail('分隔线颜色必须为六位十六进制');
      number(d.opacity,0,1,'分隔线透明度');number(d.width,0,4,'分隔线宽度');number(d.inset,0,64,'分隔线边距');
    }
    if(!input.regions.sidebar?.background)fail('分区配置需要侧栏主体背景');
  }
  if(input.chatLayout!==undefined){keys(input.chatLayout,['mode','leftExtension'],'chatLayout');if(!input.regions.chat?.background)fail('全景布局需要聊天背景');if(input.chatLayout.mode==='panorama'){if(input.chatLayout.leftExtension!==undefined)fail('完整全景不能同时拼接补景条');}else{if(input.chatLayout.mode!==undefined&&input.chatLayout.mode!=='left-extension')fail('不支持的全景模式');assetPath(input.chatLayout.leftExtension);}}
  if(input.scene!==undefined){
    const scene=input.scene;keys(scene,['background','regions','scope','placements'],'scene');
    if(!['window','main'].includes(scene.scope)||input.chatLayout||input.sidebarLayout&&scene.regions?.includes('sidebar'))fail('共享场景范围或分区图片布局冲突');
    if(!Array.isArray(scene.regions)||!scene.regions.length||new Set(scene.regions).size!==scene.regions.length||scene.regions.some(k=>!SCENE_REGIONS.includes(k)))fail('无效的共享场景区域');
    validateManifest({schemaVersion:1,id:'scene-validation',name:'scene',regions:{chat:{enabled:true,background:scene.background}}});
    if(!scene.background||scene.background.fit!=='subject-safe'||scene.background.maxScale!==1||scene.background.blurFill!==false||scene.background.cropTop!==undefined)fail('共享场景必须保留主体、不放大、不模糊补边');
    for(const key of scene.regions){const rule=input.regions[key];if(!rule?.enabled||rule.background||rule.gradient||rule.ornament||rule.style?.surface)fail('共享场景区域必须启用且不能重复绘制背景');}
    if(scene.placements!==undefined){
      if(!Array.isArray(scene.placements)||scene.placements.length>8)fail('最多保存八种窗口布局');
      const seen=new Set();for(const p of scene.placements){
        keys(p,['viewport','pixelRatio','frame','source','image'],'场景预计算');
        for(const key of ['viewport','source'])if(!Array.isArray(p[key])||p[key].length!==2||p[key].some(n=>!Number.isFinite(n)||n<=0||n>32768))fail('无效的预计算尺寸');
        number(p.pixelRatio,.1,8,'像素缩放');
        for(const key of ['frame','image'])if(!Array.isArray(p[key])||p[key].length!==4||p[key].some(n=>!Number.isFinite(n)||Math.abs(n)>100000)||p[key][2]<=0||p[key][3]<=0)fail('无效的预计算边界');
        const [x,y,w,h]=p.frame;if(x<0||y<0||x+w>p.viewport[0]+.01||y+h>p.viewport[1]+.01||scene.scope==='window'&&[x,y,w,h].some((n,i)=>Math.abs(n-[0,0,...p.viewport][i])>.01))fail('预计算场景超出窗口');
        const f=fitImage(w,h,...p.source,scene.background.subject,1,'subject-safe');
        if([f.x,f.y,f.width,f.height].some((n,i)=>Math.abs(n-p.image[i])>.01))fail('预计算布局与主体保护规则不一致');
        const id=JSON.stringify([p.viewport,p.pixelRatio,p.frame]);if(seen.has(id))fail('重复预计算布局');seen.add(id);
      }
    }
  }
  return structuredClone(input);
}
export function requiredAssets(manifest) {return [...new Set([...Object.values(manifest.regions).filter(r=>r.background).map(r=>r.background.asset),...(manifest.scene?[manifest.scene.background.asset]:[]),...(manifest.sidebarLayout?[manifest.sidebarLayout.header.asset]:[]),...(manifest.sidebarLayout?.body?[manifest.sidebarLayout.body.asset]:[]),...Object.values(manifest.regions).filter(r=>r.ornament?.pattern==='image').map(r=>r.ornament.asset),...(manifest.chatLayout?.leftExtension?[manifest.chatLayout.leftExtension]:[])])];}
export function sidebarSections(height,headerHeight,mode){
  number(height,0,100000,'侧栏高度');
  if(!['merged','split'].includes(mode))fail('无效侧栏模式');
  const split=mode==='split'&&Number.isFinite(headerHeight)&&headerHeight>0&&headerHeight<height;
  return {split,headerHeight:split?headerHeight:0,bodyTop:split?headerHeight:0,bodyHeight:split?height-headerHeight:height};
}
export function sidebarsCollapsed(leftOpen,rightOpen){return leftOpen===false&&rightOpen===false;}
export function topbarGap(bottom,referenceTops,maxGap=32){
  if(!Number.isFinite(bottom)||!Number.isFinite(maxGap)||maxGap<0)return 0;
  const tops=referenceTops.filter(Number.isFinite);if(!tops.length)return 0;
  const gap=Math.min(...tops)-bottom;return gap>=0&&gap<=maxGap?gap:0;
}
export function chatSceneFit({paneLeft,paneRight,referenceLeft,height,sourceWidth,sourceHeight,subject,maxScale=1,fit='subject-safe',cropTop=0}){
  if(![paneLeft,paneRight,referenceLeft].every(Number.isFinite)||paneRight<=paneLeft)fail('无效聊天参考区域');
  const base=fitImage(Math.max(1,paneRight-referenceLeft),height,sourceWidth,sourceHeight,subject,maxScale,fit,cropTop);
  return {...base,x:referenceLeft+base.x-paneLeft};
}
export function validatePack(input) {
  keys(input,['manifest','assets'],'主题包');
  const manifest=validateManifest(input.manifest);
  if(!object(input.assets))fail('缺少素材');
  for(const path of requiredAssets(manifest)) {
    const url=input.assets[path];
    if(typeof url!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url))fail(`无效的本地图片 ${path}`);
    if(url.length>28*1024*1024)fail('单张素材过大');
  }
  if(Object.keys(input.assets).some(p=>!requiredAssets(manifest).includes(p)))fail('主题包含未声明素材');
  if(JSON.stringify(input).length>64*1024*1024)fail('主题包过大');
  return {manifest,assets:structuredClone(input.assets)};
}
export function fitImage(w,h,sw,sh,roi=[0,0,1,1],maxScale=1,mode='subject-safe',cropTop=0) {
  for(const v of [w,h,sw,sh])if(!Number.isFinite(v)||v<=0)fail('无效的区域或图片尺寸');
  const [l,t,r,b]=roi.map((v,i)=>v*(i%2?sh:sw));
  const clamp=(v,a,z)=>Math.min(z,Math.max(a,v));
  if(mode==='cover'||mode==='cover-top'){
    const usableHeight=sh*(mode==='cover-top'?1-cropTop:1),scale=Math.min(maxScale,Math.max(w/sw,h/usableHeight)),width=sw*scale,height=sh*scale;
    const center=(space,size,focus)=>clamp(space/2-focus*scale,Math.min(0,space-size),Math.max(0,space-size));
    return {scale,width,height,x:center(w,width,(l+r)/2),y:mode==='cover-top'?-cropTop*height:center(h,height,(t+b)/2)};
  }
  const scale=Math.min(maxScale,mode==='contain'?Math.min(w/sw,h/sh):Math.max(w/sw,h/sh),w/(r-l),h/(b-t));
  return {scale,width:sw*scale,height:sh*scale,x:clamp((w-sw*scale)/2,-l*scale,w-r*scale),y:clamp((h-sh*scale)/2,-t*scale,h-b*scale)};
}
export function rgba(hex,alpha=1){return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${alpha})`;}

// Every participant views the same scene. Node size never rescales the image.
export function sharedSceneFit({width,height,left,top,sourceWidth,sourceHeight,subject}){
  if(![left,top].every(Number.isFinite))fail('无效的场景偏移');
  const f=fitImage(width,height,sourceWidth,sourceHeight,subject,1,'subject-safe');
  return {...f,x:f.x-left,y:f.y-top,covered:f.width>=width-.01&&f.height>=height-.01};
}

export function scenePlacement(scene,viewport,pixelRatio,frame,source,cache){
  const key=JSON.stringify([viewport,pixelRatio,frame,source,scene.background.asset,scene.background.subject]);
  if(cache.has(key))return cache.get(key);
  const profile=scene.placements?.find(p=>p.pixelRatio===pixelRatio&&JSON.stringify([p.viewport,p.frame,p.source])===JSON.stringify([viewport,frame,source]));
  const [left,top,width,height]=frame;
  const f=profile?{x:profile.image[0]+left,y:profile.image[1]+top,width:profile.image[2],height:profile.image[3],covered:profile.image[2]>=width-.01&&profile.image[3]>=height-.01,precomputed:true}:sharedSceneFit({width,height,left:-left,top:-top,sourceWidth:source[0],sourceHeight:source[1],subject:scene.background.subject});
  if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(key,f);return f;
}

export function panoramaFit({paneLeft,paneRight,railRight,sceneLeft=railRight,sceneRight=paneRight,height,sourceWidth,sourceHeight,subject,maxScale=1}){
 for(const v of [paneLeft,paneRight,sceneLeft,sceneRight])if(!Number.isFinite(v))fail('无效的全景边界');
 if(paneRight<=paneLeft||sceneRight<=sceneLeft)fail('无效的全景区域');
 const fit=fitImage(sceneRight-sceneLeft,height,sourceWidth,sourceHeight,subject,maxScale,'cover');
 return {...fit,x:sceneRight-fit.width-paneLeft};
}

export function opacityOptions(manifest,language='zh-CN',translations={}){
 const m=validateManifest(manifest),options=[],labelFor=key=>skinText(language,key,{},translations);
 const add=(parts,label,value,mask=false)=>options.push({key:parts.join('.'),path:parts,label,value,mask});
  if(m.scene)add(['scene','background','blackOverlay'],labelFor('opacityOverlay'),m.scene.background.blackOverlay,true);
 for(const [name,rule]of Object.entries(m.regions)){
  if(!rule.enabled)continue;const label=regionLabel(name,language,translations),p=['regions',name];
  if(rule.gradient){const direct=rule.gradient.opacity!==undefined||!rule.style?.surface;add([...p,...(direct?['gradient','opacity']:['style','surfaceOpacity'])],label+' · '+labelFor('opacityBackground'),rule.gradient.opacity??rule.style?.surfaceOpacity??1);}
  else if(rule.style?.surface)add([...p,'style','surfaceOpacity'],label+' · '+labelFor('opacityBackground'),rule.style.surfaceOpacity??1);
  if(rule.style?.border)add([...p,'style','borderOpacity'],label+' · '+labelFor('opacityBorder'),rule.style.borderOpacity??1);
  if(rule.background)add([...p,'background','blackOverlay'],label+' · '+labelFor('opacityOverlay'),rule.background.blackOverlay,true);
  if(rule.ornament)add([...p,'ornament','opacity'],label+' · '+labelFor('opacityDecoration'),rule.ornament.opacity);
 }
 if(m.regions.sidebar?.enabled&&m.sidebarLayout){
  for(const [key,labelKey]of [['header','opacitySidebarHeader'],['body','opacitySidebarBody']])if(m.sidebarLayout[key])add(['sidebarLayout',key,'blackOverlay'],labelFor(labelKey)+' · '+labelFor('opacityOverlay'),m.sidebarLayout[key].blackOverlay,true);
  if(m.sidebarLayout.divider)add(['sidebarLayout','divider','opacity'],labelFor('opacitySidebarDivider'),m.sidebarLayout.divider.opacity);
 }
 if(m.hover)add(['hover','surfaceOpacity'],labelFor('opacityHover'),m.hover.surfaceOpacity);
 return options;
}

export function withOpacityOverrides(manifest,overrides={}){
 const result=validateManifest(manifest),allowed=new Map(opacityOptions(result).map(option=>[option.key,option]));
 if(!object(overrides))fail('透明度设置必须是对象');
 for(const [key,value]of Object.entries(overrides)){
  const option=allowed.get(key);if(!option)fail('当前主题没有此透明度选项：'+key);number(value,0,1,'透明度');
  let target=result;for(const part of option.path.slice(0,-1))target=target[part];target[option.path.at(-1)]=value;
 }
 return validateManifest(result);
}

export function transcriptClipBottom(content,viewport,composer){
 const values=[content?.height,content?.bottom,viewport?.top,viewport?.bottom,viewport?.left,viewport?.right,composer?.top,composer?.bottom,composer?.left,composer?.right];
 if(values.some(v=>!Number.isFinite(v))||content.height<=0||viewport.bottom<=viewport.top||composer.bottom<=composer.top||composer.right<=composer.left||composer.bottom<=viewport.top||composer.top>=viewport.bottom||composer.right<=viewport.left||composer.left>=viewport.right)return null;
 return Math.min(content.height,Math.max(0,content.bottom-Math.max(viewport.top,composer.top)));
}

export function transcriptFadeStops(content,fade){
 if(![content?.top,fade?.top,fade?.bottom].every(Number.isFinite)||fade.bottom<=fade.top)return null;
 const start=fade.top-content.top,end=fade.bottom-content.top;
 return end>0?{start,end}:null;
}

const SKIN_UI_KEYS=["title","launcher","launcherLabel","closeLabel","close","choose","original","layout","merged","split","language","autoLanguage","import","restore","remove","opacityTitle","opacityNote","opacityReset","opacityNone","percentage","opacityRange","loading","ready","storageUnavailable","operationFailed","importFailed","skinSaved","skinSaveFailed","skinTemporary","layoutSaved","layoutFailed","layoutTemporary","opacitySaved","opacityFailed","opacityTemporary","languageSaved","languageFailed","languageTemporary","imported","deleted","deletePreferencesFailed","diagnostics","shellUnknown","originalRestored","compatibility","layoutUnavailable","chooseSkin","skinMissing","folderCount","folderSize","oneFolder","invalidPath","duplicatePath","manifestMissing","idExists","missingAsset","invalidImageSize","decodeFailed","storageImport","cannotDeleteDefault","storageShort","invalidConfig","storageBlocked","storageCancelled","opacityBackground","opacityBorder","opacityOverlay","opacityDecoration","opacitySidebarHeader","opacitySidebarBody","opacitySidebarDivider","opacityHover"];
export function validateTranslations(input){
 if(!object(input)||Object.keys(input).length>64||!Object.hasOwn(input,'en'))fail('Translation bundle requires English and at most 64 locales');
 for(const [code,entry]of Object.entries(input)){
  if(!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(code))fail('Invalid translation locale');
  keys(entry,['locale','name','direction','menuLabels','strings','regions','skins'],'translation');
  if(entry.locale!==code||typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>80)fail('Invalid translation identity');
  if(entry.direction!==undefined&&!['ltr','rtl'].includes(entry.direction))fail('Invalid translation direction');
  if(entry.menuLabels!==undefined&&(!Array.isArray(entry.menuLabels)||entry.menuLabels.length>8||entry.menuLabels.some(v=>typeof v!=='string'||!v.trim()||v.length>80)))fail('Invalid app language menu labels');
  for(const field of ['strings','regions','skins']){
   const values=entry[field];if(!object(values)||Object.keys(values).length>300)fail('Invalid translation dictionary');
   for(const [key,value]of Object.entries(values))if(!/^[A-Za-z0-9_-]{1,80}$/.test(key)||['__proto__','constructor','prototype'].includes(key)||typeof value!=='string'||!value.trim()||value.length>2000)fail('Invalid translation value');
  }
 }
 for(const key of SKIN_UI_KEYS)if(!Object.hasOwn(input.en.strings,key))fail('Missing English translation: '+key);
 const placeholders=text=>[...new Set([...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]))].sort().join('|');
 for(const entry of Object.values(input))for(const[key,value]of Object.entries(entry.strings))if(Object.hasOwn(input.en.strings,key)&&placeholders(value)!==placeholders(input.en.strings[key]))fail('Translation placeholders differ: '+entry.locale+'/'+key);
 return structuredClone(input);
}
export function skinLanguage(preference='auto',appLanguage='',translations){
 const codes=translations?Object.keys(translations):['en','zh-CN'];if(preference!=='auto'&&codes.includes(preference))return preference;
 const tag=String(appLanguage).toLowerCase(),exact=codes.find(code=>code.toLowerCase()===tag);if(exact)return exact;
 const base=tag.split('-')[0];if(base==='zh'&&codes.includes('zh-CN'))return 'zh-CN';if(base==='en'&&codes.includes('en'))return 'en';
 return codes.find(code=>code.toLowerCase().split('-')[0]===base)??'en';
}
export function skinText(language,key,values={},translations={}){const text=translations[language]?.strings?.[key]??translations.en?.strings?.[key]??key;return text.replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??''));}
export function skinError(language,error,translations){const message=error?.message??String(error);if(language.startsWith('zh')||!/[\u3400-\u9fff]/.test(message))return message;if(message==='主题存储被其他窗口阻塞')return skinText(language,'storageBlocked',{},translations);if(message==='存储已取消')return skinText(language,'storageCancelled',{},translations);return skinText(language,'invalidConfig',{},translations);}
export function skinDisplayName(manifest,language,translations={}){return translations[language]?.skins?.[manifest.id]??translations.en?.skins?.[manifest.id]??manifest.name;}
export function decorationCss(rule,assets={}){
  const images=[],sizes=[],repeats=[];
  if(rule.ornament?.pattern==='image'){
    const o=rule.ornament,url=assets[o.asset],scale=o.scale??1;if(!url)fail('缺少装饰图片素材');
    images.push(`url("${url}")`);sizes.push(o.orientation==='horizontal'?`${320*scale}px auto`:`auto ${320*scale}px`);repeats.push(o.orientation==='horizontal'?'repeat-x':'repeat-y');
  }else if(rule.ornament){
    const o=rule.ornament,horizontal=o.orientation==='horizontal',scale=o.scale??1;
    const rose=(x,y)=>`<g transform="translate(${x} ${y})"><path d="M0-9C5-12 11-7 8-2C13 3 8 10 3 8C0 13-7 10-7 5C-13 2-10-5-5-5C-5-10-2-11 0-9Z" fill="${o.color}"/><path d="M0-6C7-5 7 3 1 5C-5 7-8 0-4-4C1-7 5-1 1 2C-2 4-4 0-1-1M-7 5Q-4 9 3 8M8-2Q6-8 0-9" fill="none" stroke="${o.accent}" stroke-width=".65"/></g>`;
    const drawing=`<g opacity="${o.opacity}"><g fill="none" stroke="${o.accent}" stroke-width=".85"><path d="M5 330C20 288-5 264 7 228S18 168 6 129S-2 55 7-10M47-10C34 32 58 58 46 94S35 154 47 193S55 266 46 330"/><path d="M7 54Q20 42 14 31Q3 36 7 54M8 151Q22 145 16 132Q4 136 8 151M7 270Q21 255 14 247Q2 255 7 270M46 58Q32 66 38 78Q49 71 46 58M46 177Q32 187 38 198Q50 191 46 177M46 281Q32 292 39 301Q50 295 46 281"/></g>${rose(8,94)}${rose(44,233)}</g>`;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${horizontal?'320 52':'52 320'}">${horizontal?'<g transform="translate(320 0) rotate(90)">'+drawing+'</g>':drawing}</svg>`;
    images.push(`url("data:image/svg+xml,${encodeURIComponent(svg)}")`);sizes.push(horizontal?`${320*scale}px ${52*scale}px`:`${52*scale}px ${320*scale}px`);repeats.push(horizontal?'repeat-x':'repeat-y');
  }
  if(rule.gradient){const alpha=rule.gradient.opacity??rule.style?.surfaceOpacity??1;images.push(`linear-gradient(${rule.gradient.angle}deg,${rule.gradient.stops.map(s=>`${alpha===1?s.color:rgba(s.color,alpha)} ${s.at*100}%`).join(',')})`);sizes.push('100% 100%');repeats.push('no-repeat');}
  return {backgroundImage:images.join(','),backgroundSize:sizes.join(','),backgroundRepeat:repeats.join(','),backgroundPosition:'center'};
}
export function declarations(style={}) {
  const out=[];
  const map={text:'color',border:'border-color',borderWidth:'border-width',radius:'border-radius',padding:'padding',gap:'gap',fontFamily:'font-family',fontSize:'font-size',lineHeight:'line-height'};
  if(style.surface)out.push(`background-color:${rgba(style.surface,style.surfaceOpacity??1)}!important`);
  for(const [k,p] of Object.entries(map))if(style[k]!==undefined)out.push(`${p}:${k==='border'&&style.borderOpacity!==undefined?rgba(style[k],style.borderOpacity):style[k]}${['borderWidth','radius','padding','gap','fontSize'].includes(k)?'px':''}!important`);
  if(style.borderWidth!==undefined)out.push('border-style:solid!important');
  if(style.shadow)out.push(`box-shadow:${{none:'none',soft:'0 4px 16px #0003',deep:'0 12px 40px #0008'}[style.shadow]}!important`);
  return out.join(';');
}
