import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { validateRealmPackage, createRealmLibrary, REALM_LIMITS, REALM_STORAGE_KEY } from '../src/realm-packages.js';

function crc(bytes) { let n=0xffffffff; for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0; }
function chunk(type,data){const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(type,4);data.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,-4)),out.length-4);return out;}
function png(width=480,height=300){const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=6;return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.alloc((width*4+1)*height))),chunk('IEND',Buffer.alloc(0))]).toString('base64');}
function fixture(id='sample-realm'){return {format:'pwrealm',version:1,id,title:'Sample Realm',subtitle:'Original pixel scenery',label:'Sample',width:480,height:300,characterStyle:'office',anchors:Array.from({length:12},(_,i)=>[40+i*30,150]),background:png(),layers:[]};}
function storage(){const data=new Map();return {get:k=>data.get(k),set:(k,v)=>data.set(k,v),remove:k=>data.delete(k),data};}
const decodeImage=async src=>({src,naturalWidth:480,naturalHeight:300});

test('validates, copies and freezes the exact data-only format without Image',()=>{
 const raw=fixture(),out=validateRealmPackage(JSON.stringify(raw));assert.deepEqual(out,raw);assert.ok(Object.isFrozen(out.anchors[0]));assert.notEqual(validateRealmPackage(raw),raw);
});
test('rejects unknown fields, executable content, prototype keys and unsafe text',()=>{
 const credited=validateRealmPackage({...fixture(),author:'Artist',license:'MIT',provenance:'Original artwork'});assert.equal(credited.author,'Artist');
 for(const [field,value] of [['author','<img>'],['license','javascript:alert(1)'],['provenance','https://example.org'],['author','a'.repeat(81)]])assert.throws(()=>validateRealmPackage({...fixture(),[field]:value}));
 for(const edit of [p=>p.script='alert(1)',p=>p.title='<script>alert(1)</script>',p=>p.title='javascript:alert(1)',p=>p.subtitle='https://example.org',p=>p.background='https://example.org/a.png',p=>p.background='data:image/svg+xml;base64,PHN2Zz4=',p=>p.layers=[{afterY:160,image:png(),html:'x'}],p=>p.id='office',p=>p.id='import:foo',p=>p.anchors[0]=[NaN,1],p=>p.anchors[1]=p.anchors[0],p=>p.anchors[0]=[480,150],p=>p.anchors.pop(),p=>p.width=960,p=>p.characterStyle='custom',p=>p.label='x'.repeat(33)]){const p=fixture();edit(p);assert.throws(()=>validateRealmPackage(p));}
 assert.throws(()=>validateRealmPackage(JSON.stringify(fixture()).replace('"format":','"__proto__":{},"format":')));
 assert.throws(()=>validateRealmPackage({...fixture(),constructor:{}}));
 const accessor=fixture();Object.defineProperty(accessor,'title',{get(){throw Error('getter ran');},enumerable:true});assert.throws(()=>validateRealmPackage(accessor),/plain|accessor/i);
 const cyclic=fixture();cyclic.layers=[cyclic];assert.throws(()=>validateRealmPackage(cyclic));
});
test('rejects malformed PNGs, dimensions, trailing data, excessive layers and size',()=>{
 for(const background of [png(1,1),'data:image/png;base64,AAAA',fixture().background+'AAAA',fixture().background.replace(/.$/,'!')])assert.throws(()=>validateRealmPackage({...fixture(),background}));
 const corrupt=Buffer.from(png().split(',')[1],'base64');corrupt[45]^=1;assert.throws(()=>validateRealmPackage({...fixture(),background:'data:image/png;base64,'+corrupt.toString('base64')}));
 assert.throws(()=>validateRealmPackage({...fixture(),layers:Array.from({length:5},()=>({afterY:160,image:png()}))}));
 assert.throws(()=>validateRealmPackage({...fixture(),layers:[{afterY:301,image:png()}]}));
 assert.throws(()=>validateRealmPackage(' '.repeat(REALM_LIMITS.maxFileBytes+1)));
});
test('stable imported-only snapshots, persistence, hydration and removal',async()=>{
 const s=storage(),lib=createRealmLibrary(s,{decodeImage});const empty=lib.getSnapshot();assert.deepEqual(empty,[]);assert.equal(lib.getSnapshot(),empty);await lib.ready;
 let events=0;const unsub=lib.subscribe(()=>events++);const realm=await lib.importText(JSON.stringify(fixture()));assert.equal(realm.id,'import:sample-realm');assert.equal(realm.background.naturalWidth,480);assert.equal(events,1);assert.equal(lib.getSnapshot()[0],realm);
 assert.equal(typeof s.get(REALM_STORAGE_KEY),'string');assert.deepEqual(JSON.parse(s.get(REALM_STORAGE_KEY)),[fixture()]);assert.throws(()=>lib.getSnapshot().push(realm));
 const restored=createRealmLibrary(s,{decodeImage});assert.deepEqual(restored.getSnapshot(),[]);await restored.ready;assert.equal(restored.getSnapshot()[0].id,realm.id);
 await assert.rejects(lib.importText(fixture()),/already imported/i);assert.equal(events,1);
 await lib.remove(realm.id);assert.deepEqual(lib.getSnapshot(),[]);assert.deepEqual(JSON.parse(s.get(REALM_STORAGE_KEY)),[]);assert.equal(events,2);unsub();restored.dispose();lib.dispose();
});
test('decode and persistence failures never commit or notify success',async()=>{
 const s=storage(),lib=createRealmLibrary(s,{decodeImage:async()=>{throw Error('bad decode');}});await assert.rejects(lib.importText(fixture()),/bad decode/);assert.deepEqual(lib.getSnapshot(),[]);assert.ok(lib.error);lib.dispose();
 const broken=storage(),l=createRealmLibrary(broken,{decodeImage});await l.ready;let notices=0;l.subscribe(()=>notices++);broken.set=()=>{throw Error('quota exceeded');};await assert.rejects(l.importText(fixture()),/quota/);assert.equal(notices,0);assert.deepEqual(l.getSnapshot(),[]);
 const working=storage(),r=createRealmLibrary(working,{decodeImage});const realm=await r.importText(fixture());working.set=()=>{throw Error('quota');};await assert.rejects(r.remove(realm.id),/quota/);assert.equal(r.getSnapshot()[0],realm);l.dispose();r.dispose();
});
test('hydration skips invalid records, reports errors and bounds saved input',async()=>{
 const s=storage();s.set(REALM_STORAGE_KEY,JSON.stringify([fixture(),{...fixture('other'),script:'bad'}]));const l=createRealmLibrary(s,{decodeImage});await l.ready;assert.equal(l.getSnapshot().length,1);assert.ok(l.error);l.dispose();
 s.set(REALM_STORAGE_KEY,'x'.repeat(REALM_LIMITS.maxStorageBytes+1));const r=createRealmLibrary(s,{decodeImage});await r.ready;assert.deepEqual(r.getSnapshot(),[]);assert.ok(r.error);r.dispose();
});
test('enforces per-image and aggregate persistence byte budgets before decoding',async()=>{
 const header=Buffer.alloc(13);header.writeUInt32BE(480);header.writeUInt32BE(300,4);header[8]=8;header[9]=2;
 const pixels=Buffer.alloc((480*3+1)*300);let seed=1977;
 for(let y=0;y<300;y++)for(let x=1;x<=480*3;x++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;pixels[y*(480*3+1)+x]=seed&255;}
 const big='data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
 const p={...fixture(),background:big};assert.doesNotThrow(()=>validateRealmPackage(p));
 let decoded=0;const lib=createRealmLibrary(storage(),{decodeImage:async src=>{decoded++;return decodeImage(src);}});
 for(let i=0;i<7;i++)await lib.importText({...p,id:`large-${i}`});
 await assert.rejects(lib.importText({...p,id:'large-eight'}),/storage size limit/);assert.equal(decoded,7);assert.equal(lib.getSnapshot().length,7);lib.dispose();
 assert.throws(()=>validateRealmPackage({...fixture(),background:'data:image/png;base64,'+Buffer.alloc(REALM_LIMITS.maxImageBytes+1).toString('base64')}),/oversized/);
});

test('serialized imports enforce count and disposal blocks in-flight persistence',async()=>{
 const s=storage(),l=createRealmLibrary(s,{decodeImage});await Promise.all(Array.from({length:8},(_,i)=>l.importText(fixture(`realm-${i}`))));await assert.rejects(l.importText(fixture('ninth')),/limit/i);assert.equal(l.getSnapshot().length,8);l.dispose();await assert.rejects(l.importText(fixture()),/disposed/i);
 let release;const pending=createRealmLibrary(storage(),{decodeImage:()=>new Promise(resolve=>release=resolve)});const op=pending.importText(fixture());await new Promise(resolve=>setImmediate(resolve));pending.dispose();release(await decodeImage(''));await assert.rejects(op,/disposed/i);assert.deepEqual(pending.getSnapshot(),[]);
});
