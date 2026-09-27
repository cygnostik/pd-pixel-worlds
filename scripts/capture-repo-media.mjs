// Capture real application renders using the isolated, demonstration-only SDK.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import {startPreview} from './preview.mjs';
import {composeTngFeature} from './compose-tng-feature.mjs';
import {composeCatalogMedia} from './compose-catalog-media.mjs';

const output=new URL('../docs/images/',import.meta.url);
const server=await startPreview(),browser=await chromium.launch({headless:true});
const errors=[];
const views=[
 {id:'office',file:'office-space',label:'Office Space'},
 {id:'cafe',file:'kitten-cafe',label:'Kitten Café'},
 {id:'bridge',file:'tng-bridge',label:'TNG · Bridge'},
 {id:'bridge',room:'engineering',file:'tng-engineering',label:'TNG · Engineering'},
];
try{
 await mkdir(output,{recursive:true});
 const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().url().startsWith(server.url)||route.request().url().startsWith('data:')?route.continue():route.abort());
 await page.goto(server.url);
 await page.getByRole('button',{name:'Explore themes',exact:true}).click();
 const images=[];
 for(const view of views){
  await page.locator('.pw-world-tabs button').filter({hasText:({office:'Office Space',cafe:'Kitten Café',bridge:'The Next Generation'})[view.id]}).click();
  if(view.room)await page.locator('.pw-ship-rooms button').filter({hasText:'Engineering'}).click();
  await page.waitForFunction(id=>document.querySelector('.pw')?.dataset.theme===id,view.id);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.pw').getAttribute('data-mode'),'demo');
  await page.locator('.pw-world-card').screenshot({path:new URL(`${view.file}.png`,output).pathname});
  const image=await page.locator('canvas').evaluate(canvas=>{
   const out=document.createElement('canvas');out.width=960;out.height=600;
   const ctx=out.getContext('2d');ctx.imageSmoothingEnabled=false;
   const width=Math.min(canvas.width,canvas.height*1.6),height=width/1.6;
   ctx.drawImage(canvas,(canvas.width-width)/2,(canvas.height-height)/2,width,height,0,0,960,600);
   return out.toDataURL('image/png');
  });
  await writeFile(new URL(`${view.file}-scene.png`,output),Buffer.from(image.split(',')[1],'base64'));
  images.push({...view,image});
 }
 await page.locator('.pw-ship-rooms button').filter({hasText:'Bridge'}).click();
 await page.getByRole('button',{name:'Display mode',exact:true}).click();
 await page.locator('.pw-display-exit').evaluate(element=>element.blur());
 await page.mouse.move(1400,1000);await page.waitForTimeout(250);
 await page.locator('.pw').screenshot({path:new URL('display-mode.png',output).pathname});
 await page.getByRole('button',{name:'Exit display',exact:true}).click();
 await page.getByRole('button',{name:'PW Agents',exact:true}).click();
 await page.getByRole('button',{name:'Demo',exact:true}).click();
 await page.locator('.pw-agents[data-mode=demo]').waitFor();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.locator('.pw-agents').screenshot({path:new URL('pw-agents.png',output).pathname});
 assert.deepEqual(errors,[]);

 // Real scene cards; TNG is an explicitly composed two-room feature graphic.
 const tngFeature=await composeTngFeature(browser);
 const design=await browser.newPage({deviceScaleFactor:1});
 async function compose(file,width,height,compact=false){
  const cards=images.slice(0,3).map(card=>card.id==='bridge'?{...card,image:tngFeature,label:'TNG · Bridge + Engineering',kind:'FEATURE'}:card);
  await design.setViewportSize({width,height});
  await design.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
   *{box-sizing:border-box}body{margin:0;background:#090b0c;color:#f4f0e7;font-family:'Courier New',monospace}
   main{width:${width}px;height:${height}px;padding:${compact?'32px 40px':'42px 48px'};position:relative;overflow:hidden}
   .top{display:flex;justify-content:space-between;align-items:center;font-size:12px;letter-spacing:1.5px;color:#b7b8ad}
   .signal{display:inline-block;width:8px;height:8px;background:#efb64f;margin-right:10px;box-shadow:12px 0 #675132}
   h1{font-size:${compact?64:82}px;letter-spacing:-5px;line-height:1;margin:30px 0 14px;font-weight:700}
   .sub{font-family:Arial,sans-serif;font-size:${compact?19:23}px;color:#c3c4be;margin:0}
   .gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:${compact?30:34}px}
   figure{margin:0;min-width:0}figure img{display:block;width:100%;aspect-ratio:1.6;image-rendering:pixelated;border:1px solid #343837}
   figcaption{display:flex;justify-content:space-between;margin-top:12px;font-size:13px;color:#e1e1d6}
   .number{color:#efb64f;margin-right:10px}.kind{font-size:10px;color:#91988e}
   footer{position:absolute;left:${compact?40:48}px;right:${compact?40:48}px;bottom:30px;border-top:1px solid #343837;padding-top:16px;display:flex;justify-content:space-between;font-size:11px;color:#b7b8ad;letter-spacing:.4px}
  </style></head><body><main><div class="top"><span><i class="signal"></i> PD PIXEL WORLDS</span><span>COMMUNITY PLUGIN / HERMES DESKTOP</span></div>
   <h1>Pixel Worlds</h1><p class="sub">Little worlds. Real agents. A place you can make your own.</p>
   <div class="gallery">${cards.map((card,index)=>`<figure><img src="${card.image}" alt="${card.label}"><figcaption><span><span class="number">0${index+1}</span>${card.label}</span><span class="kind">${card.kind||'DEMO VIEW'}</span></figcaption></figure>`).join('')}</div>
   <footer><span>THREE STARTER REALMS · IMPORT YOUR OWN</span><span>BY PRODYN · PIXEL WORLDS + PW AGENTS</span></footer>
   </main></body></html>`);
  await design.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
  const layout=await design.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,collision:document.querySelector('.gallery').getBoundingClientRect().bottom>document.querySelector('footer').getBoundingClientRect().top-16,headline:document.querySelector('h1').getBoundingClientRect().height}));
  assert.equal(layout.overflow,false);assert.equal(layout.collision,false);assert.ok(layout.headline<100,'Headline stays on one line');
  await design.screenshot({path:new URL(file,output).pathname});
 }
 await compose('starter-realms.png',1440,720);
 await compose('social-preview.png',1280,640,true);
 const catalog=await composeCatalogMedia(browser);
 console.log(`Catalog critical-content bounds fit every destination: ${JSON.stringify(catalog.safe)}`);
 for(const file of [...views.flatMap(view=>[`${view.file}.png`,`${view.file}-scene.png`]),'tng-ship-feature.png','display-mode.png','pw-agents.png','starter-realms.png','social-preview.png','catalog-banner.png']){
  const bytes=await readFile(new URL(file,output));
  assert.ok(bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(20)>0);
  if(file==='social-preview.png'){assert.equal(bytes.readUInt32BE(16),1280);assert.equal(bytes.readUInt32BE(20),640);assert.ok((await stat(new URL(file,output))).size<1_000_000);}
  console.log(`Verified ${file}: ${bytes.readUInt32BE(16)}×${bytes.readUInt32BE(20)}, ${bytes.length} bytes`);
 }
 console.log('Captured current source, demonstration agents only; no external requests or live Hermes data.');
}finally{await browser.close();await server.close();}
