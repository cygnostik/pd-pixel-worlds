import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../src/runtime.js';

const scope = { connectionId: 'local', profile: 'default' };
const emit = (runtime, type, payload = {}, extra = {}) => runtime.ingest({ type, session_id: 's1', payload, ...extra }, scope);
const main = r => r.getSnapshot().agents.find(a => a.kind === 'session');
const child = r => r.getSnapshot().agents.find(a => a.kind === 'subagent');
const setup = () => { const r = createRuntime({ now: () => 1000 }); r.setConnection({ id: 'local', profile: 'default', status: 'open' }); return r; };

test('housekeeping never manufactures an agent; a connection is not work', () => {
  const r = setup();
  for (const type of ['sessions.changed', 'session.usage', 'notice', 'status.update']) emit(r, type, {kind:'heartbeat'});
  assert.equal(r.getSnapshot().agents.length, 0);
  r.observeSession({ ...scope, sessionId: 's1', busy: false });
  assert.equal(r.getSnapshot().agents[0].status, 'idle');
  emit(r, 'message.start');
  assert.equal(r.getSnapshot().agents[0].status, 'active');
});

test('names are automatic and connection scoped, not one focused nickname', () => {
  const r = setup();
  r.setProfiles('local', [{name:'default', display_name:'Fallback', ui_meta:{'hermes-bots':{title:'Coordinator'}}}]);
  emit(r,'message.start'); assert.equal(main(r).name,'Coordinator');
  r.setConnection({id:'remote',profile:'default',status:'open'});
  r.observeSession({connectionId:'remote',profile:'default',sessionId:'s1',busy:false});
  r.setProfiles('remote',[{name:'default',display_name:'Remote name'}]);
  assert.deepEqual(r.getSnapshot().agents.map(a=>a.name),['Coordinator','Remote name']);
  r.setProfiles('local',[]); assert.equal(main(r).name,'default');
});

test('exact identifiers do not collide or get normalized', () => {
  const r=setup();
  for(const sid of ['a:b','a',' s1 ', 's1']) r.observeSession({...scope,sessionId:sid});
  assert.equal(new Set(r.getSnapshot().agents.map(a=>a.id)).size,4);
  assert.ok(r.getSnapshot().agents.some(a=>a.sessionId===' s1 '));
});

test('foreign events and sessionless events are rejected', () => {
  const r=setup();
  assert.equal(emit(r,'message.start',{}, {connectionId:'remote'}),false);
  assert.equal(emit(r,'message.start',{}, {profile:'other'}),false);
  assert.equal(emit(r,'message.start',{}, {session_id:undefined}),false);
  assert.equal(r.getSnapshot().agents.length,0);
});

test('subagent identity, nested parent linkage and batches are real', () => {
  const r=setup();
  emit(r,'subagent.spawn_requested',{subagent_id:'a',child_session_id:'child-a',delegation_id:'batch1'});
  assert.equal(child(r).status,'unknown'); assert.equal(child(r).activity,'queued');
  assert.equal(child(r).parentId,main(r).id); assert.equal(main(r).status,'unknown');
  emit(r,'subagent.start',{subagent_id:'a',child_session_id:'child-a'});
  emit(r,'subagent.start',{subagent_id:'b',parent_id:'a',delegation_id:'batch2'});
  const [a,b]=r.getSnapshot().agents.filter(a=>a.kind==='subagent');
  assert.equal(b.parentId,a.id); assert.equal(a.delegationId,'batch1'); assert.equal(b.delegationId,'batch2');
  assert.equal(a.name,'Worker · a');
  assert.equal(emit(r,'subagent.start',{task_index:0}),false);
  assert.equal(r.getSnapshot().agents.length,3);
});

test('watched child native stream aliases to the actual child, in either order', () => {
  for(const watchedFirst of [false,true]) {
    const r=setup();
    if(watchedFirst) r.observeSession({...scope,sessionId:'watch',storedSessionId:'child-db',busy:true});
    emit(r,'subagent.start',{subagent_id:'child',child_session_id:'child-db'});
    r.observeSession({...scope,sessionId:'watch',storedSessionId:'child-db'});
    emit(r,'tool.start',{tool_id:'native-tool',name:'read_file'},{session_id:'watch'});
    assert.equal(r.getSnapshot().agents.length,2);
    assert.equal(child(r).tool,'read_file');
    assert.equal(child(r).storedSessionId,'child-db');
    assert.equal(child(r).runtimeSessionId,'watch');
  }
});

