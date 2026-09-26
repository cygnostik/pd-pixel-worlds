import assert from 'node:assert/strict';
import {hostThemeCSS} from './host-theme-fixture.mjs';

export async function checkControlColors(page){
 const failures=await page.locator('.pw').evaluate(root=>{
  const failures=[],base=getComputedStyle(root),ctx=document.createElement('canvas').getContext('2d');
  const rgba=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
  const token=name=>rgba(base.getPropertyValue(name));
  const same=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<=2);
  for(const el of root.querySelectorAll('button,select,input,summary')){
   if(!el.getClientRects().length)continue;
   const s=getComputedStyle(el),label=el.getAttribute('aria-label')||el.textContent.trim();
   if(!same(rgba(s.color),token('--ui-text-primary')))failures.push(`${label}: text is not host primary`);
   if(el.matches('button')){
    const expected=el.matches('[aria-pressed=true],.pw-primary')?'--ui-control-active-background':el.matches(':hover:not(:disabled)')?'--ui-control-hover-background':null;
    if(!same(rgba(s.backgroundColor),expected?token(expected):[0,0,0,0]))failures.push(`${label}: wrong control background`);
   }
   if(el.matches('select')&&(!same(rgba(s.backgroundColor),token('--ui-bg-elevated'))||s.backgroundImage==='none'))failures.push(`${label}: select needs composited host panel`);
   if(el.matches(':focus-visible')&&!same(rgba(s.outlineColor),token('--ui-accent')))failures.push(`${label}: focus is not host accent`);
  }
  return failures;
 });
 assert.deepEqual(failures,[],'Every visible button, select, search input and disclosure uses host colors');
}

export async function checkHostTheme(page,surface,label){
 await page.addStyleTag({content:hostThemeCSS});
 await page.setViewportSize({width:1440,height:1000});
 if(label==='daily'){
  await page.emulateMedia({reducedMotion:'reduce'});
  const resume=page.getByRole('button',{name:'Resume animation',exact:true});
  if(await resume.isVisible())await resume.click();
 }else{
  const pause=page.getByRole('button',{name:'Pause animation',exact:true});
  if(await pause.isVisible())await pause.click();
 }
 await page.waitForTimeout(100);
 const canvas=page.locator('.pw-scene canvas');
 const art=await canvas.evaluate(c=>c.toDataURL());
 for(const mode of ['dark','light','dark']){
  await page.evaluate(mode=>document.documentElement.dataset.testHostMode=mode,mode);
  await surface.locator('button').first().focus();
  await page.waitForTimeout(220);
  await checkControlColors(page);
  const expected=await page.locator('.pw').evaluate(e=>{
   const s=getComputedStyle(e),c=document.createElement('canvas').getContext('2d');
   const pixel=(base,overlay)=>{c.clearRect(0,0,1,1);c.fillStyle=s.getPropertyValue(base);c.fillRect(0,0,1,1);if(overlay){c.fillStyle=s.getPropertyValue(overlay);c.fillRect(0,0,1,1);}return [...c.getImageData(0,0,1,1).data];};
   return {base:pixel('--ui-surface-background'),panel:pixel('--ui-bg-elevated','--ui-bg-secondary'),secondary:pixel('--ui-bg-secondary')};
  });
  assert.ok(expected.secondary[3]>0&&expected.secondary[3]<100,'Real Hermes secondary has low alpha');
  const shot=await page.screenshot({path:new URL(`../evidence/host-theme-${label}-${mode}.png`,import.meta.url).pathname});
  const samples=await page.evaluate(async({png,selector})=>{
   const image=await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
   const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);
   const sample=(px,py)=>[...x.getImageData(Math.floor(px),Math.floor(py),1,1).data];
   const panels=[...document.querySelector(selector).children].map(e=>{const b=e.getBoundingClientRect();return sample(b.x+20,b.y+3);});
   const b=document.querySelector('.pw-scene canvas').getBoundingClientRect();
   return {panels,letterbox:sample(b.right-20,b.y+3)};
  },{png:shot.toString('base64'),selector:label==='daily'?'.pw-agents-controls':'.pw-display-controls'});
  const near=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<=2);
  for(const pixel of samples.panels)assert.ok(near(pixel,expected.panel),`${mode} panel composites secondary over elevated base: ${pixel} vs ${expected.panel}`);
  assert.ok(near(samples.letterbox,expected.base),`${mode} canvas letterbox follows host surface: ${samples.letterbox} vs ${expected.base}`);
  assert.equal(await canvas.evaluate(c=>c.toDataURL()),art,'Theme switch while paused or OS-reduced-motion preserves every scene-art pixel (CSS owns exterior)');
  for(const selector of ['.pw','.pw-scene','.pw-scene canvas']){
   const rgba=await page.locator(selector).first().evaluate(e=>{const c=document.createElement('canvas').getContext('2d');c.fillStyle=getComputedStyle(e).backgroundColor;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data];});
   assert.deepEqual(rgba,expected.base,`${selector} uses current semantic surface`);
  }
 }
}
