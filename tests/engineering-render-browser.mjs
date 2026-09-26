import {chromium} from 'playwright';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startPreview} from '../scripts/preview.mjs';
const {outputFiles}=await build({stdin:{contents:"export * from './src/art/engineering-scene.js';export {drawLcarsPanel} from './src/art/lcars.js';export {painter} from './src/art/pixels.js';export {createWorld} from './src/world.js';export {createShip} from './src/ship.js';export {SHIP_ROOMS} from './src/ship-layout.js';",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'browser'});
const server=await startPreview(),browser=await chromium.launch({headless:true});
const out=new URL('../evidence/tng-wall-contours/',import.meta.url);await mkdir(out,{recursive:true});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(server.url);
 const result=await page.evaluate(async code=>{
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'})),art=await import(url);URL.revokeObjectURL(url);
  const canvas=()=>{const c=document.createElement('canvas');c.width=480;c.height=300;return c;};
  const pixels=(c,rect)=>[...c.getContext('2d').getImageData(...rect).data];
  const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
  const check=(v,message)=>{if(!v)throw new Error(message);};
  const room=canvas(),ctx=room.getContext('2d'),labels=[];
  const originalText=ctx.fillText.bind(ctx);ctx.fillText=(text,...args)=>{labels.push(text);originalText(text,...args);};
  art.drawEngineering(ctx);
  // The old door-and-screen motif above the actual LCARS must not return.
  const plainWalls=[[26,94,42,23],[412,94,42,23]];
  for(const rect of plainWalls){const data=pixels(room,rect);check(data.every((v,i)=>i%4===3?v===255:v===[150,154,146][i%4]),'Upper corridor infill is no longer a plain gray wall');}
  // The outer workspaces recede under level ceilings, not two domed arches.
  for(const rect of [[121,70,10,6],[368,70,7,6]]){
   const data=pixels(room,rect);check(data.every((v,i)=>i%4===3?v===255:v===[85,91,81][i%4]),'Peripheral soffit is no longer level');
  }
  // Fixtures sit midway between the dark band's top and bottom, including
  // the two lamps nearest the arch; none hangs from the lower edge.
  for(const x of [112,139,162,359,382]){
   check(same(pixels(room,[x,73,1,1]),[243,236,220,255]),'A workbay light is not centered on its ceiling band');
   for(const y of [69,77])check(same(pixels(room,[x,y,1,1]),[85,91,81,255]),'A light lacks dark ceiling space above and below');
  }
  // The chamber backing stops at its casing; outside both feet is floor.
  for(const [x,y]of [[166,162],[354,160]])check(same(pixels(room,[x,y,1,1]),[180,165,138,255]),'Chamber backing leaks beyond a bulkhead foot');
  // Blue branches into both side aisles and narrows toward the core, with
  // tan islands beside the approach. Allow only the low-contrast weave.
  const carpetPoints=[[120,195],[170,194],[195,185],[210,175],[260,175],[310,175],[324,185],[370,194],[143,280],[360,280]];
  for(const point of carpetPoints){
   const color=pixels(room,[...point,1,1]);
   check(color.slice(0,3).every((v,i)=>Math.abs(v-[82,111,137][i])<=6),`Blue carpet disconnected or mismatched at ${point}`);
  }
  for(const point of [[180,175],[338,175],[117,208],[381,208],[177,161],[184,163],[334,163],[343,160]]){
   check(same(pixels(room,[...point,1,1]),[180,165,138,255]),`A carpet seam or black floor triangle remains at ${point}`);
  }
  // One uninterrupted wall surface separates the right casing and equipment.
  for(const rect of [[353,85,4,36],[353,135,4,10]]){
   check(pixels(room,rect).every((v,i)=>i%4===3?v===255:v===[150,144,124][i%4]),'A stray equipment strip reappeared beside the right jamb');
  }
  for(const point of [[14,190],[15,192],[466,190],[465,192]])check(same(pixels(room,[...point,1,1]),[169,156,137,255]),'A black glass sliver escapes below a side console');
  for(const point of [[386,160],[387,170]])check(same(pixels(room,[...point,1,1]),[216,206,186,255]),'The right cream wall facets have a broken seam');
  for(const point of [[206,201],[279,202],[194,241],[221,245],[203,241],[206,238]])check(same(pixels(room,[...point,1,1]),[0,0,0,255]),'Tabletop glass or pad cutouts have mismatched black backgrounds');
  // Compare the unobscured top and elbow to a native-size horizontal flip.
  // The center monitor intentionally occludes the readout's lower middle.
  const readout=canvas();art.drawLcarsPanel(art.painter(readout.getContext('2d')),0,0,54,12,{seed:36,variant:'power'});
  for(let y=0;y<12;y++)for(let x=0;x<54;x++){
   if(y>=6&&x<48)continue;
   const color=pixels(readout,[53-x,y,1,1]),mapped=same(color,[16,18,24,255])?[0,0,0,255]:color;
   check(same(pixels(room,[218+x,195+y,1,1]),mapped),'Compact table LCARS is not horizontally mirrored or has mismatched ink');
  }
  const expected=canvas();art.drawLcarsPanel(art.painter(expected.getContext('2d')),139,102,24,28,{seed:53});
  check(same(pixels(room,[139,102,24,28]),pixels(expected,[139,102,24,28])),'A wall contour overpaints the port duty display');
  check(!labels.some(s=>/COMPUTER ACCESS|PLASMA|ENGINEERING/i.test(s)),'Area labels reappeared in scene artwork');
  const fittedAreas=[[139,102,24,28],[360,87,26,37],[168,80,6,80],[347,80,6,80],[183,58,154,3]];
  // Compare complete frames: the existing effects pass restores the rail's
  // two-pixel overhang at x347/y149–150 in front of the chamber jamb.
  art.drawEngineeringEffects(ctx,0,{});
  const fittedBefore=fittedAreas.map(r=>pixels(room,r));
  for(const time of [0,.4,1.3,3]){
   art.drawEngineering(ctx);art.drawEngineeringEffects(ctx,time,{pulse:1});
   check(fittedAreas.every((r,i)=>same(pixels(room,r),fittedBefore[i])),'Core effects paint over the core-wrap wall hardware');
  }
  art.drawEngineering(ctx);art.drawEngineeringEffects(ctx,0,{});
  const unlit=pixels(room,[0,0,480,300]);art.drawEngineeringEffects(ctx,0,{alert:true});
  check(same(unlit,pixels(room,[0,0,480,300])),'Red alert was removed but still repaints the scene');
  art.drawEngineering(ctx);
  const litPanels=[[29,194,57,35],[394,194,57,35],[0,267,45,27],[435,267,45,27]].map(rect=>{
   const data=pixels(room,rect);let bright=0;for(let i=0;i<data.length;i+=4)if(data[i]>230&&data[i+1]>230&&data[i+2]>220)bright++;
   check(bright>100,'A broad lower light diffuser has become a narrow trim stripe');return {rect,bright};
  });
  art.drawEngineeringEffects(ctx,0,{door:1});
  const closed=canvas();art.drawEngineering(closed.getContext('2d'));art.drawEngineeringEffects(closed.getContext('2d'),0,{door:0});
  check(same(pixels(room,[0,0,480,300]),pixels(closed,[0,0,480,300])),'Hidden access repaints a door in the visible walls');
  const ship=art.createShip({rooms:art.SHIP_ROOMS}),actual=canvas(),world=art.createWorld(actual,{ship});
  const agents=Array.from({length:Object.values(art.SHIP_ROOMS).reduce((n,room)=>n+room.stations.length,0)},(_,slot)=>({id:`wall-proof:${slot}`,slot,name:`Crew ${slot+1}`,status:'active',verified:true}));
  world.resize(1440,900,1);world.update({theme:'bridge',agents,paused:true});ship.set('energy','quiet');ship.setRoom('engineering');
  const captures=[];const capture=name=>{world.render();captures.push({name,image:actual.toDataURL()});};
  world.update({agents:[]});capture('empty-normal');world.update({agents});
  capture('eight-normal');ship.set('night',true);capture('eight-night');ship.set('night',false);
  const traveler=ship.getFrame().items.find(a=>a.x===149&&a.y===169).agent.id;
  const vacancy=ship.getSnapshot().populations.live.locations.find(l=>l.room==='bridge').id;ship.sync(agents.filter(a=>a.id!==vacancy));
  check(ship.transfer(traveler,'bridge').ok,'Unable to exercise actual bottom exit');let stamp=0,bottom=false,finished=false;
  for(let i=0;i<8000;i++){
   ship.tick(stamp);stamp+=1000/60;const a=ship.getFrame().items.find(a=>a.agent.id===traveler);
   if(a?.walking&&a.y>300&&!bottom){capture('actual-bottom-exit');bottom=true;}
   if(!ship.getSnapshot().populations.live.activeTripId){finished=true;break;}
  }
  check(bottom&&finished,'Crew no longer depart below the camera');
  world.destroy();ship.dispose();return {captures,litPanels,labels,checks:['plain-upper-corridor-walls','level-recessed-soffits','blue-cross-aisle-and-narrow-core-approach','no-black-floor-triangles','no-console-slivers','joined-right-wall-facet','true-black-tabletop','compact-mirrored-table-LCARS','duty-display-unobscured','core-effects-bounded','bulkhead-rim-stable','no-red-alert-repaint','broad-light-diffusers','no-area-labels','hidden-door-invisible','actual-bottom-exit']};
 },outputFiles[0].text);
 for(const {name,image}of result.captures)await writeFile(new URL(`${name}.png`,out),Buffer.from(image.split(',')[1],'base64'));
 assert.deepEqual(errors,[]);await writeFile(new URL('render-results.json',out),JSON.stringify({...result,captures:result.captures.map(({image,...c})=>c),errors},null,2));
 console.log(`PASS ${result.checks.join(', ')}; ${result.captures.length} integrated scene captures; no browser errors`);
}finally{await browser.close();await server.close();}
