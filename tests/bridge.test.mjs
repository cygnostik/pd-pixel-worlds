import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../src/runtime.js';
import { connectHermes } from '../src/bridge.js';

function atom(value) {
  const listeners = new Set();
  return { get: () => value, set(v) { value = v; for (const fn of [...listeners]) fn(v); }, listen(fn) { listeners.add(fn); return () => listeners.delete(fn); }, count: () => listeners.size };
}
function fixture(request = async () => ({ profiles: [{ name: 'default', display_name: 'Configured name' }] })) {
  const listeners = new Set(), calls = [];
  const state = Object.fromEntries(Object.entries({connectionId:'local', profile:'default', gateway:'open', focusedSessionOwner:{connectionId:'local',profile:'default'}, focusedSessionId:'s1', focusedStoredSessionId:'stored1', busy:false}).map(([k,v]) => [k,atom(v)]));
  const host = {state, request: (...args) => { calls.push(args); return request(...args); }, onEvent(type, fn) { assert.equal(type, '*'); listeners.add(fn); return () => listeners.delete(fn); }};
  return { host, state, calls, listeners, emit(event) { for (const fn of listeners) fn(event); } };
}
const settle = async () => { for(let i=0;i<5;i++) await Promise.resolve(); };
function clock() {
  let time=0, next=0; const tasks=new Map(), callbacks=[];
  return {
    now:()=>time,
    setTimeout(fn, delay) { const id=++next; tasks.set(id,{fn,at:time+delay}); callbacks.push(fn); return id; },
    clearTimeout(id) { tasks.delete(id); },
    advance(ms) { const end=time+ms; while(true) { const due=[...tasks].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0]; if(!due) break; tasks.delete(due[0]); time=due[1].at; due[1].fn(); } time=end; },
    count:()=>tasks.size, callbacks
  };
}
const foreign = (extra={}) => ({type:'message.start',session_id:'foreign',connectionId:'remote',profile:'default',...extra});
const agentFor = (r,c='remote',p='default') => r.getSnapshot().agents.find(a=>a.connectionId===c && a.profile===p);

test('background claims expire once; housekeeping cannot mint, extend or revive a lease', async () => {
  const f=fixture(),time=clock(),r=createRuntime({now:time.now}),off=connectHermes(f.host,r,time); await settle();
  const before=r.getSnapshot();
  for(const type of ['sessions.changed','session.usage','notice','made.up','gateway.ready','gateway.reconnecting','status.update']) f.emit(foreign({type,payload:{kind:'heartbeat'}}));
  assert.equal(r.getSnapshot(),before); assert.equal(time.count(),0);
  f.emit(foreign()); assert.equal(agentFor(r).status,'active'); assert.equal(time.count(),1);
  const live=r.getSnapshot(); time.advance(44_999); assert.equal(r.getSnapshot(),live);
  f.emit(foreign({type:'sessions.changed'})); assert.equal(r.getSnapshot(),live);
  time.advance(1); assert.equal(agentFor(r).status,'unknown'); assert.equal(agentFor(r).verified,false); assert.equal(time.count(),0);
  assert.equal(r.getSnapshot().connections.find(c=>c.id==='remote').observation,'none');
  const expired=r.getSnapshot();
  for(const type of ['sessions.changed','gateway.ready','status.update','unknown']) f.emit(foreign({type,payload:{kind:'heartbeat'}}));
  time.advance(100_000); assert.equal(r.getSnapshot(),expired); assert.equal(time.count(),0);
  f.emit(foreign({type:'tool.start',payload:{name:'terminal',tool_id:'fresh'}}));
  assert.equal(agentFor(r).status,'active'); assert.equal(time.count(),1); off();
});

