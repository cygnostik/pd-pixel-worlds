import {painter,rng,cup} from './pixels.js';
import {drawLcarsPanel} from './lcars.js';
import {drawHallCore as hallCore} from './warp-core.js';

/** Original 480 × 300 pixel scenery. One raised, core-facing camera.
 * Reference-led relationships, not traced art or a measured production plan.
 * Hidden access and bay placement follow user corrections; their exact geometry
 * is authored scene topology, not a verified canon floor plan.
 * Effects are painted BEFORE crew. Their caller owns simulation time and clearing.
 * Foreground is deliberately object-local; never repaint the whole scene over crew.
 */
const C={cream:'#d8ceba',ivory:'#f0e5ca',taupe:'#a99c89',shade:'#71695e',deep:'#454740',sand:'#b4a58a',teal:'#557b82',glass:'#111b24',blue:'#3984df',cyan:'#94e9fa',white:'#e6fbff'};
const unit=v=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;
const seconds=v=>Number.isFinite(v)?Math.max(0,v):0;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

// Engineering's lift is deeper in the complex, beyond the near-left aisle.
// No visible door or portal repaint belongs to the partly hidden computer recess.
export const ENGINEERING_PORTAL=freeze({x:120,y:374,approach:[120,294],rect:[103,338,35,67],offscreen:true});
// This is an ANNEX doorway into Engineering, not a second turbolift.
export const CHIEF_OFFICE_PORTAL=freeze({x:66,y:158,approach:[66,179],rect:[45,88,42,72]});
const nearExit=[[139,294],[120,294]];
const leftExit=(x,y)=>[[x,y],[139,y],...nearExit];
// Preserve the 23px occupied-duty clearance on the narrow core/table crossing.
const crossExit=[[342,180],[170,180],[170,194],[125,194],[125,294],[120,294]];
const rightExit=(x,y)=>[[x,y],[342,y],[342,294],[120,294]];
export const ENGINEERING_STATIONS=freeze([
 {id:'engineering-duty-port',x:149,y:169,facing:'north',seated:false,exitPath:[[149,169],[139,180],...nearExit]},
 {id:'engineering-duty-starboard',x:363,y:163,facing:'north',seated:false,exitPath:[[363,163],[363,180],...crossExit]},
 {id:'engineering-wall-port',x:102,y:214,facing:'west',seated:false,exitPath:leftExit(102,214)},
 {id:'engineering-wall-starboard',x:387,y:214,facing:'east',seated:false,exitPath:rightExit(387,214)},
 {id:'engineering-table-port',x:174,y:252,facing:'east',seated:false,exitPath:leftExit(174,252)},
 {id:'engineering-table-starboard',x:316,y:252,facing:'west',seated:false,exitPath:rightExit(316,252)},
 {id:'engineering-service-port',x:70,y:279,facing:'west',seated:false,exitPath:leftExit(70,279)},
 {id:'engineering-service-starboard',x:410,y:279,facing:'east',seated:false,exitPath:rightExit(410,279)},
]);
export const CHIEF_OFFICE_STATIONS=freeze([
 {id:'chief-office-workbay',x:139,y:186,facing:'north',seated:false,exitPath:[[139,186],[139,208],[100,208],[66,179]]},
 {id:'chief-office-console',x:275,y:235,facing:'north',seated:false,exitPath:[[275,235],[181,235],[100,208],[66,179]]},
]);
export const ENGINEERING_HOTSPOTS=freeze([
 {id:'engineering-core',label:'Warp-core resonance',x:212,y:61,width:94,height:99,action:'pulse'},
 {id:'engineering-systems-table',label:'LCARS diagnostic simulation',x:184,y:189,width:122,height:85,action:'diagnostic'},
 {id:'engineering-computer-access',label:'Computer access diagnostics',x:137,y:100,width:28,height:47,action:'diagnostic'},
 {id:'engineering-isolinear',label:'Isolinear chip diagnostics',x:359,y:84,width:29,height:43,action:'diagnostic'},
]);
export const CHIEF_OFFICE_HOTSPOTS=freeze([
 {id:'chief-office-systems-wall',label:'Engineering systems diagnostics',x:200,y:58,width:183,height:82,action:'diagnostic'},
 {id:'chief-office-work-console',label:'LCARS diagnostic simulation',x:219,y:189,width:120,height:40,action:'diagnostic'},
 {id:'chief-office-tea',label:'Replicate tea',x:407,y:115,width:48,height:43,action:'tea'},
 {id:'chief-office-annex',label:'Return through Engineering annex',x:45,y:88,width:42,height:72,action:'lift'},
]);

