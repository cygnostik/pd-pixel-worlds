import { W, H, painter } from './art/pixels.js';
import { ANCHORS, YARD, drawBackground } from './art/scenes.js';
import {drawBridgeRail,drawBridgeHelm} from './art/bridge-scene.js';
import {drawEngineering as drawEngineeringBackground,drawEngineeringForeground,drawEngineeringEffects,ENGINEERING_HOTSPOTS} from './art/engineering-scene.js';
import {drawBridgeEffects,BRIDGE_HOTSPOTS} from './art/ship-effects.js';
import {SHIP_ROOMS} from './ship-layout.js';
import { drawAgent, drawBadge, identity } from './art/characters.js';

export const THEMES=Object.freeze([
 Object.freeze({id:'office',title:'Office Space',subtitle:'Cubicles, coffee & a printer out back',accent:'#c2a77b',description:'A beige cubicle diorama with a sun-warmed service yard. Bats appear only for active, parent-linked teammates.'}),
 Object.freeze({id:'cafe',title:'Kitten Café',subtitle:'A little sunshine. A lot of paw work.',accent:'#c8a56f',description:'Quadruped kittens, oak floors, coffee plants and a pastry counter in a sunlit neighborhood café.'}),
 Object.freeze({id:'bridge',title:'The Next Generation',subtitle:'Bridge & Main Engineering',accent:'#bda2ab',description:'An Enterprise-D–inspired ship: warm bridge, luminous warp core, purposeful crew and playable LCARS.'}),
]);
export const CAPACITY=12;
export const WORLD_SIZE=Object.freeze({width:960,height:600});

/** Relationship evidence only. Concurrent activity alone never implies a team. */
function teamGroups(agents){
 const byId=new Map(agents.map(a=>[a.id,a]));const groups=new Map();
 for(const a of agents){if(!a.parentId||a.parentId===a.id)continue;const members=groups.get(a.parentId)||new Set();if(a.status==='active')members.add(a.id);if(byId.get(a.parentId)?.status==='active')members.add(a.parentId);groups.set(a.parentId,members);}
 return [...groups].filter(([,ids])=>ids.size>=2).map(([parentId,ids])=>({parentId,ids:agents.filter(a=>ids.has(a.id)).map(a=>a.id)}));
}
export function getTeamMembers(agents){return new Set(teamGroups(agents).flatMap(g=>g.ids));}

/**
 * Public API. Inputs are copied; no task state is generated or changed here.
 * resize uses CSS pixels + DPR. hitTest uses canvas-local CSS pixels.
 * getAgentRegions returns canvas-local CSS rectangles, including letterboxing.
 * setVisible(false) is for host pane visibility; document visibility is also honored.
 */
