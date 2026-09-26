import test from 'node:test';
import assert from 'node:assert/strict';
import {SHIP_ROOMS} from '../src/ship-layout.js';
import {BRIDGE_ANCHORS} from '../src/art/bridge-scene.js';
import {createShip} from '../src/ship.js';
import {ENGINEERING_HOTSPOTS,CHIEF_OFFICE_HOTSPOTS} from '../src/art/engineering-scene.js';

// Authored ground footprints from the actual painters, not screen-space wall or
// tabletop silhouettes. Steps are walkable. Shadows are not solid furniture.
const engineering=[
 ['core-barrier',[[174,151],[346,151],[346,157],[326,164],[288,170],[230,170],[193,164],[174,157]]],
 ['table',[[216,188],[275,188],[291,196],[291,206],[273,216],[273,221],[305,233],[305,249],[286,261],[282,275],[270,280],[221,280],[207,274],[207,261],[184,249],[184,233],[215,221],[215,216],[198,206],[198,197]]],
 ['duty-port',[[135,150],[167,150],[164,162],[139,162]]],
 // Wider work bay bends sideways beyond the corridor end; the inner core
 // enclosure is separate from these outer bench/wall floor boundaries.
 ['workbay-port',[[88,152],[174,151],[163,161],[88,157]]],
 ['workbay-starboard',[[347,153],[420,150],[420,155],[385,160]]],
 ['core-jamb-port',[[170,151],[177,151],[170,159]]],
 ['core-jamb-starboard',[[343,150],[350,150],[350,157]]],
 ['duty-starboard',[[356,141],[387,145],[384,156],[358,155]]],
 ['wall-port',[[21,207],[93,182],[91,207],[31,237]]],
 ['wall-starboard',[[459,207],[387,182],[389,207],[449,237]]],
 ['near-port',[[0,260],[50,254],[57,258],[51,279],[0,298]]],
 ['near-starboard',[[480,260],[430,254],[423,258],[429,279],[480,298]]],
 ['wall-bevel-port',[[94,161],[98,181],[91,204],[85,207]]],
 ['wall-bevel-starboard',[[394,163],[390,181],[389,204],[397,209]]],
];
const office=[
 ['desk',[[210,193],[337,193],[351,207],[342,220],[335,224],[223,224],[215,220],[203,209]]],
 ['workbay',[[108,166],[175,166],[169,178],[114,178]]],
 ['utility',[[416,170],[448,170],[448,194],[416,194]]],
];
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const rail=[[117,211],[125,191],[143,173],[169,157],[200,147],[240,143],[280,147],[311,157],[337,173],[355,191],[363,211]];
const bridge=[
 ...[161,319].flatMap((center,i)=>{
  const side=i===0?-1:1,map=points=>points.map(([x,y])=>[center+side*x,y]);
  return [[`helm-${i}`,map([[17,248],[46,248],[43,276],[37,281],[21,281],[13,273]])],
   [`helm-foot-${i}`,map([[-37,281],[42,281],[46,285],[-39,285]])],
   [`helm-chair-${i}`,rect(center-5,250,10,26)]];
 }),
 ...[[240,190,1],[196,194,.9],[284,194,.9]].map(([x,y,s],i)=>[`command-chair-${i}`,rect(x-4*s,y,8*s,7*s)]),
 ...[-1,1].map(side=>[`command-${side<0?'port':'starboard'}`,[[61,178],[74,175],[87,187],[84,203],[66,201]].map(([x,y])=>[240+side*x,y])]),
 ['wall-port',[[0,202],[98,159],[98,163],[0,206]]],
 ['wall-starboard',[[480,202],[382,159],[382,163],[480,206]]],
 ...rail.slice(1).map(([x,y],i)=>{const [xx,yy]=rail[i];return [`rail-${i}`,[[xx,yy],[x,y],[x,y+5],[xx,yy+5]]];}),
 ['rail-support',[[201,146],[279,146],[270,157],[259,169],[251,179],[249,187],[231,187],[229,179],[221,169],[210,157]]],
];
const footprints={bridge,engineering,'chief-office':office};
const footRadius=6;
function pointSegmentDistance([x,y],[ax,ay],[bx,by]){
 const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}
