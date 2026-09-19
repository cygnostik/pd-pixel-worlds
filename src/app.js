import React, {useState,useEffect,useRef,useMemo,useSyncExternalStore} from 'react';
import { Button } from '@hermes/plugin-sdk';
import { createWorld, THEMES } from './world.js';
import { REALM_LIMITS } from './realm-packages.js';
import { counts, selectAgents, demonstration, sessionTarget, attentionStatus } from './ui-model.js';
import { styles } from './styles.js';
const h=React.createElement;
const STATE={active:['◆','Working'],waiting:['!','Needs input'],error:['×','Needs attention'],done:['✓','Turn complete'],idle:['○','Idle'],queued:['◇','Queued'],unknown:['?','Unverified']};
const COLORS=['#bba27c','#c58f72','#b3a4c7'];
function Action({children,...props}){return h(Button,{type:'button',...props},children);}
function Mark({status}){return h('span',{className:'pw-mark','aria-hidden':true},(STATE[status]||STATE.unknown)[0]);}
function useReducedMotion(){const [reduced,set]=useState(()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false);useEffect(()=>{const m=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>set(m.matches);m.addEventListener('change',change);return()=>m.removeEventListener('change',change);},[]);return reduced;}
export function Scene({theme,realm=null,agents,selectedId,onSelect,reducedMotion,paused,onMetrics,displayMode}){
 const canvas=useRef(null),container=useRef(null),renderer=useRef(null),latest=useRef(null),visible=useRef(true);
 latest.current={theme,realm,agents,selectedId,reducedMotion,paused};
 useEffect(()=>{
   visible.current=true;
   const world=createWorld(canvas.current,{onSelect,onMetrics});renderer.current=world;
   const update=()=>world.update({...latest.current,paused:latest.current.paused||!visible.current||document.hidden});
   const resize=()=>{const r=container.current.getBoundingClientRect();world.resize(r.width,r.height,window.devicePixelRatio||1);update();};
   const observer=new ResizeObserver(resize);observer.observe(container.current);
   const intersection=new IntersectionObserver(entries=>{visible.current=entries[0]?.isIntersecting!==false;update();});intersection.observe(container.current);
   document.addEventListener('visibilitychange',update);resize();
   return()=>{observer.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',update);world.destroy();renderer.current=null;};
 },[onSelect,onMetrics]);
 useEffect(()=>{renderer.current?.update({...latest.current,paused:paused||!visible.current||document.hidden});},[theme,realm,agents,selectedId,reducedMotion,paused]);
 return h('div',{className:'pw-scene-inner',ref:container},h('canvas',{ref:canvas,role:'img','aria-label':`${realm?.title||THEMES.find(t=>t.id===theme)?.title||theme} world. ${agents.length} agents on stage. ${displayMode?'Return to Worlds for the accessible agent roster.':'Select agents using the accessible list below.'}`}));
}
// One preference store per registration keeps simultaneously mounted routes in sync.
export function createWorldPreferences(storage){
 const read=(key,fallback)=>{try{return storage.get(key)??fallback;}catch{return fallback;}};
 let snapshot={theme:read('theme',THEMES[0].id),paused:read('paused',false)===true,reducedMotion:read('reducedMotion',false)===true};
 const listeners=new Set();
 return {getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},set(key,value){try{storage.set(key,value);}catch{/* Session preferences still work if persistence is unavailable. */}snapshot={...snapshot,[key]:value};listeners.forEach(fn=>fn());},dispose:()=>listeners.clear()};
}
function useWorldSettings(preferences,realmLibrary){
 const settings=useSyncExternalStore(preferences.subscribe,preferences.getSnapshot,preferences.getSnapshot);
 const imported=useSyncExternalStore(realmLibrary.subscribe,realmLibrary.getSnapshot,realmLibrary.getSnapshot);
 const themes=useMemo(()=>[...THEMES,...imported],[imported]);
 useEffect(()=>{let active=true;realmLibrary.ready.then(()=>{if(active&&![...THEMES,...realmLibrary.getSnapshot()].some(t=>t.id===preferences.getSnapshot().theme))preferences.set('theme',THEMES[0].id);});return()=>{active=false;};},[realmLibrary,preferences]);
 return {...settings,themes,realm:imported.find(t=>t.id===settings.theme)||null,setTheme:value=>preferences.set('theme',value),setPaused:value=>preferences.set('paused',typeof value==='function'?value(settings.paused):value),setMotion:value=>preferences.set('reducedMotion',value)};
}
function RealmManager({realmLibrary,realm,setTheme,openExternal}){
 const input=useRef(null),mounted=useRef(true);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false);
 useEffect(()=>{mounted.current=true;realmLibrary.ready.then(()=>{if(mounted.current&&realmLibrary.error){setError(true);setMessage(`Some saved realms could not be restored: ${realmLibrary.error.message}`);}});return()=>{mounted.current=false;};},[realmLibrary]);
 async function importFile(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  setBusy(true);setMessage('');setError(false);
  try{if(file.size>REALM_LIMITS.maxFileBytes)throw new Error('File exceeds the realm package size limit (1 MB).');const imported=await realmLibrary.importText(await file.text());if(mounted.current){setTheme(imported.id);setMessage(`Imported ${imported.title}.`);}}
  catch(e){if(mounted.current){setError(true);setMessage(`Could not import realm: ${e.message||e}`);}}
  finally{if(mounted.current)setBusy(false);}
 }
 async function remove(){setBusy(true);setMessage('');setError(false);try{await realmLibrary.remove(realm.id);if(mounted.current){setTheme(THEMES[0].id);setMessage(`Removed ${realm.title} from this library.`);}}catch(e){if(mounted.current){setError(true);setMessage(`Could not remove realm: ${e.message||e}`);}}finally{if(mounted.current)setBusy(false);}}
 async function browse(){try{await openExternal('https://github.com/cygnostik/pd-pixel-worlds/blob/main/realms/README.md');}catch(e){setError(true);setMessage(`Could not open realm gallery: ${e.message||e}`);}}
 return h('section',{className:'pw-realm-manager','aria-label':'Realm library'},h('div',{className:'pw-tools'},h(Action,{className:'pw-primary',onClick:browse},'Browse realms'),h(Action,{onClick:()=>input.current?.click(),disabled:busy},busy?'Importing…':'Import realm'),realm&&h(Action,{onClick:remove,disabled:busy,title:`Remove ${realm.title} from your imported library`},'Remove selected realm'),h('input',{ref:input,type:'file',accept:'.pwrealm.json,.json,application/json',hidden:true,'aria-label':'Import realm file',onChange:importFile})),h('span',{className:'pw-caption'},'Import a .pwrealm.json package. Duplicate IDs are rejected; remove a realm explicitly before replacing it.'),message&&h('p',{role:error?'alert':'status',className:'pw-notice'},message));
}
export function PixelWorlds({runtime,storage,host,realmLibrary,preferences,openExternal}){
 const snapshot=useSyncExternalStore(runtime.subscribe,runtime.getSnapshot,runtime.getSnapshot);
 const {theme,setTheme,paused,setPaused,reducedMotion:motion,setMotion,themes,realm}=useWorldSettings(preferences,realmLibrary);
 const [mode,setMode]=useState('live');
 const [demo,setDemo]=useState(demonstration);
 const [selectedId,setSelected]=useState(null);

 const [displayMode,setDisplayMode]=useState(()=>{try{return storage.get('displayMode')===true;}catch{return false;}});
 const root=useRef(null),wasDisplay=useRef(false);

 const [page,setPage]=useState(0),[query,setQuery]=useState('');
 const [routes,setRoutes]=useState([]),[notice,setNotice]=useState(''),[opening,setOpening]=useState(false);
 const metrics=useRef(null);
 const systemReduced=useReducedMotion();
 const data=mode==='demo'?demo:snapshot;
 const agents=data.agents||[];
 const stats=counts(agents);
 const list=useMemo(()=>selectAgents(agents,{page,query}),[agents,page,query]);
 const selected=agents.find(a=>a.id===selectedId)||null;
 const nameCounts=useMemo(()=>{const c=new Map();for(const a of agents){const n=a.name||a.profile;c.set(n,(c.get(n)||0)+1);}return c;},[agents]);
 const world=themes.find(t=>t.id===theme)||THEMES[0];
 const target=selected?sessionTarget(selected,routes):null;
 const onSelect=useMemo(()=>id=>setSelected(typeof id==='object'?id.id:id),[]);
 const onMetrics=useMemo(()=>m=>{metrics.current=m;},[]);
 const routeRevision=(snapshot.connections||[]).map(c=>`${c.id||c.connectionId}:${c.status||c.state}`).join('|');
 useEffect(()=>{let disposed=false;Promise.resolve(host.profileRoutes?.()||[]).then(r=>{if(!disposed)setRoutes(Array.isArray(r)?r:[]);}).catch(()=>{});return()=>{disposed=true;};},[host,routeRevision]);

 useEffect(()=>{try{storage.set('displayMode',displayMode);}catch{/* Storage must never block the exit. */}},[displayMode,storage]);
 useEffect(()=>{
  if(displayMode)root.current?.querySelector('.pw-display-exit')?.focus({preventScroll:true});
  else if(wasDisplay.current)root.current?.querySelector('.pw-display-enter')?.focus({preventScroll:true});
  wasDisplay.current=displayMode;
  if(!displayMode)return;
  const escape=e=>{if(e.key==='Escape'){setDisplayMode(false);}};
  document.addEventListener('keydown',escape);
  return()=>document.removeEventListener('keydown',escape);
 },[displayMode]);
 function changeMode(next){setMode(next);setSelected(null);setPage(0);setQuery('');setNotice('');}
 function demoState(status){if(!selected)return;setDemo(d=>({...d,revision:d.revision+1,agents:d.agents.map(a=>a.id===selected.id?{...a,status,activity:status==='active'?'writing':status,tool:status==='active'?'write_file':'',detail:`Demonstration: ${STATE[status]?.[1]||status}`,lastSeen:Date.now()}:a)}));}
 async function openSession(){if(!target||mode!=='live')return;setOpening(true);setNotice('');try{await host.openSession(target.id,target.options);}catch(error){setNotice(`Could not open this session: ${error.message||error}`);}finally{setOpening(false);}}
 const observing=(snapshot.connections||[]).some(c=>c.status==='open'||c.status==='observed');
 const selectedSource=selected?(snapshot.connections||[]).find(c=>c.id===selected.connectionId&&c.profile===selected.profile):null;
 const feed=(data.events||[]).slice(0,5);
 return h('main',{ref:root,className:'pw','data-mode':mode,'data-theme':theme,'data-display':String(displayMode)},h('style',null,styles),h('div',{className:'pw-shell'},
  h('header',{className:'pw-header'},h('div',null,h('div',{className:'pw-eyebrow'},'Your agents, a world of their own'),h('h1',null,'Pixel Worlds'),h('p',{className:'pw-caption'},'One live crew. Three places to make things happen.')),
   h('div',{className:'pw-header-controls'},h('div',{className:'pw-mode','aria-label':'Data source'},h(Action,{'aria-pressed':mode==='live',onClick:()=>changeMode('live')},'Live agents'),h(Action,{'aria-pressed':mode==='demo',onClick:()=>changeMode('demo')},'Explore themes')))),
  h(RealmManager,{realmLibrary,realm,setTheme,openExternal}),
  h('div',{className:'pw-topline'},h('div',{className:'pw-world-tabs','aria-label':'World theme'},themes.map((t,i)=>h(Action,{key:t.id,'aria-pressed':theme===t.id,onClick:()=>setTheme(t.id)},h('span',{className:'pw-theme-dot',style:{background:COLORS[i%COLORS.length]}}),t.title))),
   h('div',{className:'pw-counters','aria-label':'Agent counts'},h('span',null,h('strong',null,stats.total),'crew'),h('span',null,h('strong',null,stats.active),'working'),h('span',null,h('strong',null,stats.attention),'attention'))),
  h('div',{className:'pw-layout'},h('section',{'aria-label':'World and crew'},
   h('div',{className:'pw-world-card'},mode==='demo'?h('div',{className:'pw-banner',role:'status'},h('b',null,'Theme demonstration. '),'Illustrative agents and teamwork. Your live sessions are unchanged.'):
    h('div',{className:'pw-banner',role:'status'},h('b',null,observing?'Observed event streams · ':'Observation · '),`${agents.length} observed ${agents.length===1?'agent':'agents'}`,stats.unknown?` · ${stats.unknown} awaiting fresh evidence`:'',' · No commands run by scenery.'),
    h('div',{className:'pw-scene'},h(Scene,{theme,realm,agents:list.visible,selectedId,onSelect,reducedMotion:motion||systemReduced,paused,onMetrics,displayMode}),!agents.length&&h('div',{className:'pw-empty'},h('b',null,'The room is ready.'),displayMode?'No observed agents. Exit display to explore illustrative themes.':'Agents appear as Hermes reports their sessions. Explore themes to meet an illustrative crew.')),
    h('div',{className:'pw-world-caption'},h('span',null,h('strong',null,world.title),' / ',world.subtitle||'A different world. The same real work.'),h('span',null,'Click a character to inspect'))),
   h('div',{className:'pw-toolbar'},h('div',{className:'pw-tools'},h(Action,{'aria-pressed':paused,onClick:()=>setPaused(!paused)},paused?'Resume animation':'Pause animation'),h(Action,{'aria-pressed':motion||systemReduced,onClick:()=>setMotion(!motion),disabled:systemReduced,title:systemReduced?'Reduced motion follows your system preference':''},'Reduced motion'),h(Action,{className:'pw-display-enter',onClick:()=>setDisplayMode(true),title:'Scene-only view. Press Escape to return.'},'Display mode'),h(Action,{onClick:()=>host.navigate('/pw-agents')},'PW Agents')),
    h('span',null,list.total>12?`Showing ${list.page*12+1}–${Math.min((list.page+1)*12,list.total)} of ${list.total}`:`${list.total} ${list.total===1?'agent':'agents'} in view`)),
   h('section',{className:'pw-roster','aria-label':'Accessible agent roster'},h('div',{className:'pw-section-heading'},h('h2',null,'The crew'),h('input',{className:'pw-search',type:'search',value:query,placeholder:'Find an agent…','aria-label':'Find an agent',onChange:e=>{setQuery(e.target.value);setPage(0);}})),
    h('div',{className:'pw-agent-grid'},list.visible.map(a=>h(Action,{key:a.id,className:'pw-agent','aria-pressed':selectedId===a.id,onClick:()=>onSelect(a.id)},h('span',{className:'pw-avatar'},h(Mark,{status:attentionStatus(a)||a.status})),h('span',{className:'pw-agent-copy'},h('span',{className:'pw-agent-name',title:a.storedSessionId||a.subagentId||a.sessionId||a.id},a.name||a.profile||'Unnamed agent',(nameCounts.get(a.name||a.profile)||0)>1?` · ${String(a.subagentId||a.storedSessionId||a.sessionId||a.id).slice(-8)}`:''),h('span',{className:'pw-agent-meta'},attentionStatus(a)&&a.status!==attentionStatus(a)?'Earlier attention · ':'' ,(STATE[a.status]||STATE.unknown)[1],' · ',a.tool||a.activity||'observed'))))),
    !list.total&&h('p',{className:'pw-caption'},query?'No agents match this search.':'No observed sessions yet.'),
    list.pages>1&&h('div',{className:'pw-toolbar'},h(Action,{onClick:()=>setPage(list.page-1),disabled:list.page===0},'Previous'),h('span',null,`Page ${list.page+1} of ${list.pages}`),h(Action,{onClick:()=>setPage(list.page+1),disabled:list.page===list.pages-1},'Next')))),
   h('aside',{className:'pw-inspector','aria-label':'Agent inspector'},h('section',null,h('div',{className:'pw-inspector-title'},h('div',{className:'pw-eyebrow'},'At a glance'),h('h2',null,selected?'Agent inspector':'Meet your crew')),
    selected?h(React.Fragment,null,h('p',{className:'pw-selected-name'},selected.name||selected.profile),h('span',{className:'pw-status-pill'},h(Mark,{status:selected.status}),(STATE[selected.status]||STATE.unknown)[1]),h('p',{className:'pw-detail'},selected.detail||'State observed from the Hermes event stream.'),
     selected.verified===false&&h('p',{className:'pw-explainer'},'Historical observation; current activity is unverified.'),
     mode==='live'&&selectedSource?.observation==='observed-lease'&&h('p',{className:'pw-explainer'},'Recent background events. Observation expires after 45 seconds of source silence; background socket health is not exposed.'),
     mode==='live'&&selected.attention&&h('div',{className:'pw-attention'},h('p',{className:'pw-explainer'},`An earlier ${selected.attention==='error'?'error':'input request'} remains flagged. Check the actual session.`),h(Action,{onClick:()=>runtime.acknowledge(selected.id),title:'Clears this local reminder only. It does not approve or answer a Hermes request.'},'Dismiss local reminder')),
     h('dl',{className:'pw-facts'},[['Activity',selected.activity||'Unknown'],['Tool',selected.tool||'No current tool'],['Session',selected.storedSessionId||selected.subagentId||selected.sessionId||'Unresolved'],['Profile',selected.profile||'Unresolved'],['Connection',selected.connectionId||'Unresolved'],['Team',selected.parentId?(agents.find(a=>a.id===selected.parentId)?.name||'Linked parent task'):(agents.some(a=>a.parentId===selected.id)?'Coordinating linked tasks':'Independent session')]].map(([label,value])=>h('div',{key:label},h('dt',null,label),h('dd',null,value)))),
     mode==='live'?h(React.Fragment,null,h(Action,{className:'pw-primary',disabled:!target||opening||!host.openSession,onClick:openSession},opening?'Opening…':'Open actual session ↗'),!target&&h('p',{className:'pw-explainer'},'Session navigation becomes available when Hermes supplies its durable ID and exact owner.')):
     h('div',{className:'pw-demo-actions','aria-label':'Demonstration state controls'},h(Action,{onClick:()=>demoState('waiting')},'Needs input'),h(Action,{onClick:()=>demoState('error')},'Error'),h(Action,{onClick:()=>demoState('active')},'Working'),h(Action,{onClick:()=>demoState('done')},'Complete'))):
    h('p',{className:'pw-detail'},'Select a character or an agent below the scene. Work, attention, tools, and real parent–child relationships stay intact when you change worlds.'),notice&&h('p',{className:'pw-notice',role:'alert'},notice)),
    h('section',{className:'pw-native'},h('h2',null,'Connected to Hermes'),h('p',null,'Open native controls. The world reflects the work; Hermes stays in charge of execution.'),h('div',{className:'pw-native-grid'},[['Agents','/agents'],['Capabilities','/skills'],['MCP connections','/skills?tab=mcp'],['Schedules','/cron'],['Messaging','/messaging'],['Webhooks','/webhooks']].map(([title,path])=>h(Action,{key:path,onClick:()=>host.navigate(path)},`${title} ↗`)))),
    feed.length>0&&h('section',{className:'pw-feed'},h('h2',null,'Recent signals'),feed.map((e,i)=>h('div',{className:'pw-feed-row',key:e.id||i},h('time',null,new Date(e.at||e.timestamp||e.time||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})),h('span',null,e.text||e.summary||e.type||'Activity observed')))))),
  h('footer',{className:'pw-footer'},h('span',null,mode==='demo'?'Demonstration is isolated from live telemetry.':'Source-qualified identities · No invented progress · Attention stays visible'),h('span',null,'PD Pixel Worlds · Public alpha'))),
  displayMode&&h('div',{className:'pw-display-controls','aria-label':'Display controls'},
   h('div',{className:'pw-display-strip'},h(Action,{className:'pw-display-exit',onClick:()=>setDisplayMode(false),title:'Return to dashboard (Escape)'},'Exit display'),h('span',{className:'pw-display-status',role:'status'},mode==='demo'?'Demo · illustrative':observing?'Live · observed streams':'Live source · not connected',` · ${list.visible.length} on stage · ${agents.length-list.visible.length} off-stage`,mode==='live'&&stats.unknown?` · ${stats.unknown} unverified`:'',paused?' · Paused':'')),
   h('div',{className:'pw-display-options'},h('label',null,h('span',{className:'pw-display-label'},'Theme'),h('select',{className:'pw-display-theme','aria-label':'Display theme',value:theme,onChange:e=>setTheme(e.target.value)},themes.map(t=>h('option',{key:t.id,value:t.id},t.title)))),h(Action,{'aria-pressed':paused,onClick:()=>setPaused(p=>!p)},paused?'Resume animation':'Pause animation'),h('span',{className:'pw-display-hint'},'Esc to return'))));
}

