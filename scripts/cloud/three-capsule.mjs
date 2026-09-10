#!/usr/bin/env node
/** Isolated Linux x64 Three Creator dependency preparation and frozen-source packaging. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NODE_SOURCE_IMAGE = 'node:20.20.2-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0';
const ROOT_DEPENDENCIES = { dependencies: ['@worldkit/three', 'three', 'sharp'], devDependencies: ['@modelcontextprotocol/sdk', 'ajv', 'esbuild', 'playwright', 'tsx', 'typescript'] };
const SOURCE_TREES = ['packages/three-world', 'packages/camera-collision', 'scripts/three-creator', 'apps/three-creator-playground', 'shared/preset-content','examples/three-creator/vehicle-sandbox','examples/three-creator/character-actions','examples/three-creator/horse-riding','examples/three-creator/custom-vehicle','examples/three-creator/vehicle-camera','examples/three-creator/nonhuman-subject'];
const DENIED = new Set(['node_modules', '.git', '.codex', '.codex-tmp', '.env', 'auth.json', 'credentials', '.aws', '.npmrc', '.pnpmfile.cjs', 'config.toml', 'dist', 'coverage', 'test-results']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.js', '.mjs', '.json', '.wasm', '.md', '.html', '.css', '.svg', '.txt','.woff','.woff2','.ttf']);
export const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const writeJson = (file, value) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, jsonBytes(value)); };
const within = (root, file) => file.startsWith(`${root}${path.sep}`);
const walk = root => readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => entry.isDirectory() ? walk(path.join(root, entry.name)) : [path.join(root, entry.name)]);
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed (${result.signal ?? result.status})`);
};

/** Preserve pnpm 9 resolution/integrity records verbatim; project only the importers. */
export function projectLock(original, rootManifest) {
  original = original.replaceAll('\r\n', '\n');
  assert(original.startsWith("lockfileVersion: '9.0'\n"), 'Only the checked pnpm 9 lock layout is supported');
  const start = original.indexOf('\nimporters:\n'), end = original.indexOf('\npackages:\n', start);
  assert(start > 0 && end > start, 'Missing pnpm importer/package sections');
  const body = original.slice(start + '\nimporters:\n'.length, end);
  const importers = new Map([...body.matchAll(/^  ([^\n]+):\n([\s\S]*?)(?=^  [^ \n][^\n]*:\n|(?![\s\S]))/gm)].map(match => [match[1], match[2]]));
  const root = importers.get('.'), sdk = importers.get('packages/three-world');
  assert(root && sdk, 'Missing root/Three workspace importer');
  let projected = '  .:\n';
  for (const [scope, names] of Object.entries(ROOT_DEPENDENCIES)) {
    const match = new RegExp(`^    ${scope}:\\n([\\s\\S]*?)(?=^    [^ \\n][^\\n]*:\\n|(?![\\s\\S]))`, 'm').exec(root);
    assert(match, `Lock lacks ${scope}`);
    const blocks = new Map([...match[1].matchAll(/^      (?:'([^']+)'|([^ :\n]+)):\n([\s\S]*?)(?=^      [^ \n][^\n]*:\n|(?![\s\S]))/gm)].map(row => [row[1] ?? row[2], row]));
    projected += `    ${scope}:\n`;
    for (const name of names) {
      const row = blocks.get(name); assert(row, `Lock lacks ${scope}.${name}`);
      const specifier = /^        specifier: (.+)$/m.exec(row[3])?.[1];
      assert.equal(specifier, rootManifest[scope][name], `Root/lock mismatch: ${name}`);
      projected += row[0].trimEnd() + '\n';
    }
  }
  projected += `\n  packages/three-world:\n${sdk.trimEnd()}\n`;
  assert(original.includes('\n  packages/camera-collision: {}\n'), 'Review changed shared camera collision dependencies');
  projected += '\n  packages/camera-collision: {}\n';
  return original.slice(0, start) + '\nimporters:\n\n' + projected + original.slice(end);
}

export function stageContext(repositoryRoot, outputRoot) {
  const contextRoot = path.join(outputRoot, 'context'), sourceRoot = path.join(contextRoot, 'sources'), manifestsRoot = path.join(contextRoot, 'manifests');
  assert(within(repositoryRoot, outputRoot), 'Generated output must be inside this checkout');
  rmSync(contextRoot, { recursive: true, force: true }); mkdirSync(sourceRoot, { recursive: true });
  const files = new Map();
  const safeRelative = relative => {
    assert(!path.isAbsolute(relative) && !relative.split('/').includes('..'), `Unsafe source path: ${relative}`);
    assert(!relative.split('/').some(part => DENIED.has(part) || part.startsWith('.env')), `Forbidden staged path: ${relative}`);
    return relative;
  };
  function put(relative, bytes, manifest = false) {
    safeRelative(relative);
    for (const root of [sourceRoot, ...(manifest ? [manifestsRoot] : [])]) {
      const target = path.join(root, relative); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, bytes, { mode: 0o644 });
    }
    files.set(relative, { path: relative, bytes: bytes.length, sha256: sha256(bytes) });
  }
  function source(relative, manifest = false) {
    safeRelative(relative);
    const file = path.join(repositoryRoot, relative), stat = lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink() && realpathSync(file) === file, `Source must be a plain in-checkout file: ${relative}`);
    put(relative, readFileSync(file), manifest);
  }
  function tree(relative) {
    assert(lstatSync(path.join(repositoryRoot, relative)).isDirectory());
    for (const entry of readdirSync(path.join(repositoryRoot, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || DENIED.has(entry.name) || entry.name.endsWith('.test.ts')) continue;
      const child = `${relative}/${entry.name}`;
      assert(!entry.isSymbolicLink(), `Source symlink rejected: ${child}`);
      if (entry.isDirectory()) tree(child);
      else if (entry.isFile() && (SOURCE_EXTENSIONS.has(path.extname(entry.name)) || /^LICENSE(?:\.|$)/i.test(entry.name))) source(child);
    }
  }
  const originalPackage = readFileSync(path.join(repositoryRoot, 'package.json'));
  const originalLock = readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'));
  const originalWorkspace = readFileSync(path.join(repositoryRoot, 'pnpm-workspace.yaml'));
  const workspaceText = originalWorkspace.toString().replaceAll('\r\n', '\n');
  const packageJson = JSON.parse(originalPackage);
  assert.equal(packageJson.packageManager, 'pnpm@10.14.0');
  const projectedPackage = { name: 'worldkit-three-creator-toolkit', version: '0.0.0', private: true, type: 'module', packageManager: packageJson.packageManager };
  for (const [scope, names] of Object.entries(ROOT_DEPENDENCIES)) projectedPackage[scope] = Object.fromEntries(names.map(name => { assert(packageJson[scope]?.[name], `Missing direct dependency: ${name}`); return [name, packageJson[scope][name]]; }));
  put('package.json', jsonBytes(projectedPackage), true);
  put('pnpm-lock.yaml', Buffer.from(projectLock(originalLock.toString(), projectedPackage)), true);
  // Keep the exact patch settings, but no unrelated workspace package or lifecycle hook.
  assert(workspaceText.includes('\nallowBuilds:\n  esbuild: true\n\npatchedDependencies:\n'), 'Review changed workspace lifecycle/patch settings');
  const patches = workspaceText.slice(workspaceText.indexOf('patchedDependencies:\n'));
  assert(/^patchedDependencies:\n(?:  '@recast-navigation\/(?:core|generators)@0\.43\.1': patches\/@recast-navigation__(?:core|generators)@0\.43\.1\.patch\n?){2}$/.test(patches.trimEnd() + '\n'), 'Review changed patch allowlist');
  put('pnpm-workspace.yaml', Buffer.from('packages:\n  - "packages/three-world"\n  - "packages/camera-collision"\n\nallowBuilds:\n  esbuild: true\n\n' + patches), true);
  source('packages/three-world/package.json', true);
  source('packages/camera-collision/package.json', true);
  source('patches/@recast-navigation__core@0.43.1.patch', true);
  source('patches/@recast-navigation__generators@0.43.1.patch', true);
  // Tool execution gets a small standalone tsconfig, without Native workspace globals.
  put('tsconfig.json', jsonBytes({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true, resolveJsonModule: true, useDefineForClassFields: true, noEmit: true, lib: ['ESNext', 'DOM', 'DOM.Iterable'] } }));
  source('config/three-creator/asset-policy.json');
  source('assets/three-creator/asset-catalog.json');
  for (const relative of SOURCE_TREES) tree(relative);
  const catalog = JSON.parse(readFileSync(path.join(sourceRoot, 'assets/three-creator/asset-catalog.json'), 'utf8'));
  assert.equal(catalog.schemaVersion, 1); assert(Array.isArray(catalog.assets));
  for (const asset of catalog.assets) {
    for (const resource of [asset, ...(asset.resources ?? [])]) {
      assert(/^assets\/three-creator\/[a-zA-Z0-9_./-]+\.(?:glb|json|bin|png|jpg|webp|md|txt)$/.test(resource.sourcePath)
        && !resource.sourcePath.split('/').includes('..'), `Asset outside resource allowlist: ${asset.id}`);
      assert(/^[a-f0-9]{64}$/.test(resource.sha256)); source(resource.sourcePath);
      const record = files.get(resource.sourcePath);
      assert.equal(record.sha256, `sha256:${resource.sha256}`, `Asset SHA mismatch: ${asset.id}`);
      assert.equal(record.bytes, resource.byteLength, `Asset length mismatch: ${asset.id}`);
    }
  }
  const entries = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  const manifest = {
    kind: 'worldkit-three-creator-source', schemaVersion: 1, status: 'staged-unfrozen',
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim(),
    sourceHash: sha256(JSON.stringify(entries)), files: entries,
    originalManifests: { packageJsonSha256: sha256(originalPackage), pnpmLockSha256: sha256(originalLock), pnpmWorkspaceSha256: sha256(originalWorkspace) },
    policy: 'Explicit Three source and hash-checked raw GLB closure. Lock importer projection preserves resolution and integrity records. No Native authoring/runtime source, host node_modules, credentials, environment files or personal config.',
  };
  writeJson(path.join(sourceRoot, 'source-manifest.json'), manifest);
  for (const relative of ['Dockerfile', 'doctor.mjs']) copyFileSync(path.join(repositoryRoot, 'deploy/three-creator-runtime', relative), path.join(contextRoot, relative));
  copyFileSync(fileURLToPath(import.meta.url), path.join(contextRoot, 'three-capsule.mjs'));
  writeFileSync(path.join(contextRoot, '.dockerignore'), '**/.env*\n**/auth.json\n**/credentials\n**/.aws\n**/.npmrc\n**/.git\n**/.codex\n**/node_modules\n');
  const dependencyInputs = walk(manifestsRoot).map(file => ({ path: path.relative(manifestsRoot, file).split(path.sep).join('/'), sha256: sha256(readFileSync(file)) }));
  const report = { kind: 'worldkit-three-capsule-stage', schemaVersion: 1, status: 'staged-unfrozen', contextRoot, sourceHash: manifest.sourceHash, dependencyHash: sha256(JSON.stringify(dependencyInputs)), fileCount: entries.length, assetCount: catalog.assets.length, nodeBinary: 'toolkit/runtime/bin/node', toolkitRoot: 'toolkit/sdk', remoteStaged: false };
  writeJson(path.join(outputRoot, 'stage-report.json'), report); return report;
}

