import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const {outputFiles}=await build({stdin:{contents:"export {drawBridgeHelm,drawBridge,drawBridgeRail} from './src/art/bridge-scene.js';export {painter} from './src/art/pixels.js';",resolveDir:new URL('..',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'browser'});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const checks=await page.evaluate(async code=>{
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
  const {drawBridgeHelm,drawBridge,drawBridgeRail,painter}=await import(url);URL.revokeObjectURL(url);
  const canvas=document.createElement('canvas');canvas.width=480;canvas.height=300;
  const ctx=canvas.getContext('2d');drawBridgeHelm(ctx);
  const pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
  // The front desks are cantilevered from opposite OUTBOARD lighted supports,
  // not two identical solid plinths. Transparency must reveal the room/crew.
  const legroom=[[161,263],[177,272],[319,263],[303,272]].every(([x,y])=>pixel(x,y)[3]===0);
  const operatorClearance=[[161,230],[161,247],[319,230],[319,247]].every(([x,y])=>pixel(x,y)[3]===0);
  const litSupports=[[128,265],[352,265]].every(([x,y])=>{const [r,g,b,a]=pixel(x,y);return a===255&&r>180&&g>210&&b>200;});
  let mirrored=0;
  for(let y=249;y<=285;y++)for(let x=106;x<=214;x++)if(pixel(x,y).join(',')!==pixel(480-x,y).join(','))mirrored++;
  ctx.clearRect(0,0,480,300);drawBridge(painter(ctx));
  // The photographed side wall continues to the red skirting: two cabinet rows,
  // a black recess, then three lower rows. It has no luminous console base.
  let lowerWallLights=0;
  for(let y=145;y<207;y++)for(let x=0;x<99;x++)for(const xx of [x,480-x])if(pixel(xx,y).slice(0,3).join(',')==='212,238,229')lowerWallLights++;
  const wallPixel=(x,v,side)=>pixel(side<0?x:480-x,Math.round(98-13*x/98+v/110*(108-30*x/98)));
  const cabinetRows=[-1,1].every(side=>[18,40,62].every(x=>[28,41,61,74,88].every(v=>wallPixel(x,v,side).slice(0,3).join(',')==='137,133,138')));
  const wallRecess=[-1,1].every(side=>[18,40,62].every(x=>wallPixel(x,51,side).slice(0,3).join(',')==='17,21,27'));
  const chairBases=[161,319].every(x=>[-5,4].every(dx=>pixel(x+dx,264).slice(0,3).join(',')==='99,95,84'));
  // The narrow aft keyboard cannot grow antenna-like marks into the main glass
  // or lower cabinetry. Both rows lie outside its declared five-pixel face.
  const forbidden=['109,135,138','144,160,170'];
  let strayKeyboardInk=0;
  for(const y of [126,135,136])for(let x=155;x<325;x++)if(forbidden.includes(pixel(x,y).slice(0,3).join(',')))strayKeyboardInk++;
  drawBridgeRail(ctx);
  const tacticalShoulders=[[217,160],[263,160]].every(([x,y])=>{const [r,g,b]=pixel(x,y);return r>180&&g>175&&b>150&&r-g<30;});
  return {legroom,operatorClearance,litSupports,mirrored,strayKeyboardInk,tacticalShoulders,lowerWallLights,cabinetRows,wallRecess,chairBases};
 },outputFiles[0].text);
 assert.deepEqual(errors,[]);
 assert.equal(checks.legroom,true,'solid desk fronts still block helm legroom');
 assert.equal(checks.operatorClearance,true,'helm foreground hides the operator torso or boots');
 assert.equal(checks.litSupports,true,'helm lights must sit on opposite outer supports');
 assert.equal(checks.mirrored,0,'lower helm architecture must mirror around the room center');
 assert.equal(checks.strayKeyboardInk,0,'tiny keyboard graphics escape the control surface');
 assert.equal(checks.tacticalShoulders,true,'rail or chairs conceal the flared tactical support');
 assert.equal(checks.lowerWallLights,0,'old luminous side-console bases remain below the cabinets');
 assert.equal(checks.cabinetRows,true,'both side walls need two upper and three lower cabinet rows');
 assert.equal(checks.wallRecess,true,'both side walls need the black horizontal cabinet recess');
 assert.equal(checks.chairBases,true,'conn and ops chair pedestals are still too narrow');
 console.log('PASS full-height side walls, 2+3 cabinet rows, black recesses, wider chair pedestals, open helm legroom, operator clearance, bounded keyboards and tactical shoulders; no browser errors');
}finally{await browser.close();}
