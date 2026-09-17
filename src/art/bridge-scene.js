import {painter,rng} from './pixels.js';

// One camera, facing aft from the viewscreen. The screen is behind the viewer.
// Reference hierarchy: luminous dome → aft stations → wood arc/three chairs → twin helm.
export const BRIDGE_ANCHORS=[[240,195],[161,248],[319,248],[196,199],[284,199],[240,145],[184,147],[296,147],[67,191],[413,191],[77,254],[403,254]];
const C={wall:'#9f8e77',light:'#dfcfac',seam:'#6d6255',floor:'#697674',rose:'#916863',wood:'#81523b',black:'#191e23'};

// Dense, asymmetric LCARS information, rather than identical colored keypads.
function panel(p,x,y,w,h,skew=0,seed=1){
 const random=rng(seed),{poly:q}=p;
 const box=(a,b,c,d,color)=>q([[x+a,y+b+a*skew],[x+a+c,y+b+(a+c)*skew],[x+a+c,y+b+d+(a+c)*skew],[x+a,y+b+d+a*skew]],color);
 box(0,0,w,h,C.black);box(2,2,w-4,1,'#536058');
 const colors=['#e4c894','#b0a1c4','#cd9179','#8fb3b0','#e6d3ab'];
 const cols=Math.max(2,Math.floor(w/32)),cw=(w-6)/cols;
 for(let n=0;n<cols;n++){
  const a=3+n*cw;box(a,4,cw-3,2,colors[n%5]);box(a,8,3,h-13,colors[(n+2)%5]);box(a+4,h-7,cw-7,2,'#b4c2a4');
  for(let j=0;j<5;j++){const yy=9+j*(h-18)/5;box(a+6,yy,3+random()*Math.max(3,cw-14),1,colors[(j+n)%5]);box(a+cw-5,yy,2,1,'#90a0aa');}
  if(n%2===0){box(a+cw/2,11,1,h-21,'#6d878a');box(a+cw/2-3,16,7,1,'#ccaa78');}
 }
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
 // Side stations recede to the same vanishing point as the aft wall.
 q([[0,98],[98,85],[98,149],[0,183]],'#cab591');q([[4,101],[95,89],[95,138],[4,167]],'#655e50');panel(p,8,111,83,38,-.22,4);
 q([[480,98],[382,85],[382,149],[480,183]],'#cab591');q([[476,101],[385,89],[385,138],[476,167]],'#655e50');panel(p,389,93,83,38,.22,6);
 q([[3,161],[94,139],[97,148],[6,174]],'#c8b18e');q([[477,161],[386,139],[383,148],[474,174]],'#c8b18e');
 q([[8,174],[92,151],[89,174],[16,206]],'#9b866b');q([[472,174],[388,151],[391,174],[464,206]],'#9b866b');
 q([[15,183],[87,160],[86,171],[23,198]],'#d4eee5');q([[465,183],[393,160],[394,171],[457,198]],'#d4eee5');
 // Three low risers support only the command island.
 o(240,193,116,38,'#414847');o(240,188,116,37,'#b49079');o(240,186,112,34,'#755954');
 q([[137,180],[143,198],[176,214],[209,220],[272,220],[305,214],[337,198],[343,180],[341,200],[307,218],[272,225],[208,225],[173,219],[139,202]],'#b59780');
 l(160,209,187,217,'#d0dfcc');l(191,218,288,218,'#c7d6c4');l(293,217,320,209,'#d0dfcc');
 o(240,181,107,34,C.rose);q([[145,145],[335,145],[345,180],[135,180]],C.rose);
 o(240,200,70,13,'#737b73');
 // Command seats: captain centered, two companion seats slightly forward.
 chair(p,196,194,.9);chair(p,240,190,1);chair(p,284,194,.9);
 for(const x of [163,306]){q([[x,177],[x+12,179],[x+18,201],[x+2,202]],'#b69c80');q([[x-2,171],[x+10,169],[x+15,179],[x,181]],'#d0b391');r(x+1,172,8,3,'#34353a');r(x+2,173,5,1,'#dbb590');}
 // Lower conn/ops chairs. Their forward desk faces are a separate occlusion layer.
 chair(p,161,266,1.14);chair(p,319,266,1.14);
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
 q([[220,146],[260,146],[250,160],[247,176],[232,176],[229,160]],'#c4b294');
 for(let i=1;i<arc.length;i++){
  const [x,y]=arc[i-1],[xx,yy]=arc[i];q([[x,y],[xx,yy],[xx,yy+5],[x,y+5]],'#674333');l(x,y,xx,yy,'#b1855b',2);l(x,y+2,xx,yy+2,'#916144',2);
 }
}
export function drawBridgeHelm(ctx){
 const p=painter(ctx),{rect:r,poly:q,line:l,oval:o}=p;
 for(const center of [161,319]){
  const x=center-49;
  o(center,284,51,7,'#34413f60');
  q([[x+6,247],[x+94,247],[x+84,282],[x+14,282]],'#6d6252');
  q([[x+10,250],[x+91,250],[x+80,279],[x+16,279]],'#b3a180');
  q([[x+12,253],[x+39,253],[x+37,273],[x+30,279],[x+18,277]],'#d6f2e8');
  q([[x+20,281],[x+80,281],[x+89,285],[x+15,285]],'#50534a');
  q([[x+6,232],[x+90,232],[x+103,248],[x-5,248]],'#cfb791');
  q([[x+7,233],[x+88,233],[x+95,240],[x+1,240]],'#4b4540');
  panel(p,x+12,234,72,5,0,center);
  q([[x-5,241],[x+100,241],[x+103,248],[x+98,254],[x-4,254],[x-8,249]],'#bba17e');
  l(x-4,242,x+98,242,'#e2cdaa',2);l(x-3,254,x+97,254,'#7a6956');
 }
}
