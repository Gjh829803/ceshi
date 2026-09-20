import {defineConfig} from 'vite';
import path from 'node:path';
import config from './vite.config';

// A separate entry, optimizer cache and port keep the existing playground session intact.
export default defineConfig({...config,
 cacheDir:path.resolve(import.meta.dirname,'../../.codex-tmp/asset-lifecycle-vite'),
 server:{...config.server,port:5307},
 build:{...config.build,outDir:'../../.codex-tmp/asset-lifecycle-dist',rollupOptions:{input:{assets:path.join(import.meta.dirname,'asset-lifecycle.html'),native:path.join(import.meta.dirname,'native-lifecycle.html')}}},
});
