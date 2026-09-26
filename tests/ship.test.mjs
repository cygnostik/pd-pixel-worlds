import test from 'node:test';
import assert from 'node:assert/strict';
import {createShip} from '../src/ship.js';
import {SHIP_ROOMS} from '../src/ship-layout.js';
const names=['bridge','engineering'];

test('release excludes the dormant office from layouts, restoration, actions and crew allocation',()=>{
 assert.deepEqual(Object.keys(SHIP_ROOMS),names);
 const ship=createShip({rooms:SHIP_ROOMS,storage:{get:()=>({room:'chief-office',night:true,energy:'quiet'})}});
 assert.equal(ship.getSnapshot().room,'bridge');assert.equal(ship.getSnapshot().night,true);
 const capacity=Object.values(SHIP_ROOMS).reduce((n,room)=>n+room.stations.length,0);
 ship.sync(crew(capacity+3));
 assert.equal(population(ship).counts.offstage,3);assert.equal(population(ship).counts['chief-office'],undefined);
 for(const room of names){ship.setRoom(room);assert.equal(ship.getFrame().items.length,SHIP_ROOMS[room].stations.length);}
 const before=ship.getSnapshot();
 assert.equal(ship.setRoom('chief-office'),false);assert.equal(ship.transfer('crew-0','chief-office').ok,false);assert.equal(ship.trigger('tea'),false);
 assert.equal(ship.getSnapshot(),before);balanced(ship);ship.dispose();
});
const rooms=Object.fromEntries(names.map((id,i)=>[id,{id,title:id,stations:Array.from({length:2},(_,n)=>({id:`${id}-${n}`,x:100+n*100,y:200,facing:'north',seated:id==='bridge',exitPath:[[100+n*100,250],[40,250],[40,160]]})),portal:{x:40,y:140,approach:[40,160],rect:[28,100,24,50]}}]));
const crew=n=>Object.freeze(Array.from({length:n},(_,slot)=>Object.freeze({id:`crew-${slot}`,slot,status:'active',verified:true})));
function clock(ship,seconds,mode='live',options={}){let stamp=ship.__testStamp||0;for(let t=0;t<seconds;t+=1/30){stamp+=1000/30;ship.tick(stamp,mode,options);}ship.__testStamp=stamp;}
const population=(ship,mode='live')=>ship.getSnapshot().populations[mode];
function balanced(ship,mode='live'){const p=population(ship,mode);assert.equal(Object.values(p.counts).reduce((a,b)=>a+b,0),p.total);assert.equal(new Set(p.locations.map(l=>l.id)).size,p.total);}

