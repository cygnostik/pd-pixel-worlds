/**
 * Pixel Worlds data-only .pwrealm.json, version 1. Exact field schema:
 * {
 *   format: 'pwrealm', version: 1, id: 'my-original-realm',
 *   title: 'My Realm', subtitle: 'Original pixel scenery', label: 'My Realm',
 *   author: 'Your name', license: 'MIT', provenance: 'Original artwork', // optional plain text
 *   width: 480, height: 300, characterStyle: 'office' | 'cafe' | 'bridge',
 *   anchors: [[x,y], ...], // exactly 12 distinct finite pairs in [0,480) × [0,300)
 *   background: 'data:image/png;base64,...', // complete 480×300 PNG
 *   layers: [{afterY:160,image:'data:image/png;base64,...'}] // optional, at most 4
 * }
 * Layers paint in ascending afterY order, BEFORE crew at y >= afterY; remaining
 * layers paint after crew, before badges. afterY:300 is an always-foreground layer.
 * Bridge style seats slots 0–4 just like the bundled bridge. No custom code,
 * routes, remote URLs, HTML, CSS, fonts, archive paths or plugins are accepted.
 * Text is plain display text (not markup). ID namespace is assigned by the library,
 * never by files. Starter examples live in realms/*.pwrealm.json.
 *
 * createRealmLibrary(storage, {decodeImage?}) uses plugin-scoped sync get/set.
 * getSnapshot() is a stable frozen IMPORTED-ONLY array; subscribe(fn) returns an
 * unsubscribe function. ready always resolves after bounded best-effort hydration.
 * importText(textOrObject) and remove(importId) are serialized promises: persistence
 * must succeed before a snapshot is published. Duplicate imports are rejected.
 * error exposes the latest failure (including skipped hydration entries).
 * Persisted value is a JSON string containing only validated raw packages, not
 * decoded descriptors. No registry or network access; optional decodeImage lets
 * pure Node tests inject a decoder. Its result must expose 480×300 dimensions.
 */
export const REALM_LIMITS=Object.freeze({maxFileBytes:1024*1024,maxImageBytes:512*1024,maxLayers:4,maxPackages:8,maxStorageBytes:4*1024*1024,maxPending:8});
export const REALM_STORAGE_KEY='realm-packages-v1';
const encoder=new TextEncoder();
const bytes=text=>encoder.encode(text).byteLength;
const fail=message=>{throw new TypeError(`Invalid realm package: ${message}`);};
const builtinIds=new Set(['office','cafe','bridge']);
const dangerousKeys=new Set(['__proto__','prototype','constructor']);
const isPlain=value=>value!==null&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);

