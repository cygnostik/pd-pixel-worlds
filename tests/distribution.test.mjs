import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,lstat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installPlugin} from '../scripts/install.mjs';
import {connect} from 'node:net';
import {startPreview} from '../scripts/preview.mjs';

test('malformed preview URL returns 400 and the server keeps serving',async()=>{
 const server=await startPreview();try{
  const port=Number(new URL(server.url).port);
  const response=await new Promise((resolve,reject)=>{const socket=connect({host:'127.0.0.1',port},()=>socket.write('GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'));let data='';socket.setEncoding('utf8');socket.on('data',s=>data+=s);socket.on('end',()=>resolve(data));socket.on('error',reject);socket.setTimeout(2000,()=>socket.destroy(new Error('No response')));});
  assert.match(response,/^HTTP\/1\.1 400 /);assert.equal((await fetch(server.url)).status,200);
 }finally{await server.close();}
});

test('installer is repeatable, preserves previous files and removes by moving to backup',async()=>{
 const home=await mkdtemp(join(tmpdir(),'pixel-worlds-install-'));const source=join(home,'source.js');await writeFile(source,'export default {id:"pixel-worlds"};');
 const legacy=join(home,'desktop-plugins','pixel-agents');await mkdir(legacy,{recursive:true});await writeFile(join(legacy,'plugin.js'),'original');
 const first=await installPlugin({home,source});assert.equal(first.status,'installed');assert.equal(await readFile(first.target,'utf8'),await readFile(source,'utf8'));
 assert.equal((await installPlugin({home,source})).status,'unchanged');
 await writeFile(source,'export default {id:"pixel-worlds",name:"New"};');const update=await installPlugin({home,source});assert.equal(await readFile(join(update.backup,'plugin.js'),'utf8'),'export default {id:"pixel-worlds"};');
 const removed=await installPlugin({home,remove:true});assert.equal(removed.status,'removed');assert.ok((await lstat(removed.backup)).isDirectory());assert.equal((await installPlugin({home,remove:true})).status,'absent');assert.equal(await readFile(join(legacy,'plugin.js'),'utf8'),'original');
});
test('installer rejects a symlinked destination without writing through it',async()=>{
 const home=await mkdtemp(join(tmpdir(),'pixel-worlds-symlink-'));const external=join(home,'external');await mkdir(external);await symlink(external,join(home,'desktop-plugins'),'dir');await assert.rejects(installPlugin({home}),/real directory/);
});
test('preview serves only bundled fixture assets, never project files',async()=>{
 const server=await startPreview();try{const root=new URL('/',server.url);for(const path of ['package.json','src/runtime.js','..%2Fpackage.json','.env'])assert.equal((await fetch(new URL(path,root))).status,404);assert.equal((await fetch(server.url)).status,200);}finally{await server.close();}
});