function inside([x,y],poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
 const [a,b]=poly[i],[c,d]=poly[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)hit=!hit;
}return hit;}
function intersects(point,poly){return inside(point,poly)||poly.some((p,i)=>pointSegmentDistance(point,p,poly[(i+1)%poly.length])<footRadius-1e-7);}
function* samples(path){for(let i=1;i<path.length;i++){
 const [x,y]=path[i-1],[xx,yy]=path[i],steps=Math.max(1,Math.ceil(Math.hypot(xx-x,yy-y)*2));
 for(let j=0;j<=steps;j++)yield [x+(xx-x)*j/steps,y+(yy-y)*j/steps];
}}
function clear(point,obstacles,except=[]){for(const [name,poly]of obstacles)if(!except.includes(name))assert.ok(!intersects(point,poly),`${point} intersects ${name}`);}
function clearCrew(point,station,room){for(const other of room.stations)if(other!==station)assert.ok(Math.hypot(point[0]-other.x,point[1]-other.y)>=12-1e-7,`${station.id} at ${point} overlaps occupied ${other.id}`);}

// Explicit, narrow seating exceptions; never exempt a whole outbound route.
// Helm's bent-knee anchor is in the open knee space beside its own outer support.
// stand releases 24px outward/9px aft behind that console's foreground mask, then
// all WALKING samples must clear that base. Command seats release their own
// pedestal on the first segment only. No other furniture/crew is exempted.
const commandRelease={'bridge-0':'command-chair-0','bridge-3':'command-chair-1','bridge-4':'command-chair-2'};
for(const [id,room]of Object.entries(SHIP_ROOMS))for(const direction of ['departure','arrival'])test(`${id}: ${direction} clears fixed furniture and every other occupied station`,()=>{
 for(const station of room.stations){
  const origin=station.stand||[station.x,station.y];
  const path=[origin,...station.exitPath,room.portal.approach,[room.portal.x,room.portal.y]];
  // Command seats' first segment is a bounded own-pedestal release, explicitly
  // checked below. Every other station starts testing at its real walk anchor.
  const walking=commandRelease[station.id]?path.slice(1):path;
  for(const p of samples(direction==='arrival'?[...walking].reverse():walking)){
   clear(p,footprints[id]);clearCrew(p,station,room);
  }
  if(commandRelease[station.id]){
   const release=path.slice(0,2);
   for(const p of samples(direction==='arrival'?release.reverse():release)){
    clear(p,bridge,[commandRelease[station.id]]);clearCrew(p,station,room);
   }
   clear(station.exitPath[0],bridge);
  }
 }
});

test('Engineering uses the clear near-left off-camera access, not the computer recess',()=>{
 const room=SHIP_ROOMS.engineering,{portal}=room;
 assert.deepEqual(portal,{x:120,y:374,approach:[120,294],rect:[103,338,35,67],offscreen:true});
 assert.ok(portal.rect[1]>=336,'whole aperture must be below the visible scene');
 assert.ok(portal.y-40>=300,'complete actor and badge disappear before transit');
 assert.deepEqual(room.stations.map(s=>[s.id,s.x,s.y]),[
  ['engineering-duty-port',149,169],['engineering-duty-starboard',363,163],
  ['engineering-wall-port',102,214],['engineering-wall-starboard',387,214],
  ['engineering-table-port',174,252],['engineering-table-starboard',316,252],
  ['engineering-service-port',70,279],['engineering-service-starboard',410,279],
 ]);
 for(const station of room.stations){
  assert.deepEqual(station.exitPath.at(-1),portal.approach);
  for(const point of samples([portal.approach,[portal.x,portal.y]])){clear(point,engineering);clearCrew(point,station,room);}
 }
 assert.ok(!ENGINEERING_HOTSPOTS.some(h=>h.action==='lift'));
 for(const id of ['engineering-computer-access','engineering-isolinear'])assert.equal(ENGINEERING_HOTSPOTS.find(h=>h.id===id)?.action,'diagnostic');
 assert.ok(!CHIEF_OFFICE_HOTSPOTS.some(h=>h.action==='pulse'||/window/.test(h.id)));
 assert.equal(CHIEF_OFFICE_HOTSPOTS.find(h=>h.id==='chief-office-systems-wall')?.action,'diagnostic');
});

