const finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function cropPlan(source,target,subject){
 for(const size of [source,target])if(!Array.isArray(size)||size.length!==2||size.some(n=>!Number.isInteger(n)||n<1||n>32768)||size[0]*size[1]>64e6)throw new Error('Invalid image dimensions');
 if(subject!==null&&(!Array.isArray(subject)||subject.length!==4||subject.some(n=>!finite(n,0,1))||subject[0]>=subject[2]||subject[1]>=subject[3]))throw new Error('A normalized subject rectangle or explicit null is required');
 const [sw,sh]=source,[tw,th]=target;if(sw<tw||sh<th)throw new Error('SOURCE_TOO_SMALL: provide an image at least '+tw+'x'+th);
 const scale=Math.max(tw/sw,th/sh),cw=tw/scale,ch=th/scale,roi=subject??[.49,.49,.51,.51];
 const [l,t,r,b]=roi.map((v,i)=>v*(i%2?sh:sw));
 const xmin=Math.max(0,r-cw),xmax=Math.min(sw-cw,l),ymin=Math.max(0,b-ch),ymax=Math.min(sh-ch,t);
 if(xmin>xmax+1e-7||ymin>ymax+1e-7)throw new Error('SUBJECT_CONFLICT: filling this canvas would cut protected details');
 const x=clamp((l+r-cw)/2,xmin,xmax),y=clamp((t+b-ch)/2,ymin,ymax);
 return {source,target,scale,crop:[x,y,cw,ch],subject:[(l-x)/cw,(t-y)/ch,(r-x)/cw,(b-y)/ch].map(v=>clamp(v,0,1)),protected:subject!==null};
}
export function rgb(hex){if(!/^#[\da-f]{6}$/i.test(hex))throw new Error('Expected #RRGGBB');return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
export function hex(values){return '#'+values.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('').toUpperCase();}
export function luminance(color){const c=rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
export function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function paletteCandidates(colors){
 const result=[];for(const color of colors){rgb(color);const c=color.toUpperCase();if(!result.includes(c))result.push(c);if(result.length===5)break;}
 if(!result.length)throw new Error('Image contains no palette samples');
 const base=rgb(result[0]);for(const factor of [.2,.4,.6,.8,1.2,1.5]){const color=hex(base.map(v=>factor<=1?v*factor:v+(255-v)*(factor-1)));if(!result.includes(color))result.push(color);if(result.length===5)break;}
 for(const color of ['#101010','#404040','#808080','#B0B0B0','#E0E0E0']){if(result.length>=5)break;if(!result.includes(color))result.push(color);}
 return result;
}
export function readableSurface(colors,foregrounds,minContrast=4.5){
 if(!Array.isArray(colors)||!colors.length||colors.length>5||!Array.isArray(foregrounds)||!foregrounds.length)throw new Error('Colors and measured foreground samples are required');
 for(const color of [...colors,...foregrounds])rgb(color);
 const candidates=colors.flatMap(color=>{const values=rgb(color);return Array.from({length:21},(_,i)=>hex(values.map(v=>i<=10?v*(1-i/10):v+(255-v)*(i-10)/10)));});
 const eligible=candidates.filter(color=>foregrounds.every(f=>contrast(color,f)>=minContrast));
 if(!eligible.length)throw new Error('CONTRAST_CONFLICT: mixed foreground colors require separate surface mapping');
 const distance=color=>Math.min(...colors.map(c=>rgb(c).reduce((sum,v,i)=>sum+(v-rgb(color)[i])**2,0)));
 eligible.sort((a,b)=>distance(a)-distance(b));return {surface:eligible[0],surfaceOpacity:1,border:colors.at(-1),borderOpacity:.65,borderWidth:1};
}
