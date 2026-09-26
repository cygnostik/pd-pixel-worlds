import test from 'node:test';
import assert from 'node:assert/strict';
import { drawAgent, drawBadge, STATUS } from '../src/art/characters.js';

// Record actual painted pixels, including the renderer's translation/mirroring.
function surface() {
 const pixels=new Map(), stack=[];
 let transform={x:0,y:0,sx:1,sy:1};
 const ctx={fillStyle:'',save(){stack.push({...transform});},restore(){transform=stack.pop();},
  translate(x,y){transform.x+=x*transform.sx;transform.y+=y*transform.sy;},scale(x,y){transform.sx*=x;transform.sy*=y;},
  fillRect(x,y,w,h){for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++){
   const xx=transform.x+(x+dx)*transform.sx+(transform.sx<0?-1:0),yy=transform.y+(y+dy)*transform.sy+(transform.sy<0?-1:0);
   pixels.set(`${xx},${yy}`,this.fillStyle);
  }},fillText(){}};
 return {ctx,pixels};
}
const agent=Object.freeze({id:'fixture:crew',slot:1,name:'Crew',status:'active'});
const base={x:60,y:70,index:0,agent};
function render(fields={},time=0,theme='bridge',badge=false){const s=surface();if(badge)drawBadge(s.ctx,{...base,...fields},theme,false);else drawAgent(s.ctx,{...base,...fields},theme,time,false);return s.pixels;}
function region(pixels,x1,y1,x2,y2){return new Map([...pixels].filter(([key])=>{const [x,y]=key.split(',').map(Number);return x>=x1&&x<x2&&y>=y1&&y<y2;}));}
const legs=pixels=>region(pixels,35,58,85,70);
const head=pixels=>region(pixels,45,34,75,46);
const hasColor=(pixels,color)=>[...pixels.values()].includes(color);

test('explicit standing overrides imported bridge index seating; absent fields preserve the default',()=>{
 assert.deepEqual(render(),render({seated:true}));
 assert.notDeepEqual(legs(render()),legs(render({seated:false})));
 assert.deepEqual(render({index:8}),render({index:0,seated:false}));
 assert.deepEqual(render({index:8,seated:true}),render({index:0}));
});

test('north crew shows the back of head/uniform; side profiles face their panels',()=>{
 const north=render({facing:'north',seated:false}),south=render({facing:'south',seated:false});
 assert.notDeepEqual(head(north),head(south));
 assert.equal(hasColor(head(north),'#333139'),false,'no eyes on the back of the head');
 assert.equal(hasColor(north,'#e3d29d'),false,'no chest insignia on the back');
 const east=render({facing:'east',seated:false}),west=render({facing:'west',seated:false});
 assert.notDeepEqual(head(east),head(west));
 const eyeXs=pixels=>[...head(pixels)].filter(([,color])=>color==='#333139').map(([key])=>Number(key.split(',')[0]));
 assert.ok(eyeXs(east).every(x=>x>60)&&eyeXs(east).length>0);
 assert.ok(eyeXs(west).every(x=>x<60)&&eyeXs(west).length>0);
});

test('explicit walking takes precedence over seating, station work and status gestures',()=>{
 for(const facing of ['north','south','east','west'])for(const team of [false,true]){
  const fields={facing,pose:'walk',seated:true,team,atStation:true};
  assert.deepEqual(render(fields),render({...fields,seated:false}));
  for(const status of Object.keys(STATUS))assert.deepEqual(render(fields),render({...fields,agent:{...agent,status}}));
  assert.deepEqual(render(fields),render({...fields,pose:'padd',walking:true}));
  assert.equal(hasColor(render(fields),'#8b8e9b'),false,'no typing slab while walking');
  assert.notDeepEqual(render(fields,0),render(fields,.27),'walking animates when simulation time advances');
 }
});

test('PADD and inspection are distinct quiet poses, never agent state changes',()=>{
 for(const facing of ['north','south','east','west']){
  const fields={facing,seated:false,agent:Object.freeze({...agent,status:'idle'})};
  assert.notDeepEqual(render({...fields,pose:'padd'}),render({...fields,pose:'inspect'}));
  assert.notDeepEqual(render({...fields,pose:'work'}),render({...fields,pose:'padd'}));
  assert.equal(fields.agent.status,'idle');
  assert.deepEqual(render({...fields,pose:'padd'},0),render({...fields,pose:'padd'},0));
 }
});

test('appearance is slot/identity stable across pose, station index and direction',()=>{
 for(const facing of ['north','south','east','west'])for(const pose of ['work','padd','inspect','walk']){
  const fields={facing,pose,seated:false};
  assert.equal(hasColor(render(fields),'#c9a15c'),true,'gold division stays gold');
  assert.equal(hasColor(render(fields),'#332e2e'),true,'hair identity stays stable');
  assert.deepEqual(render({...fields,index:1}),render({...fields,index:11}));
 }
});

test('badges retain every truthful status and attention override independently of costume',()=>{
 const distinct=new Set();
 for(const status of Object.keys(STATUS)){
  const fields={agent:Object.freeze({...agent,status})},normal=render(fields,0,'bridge',true);
  assert.ok(hasColor(normal,STATUS[status].color));
  distinct.add(JSON.stringify([...normal]));
  for(const pose of ['work','padd','inspect','walk'])assert.deepEqual(normal,render({...fields,pose,facing:'north',ambient:true},0,'bridge',true));
 }
 assert.equal(distinct.size,6);
 assert.deepEqual(render({agent:{...agent,status:'active',attention:'error'}},0,'bridge',true),render({agent:{...agent,status:'error'}},0,'bridge',true));
 assert.equal(render({hideBadge:true,ambient:true},0,'bridge',true).size,0);
});

test('optional crew choreography leaves office and kittens unchanged',()=>{
 for(const theme of ['office','cafe'])for(const status of Object.keys(STATUS)){
  const fields={agent:{...agent,status}};
  assert.deepEqual(render(fields,.7,theme),render({...fields,facing:'north',pose:'padd',seated:true,ambient:true},.7,theme));
 }
});

test('zero-time crew frames are deterministic and contain no blinking eye animation',()=>{
 for(const facing of ['north','south','east','west'])for(const pose of ['work','padd','inspect','walk']){
  const fields=Object.freeze({...base,facing,pose,seated:false});
  assert.deepEqual(render(fields,0),render(fields,0));
  const eyes=[...head(render(fields,0)).values()].filter(color=>color==='#333139').length;
  assert.equal(eyes,facing==='north'?0:facing==='south'?8:4);
 }
});

test('explicit seating works in every direction and directional crew never inherit office team props',()=>{
 for(const facing of ['north','south','east','west']){
  assert.notDeepEqual(legs(render({facing,seated:true})),legs(render({facing,seated:false})));
  const fields={x:420,facing,seated:false,atStation:true};
  assert.deepEqual(render({...fields,team:true}),render({...fields,team:false}));
 }
});

test('invalid optional controls fall back safely; hiding a badge retains selected nameplate',()=>{
 assert.deepEqual(render(),render({facing:'diagonal',pose:'unknown',seated:'false',ambient:false}));
 assert.deepEqual(render({},0,'bridge',true),render({hideBadge:'true'},0,'bridge',true));
 const s=surface();drawBadge(s.ctx,{...base,hideBadge:true},'bridge',true);
 assert.ok(hasColor(s.pixels,'#313a38'),'selection label background survives');
 assert.equal(hasColor(s.pixels,STATUS.active.color),false);
});
