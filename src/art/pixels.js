/** Original, grid-authored art primitives. All coordinates are 480 × 300 art pixels. */
export const W=480,H=300;
export function painter(c) {
  const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.max(0,Math.round(w)),Math.max(0,Math.round(h)));};
  const line=(x,y,x2,y2,color,width=1)=>{const n=Math.max(Math.abs(x2-x),Math.abs(y2-y));for(let i=0;i<=n;i++)rect(x+(x2-x)*i/(n||1),y+(y2-y)*i/(n||1),width,width,color);};
  const poly=(points,color)=>{const lo=Math.floor(Math.min(...points.map(p=>p[1]))),hi=Math.ceil(Math.max(...points.map(p=>p[1])));for(let y=lo;y<hi;y++){const xs=[];for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}xs.sort((a,b)=>a-b);for(let i=0;i<xs.length;i+=2)rect(Math.ceil(xs[i]),y,Math.floor(xs[i+1])-Math.ceil(xs[i])+1,1,color);}};
  const oval=(x,y,rx,ry,color)=>{for(let dy=-Math.floor(ry);dy<=ry;dy++){const dx=Math.round(rx*Math.sqrt(Math.max(0,1-dy*dy/(ry*ry))));rect(x-dx,y+dy,dx*2+1,1,color);}};
  const text=(s,x,y,color='#eee4ce',size=6)=>{c.fillStyle=color;c.font=`${size}px monospace`;c.textBaseline='top';c.fillText(s,Math.round(x),Math.round(y));};
  return {c,rect,line,poly,oval,text};
}
export function rng(seed=17){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export function plant(p,x,y,scale=1,pot='#ab6850') {
 const {rect:r,poly:q,line:l,oval:o}=p;const s=scale;
 o(x+2*s,y+2*s,12*s,3*s,'#403c3030');q([[x-7*s,y-10*s],[x+7*s,y-10*s],[x+5*s,y+2*s],[x-5*s,y+2*s]],pot);r(x-8*s,y-11*s,16*s,3*s,'#d4a479');r(x-5*s,y-8*s,2*s,8*s,'#edc28a');
 l(x,y-10*s,x,y-33*s,'#627147',2*s);
 [[-9,-27,-5,-17],[7,-35,4,-24],[-6,-39,-2,-26],[10,-24,5,-15],[-12,-17,-4,-12]].forEach(([a,b,d,e],i)=>{q([[x,y+e*s],[x+a*s,y+b*s],[x+(a+7)*s,y+(b-3)*s],[x+d*s,y+(e+2)*s]],i%2?'#627a48':'#3d6448');l(x,y+e*s,x+a*s,y+b*s,'#829155');});
}
export function cup(p,x,y,color='#f4e5c9'){p.oval(x+1,y+5,6,2,'#59443535');p.rect(x,y,6,6,color);p.rect(x+6,y+1,2,4,color);p.rect(x+1,y,4,1,'#62452f');p.rect(x,y+5,5,1,'#c9b88f');}
export function books(p,x,y,n=5){const colors=['#8c5148','#718674','#d4b579','#667985','#b28767'];for(let i=0;i<n;i++){const h=9+(i*3)%6;p.rect(x+i*5,y-h,4,h,colors[i%5]);p.rect(x+i*5,y-h+2,4,1,'#ecd6a2');}}
export function keyboard(p,x,y,w=21){p.poly([[x+2,y],[x+w-2,y],[x+w,y+6],[x,y+6]],'#d4c9ab');for(let j=1;j<5;j+=2)for(let i=3;i<w-2;i+=3)p.rect(x+i,y+j,2,1,'#807b6e');}
export function monitor(p,x,y){const {rect:r,poly:q}=p;q([[x+2,y+2],[x+23,y+2],[x+26,y+6],[x+26,y+23],[x+3,y+23]],'#837b69');r(x,y,23,20,'#d9ccb0');r(x+2,y+2,18,13,'#505c53');r(x+3,y+3,16,11,'#729182');r(x+4,y+4,10,1,'#c1d5b4');r(x+4,y+7,6,1,'#a7c2aa');r(x+4,y+10,12,1,'#9fbda7');r(x+17,y+17,2,1,'#c7ddad');r(x+9,y+20,5,4,'#a79b80');r(x+4,y+23,16,2,'#e0d0ad');}
export function lcars(p,x,y,w=44,h=19,variant=0){p.rect(x,y,w,h,'#25232b');const a=['#d9a47e','#b5a3c6','#d6bd88','#9e93be'];p.rect(x+2,y+2,5,h-5,a[variant%4]);p.rect(x+7,y+2,w-10,3,a[(variant+1)%4]);for(let row=0;row<3;row++){const yy=y+7+row*4;for(let col=0;col<4;col++){const ww=Math.max(2,Math.floor((w-15)/4));p.rect(x+10+col*(ww+1),yy,ww,2,a[(row+col+variant)%4]);}}p.rect(x+3,y+h-4,5,2,'#deae75');}
export function printer(p,x,y){const {rect:r,poly:q}=p;p.oval(x+2,y+5,17,5,'#5b473860');q([[x-14,y-13],[x+7,y-13],[x+16,y-6],[x-5,y-6]],'#e7dcc0');r(x-14,y-6,23,14,'#c1b69a');q([[x+9,y-6],[x+16,y-6],[x+16,y+4],[x+9,y+8]],'#938e7f');r(x-11,y-2,15,4,'#484c48');r(x-9,y+1,13,6,'#f3edda');r(x-7,y+2,8,1,'#bab9a8');r(x-8,y-19,17,9,'#f4ebd5');r(x-6,y-17,10,1,'#bcbab0');r(x-6,y-14,11,1,'#bcbab0');r(x+6,y-5,2,2,'#769065');r(x-11,y+6,3,2,'#8c8775');}