test('completion semantics distinguish success, failure, interrupted and unknown', () => {
  for(const [status,wanted] of [['complete','done'],['error','error'],['interrupted','unknown'],[undefined,'unknown']]) {
    const r=setup(); emit(r,'message.start'); emit(r,'message.complete',{status});
    assert.equal(main(r).status,wanted);
    emit(r,'tool.complete',{name:'read_file',tool_id:'late'});
    assert.equal(main(r).status,wanted,'late completion must not revive a terminal turn');
  }
  for(const [status,wanted] of [['completed','done'],['failed','error'],['timeout','error'],['interrupted','unknown'],['nonsense','unknown']]) {
    const r=setup(); emit(r,'subagent.complete',{subagent_id:'c',status});
    emit(r,'subagent.start',{subagent_id:'c'});
    assert.equal(child(r).status,wanted);
  }
});

test('attention is sticky across noise, disconnect and a later turn; acknowledgement is local', () => {
  const r=setup(); emit(r,'message.start');
  emit(r,'approval.request',{request_id:'approval'});
  emit(r,'reasoning.delta',{text:'private'});
  assert.equal(main(r).status,'waiting');
  r.setConnection({id:'local',profile:'default',status:'closed'});
  assert.equal(main(r).status,'unknown'); assert.equal(main(r).attention,'waiting'); assert.equal(main(r).verified,false);
  r.setConnection({id:'local',profile:'default',status:'open'});
  assert.equal(main(r).status,'unknown');
  emit(r,'message.complete',{status:'error'});
  emit(r,'message.start'); assert.equal(main(r).status,'active'); assert.equal(main(r).attention,'error');
  r.acknowledge(main(r).id); assert.equal(main(r).attention,null);
  emit(r,'approval.request',{request_id:'second'}); r.acknowledge(main(r).id);
  assert.equal(main(r).status,'waiting');
});

test('clarify tool is waiting until its matching completion, not unrelated tool completions', () => {
  const r=setup(); emit(r,'tool.start',{name:'clarify',tool_id:'q'});
  assert.equal(main(r).status,'waiting');
  emit(r,'tool.complete',{name:'read_file',tool_id:'different'}); assert.equal(main(r).status,'waiting');
  emit(r,'tool.complete',{name:'clarify',tool_id:'q'}); assert.equal(main(r).status,'active');
  assert.equal(main(r).attention,'waiting');
});

test('disconnect invalidates work, rejects offline events and never turns reconnect into work', () => {
  const r=setup(); emit(r,'message.start');
  r.setConnection({id:'local',profile:'default',status:'error'});
  assert.equal(emit(r,'tool.start',{name:'terminal',tool_id:'offline'}),false);
  r.setConnection({id:'local',profile:'default',status:'open'});
  assert.equal(main(r).status,'unknown'); assert.equal(main(r).verified,false);
  emit(r,'tool.start',{name:'terminal',tool_id:'new'}); assert.equal(main(r).status,'active');
});

test('sequence replay and late events are deduped; epoch changes reset only their scope', () => {
  const r=setup(); r.setConnection({id:'local',profile:'default',status:'open',replayEpoch:'one'});
  emit(r,'message.start',{}, {seq:10});
  const snap=r.getSnapshot();
  assert.equal(emit(r,'message.start',{}, {seq:10}),false); assert.equal(r.getSnapshot(),snap);
  emit(r,'message.complete',{status:'complete'},{seq:12});
  assert.equal(emit(r,'tool.start',{name:'terminal',tool_id:'late'},{seq:11}),false);
  r.setConnection({id:'local',profile:'default',status:'open',replayEpoch:'two'});
  emit(r,'message.start',{}, {seq:1}); assert.equal(main(r).status,'active');
});

test('a backend epoch reset also releases scoped tool-id replay guards', () => {
  const r=setup(); r.setConnection({id:'local',profile:'default',status:'open',replayEpoch:'one'});
  emit(r,'tool.start',{name:'terminal',tool_id:'reused'},{seq:10});
  r.setConnection({id:'local',profile:'default',status:'open',replayEpoch:'two'});
  assert.equal(emit(r,'tool.start',{name:'terminal',tool_id:'reused'},{seq:1}),true);
  assert.equal(main(r).status,'active');
});