function trace(p,points,color,width=1){for(let i=1;i<points.length;i++)p.line(...points[i-1],...points[i],color,width);}
function panel(p,x,y,w,h,seed=1,skew=0,variant='systems'){
 drawLcarsPanel(p,x,y,w,h,{seed,skew,variant});
}


function rail(p){
 const {line:l,poly:q}=p;
 q([[174,151],[193,159],[230,165],[288,165],[326,159],[346,150],[346,156],[326,164],[288,170],[230,170],[193,164],[174,157]],'#353f43');
 trace(p,[[174,150],[194,158],[229,164],[289,164],[325,158],[346,149]],'#a99d89',2);
 const points=[[178,132],[194,140],[228,145],[289,145],[324,140],[343,131]];
 for(const [x,y] of points){l(x,y,x,y+18,'#b7b6a8',2);l(x+2,y+1,x+2,y+17,'#344952');}
 trace(p,points,'#372d30',3);trace(p,points,'#af8c72');
 trace(p,points.map(([x,y])=>[x,y+13]),'#667b85');
}

function chamber(p){
 const {rect:r,poly:q,line:l}=p;
 // Below the shoulders, the chamber backing ends INSIDE the shared jambs.
 // All rear floor fills end at the curved rail footing, not a rectangular
 // backdrop that leaks out as black triangles on the tan workbay carpet.
 q([[163,35],[178,24],[342,24],[355,37],[355,80],[352,80],[352,155],[346,156],[326,164],[288,170],[230,170],[193,164],[174,157],[168,155],[168,80],[163,80]],'#171f2a');
 q([[175,34],[340,34],[340,157],[334,160],[183,160],[175,157]],'#222d38');
 // Upper balustrades are outside this camera aperture. Do not leave truncated
 // railing/column 'tails' dangling between the ceiling and the gallery decks.
 for(const x of [180,317]){r(x,74,18,73,'#68544b');r(x+4,74,8,73,'#9c6155');r(x+6,75,2,69,'#d99378');}
 r(201,32,8,118,'#384652');r(307,32,6,118,'#46515b');
 // Source-led gallery decks terminate at the chamber jambs and reactor chase.
 // A solid fitted soffit beneath each deck avoids an isolated free beam end.
 q([[174,66],[216,77],[216,99],[174,87]],'#616b70');
 q([[301,77],[346,65],[346,87],[301,99]],'#5b656e');
 q([[177,74],[210,83],[210,90],[177,81]],'#172633');
 q([[308,83],[342,74],[342,81],[308,90]],'#162632');
 q([[174,59],[216,70],[216,80],[174,70]],'#766e62');q([[301,70],[346,58],[346,70],[301,80]],'#716b61');
 trace(p,[[174,69],[215,79]],'#9d9481');trace(p,[[301,79],[346,69]],'#9d9481');
 q([[176,148],[214,146],[232,152],[292,152],[312,146],[344,148],[333,160],[326,164],[193,164],[187,160]],'#0f1c27');
 hallCore(p);rail(p);
}

function door(p,portal,amount=0,office=false){
 if(portal.offscreen)return;
 const {rect:r,line:l,poly:q}=p,[x,y,w,h]=portal.rect,open=Math.round(unit(amount)*(w/2-2));
 // A full bounded repaint makes open→closed deterministic; clipping keeps leaves
 // inside the pocket. Door geometry is below 36px head clearance at the threshold.
 p.c.save();p.c.beginPath();p.c.rect(x,y,w,h);p.c.clip();
 r(x,y,w,h,'#18242c');r(x+4,y+3,w-8,h-3,'#333c3e');r(x+6,y+4,w-12,2,'#ddd8be');
 r(x+7,y+9,w-14,h-11,'#303f43');r(x+10,y+10,2,h-25,'#758879');r(x+w-12,y+10,2,h-25,'#758879');
 r(x+8,y+35,w-16,2,'#99a291');
 q([[x+7,y+h-17],[x+w-7,y+h-17],[x+w-2,y+h],[x+2,y+h]],'#7e8274');
 l(x+7,y+h-17,x+w-7,y+h-17,'#b2b5a0');
 const half=Math.ceil(w/2);
 for(const side of [0,1]){
  const xx=x+side*half+(side?open:-open),ww=side?w-half:half;
  r(xx,y,ww,h,office?(side?'#a59b86':'#908974'):(side?'#b47c49':'#9c653a'));
  r(xx+2,y+3,ww-4,1,office?'#c8bea5':'#d8a36b');r(xx+2,y+h-4,ww-4,1,office?'#c8bea5':'#c59660');
  l(xx+(side?0:ww-1),y,xx+(side?0:ww-1),y+h,'#4f514c');
 }
 p.c.restore();r(x-2,y+h,w+4,2,'#e1d5b9');
}

