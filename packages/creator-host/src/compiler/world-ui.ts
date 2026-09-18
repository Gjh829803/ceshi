import {build,type Plugin} from 'esbuild';
import {readFile,writeFile,mkdir,realpath,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {compile} from 'json-schema-to-typescript';
import {compileStateSchema,validateCatalog,validateDocument,type UiCatalog,type UiDocument,type UiBundleManifest} from '@worldkit/world-ui/schema';

export interface WorldUiProject {catalog:string;definition:string;stateSchema:string;components:string}
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const allowed=['react','react/jsx-runtime','motion/react','@worldkit/world-ui/react'];
const within=(root:string,file:string)=>{const rel=path.relative(root,file);return !rel.startsWith('..')&&!path.isAbsolute(rel);};
export async function worldUiCompilerIdentity():Promise<string>{
  const require=createRequire(import.meta.url),root=path.resolve(path.dirname(require.resolve('@worldkit/world-ui/schema')),'..');
  const files:Record<string,string>={compiler:hash(await readFile(new URL('./world-ui.ts',import.meta.url))),localPreview:hash(await readFile(new URL('../browser/world-ui-preview.ts',import.meta.url)))};
  const visit=async(dir:string)=>{for(const item of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(['node_modules','tests'].includes(item.name))continue;const file=path.join(dir,item.name);if(item.isDirectory())await visit(file);else files[path.relative(root,file)]=hash(await readFile(file));}};
  await visit(root);return hash(JSON.stringify(files));
}
export async function compileWorldUi(sourceRoot:string,outputRoot:string,settings:WorldUiProject):Promise<{hash:string;manifest:UiBundleManifest}> {
  const root=await realpath(sourceRoot);
  const source=async(relative:string)=>{const target=path.resolve(root,relative);if(!within(root,target)||!within(root,await realpath(target)))throw new Error('UI_SOURCE_PATH_ESCAPE');return target;};
  const catalog=JSON.parse(await readFile(await source(settings.catalog),'utf8')) as UiCatalog;
  const document=JSON.parse(await readFile(await source(settings.definition),'utf8')) as UiDocument;
  const stateSchema=JSON.parse(await readFile(await source(settings.stateSchema),'utf8'));
  validateCatalog(catalog);validateDocument(document,catalog);compileStateSchema(stateSchema);
  await mkdir(outputRoot,{recursive:true});
  const properties:Record<string,unknown>={};
  for(const [name,component]of Object.entries(catalog.components))properties[name]=component.propsSchema;
  const generated=await compile({type:'object',properties,required:Object.keys(properties),additionalProperties:false} as Parameters<typeof compile>[0],'CatalogProps',{bannerComment:'// Generated from catalog.json. Do not edit.',additionalProperties:false,$refOptions:{resolve:{http:false,file:false}}});
  const types=`${generated}\nimport type {ComponentType} from 'react';\nimport type {WorldUiComponentContext} from '@worldkit/world-ui/react';\nexport type CatalogComponents = {${Object.entries(catalog.components).map(([name,c])=>`${JSON.stringify(name)}:ComponentType<WorldUiComponentContext<CatalogProps[${JSON.stringify(name)}],${c.events.length?c.events.map(e=>JSON.stringify(e)).join('|'):'never'}>>`).join(';')}};\n`;
  const entry=await source(settings.components);
  // Generate only in the copied candidate; never write author-owned project files.
  await writeFile(path.join(path.dirname(entry),'catalog.generated.ts'),types);
  const boundary:Plugin={name:'world-ui-boundary',setup(plugin){
    plugin.onResolve({filter:/.*/},args=>{
      if(args.kind==='entry-point')return;
      if(allowed.includes(args.path))return {path:args.path,external:true};
      if(!args.path.startsWith('.')||!within(root,path.resolve(args.resolveDir,args.path)))throw new Error(`UI_IMPORT_NOT_ALLOWED: ${args.path}`);
      return;
    });
    plugin.onLoad({filter:/.*/},async args=>{if(!within(root,await realpath(args.path)))throw new Error('UI_IMPORT_PATH_ESCAPE');return undefined;});
  }};
  const result=await build({absWorkingDir:root,entryPoints:[entry],outdir:outputRoot,entryNames:'components',assetNames:'assets/[name]-[hash]',bundle:true,write:false,format:'cjs',platform:'browser',target:'es2022',jsx:'automatic',plugins:[boundary],logLevel:'silent',loader:{'.png':'file','.jpg':'file','.svg':'file','.woff2':'file','.woff':'file'},metafile:true});
  const js=result.outputFiles.find(f=>f.path.endsWith('components.js'));if(!js)throw new Error('UI_BUILD_NO_MODULE');
  let moduleBody=js.text;
  // JS file-loader paths execute from a Blob module in the player. Resolve them
  // against the immutable bundle URL, rather than the embedding page's URL.
  for(const file of result.outputFiles){
    const relative=path.relative(outputRoot,file.path).split(path.sep).join('/');
    if(file!==js&&!relative.endsWith('.css'))moduleBody=moduleBody.split(JSON.stringify(`./${relative}`)).join(`new URL(${JSON.stringify(relative)},runtime.assetBaseUrl).href`);
  }
  const moduleCode=`export function createWorldUiModule(runtime){\nconst module={exports:{}};const exports=module.exports;\nconst modules={'react':runtime.react,'react/jsx-runtime':runtime.jsxRuntime,'motion/react':runtime.motion,'@worldkit/world-ui/react':runtime.worldUi};\nconst require=(name)=>{if(!Object.hasOwn(modules,name))throw new Error('UI_RUNTIME_IMPORT:'+name);return modules[name];};\n((module,exports,require)=>{\n${moduleBody}\n})(module,exports,require);\nconst components=module.exports.components;if(!components||typeof components!=='object')throw new Error('UI_COMPONENTS_EXPORT_REQUIRED');return {components};\n}\n`;
  await writeFile(path.join(outputRoot,'components.mjs'),moduleCode);
  const styles:{path:string;sha256:string}[]=[],assets:{path:string;sha256:string}[]=[];
  for(const file of result.outputFiles){if(file===js)continue;const relative=path.relative(outputRoot,file.path).split(path.sep).join('/');if(relative.endsWith('.map'))continue;
    await mkdir(path.dirname(file.path),{recursive:true});await writeFile(file.path,file.contents);(relative.endsWith('.css')?styles:assets).push({path:relative,sha256:hash(file.contents)});
  }
  for(const [name,value]of Object.entries({'catalog.json':catalog,'definition.json':document,'state.schema.json':stateSchema}))await writeFile(path.join(outputRoot,name),JSON.stringify(value));
  const manifest:UiBundleManifest={kind:'worldkit-ui-bundle',schemaVersion:1,runtimeAbiVersion:'world-ui-web/1',catalog:{path:'catalog.json',sha256:hash(JSON.stringify(catalog))},definition:{path:'definition.json',sha256:hash(JSON.stringify(document))},stateSchema:{path:'state.schema.json',sha256:hash(JSON.stringify(stateSchema))},module:{path:'components.mjs',sha256:hash(moduleCode)},styles,assets};
  const bytes=JSON.stringify(manifest,null,2);await writeFile(path.join(outputRoot,'manifest.json'),bytes);
  await build({entryPoints:[fileURLToPath(new URL('../browser/world-ui-preview.ts',import.meta.url))],outfile:path.join(outputRoot,'local-preview.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
  return {hash:hash(bytes),manifest};
}
