import {painter} from './pixels.js';

export const BRIDGE_HOTSPOTS=Object.freeze([
 {id:'bridge-lift',label:'Turbolift',rect:[103,84,42,64],action:'lift'},
 {id:'aft-lcars',label:'LCARS diagnostic sweep',rect:[153,91,174,43],action:'diagnostic'},
]);
export function drawBridgeEffects(ctx,t,{door=0,diagnostic=0}={}){
 const p=painter(ctx);
 if(door>0){
  const x=105,y=88,w=38,height=55,gap=Math.round(door*17);
  p.rect(x,y,w,height,'#161d27');p.rect(x+7,y+5,24,47,'#35333a');p.rect(x+10,y+7,18,2,'#e4d8bc');
  p.rect(x,y,19-gap,height,'#726b6c');p.rect(x+19+gap,y,19-gap,height,'#847977');
  p.rect(x,y+height,w,3,'#bdaf99');p.rect(x+16,y-3,7,2,'#b3d1dd');
 }
 if(diagnostic>0){const x=156+Math.floor(t*19)%162;p.rect(x,96,2,32,'#cbeaf0');p.rect(287,100,20,2,'#bad7d6');}
}
