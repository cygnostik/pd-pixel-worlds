import React, {useId,useState,useSyncExternalStore} from 'react';
import {Button} from '@hermes/plugin-sdk';
import {attentionStatus} from './ui-model.js';
import {SHIP_ROOM_LABELS} from './ship.js';

const h=React.createElement;
const ROOMS=Object.entries(SHIP_ROOM_LABELS);
const ROOM_LABELS=SHIP_ROOM_LABELS;
const STATES={active:'Working',waiting:'Needs input',error:'Needs attention',done:'Turn complete',idle:'Idle',queued:'Queued',unknown:'Unverified'};

function Action({children,...props}){
 return h(Button,{type:'button',...props},children);
}
function locationLabel(location){
 if(!location)return 'Location unavailable';
 if(location.room==='transit')return `In transit${ROOM_LABELS[location.destination]?` → ${ROOM_LABELS[location.destination]}`:''}`;
 if(location.room==='offstage')return 'Off-stage';
 return ROOM_LABELS[location.room]||'Location unavailable';
}
function statusLabel(agent){
 const current=STATES[agent.status]||STATES.unknown;
 const attention=attentionStatus(agent);
 return `${current}${agent.verified===false&&agent.status!=='unknown'?' · Unverified':''}${attention&&attention!==agent.status?` · Earlier ${attention==='error'?'error':'input request'}`:''}`;
}
function actionLabel(action){
 return typeof action==='string'?action:typeof action?.message==='string'?action.message:'';
}

/** Local presentation only. Pass the full current-mode roster, not a paged slice.
 * Add shipStyles to the parent's stylesheet; both routes may share the same ship.
 * onSelect receives a source-qualified agent ID (or null on explicit deselection).
 */
