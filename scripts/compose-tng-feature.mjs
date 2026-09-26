// Composite actual scene captures with the user's supplied, black-matted artwork.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function composeTngFeature(browser){
 const inputs=await Promise.all([
  '../docs/images/tng-bridge-scene.png',
  '../docs/images/tng-engineering-scene.png',
  './media-assets/tng-transporter.png',
  './media-assets/tng-title.png',
 ].map(async path=>`data:image/png;base64,${(await readFile(new URL(path,import.meta.url))).toString('base64')}`));
 const page=await browser.newPage();
 try{
  const result=await page.evaluate(async inputs=>{
   const [bridge,engineering,beam,title]=await Promise.all(inputs.map(src=>new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;
   })));
   const canvas=document.createElement('canvas');canvas.width=960;canvas.height=600;
   const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
   // Each source contributes exactly its corresponding half, without squeezing.
   ctx.drawImage(bridge,0,0,480,600,0,0,480,600);
   ctx.drawImage(engineering,480,0,480,600,480,0,480,600);
   const left=Array.from(ctx.getImageData(100,200,1,1).data);
   const right=Array.from(ctx.getImageData(800,200,1,1).data);
   // Local title contrast; the clean scene captures remain separate and intact.
   const shade=ctx.createLinearGradient(0,380,0,600);
   shade.addColorStop(0,'rgba(0,0,0,0)');shade.addColorStop(1,'rgba(0,0,0,.76)');
   ctx.fillStyle=shade;ctx.fillRect(0,380,960,220);
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   const beamWidth=beam.width*600/beam.height;
   ctx.drawImage(beam,480-beamWidth/2,0,beamWidth,600);
   const titleWidth=760,titleHeight=title.height*titleWidth/title.width;
   ctx.save();ctx.shadowColor='rgba(0,0,0,.95)';ctx.shadowBlur=8;ctx.shadowOffsetY=3;
   ctx.drawImage(title,(960-titleWidth)/2,600-titleHeight-16,titleWidth,titleHeight);ctx.restore();
   return {image:canvas.toDataURL('image/png'),left,right};
  },inputs);
  assert.equal(result.left[3],255);assert.equal(result.right[3],255);
  const data=Buffer.from(result.image.split(',')[1],'base64');
  assert.equal(data.readUInt32BE(16),960);assert.equal(data.readUInt32BE(20),600);
  await writeFile(new URL('../docs/images/tng-ship-feature.png',import.meta.url),data);
  console.log('Composited TNG feature: Bridge left / Engineering right, 960×600.');
  return result.image;
 }finally{await page.close();}
}

if(process.argv[1]&&new URL(process.argv[1],'file:').href===import.meta.url){
 const {chromium}=await import('playwright');
 const browser=await chromium.launch({headless:true});
 try{await composeTngFeature(browser);}finally{await browser.close();}
}