export function auditCapsule(capsuleRoot) {
  capsuleRoot = realpathSync(capsuleRoot);
  const sdkRoot = path.join(capsuleRoot, 'sdk'), entries = []; let relocatedShimCount = 0, elfCount = 0, maximumRequiredGlibcMinor = 0;
  for (const file of walk(capsuleRoot)) {
    const relative = path.relative(capsuleRoot, file).split(path.sep).join('/');
    assert(!relative.includes('node_modules/.pnpm/@babylonjs+') && !relative.includes('node_modules/.pnpm/@whitebox-world+'), `Native dependency present: ${relative}`);
    if (relative === 'content-manifest.json') continue;
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(file); assert(!path.isAbsolute(target), `Absolute symlink: ${relative}`); assert(within(capsuleRoot, realpathSync(file)), `Escaping symlink: ${relative}`);
      entries.push({ path: relative, kind: 'symlink', target }); continue;
    }
    assert(stat.isFile(), `Unsupported capsule entry: ${relative}`);
    if (file.includes('/node_modules/.bin/')) {
      const original = readFileSync(file, 'utf8');
      if (original.startsWith('#!/bin/sh') && original.includes('/opt/three-creator-toolkit/sdk')) {
        writeFileSync(file, original.replaceAll('/opt/three-creator-toolkit/sdk', `\${basedir}/${path.posix.relative(path.posix.dirname(file), sdkRoot)}`));
        chmodSync(file, 0o755); relocatedShimCount += 1;
      }
      assert(!readFileSync(file, 'utf8').includes('/opt/three-creator-toolkit/sdk'), `Nonrelocatable shim: ${relative}`);
    }
    const bytes = readFileSync(file);
    if (bytes.length > 20 && bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
      assert.equal(bytes[4], 2, `Non-64bit ELF: ${relative}`); assert.equal(bytes[5], 1, `Non-little-endian ELF: ${relative}`); assert.equal(bytes.readUInt16LE(18), 62, `Non-x64 ELF: ${relative}`);
      for (const match of bytes.toString('latin1').matchAll(/GLIBC_(\d+)\.(\d+)/g)) { assert(Number(match[1]) === 2 && Number(match[2]) <= 35, `Newer than Jammy glibc 2.35: ${relative} ${match[0]}`); maximumRequiredGlibcMinor = Math.max(maximumRequiredGlibcMinor, Number(match[2])); }
      elfCount += 1;
    }
    entries.push({ path: relative, kind: 'file', bytes: bytes.length, sha256: sha256(bytes), mode: lstatSync(file).mode & 0o777 });
  }
  return { entries, relocatedShimCount, elfCount, maximumRequiredGlibc: `2.${maximumRequiredGlibcMinor}` };
}

