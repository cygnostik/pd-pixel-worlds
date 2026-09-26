import {painter,rng} from './pixels.js';
import {drawLcarsPanel} from './lcars.js';

// One camera, facing aft from the viewscreen. The screen is behind the viewer.
// Reference hierarchy: luminous dome → aft stations → wood arc/three chairs → twin helm.
export const BRIDGE_ANCHORS=[[240,195],[161,248],[319,248],[196,199],[284,199],[240,145],[184,147],[296,147],[67,191],[413,191],[77,254],[403,254]];
const C={wall:'#9f8e77',light:'#dfcfac',seam:'#6d6255',floor:'#697674',rose:'#916863',wood:'#81523b',black:'#191e23'};

// Shallow controls reuse the bounded grammar. The aft bank has five distinct,
// mostly black instruments, rather than five oversized identical LCARS elbows.
function panel(p,x,y,w,h,skew=0,seed=1){
 const count=w>120?5:w>=60?3:1,step=Math.floor((w-4)/count);
 for(let u=0;u<w;u++)p.rect(x+u,y+u*skew,1,h,C.black);
 for(let i=0;i<count;i++){
  const left=2+i*step;
  if(h<14){drawLcarsPanel(p,x+left,y+left*skew,step-2,h,{seed:seed+i,skew});continue;}
  const r=(a,b,ww,hh,color)=>{for(let u=a;u<a+ww;u++)p.rect(x+left+u,y+b+(left+u)*skew,1,hh,color);};
  const l=(a,b,c,d,color)=>{const n=Math.max(Math.abs(c-a),Math.abs(d-b));for(let j=0;j<=n;j++)r(Math.round(a+(c-a)*j/(n||1)),Math.round(b+(d-b)*j/(n||1)),1,1,color);};
  const trace=points=>{for(let j=1;j<points.length;j++)l(...points[j-1],...points[j],'#89a6b0');};
  const amber='#c8b68d',lilac='#b4a4c0',cream='#e0d5b6';
  r(0,2,step-2,h-4,'#101218');
  r(2,4,[12,19,10,15,21][i],2,i%2?lilac:amber);r(2,6,2,7,amber);
  r(2,15,2,4,lilac);r(2,21,2,4,'#d7a17e');r(26,4,3,1,cream);
  if(i===0){
   trace([[8,10],[14,10],[14,22],[29,22]]);
   for(let j=0;j<3;j++){trace([[18+j*4,22],[18+j*4,12+j*2]]);r(17+j*4,11+j*2,3,2,j%2?lilac:cream);}
   r(7,17,4,1,amber);r(7,20,3,1,lilac);
  }else if(i===1){
   trace([[12,10],[23,10],[28,14],[28,20],[23,24],[12,24],[8,20],[8,14],[12,10]]);
   trace([[14,14],[21,14],[24,17],[21,21],[14,21],[11,17],[14,14]]);
   l(7,23,27,11,'#d7a17e');r(17,16,2,2,cream);
  }else if(i===2){
   for(let j=0;j<4;j++)r(15,10+j*4,4,2,j===2?cream:lilac);
   trace([[12,10],[10,10],[10,23],[12,23]]);trace([[21,12],[25,12],[25,19],[29,19]]);
   r(6,15,3,1,amber);r(27,23,3,1,cream);
  }else if(i===3){
   for(let j=0;j<5;j++){r(8,10+j*3,[10,15,7,13,9][j],1,j%2?cream:lilac);r(27,10+j*3,2,1,amber);}
   r(23,10,1,15,'#536a79');
  }else{
   trace([[7,19],[12,19],[16,13],[24,13],[28,17],[24,21],[16,21],[12,19]]);
   trace([[18,13],[18,9],[26,9]]);trace([[18,21],[18,24],[28,24]]);
   r(17,16,8,2,cream);r(7,10,4,1,lilac);r(8,24,5,1,amber);
  }
  r(7,27,8,1,i%2?amber:lilac);r(20,27,9,1,'#d7a17e');
 }
}
// One continuous wall plane down to the red skirting. Its five cabinet rows
// straddle a dark recess; no projecting keyboard shelf or lower light diffuser.
function sideWall(p,side){
 const point=(x,v)=>[side<0?x:480-x,98-13*x/98+v/110*(108-30*x/98)];
 const poly=(pts,color)=>p.poly(pts.map(([x,v])=>point(x,v)),color);
 const box=(x,v,w,h,color)=>poly([[x,v],[x+w,v],[x+w,v+h],[x,v+h]],color);
 box(0,0,98,110,'#a48f76');box(2,3,94,103,'#b09a7e');
 // Recessed cool cove above the panels, not a light across the floor.
 box(4,5,90,3,'#7e8d99');box(5,5,88,1,'#c7d9df');
 box(6,21,68,78,'#72695f');box(7,22,66,76,'#a79a88');
 for(const x of [8,30,52]){
  for(const [v,h]of [[23,12],[36,12],[56,12],[69,12],[82,13]]){
   box(x,v,20,h,'#89858a');
   box(x+13,v+3,6,2,'#16191d');box(x+17,v+3,1,1,'#e6dfc9');
  }
  box(x,49,20,6,'#11151b');
 }
 // Narrow vertical systems instrument beside the aft door. At this scale the
 // two gold silhouettes and the small blue/gold readout carry the recognition.
 box(78,14,16,85,'#756b5e');box(79,15,14,83,'#141a20');
 box(80,17,12,19,'#10151b');box(80,40,12,31,'#10151b');box(80,76,12,19,'#10151b');
 poly([[81,47],[83,44],[87,44],[88,42],[91,44],[91,46],[87,47],[85,49],[81,49]],'#b59a5d');
 poly([[84,54],[89,54],[91,58],[91,62],[89,66],[84,66],[82,62],[82,58]],'#b59a5d');
 poly([[85,55],[88,55],[90,59],[90,62],[88,65],[85,65],[83,62],[83,59]],'#6f613c');
 box(81,56,4,2,'#b59a5d');box(81,63,4,2,'#b59a5d');
 for(let i=0;i<5;i++){box(81+i*2,80,1,2,i%2?'#b8cdd7':'#648eae');box(81+i*2,84,1,2,i%2?'#c9b37e':'#83a4bc');}
 box(0,107,98,3,'#793f43');
}
function helmChair(p,x){
 const {rect:r,poly:q,oval:o}=p;
 // Slim armless seats, with the cushion aligned to the existing seated crew.
 o(x,278,15,3,'#303a3b55');r(x-5,248,10,28,'#635f54');r(x-3,250,3,24,'#a29984');r(x+2,250,1,24,'#827969');
 q([[x-13,237],[x-11,209],[x-7,204],[x+8,204],[x+12,209],[x+14,237]],'#88725e');
 q([[x-11,237],[x-9,210],[x+9,210],[x+12,237]],'#bea17e');
 r(x-8,205,17,5,'#d7bd96');r(x-7,211,15,24,'#c4a780');
 for(let y=217;y<235;y+=7){r(x-8,y,18,1,'#8f785f');r(x-7,y+1,17,1,'#dfc49b');}
 q([[x-12,238],[x+13,238],[x+17,245],[x+13,250],[x-12,250],[x-15,245]],'#b09370');
 q([[x-11,238],[x+12,238],[x+14,244],[x-13,244]],'#dfc49b');r(x-10,248,21,2,'#8f785f');
}
function chair(p,x,y,s=1){
 const {rect:r,poly:q,oval:o}=p;const P=(pts,c)=>q(pts.map(([a,b])=>[x+a*s,y+b*s]),c),R=(a,b,w,h,c)=>r(x+a*s,y+b*s,w*s,h*s,c);
 o(x,y+5*s,18*s,4*s,'#242b2b55');R(-4,0,8,7,'#3e403c');
 P([[-15,-5],[-12,-40],[-8,-44],[9,-44],[13,-40],[17,-5]],'#7a6654');
 P([[-13,-6],[-10,-39],[-7,-42],[8,-42],[11,-38],[14,-6]],'#c3a27b');
 R(-8,-40,16,6,'#e3c8a0');R(-7,-34,14,23,'#ad8b6b');
 for(let j=0;j<5;j++){R(-6,-31+j*4,12,1,'#d7b991');R(-6,-30+j*4,12,1,'#957961');}
 R(-11,-8,24,7,'#dfbe93');R(-10,-7,21,2,'#edd3aa');
 P([[-17,-18],[-11,-14],[-11,-2],[-18,-4]],'#bb9872');P([[12,-14],[19,-18],[20,-4],[13,-2]],'#cdb08a');
 R(-17,-18,7,3,'#ebcea3');R(13,-18,7,3,'#ebcea3');
}
export function drawBridge(p){
 const {rect:r,poly:q,line:l,oval:o}=p,random=rng(2026);
 r(0,0,480,300,'#3c3731');
 // Slate carpet and burgundy perimeter: a room with depth, not concentric bowls.
 q([[0,132],[480,132],[480,300],[0,300]],C.floor);
 q([[0,148],[115,132],[123,145],[30,300],[0,300]],'#734e4c');q([[480,148],[365,132],[357,145],[450,300],[480,300]],'#734e4c');
 for(let i=0;i<1200;i++){const x=random()*480,y=145+random()*155;r(x,y,1,1,i%2?'#e0d4b509':'#1b272912');}
 // Aft wall, broad architectural recesses and warm overhead cove.
 q([[0,52],[480,52],[480,160],[367,144],[113,144],[0,160]],C.wall);
 q([[0,57],[105,76],[375,76],[480,57],[480,90],[375,86],[105,86],[0,90]],'#75654f');
 r(147,83,186,60,'#6c6253');r(151,86,178,53,'#b4a38a');r(152,87,176,3,'#ede0c0');
 panel(p,153,95,174,31,0,9);
 q([[153,127],[327,127],[332,137],[148,137]],'#514944');panel(p,155,128,170,6,0,3);
 r(152,137,176,9,'#a89478');for(let x=155;x<328;x+=22){r(x,138,19,7,'#b6a48b');r(x,138,19,1,'#cdbb9a');}
 // Turbolift doors frame the aft console wall, not a forward viewscreen.
 for(const x of [103,335]){
  q([[x,91],[x+4,83],[x+37,83],[x+42,90],[x+42,145],[x,145]],'#6e6659');
  r(x+4,90,34,53,'#b5ab98');r(x+5,91,15,51,'#a79c8b');r(x+22,91,15,51,'#bdb09a');r(x+20,90,2,54,'#635e54');
  for(const yy of [106,123,137]){r(x+5,yy,15,1,'#8e8577');r(x+22,yy,15,1,'#8e8577');}
  r(x+13,117,6,2,'#514e44');r(x+23,117,4,2,'#efe0b9');r(x+1,145,40,2,'#d2c09e');
 }
 for(const x of [145,331]){r(x,93,4,45,'#282727');r(x+1,99,2,9,'#d7a474');r(x+1,113,2,6,'#d07d59');r(x+1,125,2,9,'#e0b07a');}
 // Mirrored complete side-wall treatments share the same architectural plane.
 sideWall(p,-1);sideWall(p,1);
 // One continuous rose command carpet, with no inset oval or tiered front rim.
 // The aft and side circulation remains slate; the forward edge stays open.
 q([[117,211],[126,192],[144,175],[170,161],[202,152],[240,149],[278,152],[310,161],[336,175],[354,192],[363,211],[350,223],[314,230],[166,230],[130,223]],C.rose);
 // The command furniture is painted with the rail, in depth order, so its
 // central tactical support cannot overwrite an unoccupied chair back.
 // Lower conn/ops chairs. Their forward desk faces are a separate occlusion layer.
 helmChair(p,161);helmChair(p,319);
 // The luminous, segmented canopy is the visual roof, not a wall-mounted screen.
 o(240,-12,283,98,'#4b3c2d');o(240,-14,276,91,'#bdac88');o(240,-18,269,89,'#eee2bd');
 o(240,-22,267,83,'#f7efcf');
 for(const side of [-1,1]){
  const map=pts=>pts.map(([x,y])=>[240+side*x,y]);
  q(map([[67,0],[83,0],[112,27],[140,57],[156,65],[146,67],[128,56],[99,26]]),'#867051');
  q(map([[128,0],[146,0],[188,25],[213,45],[224,48],[219,53],[204,47],[173,27]]),'#927a57');
  q(map([[192,0],[215,0],[250,17],[264,26],[260,33],[245,26]]),'#8b724f');
  for(const pts of [[[25,0],[40,17],[57,25],[66,47],[75,67]],[[101,0],[116,15],[139,25],[159,47],[172,62]]]){const a=map(pts);for(let i=1;i<a.length;i++)l(...a[i-1],...a[i],'#b2a17d',2);}
 }
 // Dark central oculus within the ceiling ring, not a second viewscreen.
 o(240,-12,83,35,'#8a6e50');o(240,-14,77,31,'#392f29');o(240,-16,70,27,'#161f26');
 for(let i=0;i<34;i++){const x=174+random()*132,y=random()*12;if(((x-240)/69)**2+((y+16)/27)**2<1)r(x,y,1,1,'#aaa897');}
 // Unbroken curved cornice emphasizes a single room envelope.
 for(let x=0;x<480;x++){const yy=68-23*((x-240)/240)**2;r(x,yy,1,4,'#65513a');r(x,yy+4,1,2,'#c8b38c');r(x,yy+6,1,3,'#827057');}
}
export function drawBridgeRail(ctx){
 const p=painter(ctx),{poly:q,line:l}=p;
 const arc=[[117,211],[125,191],[143,173],[169,157],[200,147],[240,143],[280,147],[311,157],[337,173],[355,191],[363,211]];
 const inner=[[119,211],[129,194],[148,179],[173,165],[203,157],[240,153],[277,157],[307,165],[332,179],[351,194],[361,211]];
 // Broad at the tactical crown, tapering to the floor at the two open ends.
 q([[201,146],[279,146],[270,157],[259,169],[251,179],[249,187],[231,187],[229,179],[221,169],[210,157]],'#a89e8e');
 q([[205,148],[275,148],[266,158],[255,170],[247,184],[233,184],[225,170],[214,158]],'#d0c6b4');
 l(211,150,227,170,'#e2d8c5');l(269,150,253,170,'#afa596');
 q([...inner,...inner.map(([x,y])=>[x,y+2]).reverse()],'#674333');
 q([...arc,...[...inner].reverse()],C.wood);
 for(let i=1;i<arc.length;i++){
  l(...arc[i-1],...arc[i],'#b1855b');l(...inner[i-1],...inner[i],'#916144');
 }
 // These surfaces sit in front of the rear rail/support, but behind the crew.
 // Their shapes and station anchors are unchanged.
 chair(p,196,194,.9);chair(p,240,190,1);chair(p,284,194,.9);
 for(const side of [-1,1]){
  const P=(pts,color)=>q(pts.map(([x,y])=>[240+side*x,y]),color);
  // Low companion seats and angled side controls, with their white front insets.
  P([[64,180],[79,180],[87,184],[86,190],[69,190]],'#9a7c61');
  P([[65,180],[79,180],[85,183],[82,186],[67,186]],'#d1b18a');
  P([[61,178],[74,175],[87,187],[84,203],[66,201]],'#a78c71');
  P([[65,181],[74,180],[83,189],[80,199],[68,198]],'#e1e9df');
  P([[61,171],[72,167],[80,177],[67,183],[59,178]],'#d2b594');
  P([[62,172],[71,169],[76,176],[66,179]],'#bca080');
  P([[64,172],[70,170],[73,173],[66,175]],'#434044');
 }
}
export function drawBridgeHelm(ctx){
 const p=painter(ctx),{poly:q,line:l,oval:o}=p;
 for(const side of [-1,1]){
  const center=240+side*79,P=(pts,color)=>q(pts.map(([x,y])=>[center+side*x,y]),color);
  // One lighted OUTBOARD support per desk; the inboard knee space stays open.
  o(center,284,48,5,'#34413f45');
  P([[-37,281],[42,281],[46,285],[-39,285]],'#3d4544');
  P([[17,248],[46,248],[43,276],[37,281],[21,281],[13,273]],'#665c50');
  P([[20,246],[44,247],[40,275],[35,278],[22,278],[16,271]],'#a79378');
  P([[20,253],[43,253],[40,273],[35,277],[23,277],[17,270]],'#d6eee5');
  P([[21,255],[40,255],[37,270],[33,274],[23,274],[20,269]],'#e6f5e9');
  P([[-40,235],[40,235],[49,241],[-49,241]],'#bfa687');
  P([[-37,236],[37,236],[43,241],[-43,241]],'#29292c');
  panel(p,center-34,236,68,4,0,side<0?11:19);
  P([[-49,240],[49,240],[52,243],[48,247],[-47,247],[-52,244]],'#a88e72');
  P([[-48,240],[48,240],[49,242],[-49,242]],'#d2b999');
  P([[-49,242],[49,242],[47,245],[-47,245]],'#bba083');
  l(center-46,246,center+46,246,'#82705d');
 }
}
