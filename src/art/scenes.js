import { painter, rng, plant, cup, books, monitor, keyboard, printer } from './pixels.js';
import {BRIDGE_ANCHORS,drawBridge} from './bridge-scene.js';

export const ANCHORS={
 office:[[53,151],[145,151],[237,151],[53,220],[145,220],[237,220],[46,275],[108,275],[170,275],[232,275],[294,275],[293,202]],
 cafe:[[61,159],[160,156],[270,154],[379,156],[80,218],[180,215],[278,215],[391,216],[55,274],[155,270],[264,272],[379,273]],
 bridge:BRIDGE_ANCHORS,
};
export const YARD=[[358,191],[426,191],[358,232],[426,232]];
function office(p){
 const {rect:r,poly:q,line:l,oval:o,text:t}=p,random=rng(71);
 r(0,0,480,300,'#423e36');r(9,13,464,281,'#8d775c');r(9,13,317,269,'#aaa18a');r(11,17,312,79,'#d9ceb3');r(12,20,310,4,'#efe3c6');r(12,24,310,3,'#c6b99d');r(12,84,313,10,'#b9ab8c');r(12,87,313,2,'#eadbbe');r(12,93,313,191,'#b6ad92');
 // Carpet fibers stay in low contrast; the small slubs read as fabric, not noise.
 for(let i=0;i<1700;i++){const x=14+random()*306,y=96+random()*185;r(x,y,1+(i%3===0),1,i%2?'#c0b69a':'#aaa18a');}
 for(let x=18;x<300;x+=57){r(x,28,45,43,'#a19880');r(x+2,29,41,39,'#c3c9b9');for(let y=32;y<66;y+=4){r(x+2,y,41,1,'#879486');r(x+2,y+1,41,1,'#e0ddc7');}r(x+21,29,2,38,'#b5aa8c');r(x-2,69,49,4,'#ecdfc1');l(x+41,33,x+41,60,'#f0e4bd');}
 // Fluorescent housings, noticeboard, clock, water cooler, filing cabinet.
 r(48,17,59,5,'#b6ab90');r(50,18,55,2,'#fff0ce');r(188,17,58,5,'#b6ab90');r(190,18,54,2,'#fff0ce');
 r(257,29,39,32,'#826b4d');r(259,31,35,28,'#b09261');[[262,35,11,14],[279,34,10,10],[276,47,12,10]].forEach(([x,y,w,h],i)=>{r(x,y,w,h,i%2?'#e6ce8b':'#eee3c9');r(x+2,y+4,w-4,1,'#a39a83');r(x+2,y+7,w-5,1,'#aaa088');r(x+4,y,2,2,'#9a4f3b');});
 o(311,44,9,9,'#796f5d');o(311,43,7,7,'#efe8d1');l(311,43,311,38,'#514c43');l(311,43,315,45,'#514c43');
 r(291,70,19,21,'#99977e');r(293,72,15,7,'#c1b697');r(293,82,15,7,'#c1b697');r(298,74,5,2,'#6f725f');r(298,84,5,2,'#6f725f');
 r(19,72,12,18,'#e2d6bb');r(21,61,9,13,'#91afa8');r(22,63,6,9,'#bed0be');r(22,78,2,3,'#677c81');r(27,78,2,3,'#a8604c');
 // Three-quarter workstations, each with cubicle back and modest side wing.
 for(let row=0;row<2;row++)for(let col=0;col<3;col++){
   const x=31+col*92,y=111+row*69;
   q([[x-11,y+8],[x+64,y+8],[x+73,y+19],[x+73,y+40],[x+9,y+40]],'#7c766445');
   r(x-13,y-26,79,4,'#d6cfb9');r(x-13,y-22,79,22,'#96998a');r(x-12,y-20,76,17,'#afb09c');
   for(let xx=x-8;xx<x+62;xx+=5)r(xx,y-18,1,14,'#a4a793');
   r(x-13,y-23,3,51,'#c9c5ae');r(x-10,y-2,65,5,'#efe2be');r(x-10,y+3,65,10,'#bdab83');r(x-8,y+13,4,18,'#8d856e');r(x+47,y+13,5,18,'#8d856e');r(x+37,y+11,14,17,'#c6b895');r(x+39,y+14,9,2,'#8a826b');r(x+39,y+22,9,2,'#8a826b');
   monitor(p,x+4,y-21);keyboard(p,x+7,y+5);cup(p,x+37,y-2);
   r(x+47,y-4,12,2,'#f2e6c8');r(x+49,y-6,12,2,'#fff0d0');r(x+52,y-9,6,3,col===1?'#ad4f3d':'#bbae8d');
   r(x+29,y-16,7,7,'#ead087');r(x+31,y-14,3,1,'#b19461');
 }
 // Service doorway connects the ordinary office to the sunburnt printer yard.
 r(326,14,145,78,'#b7a081');r(328,16,142,64,'#d0b58b');for(let y=24;y<78;y+=8){r(328,y,142,1,'#ae9572');for(let x=328+(y%16?12:0);x<470;x+=28)r(x,y-7,1,7,'#bfa27c');}
 r(329,81,142,206,'#b28b60');for(let i=0;i<1700;i++){const x=331+random()*137,y=88+random()*195;r(x,y,1+(i%4===0),1,['#aa8055','#b99568','#c09a6b','#a47d53'][i%4]);}
 q([[337,82],[379,82],[423,184],[380,184]],'#d7b87940');
 r(318,25,9,103,'#706c58');r(321,29,3,96,'#ede0b9');r(315,87,14,37,'#f0e0bb');r(316,91,11,30,'#c3b99b');r(326,14,5,70,'#e0c697');r(326,133,5,152,'#d1bf96');r(326,128,6,5,'#a19173');
 for(let x=337;x<470;x+=11){r(x,54,9,34,'#ad8e62');r(x+1,53,7,2,'#cdb181');r(x+1,59,1,26,'#d5b989');r(x+7,58,1,26,'#93734e');}r(335,66,137,3,'#91734f');r(335,80,137,3,'#97774f');
 for(let i=0;i<34;i++){const x=337+random()*126,y=91+random()*184;if(x>345&&x<444&&y>126&&y<242)continue;l(x,y,x-2,y-6,'#768053');l(x+1,y,x+3,y-4,'#8b8b52');l(x,y,x,y-8,'#64734b');}
 o(391,194,35,12,'#ac8254');printer(p,391,192);
 r(444,108,17,21,'#789080');r(442,106,21,3,'#6b7a64');r(447,111,2,16,'#99a18c');r(454,111,1,15,'#536e5c');
 // Lower room edge and foreground greenery give the diorama a tangible thickness.
 r(9,282,317,6,'#e1d2af');r(9,288,317,7,'#7f755e');r(9,295,317,3,'#504d42');r(329,287,143,8,'#846545');r(329,295,143,3,'#5f513b');
 plant(p,305,263,1.05);plant(p,17,263,.9);books(p,270,91,3);
 t('TPS',277,37,'#665c48',5);
}
function cafe(p){
 const {rect:r,poly:q,line:l,oval:o,text:t}=p,random=rng(39);
 r(0,0,480,300,'#504b3b');r(8,13,464,278,'#86633f');r(10,15,460,87,'#ebd9ad');r(10,18,460,3,'#fff0c9');r(10,93,460,191,'#c59a64');
 // Individual warm oak boards with end joints and selective grain.
 for(let y=97,row=0;y<284;y+=12,row++){r(10,y,460,1,'#a97d4f');r(10,y+1,460,1,'#deb77c');for(let x=10-(row%2)*33;x<469;x+=67){r(x,y,1,12,'#9e744a');r(x+7,y+5,39,1,row%2?'#c0925f':'#bd8e59');r(x+33,y+8,19,1,'#d0a36a');}}
 // Tall sunlit windows: outdoor foliage is composed in broad quiet clusters.
 for(let i=0;i<3;i++){const x=27+i*66;r(x-3,28,57,58,'#9b7650');r(x,30,51,52,'#b8d2bd');r(x+2,32,47,17,'#dce7c4');o(x+8,65,18,18,'#91b08a');o(x+39,66,19,24,'#9bb991');o(x+24,79,21,14,'#688d71');r(x+2,57,47,2,'#e6d6ad');r(x+24,30,3,52,'#f7e4b7');r(x,81,51,3,'#795b3a');r(x-5,84,61,5,'#f4dfb1');r(x-5,89,61,3,'#b28958');}
 q([[30,93],[73,93],[165,245],[109,245]],'#f5da9780');q([[98,93],[137,93],[224,245],[174,245]],'#ffe9af65');q([[164,93],[205,93],[284,232],[234,232]],'#ffecb850');
 // Wainscot paneling and house signage.
 r(222,26,123,41,'#6a7355');r(225,29,117,35,'#4d624d');r(229,33,109,1,'#a3b487');t('THE LITTLE',254,34,'#ecdfb0',7);t('PAW & POUR',243,44,'#fff0c6',10);r(10,91,460,4,'#866542');
 // Coffee shelving, jars, espresso machine, cups, beans.
 r(361,29,94,3,'#9e734c');r(361,58,94,4,'#936743');for(let i=0;i<6;i++){r(366+i*14,38,9,18,'#ccb994');r(367+i*14,41,7,12,['#977652','#af8e68','#738365'][i%3]);r(365+i*14,36,11,3,'#79674b');r(368+i*14,46,5,4,'#e1d2aa');}
 r(245,77,214,7,'#f5deac');r(248,84,208,33,'#aa7349');r(254,88,48,25,'#bc8756');r(307,88,53,25,'#bc8756');r(366,88,83,25,'#9c6944');for(let xx=370;xx<447;xx+=8)r(xx,90,1,23,'#c49462');r(249,114,205,4,'#704e36');
 r(368,64,49,14,'#6f7970');r(370,52,45,13,'#adb3a0');r(372,54,40,4,'#e5d7ba');r(373,64,4,10,'#414c45');r(391,64,4,10,'#414c45');r(369,77,50,2,'#e2ceb0');cup(p,377,69);cup(p,399,69);r(422,59,13,19,'#b29c77');o(428,58,6,4,'#6e5440');
 // Glass pastry case: crisp reflections, two trays, original pastries.
 r(252,55,99,23,'#87a99b');r(254,57,94,18,'#c9d2b0');r(254,72,94,2,'#846346');r(256,66,90,2,'#f0d4a0');for(let i=0;i<6;i++){const x=261+i*15;o(x,62,5,3,i%2?'#cc9860':'#d8aa67');r(x-2,60,4,1,'#f1d39a');r(x-4,71,9,2,'#f0c583');r(x-2,69,5,2,i%3?'#8f5140':'#d9968b');}l(259,57,266,64,'#eef1d9');l(325,57,335,68,'#eef1d9');r(299,56,2,20,'#efdfbd');r(251,77,102,3,'#6b694f');
 // Pillows, rugs and furniture; floor-level work pads keep kitten anatomy honest.
 function rug(x,y,w,h){r(x,y,w,h,'#ad7760');r(x+3,y+2,w-6,h-4,'#d4b27f');r(x+6,y+4,w-12,h-8,'#ab8668');for(let xx=x+10;xx<x+w-10;xx+=10)r(xx,y+6,3,h-12,'#b7936e');for(let xx=x+3;xx<x+w-2;xx+=4){r(xx,y-2,1,2,'#edc894');r(xx,y+h,1,2,'#edc894');}}
 rug(31,126,162,37);rug(236,126,173,35);rug(33,181,170,41);rug(239,184,174,38);rug(33,242,160,37);rug(236,242,174,37);
 // Moss velvet window bench and climbing furniture, not geometric dashboards.
 for(const x of [26,126]){r(x,117,70,14,'#5c7054');r(x-2,106,74,13,'#91a27a');r(x,107,70,3,'#adb590');r(x-4,110,7,22,'#768760');r(x+66,110,7,22,'#768760');r(x+7,131,3,6,'#765c3d');r(x+57,131,3,6,'#765c3d');r(x+19,111,17,11,'#dfb18a');r(x+21,112,13,1,'#f1cba0');}
 for(const [x,y] of [[61,178],[162,175],[268,175],[380,175],[77,235],[178,236],[276,237],[387,237]]){
  o(x+3,y+7,25,6,'#815c3b35');r(x-18,y-1,4,13,'#8d6841');r(x+15,y-1,4,13,'#8d6841');o(x,y-5,25,10,'#956741');o(x,y-7,25,9,'#e3bd83');o(x,y-8,22,7,'#edcf9c');cup(p,x+11,y-12);keyboard(p,x-16,y-9,18);
 }
 r(423,139,5,105,'#b28b59');r(452,139,5,105,'#b28b59');for(let y=141;y<237;y+=31){r(418,y,45,6,'#d6b17a');r(420,y,41,2,'#efcea0');r(426,y+8,2,13,'#937347');}
 r(421,239,41,7,'#9c744c');r(425,249,28,14,'#b99465');r(429,251,15,10,'#634d37');r(427,264,27,3,'#765538');
 // Linen curtain, trailing vines, coffee plant and pots.
 for(let x=13;x<24;x+=3){r(x,25,3,65,x%2?'#d8c6a1':'#f2e1b9');}for(let x=209;x<221;x+=3)r(x,25,3,65,x%2?'#d8c6a1':'#f2e1b9');
 plant(p,233,107,1.1);plant(p,458,140,.95);plant(p,22,224,.9);plant(p,458,281,1.4);plant(p,20,282,1.2);plant(p,342,77,.6);
 for(let i=0;i<8;i++){const x=230+i*8,y=20+Math.sin(i*.6)*5;l(x,15,x,y+10,'#65784f');o(x,y+10,4,2,i%2?'#6e8456':'#859365');}
 // Pendant shades hang over the counter, warm not glowing neon.
 for(const x of [275,392]){r(x,13,1,12,'#7d6b4b');q([[x-10,25],[x+10,25],[x+16,34],[x-16,34]],'#a98753');r(x-14,34,28,2,'#f6deb0');}
 books(p,293,118,5);r(9,284,462,5,'#e7c18a');r(9,289,462,7,'#84603f');r(13,296,454,3,'#624b34');
}
export function drawBackground(ctx,theme){const p=painter(ctx);if(theme==='cafe')cafe(p);else if(theme==='bridge')drawBridge(p);else office(p);}
