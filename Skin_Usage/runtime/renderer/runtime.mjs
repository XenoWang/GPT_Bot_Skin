import {validatePack,validateManifest,requiredAssets,fitImage,declarations,sidebarSections,decorationCss,rgba,chatSceneFit,sidebarsCollapsed,topbarGap,transcriptClipBottom,panoramaFit,opacityOptions,withOpacityOverrides,transcriptFadeStops,regionLabel,skinLanguage,skinText,skinError,skinDisplayName,validateTranslations,scenePlacement} from './core.mjs';
const KEY='__codexAppearanceV1',MARK='data-codex-appearance',OWN='data-codex-appearance-owned';
// Native transparent hit areas keep their original geometry and affordance.
const HIT_ONLY_BUTTONS='[data-app-shell-main-surface] nav .vertical-scroll-fade-mask button,[class~="group/activity-header"] > button[aria-expanded]';
const NEUTRAL_TEXT_REGIONS=new Set(['buttons','sidebarRows','composer','menus','dialogs','settings','inputs','questions','pageCards','tooltips','tabs']);
const BASE=new URL('.',import.meta.url);
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export class Store {
 async open(){this.db=await new Promise((ok,no)=>{const r=indexedDB.open('codex-appearance-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('packs',{keyPath:'id'});r.result.createObjectStore('state');};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);r.onblocked=()=>no(new Error('主题存储被其他窗口阻塞'));});}
 tx(name,mode,fn){return new Promise((ok,no)=>{const tx=this.db.transaction(name,mode);let value;try{const r=fn(tx.objectStore(name));r.onsuccess=()=>value=r.result;}catch(e){tx.abort();no(e);return;}tx.oncomplete=()=>ok(value);tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error??new Error('存储已取消'));});}
 list(){return this.tx('packs','readonly',s=>s.getAll());}
 put(pack){return this.tx('packs','readwrite',s=>s.put({id:pack.manifest.id,pack}));}
 remove(id){return this.tx('packs','readwrite',s=>s.delete(id));}
 active(){return this.tx('state','readonly',s=>s.get('active'));}
 select(id){return this.tx('state','readwrite',s=>s.put(id,'active'));}
 layouts(){return this.tx('state','readonly',s=>s.get('sidebarLayouts'));}
 saveLayouts(value){return this.tx('state','readwrite',s=>s.put(value,'sidebarLayouts'));}
 opacities(){return this.tx('state','readonly',s=>s.get('opacityPreferences'));}
 saveOpacities(value){return this.tx('state','readwrite',s=>s.put(value,'opacityPreferences'));}
 language(){return this.tx('state','readonly',s=>s.get('language'));}
 saveLanguage(value){return this.tx('state','readwrite',s=>s.put(value,'language'));}
}
export class Appearance {
 constructor(adapter,builtin,translations={}){this.adapter=adapter;this.translations=translations;this.packs=new Map([[builtin.manifest.id,builtin]]);this.builtin=builtin.manifest.id;this.active='original';this.mounted=new Map();this.oldMarks=new Map();this.transparent=new Set();this.clips=new Map();this.generation=0;this.counts={};this.store=new Store();this.queue=Promise.resolve();this.layoutPreferences={};this.opacityPreferences={};this.languagePreference='auto';this.language=skinLanguage('auto',this.appLanguage(),this.translations);this.sceneSidebarWidth=adapter.chatLayoutState?.defaultSidebarWidth??296;}
 async start(){
   this.features={sharedScene:1};
  this.style=el('style');this.style.setAttribute(OWN,'style');document.head.append(this.style);this.makePanel();
  this.observer=new MutationObserver(records=>this.onMutations(records));
  this.observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:this.adapter.observedAttributes??[]});
  this.languageObserver=new MutationObserver(()=>{if(this.languagePreference==='auto'&&this.language!==skinLanguage('auto',this.appLanguage(),this.translations))this.refresh();});this.syncLanguageWatch();
  try{await this.store.open();this.storageReady=true;const language=await this.store.language();if(language==='auto'||Object.hasOwn(this.translations,language))this.languagePreference=language;this.language=skinLanguage(this.languagePreference,this.appLanguage(),this.translations);this.localizePanel();const saved=await this.store.layouts();if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const [id,mode]of Object.entries(saved))if(/^[-a-z0-9]{1,64}$/.test(id)&&['merged','split'].includes(mode))this.layoutPreferences[id]=mode;const alpha=await this.store.opacities();if(alpha&&typeof alpha==='object'&&!Array.isArray(alpha))for(const [id,values]of Object.entries(alpha))if(/^[-a-z0-9]{1,64}$/.test(id)&&values&&typeof values==='object'&&!Array.isArray(values))this.opacityPreferences[id]=values;for(const row of await this.store.list()){try{const p=validatePack(row.pack);if(p.manifest.id!==this.builtin)this.packs.set(p.manifest.id,p);}catch{}}const id=await this.store.active();await this.activate(id==='original'||this.packs.has(id)?id:this.builtin,false);}
  catch(e){this.report('storageUnavailable',{error:e});await this.activate(this.builtin,false);}
  this.renderList();if(this.noticeMessage?.key==='loading')this.report('ready');
 }
 t(key,values={}){return skinText(this.language,key,values,this.translations);}
  validateCreatorPack(input){return validatePack(input);}
 appLanguage(){const doc=globalThis.document,declared=doc?.documentElement?.lang;if(declared)return declared;const menu=doc?.getElementById?.('application-menu-trigger-file-menu'),label=menu?.textContent?.trim();return Object.values(this.translations??{}).find(locale=>locale.menuLabels?.includes(label))?.locale??'en';}
 syncLanguageWatch(){if(!this.languageObserver)return;const menu=document.getElementById('application-menu-trigger-file-menu');if(this.languageMenu===menu)return;this.languageObserver.disconnect();this.languageMenu=menu;this.languageObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});if(menu)this.languageObserver.observe(menu,{childList:true,characterData:true,subtree:true});}
 report(key,values={}){this.noticeMessage={key,values};const display={...values};if(display.error)display.error=skinError(this.language,display.error,this.translations);this.notice.textContent=this.t(key,display);}
 reportError(error){this.report('operationFailed',{error});}
 onMutations(records){
  const external=n=>!((n?.nodeType===1?n:n?.parentElement)?.closest?.(`[${OWN}]`));
  if(!this.scheduled&&records.some(r=>r.type==='attributes'?external(r.target):[...r.addedNodes,...r.removedNodes].some(external)))this.scheduled=requestAnimationFrame(()=>{this.scheduled=0;this.refresh();});
 }
 makePanel(){
  this.host=el('div');this.host.setAttribute(OWN,'manager');document.body.append(this.host);const root=this.host.attachShadow({mode:'open'});
  const css=el('style');css.textContent=`
   :host{display:contents;font:13px/1.5 "Segoe UI","Microsoft YaHei",sans-serif;color:#eee}
   :host([data-docked="true"]){display:flex;position:static;flex:0 0 auto;justify-content:center;align-items:center;width:100%;min-width:0}
   :host([data-docked="false"]){display:none}
   *{box-sizing:border-box}button,select{font:inherit;color:inherit;background:#30343d;border:1px solid #626975;border-radius:7px;padding:7px 10px;cursor:pointer}
   button:focus-visible,select:focus-visible{outline:2px solid #a9caff;outline-offset:-2px}
   .toggle{inline-size:min(100%,var(--appearance-native-size,36px),clamp(28px,6dvh,36px));aspect-ratio:1;padding:0;font-size:12px;flex:none;touch-action:manipulation;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
   .manager-heading{direction:ltr;display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;padding:0 0 12px}.manager-heading h2{margin:0;min-width:0;overflow-wrap:anywhere}.close-top{width:32px;height:32px;padding:0;flex:none;align-self:flex-start;font-size:16px;line-height:1}.panel-scroll{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding-right:8px;flex:1 1 auto}.manager-status{flex:none;margin:10px 0 0;font-size:12px;line-height:1.4}
   dialog{position:fixed;inset:0;width:min(420px,calc(100dvw - 24px));max-width:calc(100dvw - 24px);max-height:calc(100dvh - 24px);overflow:hidden;margin:auto;padding:clamp(12px,3vw,18px);color:#eee;background:#20242c;border:1px solid #686e7b;border-radius:14px;box-shadow:0 16px 50px #0008}dialog[open]{display:flex;flex-direction:column}
   dialog::backdrop{background:#0005}h2{font-size:17px;margin:0 0 12px}.row{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.row button{flex:1 1 auto;max-width:100%;overflow-wrap:anywhere}select{width:100%;min-width:0}p{color:#c2c8d4;overflow-wrap:anywhere}small{color:#acb5c6;overflow-wrap:anywhere}input[type=file]{display:none}
   .opacity-settings{margin:14px 0}.opacity-settings summary{cursor:pointer;font-weight:600}.opacity-fields{display:grid;gap:12px;margin:12px 0}.opacity-field{display:grid;grid-template-columns:minmax(0,1fr) 80px;gap:6px 10px;align-items:center}.opacity-field label{grid-column:1/-1;overflow-wrap:anywhere}.opacity-field input[type=range]{width:100%;min-width:0;accent-color:auto}.opacity-field input[type=number]{width:100%;min-width:0;font:inherit;color:inherit;background:#30343d;border:1px solid #626975;border-radius:7px;padding:5px}.opacity-field input:focus-visible{outline:2px solid #a9caff;outline-offset:2px}.opacity-note{font-size:12px;margin:8px 0}
   @media(max-height:500px){dialog{padding:12px}h2{margin-bottom:6px}.row{margin:6px 0}p{margin:8px 0}}
  `;root.append(css);this.panelBaseCss=css.textContent;this.panelStyles=[css,css.cloneNode(true)];
  this.launcher=el('div');this.launcher.setAttribute(OWN,'launcher');this.launcher.dataset.docked='false';document.body.append(this.launcher);const launcherRoot=this.launcher.attachShadow({mode:'open'});launcherRoot.append(this.panelStyles[1]);
  this.toggle=el('button');this.toggle.className='toggle';this.toggle.type='button';this.toggle.setAttribute('aria-haspopup','dialog');launcherRoot.append(this.toggle);this.dialog=el('dialog');root.append(this.dialog);const heading=el('div');heading.className='manager-heading';this.topClose=el('button','X');this.topClose.className='close-top';this.topClose.type='button';this.topClose.onclick=()=>this.dialog.close();this.headingTitle=el('h2');heading.append(this.headingTitle,this.topClose);this.dialog.append(heading);this.panelBody=el('div');this.panelBody.className='panel-scroll';this.dialog.append(this.panelBody);
  const languageLabel=el('label');this.languageText=el('span');this.languageSelect=el('select');for(const [value,label]of [['auto',''],...Object.entries(this.translations).map(([code,locale])=>[code,locale.name])]){const option=el('option',label);option.value=value;this.languageSelect.append(option);}languageLabel.append(this.languageText,this.languageSelect);this.panelBody.append(languageLabel);this.languageSelect.onchange=()=>this.setLanguage(this.languageSelect.value).catch(e=>this.reportError(e));
  this.select=el('select');this.select.style.marginTop='12px';this.panelBody.append(this.select);this.select.onchange=()=>this.activate(this.select.value).catch(e=>this.reportError(e));
  const layoutLabel=el('label');layoutLabel.style.cssText='display:block;margin-top:12px';this.layoutText=el('span');this.layoutSelect=el('select');for(const value of ['merged','split']){const option=el('option');option.value=value;this.layoutSelect.append(option);}layoutLabel.append(this.layoutText,this.layoutSelect);this.panelBody.append(layoutLabel);this.layoutSelect.onchange=()=>this.setSidebarLayout(this.layoutSelect.value).catch(e=>this.reportError(e));
  this.opacitySection=el('details');this.opacitySection.className='opacity-settings';this.opacitySection.open=true;this.opacityTitle=el('summary');this.opacitySection.append(this.opacityTitle);this.opacityNote=el('p');this.opacityNote.className='opacity-note';this.opacitySection.append(this.opacityNote);this.opacityFields=el('div');this.opacityFields.className='opacity-fields';this.opacitySection.append(this.opacityFields);this.opacityReset=el('button');this.opacityReset.type='button';this.opacityReset.onclick=()=>this.resetOpacities().catch(e=>this.reportError(e));this.opacitySection.append(this.opacityReset);this.panelBody.append(this.opacitySection);
  const row=el('div');row.className='row';this.panelBody.append(row);const add=el('button'),original=el('button'),remove=el('button');this.actionButtons=new Map([[add,'import'],[original,'restore'],[remove,'remove']]);row.append(add,original,remove);
  const input=el('input');input.type='file';input.multiple=true;input.setAttribute('webkitdirectory','');this.panelBody.append(input);add.onclick=()=>input.click();input.onchange=async()=>{try{await this.importFolder([...input.files]);}catch(e){this.report('importFailed',{error:e});}finally{input.value='';}};
  original.onclick=()=>this.activate('original').catch(e=>this.reportError(e));remove.onclick=()=>this.deleteSelected().catch(e=>this.reportError(e));this.toggle.onclick=e=>{e.stopPropagation();this.toggleManager();};
  this.notice=el('p');this.notice.className='manager-status';this.notice.setAttribute('role','status');this.notice.setAttribute('aria-live','polite');this.dialog.append(this.notice);this.diagnostics=el('p');this.panelBody.append(this.diagnostics);this.compatibility=el('small');this.panelBody.append(this.compatibility);this.localizePanel();this.report('loading');
  this.managerResize=()=>this.syncManager();this.managerObserver=new ResizeObserver(this.managerResize);window.addEventListener('resize',this.managerResize);
  this.managerKey=e=>{if(!e.repeat&&!e.defaultPrevented&&e.altKey&&e.shiftKey&&!e.ctrlKey&&!e.metaKey&&e.code==='KeyT'){e.preventDefault();this.toggleManager();}};window.addEventListener('keydown',this.managerKey);this.syncManager();
 }
 toggleManager(){if(this.dialog.open)this.dialog.close();else this.dialog.showModal();}
 localizePanel(){if(!this.headingTitle)return;const direction=this.translations[this.language]?.direction??'ltr';this.dialog.dir=direction;this.headingTitle.dir=direction;this.headingTitle.textContent=this.t('title');this.dialog.setAttribute('aria-label',this.t('title'));this.toggle.textContent=this.t('launcher');this.toggle.title=this.t('title')+' (Alt+Shift+T)';this.toggle.setAttribute('aria-label',this.t('launcherLabel'));this.topClose.setAttribute('aria-label',this.t('closeLabel'));this.topClose.title=this.t('close');this.languageText.textContent=this.t('language');this.languageSelect.setAttribute('aria-label',this.t('language'));this.languageSelect.children[0].textContent=this.t('autoLanguage');this.languageSelect.value=this.languagePreference;this.select.setAttribute('aria-label',this.t('choose'));this.layoutText.textContent=this.t('layout');this.layoutSelect.setAttribute('aria-label',this.t('layout'));for(const option of this.layoutSelect.children)option.textContent=this.t(option.value);this.opacityNote.textContent=this.t('opacityNote');this.opacityReset.textContent=this.t('opacityReset');for(const[button,key]of this.actionButtons)button.textContent=this.t(key);this.compatibility.textContent=this.t('compatibility',{version:this.adapter.version});if(this.noticeMessage)this.report(this.noticeMessage.key,this.noticeMessage.values);}
 async setLanguage(preference){if(preference!=='auto'&&!Object.hasOwn(this.translations,preference))throw new Error('Unsupported language');this.languagePreference=preference;this.language=skinLanguage(preference,this.appLanguage(),this.translations);this.localizePanel();this.renderList();this.refresh();if(!this.storageReady){this.report('languageTemporary');return;}this.queue=this.queue.catch(()=>{}).then(()=>this.store.saveLanguage(preference));try{await this.queue;if(this.languagePreference===preference)this.report('languageSaved');}catch(e){this.report('languageFailed',{error:e});}}
 syncManager(){
  const spec=this.adapter.managerDock,rail=spec?document.querySelector(spec.rail):null,anchor=rail?.querySelector(spec.footer)??null,dock=anchor?rail:null,reference=dock?.querySelector(spec.reference)??null;
  // Only our own entry moves. Native footer/profile nodes remain in their original flow.
  if(dock){if(this.launcher.parentElement!==dock||this.launcher.nextElementSibling!==anchor)dock.insertBefore(this.launcher,anchor);}else if(this.launcher.parentElement!==document.body)document.body.append(this.launcher);this.launcher.dataset.docked=String(!!dock);
  if(dock!==this.managerDock||reference!==this.managerReference||anchor!==this.managerAnchor){this.managerObserver.disconnect();this.managerDock=dock;this.managerReference=reference;this.managerAnchor=anchor;if(dock)this.managerObserver.observe(dock);if(reference)this.managerObserver.observe(reference);if(anchor)this.managerObserver.observe(anchor);}
  const width=reference?.getBoundingClientRect().width;this.launcher.style.setProperty('--appearance-native-size',(Number.isFinite(width)&&width>0?Math.min(width,36):36)+'px');
 }
 renderList(){this.select.replaceChildren();const native=el('option',this.t('original'));native.value='original';this.select.append(native);for(const [id,p]of this.packs){const o=el('option',skinDisplayName(p.manifest,this.language,this.translations));o.value=id;this.select.append(o);}this.select.value=this.active;this.layoutSelect.disabled=!this.pack?.manifest.sidebarLayout;this.layoutSelect.value=this.pack?.manifest.sidebarLayout?.mode??'merged';this.renderOpacityControls();}
 opacityValues(id,manifest){const saved=Object.hasOwn(this.opacityPreferences,id)?this.opacityPreferences[id]:{},allowed=new Set(opacityOptions(manifest).map(option=>option.key));return Object.fromEntries(Object.entries(saved??{}).filter(([key,value])=>allowed.has(key)&&typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1));}
 renderOpacityControls(){
  if(!this.opacityFields)return;this.opacityFields.replaceChildren();const id=this.active,options=this.pack?opacityOptions(this.pack.manifest,this.language,this.translations):[];this.opacityTitle.textContent=this.t('opacityTitle',{count:options.length});this.opacityReset.disabled=!options.length;
  if(!options.length){this.opacityFields.append(el('p',this.t('opacityNone')));return;}
  for(const [index,option]of options.entries()){
   const row=el('div');row.className='opacity-field';row.setAttribute('data-opacity-key',option.key);const label=el('label',option.label+' (%)'),range=el('input'),value=el('input');range.type='range';range.min='0';range.max='100';range.step='0.1';value.type='number';value.min='0';value.max='100';value.step='any';value.id='opacity-value-'+index;label.htmlFor=value.id;range.setAttribute('aria-label',option.label);value.setAttribute('aria-label',this.t('percentage',{label:option.label}));range.value=value.value=String(Math.round(option.value*10000)/100);
   const preview=raw=>{if(this.active!==id)return;const percent=Number(raw);if(raw===''||!Number.isFinite(percent)||percent<0||percent>100)throw new Error(this.t('opacityRange'));this.setOpacity(option.key,percent/100);range.value=value.value=String(percent);};
   range.oninput=()=>{value.value=range.value;};range.onchange=()=>{try{if(this.active!==id)return;preview(range.value);this.saveOpacityPreferences().catch(e=>this.reportError(e));}catch(e){this.reportError(e);}};value.onchange=()=>{try{if(this.active!==id)return;preview(value.value);this.saveOpacityPreferences().catch(e=>this.reportError(e));}catch(e){this.reportError(e);const current=opacityOptions(this.pack.manifest).find(v=>v.key===option.key);value.value=String((current?.value??option.value)*100);}};
   row.append(label,range,value);this.opacityFields.append(row);
  }
 }
 setOpacity(key,value){
  if(!this.pack||!this.packs.has(this.active))throw new Error(this.t('chooseSkin'));const id=this.active,base=this.packs.get(id).manifest,values={...this.opacityValues(id,base),[key]:value},manifest=withOpacityOverrides(base,values);if(manifest.sidebarLayout)manifest.sidebarLayout.mode=this.pack.manifest.sidebarLayout.mode;
  this.opacityPreferences[id]=values;this.clear();this.pack={...this.pack,manifest};this.refresh();
 }
 async saveOpacityPreferences(){if(!this.storageReady){this.report('opacityTemporary');return;}const saved=structuredClone(this.opacityPreferences);this.queue=this.queue.catch(()=>{}).then(()=>this.store.saveOpacities(saved));try{await this.queue;this.report('opacitySaved');}catch(e){this.report('opacityFailed',{error:e});}}
 async resetOpacities(){if(!this.pack)return;const id=this.active;delete this.opacityPreferences[id];await this.activate(id,false);await this.saveOpacityPreferences();}
 async setSidebarLayout(mode){if(!['merged','split'].includes(mode)||!this.pack?.manifest.sidebarLayout)throw new Error(this.t('layoutUnavailable'));const id=this.active;this.layoutPreferences[id]=mode;await this.activate(id,false);if(this.storageReady){const saved={...this.layoutPreferences};this.queue=this.queue.catch(()=>{}).then(()=>this.store.saveLayouts(saved));try{await this.queue;this.report('layoutSaved');}catch(e){this.report('layoutFailed',{error:e});}}else this.report('layoutTemporary');}
 async decode(pack){const dimensions={};await Promise.all(Object.entries(pack.assets).map(([path,url])=>new Promise((ok,no)=>{const img=new Image();img.onload=()=>{if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>64e6){no(new Error(this.t('invalidImageSize')));return;}dimensions[path]=[img.naturalWidth,img.naturalHeight];ok();};img.onerror=()=>no(new Error(this.t('decodeFailed',{path})));img.src=url;})));return dimensions;}
 async activate(id,persist=true){
  if(id!=='original'&&!this.packs.has(id))throw new Error(this.t('skinMissing'));const version=++this.generation,pack=id==='original'?null:validatePack(this.packs.get(id));const dimensions=pack?await this.decode(pack):{};if(version!==this.generation)return;if(pack){pack.manifest=withOpacityOverrides(pack.manifest,this.opacityValues(id,pack.manifest));if(pack.manifest.sidebarLayout&&this.layoutPreferences[id])pack.manifest.sidebarLayout.mode=this.layoutPreferences[id];}
  this.clear();this.active=id;this.pack=pack;this.dimensions=dimensions;this.refresh();this.renderList();
  if(persist&&this.storageReady){this.queue=this.queue.catch(()=>{}).then(()=>this.store.select(id));try{await this.queue;if(version===this.generation)this.report('skinSaved');}catch(e){if(version===this.generation)this.report('skinSaveFailed',{error:e});}}
  else if(persist)this.report('skinTemporary');
 }
 tag(node,region){if(!this.oldMarks.has(node))this.oldMarks.set(node,node.getAttribute(MARK));const tokens=new Set((node.getAttribute(MARK)??'').split(' ').filter(Boolean));tokens.add(region);node.setAttribute(MARK,[...tokens].join(' '));}
 clear(){for(const v of this.clips.values())v.remove();this.clips.clear();for(const v of this.mounted.values()){v.ro?.disconnect();v.layer.remove();}this.mounted.clear();for(const [n,old]of this.oldMarks){if(old===null)n.removeAttribute(MARK);else n.setAttribute(MARK,old);n.removeAttribute('data-codex-appearance-static');n.removeAttribute('data-codex-appearance-bg');}this.oldMarks.clear();for(const n of this.transparent)n.removeAttribute('data-codex-appearance-clear');this.transparent.clear();this.style.textContent='';}
 syncTranscriptClips(){
  const rule=this.pack?.manifest.regions.chat,enabled=rule?.enabled&&(rule.background||rule.gradient||rule.style?.surface||this.pack.manifest.scene?.regions.includes('chat')),desired=new Map();
  if(enabled)for(const spec of this.adapter.transcriptClips??[])for(const scope of document.querySelectorAll(`[${MARK}~="chat"] ${spec.scope}`)){
   if(spec.excludeWithin&&scope.closest(spec.excludeWithin))continue;
   const r=scope.getBoundingClientRect();if(r.width<=0||r.height<=0)continue;
   const visible=n=>{const b=n.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(n).visibility!=='hidden';};
   const composerRoot=spec.composerScope?scope.closest(spec.composerScope):scope,control=[...(composerRoot?.querySelectorAll(spec.composer)??[])].find(visible)??null,stack=control?.closest('[data-codex-composer-reference-drop-target]');const composer=stack&&visible(stack)?stack:control,fade=spec.topFade?[...(scope.closest(spec.topFade.scope)?.querySelectorAll(spec.topFade.selector)??[])].find(visible)??null:null;if(!composer&&!fade)continue;
   for(const content of scope.querySelectorAll(spec.content))if(visible(content)&&(!composer||!content.contains(composer))&&(!fade||!content.contains(fade)))desired.set(content,{scope,composer,fade,fadeMode:spec.topFade?.measure??'element',globalScroll:spec.globalScroll===true});
  }
  for(const [content,v]of this.clips){const next=desired.get(content);if(!next||next.scope!==v.scope||next.composer!==v.composer||next.fade!==v.fade||next.fadeMode!==v.fadeMode||next.globalScroll!==v.globalScroll){v.remove();this.clips.delete(content);}}
  for(const [content,{scope,composer,fade,fadeMode,globalScroll}]of desired){
   if(this.clips.has(content)){this.clips.get(content).update();continue;}
   const marker='data-codex-appearance-clip',fadeMarker='data-codex-appearance-fade',property='--codex-appearance-clip-bottom',startProperty='--codex-appearance-fade-start',endProperty='--codex-appearance-fade-end';
   const oldMarks=new Map([marker,fadeMarker].map(k=>[k,content.getAttribute(k)])),oldStyles=new Map([property,startProperty,endProperty].map(k=>[k,[content.style.getPropertyValue(k),content.style.getPropertyPriority(k)]]));
   const restoreMark=k=>{const value=oldMarks.get(k);if(value===null)content.removeAttribute(k);else content.setAttribute(k,value);},restoreStyle=k=>{const[value,priority]=oldStyles.get(k);if(value)content.style.setProperty(k,value,priority);else content.style.removeProperty(k);};
   const restore=()=>{for(const k of oldMarks.keys())restoreMark(k);for(const k of oldStyles.keys())restoreStyle(k);};
   const update=()=>{const box=content.getBoundingClientRect(),inset=composer?transcriptClipBottom(box,scope.getBoundingClientRect(),composer.getBoundingClientRect()):null;if(inset===null){restoreMark(marker);restoreStyle(property);}else{content.style.setProperty(property,inset+'px');content.setAttribute(marker,'');}let fadeBox=fade?.getBoundingClientRect();if(fadeBox&&fadeMode==='after')fadeBox={top:fadeBox.bottom,bottom:fadeBox.bottom+Number.parseFloat(getComputedStyle(fade,'::after').height)};const edge=fadeBox?fadeBox.bottom-box.top:0,stops=fadeMode==='edge'?(edge>0?{start:edge,end:edge}:null):fadeBox?transcriptFadeStops(box,fadeBox):null;if(stops){content.style.setProperty(startProperty,stops.start+'px');content.style.setProperty(endProperty,stops.end+'px');content.setAttribute(fadeMarker,'');}else{restoreMark(fadeMarker);restoreStyle(startProperty);restoreStyle(endProperty);}};
   const ro=new ResizeObserver(update);for(const n of [scope,content,composer,fade])if(n)ro.observe(n);const scrollTarget=globalScroll?window:scope;scrollTarget.addEventListener('scroll',update,{passive:true,capture:true});window.addEventListener('resize',update);
   this.clips.set(content,{scope,composer,fade,fadeMode,globalScroll,update,remove:()=>{ro.disconnect();scrollTarget.removeEventListener('scroll',update,true);window.removeEventListener('resize',update);restore();}});update();
  }
 }
 refresh(){
  this.syncLanguageWatch();if(this.languagePreference==='auto'){const language=skinLanguage('auto',this.appLanguage(),this.translations);if(language!==this.language){this.language=language;this.localizePanel();this.renderList();}}
  this.syncManager();
  const hover=this.pack?.manifest.hover,dialogRule=this.pack?.manifest.regions.dialogs;
  const popupCss=dialogRule?.enabled?`dialog{${declarations(dialogRule.style)}}`+(dialogRule.style?.surface?`dialog option{background-color:${rgba(dialogRule.style.surface,dialogRule.style.surfaceOpacity??1)}!important}button,select,input[type=number]{${declarations({surface:dialogRule.style.surface,surfaceOpacity:dialogRule.style.surfaceOpacity,border:dialogRule.style.border,borderOpacity:dialogRule.style.borderOpacity,text:dialogRule.style.text})}}`:'')+(dialogRule.style?.text?`:host,p,small{color:${dialogRule.style.text}!important}`:''):'';
  const panelCss=this.panelBaseCss+popupCss+(hover?`input[type=range]{accent-color:${hover.surface}}button:not(:disabled):hover,select:not(:disabled):hover{${declarations(hover)}}`:'');for(const s of this.panelStyles??[])if(s.textContent!==panelCss)s.textContent=panelCss;
  if(!this.pack||!document.querySelector(this.adapter.gate)){this.clear();this.counts={};this.diagnostics.textContent=this.t(this.pack?'shellUnknown':'originalRestored');return;}
  // Cached native nodes can return after an older engine stopped tracking them.
  for(const n of document.querySelectorAll(`[${MARK}]`))if(!this.oldMarks.has(n)&&!n.closest(`[${OWN}]`)){const tokens=(n.getAttribute(MARK)??'').split(' ').filter(Boolean),owned=t=>Object.hasOwn(this.adapter.regions,t);if(tokens.some(owned))this.oldMarks.set(n,tokens.filter(t=>!owned(t)).join(' ')||null);}
  for(const [n,v]of this.mounted)if(!n.isConnected||v.layer.parentElement!==n){v.ro?.disconnect();v.layer.remove();this.mounted.delete(n);n.removeAttribute('data-codex-appearance-bg');n.removeAttribute('data-codex-appearance-static');}
  const desired=new Map(),visualNodes=new Set(),clearNodes=new Set();
  const css=['[data-codex-appearance-bg]{isolation:isolate!important;background-color:transparent!important;background-image:none!important}[data-codex-appearance-static]{position:relative!important}[data-codex-appearance-clear]{background-color:transparent!important;background-image:none!important}[data-codex-appearance-clip]{clip-path:inset(0 0 var(--codex-appearance-clip-bottom,0px) 0)!important}[data-codex-appearance-fade]{mask-image:linear-gradient(to bottom,transparent var(--codex-appearance-fade-start,0px),#000 var(--codex-appearance-fade-end,0px))!important;mask-repeat:no-repeat!important;mask-size:100% 100%!important}'];this.counts={};
  for(const [name,rule]of Object.entries(this.pack.manifest.regions)){
    if(!rule.enabled)continue;const shared=this.pack.manifest.scene?.regions.includes(name),background=shared?this.pack.manifest.scene.background:rule.background,visual=background||rule.gradient||rule.ornament;let nodes=[...new Set((this.adapter.regions[name]??[]).flatMap(s=>[...document.querySelectorAll(s)]))].filter(n=>!n.closest(`[${OWN}]`)&&(name!=='buttons'||!n.matches?.(HIT_ONLY_BUTTONS)));
    if(name==='dialogs')nodes=[...new Set(nodes.map(n=>n.matches?.('[data-slot="popover-content"]')?n.querySelector('[class~="group/summary-panel"]')??n:n))];
    if(visual||this.adapter.outermostRegions?.includes(name))nodes=nodes.filter(n=>!nodes.some(parent=>parent!==n&&parent.contains(n)));this.counts[name]=nodes.length;
    for(const n of nodes){if(!desired.has(n))desired.set(n,new Set());desired.get(n).add(name);this.tag(n,name);if(visual){visualNodes.add(n);if(!this.mounted.has(n)){if(background)this.mountBackground(n,name,background,shared);else this.mountDecoration(n,name,rule);}else this.mounted.get(n)?.update();}}
   const selector=`[${MARK}~="${name}"]`,style=rule.gradient?Object.fromEntries(Object.entries(rule.style??{}).filter(([key])=>!['surface','surfaceOpacity'].includes(key))):rule.style;if(name==='scrollbars'){const s=rule.style??{};if(s.text&&s.surface)css.push(`${selector}{scrollbar-color:${s.text} ${s.surface}!important}`);}else css.push(`${selector}{${declarations(style)}}`);
    if(name==='dialogs'&&style?.surface)css.push(`${selector}[class~="group/summary-panel"]{--color-surface-elevated-secondary:${rgba(style.surface,style.surfaceOpacity??1)}!important}`);
    if(style?.text){
     if(NEUTRAL_TEXT_REGIONS.has(name))css.push(`${selector}{${['--color-text','--color-text-secondary','--color-text-tertiary','--color-codex-description','--button-text-color','--button-text-color-hover'].map(key=>key+':'+style.text+'!important').join(';')}}`);
     if(name==='userMessages')css.push(`${selector} [data-markdown-text-tone="user-message"]{color:${style.text}!important}`);
     if(name==='composer')css.push(`${selector} .ProseMirror{color:${style.text}!important;caret-color:${style.text}!important}${selector} .ProseMirror [data-placeholder]::before{color:${rgba(style.text,.6)}!important}`);
    }
   if(name==='menus'&&this.adapter.profileAvatarSlot)css.push(`${selector} ${this.adapter.profileAvatarSlot}{--icon-leading-size:calc(var(--spacing,4px)*5)!important}`);
   const backplate=this.adapter.gradientBackplates?.[name];if(backplate&&rule.gradient)css.push(`${backplate}{background-image:${decorationCss({gradient:rule.gradient,style:rule.style}).backgroundImage}!important;background-size:max(0px,calc(100% - var(--app-shell-navigation-rail-width,52px))) 100%!important;background-position:right top!important;background-repeat:no-repeat!important}${backplate}:dir(rtl){background-position:left top!important}`);
   if(rule.style?.surface&&this.adapter.clearSurfaceImages?.includes(name))css.push(`${selector}{background-image:none!important}`);
   if(visual||rule.style?.surface)for(const pseudo of this.adapter.transparentPseudoSurfaces?.[name]??[])if(['::before','::after'].includes(pseudo))css.push(`${selector}${pseudo}{background-color:transparent!important;background-image:none!important}`);
   if(visual||rule.style?.surface)for(const target of this.adapter.transparentPseudoTargets?.[name]??[])css.push(`${selector} ${target}{background-color:transparent!important;background-image:none!important}`);
   for(const component of this.adapter.nativeComponents?.[name]??[]){const variables=[],color=rule.style?.surface??rule.gradient?.stops?.[0]?.color,alpha=rule.gradient?.opacity??rule.style?.surfaceOpacity??1;if(color)for(const property of component.surfaceVars??[])variables.push(`${property}:${rule.gradient&&component.transparentForGradient?'transparent':rgba(color,alpha)}!important`);if(hover)for(const property of component.hoverVars??[])variables.push(`${property}:${rgba(hover.surface,hover.surfaceOpacity)}!important`);if(variables.length)css.push(`${selector} ${component.selector}{${variables.join(';')}}`);}
   if(visual||rule.style?.surface)for(const parent of nodes)for(const s of this.adapter.transparentSurfaces[name]??[])for(const n of parent.querySelectorAll(s)){n.setAttribute('data-codex-appearance-clear','');clearNodes.add(n);}
  }
  for(const [n,old]of this.oldMarks){const names=desired.get(n);if(!names){if(old===null)n.removeAttribute(MARK);else n.setAttribute(MARK,old);n.removeAttribute('data-codex-appearance-static');n.removeAttribute('data-codex-appearance-bg');this.oldMarks.delete(n);}else{const tokens=new Set((old??'').split(' ').filter(Boolean));for(const name of names)tokens.add(name);n.setAttribute(MARK,[...tokens].join(' '));if(!visualNodes.has(n)){n.removeAttribute('data-codex-appearance-static');n.removeAttribute('data-codex-appearance-bg');}}}
  for(const [n,v]of this.mounted)if(!visualNodes.has(n)){v.ro?.disconnect();v.layer.remove();this.mounted.delete(n);n.removeAttribute('data-codex-appearance-static');n.removeAttribute('data-codex-appearance-bg');}
  for(const n of this.transparent)if(!clearNodes.has(n))n.removeAttribute('data-codex-appearance-clear');this.transparent=clearNodes;
   if(hover){for(const selector of this.adapter.hoverTargets??[])css.push(`${selector}:hover:not(:disabled):not([aria-disabled="true"]):not(${HIT_ONLY_BUTTONS}):not(:has(${this.adapter.hoverInteractive}:hover)){${declarations(hover)}}`);for(const selector of this.adapter.hoverScrollbars??[])css.push(`${selector}:hover{${declarations(hover)}}`);for(const selector of this.adapter.hoverPseudoTargets??[])css.push(`${selector}{${declarations(hover)}}`);for(const selector of this.adapter.activeTargets??[])css.push(`${selector}{${declarations(hover)}}`);}
  this.syncTranscriptClips();const text=css.join('\n');if(this.style.textContent!==text)this.style.textContent=text;this.diagnostics.textContent=this.t('diagnostics')+Object.entries(this.counts).map(([k,v])=>`${regionLabel(k,this.language,this.translations)} ${v}`).join(' · ');
 }
 mountDecoration(node,name,rule){
  const layer=el('div');layer.setAttribute(OWN,`decoration-${name}`);layer.setAttribute('aria-hidden','true');layer.style.cssText='position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1;border-radius:inherit;-webkit-app-region:initial!important';Object.assign(layer.style,decorationCss({gradient:rule.gradient,style:rule.style}));
  if(rule.ornament){const ornament=el('div');ornament.setAttribute('data-codex-appearance-part','ornament');ornament.style.cssText='position:absolute;inset:0;pointer-events:none';ornament.style.opacity=String(rule.ornament.opacity);Object.assign(ornament.style,decorationCss({ornament:{...rule.ornament,opacity:1}},this.pack?.assets??{}));layer.append(ornament);}
  if(getComputedStyle(node).position==='static')node.setAttribute('data-codex-appearance-static','');node.setAttribute('data-codex-appearance-bg','');node.prepend(layer);
  let ro=null,update=()=>{};
  if(name==='titlebar'&&this.adapter.titlebarGap){
   const spec=this.adapter.titlebarGap;let watched=new Set();
   update=()=>{const scope=node.closest(spec.scope)??document,refs=new Set((spec.references??[]).flatMap(s=>[...scope.querySelectorAll(s)]).filter(n=>n!==node));for(const n of watched)if(!refs.has(n))ro.unobserve(n);for(const n of refs)if(!watched.has(n))ro.observe(n);watched=refs;const tops=[...refs].filter(n=>getComputedStyle(n).visibility!=='hidden').map(n=>n.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0).map(r=>r.top);const gap=topbarGap(node.getBoundingClientRect().bottom,tops,spec.maxGap??32);layer.style.bottom=(-gap)+'px';layer.dataset.gap=String(gap);};
   ro=new ResizeObserver(update);ro.observe(node);
  }
  this.mounted.set(node,{layer,ro,update});update();
 }
  mountBackground(node,name,bg,shared=false){
  const layer=el('div');layer.setAttribute(OWN,`background-${name}`);layer.setAttribute('aria-hidden','true');layer.style.cssText='position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1;border-radius:inherit;-webkit-app-region:initial!important';
  const layout=name==='sidebar'?this.pack.manifest.sidebarLayout:null;
  const chatLayout=name==='chat'?this.pack.manifest.chatLayout:null;
  const makePart=(background,label)=>{
   const pane=el('div');pane.setAttribute('data-codex-appearance-part',label);pane.style.cssText='position:absolute;left:0;right:0;overflow:hidden;pointer-events:none';const url=this.pack.assets[background.asset];
   let fill=null;if(background.blurFill){fill=el('img');fill.alt='';fill.src=url;fill.style.cssText='position:absolute;width:100%;height:100%;object-fit:cover;filter:blur(14px);transform:scale(1.06);pointer-events:none';pane.append(fill);}
   const art=el('img');art.setAttribute('data-codex-appearance-image','foreground');art.alt='';art.src=url;art.style.cssText='position:absolute;max-width:none;max-height:none;pointer-events:none';pane.append(art);
   const mask=el('div');mask.style.cssText=`position:absolute;inset:0;background:rgba(0,0,0,${background.blackOverlay});pointer-events:none`;pane.append(mask);layer.append(pane);
    let cachedKey,cachedFit;
    return {pane,art,fill,place:(top,height,override)=>{pane.style.top=top+'px';pane.style.height=height+'px';pane.style.display=height>0?'block':'none';if(height<=0)return;const [sw,sh]=this.dimensions[background.asset],key=[node.clientWidth,height,sw,sh].join(':');if(!override&&cachedKey!==key){cachedFit=fitImage(node.clientWidth,height,sw,sh,background.subject,background.maxScale??1,background.fit,background.cropTop??0);cachedKey=key;}const f=override??cachedFit;Object.assign(art.style,{width:f.width+'px',height:f.height+'px',left:f.x+'px',top:f.y+'px'});}};
  };
  const body=makePart(bg,'body'),splitBody=layout?.body?makePart(layout.body,'split-body'):null,header=layout?makePart(layout.header,'header'):null;
  let extensionFill=null,extensionLeft=null;
  if(chatLayout?.leftExtension){
   extensionFill=el('img');extensionFill.alt='';extensionFill.src=this.pack.assets[chatLayout.leftExtension];extensionFill.setAttribute('data-codex-appearance-part','extension-fill');extensionFill.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:right center;pointer-events:none;display:none';body.pane.insertBefore(extensionFill,body.art);
   extensionLeft=el('div');extensionLeft.setAttribute('data-codex-appearance-part','left-extension');extensionLeft.style.cssText='position:absolute;left:0;overflow:hidden;pointer-events:none;display:none';const img=el('img');img.alt='';img.src=this.pack.assets[chatLayout.leftExtension];img.style.cssText='width:100%;height:100%;object-fit:cover;object-position:right center;pointer-events:none';extensionLeft.append(img);body.pane.insertBefore(extensionLeft,body.art);
  }
  const divider=layout?el('div'):null;
  if(divider){divider.setAttribute('data-codex-appearance-part','divider');divider.style.cssText='position:absolute;pointer-events:none';const d=layout.divider??{color:'#8791a3',opacity:.4,width:1,inset:12};Object.assign(divider.style,{left:d.inset+'px',right:d.inset+'px',height:d.width+'px',backgroundColor:d.color,opacity:String(d.opacity)});layer.append(divider);}
  if(getComputedStyle(node).position==='static')node.setAttribute('data-codex-appearance-static','');node.setAttribute('data-codex-appearance-bg','');
  let watchedHeader=null,watchedSidebar=null;
  const update=()=>{
   if(!node.clientWidth||!node.clientHeight)return;
   const nativeHeader=layout&&this.adapter.sidebarHeaderSelector?[...node.querySelectorAll(this.adapter.sidebarHeaderSelector)].find(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility!=='hidden';})??null:null;
   if(nativeHeader!==watchedHeader){if(watchedHeader)ro.unobserve(watchedHeader);watchedHeader=nativeHeader;if(watchedHeader)ro.observe(watchedHeader);}
   const nativeHeight=nativeHeader?nativeHeader.getBoundingClientRect().bottom-node.getBoundingClientRect().top:NaN;
   const sections=sidebarSections(node.clientHeight,nativeHeight,layout?.mode??'merged');
   const separateBody=sections.split&&!!splitBody;let sceneFit,extended=false;
   if(chatLayout&&this.adapter.chatLayoutState){
    const spec=this.adapter.chatLayoutState,frame=node.closest(spec.frame),rail=frame?.querySelector(spec.rail),sidebar=frame?.querySelector(spec.sidebar);
    if(sidebar!==watchedSidebar){if(watchedSidebar)ro.unobserve(watchedSidebar);watchedSidebar=sidebar;if(watchedSidebar)ro.observe(watchedSidebar);}
    if(sidebar?.clientWidth>0)this.sceneSidebarWidth=sidebar.clientWidth;
    const flag=key=>frame?.getAttribute(key)==='true'?true:frame?.getAttribute(key)==='false'?false:undefined;
    const leftOpen=spec.pageSidebar&&flag(spec.pageSidebar)===false?false:flag(spec.leftOpen),rightOpen=flag(spec.rightOpen);
    if(frame&&rail&&leftOpen!==undefined){
     const pane=body.pane.getBoundingClientRect(),referenceLeft=rail.getBoundingClientRect().right+(flag(spec.responsive)===true?0:this.sceneSidebarWidth),[sw,sh]=this.dimensions[bg.asset];
     if(pane.right>pane.left){const nav=rail.getBoundingClientRect(),rightRail=nav.left>=pane.right-1;sceneFit=chatLayout.mode==='panorama'?panoramaFit({paneLeft:pane.left,paneRight:pane.right,railRight:nav.right,sceneLeft:rightRail?pane.left:nav.right,sceneRight:rightRail?nav.left:pane.right,height:node.clientHeight,sourceWidth:sw,sourceHeight:sh,subject:bg.subject,maxScale:bg.maxScale??1}):chatSceneFit({paneLeft:pane.left,paneRight:pane.right,referenceLeft,height:node.clientHeight,sourceWidth:sw,sourceHeight:sh,subject:bg.subject,maxScale:bg.maxScale??1,fit:bg.fit,cropTop:bg.cropTop??0});}
     extended=sidebarsCollapsed(leftOpen,rightOpen);
    }
   }
    let sharedHeight=sections.bodyHeight;
    if(shared){
     const rect=node.getBoundingClientRect(),[sw,sh]=this.dimensions[bg.asset];
     const shown=n=>n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0&&getComputedStyle(n).visibility!=='hidden'&&!n.closest('[inert],[aria-hidden="true"]');
     const mainScope=this.pack.manifest.scene.scope==='main',rail=mainScope?[...document.querySelectorAll(this.adapter.chatLayoutState?.rail??'[data-app-navigation-rail]')].find(shown)?.getBoundingClientRect():null,main=mainScope?[...document.querySelectorAll('[data-app-shell-main-surface]')].find(shown)?.getBoundingClientRect():null;
     const sceneLeft=rail?(rail.left<innerWidth/2?rail.right:0):0,sceneRight=rail&&rail.left>=innerWidth/2?rail.left:innerWidth,sceneTop=main?.top??0;
     this.sceneCache??=new Map();const placement=scenePlacement(this.pack.manifest.scene,[innerWidth,innerHeight],devicePixelRatio,[sceneLeft,sceneTop,sceneRight-sceneLeft,innerHeight-sceneTop],[sw,sh],this.sceneCache);
     sceneFit={...placement,x:placement.x-rect.left,y:placement.y-rect.top};
     layer.dataset.sceneCovered=String(sceneFit.covered);layer.dataset.sharedScene='true';
     if(name==='titlebar'&&this.adapter.titlebarGap){const spec=this.adapter.titlebarGap,scope=node.closest(spec.scope)??document,refs=spec.references.flatMap(s=>[...scope.querySelectorAll(s)]).filter(shown).map(n=>n.getBoundingClientRect().top);const gap=topbarGap(rect.bottom,refs,spec.maxGap);sharedHeight+=gap;layer.style.bottom=-gap+'px';}
    }
    body.place(sections.bodyTop,separateBody?0:sharedHeight,sceneFit);splitBody?.place(sections.bodyTop,separateBody?sections.bodyHeight:0);header?.place(0,sections.headerHeight);
   if(chatLayout?.mode==='panorama')layer.dataset.chatMode='panorama';
   if(extensionFill){extensionFill.style.display=extended?'block':'none';extensionLeft.style.display=extended&&sceneFit?.x>0?'block':'none';if(sceneFit)Object.assign(extensionLeft.style,{top:sceneFit.y+'px',height:sceneFit.height+'px',width:Math.max(0,sceneFit.x)+'px'});if(body.fill)body.fill.style.display=extended?'none':'';layer.dataset.chatMode=extended?'left-extended':'regular';}
   layer.dataset.bodyAsset=separateBody?layout.body.asset:bg.asset;
   if(divider){divider.style.top=sections.bodyTop+'px';divider.style.display=sections.split?'block':'none';}
   layer.dataset.layout=sections.split?'split':'merged';
   if(layout){this.counts.sidebarHeader=nativeHeader?1:0;layer.dataset.layoutFallback=String(layout.mode==='split'&&!sections.split);}
  };
   node.prepend(layer);const ro=new ResizeObserver(update),disconnect=ro.disconnect.bind(ro);ro.observe(node);ro.disconnect=()=>{disconnect();if(shared)window.removeEventListener('resize',update);};if(shared)window.addEventListener('resize',update);this.mounted.set(node,{layer,ro,update});update();
 }
 async importFolder(files){
  if(!files.length||files.length>100)throw new Error(this.t('folderCount'));if(files.reduce((s,f)=>s+f.size,0)>48*1024*1024)throw new Error(this.t('folderSize'));if(new Set(files.map(f=>f.webkitRelativePath.split('/')[0])).size!==1)throw new Error(this.t('oneFolder'));
  const entries=new Map();for(const f of files){const path=f.webkitRelativePath.split('/').slice(1).join('/');if(!path||path.split('/').some(p=>!p||p==='..'||p==='.'))throw new Error(this.t('invalidPath'));if(entries.has(path))throw new Error(this.t('duplicatePath'));entries.set(path,f);}
  const mf=entries.get('manifest.json');if(!mf||mf.size>128*1024)throw new Error(this.t('manifestMissing'));const manifest=validateManifest(JSON.parse(await mf.text()));if(this.packs.has(manifest.id))throw new Error(this.t('idExists'));
  const assets={};for(const path of requiredAssets(manifest)){const f=entries.get(path);if(!f)throw new Error(this.t('missingAsset',{path}));const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'}[path.split('.').pop().toLowerCase()];assets[path]=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(`data:${mime};base64,${String(r.result).split(',')[1]}`);r.onerror=()=>no(r.error);r.readAsDataURL(f);});}
  const pack=validatePack({manifest,assets});await this.decode(pack);if(!this.storageReady)throw new Error(this.t('storageImport'));await this.store.put(pack);this.packs.set(manifest.id,pack);this.renderList();this.report('imported',{name:skinDisplayName(manifest,this.language,this.translations)});
 }
 async deleteSelected(){const id=this.select.value;if(id==='original'||id===this.builtin)throw new Error(this.t('cannotDeleteDefault'));if(!this.storageReady)throw new Error(this.t('storageShort'));if(this.active===id)await this.activate('original');await this.store.remove(id);this.packs.delete(id);delete this.opacityPreferences[id];delete this.layoutPreferences[id];this.renderList();const opacity=structuredClone(this.opacityPreferences),layouts={...this.layoutPreferences};this.queue=this.queue.catch(()=>{}).then(async()=>{await this.store.saveOpacities(opacity);await this.store.saveLayouts(layouts);});try{await this.queue;this.report('deleted');}catch(e){this.report('deletePreferencesFailed',{error:e});}}
 destroy(){++this.generation;this.observer?.disconnect();this.languageObserver?.disconnect();this.managerObserver?.disconnect();window.removeEventListener('resize',this.managerResize);window.removeEventListener('keydown',this.managerKey);if(this.scheduled)cancelAnimationFrame(this.scheduled);this.clear();this.style.remove();this.dialog?.close();this.host.remove();this.launcher?.remove();this.store.db?.close();delete window[KEY];}
}
export async function boot(){if(window[KEY])return window[KEY];if(window.top!==window)return;const marker={starting:true};window[KEY]=marker;let app;try{const [adapter,builtin,translations]=await Promise.all(['adapter.json','builtin.json','locales.json'].map(async path=>{const r=await fetch(new URL(path,BASE));if(!r.ok)throw new Error(`无法加载 ${path}: ${r.status}`);return r.json();}));app=new Appearance(adapter,validatePack(builtin),validateTranslations(translations));window[KEY]=app;await app.start();return app;}catch(e){if(app)app.destroy();else if(window[KEY]===marker)delete window[KEY];console.error('[codex-appearance]',e);throw e;}}
if(typeof window!=='undefined'&&typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>boot().catch(()=>{}),{once:true});else boot().catch(()=>{});}