// These are opaque corridor wall panels ABOVE the continuous LCARS band.
// Not doors: no salmon leaves, handles, center seams or another screen tier.
function wallBays(p,right=false){
 const {poly:q,line:l}=p;
 const X=x=>right?480-x:x,shape=points=>points.map(([x,y])=>[X(x),y]);
 q(shape([[4,60],[82,67],[96,86],[90,133],[6,149]]),'#b2a793');
 // Chamfer from the ceiling into a broad gray infill, then down to LCARS.
 q(shape([[8,66],[77,73],[88,89],[85,128],[8,143]]),'#848780');
 q(shape([[11,69],[73,76],[84,91],[81,124],[11,138]]),'#969a92');
 q(shape([[8,143],[85,128],[90,134],[9,150]]),'#cfc5af');
 l(X(11),139,X(81),125,'#696e69');
 // Faceted corridor ends at the open work area, not another core frame.
 q(shape([[82,67],[96,85],[105,153],[97,178],[91,184],[96,151],[90,90]]),'#d8ceba');
 l(X(84),70,X(94),87,'#ece1c8');
}

function computerAccess(p){
 const {rect:r,poly:q}=p;
 // Wider outer bay; the continuous wall and bench turn left out of sight.
 // No narrow door-shaped recess or separating pier beside the duty station.
 q([[78,81],[103,66],[138,66],[174,80],[174,151],[163,161],[88,157]],'#716e62');
 q([[85,86],[106,74],[139,74],[169,85],[169,144],[89,152]],'#96907c');
 q([[92,94],[132,90],[166,98],[166,132],[94,139]],'#3b423d');
 panel(p,102,104,14,26,51);panel(p,119,102,14,28,52);
 r(137,100,28,32,'#6e7166');panel(p,139,102,24,28,53);
 q([[95,139],[133,133],[165,134],[169,145],[100,153]],'#a99f88');
 q([[99,141],[133,136],[165,137],[164,142],[101,148]],C.glass);
 q([[136,134],[165,134],[169,145],[136,150]],C.cream);
 panel(p,138,136,26,7,14);
 q([[135,150],[167,150],[164,162],[139,162]],C.shade);
 // The shared bulkhead painter owns the wall return into the chamber;
 // a second jamb here would leave doubled trim behind that recess.
}

function isolinearBay(p){
 const {rect:r,line:l,poly:q}=p;
 // Starboard workspace spreads out beyond the corridor end as well.
 q([[345,77],[372,64],[405,67],[426,82],[420,155],[385,160],[347,153]],'#716e62');
 q([[352,80],[373,73],[402,76],[415,86],[412,149],[352,153]],'#96907c');

 // Cabinet and console share one left edge; the space beside the arch is
 // plain wall, not a thin extra mounting strip with several dangling steps.
 r(357,77,35,53,'#7d7c6f');r(357,80,32,48,'#c6bca5');
 r(360,84,26,41,'#152c34');
 // Distinct translucent blue/green vertical cards in indexed hardware sockets.
 for(let col=0;col<5;col++)for(let row=0;row<3;row++){
  const x=362+col*5,y=87+row*12,blue=(col+row)%2===0;
  r(x,y,3,9,blue?'#397ca7':'#398b78');r(x+1,y,1,8,blue?'#8dd2e9':'#94d9b1');
  r(x,y+9,3,2,'#656d67');r(x+1,y+10,1,1,'#d9cba0');
 }
 l(361,124,385,124,'#95a79b');
 starboardDutyConsole(p);
}
function starboardDutyConsole(p){
 // Trim only the mounting margin; preserve the authored slope and readout.
 p.c.save();p.c.beginPath();p.c.rect(357,122,33,35);p.c.clip();
 p.poly([[354,122],[389,128],[389,145],[354,140]],C.cream);panel(p,358,125,26,11,19,.16);
 p.poly([[356,141],[387,145],[384,156],[358,155]],C.shade);
 p.c.restore();
}

