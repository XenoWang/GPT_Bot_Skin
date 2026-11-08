// Loaded only by Creator through the verified native bridge; not in Usage payloads.
// Dependencies are passed explicitly so the same behavior can be exercised offline.
export function installAuthoring(app,validatePack){
 if(!app?.features?.sharedScene)throw new Error('Update the managed Skin runtime before previewing');
 if(app.creator)return app.creator;
 const make=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 let saved=null,section=null,hidden=[],generation=0;
 const originalActivate=app.activate.bind(app);
 const api={revision:null,stage:null,choice:null,receipt:null,
  async preview(input,revision,stage,locale){
   if(!/^[a-f0-9]{64}$/.test(revision)||!['background','complete'].includes(stage)||!locale||!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/.test(locale.locale)||!['ltr','rtl'].includes(locale.direction)||!['preview.notice','preview.restore','palette.title','palette.confirm','palette.recorded'].every(k=>typeof locale.messages?.[k]==='string'))throw new Error('Invalid preview request');
   const language=locale.locale,messages=locale.messages;
   const token=++generation,pack=validatePack(input),dimensions=await app.decode(pack);if(token!==generation)throw new Error('Preview superseded');
   if(app.packs.has(pack.manifest.id)||pack.manifest.id==='original')throw new Error('Preview must not replace an installed Skin');
   if(!saved){saved={pack:app.pack,active:app.active,dimensions:app.dimensions,language:app.language,languagePreference:app.languagePreference};hidden=[...app.panelBody.children].map(n=>[n,n.hidden]);for(const [n]of hidden)n.hidden=true;}
   try{app.clear();app.pack=pack;app.active=pack.manifest.id;app.dimensions=dimensions;app.languagePreference=language;app.language=language;app.localizePanel();app.refresh();}
    catch(e){api.restore();throw e;}
   api.revision=revision;api.stage=stage;api.choice=null;api.messages=messages;
   api.receipt={revision,stage,applied:true,counts:{...app.counts},uncoveredScene:[...app.mounted.values()].some(v=>v.layer.dataset.sceneCovered==='false')};
   section?.remove();section=make('section');section.dir=locale.direction;section.append(make('p',messages['preview.notice']));
   const restore=make('button',messages['preview.restore']);restore.onclick=()=>api.restore();section.append(restore);app.panelBody.append(section);return api.receipt;
  },
  palette(colors,revision){
   if(!saved||api.revision!==revision||!Array.isArray(colors)||colors.length<4||colors.length>5||new Set(colors).size!==colors.length||colors.some(c=>!/^#[\da-f]{6}$/i.test(c)))throw new Error('Invalid palette or stale preview');
   section.querySelector('[data-palette]')?.remove();const field=make('fieldset');field.setAttribute('data-palette','');field.append(make('legend',api.messages['palette.title']));
   const boxes=colors.map(color=>{const label=make('label'),box=make('input'),swatch=make('span');box.type='checkbox';box.value=color;swatch.textContent=color;swatch.style.cssText='display:inline-block;margin:8px;padding:6px;border-left:18px solid '+color;label.append(box,swatch);field.append(label);return box;});
   const submit=make('button',api.messages['palette.confirm']);submit.onclick=()=>{const selected=boxes.filter(b=>b.checked).map(b=>b.value);if(!selected.length)return;api.choice={revision,colors:selected};submit.textContent=api.messages['palette.recorded'];};field.append(submit);section.append(field);if(!app.dialog.open)app.dialog.showModal();return {shown:true,revision};
  },
  restore(){
   ++generation;api.revision=null;api.stage=null;api.choice=null;api.receipt=null;section?.remove();section=null;
   if(saved){app.clear();Object.assign(app,saved);saved=null;for(const [n,value]of hidden)n.hidden=value;hidden=[];app.localizePanel();app.refresh();app.renderList();}
   return {restored:true};
  }
 };
 app.activate=async(...args)=>{api.restore();return originalActivate(...args);};
 app.creator=api;return api;
}
