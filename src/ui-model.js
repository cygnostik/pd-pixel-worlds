const PRIORITY = {waiting:0,error:1,active:2,queued:3,unknown:4,done:5,idle:6};
export const attentionStatus = agent => ['waiting','error'].includes(agent.attention)?agent.attention:['waiting','error'].includes(agent.status)?agent.status:null;
export function selectAgents(agents,{page=0,pageSize=12,query=''}={}) {
  const filtered=agents.filter(a=>[a.name,a.profile,a.tool,a.activity,a.connectionId,a.sessionId,a.storedSessionId,a.subagentId].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase())).slice().sort((a,b)=>(PRIORITY[attentionStatus(a)||a.status]??4)-(PRIORITY[attentionStatus(b)||b.status]??4)||(a.slot??0)-(b.slot??0)||a.id.localeCompare(b.id));
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  page=Math.max(0,Math.min(pages-1,page));
  return {visible:filtered.slice(page*pageSize,(page+1)*pageSize),filtered,page,pages,total:filtered.length};
}
export function counts(agents) {return {total:agents.length,active:agents.filter(a=>a.status==='active'&&a.verified!==false).length,attention:agents.filter(a=>attentionStatus(a)).length,unknown:agents.filter(a=>a.status==='unknown'||a.verified===false).length};}
export function themePreference(value,themes){return themes.some(t=>t.id===value)?value:themes[0]?.id;}
export function sessionTarget(agent,routes=[]) {
  if(!agent?.storedSessionId || !agent.connectionId || !agent.profile) return null;
  const matches=routes.filter(r=>r.connectionId===agent.connectionId && (r.targetProfile||r.profile)===agent.profile);
  if(matches.length!==1)return null;
  return {id:agent.storedSessionId,options:{route:matches[0],keepAllProfilesScope:true}};
}
export function demonstration(){
  const names=['Coordinator','Researcher','Builder','Reviewer','Designer','Archivist'];
  const states=['active','active','active','waiting','idle','done'];
  const activities=['delegating','reading','writing','waiting','idle','complete'];
  return {revision:0,connections:[],events:[],agents:names.map((name,slot)=>({id:`demo:${slot}`,name,slot,profile:'demonstration',connectionId:'demo',sessionId:`demo:${slot}`,storedSessionId:'',kind:slot===0?'main':'child',parentId:slot>0&&slot<4?'demo:0':null,status:states[slot],activity:activities[slot],tool:slot===1?'web_search':slot===2?'write_file':'',detail:slot===3?'Example approval request':'Illustrative agent · not live work',lastSeen:Date.now()}))};
}
