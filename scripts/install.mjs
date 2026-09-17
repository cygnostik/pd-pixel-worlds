import {copyFile,mkdir,lstat,readFile,rename} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

async function exists(path){try{return await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function safeDirectory(path){const stat=await exists(path);if(stat&&(stat.isSymbolicLink()||!stat.isDirectory()))throw new Error(`Expected a real directory: ${path}`);}
export async function installPlugin({home=process.env.HERMES_HOME||join(homedir(),'.hermes'),remove=false,source=new URL('../plugin.js',import.meta.url)}={}){
 home=resolve(home);const parent=join(home,'desktop-plugins'),target=join(parent,'pixel-worlds'),file=join(target,'plugin.js');
 await safeDirectory(home);await safeDirectory(parent);await safeDirectory(target);
 const old=await exists(target),oldFile=await exists(file);
 if(oldFile?.isSymbolicLink())throw new Error('Refusing to replace a symlinked plugin.js');
 let bytes=null;
 if(!remove){bytes=await readFile(source);if(!bytes.length)throw new Error('Empty build; run npm run build first.');if(oldFile&&bytes.equals(await readFile(file)))return {status:'unchanged',target:file};}
 if(remove&&!old)return {status:'absent',target};
 let backup=null;
 if(old){const backups=join(home,'plugin-backups');await safeDirectory(backups);await mkdir(backups,{recursive:true});backup=join(backups,`pixel-worlds-${Date.now()}-${process.pid}`);await rename(target,backup);}
 if(remove)return {status:'removed',target,backup};
 try{await mkdir(target,{recursive:true});await copyFile(source,file);if(!(await readFile(file)).equals(bytes))throw new Error('Installed bytes differ from the local build');}
 catch(e){if(backup){const failed=join(home,'plugin-backups',`pixel-worlds-failed-${Date.now()}-${process.pid}`);if(await exists(target))await rename(target,failed);await rename(backup,target);}throw e;}
 return {status:'installed',target:file,backup};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{const args=process.argv.slice(2);let home,remove=false;for(let i=0;i<args.length;i++){if(args[i]==='--hermes-home'&&args[i+1]&&!args[i+1].startsWith('--'))home=args[++i];else if(args[i]==='--remove')remove=true;else if(args[i]==='--help'){console.log('node scripts/install.mjs [--hermes-home PATH] [--remove]\nExisting installs are moved to HERMES_HOME/plugin-backups. No Hermes restart.');process.exit(0);}else throw new Error(`Unknown or incomplete argument: ${args[i]}`);}console.log(JSON.stringify(await installPlugin({home,remove}),null,2));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
