import {BRIDGE_ANCHORS} from './art/bridge-scene.js';
import {ENGINEERING_STATIONS,ENGINEERING_PORTAL} from './art/engineering-scene.js';

const leftExit=[[104,230],[104,155],[123,155]];
const bridgeStations=[
 {slot:0,route:[[240,217],[146,230],...leftExit],facing:'south'},
 // Seat anchors remain the imported-v1 anchors. Release sideways from the
 // bent-knee seated pose before walking; reverse that release only after arrival.
 // stand is NOT a walking waypoint from the seat (the own-chair/console overlap
 // at the seated anchor is intentional). The aisle stays behind each desk base.
 {slot:1,stand:[137,239],route:[[100,239],[100,230],...leftExit],facing:'south'},
 {slot:2,stand:[343,239],route:[[381,239],[381,294],[99,294],[99,230],...leftExit],facing:'south'},
 {slot:3,route:[[196,219],[146,230],...leftExit],facing:'south'},
 {slot:4,route:[[284,219],[146,230],...leftExit],facing:'south'},
 {slot:8,route:[[67,216],...leftExit],facing:'west'},
 {slot:9,route:[[413,220],[381,230],[381,294],[99,294],[99,230],...leftExit],facing:'east'},
].map(({slot,stand,route,facing},index)=>({id:`bridge-${index}`,x:BRIDGE_ANCHORS[slot][0],y:BRIDGE_ANCHORS[slot][1],facing,seated:slot<5,...(stand?{stand}:{}),exitPath:route}));
export const SHIP_ROOMS=Object.freeze({
 bridge:{id:'bridge',title:'Bridge',stations:bridgeStations,portal:{x:123,y:140,approach:[123,155],rect:[103,84,42,64]}},
 engineering:{id:'engineering',title:'Engineering',stations:ENGINEERING_STATIONS,portal:ENGINEERING_PORTAL},
});
