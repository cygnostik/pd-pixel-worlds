// Original static LCARS-inspired instruments. No fonts, images, timers or state.
const INK='#101218';
const COLORS=['#edb77c','#b9a3d6','#e7a28d','#e5cea2'];
const TRACE='#8da8bc';

/**
 * Paint in local pixel coordinates; every primitive inherits y += localX*skew.
 * Small displays simplify to grouped bands instead of collapsing into key grids.
 * Variants: systems (default), navigation, power. Unknown variants use systems.
 */
export function drawLcarsPanel(p,x,y,w,h,{seed=1,skew=0,variant='systems'}={}){
 if(![x,y,w,h,skew].every(Number.isFinite)||w<1||h<1)return;
 w=Math.floor(w);h=Math.floor(h);
 const id=Number.isFinite(seed)?Math.trunc(seed)>>>0:1;
 const amber=COLORS[0],lilac=COLORS[1],peach=COLORS[2],cream=COLORS[3];
 // Clip locally BEFORE applying perspective. Column runs keep curved ends crisp
 // and avoid the painter polygon primitive's inclusive right-edge rasterization.
 const box=(a,b,ww,hh,color)=>{
  const left=Math.max(0,Math.round(a)),top=Math.max(0,Math.round(b));
  const right=Math.min(w,Math.round(a+ww)),bottom=Math.min(h,Math.round(b+hh));
  if(right<=left||bottom<=top)return;
  for(let u=left;u<right;u++)p.rect(x+u,y+top+u*skew,1,bottom-top,color);
 };
 const round=(a,b,ww,hh,r,color)=>{
  a=Math.round(a);b=Math.round(b);ww=Math.round(ww);hh=Math.round(hh);
  r=Math.max(0,Math.min(Math.floor(r),Math.floor(ww/2),Math.floor(hh/2)));
  for(let row=0;row<hh;row++){
   const dy=Math.max(r-row-.5,row-(hh-r)+.5,0);
   const inset=dy?Math.ceil(r-Math.sqrt(Math.max(0,r*r-dy*dy))):0;
   box(a+inset,b+row,ww-2*inset,1,color);
  }
 };
 const line=(a,b,c,d,color=TRACE)=>{
  const n=Math.ceil(Math.max(Math.abs(c-a),Math.abs(d-b)));
  for(let i=0;i<=n;i++)box(a+(c-a)*i/(n||1),b+(d-b)*i/(n||1),1,1,color);
 };
 const path=(points,color=TRACE)=>{for(let i=1;i<points.length;i++)line(...points[i-1],...points[i],color);};
 box(0,0,w,h,INK);
 if(w<5||h<3){box(0,0,w,1,COLORS[id%3]);return;}
 if(h<14||w<25){
  const top=1,bar=Math.max(1,Math.min(3,h-2)),spine=Math.min(5,Math.max(2,Math.floor(w/8)));
  round(1,top,w-2,bar,2,amber);
  const split=Math.max(spine+2,Math.floor(w*(.42+(id%3)*.06)));
  box(split,top,2,bar,INK);round(split+2,top,w-split-3,bar,2,lilac);
  if(h>=7){
   round(1,top,spine,h-2,2,amber);
   box(1,h-4,spine,1,INK);box(spine+3,h-3,Math.max(2,w*.27),1,peach);
   box(w*.72,h-3,w*.17,1,cream);
  }
  return;
 }
 const margin=2,bar=Math.max(3,Math.min(6,Math.floor(h*.15)));
 const spine=Math.max(5,Math.min(10,Math.floor(w*.105)));
 const elbowH=Math.max(bar+5,Math.floor(h*.58)),radius=Math.min(6,spine);
 // Broad outer elbow and inset curved black throat, not a rectangular keypad.
 round(margin,margin,w-4,elbowH,radius,amber);
 round(margin+spine,margin+bar,w,h,Math.max(2,radius-2),INK);
 const split=Math.round(w*(.49+(id%3)*.045)),end=Math.round(w*.81);
 box(split,margin,2,bar,INK);box(split+2,margin,end-split-2,bar,lilac);
 box(end,margin,2,bar,INK);round(end+2,margin,w-end-4,bar,2,peach);
 box(margin,elbowH-1,spine,2,INK);
 round(margin,elbowH+1,spine,h-elbowH-3,2,lilac);
 const seam=Math.floor((h+elbowH)/2);
 box(margin,seam,spine,1,INK);box(margin,seam+1,spine,Math.max(1,h-seam-4),peach);
 // Footer is a deliberately unequal group of bars, with generous black gutters.
 const left=margin+spine+4,right=w-4,top=margin+bar+4,bottom=h-6;
 const dw=right-left,dh=bottom-top;
 round(left,h-3,dw*.31,1,0,peach);round(left+dw*.38,h-3,dw*.42,1,0,lilac);
 if(dw<9||dh<4)return;
 const X=t=>Math.round(left+t*dw),Y=t=>Math.round(top+t*dh);
 const route=points=>path(points.map(([a,b])=>[X(a),Y(b)]));
 const node=(a,b,color=cream)=>box(X(a)-1,Y(b)-1,3,2,color);
 if(variant==='navigation'){
  // Offset octagonal orbit and a crossing course vector, original schematic.
  const offset=(id%3)*.025;
  route([[.29+offset,.08],[.56,.08],[.71,.3],[.71,.68],[.55,.9],[.28,.9],[.13,.67],[.13,.31],[.29+offset,.08]]);
  route([[.33,.28],[.51,.28],[.57,.43],[.57,.61],[.47,.72],[.31,.66],[.27,.44],[.33,.28]]);
  path([[X(.04),Y(.82)],[X(.45),Y(.48)],[X(.85),Y(.12)]],peach);
  node(.45,.48);node(.85,.12,lilac);
  for(let j=0;j<3;j++)box(X(.86),Y(.47+j*.2),dw*(.08-j*.015),1,j===1?amber:lilac);
 }else if(variant==='power'){
  // A central energy stack with paired, unequal distribution branches.
  route([[.42,0],[.59,.2],[.59,.76],[.42,1],[.25,.76],[.25,.2],[.42,0]]);
  for(let j=0;j<3;j++)round(X(.33),Y(.22+j*.23),Math.max(2,dw*.18),2,1,j===1?cream:lilac);
  route([[.25,.35],[.1,.35],[.1,.08],[0,.08]]);
  route([[.59,.58],[.79,.58],[.79,.17],[.95,.17]]);
  route([[.59,.78],[.9,.78],[.9,1]]);
  node(0,.08,peach);node(.95,.17,amber);node(.9,1,lilac);
 }else{
  // Different branch ordering, lengths and chamber count for each station seed.
  const junction=.28+(id%4)*.055,count=2+id%2;
  route([[.02,.22],[junction,.22],[junction,.82],[.93,.82]]);
  for(let j=0;j<count;j++){
   const a=.45+j*(.48/count),yy=.08+((id+j)%3)*.14;
   route([[a,.82],[a,yy],[Math.min(.98,a+.12),yy]]);
   round(X(a+.02),Y(yy)-1,Math.max(3,dw*.1),3,1,j%2?peach:lilac);
  }
  node(.02,.22,cream);node(junction,.54,amber);
  box(X(.04),Y(.66),Math.max(2,dw*.1),1,lilac);
 }
 // Sparse instrumentation ticks; never a repeated field of colored keys.
 if(w>100)for(let j=0;j<3;j++)box(right-2-j*4,top,2,1,j===1?cream:amber);
}
