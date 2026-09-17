import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAgents, counts, attentionStatus, demonstration, themePreference, sessionTarget } from '../src/ui-model.js';

test('attention stays visible and pagination never drops entities', () => {
  const agents = Array.from({length:27},(_,i)=>({id:`a${i}`,slot:i,status:i===26?'waiting':'idle'}));
  const first = selectAgents(agents,{page:0,pageSize:12});
  assert.equal(first.visible[0].id,'a26');
  const all = [0,1,2].flatMap(page=>selectAgents(agents,{page,pageSize:12}).visible);
  assert.equal(new Set(all.map(a=>a.id)).size,27);
  assert.equal(selectAgents(agents,{page:9}).page,2);
  assert.deepEqual(counts(agents),{total:27,active:0,attention:1,unknown:0});
});
test('sticky attention remains first and unverified activity is not counted',()=>{
 const agents=[{id:'a',slot:0,status:'active',verified:false},{id:'b',slot:1,status:'done',verified:true,attention:'error'},{id:'c',slot:2,status:'active',verified:true}];
 assert.deepEqual(counts(agents),{total:3,active:1,attention:1,unknown:1});
 assert.equal(selectAgents(agents).visible[0].id,'b');
 assert.equal(attentionStatus(agents[1]),'error');
});
test('same-name sessions remain findable by exact owner and session identifiers',()=>{
 const agents=[{id:'a',name:'Coordinator',profile:'default',connectionId:'local',sessionId:'session-one',storedSessionId:'stored-one',status:'idle'},{id:'b',name:'Coordinator',profile:'default',connectionId:'remote',sessionId:'session-two',subagentId:'worker-two',status:'idle'}];
 for(const query of ['session-two','worker-two','remote'])assert.equal(selectAgents(agents,{query}).visible[0]?.id,'b');
 assert.equal(selectAgents(agents,{query:'stored-one'}).visible[0]?.id,'a');
});
test('demo state is disposable and preference accepts known themes only', () => {
  const a=demonstration(), b=demonstration(); a.agents[0].name='changed';
  assert.notEqual(a.agents[0].name,b.agents[0].name);
  assert.ok(b.agents.every(x=>x.id.startsWith('demo:')));
  assert.equal(themePreference('bad',[{id:'office'}]),'office');
});
test('navigation needs durable exact owner, never a guessed runtime id', () => {
  assert.equal(sessionTarget({sessionId:'runtime',profile:'a',connectionId:'local'}),null);
  assert.deepEqual(sessionTarget({storedSessionId:'durable',profile:'a',connectionId:'local'},[{connectionId:'local',profile:'a',targetProfile:'a',mode:'local'}]),{id:'durable',options:{route:{connectionId:'local',profile:'a',targetProfile:'a',mode:'local'},keepAllProfilesScope:true}});
  assert.equal(sessionTarget({storedSessionId:'x',profile:'a',connectionId:'remote'},[]),null);
});
