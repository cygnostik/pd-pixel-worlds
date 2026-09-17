import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, createWorld, getTeamMembers } from '../src/world.js';

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
