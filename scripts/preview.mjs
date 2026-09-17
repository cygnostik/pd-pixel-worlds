import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=new URL('../preview/',import.meta.url);
const allowed=new Map([['/preview/',['index.html','text/html']],['/preview/index.html',['index.html','text/html']],['/preview/app.bundle.js',['app.bundle.js','text/javascript']]]);
export async function startPreview(port=0){
 const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.writeHead(302,{Location:'/preview/'});res.end();return;}
  const file=allowed.get(path);
  if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404);res.end('Not found');return;}
  try{const data=await readFile(new URL(file[0],root));res.writeHead(200,{'Content-Type':file[1], 'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);}
  catch{res.writeHead(503);res.end('Preview not built. Run npm run build first.');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {url:`http://127.0.0.1:${server.address().port}/preview/`,close:()=>new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeAllConnections();})};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){const preview=await startPreview(Number(process.env.PORT||8769));console.log(`Pixel Worlds preview: ${preview.url}`);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await preview.close();process.exit(0);});}