test('outer workbay wall is checked while the widened cross-aisle remains open',()=>{
 const wall=engineering.find(([name])=>name==='workbay-port')[1];
 assert.ok(intersects([131,155],wall),'visible wall cannot silently vanish from collision testing');
 assert.ok([...samples([[118,155],[149,155]])].some(point=>intersects(point,wall)),'a direct walk through the return must fail');
 for(const point of samples([[110,177],[136,177]]))clear(point,engineering);
 for(const point of samples([[365,177],[379,177]]))clear(point,engineering);
});

test('helm chair releases are short, outward, reversible and never bypass other obstacles',()=>{
 const room=SHIP_ROOMS.bridge;
 for(const [id,slot,sign]of [['bridge-1',1,-1],['bridge-2',2,1]]){
  const station=room.stations.find(s=>s.id===id),seat=[station.x,station.y];
  assert.deepEqual(seat,BRIDGE_ANCHORS[slot],'legacy seated anchors must not move');
  assert.equal(station.seated,true);assert.deepEqual(station.stand,[seat[0]+sign*24,seat[1]-9]);
  assert.ok(!intersects(seat,bridge.find(([name])=>name===`helm-${slot-1}`)[1]),'helm knee space must remain clear of the outer support');
  for(const path of [[seat,station.stand],[station.stand,seat]])for(const point of samples(path)){
   clear(point,bridge,[`helm-${slot-1}`,`helm-chair-${slot-1}`]);clearCrew(point,station,room);
  }
  clear(station.stand,bridge);
 }
 assert.deepEqual(Object.values(SHIP_ROOMS).map(r=>r.stations.length),[7,8]);
});

test('real Engineering store departures and reversed arrivals clear a fully occupied roster',()=>{
 const agents=Array.from({length:Object.values(SHIP_ROOMS).reduce((n,room)=>n+room.stations.length,0)},(_,slot)=>({id:`geometry:${slot}`,slot,status:'active',verified:true}));
 for(const station of SHIP_ROOMS.engineering.stations){
  const ship=createShip({rooms:SHIP_ROOMS});ship.set('energy','quiet');ship.sync(agents);ship.setRoom('engineering');
  try{
   assert.equal(ship.getFrame().items.length,8);
   const traveler=ship.getFrame().items.find(a=>a.x===station.x&&a.y===station.y).agent.id;
   const vacancy=ship.getSnapshot().populations.live.locations.find(l=>l.room==='bridge').id;
   ship.sync(agents.filter(a=>a.id!==vacancy));let stamp=0;
   for(const destination of ['bridge','engineering']){
    assert.equal(ship.transfer(traveler,destination).ok,true);let walking=0,finished=false;
    for(let tick=0;tick<6000;tick++){
     ship.tick(stamp);stamp+=1000/60;
     const frame=ship.getFrame(),item=frame.items.find(a=>a.agent.id===traveler);
     if(item?.walking){
      walking++;clear([item.x,item.y],engineering);
      for(const other of frame.items.filter(a=>a.agent.id!==traveler))assert.ok(Math.hypot(item.x-other.x,item.y-other.y)>=12,`${station.id} ${item.phase} overlaps occupied crew`);
     }
     if(!ship.getSnapshot().populations.live.activeTripId){finished=true;break;}
    }
    assert.ok(finished,'journey must complete');assert.ok(walking>0,'must exercise actual moving poses');
   }
   assert.equal(ship.getFrame().items.length,8);
  }finally{ship.dispose();}
 }
});

