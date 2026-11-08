import {REGIONS,SCENE_REGIONS} from '../renderer/core.mjs';

// This is engine-owned metadata, never supplied by an imported Skin.
export function regionCapabilities(key){
 const role=SCENE_REGIONS.includes(key)?'scene':(['buttons','inputs','composer','scrollbars'].includes(key)?'control':'content');
 const configuration=role==='scene'?['background','overlay']:['surface','surfaceOpacity','border','borderOpacity'];
 if(key==='scrollbars')return {role:'control',configuration:['surface','text'],preserve:['scrolling']};
 return {role,configuration,preserve:['text','semantic-colors','focus','hit-targets','scrolling'],sharedScene:SCENE_REGIONS.includes(key)};
}

export function catalogFromReport(report,labels={}){
 const regions=REGIONS.map(key=>{
  const observations=report.samples.flatMap((s,index)=>(s.regionCoverage??[]).filter(r=>r.key===key).map(r=>({...r,sample:index,truncated:!!s.truncated})));
  const matched=Math.max(0,...observations.map(r=>r.matched)),visible=Math.max(0,...observations.map(r=>r.visible));
  const errors=[...new Set(observations.flatMap(r=>r.selectorErrors??[]))];
  const reasons=[];
  if(!visible)reasons.push(matched?'hidden':'not-observed');
  if(errors.length)reasons.push('selector-error');
  if(observations.some(r=>r.truncated)||report.targetLimitReached)reasons.push('truncated');
  if(report.clientVersion!==report.adapterVersion)reasons.push('version-mismatch');
  if(report.unconfirmedRegions?.includes(key))reasons.push('adapter-unconfirmed');
  return {key,label:{en:labels.en?.regions?.[key]??key,zh:labels['zh-CN']?.regions?.[key]??key},status:visible?'observed':matched?'loaded-hidden':'not-observed',enabledByDefault:false,...regionCapabilities(key),requiresAdapterReview:reasons.length>0,reasons,observations:observations.map(r=>({sample:r.sample,visible:r.visible,rects:(r.samples??[]).filter(s=>s.visible).map(s=>s.rect)}))};
 });
 const candidates=report.samples.flatMap((s,sample)=>(s.candidates??[]).filter(c=>!c.mappedRegions?.length).map(c=>({sample,role:c.role,tag:c.tag,path:c.path,rect:c.rect,visible:c.visible,status:'needs-classification'})));
 return {schemaVersion:2,clientVersion:report.clientVersion,adapterVersion:report.adapterVersion,readOnly:true,coverageLabels:report.coverageLabels,coverage:report.coverage??null,regions,candidates,instructions:{zh:'已观察不代表视觉验收。缺口不能标记为通过。',en:'Observed is not visual acceptance. Gaps are not passes.'}};
}
