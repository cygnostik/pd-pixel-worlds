import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {startPreview} from '../scripts/preview.mjs';
import {SHIP_ROOMS} from '../src/ship-layout.js';
import {checkHostTheme,checkControlColors} from './host-theme-browser.mjs';
import {hostThemeCSS} from './host-theme-fixture.mjs';
const bridgeCapacity=SHIP_ROOMS.bridge.stations.length,engineeringCapacity=SHIP_ROOMS.engineering.stations.length;
const server=process.env.PIXEL_WORLDS_URL?null:await startPreview();
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const base=process.env.PIXEL_WORLDS_URL||server.url;
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const check=name=>console.log('PASS',name);
try{
 await page.goto(base);
 await page.getByRole('button',{name:'Display mode',exact:true}).waitFor();
 assert.equal(await page.locator('.pw').getAttribute('data-display'),'false');
 await page.getByRole('button',{name:'Explore themes',exact:true}).click();
 await page.locator('.pw-agent').first().click();
 await page.addStyleTag({content:hostThemeCSS});
 for(const mode of ['dark','light']){
  await page.evaluate(mode=>document.documentElement.dataset.testHostMode=mode,mode);
  await page.getByRole('button',{name:'Display mode',exact:true}).focus();
  await page.getByRole('button',{name:'Display mode',exact:true}).hover();
  await checkControlColors(page);
  await page.screenshot({path:new URL(`../evidence/host-theme-worlds-${mode}.png`,import.meta.url).pathname});
 }
 const crew=await page.locator('.pw-agent-grid').textContent();
 const selected=await page.locator('.pw-selected-name').innerText();
 await page.getByRole('button',{name:'Display mode',exact:true}).click();
 assert.equal(await page.locator('.pw').getAttribute('data-display'),'true');
 for(const selector of ['.pw-header','.pw-topline','.pw-roster','.pw-inspector','.pw-toolbar','.pw-footer','.pw-banner','.pw-world-caption'])assert.equal(await page.locator(selector).first().isVisible(),false,selector);
 assert.match(await page.locator('.pw-display-status').innerText(),/Demo · illustrative/);
 assert.match(await page.locator('.pw-display-status').innerText(),/6 on stage · 0 off-stage/);
 const bounds=await page.locator('canvas').boundingBox();
 const pane=await page.locator('.pw').boundingBox();
 assert.ok(Math.abs(bounds.width-pane.width)<2&&Math.abs(bounds.height-pane.height)<2);
 check('Normal default; display fills pane and hides dashboard with honest demo counts');
 for(const option of await page.locator('.pw-display-theme option').evaluateAll(es=>es.map(e=>e.value))){
  await page.getByRole('combobox',{name:'Display theme'}).selectOption(option);
  assert.equal(await page.locator('.pw-selected-name').textContent(),selected);
  assert.equal(await page.locator('.pw-agent-grid').textContent(),crew);
 }
 check('All display themes preserve crew and selection');
 await page.getByRole('button',{name:'Pause animation',exact:true}).click();
 await page.waitForTimeout(100);
 const before=await page.locator('canvas').evaluate(c=>c.toDataURL());
 await page.waitForTimeout(150);
 assert.equal(await page.locator('canvas').evaluate(c=>c.toDataURL()),before);
 check('Display pause freezes the shared scene');
 await page.locator('.pw-display-controls').evaluate(e=>document.activeElement?.blur());
 await page.mouse.move(700,700);await page.waitForTimeout(250);
 assert.equal(await page.locator('.pw-display-options').evaluate(e=>getComputedStyle(e).opacity),'0');
 await page.getByRole('button',{name:'Exit display',exact:true}).focus();
 await page.waitForTimeout(250);
 assert.equal(await page.locator('.pw-display-options').evaluate(e=>getComputedStyle(e).opacity),'1');
 check('Controls recede and reveal on keyboard focus');
 for(const width of [640,390]){
  await page.setViewportSize({width,height:500});
  await page.waitForTimeout(100);
  const dimensions=await page.locator('.pw-scene').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,canvas:e.querySelector('canvas').getBoundingClientRect().width}));
  assert.ok(dimensions.canvas>=800&&dimensions.scroll>dimensions.client);
  assert.ok(await page.locator('.pw').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  const exit=await page.getByRole('button',{name:'Exit display',exact:true}).boundingBox();assert.ok(exit.x>=0&&exit.x+exit.width<=width);
 }
 check('Small panes scroll a readable scene, with exit in bounds');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('.pw').getAttribute('data-display'),'false');
 assert.equal(await page.getByRole('button',{name:'Display mode',exact:true}).evaluate(e=>e===document.activeElement),true);
 await page.setViewportSize({width:1440,height:900});
 await page.getByRole('button',{name:'Live agents',exact:true}).click();
 await page.evaluate(()=>{for(let i=0;i<27;i++)window.__pixelWorldsPreview.host.emit({type:'message.start',session_id:`display-fixture-${i}`,profile:'default',connection_id:'local',payload:{}});});
 await page.getByRole('searchbox',{name:'Find an agent'}).fill('display-fixture-26');
 await page.getByRole('button',{name:'Display mode',exact:true}).click();
 // Ship membership survives roster filtering: filtering the list never teleports crew.
 assert.match(await page.locator('.pw-display-status').innerText(),new RegExp(`${bridgeCapacity} in Bridge · ${engineeringCapacity} elsewhere · 0 in transit · ${27-bridgeCapacity-engineeringCapacity} off-stage`));
 await page.evaluate(()=>window.__pixelWorldsPreview.host.state.gateway.set('disconnected'));
 await page.waitForTimeout(100);
 assert.match(await page.locator('.pw-display-status').innerText(),/not connected/);
 assert.match(await page.locator('.pw-display-status').innerText(),/unverified/);
 check('Filtered and disconnected live sources disclose off-stage and unverified agents');
 await page.reload();await page.getByRole('button',{name:'Exit display',exact:true}).waitFor();
 assert.equal(await page.locator('.pw').getAttribute('data-display'),'true');
 await page.getByRole('button',{name:'Exit display',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:'Display mode',exact:true}).waitFor();
 assert.equal(await page.locator('.pw').getAttribute('data-display'),'false');
 check('Display preference survives reload and explicit exit clears it');
 // Compact Trek controls sit beside, not underneath, the shared toolbar.
 for(const daily of [false,true]){
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:daily?'PW Agents':'Display mode',exact:true}).click();
  const surface=page.locator(daily?'.pw-agents-controls':'.pw-display-controls');
  await page.getByRole('combobox',{name:daily?'Agents theme':'Display theme',exact:true}).selectOption('bridge');
  const ship=surface.locator('.pw-ship--compact'),strip=surface.locator('.pw-display-strip');
  for(const expanded of [false,true]){
   if(expanded)await ship.locator('summary').click();
   const s=await ship.boundingBox(),c=await strip.boundingBox();
   assert.ok(s.x>=c.x+c.width,'Trek controls expand to the RIGHT of common controls');
   assert.ok(Math.abs(s.y-c.y)<2,'Trek controls align with the top of the common toolbar');
  }
  await checkHostTheme(page,surface,daily?'daily':'display');
  await page.screenshot({path:new URL(`../evidence/trek-controls-${daily?'daily':'display'}-wide.png`,import.meta.url).pathname});
  for(const width of [640,390]){
   await page.setViewportSize({width,height:500});
   const box=await surface.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y+box.height<=500);
   assert.ok(await surface.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'No horizontally clipped controls');
   const start=surface.locator('button').first();await start.focus();
   const count=await surface.locator('button:not(:disabled),select,summary').count();
   for(let i=0;i<count;i++){
    assert.ok(await surface.evaluate(e=>{
     const a=document.activeElement,r=a.getBoundingClientRect(),b=e.getBoundingClientRect();
     return e.contains(a)&&r.x>=b.x&&r.right<=b.right+1&&r.y>=b.y&&r.bottom<=b.bottom+1;
    }),'Tab-focused control stays visible inside the scrollable surface');
    await page.keyboard.press('Tab');
   }
   await page.screenshot({path:new URL(`../evidence/trek-controls-${daily?'daily':'display'}-${width}.png`,import.meta.url).pathname});
  }
  if(!daily)await page.keyboard.press('Escape');
 }
 check('Trek display/daily controls expand right, use opaque host palettes, and remain keyboard-accessible in narrow panes');
 assert.deepEqual(errors,[]);check('No uncaught browser errors');
}finally{await browser.close();await server?.close();}
