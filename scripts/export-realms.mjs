/** Export original procedural art through real Chromium Canvas2D.
 * node scripts/export-realms.mjs         writes three downloads + catalog
 * node scripts/export-realms.mjs --check verifies committed downloads, no writes
 * No reference images, live sessions, remote assets, plugins or build output.
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { validateRealmPackage } from '../src/realm-packages.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const check=process.argv.includes('--check');
const definitions=[
 {id:'pd-office-space',builtinId:'office',title:'Office Space',subtitle:'Cubicles, coffee & a printer out back',label:'Office Space',description:'Cubicles, CRTs and a sun-warmed printer yard.',source:'src/art/scenes.js',preview:'docs/images/office-space.png',provenance:'Original procedural artwork; unofficial film-inspired demonstration. See NOTICE.md.'},
 {id:'pd-kitten-cafe',builtinId:'cafe',title:'Kitten Café',subtitle:'A little sunshine. A lot of paw work.',label:'Kitten Café',description:'A warm café inhabited by expressive quadruped kittens.',source:'src/art/scenes.js',preview:'docs/images/kitten-cafe.png',provenance:'Original setting and procedural artwork. MIT.'},
 {id:'pd-tng-bridge',builtinId:'bridge',title:'The Next Generation',subtitle:'A quieter kind of final frontier',label:'Star Trek: TNG',description:'An aft-facing Enterprise-D-inspired bridge with command seating and two foreground helm stations.',source:'src/art/bridge-scene.js',preview:'docs/images/tng-bridge.png',provenance:'Original procedural artwork; unofficial franchise-inspired demonstration. See NOTICE.md.'},
];
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Pixel Worlds original-art exporter</title>');return;}
  const path=resolve(root,'.'+pathname);
  if(!path.startsWith(resolve(root,'src')+sep)||!path.endsWith('.js')){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await readFile(path));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const origin=`http://127.0.0.1:${server.address().port}`;
 // The proof runs with only local source modules and data images available.
 await page.route('**/*',route=>route.request().url().startsWith(origin+'/')||route.request().url().startsWith('data:')?route.continue():route.abort());
 await page.goto(origin);
 const generated=await page.evaluate(async definitions=>{
  const {drawBackground,ANCHORS}=await import('/src/art/scenes.js');
  const {drawBridgeRail,drawBridgeHelm}=await import('/src/art/bridge-scene.js');
  function image(draw){const canvas=document.createElement('canvas');canvas.width=480;canvas.height=300;draw(canvas.getContext('2d'));return canvas.toDataURL('image/png');}
  return definitions.map(d=>({format:'pwrealm',version:1,id:d.id,title:d.title,subtitle:d.subtitle,label:d.label,author:'ProDyn',license:'MIT for original contributions; franchise and trademark rights excluded.',provenance:d.provenance,width:480,height:300,characterStyle:d.builtinId,anchors:ANCHORS[d.builtinId],background:image(ctx=>drawBackground(ctx,d.builtinId)),layers:d.builtinId==='bridge'?[{afterY:160,image:image(drawBridgeRail)},{afterY:300,image:image(drawBridgeHelm)}]:[]}));
 },definitions);
 const packages=[];
 for(let i=0;i<definitions.length;i++){
  const p=check?validateRealmPackage(await readFile(resolve(root,'realms',definitions[i].id+'.pwrealm.json'),'utf8')):validateRealmPackage(generated[i]);
  assert.equal(p.id,definitions[i].id);assert.equal(p.characterStyle,definitions[i].builtinId);
  packages.push(p);
 }
 const proof=await page.evaluate(async packages=>{
  const {createRealmLibrary}=await import('/src/realm-packages.js');
  const {createWorld}=await import('/src/world.js');
  const {drawBackground}=await import('/src/art/scenes.js');
  const {drawBridgeRail,drawBridgeHelm}=await import('/src/art/bridge-scene.js');
  const stored=new Map(),storage={get:k=>stored.get(k),set:(k,v)=>stored.set(k,v)};
  const library=createRealmLibrary(storage);await library.ready;
  const makeCanvas=()=>{const c=document.createElement('canvas');c.width=480;c.height=300;return c;};
  const equalPixels=(a,b,label)=>{const x=a.getContext('2d').getImageData(0,0,a.width,a.height).data,y=b.getContext('2d').getImageData(0,0,b.width,b.height).data;let differing=0,maxDelta=0;for(let i=0;i<x.length;i++){const delta=Math.abs(x[i]-y[i]);if(delta){differing++;maxDelta=Math.max(maxDelta,delta);}}if(differing)throw Error(`${label}: ${differing} differing channels, max delta ${maxDelta}`);};
  const results=[];
  for(const p of packages){
   const realm=await library.importText(JSON.stringify(p));
   const original=makeCanvas(),decoded=makeCanvas();drawBackground(original.getContext('2d'),p.characterStyle);decoded.getContext('2d').drawImage(realm.background,0,0);equalPixels(original,decoded,p.id+' background');
   for(let i=0;i<realm.layers.length;i++){const a=makeCanvas(),b=makeCanvas();[drawBridgeRail,drawBridgeHelm][i](a.getContext('2d'));b.getContext('2d').drawImage(realm.layers[i].image,0,0);equalPixels(a,b,p.id+' layer '+i);}
   const a=makeCanvas(),b=makeCanvas(),builtin=createWorld(a),imported=createWorld(b);
   // All status states, stable slots and overflow selection are exercised with
   // fixtures only. No parent link: imported files do not define yard routes.
   const agents=Array.from({length:13},(_,slot)=>({id:`fixture-${slot}`,slot,name:`Crew ${slot}`,status:['active','waiting','error','done','idle','unknown'][slot%6]}));
   for(const selectedId of ['fixture-1','fixture-12']){
    builtin.update({theme:p.characterStyle,agents,selectedId,reducedMotion:true});
    imported.update({theme:realm.id,realm,agents,selectedId,reducedMotion:true});
    for(const [width,height,dpr] of [[480,300,1],[600,600,2],[960,600,1]]){
     builtin.resize(width,height,dpr);imported.resize(width,height,dpr);equalPixels(a,b,p.id+' crew render');
     if(JSON.stringify(builtin.getAgentRegions())!==JSON.stringify(imported.getAgentRegions()))throw Error('Imported hit regions differ');
     for(const r of imported.getAgentRegions())if(imported.hitTest(r.x+r.width/2,r.y+r.height/2)!==r.id)throw Error('Unreachable imported station');
    }
   }
   builtin.destroy();imported.destroy();
   results.push({id:p.id,dimensions:[realm.background.naturalWidth,realm.background.naturalHeight],layers:realm.layers.length,render:'pixel-identical',stations:12});
  }
  const restored=createRealmLibrary(storage);await restored.ready;if(restored.getSnapshot().length!==3)throw Error('Hydration did not restore every package');
  for(const realm of restored.getSnapshot()){await restored.remove(realm.id);}
  if(JSON.parse(storage.get('realm-packages-v1')).length!==0)throw Error('Removal did not persist');
  restored.dispose();library.dispose();return results;
 },packages);
 assert.equal(proof.length,3);
 if(!check){
  await mkdir(resolve(root,'realms'),{recursive:true});
  for(const p of packages)await writeFile(resolve(root,'realms',p.id+'.pwrealm.json'),JSON.stringify(p,null,2)+'\n');
  await writeFile(resolve(root,'realms/catalog.json'),JSON.stringify({schemaVersion:1,delivery:'data-only-json',format:'pwrealm',packageVersion:1,canvas:{width:480,height:300},realms:definitions.map(d=>({...d,author:'ProDyn',importedId:`import:${d.id}`,download:`realms/${d.id}.pwrealm.json`,license:'MIT',characterStyle:d.builtinId}))},null,2)+'\n');
 }
 for(const result of proof)console.log(JSON.stringify(result));
 console.log(`${check?'Verified':'Exported and verified'} ${packages.length} original-art realm packages; real browser PNG decode, pixel equality, layering, seating, statuses, hit testing, persistence and hydration passed.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