test('stream frames renew privately, while replayed sequence numbers do not extend a lease', async () => {
  const f=fixture(),time=clock(),r=createRuntime(),off=connectHermes(f.host,r,time); await settle();
  f.emit(foreign({type:'message.delta'})); const snap=r.getSnapshot();
  time.advance(40_000); f.emit(foreign({type:'message.delta'}));
  assert.equal(r.getSnapshot(),snap); assert.equal(time.count(),1);
  time.advance(5_000); assert.equal(agentFor(r).status,'active'); assert.equal(r.getSnapshot(),snap);
  time.advance(40_000); assert.equal(agentFor(r).status,'unknown');
  f.emit(foreign({seq:7})); time.advance(40_000); f.emit(foreign({seq:7})); time.advance(5_000);
  assert.equal(agentFor(r).status,'unknown'); const expired=r.getSnapshot();
  f.emit(foreign({seq:7})); assert.equal(r.getSnapshot(),expired); assert.equal(time.count(),0); off();
});

test('route change immediately invalidates former active; only new explicit activity leases it', async () => {
  const f=fixture(),time=clock(),r=createRuntime(),off=connectHermes(f.host,r,time); await settle();
  f.emit({type:'message.start',session_id:'s1'});
  f.state.connectionId.set('next'); assert.equal(agentFor(r,'local').status,'unknown'); await settle();
  f.emit({type:'gateway.ready',connectionId:'local',profile:'default'});
  assert.equal(agentFor(r,'local').status,'unknown'); assert.equal(time.count(),0);
  f.emit({type:'tool.start',session_id:'s1',connectionId:'local',profile:'default',payload:{name:'terminal'}});
  assert.equal(agentFor(r,'local').status,'active'); assert.equal(r.getSnapshot().connections.find(c=>c.id==='local').status,'observed');
  time.advance(45_000); assert.equal(agentFor(r,'local').status,'unknown'); off();
});

test('active disconnect wins synchronously, while independent foreign observations remain leased', async () => {
  const f=fixture(),time=clock(),r=createRuntime(),off=connectHermes(f.host,r,time); await settle();
  f.emit({type:'message.start',session_id:'s1'}); f.emit(foreign());
  f.state.gateway.set('closed'); assert.equal(agentFor(r,'local').status,'unknown');
  assert.equal(agentFor(r).status,'active');
  f.emit({type:'message.start',session_id:'s1',connectionId:'local',profile:'default'});
  assert.equal(agentFor(r,'local').status,'unknown');
  f.emit(foreign({connectionId:'other',session_id:'other'})); assert.equal(agentFor(r,'other').status,'active');
  f.state.gateway.set('open'); await settle(); assert.equal(agentFor(r,'local').status,'unknown');
  time.advance(45_000); assert.equal(agentFor(r).status,'unknown'); off();
});

test('strict owner validation and session scope prevent foreign inference or malformed leases', async () => {
  const f=fixture(),time=clock(),r=createRuntime(),off=connectHermes(f.host,r,time); await settle();
  const before=r.getSnapshot();
  for(const extra of [
    {connectionId:null},{connectionId:undefined},{profile:null},{profile:undefined},
    {connectionId:''},{connectionId:42},{connectionId:{}},{connectionId:' '},{connectionId:'bad\nsource'},
    {profile:''},{profile:false},{profile:[]},{profile:' '},
    {connection_id:'different'},{connection_id:0},{session_id:null},{session_id:''},{session_id:4},
    {type:'subagent.start',payload:{task_index:0}}, {type:'status.update',payload:{kind:'heartbeat'}}
  ]) {
    // Missing source with an explicitly foreign profile is not active-route evidence.
    const e=foreign({profile:'foreign-profile',...extra}); f.emit(e);
  }
  assert.equal(r.getSnapshot(),before); assert.equal(time.count(),0);
  f.emit({type:'message.start',session_id:'s1',connectionId:null,profile:null});
  assert.equal(agentFor(r,'local').status,'active'); assert.equal(time.count(),0);
  f.emit(foreign({profile:'research'})); f.emit(foreign({connectionId:'local',profile:'research'}));
  assert.equal(agentFor(r,'remote','research').status,'active'); assert.equal(agentFor(r,'local','research').status,'active'); off();
});