test('unsequenced identical events and tool-id replay do not churn snapshots', () => {
  const r=setup(); emit(r,'message.start'); const a=r.getSnapshot();
  emit(r,'message.start'); assert.equal(r.getSnapshot(),a);
  emit(r,'tool.start',{name:'read_file',tool_id:'t'});
  emit(r,'tool.complete',{name:'read_file',tool_id:'t'});
  const b=r.getSnapshot(); emit(r,'tool.start',{name:'read_file',tool_id:'t'}); assert.equal(r.getSnapshot(),b);
});

test('all agents remain, slots stay stable and event history alone is bounded', () => {
  const r=createRuntime({eventLimit:4}); r.setConnection({id:'local',profile:'default',status:'open'});
  for(let i=0;i<80;i++) emit(r,'subagent.start',{subagent_id:`child-${i}`});
  assert.equal(r.getSnapshot().agents.length,81); assert.equal(r.getSnapshot().events.length,4);
  const slots=new Map(r.getSnapshot().agents.map(a=>[a.id,a.slot]));
  for(let i=0;i<80;i++) emit(r,'subagent.complete',{subagent_id:`child-${i}`,status:'completed'});
  assert.equal(r.getSnapshot().agents.length,81);
  for(const a of r.getSnapshot().agents) assert.equal(a.slot,slots.get(a.id));
});

test('snapshot is immutable and metadata-only, subscribers isolated, disposal idempotent', () => {
  const r=setup(); let notifications=0;
  r.subscribe(()=>{throw Error('broken renderer');}); const off=r.subscribe(()=>notifications++);
  emit(r,'tool.start',{name:'terminal',tool_id:'t',args:{password:'DO NOT STORE'},preview:'DO NOT STORE'});
  assert.equal(notifications,1); assert.ok(Object.isFrozen(r.getSnapshot().agents[0]));
  assert.equal(JSON.stringify(r.getSnapshot()).includes('DO NOT STORE'),false);
  off(); off(); r.dispose(); r.dispose(); const snap=r.getSnapshot(); emit(r,'message.start');
  assert.equal(r.getSnapshot(),snap); assert.equal(notifications,1);
});

test('nested linkage survives sparse progress and completion payloads', () => {
  const r=setup(); emit(r,'subagent.start',{subagent_id:'nested',parent_id:'parent'});
  const parent=child(r).parentId;
  emit(r,'subagent.progress',{subagent_id:'nested'}); assert.equal(child(r).parentId,parent);
  emit(r,'subagent.complete',{subagent_id:'nested',status:'completed'}); assert.equal(child(r).parentId,parent);
});

test('a status-less child mirror never downgrades an authoritative completion', () => {
  const r=setup(); emit(r,'subagent.start',{subagent_id:'c',child_session_id:'db'});
  r.observeSession({...scope,sessionId:'watch',storedSessionId:'db'});
  emit(r,'subagent.complete',{subagent_id:'c',status:'completed'});
  emit(r,'message.complete',{}, {session_id:'watch'});
  assert.equal(child(r).status,'done');
});

test('a child discovered first by durable id merges when its subagent id arrives', () => {
  const r=setup(); emit(r,'subagent.start',{child_session_id:'db'}); const slot=child(r).slot;
  emit(r,'subagent.tool',{subagent_id:'real-id',child_session_id:'db',tool_name:'terminal'});
  assert.equal(r.getSnapshot().agents.length,2); assert.equal(child(r).subagentId,'real-id'); assert.equal(child(r).slot,slot);
});

test('new stream evidence after disconnect is not swallowed by old unsequenced fingerprints', () => {
  const r=setup(); emit(r,'message.start');
  r.setConnection({id:'local',profile:'default',status:'closed'}); r.setConnection({id:'local',profile:'default',status:'open'});
  emit(r,'message.start'); assert.equal(main(r).status,'active');
});

test('busy false is not completion and a confirmed fresh busy edge starts the next turn', () => {
  const r=setup(); emit(r,'message.start'); r.observeSession({...scope,sessionId:'s1',busy:false});
  assert.equal(main(r).status,'idle');
  emit(r,'message.complete',{status:'complete'});
  r.observeSession({...scope,sessionId:'s1',busy:true}); assert.equal(main(r).status,'done');
  r.observeSession({...scope,sessionId:'s1',busy:true,newTurn:true}); assert.equal(main(r).status,'active');
});
