import { build, type Plugin } from 'esbuild';
import Ajv from 'ajv';
import { readFile, writeFile, mkdir, readdir, lstat, realpath, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { PROJECT_SCHEMA, type Project, type CreatorProfile, sha256 } from './contracts.js';

export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const checkProject = new Ajv({ allErrors: true, strict: false, strictNumbers: true }).compile(PROJECT_SCHEMA);
const EXCLUDED = new Set(['.git', '.three-creator', 'node_modules', 'outputs', 'inputs', 'dist', '.codex', '.codex-tmp']);
// LWDP owns task-root scratch (Codex sessions, tool wrappers and changing logs).
// Exclude it before any filesystem access; nested author directories keep their meaning.
const HOST_OWNED_ROOTS = new Set(['scratch']);
const SOURCE_EXTENSIONS = new Set(['.html', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.glb', '.gltf', '.bin', '.wasm', '.woff', '.woff2', '.mp3', '.ogg', '.wav']);
export type AssetCatalogEntry = Record<string, any> & { id: string; uri: string; sha256: string; byteLength: number; sourcePath: string };
export type Candidate = { id: string; profile: CreatorProfile; worldBuildHash: string; sourceHash: string; runtimeHash: string; root: string; sourceRoot: string; playableRoot: string; files: Record<string, string>; project: Project; compiledAt: string; runtimeCacheHit: boolean; candidateCacheHit: boolean };
export type PrebuiltRuntimeManifest = { schemaVersion: 1; profile: CreatorProfile; cacheIdentity: string; runtimeHash: string; files: Record<string, string> };
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
    const catalog = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, 'scripts/three-creator/asset-catalog.json'), 'utf8'));
    if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.assets)) throw new Error('THREE_CATALOG_INVALID');
    return catalog.assets;
  } catch (error: any) { if (error.code === 'ENOENT') return []; throw error; }
}
export function publicAsset(entry: AssetCatalogEntry): Record<string, unknown> { const { sourcePath: _private, ...rest } = entry; return rest; }
async function copyTree(from: string, to: string) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from)) {
    const source = path.join(from, entry), target = path.join(to, entry), stat = await lstat(source);
    if (stat.isSymbolicLink()) throw new Error('THREE_SYMLINK_REJECTED');
    if (stat.isDirectory()) await copyTree(source, target); else if (stat.isFile()) await copyFile(source, target);
  }
}
export class ThreeCompiler {
  readonly workspace: string;
  readonly outputRoot: string;
  private candidates = new Map<string, Candidate>();
  private runtimes = new Map<string, { files: Record<string, string>; hash: string }>();
  private addons = new Map<string, string>();
  constructor(workspace: string, readonly profile: CreatorProfile) {
    this.workspace = realpathSync(path.resolve(workspace)); this.outputRoot = path.join(this.workspace, '.three-creator');
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
  async prepareRuntime(): Promise<{ root: string; hash: string; hit: boolean; cacheIdentity: string }> {
    await assertNoSymlinks(this.outputRoot);
    const sdkFiles = this.profile === 'three-sdk' ? await hashTree(path.join(REPOSITORY_ROOT, 'packages/three-world/src')) : {};
    for (const key of Object.keys(sdkFiles)) if (key.endsWith('.test.ts')) delete sdkFiles[key];
    const bridge = await readFile(path.join(REPOSITORY_ROOT, 'apps/three-creator-playground/bridge.ts'));
    const versions = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'));
    const cacheIdentity = sha256(JSON.stringify({ profile: this.profile, three: versions.dependencies.three, esbuild: versions.devDependencies.esbuild, sdkFiles, sdkManifest: this.profile === 'three-sdk' ? sha256(await readFile(path.join(REPOSITORY_ROOT, 'packages/three-world/package.json'))) : null, bridge: sha256(bridge), compiler: sha256(await readFile(fileURLToPath(import.meta.url))) }));
    const root = path.join(this.outputRoot, 'runtime', cacheIdentity);
    const sealed = this.runtimes.get(cacheIdentity);
    if (sealed) { await verifyFiles(root, sealed.files); return { root, hash: sealed.hash, hit: true, cacheIdentity }; }
    const prebuilt = process.env.WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT;
    if (prebuilt) {
      const bytes = await readFile(path.join(prebuilt, 'runtime-manifest.json'));
      if (sha256(bytes) !== process.env.WORLDKIT_THREE_PREBUILT_RUNTIME_MANIFEST_SHA256) throw new Error('THREE_PREBUILT_MANIFEST_HASH_MISMATCH');
      const manifest = JSON.parse(bytes.toString()) as PrebuiltRuntimeManifest;
      if (manifest.schemaVersion !== 1 || manifest.profile !== this.profile || manifest.cacheIdentity !== cacheIdentity || sha256(JSON.stringify(manifest.files)) !== manifest.runtimeHash) throw new Error('THREE_PREBUILT_RUNTIME_IDENTITY_MISMATCH');
      await verifyFiles(path.join(prebuilt, 'runtime'), manifest.files); await rm(root, { recursive: true, force: true }); await copyTree(path.join(prebuilt, 'runtime'), root);
      this.runtimes.set(cacheIdentity, { files: manifest.files, hash: manifest.runtimeHash }); return { root, hash: manifest.runtimeHash, hit: true, cacheIdentity };
    }
    await rm(root, { recursive: true, force: true }); await mkdir(root, { recursive: true });
    const base = { bundle: true, format: 'esm' as const, platform: 'browser' as const, target: 'es2022', logLevel: 'silent' as const, sourcemap: false };
    const threeEsmEntry = path.join(path.dirname(require.resolve('three')), 'three.module.js');
    await build({ ...base, entryPoints: [threeEsmEntry], outfile: path.join(root, 'three.js') });
    await build({ ...base, entryPoints: [path.join(REPOSITORY_ROOT, 'apps/three-creator-playground/bridge.ts')], external: ['three'], outfile: path.join(root, 'bridge.js') });
    if (this.profile === 'three-sdk') await build({ ...base, entryPoints: [path.join(REPOSITORY_ROOT, 'packages/three-world/src/index.ts')], plugins: [{ name: 'shared-three-only', setup: plugin => { plugin.onResolve({ filter: /^three$/ }, args => ({ path: args.path, external: true })); } }], outfile: path.join(root, 'worldkit-three.js') });
    const files = await hashTree(root), hash = sha256(JSON.stringify(files));
    this.runtimes.set(cacheIdentity, { files, hash });
    return { root, hash, hit: false, cacheIdentity };
  }
  async prepare(): Promise<Candidate> {
    const sourceFiles = await this.sourceFiles();
    const project = sourceFiles.has('project.json') ? JSON.parse(sourceFiles.get('project.json')!.toString()) : { schemaVersion: 1, assetIds: [] };
    if (!checkProject(project)) throw new Error(`THREE_PROJECT_INVALID: ${JSON.stringify(checkProject.errors)}`);
    const runtime = await this.prepareRuntime();
    const sources = Object.fromEntries([...sourceFiles].map(([name, data]) => [name, sha256(data)]));
    const assets = await readCatalog();
    const selected = (project as Project).assetIds.map(id => { const asset = assets.find(a => a.id === id); if (!asset) throw new Error(`THREE_ASSET_UNKNOWN: ${id}`); return asset; });
    const sourceHash = sha256(JSON.stringify({ sources, assets: selected.map(publicAsset) }));
    const worldBuildHash = sha256(JSON.stringify({ sourceHash, runtimeHash: runtime.hash, profile: this.profile }));
    const previous = this.candidates.get(worldBuildHash);
    if (previous) { await verifyFiles(previous.root, previous.files); return { ...previous, candidateCacheHit: true, runtimeCacheHit: true }; }
    const root = path.join(this.outputRoot, 'candidates', worldBuildHash), sourceRoot = path.join(root, 'source'), playableRoot = path.join(root, 'playable');
    await rm(root, { recursive: true, force: true }); await mkdir(sourceRoot, { recursive: true }); await mkdir(playableRoot, { recursive: true });
    for (const [name, data] of sourceFiles) { const file = path.join(sourceRoot, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, data); }
    await copyTree(sourceRoot, playableRoot); await copyTree(runtime.root, path.join(playableRoot, 'runtime'));
    for (const asset of selected) {
      const source = path.resolve(REPOSITORY_ROOT, asset.sourcePath);
      if (!isWithin(REPOSITORY_ROOT, source) || !isWithin(REPOSITORY_ROOT, await realpath(source)) || (await lstat(source)).isSymbolicLink()) throw new Error('THREE_ASSET_SOURCE_ESCAPE');
      const bytes = await readFile(source);
      if (sha256(bytes) !== asset.sha256 || bytes.length !== asset.byteLength) throw new Error(`THREE_ASSET_HASH_MISMATCH: ${asset.id}`);
      if (!/^\.\/assets\/subjects\/[a-f0-9]{64}\.glb$/.test(asset.uri)) throw new Error(`THREE_ASSET_URI_INVALID: ${asset.id}`);
      const destination = path.join(playableRoot, asset.uri); await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, bytes);
    }
    await writeFile(path.join(playableRoot, 'asset-definitions.json'), JSON.stringify({ schemaVersion: 1, assets: selected.map(publicAsset) }, null, 2));
    const imports: Record<string, string> = { three: './runtime/three.js' };
    if (this.profile === 'three-sdk') imports['@worldkit/three'] = './runtime/worldkit-three.js';
    const addonImports = new Set<string>();
    const boundary: Plugin = { name: 'three-author-boundary', setup: plugin => {
      plugin.onLoad({ filter: /.*/ }, async args => {
        if (!isWithin(sourceRoot, args.path) || !isWithin(sourceRoot, await realpath(args.path))) throw new Error(`THREE_IMPORT_PATH_ESCAPE: ${args.path}`);
        return undefined;
      });
      plugin.onResolve({ filter: /.*/ }, async args => {
        if (args.kind === 'entry-point') return;
        if (args.path === 'three' || (args.path === '@worldkit/three' && this.profile === 'three-sdk')) return { path: args.path, external: true };
        if (/^three\/(addons|examples\/jsm)\/.+\.js$/.test(args.path) && !args.path.includes('..')) { addonImports.add(args.path); return { path: args.path, external: true }; }
        if (!args.path.startsWith('.')) throw new Error(`THREE_IMPORT_NOT_ALLOWED: ${args.path}; use local files, three/addons, or the selected SDK profile`);
        const candidate = path.resolve(args.resolveDir, args.path);
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
      const common = { bundle: true, format: 'esm' as const, platform: 'browser' as const, target: 'es2022', tsconfigRaw: { compilerOptions: { target: 'ES2022', useDefineForClassFields: true } }, plugins: [boundary], outfile: path.join(playableRoot, out), sourcemap: true, logLevel: 'silent' as const, loader: { '.png': 'file' as const, '.glb': 'file' as const, '.jpg': 'file' as const, '.svg': 'file' as const, '.wasm': 'file' as const } };
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
    const injected = `<script type="importmap">${JSON.stringify({ imports }).replace(/</g, '\\u003c')}</script><script type="module" src="./runtime/bridge.js"></script>`;
    html = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, value => value + injected) : injected + html;
    await writeFile(path.join(playableRoot, 'index.html'), html);
    const candidate: Candidate = { id: worldBuildHash, profile: this.profile, worldBuildHash, sourceHash, runtimeHash: runtime.hash, root, sourceRoot, playableRoot, project: project as Project, files: await hashTree(root), compiledAt: new Date().toISOString(), runtimeCacheHit: runtime.hit, candidateCacheHit: false };
    this.candidates.set(worldBuildHash, candidate); return candidate;
  }
}
