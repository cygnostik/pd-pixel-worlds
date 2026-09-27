// A separate catalog composition: the card and height-capped detail hero share one image.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const SOURCE = Object.freeze({width:1440, height:720});
// Measured Hermes website content boxes (the hero's 1px bottom border is excluded).
// Remeasure when upstream changes; these are rendering fixtures, not schema limits.
export const SURFACES = Object.freeze([
  {name:'catalog card', width:368, height:184},
  {name:'wide detail', width:1134, height:359},
  {name:'1024px detail', width:958, height:359},
  {name:'768px detail', width:734, height:359},
  {name:'narrow proportional image', width:356, height:178},
]);

export function visibleSourceRect(source, frame) {
  for (const value of [source.width,source.height,frame.width,frame.height]) {
    assert.ok(Number.isFinite(value) && value>0, 'Image and frame dimensions must be positive');
  }
  const scale=Math.max(frame.width/source.width,frame.height/source.height);
  const width=frame.width/scale, height=frame.height/scale;
  return {left:(source.width-width)/2, top:(source.height-height)/2,
    right:(source.width+width)/2, bottom:(source.height+height)/2};
}

export function safeContentRect(source=SOURCE, surfaces=SURFACES, margin=24) {
  assert.ok(surfaces.length>0, 'At least one destination is required');
  assert.ok(Number.isFinite(margin) && margin>=0, 'Margin must be nonnegative');
  const crops=surfaces.map(frame=>visibleSourceRect(source,frame));
  const safe={left:Math.max(...crops.map(r=>r.left))+margin,
    top:Math.max(...crops.map(r=>r.top))+margin,
    right:Math.min(...crops.map(r=>r.right))-margin,
    bottom:Math.min(...crops.map(r=>r.bottom))-margin};
  assert.ok(safe.right>safe.left && safe.bottom>safe.top, 'Crop intersection must have usable space');
  return safe;
}

export function assertContentFits(bounds, safe=safeContentRect()) {
  assert.ok(bounds.length>0, 'Critical content must be measured');
  for (const box of bounds) {
    assert.ok([box.left,box.top,box.right,box.bottom].every(Number.isFinite), `${box.name}: finite bounds required`);
    assert.ok(box.right>box.left && box.bottom>box.top, `${box.name}: content must be visible`);
    assert.ok(box.left>=safe.left && box.top>=safe.top && box.right<=safe.right && box.bottom<=safe.bottom,
      `${box.name} escapes the catalog safe area: ${JSON.stringify({box,safe})}`);
  }
}

const imageDirectory=new URL('../docs/images/',import.meta.url);
const cards=[
  {file:'office-space-scene.png',label:'Office Space'},
  {file:'kitten-cafe-scene.png',label:'Kitten Café'},
  {file:'tng-ship-feature.png',label:'TNG · Bridge + Engineering'},
];

export async function composeCatalogMedia(browser, {write=true}={}) {
  const images=await Promise.all(cards.map(async card=>({...card,
    src:`data:image/png;base64,${(await readFile(new URL(card.file,imageDirectory))).toString('base64')}`})));
  const page=await browser.newPage({viewport:SOURCE,deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith('data:')?route.continue():route.abort());
  try {
    await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;background:#090b0c;color:#f4f0e7;font-family:'Courier New',monospace}
      main{width:1440px;height:720px;position:relative;overflow:hidden}
      main::before,main::after{content:'';position:absolute;left:144px;right:144px;height:1px;background:#343837}
      main::before{top:80px}main::after{bottom:80px}
      .content{position:absolute;left:144px;right:144px;top:160px}
      header{display:flex;align-items:baseline;justify-content:space-between;gap:24px}
      h1{font-size:76px;line-height:1;letter-spacing:-4px;margin:0;font-weight:700;white-space:nowrap}
      .disclosure{font-size:16px;line-height:20px;color:#b7b8ad;white-space:nowrap;letter-spacing:.5px}
      .sub{font:26px/32px Arial,sans-serif;color:#c3c4be;margin:8px 0 0}
      .gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:22px}
      figure{margin:0;min-width:0}img{display:block;width:100%;aspect-ratio:1.6;image-rendering:pixelated;border:1px solid #343837}
      figcaption{margin-top:10px;font-size:16px;line-height:24px;white-space:nowrap;color:#e1e1d6}
      .number{color:#efb64f;margin-right:10px}
    </style></head><body><main><div class="content">
      <header><h1 data-critical="product title">Pixel Worlds</h1><span class="disclosure" data-critical="demo disclosure">DEMONSTRATION SCENES</span></header>
      <p class="sub" data-critical="benefit">Little worlds. Real agents. A place you can make your own.</p>
      <div class="gallery">${images.map((card,index)=>`<figure><img data-critical="${card.label} artwork" src="${card.src}" alt="${card.label}"><figcaption data-critical="${card.label} caption"><span class="number">0${index+1}</span>${card.label}</figcaption></figure>`).join('')}</div>
    </div></main></body></html>`);
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
    const layout=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth>innerWidth || document.documentElement.scrollHeight>innerHeight,
      clipped:[...document.querySelectorAll('[data-critical]')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.dataset.critical),
      // Font descenders may extend below line-height without being clipped.
      // Include that visible overflow in crop bounds rather than rejecting it.
      bounds:[...document.querySelectorAll('[data-critical]')].map(e=>{const r=e.getBoundingClientRect();return {name:e.dataset.critical,left:r.left,top:r.top,right:r.right,bottom:r.top+Math.max(r.height,e.scrollHeight)};}),
    }));
    assert.deepEqual(errors,[]);
    assert.equal(layout.overflow,false,'Catalog artboard must not overflow');
    assert.deepEqual(layout.clipped,[],'Critical text and artwork must not overflow horizontally');
    assertContentFits(layout.bounds);
    const png=await page.screenshot();
    assert.equal(png.readUInt32BE(16),SOURCE.width);
    assert.equal(png.readUInt32BE(20),SOURCE.height);
    if(write) await writeFile(new URL('catalog-banner.png',imageDirectory),png);
    return {source:SOURCE,safe:safeContentRect(),bounds:layout.bounds,bytes:png.length};
  } finally {await page.close();}
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true});
  try {
    const result=await composeCatalogMedia(browser,{write:!process.argv.includes('--check')});
    console.log(JSON.stringify({file:fileURLToPath(new URL('catalog-banner.png',imageDirectory)),...result},null,2));
  } finally {await browser.close();}
}