const WORKBAY_SPOTS=freeze([[112,73],[139,73],[162,73],[359,73],[382,73]]);
function workbaySoffit(p){
 const {poly:q}=p;
 // Level peripheral ceiling planes tuck BEHIND the nearer corridor walls.
 // Only the small return into the inner chamber changes depth; no domed bays
 // or folded-down tips trying to squeeze a second room into the wall edge.
 // Both planes end on the arch's outer shoulder, not through its reveal.
 q([[76,58],[181,58],[174,64],[172,68],[76,68]],'#a79d89');
 q([[76,68],[172,68],[170,71],[168,80],[162,79],[76,79]],'#555b51');
 q([[339,58],[421,58],[421,68],[348,68],[346,64]],'#a79d89');
 q([[348,68],[421,68],[421,79],[358,79],[352,80],[350,71]],'#555b51');
 for(const [x,y]of WORKBAY_SPOTS){p.oval(x,y,4,2,'#747665');p.oval(x,y,2,1,'#f3ecdc');}
}


function coreBulkheadRim(p){
 const {rect:r,line:l,poly:q}=p;
 // One continuous wall return owns both sides of the open bulkhead seat.
 // The cooler inner reveal faces the chamber; the warm casing meets the
 // workbay. No duplicate jamb, door leaf or floor barrier.
 for(const right of [false,true]){
  const X=x=>right?520-x:x,shape=points=>points.map(([x,y])=>[X(x),y]);
  q(shape([[171,81],[177,76],[177,152],[173,159],[171,163]]),'#505d5e');
  q(shape([[168,163],[168,80],[170,71],[174,64],[181,58],[183,58],[177,65],[173,73],[171,81],[171,161]]),'#7e776a');
  q(shape([[171,163],[171,81],[173,73],[177,65],[183,59],[182,60],[178,67],[175,74],[173,82],[173,161]]),'#343d3d');
  // Seat the wall at the existing floor edge, behind the unchanged rail.
  q(shape([[168,161],[173,159],[177,152],[177,157],[173,163],[168,164]]),'#716e62');
  trace(p,shape([[169,162],[169,80],[171,72],[175,65],[182,59]]),'#a49c88');
  trace(p,shape([[173,160],[173,82],[175,74],[178,67],[182,60]]),'#65716e');
  // Two quiet casing joints, not warning lights or decorative striping.
  for(const y of [105,133])l(X(168),y,X(170),y,'#50574f');
 }
 r(183,58,154,1,'#7e776a');r(183,59,154,1,'#a49c88');r(183,60,154,1,'#343d3d');
}

function sideConsole(p,right=false,near=false){
 const {poly:q,line:l}=p;
 const shape=points=>points.map(([x,y])=>[right?480-x:x,y]);
 const bounds=shape(near?[[0,215],[45,227],[57,258],[51,279],[0,298]]:[[0,143],[83,131],[94,180],[91,207],[31,237],[0,221]]);
 p.c.save();p.c.beginPath();bounds.forEach(([x,y],i)=>i?p.c.lineTo(x,y):p.c.moveTo(x,y));p.c.closePath();p.c.clip();
 if(near){
  q(shape([[0,215],[45,227],[51,279],[0,298]]),C.shade);
  q(shape([[0,218],[41,230],[44,255],[0,271]]),C.cream);
  // Work surfaces extend to the hand of a side-facing full-size crew member.
  q(shape([[0,239],[43,250],[57,258],[0,278]]),'#ddd1b9');
  if(right)panel(p,439,232,41,21,-3,-.29);else panel(p,0,220,41,21,3,.29);
  q(shape([[0,260],[50,254],[57,258],[0,278]]),'#a99b83');
  q(shape([[0,280],[49,262],[49,276],[0,294]]),'#eaf0df');
  q(shape([[0,282],[45,266],[45,274],[0,290]]),'#f8f8e8');
 }else{
  q(shape([[0,143],[83,131],[92,179],[15,215],[0,205]]),C.taupe);
  // The screen backing ends at the fascia, not below its outer corner.
  q(shape([[8,148],[80,136],[83,164],[37,184],[13,184]]),C.glass);
  if(right)panel(p,400,137,72,31,12,.19);else panel(p,8,151,72,31,8,-.19);
  q(shape([[12,184],[84,166],[94,180],[21,206]]),C.cream);
  // Slim fascia instruments: two colored bars on the cream, never a black
  // panel background that reads as a stray dark wedge at distance.
  if(right){l(399,174,459,189,'#c08b52');l(399,176,459,191,'#9d8ec4');}
  else{l(20,190,80,175,'#c08b52');l(20,192,80,177,'#9d8ec4');}
  // Continuous wall below the worktop: broad angled light diffuser, not a
  // thin stripe on a freestanding console. The pale fascia is a TNG landmark.
  q(shape([[21,207],[93,182],[91,207],[31,237]]),'#a79d88');
  q(shape([[26,211],[88,190],[87,207],[33,233]]),'#d8ddcb');
  q(shape([[29,213],[85,194],[84,206],[35,229]]),'#f4f5e6');
 }
 p.c.restore();
}

