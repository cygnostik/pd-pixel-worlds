export const SHIP_ROOM_LABELS=Object.freeze({bridge:'Bridge',engineering:'Engineering'});
const ROOM_IDS=Object.keys(SHIP_ROOM_LABELS);
const ORDER=['bridge','bridge','engineering','bridge','engineering','bridge','engineering'];
const DURATIONS={preparing:.3,seating:.3,opening:.45,crossing:.6,closing:.4,transit:1.1,'arrival-opening':.45,emerging:.6,'arrival-closing':.4};
const clamp=n=>Math.max(0,Math.min(1,n));
const portalFacing=(portal,inward)=>{const dx=(portal.x-portal.approach[0])*(inward?1:-1),dy=(portal.y-portal.approach[1])*(inward?1:-1);return Math.abs(dx)>Math.abs(dy)?dx>0?'east':'west':dy>0?'south':'north';};
const crossingTime=portal=>Math.max(DURATIONS.crossing,Math.hypot(portal.x-portal.approach[0],portal.y-portal.approach[1])/42);
const attentive=a=>['waiting','error'].includes(a.attention)||['waiting','error'].includes(a.status);
const resting=a=>['idle','done'].includes(a.status)&&a.verified!==false&&!attentive(a);
const freshPopulation=()=>({records:new Map(),queue:[],trip:null,time:0,lastStamp:null,nextIdle:15,source:null,drivers:new Map()});

