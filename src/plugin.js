import React,{useSyncExternalStore} from 'react';
import {host,Button,ROUTES_AREA,SIDEBAR_NAV_AREA,PALETTE_AREA,STATUSBAR_AREAS} from '@hermes/plugin-sdk';
import {createRuntime} from './runtime.js';
import {connectHermes} from './bridge.js';
import {PixelWorlds} from './app.js';
import {counts} from './ui-model.js';
const h=React.createElement;
function Chip({runtime}){const s=useSyncExternalStore(runtime.subscribe,runtime.getSnapshot,runtime.getSnapshot);const c=counts(s.agents);return h(Button,{type:'button',title:`Pixel Worlds · ${c.active} working · ${c.attention} need attention`,onClick:()=>host.navigate('/pixel-worlds'),style:{fontSize:10,padding:'0 6px',height:22}},`◇ Worlds ${c.active}${c.attention?` · ! ${c.attention}`:''}`);}
export default {
 id:'pixel-worlds',name:'Pixel Worlds',description:'A live agent crew in Office Space, Kitten Café, or a TNG bridge. Theme-independent Hermes telemetry.',
 register(ctx){
  const runtime=createRuntime();
  if(typeof ctx.onDispose!=='function')throw new Error('Pixel Worlds needs the Desktop plugin cleanup API.');
  const stop=connectHermes(host,runtime);
  ctx.onDispose(()=>{stop();runtime.destroy?.();});
  ctx.register({id:'world-page',area:ROUTES_AREA,title:'Pixel Worlds',data:{path:'/pixel-worlds'},render:()=>h(PixelWorlds,{runtime,storage:ctx.storage,host})});
  ctx.register({id:'world-nav',area:SIDEBAR_NAV_AREA,data:{path:'/pixel-worlds',label:'Pixel Worlds',codicon:'globe'}});
  ctx.register({id:'world-chip',area:STATUSBAR_AREAS.right,order:109,render:()=>h(Chip,{runtime})});
  ctx.register({id:'world-open',area:PALETTE_AREA,data:{id:'pixel-worlds.open',label:'Pixel Worlds: Open live agent worlds',keywords:['pixel','office','kitten','cafe','trek','tng'],run:()=>host.navigate('/pixel-worlds')}});
 }
};