export function PWAgents({runtime,host,realmLibrary,preferences}){
 const snapshot=useSyncExternalStore(runtime.subscribe,runtime.getSnapshot,runtime.getSnapshot);
 const {theme,setTheme,paused,setPaused,reducedMotion,themes,realm}=useWorldSettings(preferences,realmLibrary);
 const [mode,setMode]=useState('live'),[page,setPage]=useState(0),[selectedId,setSelected]=useState(null);
 const demo=useMemo(demonstration,[]),systemReduced=useReducedMotion();
 const agents=(mode==='demo'?demo:snapshot).agents||[];
 const stats=counts(agents),list=useMemo(()=>selectAgents(agents,{page}),[agents,page]);
 const observing=(snapshot.connections||[]).some(c=>c.status==='open'||c.status==='observed');
 const onSelect=useMemo(()=>id=>setSelected(typeof id==='object'?id.id:id),[]);
 function changeMode(value){setMode(value);setPage(0);setSelected(null);}
 return h('main',{className:'pw pw-agents','data-mode':mode,'data-theme':theme},h('style',null,styles),
  h('div',{className:'pw-scene'},h(Scene,{theme,realm,agents:list.visible,selectedId,onSelect,reducedMotion:reducedMotion||systemReduced,paused,displayMode:true}),!agents.length&&h('div',{className:'pw-empty'},h('b',null,'The room is ready.'),'No observed agents. Demo shows an illustrative crew.')),
  h('div',{className:'pw-agents-controls','aria-label':'PW Agents controls'},h('div',{className:'pw-display-strip'},h('strong',null,'PW Agents'),h('span',{className:'pw-agents-status',role:'status'},mode==='demo'?'Demo · illustrative':observing?'Live · observed streams':'Live source · not connected',` · ${list.visible.length} on stage · ${agents.length-list.visible.length} off-stage`,mode==='live'&&stats.unknown?` · ${stats.unknown} unverified`:'',stats.attention?` · ${stats.attention} need attention`:'',paused?' · Paused':'')),
   h('div',{className:'pw-agents-options'},h(Action,{'aria-pressed':mode==='live',onClick:()=>changeMode('live')},'Live'),h(Action,{'aria-pressed':mode==='demo',onClick:()=>changeMode('demo')},'Demo'),h('select',{className:'pw-display-theme','aria-label':'Agents theme',value:theme,onChange:e=>setTheme(e.target.value)},themes.map(t=>h('option',{key:t.id,value:t.id},t.title))),h(Action,{'aria-pressed':paused,onClick:()=>setPaused(p=>!p)},paused?'Resume animation':'Pause animation'),h(Action,{onClick:()=>host.navigate('/pixel-worlds')},'Return to Worlds')),
   list.pages>1&&h('div',{className:'pw-agents-pagination'},h(Action,{onClick:()=>setPage(list.page-1),disabled:list.page===0},'Previous'),h('span',null,`Page ${list.page+1} of ${list.pages}`),h(Action,{onClick:()=>setPage(list.page+1),disabled:list.page===list.pages-1},'Next'))));
}
