import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startPreview} from '../scripts/preview.mjs';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export {createWorld} from './src/world.js';export {createShip} from './src/ship.js';export {SHIP_ROOMS} from './src/ship-layout.js';export {drawAgent} from './src/art/characters.js';export {drawBridgeRail} from './src/art/bridge-scene.js';",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'browser'});
const server=await startPreview(),browser=await chromium.launch({headless:true});
const out=new URL('../evidence/tng-rc/runtime-geometry/',import.meta.url);await mkdir(out,{recursive:true});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(server.url);
 const captures=await page.evaluate(async code=>{
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));const {createWorld,createShip,SHIP_ROOMS,drawAgent,drawBridgeRail}=await import(url);URL.revokeObjectURL(url);
  const captures=[],agents=Array.from({length:Object.values(SHIP_ROOMS).reduce((n,room)=>n+room.stations.length,0)},(_,slot)=>({id:`render-geometry:${slot}`,slot,status:'active',verified:true}));
  // Empty-room checks catch floor/layer defects hidden by seated crew.
  {
   const ship=createShip({rooms:SHIP_ROOMS}),canvas=document.createElement('canvas'),world=createWorld(canvas,{ship});
   world.resize(960,600,1);world.update({theme:'bridge',agents:[],paused:true});ship.set('energy','quiet');world.render();
   const pixel=(x,y)=>[...canvas.getContext('2d').getImageData(x*2,y*2,1,1).data].slice(0,3).join(',');
   for(const [x,y]of [[240,211],[240,221],[220,216],[260,216]])if(pixel(x,y)!=='145,104,99')throw new Error('Command carpet is interrupted by a grey inset or raised front rim');
   if(pixel(240,151)!=='227,200,160'||pixel(240,162)!=='173,139,107')throw new Error('Tactical support or rail covers the empty captain’s chair back');
   world.destroy();ship.dispose();
  }
  // Ordinary staffing must show the core watch and aft operators, not side bays.
  {
   const ship=createShip({rooms:SHIP_ROOMS}),canvas=document.createElement('canvas'),world=createWorld(canvas,{ship});
   world.resize(960,600,1);world.update({theme:'bridge',agents:agents.slice(0,12),paused:true});ship.set('energy','quiet');world.render();
   const frame=ship.getFrame(),stations=frame.items.map(a=>SHIP_ROOMS.bridge.stations[a.index]);
   if(!stations.some(s=>s.id==='bridge-tactical')||stations.filter(s=>s.id.startsWith('bridge-aft-')).length!==3||stations.some(s=>['bridge-5','bridge-6'].includes(s.id)))throw new Error('Normal bridge watch is not at its duty stations');
   captures.push({name:'bridge-duty-watch',stations:stations.map(s=>s.id),image:canvas.toDataURL()});
   world.destroy();ship.dispose();
  }
  // Exercise the aft-starboard crossing with tactical occupied in both directions.
  {
   const ship=createShip({rooms:SHIP_ROOMS}),canvas=document.createElement('canvas'),world=createWorld(canvas,{ship});
   world.resize(960,600,1);world.update({theme:'bridge',agents,paused:true});ship.set('energy','quiet');
   const station=SHIP_ROOMS.bridge.stations.find(s=>s.id==='bridge-aft-starboard');
   const id=ship.getFrame().items.find(a=>a.x===station.x&&a.y===station.y).agent.id;
   const vacancy=ship.getSnapshot().populations.live.locations.find(l=>l.room==='engineering').id;
   ship.sync(agents.filter(a=>a.id!==vacancy));let stamp=0,crossings=0;
   for(const destination of ['engineering','bridge']){
    if(!ship.transfer(id,destination).ok)throw new Error('Aft transfer rejected');
    let captured=false;
    for(let tick=0;tick<7000;tick++){
     ship.tick(stamp);stamp+=1000/60;
     const frame=ship.getFrame(),a=frame.items.find(a=>a.agent.id===id);
     if(a?.walking){
      for(const other of frame.items.filter(a=>a.agent.id!==id))if(Math.hypot(a.x-other.x,a.y-other.y)<12)throw new Error('Aft traveler overlaps occupied crew');
      if(!captured&&a.x===256&&a.y===166){
       world.render();
       const pixel=[...canvas.getContext('2d').getImageData(512,330,1,1).data];
       const rail=document.createElement('canvas');rail.width=480;rail.height=300;drawBridgeRail(rail.getContext('2d'));
       const expected=[...rail.getContext('2d').getImageData(256,165,1,1).data];
       if(expected[3]!==255||pixel.join(',')!==expected.join(','))throw new Error(`Aft boots paint over the rail/chair layer: ${pixel}`);
       captures.push({name:`bridge-aft-crossing-${destination}`,point:[a.x,a.y],image:canvas.toDataURL()});captured=true;crossings++;
      }
     }
     if(!ship.getSnapshot().populations.live.activeTripId)break;
    }
   }
   if(crossings!==2)throw new Error('Missing aft crossing in either direction');
   world.destroy();ship.dispose();
  }
  for(const index of [1,2]){
   const ship=createShip({rooms:SHIP_ROOMS}),canvas=document.createElement('canvas'),world=createWorld(canvas,{ship});
   world.resize(960,600,1);world.update({theme:'bridge',agents,paused:true});ship.set('energy','quiet');
   const station=SHIP_ROOMS.bridge.stations[index],id=ship.getFrame().items.find(a=>a.x===station.x&&a.y===station.y).agent.id;
   const vacancy=ship.getSnapshot().populations.live.locations.find(l=>l.room==='engineering').id;ship.sync(agents.filter(a=>a.id!==vacancy));let stamp=0;const seen=new Set();
   for(const destination of ['engineering','bridge']){
    ship.transfer(id,destination);
    for(let tick=0;tick<7000;tick++){
     ship.tick(stamp);stamp+=1000/60;const a=ship.getFrame().items.find(a=>a.agent.id===id);
     if(a){
      const delta=Math.abs(a.x-station.x);let name;
      if(a.phase==='preparing'&&delta>=10&&delta<=16)name='release';
      if(a.phase==='walking-out'&&a.y===239&&Math.abs(a.x-station.stand[0])>=15)name='lateral';
      if(index===2&&a.phase==='walking-out'&&a.y===294&&Math.abs(a.x-319)<=1)name='bottom-aisle';
      if(a.phase==='seating'&&delta>=10&&delta<=16)name='reseat';
      if(name&&!seen.has(name)){
       world.render();let depthVerified=false;
       if(name==='bottom-aisle'){
        const sprite=document.createElement('canvas');sprite.width=480;sprite.height=300;drawAgent(sprite.getContext('2d'),a,'bridge',0,false);
        const expected=[...sprite.getContext('2d').getImageData(a.x,a.y-20,1,1).data],actual=[...canvas.getContext('2d').getImageData(a.x*2,(a.y-20)*2,1,1).data];
        if(expected[3]!==255||expected.join(',')!==actual.join(','))throw new Error('Helm foreground hides the bottom-aisle walker’s torso');depthVerified=true;
       }
       captures.push({name:`bridge-${index}-${name}`,phase:a.phase,point:[a.x,a.y],depthVerified,image:canvas.toDataURL()});seen.add(name);
      }
     }
     if(!ship.getSnapshot().populations.live.activeTripId)break;
    }
   }
   for(const key of ['release','lateral','reseat',...(index===2?['bottom-aisle']:[])])if(!seen.has(key))throw new Error(`Missing actual journey capture ${index}:${key}`);
   world.destroy();ship.dispose();
  }
  return captures;
 },outputFiles[0].text);
 for(const {name,image} of captures)await writeFile(new URL(`${name}.png`,out),Buffer.from(image.split(',')[1],'base64'));
 assert.deepEqual(errors,[]);await writeFile(new URL('results.json',out),JSON.stringify({boundary:'Real createShip movement + createWorld Canvas2D renderer; fixture crew, deterministic clock, no pose overrides.',captures:captures.map(({image,...c})=>c),errors},null,2));
 console.log(`PASS continuous command carpet and unobscured captain’s chair; ${captures.length} actual helm release/walk/reseat captures; bottom-aisle torso remains in front of helm; no browser errors`);
}finally{await browser.close();await server.close();}
