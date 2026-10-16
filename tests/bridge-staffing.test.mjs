import test from 'node:test';
import assert from 'node:assert/strict';
import {createShip} from '../src/ship.js';
import {SHIP_ROOMS} from '../src/ship-layout.js';

test('bridge staffs tactical and aft computers before companion seats and side overflow',()=>{
 const ship=createShip({rooms:SHIP_ROOMS});ship.set('energy','quiet');
 const crew=Array.from({length:24},(_,slot)=>({id:`staff:${slot}`,slot,status:'active',verified:true}));
 for(let n=1;n<=crew.length;n++){
  ship.sync(crew.slice(0,n));
  const items=ship.getFrame().items,stations=items.map(a=>SHIP_ROOMS.bridge.stations[a.index]);
  if(items.length>=4)assert.ok(stations.some(s=>s.id==='bridge-tactical'),'tactical is part of the core watch');
  if(items.length>=5)assert.ok(stations.some(s=>s.id.startsWith('bridge-aft-')),'rear computers precede companion chairs');
  if(items.length>=7)assert.equal(stations.filter(s=>s.id.startsWith('bridge-aft-')).length,3);
  if(stations.some(s=>['bridge-5','bridge-6'].includes(s.id)))assert.equal(items.length>=10,true,'side bays are overflow only');
 }
 ship.dispose();
});
