import { painter, keyboard } from './pixels.js';
const SKINS=[['#e8b58a','#c58d6b','#f5caa0'],['#ba8768','#8b5d49','#d4a27d'],['#91684f','#654637','#b38a68'],['#e2c6a0','#b8a180','#f2d6af']];
const HAIR=['#574030','#332e2e','#815437','#b58e54','#655951','#342e36'];
const SHIRTS=[['#d9d2ac','#b2ae94'],['#9dacb3','#75898e'],['#b6c0a3','#879778'],['#cfb0a0','#b18c80'],['#d8d0bb','#aea791'],['#a5a0b5','#817d93']];
const FURS=[['#d8a268','#a97747','#f7dfb2'],['#666266','#45434c','#ddd6bf'],['#e4d3b5','#b5a38e','#fff0d1'],['#ad8270','#765549','#eedbc0'],['#858f92','#5a666f','#c8d1c5'],['#555451','#383d40','#f1e4c6']];
export const STATUS={active:{color:'#90bb94',glyph:'›'},waiting:{color:'#ebc37f',glyph:'?'},error:{color:'#e48e7a',glyph:'!'},done:{color:'#afd0ba',glyph:'✓'},idle:{color:'#c6bba3',glyph:'·'},unknown:{color:'#b8adcb',glyph:'–'}};
export function identity(id){return Array.from(String(id)).reduce((n,c,i)=>n+c.codePointAt(0)*(i+1),0);}
function human(p,x,y,agent,theme,t,team,walk,teamIndex=0,seated=false,facing='south',pose=null){
 const n=Number.isSafeInteger(agent.slot)&&agent.slot>=0?agent.slot:identity(agent.id),skin=SKINS[n%SKINS.length],hair=HAIR[n%HAIR.length];const isCrew=theme==='bridge';
 const shirt=isCrew?[[ '#b9575d','#833d49'],['#c9a15c','#9a7947'],['#639797','#487373']][n%3]:SHIRTS[n%6];
 if(isCrew&&facing!=='south'){crewProfile(p,x,y,agent,t,n,skin,hair,shirt,walk,seated,facing,pose);return;}
 const {rect:r,poly:q,line:l,oval:o}=p;
 const phase=t*3.6+n%11,step=walk?(t===0&&pose==='walk'?0:Math.sin(phase*2)):0,bob=walk?Math.round(Math.abs(step)):0;
 y-=bob;
 const active=agent.status==='active',wait=agent.status==='waiting',error=agent.status==='error',done=agent.status==='done';
 // 36-art-pixel figure; selective contours and three-tone face, not a 7×13 glyph.
 if(seated){
  q([[x-7,y-14],[x-1,y-13],[x-7,y-7],[x-12,y-8]],'#363941');q([[x+1,y-13],[x+7,y-14],[x+12,y-8],[x+7,y-7]],'#292f39');
  r(x-12,y-9,5,7,'#363941');r(x+7,y-9,5,7,'#292f39');r(x-12,y-9,2,5,'#58606a');r(x+7,y-9,2,5,'#444c58');r(x-14,y-3,8,3,'#282a2e');r(x+7,y-3,8,3,'#25272a');
 }else{
  r(x-7,y-14,6,12,'#363941');r(x+1,y-14,6,12,'#292f39');r(x-6,y-11,2,8,'#58606a');r(x+2,y-11,2,8,'#444c58');
  r(x-8,y-3+Math.round(step*2),8,3,'#282a2e');r(x+1,y-3-Math.round(step*2),8,3,'#25272a');r(x-7,y-3+Math.round(step*2),5,1,'#66645d');r(x+2,y-3-Math.round(step*2),5,1,'#575850');
 }
 q([[x-6,y-25],[x+6,y-25],[x+9,y-21],[x+8,y-13],[x-8,y-13],[x-9,y-21]],'#39383a');
 r(x-6,y-24,12,11,shirt[0]);r(x-6,y-22,3,9,shirt[1]);r(x+5,y-22,2,9,shirt[1]);r(x-4,y-23,2,9,isCrew?shirt[0]:'#e9e0c4');
 if(isCrew){r(x-7,y-24,14,3,'#282d34');r(x-7,y-14,14,2,'#272e38');r(x+3,y-20,2,3,'#e3d29d');r(x+4,y-21,1,1,'#f4e4b4');}
 else{q([[x-3,y-24],[x,y-21],[x+3,y-24]],'#f3ead6');r(x,y-21,2,7,['#8c5846','#657579','#786080'][n%3]);r(x,y-14,2,1,'#514c46');r(x+4,y-20,2,3,'#ece4c8');}
 // Neck, ears and head share the same root in every action.
 p.c.save();
 const glance=t===0||pose?0:(wait?Math.round(Math.sin(t*.65+n)):error?Math.round(Math.sin(t*.85+n)):0);
 p.c.translate(glance,0);
 r(x-2,y-28,5,4,skin[1]);r(x-6,y-34,12,9,hair);r(x-7,y-31,14,5,skin[1]);r(x-5,y-33,10,9,skin[0]);r(x-4,y-32,8,5,skin[2]);r(x+3,y-30,2,5,skin[1]);r(x-4,y-25,7,1,skin[1]);
 r(x-5,y-36,10,4,hair);r(x-7,y-34,3,7,hair);r(x+4,y-34,3,5,hair);r(x-3,y-36,5,1,n%3===0?'#aa8250':'#78604b');
 if(n%4===0){r(x+5,y-28,3,4,hair);r(x-7,y-28,3,4,hair);} // side curls
 const blink=t>0&&Math.floor(t*2+n)%17===0;
 r(x-3,y-30,2,blink?1:2,'#333139');r(x+2,y-30,2,blink?1:2,'#333139');r(x,y-28,1,2,skin[1]);r(x-1,y-25,3,1,'#966d5a');
 if(n%5===0){r(x-5,y-31,5,1,'#524e46');r(x+1,y-31,5,1,'#524e46');r(x-5,y-30,1,3,'#524e46');r(x+5,y-30,1,3,'#524e46');r(x-1,y-30,2,1,'#524e46');}
 if(error&&!pose){r(x-4,y-32,3,1,hair);r(x+2,y-33,3,1,hair);}
 p.c.restore();
 // Attached arms: working taps, expectant folded arms, puzzled hand-to-temple.
 const tap=active?Math.round(Math.sin(phase*2)*1.5):0;
 if(isCrew&&pose){
  const gesture=t===0?0:Math.round(Math.sin(t*1.8+n));
  if(pose==='walk'){
   r(x-10,y-23,4,10+Math.round(step*2),shirt[1]);r(x+7,y-23,4,10-Math.round(step*2),shirt[0]);
   r(x-10,y-13+Math.round(step*2),4,3,skin[0]);r(x+7,y-13-Math.round(step*2),4,3,skin[2]);
  }else if(pose==='padd'){
   r(x-10,y-23,4,8,shirt[1]);r(x+7,y-23,4,8,shirt[0]);
   r(x-5,y-21,10,11,'#343e4b');r(x-3,y-19,6,6,'#8da9b2');r(x-2,y-18,4,1,'#d3c7a1');r(x-2,y-13,3,1,'#d7ad7c');
   r(x-7,y-16,4,3,skin[0]);r(x+3,y-17+gesture,4,3,skin[2]);
  }else if(pose==='inspect'){
   r(x-10,y-23,4,11,shirt[1]);r(x-10,y-13,4,3,skin[0]);
   l(x+7,y-22,x+12,y-25+gesture,shirt[0],3);r(x+11,y-28+gesture,3,4,skin[2]);
   r(x+12,y-31+gesture,3,5,'#444d5a');r(x+12,y-30+gesture,2,2,'#a6bac1');
  }else if(pose==='work'){
   r(x-10,y-23,4,8,shirt[1]);r(x+7,y-23,4,8,shirt[0]);
   l(x-8,y-16,x-5,y-13+gesture,shirt[1],3);l(x+8,y-16,x+5,y-13-gesture,shirt[0],3);
   r(x-6,y-13+gesture,4,3,skin[0]);r(x+3,y-13-gesture,4,3,skin[2]);
  }else{r(x-10,y-23,4,11,shirt[1]);r(x+7,y-23,4,11,shirt[0]);r(x-10,y-13,4,3,skin[0]);r(x+7,y-13,4,3,skin[2]);}
 }else if(team){
  const cycle=(t*.68+teamIndex*.27)%1,angle=t===0?-.85:cycle<.28?-.9-cycle*2:cycle<.48?-1.46+(cycle-.28)*11:cycle<.7?.74:(.74-(cycle-.7)*5.3);
  const hx=x+8,hy=y-20,ex=hx+Math.cos(angle)*22,ey=hy+Math.sin(angle)*22;
  l(x+6,y-22,hx+3,hy,shirt[0],4);l(x-7,y-22,hx,hy+2,shirt[1],3);r(hx,hy,5,3,skin[0]);
  l(hx+1,hy,ex,ey,'#745237',4);l(hx+1,hy-1,ex,ey-1,'#d8b97c',2);r(hx,hy,3,3,skin[0]);
 }else if(error){r(x-10,y-23,4,9,shirt[1]);r(x+7,y-25,4,8,shirt[0]);r(x+6,y-29,4,5,skin[0]);r(x-10,y-16,4,4,skin[0]);}
 else if(wait){r(x-10,y-22,4,8,shirt[1]);r(x+7,y-22,4,8,shirt[0]);r(x-8,y-16,16,3,shirt[1]);r(x-1,y-16,6,2,skin[0]);}
 else if(active){r(x-10,y-22,4,8,shirt[1]);r(x+7,y-22,4,8,shirt[0]);r(x-10,y-14,21,7,isCrew?'#272f39':'#c4b798');r(x-8,y-13,17,4,isCrew?'#8b8e9b':'#6b8177');r(x-6,y-12,6,1,isCrew?'#d6af7c':'#b6c7ac');r(x-8,y-17+tap,5,4,skin[0]);r(x+3,y-16-tap,5,4,skin[2]);}
 else{r(x-10,y-23,4,11,shirt[1]);r(x+7,y-23,4,done?7:11,shirt[0]);r(x-10,y-13,4,4,skin[0]);r(x+7,y-(done?19:13),4,4,skin[2]);}
}
// Station-facing crew use the same identity palette and 36px head/foot anchors.
// Profiles are authored facing east, then mirrored as a whole for west.
function crewProfile(p,x,y,agent,t,n,skin,hair,shirt,walk,seated,facing,pose){
 const {rect:r,line:l,poly:q}=p,north=facing==='north';
 const step=walk&&t>0?Math.sin(t*7.2+n%11*2):0,swing=Math.round(step*3);
 const gesture=t===0?0:Math.round(Math.sin(t*1.8+n));
 const action=walk?'walk':pose||(agent.status==='active'?'work':agent.status);
 y-=walk?Math.round(Math.abs(step)):0;
 p.c.save();if(facing==='west'){p.c.translate(x*2,0);p.c.scale(-1,1);}
 if(north){
  if(seated){
   q([[x-7,y-14],[x-1,y-13],[x-5,y-6],[x-10,y-6]],'#363941');q([[x+1,y-13],[x+7,y-14],[x+10,y-6],[x+5,y-6]],'#292f39');
   r(x-10,y-7,5,5,'#363941');r(x+5,y-7,5,5,'#292f39');r(x-11,y-3,6,3,'#282a2e');r(x+5,y-3,6,3,'#25272a');
  }else{
   r(x-7,y-14,6,12,'#363941');r(x+1,y-14,6,12,'#292f39');r(x-6,y-11,2,7,'#58606a');r(x+2,y-11,2,7,'#444c58');
   r(x-8,y-3+swing,8,3,'#282a2e');r(x+1,y-3-swing,8,3,'#25272a');
  }
  q([[x-6,y-25],[x+6,y-25],[x+9,y-21],[x+8,y-13],[x-8,y-13],[x-9,y-21]],'#39383a');
  r(x-6,y-24,12,11,shirt[0]);r(x-6,y-22,3,9,shirt[1]);r(x+5,y-22,2,9,shirt[1]);r(x-7,y-25,14,4,'#282d34');r(x-7,y-14,14,2,'#272e38');
  r(x-2,y-28,5,4,skin[1]);r(x-7,y-31,14,5,skin[1]);r(x-6,y-35,12,10,hair);r(x-4,y-36,8,2,hair);r(x-3,y-35,5,1,n%3===0?'#aa8250':'#78604b');
  if(n%4===0){r(x-7,y-28,3,4,hair);r(x+5,y-28,3,4,hair);}
  // Devices are in front of the torso: only their outer edge peeks past a shoulder.
  if(action==='padd'){r(x+8,y-23,5,8,'#343e4b');r(x+10,y-22,2,4,'#8da9b2');}
  if(action==='inspect'){r(x+12,y-31+gesture,3,6,'#444d5a');r(x+13,y-30+gesture,2,2,'#a6bac1');}
  const reach=action==='work'||action==='padd',raised=action==='inspect'||action==='error';
  r(x-10,y-23,4,reach?7:11+(walk?swing:0),shirt[1]);r(x-10,y-(reach?18:13)+(walk?swing:0),4,3,skin[0]);
  if(raised){l(x+7,y-22,x+12,y-27+gesture,shirt[0],3);r(x+11,y-28+gesture,3,4,skin[2]);}
  else{r(x+7,y-23,4,reach?7:11-(walk?swing:0),shirt[0]);r(x+7,y-(reach?18:13)-(walk?swing:0)+(reach?gesture:0),4,3,skin[2]);}
 }else{
  // Far leg/arm precede the near silhouette, keeping side seating readable.
  if(seated){r(x-3,y-14,13,5,'#292f39');r(x+6,y-10,5,8,'#292f39');r(x+6,y-3,10,3,'#25272a');}
  else{r(x-3-swing,y-14,5,12,'#292f39');r(x-3-swing,y-3,8,3,'#25272a');}
  r(x-2,y-24,4,11,shirt[1]);r(x,y-14,4,3,skin[1]);
  if(seated){r(x-5,y-14,12,5,'#363941');r(x+3,y-10,5,8,'#363941');r(x+4,y-9,2,6,'#58606a');r(x+3,y-3,10,3,'#282a2e');}
  else{r(x-5+swing,y-14,6,12,'#363941');r(x-4+swing,y-11,2,8,'#58606a');r(x-5+swing,y-3,9,3,'#282a2e');}
  q([[x-4,y-25],[x+3,y-25],[x+6,y-21],[x+4,y-13],[x-5,y-13],[x-6,y-21]],'#39383a');
  r(x-4,y-24,8,11,shirt[0]);r(x-4,y-22,3,9,shirt[1]);r(x-5,y-25,9,4,'#282d34');r(x-5,y-14,10,2,'#272e38');r(x+3,y-20,1,3,'#e3d29d');
  r(x-1,y-28,4,4,skin[1]);r(x-5,y-34,10,10,hair);r(x,y-33,6,9,skin[0]);r(x+2,y-32,4,5,skin[2]);r(x+5,y-29,3,2,skin[0]);r(x+2,y-25,4,1,skin[1]);
  r(x-4,y-36,8,4,hair);r(x-5,y-34,4,8,hair);r(x-3,y-35,4,1,n%3===0?'#aa8250':'#78604b');r(x-1,y-29,2,3,skin[1]);
  const blink=t>0&&Math.floor(t*2+n)%17===0;r(x+3,y-30,2,blink?1:2,'#333139');
  if(n%5===0){r(x+1,y-31,6,1,'#524e46');r(x+6,y-30,1,3,'#524e46');}
  if(n%4===0)r(x-5,y-28,3,4,hair);
  if(action==='padd'){
   r(x+7,y-23,7,10,'#343e4b');r(x+9,y-21,3,5,'#8da9b2');r(x+9,y-20,2,1,'#d3c7a1');
   l(x-2,y-22,x+2,y-16,shirt[0],4);l(x+2,y-16,x+8,y-17,shirt[0],3);r(x+8,y-18+gesture,4,3,skin[0]);
  }else if(action==='inspect'||action==='error'){
   l(x-2,y-22,x+5,y-20,shirt[0],4);l(x+5,y-20,x+9,y-27+gesture,shirt[0],3);r(x+8,y-29+gesture,4,4,skin[0]);
   if(action==='inspect'){r(x+10,y-32+gesture,3,5,'#444d5a');r(x+11,y-31+gesture,2,2,'#a6bac1');}
  }else if(action==='work'){
   l(x-2,y-22,x+3,y-19,shirt[0],4);l(x+3,y-19,x+11,y-21+gesture,shirt[0],3);r(x+11,y-22+gesture,4,3,skin[0]);
  }else if(action==='waiting'){
   l(x-2,y-22,x+1,y-15,shirt[0],4);r(x+1,y-16,7,3,shirt[1]);r(x+5,y-17,3,3,skin[0]);
  }else{
   l(x-2,y-22,x-2+swing,y-13,shirt[0],4);r(x-2+swing,y-13,4,3,skin[0]);
  }
 }
 p.c.restore();
}
function kitten(p,x,y,agent,t,walk){
 const n=Number.isSafeInteger(agent.slot)&&agent.slot>=0?agent.slot:identity(agent.id),fur=FURS[n%6],{rect:r,poly:q,line:l,oval:o}=p;
 const active=agent.status==='active',idle=agent.status==='idle'||agent.status==='done',error=agent.status==='error',waiting=agent.status==='waiting';
 const tap=active?Math.round(Math.sin(t*7+n)*2):0,step=walk?Math.round(Math.sin(t*7+n)*2):0;
 // A true quadruped silhouette: separate haunch/shoulder, four contact paws and tail root.
 const tailLift=idle?1:Math.round(Math.sin(t*.8+n)*2);
 q([[x+13,y-10],[x+23,y-12],[x+26,y-20-tailLift],[x+25,y-25-tailLift],[x+22,y-26-tailLift],[x+20,y-23-tailLift],[x+22,y-20-tailLift],[x+20,y-15],[x+12,y-14]],fur[1]);
 l(x+16,y-13,x+23,y-17,fur[0],3);r(x+22,y-24-tailLift,3,5,fur[0]);
 o(x+5,y-11,13,idle?7:9,fur[1]);o(x+4,y-13,12,idle?6:8,fur[0]);o(x+9,y-10,6,6,fur[0]);r(x+9,y-5+step,7,4,fur[2]);r(x-1,y-6-step,5,4,fur[1]);
 r(x-12,y-10,5,8,fur[1]);r(x-13,y-4,7,3,fur[2]);r(x-5,y-10,5,8,fur[0]);r(x-6,y-4-tap,8,3,fur[2]);
 if(n%3===0){r(x+4,y-19,3,7,fur[1]);r(x+11,y-17,3,6,fur[1]);r(x+21,y-16,3,3,fur[1]);}
 if(n%3===1){o(x+7,y-14,6,5,fur[1]);r(x-8,y-14,6,8,fur[2]);}
 const hx=x-9,hy=y-(idle?17:20);
 q([[hx-10,hy+3],[hx-10,hy-7],[hx-8,hy-12],[hx-2,hy-8],[hx+3,hy-8],[hx+8,hy-12],[hx+10,hy-5],[hx+10,hy+3],[hx+6,hy+7],[hx-5,hy+7]],fur[1]);
 q([[hx-9,hy+1],[hx-8,hy-8],[hx-3,hy-5],[hx+4,hy-5],[hx+8,hy-8],[hx+9,hy+2],[hx+5,hy+6],[hx-4,hy+6]],fur[0]);
 q([[hx-7,hy-8],[hx-4,hy-5],[hx-7,hy-3]],'#ca9390');q([[hx+7,hy-8],[hx+4,hy-5],[hx+7,hy-3]],'#ca9390');
 if(n%3===0){r(hx-3,hy-6,2,4,fur[1]);r(hx+1,hy-6,2,3,fur[1]);r(hx-9,hy,3,2,fur[1]);r(hx+7,hy,3,2,fur[1]);}
 if(n%3===2){r(hx-8,hy-4,6,5,fur[2]);r(hx+2,hy-4,6,5,fur[2]);}
 const blink=idle||(t>0&&Math.floor(t*2+n)%19===0);
 r(hx-6,hy-1,4,blink?1:3,'#313b36');r(hx+3,hy-1,4,blink?1:3,'#313b36');if(!blink){r(hx-5,hy-1,1,2,'#bdd3a2');r(hx+4,hy-1,1,2,'#bdd3a2');}
 o(hx,hy+4,5,2,fur[2]);r(hx,hy+2,2,1,'#b66e6f');r(hx,hy+3,1,2,'#835f56');r(hx-2,hy+5,2,1,'#835f56');r(hx+1,hy+5,2,1,'#835f56');
 l(hx-13,hy+2,hx-8,hy+3,'#e9d9bb');l(hx+8,hy+3,hx+13,hy+2,'#e9d9bb');
 if(active){keyboard(p,x-19,y+1,22);r(x-10,y-1+tap,7,3,fur[2]);}
 if(waiting){r(hx-7,hy-7,3,1,fur[1]);r(x-5,y-9,4,7,fur[2]);}
 if(error){r(hx-7,hy-3,4,1,fur[1]);r(hx+3,hy-4,4,1,fur[1]);r(x-14,y-13,4,4,fur[2]);}
}
export function drawAgent(ctx,item,theme,time,selected){
 const p=painter(ctx),{x,y,agent,team,walking}=item;
 p.oval(x+2,y+1,theme==='cafe'?22:13,4,theme==='bridge'?'#4d394b50':'#51483545');
 if(selected){p.oval(x,y+1,theme==='cafe'?25:17,6,'#fff1ce');p.oval(x,y+1,theme==='cafe'?22:14,4,theme==='bridge'?'#a88b90':'#ab9f7d');}
 if(theme==='cafe')kitten(p,x,y,agent,time,walking);else {
  const crew=theme==='bridge',directed=crew&&['north','south','east','west'].includes(item.facing),facing=directed?item.facing:'south';
  const walk=walking||(crew&&item.pose==='walk');
  const pose=crew?(walk?'walk':['work','padd','inspect'].includes(item.pose)?item.pose:item.ambient===true?'rest':null):null;
  const seated=crew&&!walk&&(typeof item.seated==='boolean'?item.seated:item.index<5);
  const legacyTeam=team&&!directed&&!pose;
  ctx.save();if(legacyTeam&&x>391){ctx.translate(x*2,0);ctx.scale(-1,1);}
  human(p,x,y,agent,theme,time,legacyTeam&&item.atStation,walk,item.teamIndex,seated,facing,pose);ctx.restore();
 }
}
export function drawBadge(ctx,item,theme,selected){
 const p=painter(ctx),status=item.agent.attention||item.agent.status,s=STATUS[status]||STATUS.unknown,x=item.x,y=item.y;
 // Shape-coded state stays separate from costume or fur color. Ambient alone
 // never hides an agent's state; scenery extras must explicitly opt out.
 if(item.hideBadge!==true){
 p.rect(x+12,y-40,10,10,'#393c38');p.rect(x+13,y-39,8,8,s.color);
 if(status==='active'){p.line(x+15,y-37,x+18,y-35,'#35473d');p.line(x+18,y-35,x+15,y-33,'#35473d');}
 else if(status==='done'){p.line(x+14,y-35,x+16,y-33,'#35473d');p.line(x+16,y-33,x+19,y-37,'#35473d');}
 else if(status==='error'){p.rect(x+16,y-38,2,4,'#5d3730');p.rect(x+16,y-33,2,1,'#5d3730');}
 else if(status==='waiting'){p.rect(x+15,y-38,4,1,'#634e30');p.rect(x+18,y-37,1,2,'#634e30');p.rect(x+16,y-35,3,1,'#634e30');p.rect(x+16,y-33,1,1,'#634e30');}
 else p.rect(x+15,y-35,4,1,'#544e50');
 }
 if(selected){const name=String(item.agent.name||item.agent.id).slice(0,21),width=Math.max(38,name.length*3.8+12),left=Math.max(6,Math.min(474-width,x-width/2));p.rect(left,y+8,width,13,'#313a38');p.rect(left,y+8,width,1,'#f3dfb5');p.text(name,left+6,y+11,'#fff0cf',7);}
}