export function ShipControls({ship,mode='live',agents=[],selectedId=null,onSelect,compact=false}){
 const snapshot=useSyncExternalStore(ship.subscribe,ship.getSnapshot,ship.getSnapshot);
 const [localId,setLocalId]=useState(null),[destination,setDestination]=useState('engineering'),[notice,setNotice]=useState(null);
 const hintId=useId();
 const population=snapshot.populations?.[mode];
 const locations=new Map((population?.locations||[]).map(location=>[location.id,location]));
 const selected=agents.find(agent=>agent.id===(onSelect?selectedId:localId??selectedId));
 const location=selected?locations.get(selected.id):null;
 const attention={bridge:0,engineering:0};
 let elsewhere=0;
 for(const agent of agents){
  if(!attentionStatus(agent))continue;
  const room=locations.get(agent.id)?.room;
  if(Object.hasOwn(attention,room))attention[room]++;
  if(room!==snapshot.room)elsewhere++;
 }
 const names=new Map();
 for(const agent of agents){const name=agent.name||agent.profile||'Unnamed agent';names.set(name,(names.get(name)||0)+1);}
 const crewName=agent=>{const name=agent.name||agent.profile||'Unnamed agent';return names.get(name)>1?`${name} · ${agent.id}`:name;};
 const message=notice&&notice.action===snapshot.lastAction&&notice.mode===mode&&notice.id===(selected?.id??null)?notice.text:actionLabel(snapshot.lastAction);
 function report(text){setNotice({text,action:ship.getSnapshot().lastAction,mode,id:selected?.id??null});}
 function act(fn){setNotice(null);fn();}
 function select(id){setNotice(null);setLocalId(id||null);onSelect?.(id||null);}
 function locate(){
  if(!selected)return;
  if(ship.locate(selected.id,mode))report(`${crewName(selected)} · ${locationLabel(locations.get(selected.id))}.`);
  else report(location?.room==='transit'?`${crewName(selected)} is in transit. Locate again on arrival.`:location?.room==='offstage'?`${crewName(selected)} is off-stage; choose a room to move them locally.`:'Crew location is not available yet.');
 }
 function transfer(){
  if(!selected)return;
  const result=ship.transfer(selected.id,destination,mode);
  report(result.message||(result.ok?'Local crew move requested.':'Could not move crew locally.'));
 }
 const moving=Boolean(selected&&(location?.room==='transit'||population?.activeTripId===selected.id));
 return h('section',{className:`pw-ship${compact?' pw-ship--compact':''}`,'aria-label':'Ship rooms and local controls'},
  h('nav',{className:'pw-ship-rooms','aria-label':'Ship rooms'},ROOMS.map(([room,label])=>h(Action,{key:room,className:'pw-ship-room','aria-pressed':snapshot.room===room,onClick:()=>act(()=>ship.setRoom(room))},
   h('span',{className:'pw-ship-room-name'},label),
   h('span',{className:'pw-ship-count'},population?.counts?.[room]??0,h('span',{className:'pw-ship-sr'},' crew')),
   attention[room]>0&&h('span',{className:'pw-ship-attention'},'! ',attention[room],h('span',{className:'pw-ship-sr'},' need attention'))))),
  h('div',{className:'pw-ship-population'},
   h('span',null,`${mode==='demo'?'Demo':'Live'} · ${population?.total??0} crew`),
   h('span',null,`${population?.counts?.transit??0} in transit · ${population?.counts?.offstage??0} off-stage`),
   elsewhere>0&&h('strong',{className:'pw-ship-attention'},`${elsewhere} need attention elsewhere`)),
  h('details',{className:'pw-ship-disclosure'},
   h('summary',{className:'pw-ship-summary'},h('span',null,'Ship controls'),h('span',{className:'pw-ship-summary-note'},'Local scene only')),
   h('div',{className:'pw-ship-body'},
    h('p',{className:'pw-ship-hint',id:hintId},'Scene effects and visual crew placement only. No jobs are routed or commands run.'),
    h('div',{className:'pw-ship-row','aria-label':'Scene lighting'},
     h(Action,{'aria-pressed':Boolean(snapshot.night),'aria-label':'Night shift',onClick:()=>act(()=>ship.set('night',!snapshot.night))},'Night shift',h('span',{className:'pw-ship-switch','aria-hidden':true},snapshot.night?'On':'Off'))),
    h('fieldset',{className:'pw-ship-energy'},h('legend',null,'Scene energy'),h('div',{className:'pw-ship-row'},['quiet','normal','playful'].map(energy=>h(Action,{key:energy,'aria-pressed':snapshot.energy===energy,onClick:()=>act(()=>ship.set('energy',energy))},energy[0].toUpperCase()+energy.slice(1))))),
    h('div',{className:'pw-ship-row','aria-label':'Local scene effects'},[['pulse','Pulse warp core'],['diagnostic','Diagnostic sweep'],['reset','Clear effects']].map(([action,label])=>h(Action,{key:action,onClick:()=>act(()=>ship.trigger(action))},label))),
    h('div',{className:'pw-ship-crew'},
     h('label',{className:'pw-ship-field'},h('span',{id:`${hintId}-crew`},'Crew member'),h('select',{className:'pw-ship-select','aria-labelledby':`${hintId}-crew`,value:selected?.id||'',onChange:event=>select(event.target.value)},
      h('option',{value:''},agents.length?'Select crew…':'No crew in this source'),
      agents.map(agent=>h('option',{key:agent.id,value:agent.id},`${crewName(agent)} · ${statusLabel(agent)} · ${locationLabel(locations.get(agent.id))}`)))),
     selected&&h('p',{className:'pw-ship-selected'},`${statusLabel(selected)} · ${locationLabel(location)}`),
     h('div',{className:'pw-ship-row'},h(Action,{disabled:!selected,onClick:locate},'Locate crew'),
      h('label',{className:'pw-ship-field pw-ship-destination'},h('span',{id:`${hintId}-destination`},'Move to room'),h('select',{className:'pw-ship-select','aria-labelledby':`${hintId}-destination`,value:destination,onChange:event=>setDestination(event.target.value)},ROOMS.map(([id,label])=>h('option',{key:id,value:id},label)))),
      h(Action,{disabled:!selected||moving||location?.room===destination,onClick:transfer,'aria-describedby':hintId},'Move crew locally')),
     moving&&h('p',{className:'pw-ship-hint'},'Crew is travelling; choose another destination after arrival.')))),
  h('p',{className:'pw-ship-notice',role:'status','aria-live':'polite','aria-atomic':true},message));
}
