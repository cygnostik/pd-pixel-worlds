import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, createWorld, getTeamMembers } from '../src/world.js';
import { ANCHORS } from '../src/art/scenes.js';
import {createShip} from '../src/ship.js';
import {SHIP_ROOMS} from '../src/ship-layout.js';

test('imported realm descriptors retain selection, bridge seats, custom anchors and builtin fallback',()=>{
 const {canvas}=fakeCanvas(),w=createWorld(canvas);
 const agents=Array.from({length:12},(_,slot)=>({id:`crew-${slot}`,slot,status:['active','waiting','error','done','idle','unknown'][slot%6]}));
 w.update({theme:'bridge',agents,selectedId:'crew-1',reducedMotion:true});const builtin=w.getAgentRegions();
 const realm={id:'import:test-bridge',characterStyle:'bridge',background:{image:'background'},anchors:ANCHORS.bridge,layers:[{afterY:160,image:{image:'rail'}},{afterY:300,image:{image:'helm'}}]};
 w.update({theme:realm.id,realm});assert.equal(w.getMetrics().theme,realm.id);assert.deepEqual(w.getAgentRegions(),builtin);
 w.update({agents:[...agents,{id:'extra'}],selectedId:'extra'});assert.ok(w.getAgentRegions().some(r=>r.id==='extra'));
 w.update({theme:'cafe',realm:null});assert.equal(w.getMetrics().theme,'cafe');assert.equal(w.getMetrics().total,13);
 w.update({theme:realm.id,realm});w.update({realm:null});assert.equal(w.getMetrics().theme,'office');
 w.update({theme:'office',realm:{...realm,id:'office'}});assert.equal(w.getMetrics().theme,'office');w.destroy();
});

