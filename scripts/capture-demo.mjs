import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {startPreview} from './preview.mjs';
const server=await startPreview(),browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
 await page.goto(server.url);
 await page.getByRole('button',{name:'Explore themes',exact:true}).click();
 await page.getByRole('button',{name:'Display mode',exact:true}).click();
 await page.getByRole('combobox',{name:'Display theme'}).selectOption('bridge');
 await page.locator('.pw-display-exit').evaluate(e=>e.blur());
 await page.mouse.move(1000,700);
 await page.waitForTimeout(600);
 await mkdir(new URL('../docs/images/',import.meta.url),{recursive:true});
 await page.locator('.pw').screenshot({path:new URL('../docs/images/display-mode.png',import.meta.url).pathname});
 console.log('Saved demonstration-only display screenshot.');
}finally{await browser.close();await server.close();}