/** Local stage direction only. No host, network, task or telemetry mutation. */
export function createShip({rooms,storage=null}={}){
 if(!rooms||ROOM_IDS.some(id=>!rooms[id]?.stations?.length||!rooms[id]?.portal))throw new TypeError('Ship needs Bridge and Engineering layouts');
 let saved;try{saved=storage?.get('ship-settings-v1');}catch{/* Optional cosmetic persistence. */}
 let settings={room:ROOM_IDS.includes(saved?.room)?saved.room:'bridge',night:saved?.night===true,energy:['quiet','normal','playful'].includes(saved?.energy)?saved.energy:'normal'};
 const populations={live:freshPopulation(),demo:freshPopulation()},listeners=new Set(),selectedIds={live:null,demo:null};
 let snapshot,revision=0,lastAction='',disposed=false,visualTime=0,visualStamp=null;
 const effects={pulse:0,diagnostic:0,lift:0};
 const effectLength={pulse:3,diagnostic:4,lift:1.5};
 const getPopulation=mode=>populations[mode==='demo'?'demo':'live'];
 function rebaseInactiveClocks(){
  for(const p of Object.values(populations))if(![...p.drivers.values()].some(Boolean))p.lastStamp=null;
  if(Object.values(populations).every(p=>p.lastStamp===null))visualStamp=null;
 }
 function summarize(p){
  const counts={bridge:0,engineering:0,transit:0,offstage:0};
  const locations=[...p.records.values()].map(r=>{counts[r.room]++;return Object.freeze({id:r.agent.id,room:r.room,destination:p.trip?.id===r.agent.id?p.trip.to:null,phase:r.phase});});
  return Object.freeze({total:p.records.size,counts:Object.freeze(counts),locations:Object.freeze(locations),activeTripId:p.trip?.id??null});
 }
 function publish(){
  if(disposed)return;
  snapshot=Object.freeze({...settings,revision:++revision,lastAction,selectedIds:Object.freeze({...selectedIds}),populations:Object.freeze({live:summarize(populations.live),demo:summarize(populations.demo)})});
  for(const fn of listeners)fn();
 }
 function persist(){try{storage?.set('ship-settings-v1',{room:settings.room,night:settings.night,energy:settings.energy});}catch{/* Still usable for this session. */}}
 function freeStation(p,room){
  return rooms[room].stations.find(s=>![...p.records.values()].some(r=>r.room===room&&r.station?.id===s.id)&&!(p.trip?.to===room&&p.trip.target.id===s.id));
 }
 function stationRecord(r,room,station){Object.assign(r,{room,station,x:station.x,y:station.y,facing:station.facing||'south',seated:station.seated===true,phase:'station',walking:false,route:[]});}
 function place(p,r){
  const start=[...p.records.values()].filter(v=>v.room!=='offstage').length%ORDER.length;
  const candidates=[...ORDER.slice(start),...ORDER.slice(0,start),...ROOM_IDS];
  for(const room of candidates){const station=freeStation(p,room);if(station){stationRecord(r,room,station);return true;}}
  return false;
 }
 function fillOverflow(p){for(const r of p.records.values())if(r.room==='offstage')place(p,r);}
 function phase(p,value){const r=p.records.get(p.trip.id);r.phase=value;p.trip.elapsed=0;r.walking=value==='walking-out'||value==='walking-in'||value==='crossing'||value==='emerging';if(value==='crossing')r.facing=portalFacing(rooms[p.trip.from].portal,true);if(value==='emerging')r.facing=portalFacing(rooms[p.trip.to].portal,false);publish();}
 function startNext(p){
  if(p.trip)return;
  while(p.queue.length){
   const request=p.queue.shift(),r=p.records.get(request.id);if(!r||r.room===request.to)continue;
   const target=freeStation(p,request.to);if(!target){lastAction=`${SHIP_ROOM_LABELS[request.to]} is full. Crew stays at its current station.`;publish();continue;}
   if(r.room==='offstage'){stationRecord(r,request.to,target);lastAction='Off-stage crew placed at a free station.';publish();continue;}
   p.trip={id:r.agent.id,from:r.room,to:request.to,origin:r.station,target,elapsed:0,manual:request.manual,trail:[[...(r.station.stand||[r.x,r.y])]],releaseFrom:[r.x,r.y]};
   r.seated=Boolean(r.station.stand&&r.station.seated);r.route=(r.station.exitPath||[]).map(point=>[...point]);
   const approach=rooms[r.room].portal.approach;
   if(!r.route.length||r.route.at(-1)[0]!==approach[0]||r.route.at(-1)[1]!==approach[1])r.route.push([...approach]);
   phase(p,'preparing');break;
  }
 }
 function finish(p){
  if(!p.trip)return;const trip=p.trip,r=p.records.get(trip.id);
  if(r){stationRecord(r,trip.to,trip.target);r.manualUntil=p.time+(trip.manual?90:30);}
  p.trip=null;fillOverflow(p);publish();startNext(p);
 }
 function walk(r,dt,trail=null){
  let distanceLeft=dt*42;
  while(r.route.length&&distanceLeft>0){
   const [x,y]=r.route[0],dx=x-r.x,dy=y-r.y,distance=Math.hypot(dx,dy);
   if(distance<.01){r.x=x;r.y=y;r.route.shift();continue;}
   r.facing=Math.abs(dx)>Math.abs(dy)?dx>0?'east':'west':dy>0?'south':'north';
   if(distance<=distanceLeft){r.x=x;r.y=y;r.route.shift();distanceLeft-=distance;trail?.push([x,y]);}
   else{r.x+=dx/distance*distanceLeft;r.y+=dy/distance*distanceLeft;distanceLeft=0;}
  }
  return !r.route.length;
 }
 function seat(p){
  const trip=p.trip,r=p.records.get(trip.id);trip.seatFrom=[r.x,r.y];r.seated=trip.target.seated===true;r.facing=trip.target.facing||'south';phase(p,'seating');
 }
 function runTrip(p,dt){
  const trip=p.trip;if(!trip)return;
  const r=p.records.get(trip.id);if(!r){p.trip=null;startNext(p);return;}
  // Automatic idle visits yield before departure; after crossing, finish safely.
  if(!trip.manual&&!resting(r.agent)&&['preparing','walking-out','opening'].includes(r.phase)){
   if(r.phase==='preparing'){
    trip.to=trip.from;trip.target=trip.origin;trip.manual=true;
    if(trip.origin.stand&&Math.hypot(r.x-trip.origin.x,r.y-trip.origin.y)>.01)seat(p);else finish(p);return;
   }
   r.route=trip.trail.slice().reverse().map(q=>[...q]);
   trip.target=trip.origin;trip.to=trip.from;phase(p,'walking-in');trip.manual=true;
  }
  if(r.phase==='walking-out'){if(walk(r,dt,trip.trail))phase(p,'opening');return;}
  if(r.phase==='walking-in'){if(walk(r,dt)){if(trip.target.stand)seat(p);else finish(p);}return;}
  trip.elapsed+=dt;
  if(r.phase==='preparing'&&trip.origin.stand){
   const progress=clamp(trip.elapsed/DURATIONS.preparing);r.x=trip.releaseFrom[0]+(trip.origin.stand[0]-trip.releaseFrom[0])*progress;r.y=trip.releaseFrom[1]+(trip.origin.stand[1]-trip.releaseFrom[1])*progress;
  }
  if(r.phase==='seating'){
   const progress=clamp(trip.elapsed/DURATIONS.seating);r.x=trip.seatFrom[0]+(trip.target.x-trip.seatFrom[0])*progress;r.y=trip.seatFrom[1]+(trip.target.y-trip.seatFrom[1])*progress;
  }
  const portal=rooms[trip.from].portal,destination=rooms[trip.to].portal;
  if(r.phase==='crossing'){
   const progress=clamp(trip.elapsed/crossingTime(portal));r.x=portal.approach[0]+(portal.x-portal.approach[0])*progress;r.y=portal.approach[1]+(portal.y-portal.approach[1])*progress;
  }
  if(r.phase==='emerging'){
   const progress=clamp(trip.elapsed/crossingTime(destination));r.x=destination.x+(destination.approach[0]-destination.x)*progress;r.y=destination.y+(destination.approach[1]-destination.y)*progress;
  }
  if(trip.elapsed<(r.phase==='crossing'?crossingTime(portal):r.phase==='emerging'?crossingTime(destination):DURATIONS[r.phase]??Infinity))return;
  switch(r.phase){
   case 'preparing':r.seated=false;phase(p,'walking-out');break;
   case 'seating':finish(p);break;
   case 'opening':phase(p,'crossing');break;
   case 'crossing':r.room='transit';phase(p,'closing');break;
   case 'closing':phase(p,'transit');break;
   case 'transit':phase(p,'arrival-opening');break;
   case 'arrival-opening':r.room=trip.to;r.x=destination.x;r.y=destination.y;phase(p,'emerging');break;
   case 'emerging':phase(p,'arrival-closing');break;
   case 'arrival-closing':r.route=[...(trip.target.exitPath||[]).slice().reverse().map(q=>[...q]),[...(trip.target.stand||[trip.target.x,trip.target.y])]];phase(p,'walking-in');break;
  }
 }
 function idleVisit(p){
  if(settings.energy==='quiet'||p.trip||p.queue.length||p.time<p.nextIdle)return;
  p.nextIdle=p.time+(settings.energy==='playful'?18:40);
  const r=[...p.records.values()].find(r=>ROOM_IDS.includes(r.room)&&resting(r.agent)&&p.time>=(r.manualUntil||0));
  if(!r)return;
  const destinations=ROOM_IDS.filter(id=>id!==r.room);
  const to=destinations.find(id=>freeStation(p,id));if(to){p.queue.push({id:r.agent.id,to,manual:false});startNext(p);}
 }
 function doorState(p,room){
  const trip=p.trip;if(!trip)return 0;const r=p.records.get(trip.id);if(!r)return 0;
  if(room===trip.from){if(r.phase==='opening')return clamp(trip.elapsed/DURATIONS.opening);if(r.phase==='crossing')return 1;if(r.phase==='closing')return 1-clamp(trip.elapsed/DURATIONS.closing);}
  if(room===trip.to){if(r.phase==='arrival-opening')return clamp(trip.elapsed/DURATIONS['arrival-opening']);if(r.phase==='emerging')return 1;if(r.phase==='arrival-closing')return 1-clamp(trip.elapsed/DURATIONS['arrival-closing']);}
  return 0;
 }
 publish();
 return {
  getSnapshot:()=>snapshot,
  subscribe(fn){if(disposed)return()=>{};listeners.add(fn);return()=>listeners.delete(fn);},
  sync(agents,mode='live'){
   if(disposed)return;const p=getPopulation(mode);if(p.source===agents)return;p.source=agents;
   const valid=new Map((Array.isArray(agents)?agents:[]).filter(a=>a&&typeof a.id==='string').map(a=>[a.id,a]));
   for(const id of p.records.keys())if(!valid.has(id))p.records.delete(id);
   const selectionKey=mode==='demo'?'demo':'live';if(selectedIds[selectionKey]&&!valid.has(selectedIds[selectionKey]))selectedIds[selectionKey]=null;
   p.queue=p.queue.filter(q=>valid.has(q.id));if(p.trip&&!valid.has(p.trip.id))p.trip=null;
   const ordered=[...valid.values()].sort((a,b)=>(a.slot??0)-(b.slot??0)||a.id.localeCompare(b.id));
   for(const agent of ordered){const r=p.records.get(agent.id);if(r)r.agent=agent;else{const row={agent,room:'offstage',station:null,x:0,y:0,phase:'offstage',facing:'south',seated:false,walking:false,route:[],manualUntil:0};place(p,row);p.records.set(agent.id,row);}}
   runTrip(p,0);fillOverflow(p);publish();startNext(p);
  },
  setRoom(room){if(disposed||!ROOM_IDS.includes(room))return false;if(settings.room!==room){settings={...settings,room};persist();publish();}return true;},
  set(key,value){
   if(disposed||!['night','energy'].includes(key))return false;
   if(key==='energy'&&!['quiet','normal','playful'].includes(value))return false;
   const next=key==='energy'?value:Boolean(value);if(settings[key]===next)return true;
   settings={...settings,[key]:next};persist();publish();return true;
  },
  trigger(action){
   if(disposed)return false;
   if(action==='reset'){for(const key of Object.keys(effects))effects[key]=0;lastAction='Scene effects cleared. Agent work is unchanged.';publish();return true;}
   if(!Object.hasOwn(effects,action))return false;
   if(action==='pulse'){settings={...settings,room:'engineering'};persist();}
   effects[action]=visualTime+effectLength[action];lastAction=({pulse:'Warp-core resonance · decorative pulse',diagnostic:'LCARS diagnostic · visual simulation',lift:'Turbolift ready · choose a room'})[action];publish();return true;
  },
  transfer(id,to,mode='live'){
   if(disposed||!ROOM_IDS.includes(to))return {ok:false,message:'Unknown destination.'};const p=getPopulation(mode),r=p.records.get(id);
   if(!r)return {ok:false,message:'Choose an observed crew member.'};
   if(p.trip?.id===id)return {ok:false,message:'This crew member is already traveling.'};
   if(r.room===to)return {ok:false,message:'Already in this room.'};
   if(!freeStation(p,to))return {ok:false,message:`${SHIP_ROOM_LABELS[to]} is full.`};
   p.queue=p.queue.filter(q=>q.id!==id);p.queue.push({id,to,manual:true});lastAction=`Visual assignment to ${SHIP_ROOM_LABELS[to]}. Actual work is unchanged.`;publish();startNext(p);return {ok:true,message:lastAction};
  },
  select(id,mode='live'){const key=mode==='demo'?'demo':'live';if(id!==null&&!populations[key].records.has(id))return false;if(selectedIds[key]!==id){selectedIds[key]=id;publish();}return true;},
  locate(id,mode='live'){
   const p=getPopulation(mode),r=p.records.get(id);if(!r)return false;
   const room=r.room==='transit'?p.trip?.to:r.room;
   if(!ROOM_IDS.includes(room)){lastAction='This crew member is off-stage. Choose a free room to place them.';publish();return false;}
   return this.setRoom(room);
  },
  releaseClock(consumer=null){for(const p of Object.values(populations))p.drivers.delete(consumer);rebaseInactiveClocks();},
  tick(stamp,mode='live',{paused=false,reducedMotion=false,hidden=false,consumer=null}={}){
   if(disposed||!Number.isFinite(stamp))return;const p=getPopulation(mode);
   p.drivers.set(consumer,!paused&&!hidden&&!reducedMotion);rebaseInactiveClocks();
   if(paused||hidden)return;
   if(reducedMotion){let limit=p.records.size+1;while(p.trip&&limit-->0)finish(p);return;}
   const dt=p.lastStamp===null?0:Math.max(0,Math.min(.08,(stamp-p.lastStamp)/1000));p.lastStamp=Math.max(stamp,p.lastStamp??stamp);
   if(visualStamp!==null)visualTime+=Math.max(0,Math.min(.08,(stamp-visualStamp)/1000));visualStamp=Math.max(stamp,visualStamp??stamp);
   if(!dt)return;p.time+=dt;runTrip(p,dt);idleVisit(p);
  },
  getFrame(mode='live'){
   const p=getPopulation(mode),room=settings.room;
   const items=[...p.records.values()].filter(r=>r.room===room).map(r=>({agent:r.agent,index:rooms[room].stations.indexOf(r.station),x:Math.round(r.x),y:Math.round(r.y),facing:r.facing,seated:r.seated,walking:r.walking,atStation:r.phase==='station',pose:r.walking?'walk':resting(r.agent)?'padd':r.agent.status==='active'?'work':'inspect',phase:r.phase,team:false}));
   return {room,time:visualTime,items,effects:{night:settings.night,pulse:clamp((effects.pulse-visualTime)/effectLength.pulse),diagnostic:clamp((effects.diagnostic-visualTime)/effectLength.diagnostic),door:rooms[room].portal.offscreen?0:Math.max(doorState(p,room),clamp((effects.lift-visualTime)/effectLength.lift))},counts:summarize(p).counts,total:p.records.size};
  },
  dispose(){disposed=true;listeners.clear();for(const p of Object.values(populations)){p.records.clear();p.drivers.clear();p.queue=[];p.trip=null;}},
 };
}