function fakeCanvas() {
  const calls=[]; const listeners=new Map();
  const ctx=new Proxy({ calls, measureText:s=>({width:s.length*6}) },{get(o,k){return k in o?o[k]:(...args)=>calls.push([k,...args]);},set(o,k,v){o[k]=v;return true;}});
  const canvas={width:960,height:600,style:{},getContext:()=>ctx,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k),getBoundingClientRect:()=>({left:10,top:20,width:960,height:600}),ownerDocument:{createElement:()=>fakeCanvas().canvas}};
  return {canvas,ctx,listeners};
}
test('three live art themes and honest capacity, without input mutation',()=>{
  assert.deepEqual(THEMES.map(t=>t.id),['office','cafe','bridge']);
  const {canvas}=fakeCanvas(); const w=createWorld(canvas);
  const agents=Object.freeze(Array.from({length:15},(_,i)=>Object.freeze({id:`a${i}`,name:`Agent ${i}`,status:'active'})));
  w.update({agents,selectedId:'a14',theme:'cafe',reducedMotion:true});
  assert.equal(w.getMetrics().total,15); assert.equal(w.getMetrics().visible,12); assert.equal(w.getMetrics().overflow,3);
  assert.ok(w.getAgentRegions().some(r=>r.id==='a14'));
  w.update({theme:'bridge'}); assert.equal(w.getMetrics().total,15); w.destroy();
});
test('aft-facing bridge keeps all twelve station hit targets distinct after resize',()=>{
 const {canvas}=fakeCanvas(),w=createWorld(canvas);
 const agents=Array.from({length:12},(_,slot)=>({id:`crew-${slot}`,slot,name:`Crew ${slot}`,status:'active'}));
 w.update({theme:'bridge',agents,reducedMotion:true,selectedId:'crew-1'});
 for(const [width,height,dpr] of [[960,600,1],[600,600,2],[1440,700,3]]){
  w.resize(width,height,dpr);const regions=w.getAgentRegions();assert.equal(regions.length,12);
  for(const r of regions)assert.equal(w.hitTest(r.x+r.width/2,r.y+r.height/2),r.id);
 }
 w.update({theme:'cafe'});w.update({theme:'bridge'});assert.equal(w.getMetrics().total,12);assert.equal(w.getMetrics().backgroundBuilds,3);w.destroy();
});
test('bats require at least two active members of a real parent link',()=>{
  assert.deepEqual([...getTeamMembers([{id:'a',status:'active'},{id:'b',status:'active'}])],[]);
  assert.deepEqual([...getTeamMembers([{id:'p',status:'active'},{id:'c',parentId:'p',status:'active'},{id:'w',parentId:'p',status:'waiting'}])],['p','c']);
  assert.deepEqual([...getTeamMembers([{id:'x',parentId:'p',status:'active'},{id:'y',parentId:'p',status:'error'}])],[]);
});
test('shared ship rooms preserve full roster, scaled hit targets and static reduced-motion transfers',()=>{
 const ship=createShip({rooms:SHIP_ROOMS}),{canvas,listeners}=fakeCanvas(),w=createWorld(canvas,{ship});
 const agents=Array.from({length:27},(_,slot)=>({id:`crew-${slot}`,slot,status:'active'}));
 w.update({theme:'bridge',agents,reducedMotion:true});
 assert.equal(w.getMetrics().total,27);assert.equal(w.getMetrics().overflow,agents.length-Object.values(SHIP_ROOMS).reduce((n,room)=>n+room.stations.length,0));
 for(const room of Object.keys(SHIP_ROOMS)){
  ship.setRoom(room);w.resize(600,600,2);assert.equal(w.getMetrics().visible,SHIP_ROOMS[room].stations.length);
  for(const r of w.getAgentRegions())assert.equal(w.hitTest(r.x+r.width/2,r.y+r.height/2),r.id);
  for(const r of w.getSceneRegions())assert.ok([r.x,r.y,r.width,r.height].every(Number.isFinite));
 }
 const before=ship.getSnapshot().populations.live.locations.map(l=>[l.id,l.room]);
 w.update({theme:'office',agents:agents.slice(12,24)});w.update({theme:'bridge',agents});
 assert.deepEqual(ship.getSnapshot().populations.live.locations.map(l=>[l.id,l.room]),before);
 w.update({agents:agents.slice(0,2)});assert.equal(ship.transfer('crew-0','engineering').ok,true);
 assert.equal(ship.getSnapshot().populations.live.activeTripId,null);assert.equal(ship.getSnapshot().populations.live.counts.engineering,1);
 ship.setRoom('engineering');const hotspot=w.getSceneRegions().find(r=>r.action==='pulse');
 listeners.get('pointerdown')({clientX:10+(hotspot.x+hotspot.width/2)*960/600,clientY:20+(hotspot.y+hotspot.height/2)});
 assert.equal(ship.getFrame().effects.pulse,1);
 w.destroy();assert.equal(ship.getSnapshot().populations.live.total,2);ship.dispose();
});
test('DPR-independent hit testing and cleanup',()=>{
  const {canvas,listeners}=fakeCanvas(); let selected=null;const w=createWorld(canvas,{onSelect:id=>selected=id});
  w.resize(960,600,2);w.update({agents:[{id:'a',name:'Alpha',status:'waiting'}],reducedMotion:true});
  const r=w.getAgentRegions()[0]; assert.equal(w.hitTest(r.x+r.width/2,r.y+r.height/2),'a');
  listeners.get('pointerdown')({clientX:10+r.x+r.width/2,clientY:20+r.y+r.height/2});assert.equal(selected,'a');
  assert.equal(canvas.width,1920);assert.equal(w.hitTest(-1,-1),null);w.destroy();assert.equal(listeners.size,0);
});
test('30fps budget, background reuse, static and hidden lifecycle',()=>{
  const {canvas}=fakeCanvas();const scheduled=new Map();let clock=0,next=1;
  canvas.ownerDocument.defaultView={performance:{now:()=>clock},requestAnimationFrame:fn=>{const id=next++;scheduled.set(id,fn);return id;},cancelAnimationFrame:id=>scheduled.delete(id)};
  const w=createWorld(canvas);w.update({agents:[{id:'a',status:'active'}]});const before=w.getMetrics().frames;
  for(let i=0;i<120;i++){clock=i*1000/120;const pending=[...scheduled.values()];scheduled.clear();for(const fn of pending)fn(clock);}
  const rendered=w.getMetrics().frames-before;assert.ok(rendered>=28&&rendered<=31,`${rendered} rendered frames in one second`);
  for(const theme of ['cafe','bridge','office','cafe'])w.update({theme});assert.equal(w.getMetrics().backgroundBuilds,3);
  w.update({paused:true});assert.equal(scheduled.size,0);const pausedFrames=w.getMetrics().frames;
  w.setVisible(false);w.update({selectedId:'a'});assert.equal(w.getMetrics().frames,pausedFrames);assert.equal(w.hitTest(0,0),null);
  w.setVisible(true);w.update({paused:false,reducedMotion:true});assert.equal(scheduled.size,0);
  w.update({reducedMotion:false});assert.equal(scheduled.size,1);w.destroy();assert.equal(scheduled.size,0);
});
test('inactive consumers cannot stall a visible shared ship; last-driver pause and teardown freeze it',()=>{
 const ship=createShip({rooms:SHIP_ROOMS}),scheduled=new Map();let clock=0,next=1;
 const host={performance:{now:()=>clock},requestAnimationFrame:fn=>{const id=next++;scheduled.set(id,fn);return id;},cancelAnimationFrame:id=>scheduled.delete(id)};
 const a=fakeCanvas().canvas,b=fakeCanvas().canvas;a.ownerDocument.defaultView=host;b.ownerDocument.defaultView=host;
 const visible=createWorld(a,{ship}),inactive=createWorld(b,{ship});const agents=[{id:'a',status:'active'}];
 visible.update({theme:'bridge',agents});inactive.update({theme:'bridge',agents,paused:true});ship.transfer('a','engineering');
 for(let n=0;n<150;n++){const data=agents.map(a=>({...a,detail:`event ${n}`}));visible.update({agents:data});inactive.update({agents:data});clock+=40;const pending=[...scheduled.values()];scheduled.clear();pending.forEach(fn=>fn(clock));}
 assert.ok(ship.getFrame().time>5.8,'Hidden stream updates cannot rebase the active clock');assert.notEqual(ship.getSnapshot().populations.live.locations[0].phase,'preparing');
 visible.update({paused:true});const frozen=ship.getFrame();clock+=60000;inactive.update({agents:agents.map(a=>({...a,detail:'event 149'}))});assert.deepEqual(ship.getFrame(),frozen);
 visible.update({paused:false});assert.deepEqual(ship.getFrame(),frozen,'Resume rebases without catch-up');visible.destroy();inactive.destroy();assert.equal(scheduled.size,0);ship.dispose();
});
test('streaming event bursts cannot bypass the animation frame budget',()=>{
 const {canvas}=fakeCanvas();const scheduled=new Map();let clock=0,next=1;
 canvas.ownerDocument.defaultView={performance:{now:()=>clock},requestAnimationFrame:fn=>{const id=next++;scheduled.set(id,fn);return id;},cancelAnimationFrame:id=>scheduled.delete(id)};
 const w=createWorld(canvas);w.update({agents:[{id:'a',status:'active'}]});const before=w.getMetrics().frames;
 for(let i=0;i<120;i++){clock=i*1000/120;w.update({agents:[{id:'a',status:'active',detail:`event ${i}`}]});const pending=[...scheduled.values()];scheduled.clear();for(const fn of pending)fn(clock);}
 assert.ok(w.getMetrics().frames-before<=32,'stream updates must not force extra paint calls');w.destroy();
});
test('letterboxed resized hit regions and relationship interruption',()=>{
  const {canvas}=fakeCanvas();const w=createWorld(canvas);
  w.resize(600,600,3);w.update({agents:[{id:'p',status:'active'},{id:'c',status:'active',parentId:'p'}],reducedMotion:true});
  assert.deepEqual(w.getMetrics().teamwork.participants,['p','c']);
  const r=w.getAgentRegions()[0];assert.ok(r.y>100);assert.equal(w.hitTest(r.x+10,r.y+10),'p');
  w.update({agents:[{id:'p',status:'active'},{id:'c',status:'waiting',parentId:'p'}]});assert.equal(w.getMetrics().teamwork,null);assert.equal(w.getAgentRegions().some(r=>r.team),false);
  w.update({agents:[{id:'a',status:'unknown'},{id:'a',status:'active'}]});assert.equal(w.getMetrics().total,1);
  w.destroy();
});
