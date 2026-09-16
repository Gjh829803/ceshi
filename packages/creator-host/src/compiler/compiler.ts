import { build, type Plugin } from 'esbuild';
import {readWorkspaceRuntime,materializeWorkspaceRuntime,type WorkspaceRuntime} from './workspace-runtime.js';
import Ajv from 'ajv';
import { readFile, writeFile, mkdir, readdir, lstat, realpath, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { realpathSync, readFileSync, lstatSync } from 'node:fs';
import { PROJECT_SCHEMA, type Project, type CreatorProfile, sha256 } from '../contracts.js';
import { catalogResources, publicCatalogValue, readCatalogResource } from '../assets/asset-resources.js';
import { createAssetPolicySnapshot, validateAssetPolicySnapshot, assetPolicyHash, verifyAssetPolicySources, verifyAssetPolicyBundle, type AssetPolicySnapshot } from '../assets/asset-policy.mjs';

export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const require = createRequire(import.meta.url);
const checkProject = new Ajv({ allErrors: true, strict: false, strictNumbers: true }).compile(PROJECT_SCHEMA);
const EXCLUDED = new Set(['.git', '.three-creator', 'node_modules', 'outputs', 'inputs', 'dist', '.codex', '.codex-tmp']);
// LWDP owns task-root scratch (Codex sessions, tool wrappers and changing logs).
// Exclude it before any filesystem access; nested author directories keep their meaning.
const HOST_OWNED_ROOTS = new Set(['scratch']);
const SOURCE_EXTENSIONS = new Set(['.html', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.glb', '.gltf', '.bin', '.wasm', '.woff', '.woff2', '.ttf', '.txt', '.mp3', '.ogg', '.wav']);
export type AssetCatalogEntry = Record<string, any> & { id: string; uri: string; sha256: string; byteLength: number; sourcePath: string };
export type Candidate = { id: string; profile: CreatorProfile; worldBuildHash: string; sourceHash: string; runtimeHash: string; runtimeSourceHash: string | null; assetPolicySha256: string; root: string; sourceRoot: string; playableRoot: string; files: Record<string, string>; project: Project; compiledAt: string; runtimeCacheHit: boolean; candidateCacheHit: boolean };
export type AssetPolicyOptions = { assetPolicySnapshotPath?: string; assetPolicySha256?: string };
export type CompilerOptions = AssetPolicyOptions & {debugTools?:boolean};
export type PrebuiltRuntimeManifest = { schemaVersion: 1; profile: CreatorProfile; debugTools?:boolean; cacheIdentity: string; runtimeHash: string; files: Record<string, string> };
export function isWithin(root: string, file: string): boolean { const relative = path.relative(root, file); return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative); }
export async function hashTree(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function walk(dir: string) {
    for (const entry of (await readdir(dir)).sort()) {
      const file = path.join(dir, entry), stat = await lstat(file);
      if (stat.isSymbolicLink()) throw new Error(`THREE_SYMLINK_REJECTED: ${file}`);
      if (stat.isDirectory()) await walk(file);
      else if (stat.isFile()) files[path.relative(root, file).split(path.sep).join('/')] = sha256(await readFile(file));
      else throw new Error(`THREE_NONREGULAR_FILE: ${file}`);
    }
  }
  await walk(root); return files;
}
export async function assertNoSymlinks(root: string): Promise<void> {
  let stat; try { stat = await lstat(root); } catch (error: any) { if (error.code === 'ENOENT') return; throw error; }
  if (stat.isSymbolicLink()) throw new Error(`THREE_SYMLINK_REJECTED: ${root}`);
  if (stat.isDirectory()) for (const name of await readdir(root)) await assertNoSymlinks(path.join(root, name));
}
export async function verifyFiles(root: string, expected: Record<string, string>): Promise<void> {
  if (JSON.stringify(await hashTree(root)) !== JSON.stringify(expected)) throw new Error('THREE_ARTIFACT_CHANGED: sealed content differs');
}
export async function readCatalog(): Promise<AssetCatalogEntry[]> {
  try {
    const catalog = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, 'assets/three-creator/asset-catalog.json'), 'utf8'));
    if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.assets)) throw new Error('THREE_CATALOG_INVALID');
    return catalog.assets;
  } catch (error: any) { if (error.code === 'ENOENT') return []; throw error; }
}
export function publicAsset(entry: AssetCatalogEntry): Record<string, unknown> { return publicCatalogValue(entry); }
async function copyTree(from: string, to: string) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from)) {
    const source = path.join(from, entry), target = path.join(to, entry), stat = await lstat(source);
    if (stat.isSymbolicLink()) throw new Error('THREE_SYMLINK_REJECTED');
    if (stat.isDirectory()) await copyTree(source, target); else if (stat.isFile()) await copyFile(source, target);
  }
}
export class ThreeCompiler {
  readonly debugTools:boolean;
  readonly workspace: string;
  readonly outputRoot: string;
  private candidates = new Map<string, Candidate>();
  private runtimes = new Map<string, { files: Record<string, string>; hash: string }>();
  private addons = new Map<string, string>();
  private policyContext?: { snapshot:AssetPolicySnapshot; catalog:AssetCatalogEntry[]; hash:string };
  private readonly policyOptions: AssetPolicyOptions;
  constructor(workspace: string, readonly profile: CreatorProfile, options: CompilerOptions = {}) {
    this.debugTools=options.debugTools===true;
    if(this.debugTools&&profile!=='three-sdk')throw new Error('THREE_DEBUG_TOOLS_REQUIRE_SDK');
    this.workspace = realpathSync(path.resolve(workspace)); this.outputRoot = path.join(this.workspace, '.three-creator');
    this.policyOptions={...options};
  }
  private initializePolicy() {
    if(this.policyContext)return this.policyContext;
    const options=this.policyOptions;
    let frozenPolicy:AssetPolicySnapshot;
    const catalog = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT,'assets/three-creator/asset-catalog.json'),'utf8'));
    if(catalog.schemaVersion!==1||!Array.isArray(catalog.assets))throw new Error('THREE_CATALOG_INVALID');
    const frozenCatalog:AssetCatalogEntry[]=catalog.assets;
    const hasPin=options.assetPolicySnapshotPath!==undefined||options.assetPolicySha256!==undefined;
    if(hasPin&&(!options.assetPolicySnapshotPath||!options.assetPolicySha256))throw new Error('THREE_ASSET_POLICY_PIN_REQUIRED');
    if(options.assetPolicySnapshotPath){
      const file=realpathSync(options.assetPolicySnapshotPath),stat=lstatSync(options.assetPolicySnapshotPath);
      if(!stat.isFile()||stat.isSymbolicLink()||file===this.workspace||isWithin(this.workspace,file))throw new Error('THREE_ASSET_POLICY_HOST_PATH_REQUIRED');
      frozenPolicy=validateAssetPolicySnapshot(JSON.parse(readFileSync(file,'utf8')));
      if(assetPolicyHash(frozenPolicy)!==options.assetPolicySha256)throw new Error('THREE_ASSET_POLICY_HASH_MISMATCH');
      if(assetPolicyHash(createAssetPolicySnapshot(frozenPolicy.policy,frozenCatalog))!==options.assetPolicySha256)throw new Error('THREE_ASSET_POLICY_CATALOG_CHANGED');
    }else{
      frozenPolicy=createAssetPolicySnapshot(JSON.parse(readFileSync(path.join(REPOSITORY_ROOT,'packages/creator-host/config/asset-policy.json'),'utf8')),frozenCatalog);
    }
    return this.policyContext={snapshot:frozenPolicy,catalog:frozenCatalog,hash:assetPolicyHash(frozenPolicy)};
  }
  get assetPolicySha256():string {return this.initializePolicy().hash;}
  assetPolicy(): AssetPolicySnapshot { return structuredClone(this.initializePolicy().snapshot); }
  allowedAssets(): AssetCatalogEntry[] { const {catalog,snapshot}=this.initializePolicy();return structuredClone(catalog.filter(asset=>snapshot.policy.allowedAssetIds.includes(asset.id))); }
  async verifyCandidatePolicy(candidate:Candidate):Promise<void>{
    const readTree=async(root:string)=>Object.fromEntries(await Promise.all(Object.keys(await hashTree(root)).map(async name=>[name,await readFile(path.join(root,name))])));
    const [sourceFiles,playableFiles]=await Promise.all([readTree(candidate.sourceRoot),readTree(candidate.playableRoot)]);
    verifyAssetPolicyBundle({snapshot:this.assetPolicy(),expectedHash:candidate.assetPolicySha256,sourceFiles,playableFiles,
      assetDefinitions:JSON.parse(playableFiles['asset-definitions.json']!.toString())});
  }
  async sourceFiles(): Promise<Map<string, Buffer>> {
    const root = await realpath(this.workspace), result = new Map<string, Buffer>(); let size = 0;
    const walk = async (dir: string) => {
      for (const name of (await readdir(dir)).sort()) {
        if (EXCLUDED.has(name) || name.startsWith('.') || (dir === root && HOST_OWNED_ROOTS.has(name))) continue;
        const file = path.join(dir, name), stat = await lstat(file);
        if (stat.isSymbolicLink()) throw new Error(`THREE_SOURCE_SYMLINK: ${path.relative(root, file)}`);
        if (stat.isDirectory()) await walk(file);
        else if (stat.isFile() && SOURCE_EXTENSIONS.has(path.extname(name).toLowerCase())) {
          const relative = path.relative(root, file).split(path.sep).join('/');
          if (relative === 'episode.json' || relative === 'package-lock.json' || relative === 'creator-result.json') continue;
          if (!isWithin(root, await realpath(file))) throw new Error('THREE_SOURCE_PATH_ESCAPE');
          const bytes = await readFile(file); size += bytes.length;
          if (size > 128 * 1024 * 1024 || result.size > 2000) throw new Error('THREE_SOURCE_BUDGET: maximum 128 MB / 2000 author files');
          result.set(relative, bytes);
        }
      }
    };
    await walk(root);
    if (!result.has('index.html')) throw new Error('THREE_ENTRY_MISSING: write index.html with a local module script');
    return result;
  }
  async materializeRuntime() {
    if(this.profile!=='three-sdk')throw new Error('THREE_RUNTIME_SOURCE_REQUIRES_SDK');
    return materializeWorkspaceRuntime(REPOSITORY_ROOT,this.workspace);
  }
  async prepareRuntime(options: { workspaceRuntime?:WorkspaceRuntime|null } = {}): Promise<{ root: string; hash: string; hit: boolean; cacheIdentity: string }> {
    await assertNoSymlinks(this.outputRoot);
    const workspaceRuntime=options.workspaceRuntime===undefined?await readWorkspaceRuntime(REPOSITORY_ROOT,this.workspace):options.workspaceRuntime??undefined;
    if(workspaceRuntime&&this.profile!=='three-sdk')throw new Error('THREE_RUNTIME_SOURCE_REQUIRES_SDK');
    const sdkFiles = this.profile === 'three-sdk' ? await hashTree(path.join(REPOSITORY_ROOT, 'packages/three-world/src')) : {};
    for (const key of Object.keys(sdkFiles)) if (key.endsWith('.test.ts')) delete sdkFiles[key];
    const sharedCameraFiles: Record<string, string> = this.profile === 'three-sdk' ? {
      ...await hashTree(path.join(REPOSITORY_ROOT, 'packages/camera-collision/src')),
      'package.json': sha256(await readFile(path.join(REPOSITORY_ROOT, 'packages/camera-collision/package.json'))),
    } : {};
    for (const key of Object.keys(sharedCameraFiles)) if (key.endsWith('.test.ts')) delete sharedCameraFiles[key];
    const bridge = await readFile(path.join(REPOSITORY_ROOT, 'packages/creator-host/src/browser/bridge.ts'));
    const versions = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'));
    const cacheIdentity = sha256(JSON.stringify({ profile: this.profile, debugTools:this.debugTools, debugBootstrap:this.debugTools?sha256(await readFile(path.join(REPOSITORY_ROOT,'packages/creator-host/src/browser/debug-tools.ts'))):null, workspaceRuntimeSourceHash: workspaceRuntime?.sourceHash??null, three: versions.dependencies.three, esbuild: versions.devDependencies.esbuild, sdkFiles, sharedCameraFiles, sdkManifest: this.profile === 'three-sdk' ? sha256(await readFile(path.join(REPOSITORY_ROOT, 'packages/three-world/package.json'))) : null, bridge: sha256(bridge), compiler: sha256(await readFile(fileURLToPath(import.meta.url))), workspaceRuntimeCompiler:sha256(await readFile(new URL('./workspace-runtime.ts',import.meta.url))) }));
    const root = path.join(this.outputRoot, 'runtime', cacheIdentity);
    const sealed = this.runtimes.get(cacheIdentity);
    if (sealed) { await verifyFiles(root, sealed.files); return { root, hash: sealed.hash, hit: true, cacheIdentity }; }
    const prebuilt = process.env.WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT;
    if (prebuilt && !workspaceRuntime) {
      const bytes = await readFile(path.join(prebuilt, 'runtime-manifest.json'));
      if (sha256(bytes) !== process.env.WORLDKIT_THREE_PREBUILT_RUNTIME_MANIFEST_SHA256) throw new Error('THREE_PREBUILT_MANIFEST_HASH_MISMATCH');
      const manifest = JSON.parse(bytes.toString()) as PrebuiltRuntimeManifest;
      if (manifest.schemaVersion !== 1 || manifest.profile !== this.profile || (manifest.debugTools??false)!==this.debugTools || manifest.cacheIdentity !== cacheIdentity || sha256(JSON.stringify(manifest.files)) !== manifest.runtimeHash) throw new Error('THREE_PREBUILT_RUNTIME_IDENTITY_MISMATCH');
      await verifyFiles(path.join(prebuilt, 'runtime'), manifest.files); await rm(root, { recursive: true, force: true }); await copyTree(path.join(prebuilt, 'runtime'), root);
      this.runtimes.set(cacheIdentity, { files: manifest.files, hash: manifest.runtimeHash }); return { root, hash: manifest.runtimeHash, hit: true, cacheIdentity };
    }
    await rm(root, { recursive: true, force: true }); await mkdir(root, { recursive: true });
    const base = { tsconfigRaw: {compilerOptions: {target:'ES2022',useDefineForClassFields:true}}, bundle: true, format: 'esm' as const, platform: 'browser' as const, target: 'es2022', logLevel: 'silent' as const, sourcemap: false };
    const threeEsmEntry = path.join(path.dirname(require.resolve('three')), 'three.module.js');
    await build({ ...base, entryPoints: [threeEsmEntry], outfile: path.join(root, 'three.js') });
    await build({ ...base, entryPoints: [path.join(REPOSITORY_ROOT, 'packages/creator-host/src/browser/bridge.ts')], external: ['three'], outfile: path.join(root, 'bridge.js') });
    if (this.profile === 'three-sdk') await build({ ...base,
      entryPoints: [workspaceRuntime?.entry??path.join(REPOSITORY_ROOT, 'packages/three-world/src/index.ts')],
      plugins: [...(workspaceRuntime?[workspaceRuntime.plugin]:[]), { name: 'shared-three-only', setup: plugin => {
        plugin.onResolve({ filter: /^three$/ }, args => ({ path: args.path, external: true }));
      } }], outfile: path.join(root, 'worldkit-three.js') });
    if(this.debugTools){
      const debugEntry=path.join(path.dirname(workspaceRuntime?.entry??path.join(REPOSITORY_ROOT,'packages/three-world/src/index.ts')),'debug/index.ts');
      const debugBuild=await build({...base,entryPoints:[debugEntry],external:['three','@worldkit/three'],plugins:workspaceRuntime?[workspaceRuntime.plugin]:[],metafile:true,outfile:path.join(root,'worldkit-debug.js')});
      const debugExports=Object.values(debugBuild.metafile!.outputs).flatMap(output=>output.exports);
      if(!['mountDebugPanel','createBrowserDebugStore'].every(name=>debugExports.includes(name)))throw new Error('THREE_DEBUG_RUNTIME_CAPABILITY_MISSING');
      await build({...base,entryPoints:[path.join(REPOSITORY_ROOT,'packages/creator-host/src/browser/debug-tools.ts')],external:['three','@worldkit/three','@worldkit/three/debug'],outfile:path.join(root,'debug-tools.js')});
    }
    const files = await hashTree(root), hash = sha256(JSON.stringify(files));
    this.runtimes.set(cacheIdentity, { files, hash });
    return { root, hash, hit: false, cacheIdentity };
  }
  async prepare(): Promise<Candidate> {
    const sourceFiles = await this.sourceFiles();
    verifyAssetPolicySources(this.assetPolicy(),Object.fromEntries(sourceFiles));
    const project = sourceFiles.has('project.json') ? JSON.parse(sourceFiles.get('project.json')!.toString()) : { schemaVersion: 1, assetIds: [] };
    if (!checkProject(project)) throw new Error(`THREE_PROJECT_INVALID: ${JSON.stringify(checkProject.errors)}`);
    const sources = Object.fromEntries([...sourceFiles].map(([name, data]) => [name, sha256(data)]));
    const assets = this.allowedAssets();
    const selected = (project as Project).assetIds.map(id => { const asset = assets.find(a => a.id === id); if (!asset) throw new Error(`THREE_ASSET_POLICY_DENIED: ${id}`); return asset; });
    const workspaceRuntime=await readWorkspaceRuntime(REPOSITORY_ROOT,this.workspace);
    if(workspaceRuntime&&this.profile!=='three-sdk')throw new Error('THREE_RUNTIME_SOURCE_REQUIRES_SDK');
    if(workspaceRuntime){
      if([...sourceFiles.keys()].filter(name=>name.startsWith('sdk/')).length!==workspaceRuntime.files.size)throw new Error('THREE_RUNTIME_SOURCE_CHANGED');
      for(const [name,bytes]of workspaceRuntime.files)if(!sourceFiles.get(`sdk/${name}`)?.equals(bytes))throw new Error('THREE_RUNTIME_SOURCE_CHANGED');
    }
    const runtime = await this.prepareRuntime({workspaceRuntime:workspaceRuntime??null});
    const sourceHash = sha256(JSON.stringify({ sources, assets: selected.map(publicAsset), assetPolicySha256:this.assetPolicySha256 }));
    const worldBuildHash = sha256(JSON.stringify({ sourceHash, runtimeHash: runtime.hash, profile: this.profile }));
    const previous = this.candidates.get(worldBuildHash);
    if (previous) { await verifyFiles(previous.root, previous.files); return { ...previous, candidateCacheHit: true, runtimeCacheHit: true }; }
    const root = path.join(this.outputRoot, 'candidates', worldBuildHash), sourceRoot = path.join(root, 'source'), playableRoot = path.join(root, 'playable');
    await rm(root, { recursive: true, force: true }); await mkdir(sourceRoot, { recursive: true }); await mkdir(playableRoot, { recursive: true });
    for (const [name, data] of sourceFiles) { const file = path.join(sourceRoot, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, data); }
    await copyTree(sourceRoot, playableRoot); await copyTree(runtime.root, path.join(playableRoot, 'runtime'));
      for (const asset of selected) {
        for (const resource of catalogResources(asset)) {
          const bytes = await readCatalogResource(REPOSITORY_ROOT, resource);
          const destination = path.join(playableRoot, resource.uri); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, bytes);
        }
    }
    await writeFile(path.join(playableRoot, 'asset-definitions.json'), JSON.stringify({ schemaVersion: 1, assets: selected.map(publicAsset) }, null, 2));
    await writeFile(path.join(playableRoot, 'asset-policy.json'), JSON.stringify(this.assetPolicy(), null, 2));
    const imports: Record<string, string> = { three: './runtime/three.js' };
    if (this.profile === 'three-sdk') imports['@worldkit/three'] = './runtime/worldkit-three.js';
    if(this.debugTools)imports['@worldkit/three/debug']='./runtime/worldkit-debug.js';
    const addonImports = new Set<string>();
    const boundary: Plugin = { name: 'three-author-boundary', setup: plugin => {
      plugin.onLoad({ filter: /.*/ }, async args => {
        if (!isWithin(sourceRoot, args.path) || !isWithin(sourceRoot, await realpath(args.path))) throw new Error(`THREE_IMPORT_PATH_ESCAPE: ${args.path}`);
        return undefined;
      });
      plugin.onResolve({ filter: /.*/ }, async args => {
        if (args.kind === 'entry-point') return;
        if (args.path === 'three' || ((args.path === '@worldkit/three'||this.debugTools&&args.path==='@worldkit/three/debug') && this.profile === 'three-sdk')) return { path: args.path, external: true };
        if (/^three\/(addons|examples\/jsm)\/.+\.js$/.test(args.path) && !args.path.includes('..')) { addonImports.add(args.path); return { path: args.path, external: true }; }
        if (!args.path.startsWith('.')) throw new Error(`THREE_IMPORT_NOT_ALLOWED: ${args.path}; use local files, three/addons, or the selected SDK profile`);
        const candidate = path.resolve(args.resolveDir, args.path);
        if(isWithin(path.join(sourceRoot,'sdk'),candidate))throw new Error('THREE_RUNTIME_IMPORT_USE_PUBLIC_PACKAGE: import @worldkit/three');
        if (!isWithin(sourceRoot, candidate)) throw new Error(`THREE_IMPORT_PATH_ESCAPE: ${args.path}`);
        return;
      });
    } };
    let html = sourceFiles.get('index.html')!.toString(); let entryCount = 0;
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
    for (const match of scripts) {
      const attrs = match[1]!, body = match[2]!;
      const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
      if (type === 'importmap') throw new Error('THREE_IMPORTMAP_HOST_OWNED: import three normally; Host supplies dependency mapping');
      if (type !== 'module') continue;
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
      if (src && (/^(?:[a-z]+:|\/\/|\/)/i.test(src) || src.includes('?') || src.includes('#'))) throw new Error('THREE_SCRIPT_PATH_INVALID: use a local relative module path');
      const entry = src ? path.resolve(sourceRoot, src) : path.join(sourceRoot, `inline-${entryCount}.ts`);
      if (!isWithin(sourceRoot, entry)) throw new Error('THREE_ENTRY_PATH_ESCAPE');
      const out = `compiled/entry-${entryCount++}.js`;
      const common = { bundle: true, format: 'esm' as const, platform: 'browser' as const, target: 'es2022', tsconfigRaw: { compilerOptions: { target: 'ES2022', useDefineForClassFields: true } }, plugins: [boundary], outfile: path.join(playableRoot, out), sourcemap: true, logLevel: 'silent' as const, loader: { '.png': 'file' as const, '.glb': 'file' as const, '.jpg': 'file' as const, '.svg': 'file' as const, '.wasm': 'file' as const, '.woff': 'file' as const, '.woff2': 'file' as const, '.ttf': 'file' as const } };
      if (src) await build({ ...common, entryPoints: [entry] }); else await build({ ...common, stdin: { contents: body, loader: 'ts', resolveDir: sourceRoot, sourcefile: path.basename(entry) } });
      const css = out.replace(/\.js$/, '.css'); let cssTag = '';
      try { await lstat(path.join(playableRoot, css)); cssTag = `<link rel="stylesheet" href="./${css}">`; } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
      html = html.replace(match[0], `${cssTag}<script type="module" src="./${out}"></script>`);
    }
    if (!entryCount) throw new Error('THREE_MODULE_ENTRY_MISSING: index.html requires a type="module" script');
    for (const specifier of addonImports) {
      const filename = `addon-${sha256(specifier).slice(0, 16)}.js`;
      const cache = path.join(this.outputRoot, 'addons', runtime.cacheIdentity, filename); await mkdir(path.dirname(cache), { recursive: true });
      const expected = this.addons.get(cache);
      if (expected) { if (sha256(await readFile(cache)) !== expected) throw new Error('THREE_ADDON_CACHE_CHANGED'); } else {
        await build({ entryPoints: [require.resolve(specifier)], outfile: cache, bundle: true, platform: 'browser', format: 'esm', external: ['three'], target: 'es2022', logLevel: 'silent' });
        this.addons.set(cache, sha256(await readFile(cache)));
      }
      await copyFile(cache, path.join(playableRoot, 'runtime', filename)); imports[specifier] = `./runtime/${filename}`;
    }
    const debugInjection=this.debugTools?`<script id="worldkit-debug-identity" type="application/json">${JSON.stringify({sourceHash,runtimeHash:runtime.hash,worldBuildHash}).replace(/</g,'\\u003c')}</script><script type="module" src="./runtime/debug-tools.js"></script>`:'';
    const injected = `<script type="importmap">${JSON.stringify({ imports }).replace(/</g, '\\u003c')}</script><script type="module" src="./runtime/bridge.js"></script>${debugInjection}`;
    html = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, value => value + injected) : injected + html;
    await writeFile(path.join(playableRoot, 'index.html'), html);
    const candidate: Candidate = { id: worldBuildHash, profile: this.profile, worldBuildHash, sourceHash, runtimeHash: runtime.hash, runtimeSourceHash:workspaceRuntime?.sourceHash??null, assetPolicySha256:this.assetPolicySha256, root, sourceRoot, playableRoot, project: project as Project, files: await hashTree(root), compiledAt: new Date().toISOString(), runtimeCacheHit: runtime.hit, candidateCacheHit: false };
    await this.verifyCandidatePolicy(candidate);
    this.candidates.set(worldBuildHash, candidate); return candidate;
  }
}