test('disposal cancels every lease and fences already queued timer callbacks', async () => {
  const f=fixture(),time=clock(),r=createRuntime(),off=connectHermes(f.host,r,time); await settle();
  f.emit(foreign()); f.emit(foreign({connectionId:'another'}));
  assert.equal(time.count(),1); off(); off(); assert.equal(time.count(),0);
  assert.equal(agentFor(r).status,'unknown'); assert.equal(agentFor(r,'another').status,'unknown');
  const snap=r.getSnapshot(); for(const callback of time.callbacks) callback(); time.advance(100_000); await settle();
  assert.equal(r.getSnapshot(),snap); assert.equal(time.count(),0);
  assert.equal(f.listeners.size,0); assert.equal(Object.values(f.state).reduce((n,a)=>n+a.count(),0),0);
});

test('foreign coverage never calls enumeration, retain, routing or wake RPCs', async () => {
  const f=fixture(),time=clock(),forbidden=[];
  for(const name of ['connections','agents','profileRoutes','requestProfile','retainProfileSocket','openSession','restartGateway']) f.host[name]=()=>{forbidden.push(name); throw Error('must not wake');};
  const r=createRuntime(),off=connectHermes(f.host,r,time); await settle();
  for(let i=0;i<12;i++) f.emit(foreign({connectionId:`source-${i}`,profile:i%2?'default':'research'}));
  assert.equal(r.getSnapshot().agents.length,13); assert.equal(time.count(),1);
  time.advance(45_000); assert.deepEqual(forbidden,[]);
  assert.deepEqual(f.calls,[['profiles.list',{include_sessions:false}]]); off();
});

test('coalesced disconnect/reconnect restores socket metadata, never a stale busy claim', async () => {
  const f=fixture(); f.state.busy.set(true); const r=createRuntime(),off=connectHermes(f.host,r); await settle();
  f.state.gateway.set('closed'); f.state.gateway.set('open'); await settle();
  assert.equal(agentFor(r,'local').status,'unknown');
  assert.equal(r.getSnapshot().connections[0].status,'open');
  f.emit({type:'message.start',session_id:'s1'}); assert.equal(agentFor(r,'local').status,'active'); off();
});

test('leases are per owner; foreign focus cannot validate busy and attention survives expiry', async () => {
  const f=fixture(),time=clock(),r=createRuntime(),off=connectHermes(f.host,r,time); await settle();
  f.emit(foreign({type:'approval.request'}));
  f.state.focusedSessionOwner.set({connectionId:'remote',profile:'default'}); f.state.focusedSessionId.set('foreign');
  f.state.busy.set(true); await settle(); assert.equal(agentFor(r).status,'waiting');
  time.advance(10_000); f.emit(foreign({profile:'research',type:'message.complete',payload:{status:'complete'}}));
  time.advance(35_000);
  assert.equal(agentFor(r).status,'unknown'); assert.equal(agentFor(r).attention,'waiting');
  assert.equal(agentFor(r,'remote','research').status,'done'); assert.equal(agentFor(r,'remote','research').verified,true);
  time.advance(10_000); assert.equal(agentFor(r,'remote','research').status,'done'); assert.equal(agentFor(r,'remote','research').verified,false);
  assert.equal(time.count(),0); off();
});

test('adapter uses actual source metadata and cleans up atom and event listeners', async () => {
  const f = fixture(), r = createRuntime();
  const off = connectHermes(f.host,r); await settle();
  assert.equal(r.getSnapshot().agents[0].name, 'Configured name');
  assert.equal(r.getSnapshot().agents[0].status, 'idle');
  assert.deepEqual(f.calls, [['profiles.list',{include_sessions:false}]]);
  off(); off();
  assert.equal(f.listeners.size,0);
  assert.equal(Object.values(f.state).reduce((n,a) => n+a.count(),0),0);
});