const TABLE_READOUT=freeze({x:218,y:195,width:54,height:12});
function table(p){
 const {poly:q,rect:r,line:l,oval:o}=p,glass='#000000';
 o(247,273,70,9,'#273d4540');
 // Two separate pedestal masses, not a single rectangular cabinet.
 q([[211,206],[278,206],[277,229],[262,235],[224,235],[211,228]],'#8b8575');
 q([[205,248],[288,248],[282,275],[270,280],[221,280],[207,274]],'#a59b87');
 q([[211,250],[275,250],[273,277],[221,277],[211,272]],'#c6bba4');
 r(225,253,37,23,'#55574e');r(228,255,31,19,C.glass);
 for(let j=0;j<4;j++){r(231,257+j*4,2,2,'#90bbaa');r(237,257+j*4,4,1,'#769797');r(249,257+j*4,6,2,j%2?'#b6c19a':'#729d91');}
 // Far and near octagons join through a visibly pinched waist.
 const rim=[[216,188],[275,188],[291,196],[291,206],[273,216],[273,221],[305,233],[305,249],[286,261],[207,261],[184,249],[184,233],[215,221],[215,216],[198,206],[198,197]];
 q(rim.map(([x,y])=>[x,y+5]),'#736e64');q(rim,C.cream);
 q([[217,191],[274,191],[287,198],[287,205],[268,215],[268,224],[300,235],[300,247],[284,257],[210,257],[189,247],[189,235],[220,224],[220,213],[202,204],[202,199]],glass);
 trace(p,[[217,193],[273,193],[284,199],[284,204],[264,215]],'#adbdaf');
 trace(p,[[220,226],[193,237],[193,246],[212,254],[283,254],[296,246],[297,237],[272,226]],'#c6d0b8');
 // A smaller right-handed elbow distinguishes this readout from the walls.
 // Mirror integer column runs without scaling away one-pixel strokes, and map
 // its local dark ink to the same true black as the whole tabletop.
 const {x:rx,y:ry,width:rw,height:rh}=TABLE_READOUT;
 drawLcarsPanel({rect:(x,y,w,h,color)=>r(rx+rw-x-w,ry+y,w,h,color==='#101218'?glass:color)},0,0,rw,rh,{seed:36,variant:'power'});
 // A segmented LCARS directional pad and two capsule buttons, with generous
 // black space around them. Decorative readout only, not new interaction.
 o(206,241,5,4,'#91cde5');
 l(206,237,206,245,glass);l(201,241,211,241,glass);
 o(206,241,2,2,glass);o(206,241,1,1,'#91cde5');
 for(const [y,color]of [[237,'#d8c788'],[243,'#b9a3d6']]){
  r(216,y,3,3,color);r(215,y+1,5,1,color);
 }
 // Flat dorsal systems plan, not a perspective illustration of the ship.
 // Bow left (90° CCW); only the tabletop foreshortens the diagram vertically.
 // Broad saucer, compact connected hull and short, parallel nacelles. All
 // outlines/circuit traces are one art pixel, with black space between them.
 // Draw directly on the inset glass: no rectangular clearing mask protruding
 // through the chamfered top-right corner or erasing the table's border.
 const outline='#c4d4d7',circuit='#537d9d',highlight='#86b3ce',gold='#baaa65';
 trace(p,[[225,241],[226,237],[230,233],[236,231],[244,231],[250,233],[254,237],[255,241],[254,245],[250,249],[244,251],[236,251],[230,249],[226,245],[225,241]],outline);
 // Mirrored machinery above/below the centerline, connected at the stern.
 for(const side of [-1,1]){
  const path=(points,color)=>trace(p,points.map(([x,y])=>[x,241+side*y]),color);
  path([[254,4],[259,3],[264,6],[276,6],[279,5],[279,0]],outline);
  path([[261,7],[260,8],[261,10],[279,10],[281,9],[281,7],[280,6],[262,6],[261,7]],outline);
  path([[264,8],[278,8]],highlight);
  path([[253,2],[269,2],[274,0]],highlight);
  path([[256,4],[266,4],[271,6]],circuit);
  // Orthogonal subsystem routes, not a filled hull or decorative belly arc.
  path([[227,2],[233,2],[233,7],[237,7],[237,3]],circuit);
  path([[229,5],[231,5],[231,3]],highlight);
  path([[241,3],[241,8],[246,8],[246,5],[251,5]],circuit);
  path([[245,2],[249,2],[249,6]],highlight);
  path([[235,9],[235,5]],circuit);
  r(234,241+side*5,3,1,gold);r(247,241+side*7,3,1,gold);
 }
 l(227,241,277,241,circuit);l(239,232,239,250,highlight);
 trace(p,[[239,239],[241,239],[242,241],[241,243],[239,243],[238,241],[239,239]],outline);
 r(240,241,1,1,highlight);
 // Small blue/gold readout blocks remain separate from the ship outline.
 r(224,230,3,1,gold);r(284,233,3,1,gold);r(284,235,2,1,highlight);
 r(224,252,3,1,gold);r(284,248,3,1,gold);r(284,250,2,1,highlight);
 // Double-sided sloping monitor at the waist, no misplaced rear-wall screen.
 q([[225,221],[238,202],[250,201],[269,220],[265,228],[225,228]],'#b7ae9c');
 q([[239,202],[250,202],[267,220],[239,220]],'#e1d6be');
 q([[227,220],[239,205],[239,220]],'#776e63');
 panel(p,244,211,15,8,22,0,'systems');
 l(227,225,265,225,C.ivory,2);l(207,261,286,261,'#ece0c4');
}