test('ship owns presentation only: stable locations survive roster order and status sorting',()=>{
 const ship=createShip({rooms});const agents=crew(5);ship.sync(agents);const first=population(ship).locations.map(l=>[l.id,l.room]);
 ship.sync([...agents].reverse());assert.deepEqual(population(ship).locations.map(l=>[l.id,l.room]),first);
 ship.sync(agents.map(a=>({...a,status:'waiting',attention:'error'})));assert.deepEqual(population(ship).locations.map(l=>[l.id,l.room]),first);
 assert.equal(agents[0].status,'active');balanced(ship);ship.dispose();
});
test('room capacity is real and every overflow agent remains located and counted',()=>{
 const ship=createShip({rooms});ship.sync(crew(10));balanced(ship);assert.equal(population(ship).counts.offstage,10-Object.values(rooms).reduce((n,room)=>n+room.stations.length,0));
 for(const room of names){ship.setRoom(room);assert.equal(ship.getFrame().items.length,2);}
 ship.sync(crew(3));balanced(ship);assert.equal(population(ship).total,3);ship.dispose();
});
test('one serial turbolift journey walks, opens doors, transits, arrives and preserves identity',()=>{
 const ship=createShip({rooms});ship.sync(crew(2));assert.equal(ship.transfer('crew-0','engineering').ok,true);assert.equal(ship.transfer('crew-1','engineering').ok,true);
 const phases=new Set();for(let i=0;i<2400;i++){clock(ship,1/30);const p=population(ship);for(const l of p.locations)if(l.id==='crew-0')phases.add(l.phase);balanced(ship);}
 assert.ok(phases.has('walking-out'));assert.ok(phases.has('opening'));assert.ok(phases.has('transit'));assert.ok(phases.has('walking-in'));assert.ok(phases.has('station'));
 assert.equal(population(ship).counts.engineering,2);assert.equal(population(ship).counts.transit,0);
 ship.setRoom('engineering');const items=ship.getFrame().items;assert.equal(new Set(items.map(i=>`${i.x},${i.y}`)).size,2);assert.ok(items.every(i=>i.agent.status==='active'&&!i.seated));ship.dispose();
});
test('duplicate ticks cannot speed up shared-view simulation; pause and hidden clocks freeze',()=>{
 const ship=createShip({rooms});ship.sync(crew(1));ship.transfer('crew-0','engineering');ship.tick(0);ship.tick(40);const once=ship.getFrame();ship.tick(40);assert.deepEqual(ship.getFrame(),once);
 ship.tick(80,'live',{paused:true});ship.tick(10000,'live',{paused:true});assert.deepEqual(ship.getFrame(),once);
 ship.tick(11000,'live',{hidden:true});ship.tick(15000,'live',{hidden:true});assert.deepEqual(ship.getFrame(),once);ship.dispose();
});
test('reduced motion settles travel without losing identity or leaving door reservations',()=>{
 const ship=createShip({rooms});ship.sync(crew(2));ship.transfer('crew-0','engineering');ship.transfer('crew-1','engineering');ship.tick(0,'live',{reducedMotion:true});
 assert.equal(population(ship).counts.engineering,2);assert.equal(population(ship).activeTripId,null);ship.setRoom('engineering');assert.ok(ship.getFrame().items.every(i=>!i.walking));balanced(ship);ship.dispose();
});
test('live and demonstration populations cannot remove or relocate each other',()=>{
 const ship=createShip({rooms});ship.sync(crew(3),'live');ship.sync([{id:'demo:1',status:'idle'}],'demo');ship.transfer('demo:1','engineering','demo');ship.tick(0,'demo',{reducedMotion:true});
 assert.equal(population(ship).total,3);assert.equal(population(ship,'demo').total,1);assert.equal(population(ship,'demo').counts.engineering,1);ship.sync([],'demo');assert.equal(population(ship).total,3);ship.dispose();
});
test('removing a traveler cancels its reservations and queued work without stranding other crew',()=>{
 const ship=createShip({rooms});const agents=crew(2);ship.sync(agents);ship.transfer('crew-0','engineering');ship.transfer('crew-1','engineering');clock(ship,2);ship.sync([agents[1]]);clock(ship,60);
 assert.equal(population(ship).total,1);assert.equal(population(ship).counts.engineering,1);assert.equal(population(ship).activeTripId,null);balanced(ship);ship.dispose();
});
test('toys change presentation only, reset is bounded, invalid controls are rejected',()=>{
 const storage=new Map();const ship=createShip({rooms,storage:{get:k=>storage.get(k),set:(k,v)=>storage.set(k,v)}});const agents=crew(2);ship.sync(agents);ship.set('night',true);ship.set('alert',true);ship.trigger('pulse');ship.trigger('diagnostic');assert.equal(ship.trigger('tea'),false);
 assert.equal(ship.getSnapshot().night,true);assert.equal(ship.getSnapshot().alert,undefined);assert.equal(ship.getFrame().effects.pulse,1);assert.equal(agents[0].status,'active');assert.equal(ship.set('status','error'),false);assert.equal(ship.set('alert',true),false);assert.equal(ship.setRoom('not-a-room'),false);assert.equal(ship.transfer('missing','engineering').ok,false);
 ship.trigger('reset');assert.equal(ship.getFrame().effects.pulse,0);ship.dispose();
});
test('playful idle visits use actual travel phases without changing observed job state',()=>{
 const ship=createShip({rooms});const agents=Object.freeze([Object.freeze({id:'idle',status:'idle',verified:true})]);ship.sync(agents);ship.set('energy','playful');
 const phases=new Set(),visited=new Set();for(let i=0;i<2700;i++){clock(ship,1/30);const row=population(ship).locations[0];phases.add(row.phase);visited.add(row.room);balanced(ship);}
 assert.ok(phases.has('walking-out'));assert.ok(phases.has('transit'));assert.ok(visited.has('engineering'));assert.ok(!visited.has('chief-office'));assert.equal(agents[0].status,'idle');ship.dispose();
});
test('attention cancels idle preparation immediately and retraces only completed travel',()=>{
 for(const travel of [0,1.2,2.1]){
  const ship=createShip({rooms});ship.sync([{id:'idle',status:'idle'}]);const origin=ship.getFrame().items[0];
  for(let n=0;n<600&&!population(ship).activeTripId;n++)clock(ship,1/30);
  if(travel)clock(ship,travel);const departure=ship.getFrame().items[0],outward=Math.hypot(departure.x-origin.x,departure.y-origin.y);
  ship.sync([{id:'idle',status:'waiting',attention:'waiting'}]);let farthest=0;
  for(let n=0;n<180;n++){clock(ship,1/30);const a=ship.getFrame().items[0];farthest=Math.max(farthest,Math.hypot(a.x-origin.x,a.y-origin.y));}
  assert.ok(farthest<=outward+1,'Attention never follows an unused outbound segment');assert.equal(population(ship).activeTripId,null);assert.equal(ship.getFrame().items[0].phase,'station');ship.dispose();
 }
});
test('off-camera access uses its actual approach direction without drawing a visible lift',()=>{
 const layouts={...rooms,engineering:{...rooms.engineering,portal:{x:40,y:340,approach:[40,294],rect:[28,336,24,50],offscreen:true}}},ship=createShip({rooms:layouts});
 ship.sync(crew(1));ship.set('energy','quiet');ship.setRoom('engineering');let emerging=false,crossing=false;
 for(const to of ['engineering','bridge']){
  ship.transfer('crew-0',to);
  for(let n=0;n<3000;n++){
   clock(ship,1/30);const f=ship.getFrame(),a=f.items.find(a=>a.agent.id==='crew-0');assert.equal(f.effects.door,0);
   if(a?.phase==='emerging'){emerging=true;assert.equal(a.facing,'north');}
   if(a?.phase==='crossing'){crossing=true;assert.equal(a.facing,'south');}
   if(!population(ship).activeTripId)break;
  }
 }
 assert.ok(emerging&&crossing);ship.dispose();
});
test('out-of-order RAF timestamps cannot run shared clocks twice',()=>{
 const ship=createShip({rooms});ship.sync(crew(1));ship.tick(0);ship.tick(40);ship.tick(20);ship.tick(80);assert.equal(ship.getFrame().time,.08);ship.dispose();
});
test('quiet stops automatic travel; idle routines never recruit active or attention-bearing crew',()=>{
 const ship=createShip({rooms});ship.sync([{id:'active',status:'active'},{id:'attention',status:'idle',attention:'waiting'},{id:'unverified',status:'idle',verified:false}]);const first=population(ship).locations.map(l=>[l.id,l.room]);clock(ship,90);assert.deepEqual(population(ship).locations.map(l=>[l.id,l.room]),first);
 ship.sync([{id:'idle',status:'idle'}]);ship.set('energy','quiet');const quiet=population(ship).locations[0].room;clock(ship,90);assert.equal(population(ship).locations[0].room,quiet);ship.set('energy','playful');clock(ship,90);assert.ok(ship.getSnapshot().revision>0);balanced(ship);ship.dispose();
});
