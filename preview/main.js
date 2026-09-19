import React from 'react';
import {createRoot} from 'react-dom/client';
import plugin from '../src/plugin.js';
import {host} from './sdk.js';
const root=createRoot(document.getElementById('root'));
let disposers=[];let contributions=[];
const storage={get(key){try{return JSON.parse(localStorage.getItem(`pixel-worlds-preview:${key}`));}catch{return null;}},set(key,v){localStorage.setItem(`pixel-worlds-preview:${key}`,JSON.stringify(v));}};
function navigate(path){const page=contributions.find(c=>c.area==='routes'&&c.data?.path===path);if(page){root.render(page.render());history.replaceState(null,'',`?route=${encodeURIComponent(path)}`);}}
function mount(path=new URLSearchParams(location.search).get('route')||'/pixel-worlds'){
 if(contributions.length)return;
 plugin.register({storage,os:{openExternal:async url=>{window.__previewExternal=url;}},onDispose:f=>disposers.push(f),register:c=>{contributions.push(c);return()=>{};}});
 navigate(contributions.some(c=>c.area==='routes'&&c.data?.path===path)?path:'/pixel-worlds');
}
function unmount(){root.render(null);disposers.forEach(f=>f());disposers=[];contributions=[];}
window.__pixelWorldsPreview={host,unmount,mount,navigate,getContributions:()=>contributions};
mount();