function engineeringFloor(p){
 const {rect:r,poly:q}=p,random=rng(3601);
 r(0,116,480,184,C.sand);
 // One blue carpet: wide foreground, lateral cross-aisle into both workbays,
 // then a narrower approach to the core. Faceted curves round the tan islands;
 // no overlapping green strips or a second border crossing the walkway.
 const carpet=[[76,300],[128,208],[126,205],[122,203],[116,202],[99,203],
  [100,186],[184,186],[193,184],[199,181],[206,172],[314,172],
  [318,181],[322,184],[329,186],[399,186],[398,203],[382,202],
  [376,203],[373,205],[371,208],[413,300]];
 q(carpet,'#526f89');
 // Quiet weave is clipped to that same silhouette, including the side arms.
 p.c.save();p.c.beginPath();carpet.forEach(([x,y],i)=>i?p.c.lineTo(x,y):p.c.moveTo(x,y));p.c.closePath();p.c.clip();
 for(let i=0;i<820;i++){const x=76+random()*337,y=172+random()*128;r(x,y,1,1,i%2?'#c3d4de0a':'#152b4412');}
 p.c.restore();
}

export function drawEngineering(ctx){
 const p=painter(ctx),{rect:r,poly:q,line:l}=p;
 r(0,0,480,300,'#4a4c48');
 engineeringFloor(p);
 // Near walls stop at the room transition, not at the core enclosure.
 q([[0,27],[94,55],[106,150],[102,187],[0,231]],'#a79b88');
 q([[480,27],[398,55],[385,150],[387,187],[480,231]],'#a79b88');
 q([[0,64],[94,66],[99,136],[0,199]],'#b6a993');
 q([[480,64],[398,66],[389,136],[480,199]],'#b6a993');
 chamber(p);
 // Wider room first; the nearer corridor ends hide its far sides.
 computerAccess(p);isolinearBay(p);workbaySoffit(p);
 // Continuous wall mass behind the inset equipment; the cutaway remains only
 // at the camera-facing edges. These bevels are wall contours, not free posts.
 q([[0,72],[90,73],[107,91],[100,165],[90,205],[25,239],[0,225]],'#aaa08b');
 q([[480,72],[398,73],[390,91],[387,165],[390,205],[455,239],[480,225]],'#aaa08b');
 q([[86,73],[99,87],[105,150],[98,181],[91,204],[85,207],[94,161],[90,95]],C.cream);
 // Overlap the adjacent cream facet by a pixel through the bend; a hairline
 // gap between separately rounded diagonals otherwise becomes a dashed seam.
 q([[399,73],[389,88],[383,149],[388,181],[389,204],[397,209],[394,163],[396,94]],C.cream);
 wallBays(p);wallBays(p,true);
 sideConsole(p);sideConsole(p,true);sideConsole(p,false,true);sideConsole(p,true,true);
 // Ceiling light lattice with repeated cream chamfer frames; preserve the tall
 // dark core opening rather than stretching a rear wall display across it.
 q([[0,0],[480,0],[358,58],[159,58]],'#77786e');
 for(const points of [
  [[31,5],[123,5],[163,24],[83,24]],[[143,5],[229,5],[238,24],[177,24]],[[251,5],[338,5],[311,24],[251,24]],[[357,5],[449,5],[393,24],[328,24]],
  [[88,33],[168,33],[193,48],[135,48]],[[186,33],[238,33],[242,48],[208,48]],[[253,33],[307,33],[292,48],[253,48]],[[322,33],[391,33],[354,48],[306,48]]
 ])q(points,'#e9ecdb');
 // Two corridor cross-members end at their wall shoulders. The next space
 // has a recessed level soffit, not another progressively smaller arch.
 for(const [left,right,top,shoulder] of [[9,471,0,42],[86,403,27,60]]){
  q([[left-8,shoulder+14],[left+16,top],[right-16,top],[right+7,shoulder+14],[right,shoulder+17],[right-22,top+8],[left+22,top+8],[left-1,shoulder+17]],'#7e776a');
  trace(p,[[left-6,shoulder+12],[left+18,top+3],[right-18,top+3],[right+4,shoulder+12]],C.cream,3);
 }

 coreBulkheadRim(p);
 // Camera-near wall cut edges retain the see-through composition, backed by
 // opaque faceted infill instead of an unsupported arch in front of equipment.
 q([[0,49],[7,49],[8,195],[18,212],[9,218],[0,203]],C.cream);
 q([[480,49],[473,49],[472,195],[462,212],[471,218],[480,203]],C.cream);
 table(p);
}