function finalizeInside(capsuleRoot, expectedSourceHash) {
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64'); assert.equal(process.version, 'v20.20.2');
  const sdkRoot = path.join(capsuleRoot, 'sdk');
  const sourceManifest = JSON.parse(readFileSync(path.join(sdkRoot, 'source-manifest.json'), 'utf8'));
  assert.equal(sourceManifest.sourceHash, expectedSourceHash, 'Frozen source identity mismatch');
  for (const file of sourceManifest.files) assert.equal(sha256(readFileSync(path.join(sdkRoot, file.path))), file.sha256, `Staged source changed: ${file.path}`);
  // T4 owns this fixed entry and its pin contract. Build fails closed until it exists.
  const prebuild = path.join(sdkRoot, 'scripts/three-creator/prebuild.ts');
  assert(existsSync(prebuild), 'THREE_PREBUILD_CONTRACT_PENDING: fixed scripts/three-creator/prebuild.ts is required');
  const environment = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', TSX_DISABLE_CACHE: '1', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1', NODE_OPTIONS: '--max-old-space-size=3072' };
  const prebuiltRuntimeByProfile = {};
  for (const profile of ['three-raw', 'three-sdk']) {
    const profileRoot = path.join(capsuleRoot, 'prebuilt', profile);
    const output = execFileSync(process.execPath, ['--import', path.join(sdkRoot, 'node_modules/tsx/dist/loader.mjs'), prebuild, '--profile', profile, '--output', profileRoot], { cwd: sdkRoot, env: environment, timeout: 300000, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const result = JSON.parse(output.trim());
    const manifestPath = path.join(profileRoot, 'runtime-manifest.json');
    assert.equal(result.profile, profile); assert.equal(result.root, profileRoot);
    assert.equal(`sha256:${result.manifestSha256}`, sha256(readFileSync(manifestPath)), `Prebuilt manifest SHA mismatch: ${profile}`);
    assert(/^[a-f0-9]{64}$/.test(result.runtimeHash));
    prebuiltRuntimeByProfile[profile] = { root: `prebuilt/${profile}`, manifestPath: `prebuilt/${profile}/runtime-manifest.json`, manifestSha256: result.manifestSha256, runtimeHash: result.runtimeHash };
  }
  run(process.execPath, ['/tmp/three-creator-doctor.mjs', '--compile', '--capsule-root', capsuleRoot], { cwd: sdkRoot, env: environment, timeout: 300000 });
  writeFileSync(path.join(capsuleRoot, 'activate.sh'), '# Set WORLDKIT_THREE_CAPSULE_ROOT before sourcing.\n: "${WORLDKIT_THREE_CAPSULE_ROOT:?Set capsule root}"\nexport WORLDKIT_TOOLKIT_ROOT="$WORLDKIT_THREE_CAPSULE_ROOT/sdk"\nexport PATH="$WORLDKIT_THREE_CAPSULE_ROOT/runtime/bin:$WORLDKIT_TOOLKIT_ROOT/node_modules/.bin:$PATH"\n');
  const audit = auditCapsule(capsuleRoot);
  const manifest = { kind: 'worldkit-three-creator-capsule', schemaVersion: 1, status: 'built-cloud-doctor-required', runtime: { nodeVersion: process.version, platform: process.platform, architecture: process.arch, sourceImage: NODE_SOURCE_IMAGE }, nodeBinary: 'runtime/bin/node', toolkitRoot: 'sdk', sourceHash: expectedSourceHash, sourceManifestSha256: sha256(readFileSync(path.join(sdkRoot, 'source-manifest.json'))), prebuiltRuntimeByProfile, browserIncluded: false, ...audit, note: 'Manifest excludes itself. Source identity is frozen; browser/FSx/cloud acceptance is separate. Profile manifestSha256/runtimeHash fields are plain hex to match the trusted Three tool pin contract.' };
  writeJson(path.join(capsuleRoot, 'content-manifest.json'), manifest);
}

async function main() {
  const args = process.argv.slice(2), option = (name, fallback) => { const index = args.indexOf(name); if (index < 0) return fallback; assert(args[index + 1] && !args[index + 1].startsWith('--'), `Missing ${name}`); return args[index + 1]; };
  if (args.includes('--inside-container')) { finalizeInside(path.resolve(option('--capsule-root', '/opt/three-creator-toolkit')), option('--expected-source-hash')); return; }
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const allowedRoot = path.join(repositoryRoot, '.codex-tmp/three-creator-capsule');
  const outputRoot = path.resolve(option('--output-root', allowedRoot));
  assert(outputRoot === allowedRoot || within(allowedRoot, outputRoot), 'Output must remain in the dedicated Three capsule directory');
  assert(!(args.includes('--build') && args.includes('--dependencies-only')), 'Choose one build mode');
  const stage = stageContext(repositoryRoot, outputRoot); console.log(JSON.stringify(stage));
  if (!args.includes('--build') && !args.includes('--dependencies-only')) return;
  const dependencyOnly = args.includes('--dependencies-only'), expectedSourceHash = option('--expected-source-hash');
  if (!dependencyOnly) { assert(/^sha256:[a-f0-9]{64}$/.test(expectedSourceHash ?? ''), '--build requires a reviewed --expected-source-hash'); assert.equal(stage.sourceHash, expectedSourceHash, 'Live sources differ from the frozen hash; build refused'); }
  const exportRoot = path.join(outputRoot, dependencyOnly ? 'dependency-export' : `export-${expectedSourceHash.slice(7, 19)}`);
  assert(!existsSync(exportRoot), 'Export destination already exists; preserve immutable prior output and choose a new output root');
  run('docker', ['buildx', 'build', '--platform', 'linux/amd64', '--progress', 'plain', '--target', dependencyOnly ? 'dependency-report' : 'capsule', '--build-arg', `EXPECTED_SOURCE_HASH=${expectedSourceHash ?? ''}`, '--output', `type=local,dest=${exportRoot}`, stage.contextRoot], { timeout: dependencyOnly ? 900000 : 1200000 });
  const report = { kind: 'worldkit-three-capsule-build', schemaVersion: 1, status: dependencyOnly ? 'dependencies-prepared-source-unfrozen' : 'built-cloud-doctor-required', sourceHash: stage.sourceHash, dependencyHash: stage.dependencyHash, exportRoot, remoteStaged: false };
  if (dependencyOnly) {
    report.doctor = JSON.parse(readFileSync(path.join(exportRoot, 'dependency-doctor.json'), 'utf8'));
    const audit = JSON.parse(readFileSync(path.join(exportRoot, 'dependency-audit.json'), 'utf8'));
    report.audit = { fileCount: audit.entries.length, elfCount: audit.elfCount, maximumRequiredGlibc: audit.maximumRequiredGlibc, relocatedShimCount: audit.relocatedShimCount, manifestSha256: sha256(readFileSync(path.join(exportRoot, 'dependency-audit.json'))) };
  }
  else {
    const archivePath = path.join(exportRoot, 'three-creator-toolkit.tar.gz'), manifestPath = path.join(exportRoot, 'toolkit/content-manifest.json');
    Object.assign(report, { archivePath, archiveSha256: sha256(readFileSync(archivePath)), archiveBytes: lstatSync(archivePath).size, manifestPath, manifestSha256: sha256(readFileSync(manifestPath)), nodeBinary: path.join(exportRoot, 'toolkit/runtime/bin/node'), toolkitRoot: path.join(exportRoot, 'toolkit/sdk'), prebuiltRuntimeByProfile: JSON.parse(readFileSync(manifestPath, 'utf8')).prebuiltRuntimeByProfile, doctor: JSON.parse(readFileSync(path.join(exportRoot, 'toolkit/doctor.json'), 'utf8')) });
  }
  writeJson(path.join(outputRoot, dependencyOnly ? 'dependency-build-report.json' : 'build-report.json'), report); console.log(JSON.stringify(report));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.stack ?? String(error)); process.exitCode = 1; });
