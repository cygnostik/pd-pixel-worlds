import test from 'node:test';
import assert from 'node:assert/strict';
import {drawWarpCore,drawHallCore} from '../src/art/warp-core.js';
const luminance=hex=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
function record(time=0,pulse=0,hall=false){const calls=[],p=Object.fromEntries(['rect','poly','oval','line'].map(k=>[k,(...args)=>calls.push([k,...args])]));(hall?drawHallCore:drawWarpCore)(p,time,pulse);return calls;}
const bands=time=>record(time).filter(([kind,x,y,w,h])=>kind==='rect'&&x===231&&w===56&&h===4);
const peak=(time,upper)=>bands(time).filter(b=>upper?b[2]<80:b[2]>128).sort((a,b)=>luminance(b[5])-luminance(a[5]))[0][2];
test('blue crests converge on the chamber from opposite ends instead of marching in one direction',()=>{
 const times=[0,.25,.5],upper=times.map(t=>peak(t,true)),lower=times.map(t=>peak(t,false));
 assert.ok(upper[0]<upper[1]&&upper[1]<upper[2]);assert.ok(lower.every((y,i)=>i===0||y<=lower[i-1])&&lower.at(-1)<lower[0],'The four lower pixel bands advance upward, with quantized holds');
});
test('core base stays darker than the moving cyan crest across a full cycle',()=>{
 let total=0,count=0,bright=0,rest=0;
 for(let t=0;t<2;t+=.05){const values=bands(t).map(b=>luminance(b[5])),mean=values.reduce((a,b)=>a+b,0)/values.length;total+=mean;count++;if(Math.max(...values)-mean>30)bright++;if(Math.max(...values)===Math.min(...values))rest++;}
 assert.ok(bright>0&&rest>0,'Moving bright packets alternate with a dim interval, rather than continuously wrapping');
 assert.ok(total/count<125,'The column must not return to a uniform near-white glow');
});
test('both red ducts overlap beneath the central collar; no detached right conduit',()=>{
 const calls=record(),ducts=calls.filter(([kind,x,y,w,h,color])=>kind==='rect'&&y===108&&h===14&&color==='#39293d');assert.equal(ducts.length,2);
 assert.ok(ducts[0][1]+ducts[0][3]>216);assert.ok(ducts[1][1]<303);assert.ok(ducts[1][1]+ducts[1][3]>328);
 const collar=calls.findIndex(([kind,x,y,w,h])=>kind==='rect'&&x===216&&y===97&&w===87&&h===24);
 for(const duct of ducts)assert.ok(calls.indexOf(duct)<collar,'collar must cover a physically continuous pipe end');
});
test('reduced-motion frames and projected effects are deterministic, bounded and independent',()=>{
 assert.deepEqual(record(),record());assert.notDeepEqual(record(),record(.3));assert.notDeepEqual(record(),record(0,1));
 for(const time of [0,.4,1.2])for(const [kind,...a]of record(time,1,true))if(kind==='rect'){const [x,y,w,h]=a;assert.ok(x>=175&&x+w<=346&&y>=43&&y+h<=162);}
});