/** Only the table's near lip, x207–287/y260–265. Safe above the two SIDE
 * workstations; integrate at afterY=280 if using a global depth-layer cutoff.
 * Do not use this as an always-on mask for someone walking in front of the table.
 */
export function drawEngineeringForeground(ctx){
 const p=painter(ctx);p.poly([[207,260],[286,260],[282,265],[212,265]],'#afa38b');p.line(208,260,285,260,'#efe3c6');
}

export function drawEngineeringEffects(ctx,time,options={}){
 const p=painter(ctx),t=seconds(time),pulse=unit(options.pulse),diagnostic=unit(options.diagnostic);
 // Idle movement stays small and blue. time=0 yields a stable reduced-motion frame.
 // The ceiling is genuinely in front of the reactor's upper extension.
 // Match its static aperture; machinery must never paint over the hall roof.
 ctx.save();ctx.beginPath();ctx.rect(175,61,171,100);ctx.clip();hallCore(p,t,pulse);ctx.restore();
 rail(p);
 if(diagnostic>0){const y=235+Math.round(diagnostic*13);p.line(210,y,282,y,'#a4e5dc');p.rect(TABLE_READOUT.x+1,TABLE_READOUT.y+1,3,2,'#e9dac0');}
 // Fitted spots in the peripheral soffit; no hidden corridor lamps.
 if(options.night)for(const [x,y]of WORKBAY_SPOTS)p.oval(x,y,2,1,'#c4cabe');
}

// The chief's office is deeper in the complex: opaque fitted equipment, no
// observation window and no remote core glow. This furnishing is interpretation.
function officeSystemsWall(p){
 const {rect:r,line:l}=p;
 r(190,41,207,111,'#918779');
 for(const [x,w]of [[196,54],[254,82],[340,51]]){
  r(x,47,w,97,'#b9ae99');r(x+2,49,w-4,18,'#9b9486');
  l(x+3,69,x+w-4,69,'#e2d7bf');r(x+3,73,w-6,43,'#363e42');
  panel(p,x+5,75,w-10,39,x,0,x===254?'power':'systems');
  r(x+3,121,w-6,21,'#9b9586');l(x+5,123,x+w-6,123,'#ccc5af');
  r(x+7,132,8,2,'#595e59');
 }
 r(195,146,197,4,'#d5ceba');
}

function officeDesk(p){
 const {rect:r,poly:q,line:l}=p;
 q([[210,193],[337,193],[351,207],[342,220],[215,220],[203,209]],'#746e63');
 q([[216,215],[340,215],[335,224],[223,224]],'#a2957f');
 r(230,218,27,5,'#6e7166');r(297,218,25,5,'#6e7166');
 q([[211,187],[332,187],[351,202],[342,213],[216,213],[203,203]],C.cream);
 q([[215,191],[328,191],[342,202],[336,208],[219,208],[210,201]],C.glass);
 panel(p,220,194,109,12,47,0,'engineering');
 q([[274,191],[281,173],[313,173],[326,191]],'#776f63');
 q([[278,188],[284,176],[311,176],[320,188]],C.glass);panel(p,285,178,25,9,8);
 l(216,213,342,213,'#eee0c4');
 // One PADD; deliberately no unreferenced office memorabilia.
 q([[224,187],[237,187],[242,191],[229,191]],'#515e63');l(228,188,236,188,'#cbbf98');
}

