import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {mkdir,copyFile} from 'node:fs/promises';
const root=fileURLToPath(new URL('../',import.meta.url));
const common={absWorkingDir:root,bundle:true,format:'esm',target:'es2022',logLevel:'info',legalComments:'eof'};
await build({...common,entryPoints:['src/plugin.js'],outfile:'plugin.js',external:['react','react/jsx-runtime','@hermes/plugin-sdk']});
// Native unified packages and standalone downloads use identical desktop code.
await mkdir(new URL('../desktop/',import.meta.url),{recursive:true});
await copyFile(new URL('../plugin.js',import.meta.url),new URL('../desktop/plugin.js',import.meta.url));
await build({...common,entryPoints:['preview/main.js'],outfile:'preview/app.bundle.js',alias:{'@hermes/plugin-sdk':fileURLToPath(new URL('../preview/sdk.js',import.meta.url))},define:{'process.env.NODE_ENV':'"production"'}});
