import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE,SURFACES,visibleSourceRect,safeContentRect,assertContentFits} from '../scripts/compose-catalog-media.mjs';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} ≠ ${expected}`);

test('catalog card keeps the full 2:1 source; wide detail crops top and bottom',()=>{
  assert.deepEqual(visibleSourceRect(SOURCE,SURFACES[0]),{left:0,top:0,right:1440,bottom:720});
  const wide=visibleSourceRect(SOURCE,SURFACES[1]);
  close(wide.top,132.06349206349205);close(wide.bottom,587.936507936508);
  assert.equal(wide.left,0);assert.equal(wide.right,1440);
});

test('same-ratio resizing preserves normalized clipping, not a fix',()=>{
  const a=visibleSourceRect(SOURCE,SURFACES[1]);
  const b=visibleSourceRect({width:1200,height:600},SURFACES[1]);
  close(a.top/720,b.top/600);close(a.bottom/720,b.bottom/600);
});

test('content checks reject an editorial title or footer outside the shared safe band',()=>{
  assert.throws(()=>assertContentFits([{name:'old top title',left:48,top:86,right:800,bottom:168}]),/escapes/);
  assert.throws(()=>assertContentFits([{name:'old bottom footer',left:48,top:662,right:1392,bottom:690}]),/escapes/);
  assert.doesNotThrow(()=>assertContentFits([{name:'centered content',left:144,top:160,right:1296,bottom:563}]));
});

test('destination intersection includes side cropping and preserves margin',()=>{
  const safe=safeContentRect(SOURCE,[...SURFACES,{name:'square',width:400,height:400}],24);
  assert.equal(safe.left,384);assert.equal(safe.right,1056);
  close(safe.top,156.06349206349205);close(safe.bottom,563.936507936508);
});

test('missing, hidden or invalid critical content cannot silently pass',()=>{
  assert.throws(()=>assertContentFits([]),/must be measured/);
  assert.throws(()=>assertContentFits([{name:'hidden',left:200,top:200,right:200,bottom:220}]),/must be visible/);
  assert.throws(()=>assertContentFits([{name:'invalid',left:NaN,top:200,right:400,bottom:220}]),/finite/);
  assert.throws(()=>visibleSourceRect(SOURCE,{width:0,height:100}),/positive/);
  assert.throws(()=>safeContentRect(SOURCE,[]),/destination/);
  assert.throws(()=>safeContentRect(SOURCE,SURFACES,-1),/nonnegative/);
});