test('real helm departures release continuously, walk clear and reseat after returning',()=>{
 const agents=Array.from({length:Object.values(SHIP_ROOMS).reduce((n,room)=>n+room.stations.length,0)},(_,slot)=>({id:`helm:${slot}`,slot,status:'active',verified:true}));
 for(const station of SHIP_ROOMS.bridge.stations.filter(s=>s.stand)){
  const ship=createShip({rooms:SHIP_ROOMS});ship.set('energy','quiet');ship.sync(agents);ship.setRoom('bridge');
  const traveler=ship.getFrame().items.find(a=>a.x===station.x&&a.y===station.y).agent.id;
  const vacancy=ship.getSnapshot().populations.live.locations.find(l=>l.room==='engineering').id;
  ship.sync(agents.filter(a=>a.id!==vacancy));let stamp=0;const phases=new Set();
  for(const destination of ['engineering','bridge']){
   assert.equal(ship.transfer(traveler,destination).ok,true);let previous=null,finished=false;
   for(let tick=0;tick<7000;tick++){
    ship.tick(stamp);stamp+=1000/60;const frame=ship.getFrame(),a=frame.items.find(a=>a.agent.id===traveler);
    if(a){
     phases.add(a.phase);if(previous)assert.ok(Math.hypot(a.x-previous.x,a.y-previous.y)<=3,'release and reseating cannot teleport');previous=a;
     if(a.walking){clear([a.x,a.y],bridge);for(const b of frame.items.filter(b=>b.agent.id!==traveler))assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=12);}
     if(a.phase==='preparing'||a.phase==='seating')assert.equal(a.seated,true,'chair release is a nonwalking seated gesture');
    }else previous=null;
    if(!ship.getSnapshot().populations.live.activeTripId){finished=true;break;}
   }
   assert.ok(finished);
  }
  assert.ok(phases.has('preparing')&&phases.has('seating')&&phases.has('walking-out')&&phases.has('walking-in'));
  const result=ship.getFrame().items.find(a=>a.agent.id===traveler);assert.equal(result.x,station.x);assert.equal(result.y,station.y);assert.equal(result.seated,true);ship.dispose();
 }
});
test('attention during a partial helm release reseats continuously without an outbound walk',()=>{
 const agents=[{id:'busy',slot:0,status:'active'},{id:'idle',slot:1,status:'idle'}],ship=createShip({rooms:SHIP_ROOMS});ship.sync(agents);let stamp=0;
 while(!ship.getSnapshot().populations.live.activeTripId&&stamp<30000){ship.tick(stamp);stamp+=1000/60;}
 for(let i=0;i<9;i++){ship.tick(stamp);stamp+=1000/60;}
 const station=SHIP_ROOMS.bridge.stations[1];let previous=ship.getFrame().items.find(a=>a.agent.id==='idle');assert.equal(previous.phase,'preparing');assert.ok(previous.x<station.x&&previous.x>station.stand[0]);
 ship.sync(agents.map(a=>a.id==='idle'?{...a,status:'waiting'}:a));assert.equal(ship.getFrame().items.find(a=>a.agent.id==='idle').x,previous.x,'status update must not jump back to the seat');
 for(let i=0;i<30;i++){
  ship.tick(stamp);stamp+=1000/60;const a=ship.getFrame().items.find(a=>a.agent.id==='idle');assert.equal(a.walking,false);assert.ok(a.x>=previous.x);assert.ok(Math.hypot(a.x-previous.x,a.y-previous.y)<=3);previous=a;
 }
 assert.equal(previous.x,station.x);assert.equal(previous.y,station.y);assert.equal(previous.phase,'station');ship.dispose();
});
test('regression controls detect the old diagonal helm walks and occupied duty crossing',()=>{
 for(const [seat,end,base]of [[[161,248],[100,269],'helm-0'],[[319,248],[381,269],'helm-1']]){
  const poly=bridge.find(([name])=>name===base)[1];
  assert.ok([...samples([seat,end])].some(p=>intersects(p,poly)&&Math.abs(p[0]-seat[0])>12),'old WALKING segment must be rejected beyond chair release');
 }
 assert.ok(Math.hypot(149-149,180-169)<12,'old engineering crossing must fail');
 const port=SHIP_ROOMS.engineering.stations.find(s=>s.id==='engineering-duty-port');
 assert.equal(port.facing,'north');assert.equal(port.x,149);assert.equal(port.y,169);
 const starboard=SHIP_ROOMS.engineering.stations.find(s=>s.id==='engineering-duty-starboard');
 for(const p of samples(starboard.exitPath))assert.ok(Math.hypot(p[0]-port.x,p[1]-port.y)>=23,'cross-aisle detour must leave visible clearance around the occupied port station');
});