test('same-named profiles on distinct sources are observed without conflating owners', async () => {
  const f=fixture(),r=createRuntime(),off=connectHermes(f.host,r); await settle();
  f.emit({type:'message.start',session_id:'s1',connectionId:'remote',profile:'default'});
  assert.equal(r.getSnapshot().agents.length,2);
  const remote = r.getSnapshot().agents.find(a=>a.connectionId==='remote');
  assert.equal(remote.status,'active'); assert.equal(remote.name,'default');
  const source = r.getSnapshot().connections.find(c=>c.id==='remote');
  assert.equal(source.status,'observed'); assert.equal(source.observation,'observed-lease');
  assert.equal(r.getSnapshot().connections.find(c=>c.id==='local').observation,'socket');
  f.state.focusedSessionOwner.set(null); f.state.focusedSessionId.set('ambiguous'); f.state.busy.set(true); await settle();
  assert.equal(r.getSnapshot().agents.length,2); assert.equal(r.getSnapshot().agents[0].status,'idle'); off();
});

test('route switches invalidate the old source and late metadata cannot rename the new source', async () => {
  const pending=[]; const f=fixture(()=>new Promise(resolve=>pending.push(resolve))),r=createRuntime(),off=connectHermes(f.host,r);
  f.emit({type:'message.start',session_id:'s1'});
  f.state.connectionId.set('remote'); f.state.focusedSessionOwner.set({connectionId:'remote',profile:'default'}); await settle();
  pending[0]({profiles:[{name:'default',display_name:'OLD WRONG'}]});
  pending[1]({profiles:[{name:'default',display_name:'Remote correct'}]}); await settle();
  const local=r.getSnapshot().agents.find(a=>a.connectionId==='local'),remote=r.getSnapshot().agents.find(a=>a.connectionId==='remote');
  assert.equal(local.status,'unknown'); assert.equal(local.name,'default'); assert.equal(remote.name,'Remote correct'); off();
});

test('disconnect/reconnect and stale busy do not resume work; a new busy edge can', async () => {
  const f=fixture(); f.state.busy.set(true); const r=createRuntime(),off=connectHermes(f.host,r); await settle();
  assert.equal(r.getSnapshot().agents[0].status,'active');
  f.state.gateway.set('closed'); await settle(); assert.equal(r.getSnapshot().agents[0].status,'unknown');
  f.state.gateway.set('open'); await settle(); assert.equal(r.getSnapshot().agents[0].status,'unknown');
  f.state.busy.set(false); await settle(); assert.equal(r.getSnapshot().agents[0].status,'idle');
  f.state.busy.set(true); await settle(); assert.equal(r.getSnapshot().agents[0].status,'active'); off();
});

test('unscoped events cannot follow focus into an unrelated session', async () => {
  const f=fixture(),r=createRuntime(),off=connectHermes(f.host,r); await settle();
  f.emit({type:'message.start',session_id:'s1'});
  f.state.focusedSessionId.set('s2'); f.state.focusedStoredSessionId.set('stored2'); await settle();
  f.emit({type:'tool.start',payload:{name:'terminal',tool_id:'unscoped'}});
  const second=r.getSnapshot().agents.find(a=>a.sessionId==='s2'); assert.equal(second.status,'idle'); assert.equal(second.tool,''); off();
});

test('housekeeping storms do not refresh profiles or churn activity', async () => {
  const f=fixture(),r=createRuntime(),off=connectHermes(f.host,r); await settle(); const snap=r.getSnapshot();
  for(let i=0;i<30;i++) f.emit({type:'sessions.changed',payload:{}});
  assert.equal(r.getSnapshot(),snap); assert.equal(f.calls.length,1); off();
});

