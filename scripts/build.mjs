import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const common={absWorkingDir:root,bundle:true,format:'esm',target:'es2022',logLevel:'info',legalComments:'eof'};
await build({...common,entryPoints:['src/plugin.js'],outfile:'plugin.js',external:['react','react/jsx-runtime','@hermes/plugin-sdk']});
await build({...common,entryPoints:['preview/main.js'],outfile:'preview/app.bundle.js',alias:{'@hermes/plugin-sdk':fileURLToPath(new URL('../preview/sdk.js',import.meta.url))},define:{'process.env.NODE_ENV':'"production"'}});
