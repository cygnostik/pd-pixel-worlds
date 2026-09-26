// Original pixel machinery. The two blue reaction streams converge on the
// dark dilithium collar; cyan is a moving highlight, never a white column.
const clamp=n=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
const timeValue=t=>Number.isFinite(t)?Math.max(0,t):0;
const bandColors=['#245d9a','#337fb9','#4daddb','#6bcdf2','#8ce5ff'];
function bandLevel(distance,time,pulse){
 // A packet enters from each outer end, reaches the collar, then leaves a
 // dim interval before the next packet (as in the supplied moving reference).
 const phase=((timeValue(time)+.176)%1.4)/.8,delta=Math.abs(distance-phase);
 const crest=Math.max(0,1-delta/.18);
 return Math.min(4,Math.floor(crest*4+clamp(pulse)*.8));
}
function plasmaConduit(p,x,w){
 const {rect:r,line:l,poly:q}=p;
 q([[x,108],[x+4,104],[x+w-4,104],[x+w,108],[x+w,122],[x,122]],'#20232d');
 r(x,108,w,14,'#39293d');l(x+3,105,x+w-3,105,'#697079');
 for(let row=0;row<3;row++)r(x+2,109+row*5,w-4,3,row===1?'#ca758d':'#99536d');
 for(let xx=x+4;xx<x+w-2;xx+=7)r(xx,106,2,17,'#1d2430');
 l(x+1,123,x+w-1,123,'#151f2a');
}
export function drawWarpCore(p,time=0,pulse=0){
 const {rect:r,poly:q,oval:o,line:l}=p;
 r(216,12,86,148,'#101f38');r(223,12,72,148,'#18385f');
 q([[232,10],[286,10],[292,76],[226,76]],'#255389');
 r(233,12,51,67,'#255f9c');r(237,12,10,67,'#3077b2');r(255,12,17,67,'#3786bb');r(277,12,7,67,'#1b457a');
 r(230,128,60,32,'#245b96');r(237,130,45,30,'#2d75ac');r(251,130,15,30,'#3c8cbb');
 for(const [start,end,fromTop] of [[13,76,true],[131,159,false]])for(let y=start;y<end;y+=7){
  const distance=fromTop?(y-start)/(end-start):(end-y)/(end-start),level=bandLevel(distance,time,pulse);
  r(231,y+1,56,4,bandColors[level]);r(235,y,48,1,level>=3?'#94e4fa':'#4387b3');
  r(234,y+5,50,1,'#163b65');r(248,y+1,22,3,bandColors[Math.min(4,level+1)]);
 }
 for(const x of [227,247,271,287]){r(x,11,3,65,'#14283f');r(x+1,11,1,65,'#3d627b');r(x,131,3,29,'#1a2b43');}
 // Both ducts continue UNDER the collar. Their visible ends cannot float a
 // few pixels outside it, even after the hall's quantized projection.
 plasmaConduit(p,183,45);plasmaConduit(p,291,46);
 o(259,77,39,7,'#162637');r(222,77,75,21,'#1e2b3b');q([[222,94],[297,94],[308,108],[306,124],[213,124],[211,108]],'#152333');
 o(259,96,43,9,'#263b54');r(216,97,87,24,'#1d2d44');o(259,123,43,9,'#172335');
 l(224,80,294,80,'#527794');l(218,119,301,119,'#365a7c');
 o(259,109,13,14,'#40586c');o(259,109,10,11,'#122032');o(259,109,8,9,'#d6f5ff');r(258,99,3,21,'#1a2d48');r(257,95,5,3,'#7694a5');r(257,121,5,3,'#65869a');
 for(const x of [216,282]){r(x,104,22,10,'#36517d');for(let i=0;i<4;i++)r(x+2+i*5,106,3,6,'#b7dfef');}
 q([[257,84],[260,79],[263,84]],'#c99486');r(260,81,1,2,'#d8d2b7');
}
export function drawHallCore(p,time=0,pulse=0){
 const Y=y=>43+Math.round(y*.72);
 drawWarpCore({...p,
  rect:(x,y,w,h,c)=>p.rect(x,Y(y),w,Math.max(1,Y(y+h)-Y(y)),c),
  line:(x,y,xx,yy,c,w=1)=>p.line(x,Y(y),xx,Y(yy),c,w),
  poly:(points,c)=>p.poly(points.map(([x,y])=>[x,Y(y)]),c),
  oval:(x,y,rx,ry,c)=>p.oval(x,Y(y),rx,rx<=13?Math.min(rx,ry):Math.round(ry*.72),c),
 },time,pulse);
}
