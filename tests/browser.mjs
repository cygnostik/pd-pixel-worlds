import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {startPreview} from '../scripts/preview.mjs';
const out=new URL('../evidence/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const server=process.env.PIXEL_WORLDS_URL?null:await startPreview();
const base=process.env.PIXEL_WORLDS_URL||server.url;
const checks=[];function ok(name){checks.push({name,passed:true});console.log('PASS',name);}
try{
 await page.goto(base);await page.getByRole('heading',{name:'Pixel Worlds',exact:true}).waitFor();
 assert.equal(await page.locator('.pw').getAttribute('data-mode'),'live');ok('Live mode is the default');
 await page.getByRole('button',{name:'Explore themes',exact:true}).click();
 assert.equal(await page.locator('.pw-agent').count(),6);
 await page.getByRole('button',{name:/Researcher/}).click();
 assert.match(await page.locator('.pw-selected-name').innerText(),/Researcher/);
 const buttons=await page.locator('.pw-world-tabs button').all();assert.equal(buttons.length,3);
 for(let i=0;i<buttons.length;i++){
  await buttons[i].click();await page.waitForTimeout(900);
  assert.equal(await page.locator('.pw-agent').count(),6);
  assert.equal(await page.locator('.pw-selected-name').innerText(),'Researcher');
  const colors=await page.locator('canvas').evaluate(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;const s=new Set();for(let n=0;n<p.length;n+=64)s.add(`${p[n]},${p[n+1]},${p[n+2]}`);return s.size;});
  assert.ok(colors>40,`Theme ${i} drew only ${colors} colors`);
  await page.screenshot({path:new URL(`theme-${i+1}-wide.png`,out).pathname,fullPage:true});
  await page.locator('.pw-world-card').screenshot({path:new URL(`theme-${i+1}-world.png`,out).pathname});
 }
 ok('All three worlds render; theme switching preserves selection and crew');
 await page.getByRole('button',{name:'Needs input',exact:true}).click();assert.match(await page.locator('.pw-status-pill').innerText(),/Needs input/);
 await page.getByRole('button',{name:'Error',exact:true}).click();assert.match(await page.locator('.pw-status-pill').innerText(),/Needs attention/);
 await page.getByRole('button',{name:'Working',exact:true}).click();assert.match(await page.locator('.pw-status-pill').innerText(),/Working/);
 await page.getByRole('button',{name:'Complete',exact:true}).click();assert.match(await page.locator('.pw-status-pill').innerText(),/Turn complete/);ok('Attention, failure, working, completion are distinct');
 await page.getByRole('button',{name:'Pause animation',exact:true}).click();
 const before=await page.locator('canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(250);
 const after=await page.locator('canvas').evaluate(c=>c.toDataURL());assert.equal(after,before);ok('Pause freezes the scene');
 await page.getByRole('button',{name:'Reduced motion',exact:true}).click();
 for(const width of [900,640,390]){
  await page.setViewportSize({width,height:1050});await page.waitForTimeout(150);
  assert.ok(await page.evaluate(()=>{const p=document.querySelector('.pw');return document.documentElement.scrollWidth<=innerWidth&&p.scrollWidth<=p.clientWidth+1;}),'No page or plugin-level horizontal overflow');
  assert.ok(await page.locator('.pw-search').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),'Search control remains inside the viewport');
  await page.screenshot({path:new URL(`responsive-${width}.png`,out).pathname,fullPage:true});
 }
 ok('Responsive 900/640/390px layouts keep controls in bounds');
 await page.getByRole('button',{name:'Live agents',exact:true}).click();assert.equal(await page.locator('.pw-agent').count(),0);ok('Demo entities never enter live state');
 await page.setViewportSize({width:1440,height:1080});
 await page.evaluate(()=>{
  const host=window.__pixelWorldsPreview.host;
  for(let i=0;i<27;i++)host.emit({type:'message.start',session_id:`fixture-${i}`,profile:'default',connection_id:'local',payload:{}});
 });
 await page.waitForTimeout(200);
 assert.equal(await page.locator('.pw-agent').count(),12);
 await page.getByRole('searchbox',{name:'Find an agent'}).fill('fixture-26');assert.equal(await page.locator('.pw-agent').count(),1);assert.match(await page.locator('.pw-agent-name').innerText(),/26$/);await page.getByRole('searchbox',{name:'Find an agent'}).fill('');
 await page.getByRole('button',{name:'Next',exact:true}).click();assert.equal(await page.locator('.pw-agent').count(),12);
 await page.getByRole('button',{name:'Next',exact:true}).click();assert.equal(await page.locator('.pw-agent').count(),3);
 await page.getByRole('button',{name:'Previous',exact:true}).click();assert.equal(await page.locator('.pw-agent').count(),12);ok('Live event adapter and pagination preserve all 27 agents');
 await page.evaluate(()=>{const host=window.__pixelWorldsPreview.host;host.emit({type:'tool.complete',session_id:'fixture-0',profile:'default',connection_id:'local',payload:{tool_id:'fixture-failure',name:'terminal',result:{error:'Illustrative failure'}}});host.emit({type:'message.complete',session_id:'fixture-0',profile:'default',connection_id:'local',payload:{status:'complete'}});});
 await page.getByRole('button',{name:'Previous',exact:true}).click();await page.locator('.pw-agent').first().click();
 assert.match(await page.locator('.pw-agent').first().innerText(),/Earlier attention/);
 for(const button of await page.locator('.pw-world-tabs button').all()){await button.click();assert.equal(await page.locator('.pw-attention').count(),1);}
 await page.getByRole('button',{name:'Dismiss local reminder',exact:true}).click();
 assert.match(await page.locator('.pw-status-pill').innerText(),/Turn complete/);ok('Sticky alert stays visible after completion; acknowledgement changes no job state');
 await page.evaluate(()=>window.__pixelWorldsPreview.host.state.gateway.set('disconnected'));await page.waitForTimeout(100);
 assert.match(await page.locator('.pw-banner').innerText(),/awaiting fresh evidence/);ok('Disconnect removes unsupported activity claims');
 await page.getByRole('button',{name:'Capabilities ↗',exact:true}).click();assert.equal(await page.evaluate(()=>window.__previewNavigation),'/skills');ok('Native capability navigation routes correctly');
 const listeners=await page.evaluate(()=>window.__pixelWorldsPreview.host.listenerCount());assert.ok(listeners>0);
 await page.evaluate(()=>window.__pixelWorldsPreview.unmount());await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__pixelWorldsPreview.host.listenerCount()),0);
 await page.evaluate(()=>window.__pixelWorldsPreview.mount());await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__pixelWorldsPreview.host.listenerCount()),listeners);ok('Unload/re-enable removes and restores exactly one event bridge');
 assert.deepEqual(errors,[]);ok('No uncaught browser errors');
 await writeFile(new URL('browser-results.json',out),JSON.stringify({boundary:'Real plugin registration and React UI; browser-only Button and SDK fixtures; no live backend execution.',checks,errors},null,2));
}finally{await browser.close();await server?.close();}
