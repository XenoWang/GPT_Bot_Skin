// Serialized into the verified renderer. Reads geometry/styles only, never text or values.
export function auditControlContrast(){
 const minimum={text:4.5,icon:3},app=window.__codexAppearanceV1;
 if(!app?.creator?.revision||app.creator.stage!=='complete')throw new Error('Preview the complete Skin before auditing contrast');
 if([...document.querySelectorAll('[data-settings-panel-slug="passwords"]')].some(n=>n.getBoundingClientRect().width>0&&!n.closest('[inert],[aria-hidden="true"]')&&n.getAttribute('aria-current')==='page'))throw new Error('Contrast inspection is unavailable on protected settings pages');
 const rgb=value=>{const m=/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(value??'');if(m)return [...m.slice(1,4).map(Number),m[4]===undefined?1:Number(m[4])];const s=/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(value??'');return s?[...s.slice(1,4).map(x=>Number(x)*255),s[4]===undefined?1:Number(s[4])]:null;};
 const neutral=c=>Math.max(...c.slice(0,3))-Math.min(...c.slice(0,3))<=12;
 const luminance=c=>c.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 const parent=n=>n.parentElement??n.getRootNode?.()?.host??null;
 const roots=new Set([...document.querySelectorAll('[data-codex-appearance], [role="dialog"], [role="menu"], .suggestionMenu-EeXWU_')]);
 if(app.dialog?.open)roots.add(app.dialog);
 const violations=[],skipped={imageOrUnknown:0,semantic:0,disabledOrHidden:0};let checkedText=0,checkedIcons=0,visited=0,truncated=false,eligibleRoots=0;
 const seen=new Set(),nodes=[];
 for(const root of roots){
  const names=(root.getAttribute('data-codex-appearance')??'').split(' '),hasPaint=names.some(name=>app.pack?.manifest.regions[name]?.style?.text);
  if(!hasPaint&&!root.matches('[role="dialog"],[role="menu"],.suggestionMenu-EeXWU_')&&root!==app.dialog)continue;
  eligibleRoots++;
  for(const n of [root,...root.querySelectorAll('div,span,p,label,button,input,textarea,select,svg')])if(!seen.has(n)){seen.add(n);nodes.push(n);}
 }
 function background(node){
  let out=[0,0,0],alpha=0;
  for(let n=node;n;n=parent(n)){
   const s=getComputedStyle(n),c=rgb(s.backgroundColor);
   if(!c)return null;
   // A CSS image or owned scene cannot be inferred from a solid color token.
   if(s.backgroundImage&&s.backgroundImage!=='none'||n.hasAttribute('data-codex-appearance-bg'))return null;
   for(let i=0;i<3;i++)out[i]+=c[i]*c[3]*(1-alpha);
   alpha+=c[3]*(1-alpha);if(alpha>=.999)return out;
  }
  return null;
 }
 function visible(n){
  // aria-hidden is accessibility metadata; visible decorative icons still need contrast.
  const r=n.getBoundingClientRect();if(r.width<=0||r.height<=0||r.bottom<=0||r.right<=0||r.top>=innerHeight||r.left>=innerWidth||n.closest('[inert],[disabled],[aria-disabled="true"]'))return false;
  for(let p=n;p;p=parent(p)){const s=getComputedStyle(p);if(s.visibility==='hidden'||s.display==='none'||Number(s.opacity)<.99)return false;}
  return true;
 }
 function hasText(n){
  if(n.matches('input,textarea,select,[contenteditable="true"]'))return true;
  for(const child of n.childNodes??[])if(child.nodeType===3){const range=document.createRange();range.selectNodeContents(child);const r=range.getBoundingClientRect();if(r.width>0&&r.height>0)return true;}
  return false;
 }
 function check(n,kind,color){
  const fg=rgb(color);if(!fg){skipped.imageOrUnknown++;return;}if(fg[3]===0)return;
  if(!neutral(fg)){skipped.semantic++;return;}
  const bg=background(n);if(!bg){skipped.imageOrUnknown++;return;}
  const ink=fg.slice(0,3).map((x,i)=>x*fg[3]+bg[i]*(1-fg[3])),value=ratio(ink,bg);
  if(kind==='icon')checkedIcons++;else checkedText++;
  if(value+.01<minimum[kind]){const r=n.getBoundingClientRect();violations.push({kind,contrast:Math.round(value*100)/100,minimum:minimum[kind],foreground:fg,background:bg.map(Math.round),rect:[r.x,r.y,r.width,r.height].map(Math.round)});}
 }
 for(const n of nodes){
  if(++visited>6000){truncated=true;break;}
  if(!visible(n)){skipped.disabledOrHidden++;continue;}
  if(n.closest('pre,code,[data-code-block]')){skipped.semantic++;continue;}
  if(n.localName==='svg'){
   if(n.hasAttribute('data-icon-p3')){skipped.semantic++;continue;}
   const shapes=[...n.querySelectorAll('path,line,polyline,polygon,circle,rect')],paints=shapes.length?shapes:[n];
   for(const p of paints){const s=getComputedStyle(p),color=s.stroke&&s.stroke!=='none'?s.stroke:s.fill;if(rgb(color)?.[3]>0){check(n,'icon',color);break;}}
  }else if(hasText(n))check(n,'text',getComputedStyle(n).color);
 }
 return {revision:app.creator.revision,runtimeRevision:window.__codexAppearanceRevision??null,minimum,checkedText,checkedIcons,skipped,truncated,violations,notApplicable:eligibleRoots===0,passed:!truncated&&(checkedText+checkedIcons>0||eligibleRoots===0)&&violations.length===0};
}
