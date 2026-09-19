import React from 'react';
// Browser-only stand-in. Installed builds import Hermes's real SDK Button.
export const Button=React.forwardRef(function PreviewButton({variant,size,asChild,children,style,...props},ref){return React.createElement('button',{...props,ref,style:{font:'inherit',color:'inherit',background:'transparent',border:'1px solid var(--ui-stroke-secondary)',borderRadius:6,padding:'6px 10px',cursor:props.disabled?'default':'pointer',opacity:props.disabled?0.45:1,...style}},children);});
export const ROUTES_AREA='routes',SIDEBAR_NAV_AREA='sidebar.nav',PALETTE_AREA='commandPalette',STATUSBAR_AREAS={right:'statusBar.right'};
export function atom(value){const listeners=new Set();return {get:()=>value,set:v=>{value=v;listeners.forEach(f=>f(v));},listen:f=>{listeners.add(f);return()=>listeners.delete(f);},subscribe:f=>{listeners.add(f);f(value);return()=>listeners.delete(f);}};}
const listeners=new Set();
export const host={
 state:{gateway:atom('connected'),profile:atom('default'),connectionId:atom('local'),activeSessionId:atom(null),focusedSessionId:atom(null),focusedStoredSessionId:atom(null),focusedSessionProfile:atom('default'),focusedSessionOwner:atom({connectionId:'local',profile:'default'}),busy:atom(false),busyBySession:atom({}),model:atom('fixture-model')},
 onEvent(type,fn){const record={type,fn};listeners.add(record);return()=>listeners.delete(record);},
 emit(event){for(const {type,fn} of listeners)if(type==='*'||type===event.type)fn(event);},
 profileRoutes:async()=>[{connectionId:'local',mode:'local',profile:'default',targetProfile:'default'}],
 async request(method){if(method==='profiles.list')return {profiles:[{name:'default',display_name:'Local agent',ui_meta:{'hermes-bots':{title:'Local agent'}}}]};if(method==='session.list')return {sessions:[]};return {};},
 requestProfile:async(route,method)=>host.request(method),
 navigate(path){window.__previewNavigation=path;window.__pixelWorldsPreview?.navigate(path);},
 async openSession(id,options){window.__previewSession={id,options};},
 notify(message){console.info('Preview notification',message);},
 listenerCount:()=>listeners.size
};