export function drawChiefOffice(ctx){
 const p=painter(ctx),{rect:r,poly:q,line:l}=p;
 r(0,0,480,300,'#65665e');
 q([[0,144],[480,144],[480,300],[0,300]],C.sand);
 q([[103,157],[395,157],[454,300],[48,300]],'#577b7f');
 q([[128,168],[373,168],[415,300],[81,300]],'#5d8184');
 q([[0,21],[151,54],[407,54],[480,21],[480,178],[401,165],[103,164],[0,209]],'#ab9e88');
 r(178,32,231,131,'#7b7567');r(184,37,218,121,C.cream);officeSystemsWall(p);
 r(189,154,208,9,'#827e70');l(193,155,393,155,'#d6ceb6');
 // Annex entrance is intentionally neutral rather than turbolift ochre.
 q([[35,88],[44,78],[87,78],[96,90],[96,167],[35,177]],C.shade);
 q([[40,90],[47,83],[84,83],[91,91],[91,164],[40,172]],C.cream);
 door(p,CHIEF_OFFICE_PORTAL,0,true);
 r(98,111,4,22,C.glass);r(99,114,2,5,'#d3b27e');r(99,123,2,6,'#b1a0c6');
 // Practical secondary work bay; not a lounge or a invented second bridge.
 r(110,112,58,44,'#7a7262');panel(p,113,115,52,31,24);
 q([[107,151],[171,151],[178,165],[106,165]],C.cream);panel(p,111,154,59,7,29);
 q([[108,166],[175,166],[169,178],[114,178]],C.shade);
 // Small authored utility/tea recess. Its placement is interpretation, not canon.
 r(407,115,48,43,'#756f61');r(410,118,42,34,C.glass);r(414,121,34,23,'#29383e');
 r(415,143,33,3,'#93a0a0');r(413,148,36,4,'#ddd4ba');r(416,122,30,2,'#b5c4bd');
 panel(p,411,157,41,9,11);r(416,170,32,24,'#978d79');l(419,191,445,191,'#d6dfcf',2);
 // Ceiling: broad rectangular light coffers and chamfer corners.
 q([[0,0],[480,0],[415,44],[154,44]],'#787a6e');
 q([[30,4],[189,4],[207,26],[103,26]],'#e7ead8');q([[210,4],[337,4],[321,26],[220,26]],'#e7ead8');q([[359,4],[455,4],[417,26],[341,26]],'#e7ead8');
 trace(p,[[0,96],[22,53],[93,28],[410,28],[464,52],[479,99]],C.shade,10);
 trace(p,[[0,90],[24,48],[95,24],[410,24],[460,46],[479,92]],C.cream,5);
 trace(p,[[2,88],[27,49],[96,27],[409,27],[457,48],[477,91]],C.ivory);
 q([[0,202],[24,193],[37,212],[8,226],[0,219]],C.cream);l(4,211,26,201,'#e5eedc',3);
 q([[480,191],[463,186],[448,208],[474,221],[480,214]],C.cream);l(458,201,476,210,'#e5eedc',3);
 officeDesk(p);
}

/** A narrow desk edge, not the room. Use afterY=235; front-side standing crew
 * and the annex travel aisle should paint in front of it. */
export function drawChiefOfficeForeground(ctx){
 const p=painter(ctx);p.line(217,212,341,212,'#ede0c5',2);p.line(218,214,340,214,'#a59c89');
}
export function drawChiefOfficeEffects(ctx,time,options={}){
 const p=painter(ctx),t=seconds(time),tea=unit(options.tea),diagnostic=unit(options.diagnostic);
 door(p,CHIEF_OFFICE_PORTAL,options.door,true);
 if(diagnostic>0)p.line(223,196+Math.round(diagnostic*9),327,196+Math.round(diagnostic*9),'#a4ded6');
 if(tea>0){
  // Materialization is an ordered bounded response, never a timer or command.
  if(tea<.45){for(let i=0;i<5;i++)p.rect(424+(i*7)%17,131+(i*3)%12,2,1,'#aeeaff');}
  else{cup(p,428,137,'#e3d6b7');if(tea<.94){const step=t===0?0:Math.floor(t*2)%2;p.line(430,134,431+step,130,'#b5c5bd');p.rect(433-step,128,1,2,'#b5c5bd');}}
 }
 if(options.night)p.line(198,152,388,152,'#b1c4ba');
}
