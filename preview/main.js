import React from 'react';
import {createRoot} from 'react-dom/client';
import plugin from '../src/plugin.js';
import {host} from './sdk.js';
const root=createRoot(document.getElementById('root'));
let disposers=[];let contributions=[];
const storage={get(key){try{return JSON.parse(localStorage.getItem(`pixel-worlds-preview:${key}`));}catch{return null;}},set(key,v){localStorage.setItem(`pixel-worlds-preview:${key}`,JSON.stringify(v));}};
function mount(){plugin.register({storage,onDispose:f=>disposers.push(f),register:c=>{contributions.push(c);return()=>{};}});const page=contributions.find(c=>c.area==='routes');root.render(page.render());}
function unmount(){root.render(null);disposers.forEach(f=>f());disposers=[];contributions=[];}
window.__pixelWorldsPreview={host,unmount,mount,getContributions:()=>contributions};
mount();