test('metadata rejection and missing optional SDK features degrade without inventing activity', async () => {
  const f=fixture(()=>Promise.reject(Error('unsupported'))); delete f.state.focusedSessionOwner;
  const r=createRuntime(),off=connectHermes(f.host,r); await settle();
  assert.equal(r.getSnapshot().agents[0].name,'default'); assert.equal(r.getSnapshot().agents[0].status,'idle'); off();
  const empty=createRuntime(),dispose=connectHermes({},empty); dispose(); assert.equal(empty.getSnapshot().agents.length,0);
});

test('disposal fences pending metadata, queued atom callbacks and orphaned host listeners', async () => {
  let resolve; const f=fixture(()=>new Promise(r=>{resolve=r;})),r=createRuntime(),off=connectHermes(f.host,r);
  const eventCallback=[...f.listeners][0]; f.state.busy.set(true); off(); const snap=r.getSnapshot();
  resolve({profiles:[{name:'default',display_name:'Too late'}]});
  eventCallback({type:'message.start',session_id:'post-disposal'}); await settle();
  assert.equal(r.getSnapshot(),snap); assert.equal(r.getSnapshot().agents[0].name,'default');
});

test('profile and owner changes in one host batch cannot mix ownership or labels', async () => {
  const f=fixture(),r=createRuntime(),off=connectHermes(f.host,r); await settle();
  f.state.profile.set('research'); f.state.focusedSessionId.set('research-session'); f.state.focusedStoredSessionId.set('research-stored');
  f.state.focusedSessionOwner.set({connectionId:'local',profile:'research'}); f.state.busy.set(true); await settle();
  const agent=r.getSnapshot().agents.find(a=>a.sessionId==='research-session');
  assert.equal(agent.profile,'research'); assert.equal(agent.name,'research'); assert.equal(agent.status,'unknown'); off();
});

test('background busyBySession keys are not guessed to belong to the focused profile', async () => {
  const f=fixture(); f.state.busyBySession=atom({'remote::default::unowned':true});
  const r=createRuntime(),off=connectHermes(f.host,r); await settle();
  assert.equal(r.getSnapshot().agents.length,1); assert.equal(r.getSnapshot().agents[0].status,'idle'); off();
});

test('preview aliases normalize at the adapter boundary without allowing foreign ownership', async () => {
  const f=fixture(); f.state.gateway.set('connected'); const r=createRuntime(),off=connectHermes(f.host,r); await settle();
  f.emit({type:'message.start',session_id:'s1',profile:'default',connection_id:'local'});
  assert.equal(r.getSnapshot().agents[0].status,'active');
  f.emit({type:'message.start',session_id:'foreign',connection_id:'remote'});
  f.emit({type:'message.start',session_id:'contradictory',connection_id:'remote',connectionId:'local'});
  assert.equal(r.getSnapshot().agents.length,1); off(); r.destroy();
});

test('activeConnectionId function takes precedence over window connection atom', async () => {
  const f=fixture(); f.host.activeConnectionId=()=> 'actually-active'; f.state.focusedSessionOwner.set({connectionId:'actually-active',profile:'default'});
  const r=createRuntime(),off=connectHermes(f.host,r); await settle();
  assert.equal(r.getSnapshot().agents[0].connectionId,'actually-active');
  f.emit({type:'message.start',session_id:'s1',connectionId:'actually-active'}); assert.equal(r.getSnapshot().agents[0].status,'active'); off();
});

test('gateway epoch reset fences in-flight metadata and remains housekeeping', async () => {
  const pending=[]; const f=fixture(()=>new Promise(resolve=>pending.push(resolve))),r=createRuntime(),off=connectHermes(f.host,r);
  f.emit({type:'gateway.ready',payload:{replay_epoch:'one'}});
  pending[0]({profiles:[{name:'default',display_name:'stale'}]}); pending[1]({profiles:[{name:'default',display_name:'fresh'}]}); await settle();
  assert.equal(r.getSnapshot().agents[0].name,'fresh'); assert.equal(r.getSnapshot().events.length,0); off();
});