export function createWorld(canvas,{onSelect=()=>{},onMetrics=()=>{},ship=null}={}){
 if(!canvas?.getContext)throw new TypeError('createWorld requires a canvas');
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas2D is unavailable');
 const doc=canvas.ownerDocument||globalThis.document;
 const host=doc?.defaultView||globalThis;
 const request=host.requestAnimationFrame?.bind(host),cancel=host.cancelAnimationFrame?.bind(host);
 const makeSurface=()=>{let out;if(doc?.createElement)out=doc.createElement('canvas');else if(typeof OffscreenCanvas!=='undefined')out=new OffscreenCanvas(W,H);else throw new Error('An offscreen Canvas2D surface is required');out.width=W;out.height=H;return out;};
 const scene=makeSurface(),sc=scene.getContext('2d');
 const backgrounds=new Map(),positions=new Map();
 let state={theme:'office',realm:null,agents:[],selectedId:null,reducedMotion:false,paused:false,shipMode:'live'};
 const clockConsumer=Symbol('ship renderer');
 const isShip=()=>Boolean(ship&&state.theme==='bridge'&&!state.realm);
 const shipRoom=()=>ship?.getSnapshot().room||'bridge';
 const characterStyle=()=>state.realm?.characterStyle||state.theme;
 let width=960,height=600,dpr=1,scale=2,offsetX=0,offsetY=0,visible=true,destroyed=false;
 let frameId=null,lastFrame=-Infinity,lastTick=null,time=0,regions=[],items=[],teamwork=null,backgroundBuilds=0;
 let drawCount=0,frameMs=0,fps=0,measureStart=0,measureFrames=0,lastNotify=-Infinity;
 const now=()=>host.performance?.now?.()??Date.now();
 const isVisible=()=>visible&&!doc?.hidden;
 const animate=()=>!destroyed&&isVisible()&&!state.paused&&!state.reducedMotion;
 const report=()=>{const population=isShip()?ship.getSnapshot().populations[state.shipMode]:null,overflow=population?population.counts.offstage:Math.max(0,state.agents.length-items.length);return {theme:state.theme,room:isShip()?shipRoom():null,total:state.agents.length,visible:items.length,overflow,capacity:isShip()?SHIP_ROOMS[shipRoom()].stations.length:CAPACITY,visibleCount:items.length,totalCount:state.agents.length,overflowCount:overflow,roomCounts:population?.counts||null,fps,frameMs,renderMs:frameMs,frames:drawCount,backgroundBuilds,paused:state.paused,reducedMotion:state.reducedMotion,hidden:!isVisible(),teamwork:teamwork?{...teamwork,participants:[...teamwork.participants]}:null};};
 const notify=()=>{if(!destroyed)onMetrics(report());};
 function background(){if(state.realm)return state.realm.background;const room=isShip()?shipRoom():null,key=room?`ship:${room}`:state.theme;if(!backgrounds.has(key)){const surface=makeSurface(),context=surface.getContext('2d');if(room==='engineering')drawEngineeringBackground(context);else drawBackground(context,state.theme);backgrounds.set(key,surface);backgroundBuilds++;}return backgrounds.get(key);}
 function bridgeLayer(name,draw){const night=isShip()&&ship.getSnapshot().night,key=`bridge:${name}:${night}`;if(!backgrounds.has(key)){const surface=makeSurface(),context=surface.getContext('2d');draw(context);if(night){context.globalCompositeOperation='source-atop';context.fillStyle='#0a112c88';context.fillRect(0,0,W,H);context.globalCompositeOperation='source-over';}backgrounds.set(key,surface);}sc.drawImage(backgrounds.get(key),0,0);}
 function setItems(themeChanged=false){
  if(isShip()){items=ship.getFrame(state.shipMode).items;teamwork=null;return;}
  const selected=state.agents.find(a=>a.id===state.selectedId);let visibleAgents=state.agents.slice(0,CAPACITY);
  if(selected&&!visibleAgents.some(a=>a.id===selected.id))visibleAgents[CAPACITY-1]=selected;
  const group=state.theme==='office'?teamGroups(state.agents).find(g=>g.ids.filter(id=>visibleAgents.some(a=>a.id===id)).length>=2):null;
  const teamIds=group?group.ids.filter(id=>visibleAgents.some(a=>a.id===id)).slice(0,YARD.length):[];
  teamwork=group?{parentId:group.parentId,participants:teamIds,additionalMembers:group.ids.length-teamIds.length}:null;
  // Respect unique supplied slots; deterministically fill collisions and unspecified slots.
  const used=new Set();items=visibleAgents.map((agent,i)=>{
   const requested=Number.isInteger(agent.slot)&&agent.slot>=0&&agent.slot<CAPACITY?agent.slot:i;
   const index=!used.has(requested)?requested:Array.from({length:CAPACITY},(_,j)=>j).find(j=>!used.has(j));used.add(index);
   const teamIndex=teamIds.indexOf(agent.id),team=teamIndex>=0;
   const target=team?YARD[teamIndex]:(state.realm?.anchors||ANCHORS[state.theme])[index];let pos=positions.get(agent.id);
   if(!pos||themeChanged){pos={x:target[0],y:target[1],tx:target[0],ty:target[1],route:[]};positions.set(agent.id,pos);}
   if(pos.tx!==target[0]||pos.ty!==target[1]){
    // Use the service aisle and doorway instead of a direct path through cubicle walls.
    if(state.theme==='office'&&(pos.x>330)!==(target[0]>330)){
      pos.route=target[0]>330?[[pos.x,Math.min(276,pos.y+13)],[305,Math.min(276,pos.y+13)],[305,127],[338,127],[target[0],target[1]]]:[[338,127],[305,127],[305,Math.min(276,target[1]+13)],[target[0],Math.min(276,target[1]+13)],[target[0],target[1]]];
    }else pos.route=[[target[0],target[1]]];
    pos.tx=target[0];pos.ty=target[1];
   }
   if(state.reducedMotion){pos.x=pos.tx;pos.y=pos.ty;pos.route=[];}
   return {agent,index,team,teamIndex,position:pos,x:pos.x,y:pos.y,walking:false,atStation:pos.route.length===0};
  });
  const alive=new Set(state.agents.map(a=>a.id));for(const id of positions.keys())if(!alive.has(id))positions.delete(id);
 }
 function move(dt){
  for(const item of items){const p=item.position;item.walking=false;
   if(animate()&&p.route.length){const [x,y]=p.route[0],dx=x-p.x,dy=y-p.y,distance=Math.hypot(dx,dy),travel=dt*42;
    if(distance<=travel||distance<.5){p.x=x;p.y=y;p.route.shift();}else{p.x+=dx/distance*travel;p.y+=dy/distance*travel;item.walking=true;}
   }
   item.x=Math.round(p.x);item.y=Math.round(p.y);item.atStation=p.route.length===0;item.walking=!item.atStation;
  }
 }
 function render(dt=0){
  if(destroyed||!isVisible())return;
  const start=now();if(isShip())setItems();else move(dt);sc.imageSmoothingEnabled=false;sc.clearRect(0,0,W,H);sc.drawImage(background(),0,0);
  const shipFrame=isShip()?ship.getFrame(state.shipMode):null,bridge=state.theme==='bridge'&&(!shipFrame||shipFrame.room==='bridge');
  if(shipFrame){
   if(shipFrame.effects.night){sc.fillStyle='#0a112c88';sc.fillRect(0,0,W,H);}
   const effectPainter=({bridge:drawBridgeEffects,engineering:drawEngineeringEffects})[shipFrame.room];
   effectPainter(sc,state.reducedMotion?0:shipFrame.time,shipFrame.effects);
  }
  // Depth-sort crew; the aft-facing bridge also has a rail and foreground helm layer.
  const sorted=[...items].sort((a,b)=>a.y-b.y||a.index-b.index);
  const t=state.reducedMotion?0:time;
  let railPainted=false,helmPainted=false,layerIndex=0,shipForegroundPainted=false;
  const shipForeground=shipFrame?.room==='engineering'?{name:'engineering-foreground',draw:drawEngineeringForeground,afterY:280}:null;
  const style=characterStyle(),layers=state.realm?.layers||[];
  for(const item of sorted){
   if(shipForeground&&!shipForegroundPainted&&item.y>=shipForeground.afterY){bridgeLayer(shipForeground.name,shipForeground.draw);shipForegroundPainted=true;}
   while(layerIndex<layers.length&&item.y>=layers[layerIndex].afterY)sc.drawImage(layers[layerIndex++].image,0,0);
   if(bridge&&item.y>=160&&!railPainted){bridgeLayer('rail',drawBridgeRail);railPainted=true;}
   if(bridge&&shipFrame&&item.y>=286&&!helmPainted){bridgeLayer('helm',drawBridgeHelm);helmPainted=true;}
   drawAgent(sc,item,style,t,item.agent.id===state.selectedId);
  }
  while(layerIndex<layers.length)sc.drawImage(layers[layerIndex++].image,0,0);
  if(bridge){if(!railPainted)bridgeLayer('rail',drawBridgeRail);if(!helmPainted)bridgeLayer('helm',drawBridgeHelm);}
  if(shipForeground&&!shipForegroundPainted)bridgeLayer(shipForeground.name,shipForeground.draw);

  for(const item of sorted)drawBadge(sc,item,style,item.agent.id===state.selectedId);
  if(teamwork){const p=painter(sc);p.rect(350,93,108,13,'#65553ddd');p.text('LINKED TEAM WORK',356,97,'#ffebc0',6);}
  if(!shipFrame&&state.agents.length>CAPACITY){const p=painter(sc),s=`${items.length} IN SCENE · ${state.agents.length-items.length} IN LIST`;p.rect(151,286,181,12,'#303c38');p.text(s,160,289,'#eee4c9',6);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;
  // CSS owns the exterior so host theme switches also repaint paused/reduced-motion scenes.
  ctx.clearRect(0,0,width,height);ctx.drawImage(scene,offsetX,offsetY,W*scale,H*scale);
  regions=sorted.map(item=>({id:item.agent.id,x:offsetX+(item.x-(style==='cafe'?25:18))*scale,y:offsetY+(item.y-42)*scale,width:(style==='cafe'?53:40)*scale,height:49*scale,worldX:item.x*2,worldY:item.y*2,team:item.team}));
  drawCount++;frameMs=now()-start;measureFrames++;
  if(!measureStart)measureStart=start;
  if(start-measureStart>=1000){fps=Math.round(measureFrames*1000/(start-measureStart));measureStart=start;measureFrames=0;}
 }
 function tick(stamp){frameId=null;if(!animate())return;
  if(lastTick===null)lastTick=stamp;
  if(stamp-lastFrame>=1000/30-1){const dt=Math.min(.08,Math.max(0,(stamp-lastTick)/1000));time+=dt;lastTick=stamp;lastFrame=stamp;if(isShip())ship.tick(stamp,state.shipMode,{consumer:clockConsumer});render(dt);if(stamp-lastNotify>1000){lastNotify=stamp;notify();}}
  if(animate()&&request)frameId=request(tick);
 }
 function sync(){if(!animate()){if(frameId!==null&&cancel)cancel(frameId);frameId=null;lastTick=null;fps=0;}else if(frameId===null&&request){lastTick=null;lastFrame=-Infinity;frameId=request(tick);}}
 function update(patch={}){
  if(destroyed)return;const before=state.theme,beforeRealm=state.realm,beforeSelection=state.selectedId,beforeMode=state.shipMode;
  // Imported descriptors come from createRealmLibrary, never a mutable global
  // registry. A package cannot shadow a builtin ID or supply character code.
  const id=Object.hasOwn(patch,'theme')?(typeof patch.theme==='object'?patch.theme?.id:patch.theme):state.theme;
  const realm=Object.hasOwn(patch,'realm')?patch.realm:state.realm;
  if(THEMES.some(t=>t.id===id)){state.theme=id;state.realm=null;}
  else if(realm&&realm.id===id&&/^import:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)&&THEMES.some(t=>t.id===realm.characterStyle)&&realm.background&&Array.isArray(realm.anchors)&&realm.anchors.length===CAPACITY){state.theme=id;state.realm=realm;}
  else if(Object.hasOwn(patch,'realm')&&patch.realm===null&&state.realm){state.theme='office';state.realm=null;}
  if(Object.hasOwn(patch,'agents')){const seen=new Set();state.agents=(Array.isArray(patch.agents)?patch.agents:[]).filter(a=>a&&a.id!==undefined&&a.id!==null&&!seen.has(a.id)&&seen.add(a.id)).map(a=>({...a}));}
  for(const key of ['selectedId','reducedMotion','paused'])if(Object.hasOwn(patch,key))state[key]=key==='selectedId'?patch[key]:Boolean(patch[key]);
  if(Object.hasOwn(patch,'shipMode'))state.shipMode=patch.shipMode==='demo'?'demo':'live';
  if(Object.hasOwn(patch,'visible'))visible=Boolean(patch.visible);
  if(before!==state.theme||beforeMode!==state.shipMode)ship?.releaseClock(clockConsumer);
  if(isShip()){if(Object.hasOwn(patch,'agents'))ship.sync(patch.agents,state.shipMode);ship.tick(now(),state.shipMode,{paused:state.paused,reducedMotion:state.reducedMotion,hidden:!isVisible(),consumer:clockConsumer});}
  setItems(before!==state.theme||beforeRealm!==state.realm);
  // Streaming snapshots share the 30fps clock; direct controls still repaint immediately.
  if(!request||!animate()||frameId===null||before!==state.theme||beforeRealm!==state.realm||beforeSelection!==state.selectedId)render();
  sync();notify();
 }
 function resize(w,h,pixelRatio=host.devicePixelRatio||1){
  if(destroyed)return;width=Math.max(1,Number(w)||960);height=Math.max(1,Number(h)||600);dpr=Math.max(1,Math.min(4,Number(pixelRatio)||1));
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  // No CSS ownership: the host controls layout. A centered contain camera keeps every hit aligned.
  scale=Math.min(width/W,height/H);offsetX=(width-W*scale)/2;offsetY=(height-H*scale)/2;render();
 }
 function hitTest(x,y){if(destroyed||!isVisible())return null;for(let i=regions.length-1;i>=0;i--){const r=regions[i];if(x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<=r.y+r.height)return r.id;}return null;}
 function getSceneRegions(){if(!isShip())return [];const hotspots=({bridge:BRIDGE_HOTSPOTS,engineering:ENGINEERING_HOTSPOTS})[shipRoom()];return hotspots.map(h=>{const [x,y,w,hgt]=h.rect||[h.x,h.y,h.width,h.height];return {...h,x:offsetX+x*scale,y:offsetY+y*scale,width:w*scale,height:hgt*scale};});}
 function sceneHit(x,y){return getSceneRegions().find(r=>x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<=r.y+r.height);}
 function select(event){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;const x=(event.clientX-r.left)*width/r.width,y=(event.clientY-r.top)*height/r.height,id=hitTest(x,y);if(id!==null)onSelect(id);else{const hotspot=sceneHit(x,y);if(hotspot)ship.trigger(hotspot.action);}}
 function hover(event){if(!canvas.style)return;const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)*width/(r.width||1),y=(event.clientY-r.top)*height/(r.height||1);canvas.style.cursor=hitTest(x,y)!==null||sceneHit(x,y)?'pointer':'default';}
 function visibilityChanged(){if(isShip())ship.tick(now(),state.shipMode,{paused:state.paused,reducedMotion:state.reducedMotion,hidden:!isVisible(),consumer:clockConsumer});if(isVisible())render();sync();notify();}
 function setVisible(value){if(destroyed)return;visible=Boolean(value);visibilityChanged();}
 const stopShip=ship?.subscribe(()=>{if(isShip()){if(state.reducedMotion&&!state.paused&&isVisible())ship.tick(now(),state.shipMode,{reducedMotion:true,consumer:clockConsumer});setItems();if(!animate())render();notify();}});
 function destroy(){if(destroyed)return;destroyed=true;stopShip?.();ship?.releaseClock(clockConsumer);if(frameId!==null&&cancel)cancel(frameId);frameId=null;canvas.removeEventListener('pointerdown',select);canvas.removeEventListener('pointermove',hover);doc?.removeEventListener?.('visibilitychange',visibilityChanged);backgrounds.clear();positions.clear();regions=[];items=[];state.realm=null;scene.width=1;scene.height=1;}
 canvas.addEventListener('pointerdown',select);canvas.addEventListener('pointermove',hover);doc?.addEventListener?.('visibilitychange',visibilityChanged);
 resize(canvas.clientWidth||960,canvas.clientHeight||600,host.devicePixelRatio||1);sync();
 return {update,resize,setVisible,destroy,hitTest,getMetrics:report,getAgentRegions:()=>regions.map(r=>({...r})),getSceneRegions,render:()=>render(),get capacity(){return isShip()?SHIP_ROOMS[shipRoom()].stations.length:CAPACITY;}};
}