// Inspect descriptors before cloning, so object callers cannot smuggle getters or
// toJSON functions. Depth/node budgets also bound hostile non-JSON object graphs.
function copyPlain(value,depth=0,budget={nodes:0}){
 if(++budget.nodes>512||depth>6)fail('structure limit exceeded');
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))fail('numbers must be finite');return value;}
 if(typeof value==='string'){if(value.length>REALM_LIMITS.maxFileBytes)fail('string limit exceeded');return value;}
 if(!Array.isArray(value)&&!isPlain(value))fail('only plain JSON values are accepted');
 const out=Array.isArray(value)?[]:{};
 if(Array.isArray(value)&&value.length>128)fail('array limit exceeded');
 for(const key of Reflect.ownKeys(value)){
  if(key==='length'&&Array.isArray(value))continue;
  if(typeof key!=='string'||dangerousKeys.has(key))fail('prototype keys are forbidden');
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)fail('plain data only; accessors are forbidden');
  if(Array.isArray(value)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=value.length))fail('invalid array property');
  out[key]=copyPlain(descriptor.value,depth+1,budget);
 }
 if(Array.isArray(value)&&Object.keys(out).length!==value.length)fail('sparse arrays are forbidden');
 return out;
}
function fields(value,required,optional=[]){
 if(!isPlain(value))fail('expected an object');
 for(const key of Object.keys(value))if(!required.includes(key)&&!optional.includes(key))fail(`unknown field: ${key}`);
 for(const key of required)if(!Object.hasOwn(value,key))fail(`missing field: ${key}`);
}
function text(value,max,name){
 if(typeof value!=='string'||!value.trim()||value.length>max||value!==value.trim()||! /^[\p{L}\p{N}\p{M} .,;:!?'"’“”()&+·–—/\-]+$/u.test(value)||/(?:[a-z][a-z0-9+.-]*:\/\/|javascript\s*:|data\s*:|vbscript\s*:|\b(?:eval|function)\s*\(|\burl\s*\()/i.test(value))fail(`${name} must be bounded plain text without code or URLs`);
}
function finite(value,min,max,name,inclusive=true){if(typeof value!=='number'||!Number.isFinite(value)||value<min||(inclusive?value>max:value>=max))fail(`invalid ${name}`);}
function crc32(data,start,end){let crc=0xffffffff;for(let i=start;i<end;i++){crc^=data[i];for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function png(value){
 const prefix='data:image/png;base64,';
 if(typeof value!=='string'||!value.startsWith(prefix))fail('images must be embedded PNG data URLs');
 const base64=value.slice(prefix.length);
 if(base64.length>Math.ceil(REALM_LIMITS.maxImageBytes/3)*4||base64.length%4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))fail('invalid or oversized PNG base64');
 let binary;try{binary=atob(base64);}catch{fail('invalid PNG base64');}
 if(btoa(binary)!==base64||binary.length>REALM_LIMITS.maxImageBytes)fail('noncanonical or oversized PNG');
 const data=Uint8Array.from(binary,c=>c.charCodeAt(0)),view=new DataView(data.buffer);
 if(data.length<57||![137,80,78,71,13,10,26,10].every((v,i)=>data[i]===v))fail('invalid PNG signature');
 let offset=8,header=false,pixels=false,ended=false,palette=false,idatEnded=false;
 const metadata=new Set();
 while(offset<data.length){
  if(offset+12>data.length)fail('truncated PNG chunk');
  const length=view.getUint32(offset),end=offset+12+length;
  if(end>data.length)fail('truncated PNG data');
  const type=String.fromCharCode(...data.subarray(offset+4,offset+8));
  if(crc32(data,offset+4,end-4)!==view.getUint32(end-4))fail('corrupt PNG chunk');
  if(!header&&type!=='IHDR')fail('PNG header must be first');
  if(pixels&&type!=='IDAT')idatEnded=true;
  switch(type){
   case 'IHDR':
    if(header||length!==13||view.getUint32(offset+8)!==480||view.getUint32(offset+12)!==300)fail('PNG must be 480×300');
    // Limit decode work to normal 8-bit RGB/RGBA, no interlace or animation.
    if(data[offset+16]!==8||![2,6].includes(data[offset+17])||data[offset+18]||data[offset+19]||data[offset+20])fail('PNG must be noninterlaced 8-bit RGB or RGBA');
    header=true;break;
   case 'IDAT':if(idatEnded)fail('PNG IDAT chunks must be contiguous');pixels=true;break;
   case 'IEND':if(length!==0||!pixels||end!==data.length)fail('invalid PNG end or trailing content');ended=true;break;
   case 'PLTE':if(palette||pixels||length<3||length>768||length%3)fail('invalid PNG palette');palette=true;break;
   case 'sRGB':case 'gAMA':case 'cHRM':case 'pHYs':
    if(metadata.has(type)||pixels||length!==({sRGB:1,gAMA:4,cHRM:32,pHYs:9})[type])fail('invalid PNG metadata');metadata.add(type);break;
   default:fail('PNG text, executable, animated or unknown chunks are forbidden');
  }
  offset=end;
 }
 if(!ended)fail('PNG is missing IEND');
 return value;
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export function validateRealmPackage(input){
 if(typeof input==='string'){
  if(input.length>REALM_LIMITS.maxFileBytes||bytes(input)>REALM_LIMITS.maxFileBytes)fail('file size limit exceeded');
  try{input=JSON.parse(input);}catch{fail('expected valid JSON');}
 }
 const p=copyPlain(input);
 fields(p,['format','version','id','title','subtitle','label','width','height','characterStyle','anchors','background'],['layers','author','license','provenance']);
 if(bytes(JSON.stringify(p))>REALM_LIMITS.maxFileBytes)fail('file size limit exceeded');
 if(p.format!=='pwrealm'||p.version!==1)fail('unsupported format or version');
 if(typeof p.id!=='string'||! /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(p.id)||p.id.length>64||builtinIds.has(p.id))fail('invalid or reserved id');
 text(p.title,80,'title');text(p.subtitle,160,'subtitle');text(p.label,32,'label');
 for(const [key,max] of [['author',80],['license',160],['provenance',240]])if(p[key]!==undefined)text(p[key],max,key);
 if(p.width!==480||p.height!==300)fail('canvas must be 480×300');
 if(!builtinIds.has(p.characterStyle))fail('unknown character style');
 if(!Array.isArray(p.anchors)||p.anchors.length!==12)fail('exactly 12 anchors are required');
 const anchors=new Set();for(const point of p.anchors){
  if(!Array.isArray(point)||point.length!==2)fail('anchor must be [x,y]');
  finite(point[0],0,480,'anchor x',false);finite(point[1],0,300,'anchor y',false);
  const key=point.join(',');if(anchors.has(key))fail('anchors must be distinct');anchors.add(key);
 }
 png(p.background);
 if(p.layers===undefined)p.layers=[];
 if(!Array.isArray(p.layers)||p.layers.length>REALM_LIMITS.maxLayers)fail('layer count limit exceeded');
 for(const layer of p.layers){fields(layer,['afterY','image']);finite(layer.afterY,0,300,'layer afterY');png(layer.image);}
 return freeze(p);
}
function browserDecodeImage(src){
 return new Promise((resolve,reject)=>{
  if(typeof Image==='undefined'){reject(new Error('PNG image decoding requires a browser or decodeImage option'));return;}
  const image=new Image();let timer;
  const finish=(error)=>{clearTimeout(timer);image.onload=image.onerror=null;if(error){image.src='';reject(error);}else resolve(image);};
  image.onload=()=>finish();image.onerror=()=>finish(new Error('PNG image could not be decoded'));
  timer=setTimeout(()=>finish(new Error('PNG image decode timed out')),10000);image.src=src;
 });
}
export function createRealmLibrary(storage,{decodeImage=browserDecodeImage}={}){
 if(!storage||typeof storage.get!=='function'||typeof storage.set!=='function')throw new TypeError('Realm library requires plugin-scoped synchronous storage');
 if(typeof decodeImage!=='function')throw new TypeError('decodeImage must be a function');
 let snapshot=Object.freeze([]),disposed=false,error=null,pending=0;
 const listeners=new Set();
 const active=()=>{if(disposed)throw new Error('Realm library is disposed');};
 const publish=next=>{snapshot=Object.freeze(next);for(const listener of listeners){try{listener();}catch{/* Observers cannot undo a persisted import. */}}};
 const remember=reason=>{error=reason instanceof Error?reason:new Error(String(reason));return error;};
 const checkBudget=packages=>{if(packages.length>REALM_LIMITS.maxPackages)throw new Error('Realm package count limit exceeded');const raw=JSON.stringify(packages);if(bytes(raw)>REALM_LIMITS.maxStorageBytes)throw new Error('Realm storage size limit exceeded');return raw;};
 async function descriptor(p){
  const decode=async src=>{active();const image=await decodeImage(src);active();if((image?.naturalWidth??image?.width)!==480||(image?.naturalHeight??image?.height)!==300)throw new Error('Decoded PNG must be 480×300');return image;};
  const background=await decode(p.background),layers=[];
  // Sequential decoding bounds temporary surfaces even for layered packages.
  for(const layer of p.layers)layers.push(Object.freeze({afterY:layer.afterY,image:await decode(layer.image)}));
  layers.sort((a,b)=>a.afterY-b.afterY);
  return Object.freeze({id:`import:${p.id}`,title:p.title,subtitle:p.subtitle,label:p.label,anchors:p.anchors,characterStyle:p.characterStyle,background,layers:Object.freeze(layers),packageData:p});
 }
 const ready=Promise.resolve().then(async()=>{
  try{
   active();const saved=storage.get(REALM_STORAGE_KEY);if(saved==null)return;
   if(typeof saved!=='string'||saved.length>REALM_LIMITS.maxStorageBytes||bytes(saved)>REALM_LIMITS.maxStorageBytes)throw new Error('Saved realm storage size or format limit exceeded');
   const raw=JSON.parse(saved);if(!Array.isArray(raw)||raw.length>REALM_LIMITS.maxPackages)throw new Error('Saved realm count limit exceeded');
   const next=[];
   for(const value of raw){try{active();const p=validateRealmPackage(value);if(next.some(r=>r.packageData.id===p.id))throw new Error('Duplicate saved realm');checkBudget([...next.map(r=>r.packageData),p]);next.push(await descriptor(p));}catch(reason){remember(reason);if(disposed)return;}}
   active();if(next.length)publish(next);
  }catch(reason){remember(reason);}
 });
 let queue=ready;
 function enqueue(work){
  if(disposed)return Promise.reject(new Error('Realm library is disposed'));
  if(pending>=REALM_LIMITS.maxPending)return Promise.reject(remember(new Error('Realm operation queue limit exceeded')));
  pending++;
  const operation=queue.then(async()=>{active();return work();}).catch(reason=>{throw remember(reason);}).finally(()=>pending--);
  queue=operation.catch(()=>{});return operation;
 }
 function persist(next){
  active();const serialized=checkBudget(next.map(r=>r.packageData));
  const result=storage.set(REALM_STORAGE_KEY,serialized);
  if(result===false)throw new Error('Realm persistence failed');
  if(result&&typeof result.then==='function'){result.catch?.(()=>{});throw new Error('Realm storage must be synchronous');}
  // Read back the exact key before making the imported scene visible.
  if(storage.get(REALM_STORAGE_KEY)!==serialized)throw new Error('Realm persistence verification failed');
  error=null;publish(next);
 }
 return {
  getSnapshot:()=>snapshot,
  subscribe(listener){if(disposed)return ()=>{};listeners.add(listener);return ()=>listeners.delete(listener);},
  ready,
  importText(input){
   // Validate and copy now: queued object callers cannot mutate pending packages.
   let p;try{active();if(pending>=REALM_LIMITS.maxPending)throw new Error('Realm operation queue limit exceeded');p=validateRealmPackage(input);}catch(reason){return Promise.reject(remember(reason));}
   return enqueue(async()=>{if(snapshot.some(r=>r.packageData.id===p.id))throw new Error('Realm is already imported; remove it first');checkBudget([...snapshot.map(r=>r.packageData),p]);const realm=await descriptor(p);persist([...snapshot,realm]);return realm;});
  },
  remove(id){return enqueue(()=>{const next=snapshot.filter(r=>r.id!==id);if(next.length===snapshot.length)return false;persist(next);return true;});},
  get error(){return error;},
  dispose(){disposed=true;listeners.clear();snapshot=Object.freeze([]);}
 };
}
