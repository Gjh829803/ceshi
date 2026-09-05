import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ThreeCompiler, hashTree } from './compiler.js';
import { sha256 } from './contracts.js';
import { ThreeCreatorTools, createClosedArchive, assertSdkPlaytestRunning } from './tools.js';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { executeThreeCreatorTool } from './mcp.js';
import * as THREE from 'three';
import { targetTriviewBasis } from '../../apps/three-creator-playground/bridge.js';

const roots: string[] = [];
async function fixture(source = `import * as THREE from 'three'; window.authorScene = new THREE.Scene(); document.title = 'ordinary browser APIs work';`) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'three-creator-test-')); roots.push(root);
  await writeFile(path.join(root, 'index.html'), '<html><head></head><body><script type="module" src="./main.ts"></script></body></html>');
  await writeFile(path.join(root, 'main.ts'), source); return root;
}
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
describe('Three semantic target views', () => {
  it('uses local -Z front and +X right at zero semantic yaw', () => {
    const basis = targetTriviewBasis(new THREE.Group());
    expect(basis.front.toArray()).toEqual([0, 0, -1]); expect(basis.right.toArray()).toEqual([1, -0, 0]); expect(basis.back.toArray()).toEqual([-0, -0, 1]);
  });
  it('keeps asymmetric object front/right correct after semantic yaw and parent pitch/roll/yaw', () => {
    const parent = new THREE.Group(); parent.rotation.set(-0.28, 0.91, 0.19);
    const object = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.6)); object.rotation.set(0.23, -0.37, -0.16); object.position.set(4, 2, -3); parent.add(object);
    const angle = 0.67, basis = targetTriviewBasis(object, angle), origin = object.localToWorld(new THREE.Vector3());
    // Independent scene-matrix projections of known local front/right markers.
    const frontMarker = object.localToWorld(new THREE.Vector3(-Math.sin(angle), 0, -Math.cos(angle)));
    const rightMarker = object.localToWorld(new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle)));
    expect(basis.front.distanceTo(frontMarker.clone().sub(origin).normalize())).toBeLessThan(1e-10);
    expect(basis.right.distanceTo(rightMarker.clone().sub(origin).normalize())).toBeLessThan(1e-10);
    for (const [direction, marker] of [[basis.front, frontMarker], [basis.right, rightMarker]] as const) {
      const camera = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.01, 20); camera.position.copy(origin).addScaledVector(direction, 5); camera.up.copy(basis.up); camera.lookAt(origin); camera.updateMatrixWorld(true);
      const projectedMarker = marker.clone().project(camera), projectedOrigin = origin.clone().project(camera);
      expect(Math.abs(projectedMarker.x)).toBeLessThan(1e-10); expect(Math.abs(projectedMarker.y)).toBeLessThan(1e-10); expect(projectedMarker.z).toBeLessThan(projectedOrigin.z);
    }
  });
});
describe('Three browser candidate identity and admission', () => {
  it('keeps native browser APIs and caches runtime; episode-only edits do not rebuild, helper edits do', async () => {
    const root = await fixture(`import * as THREE from 'three'; import { color } from './colors'; window.authorScene = new THREE.Scene(); document.title = color;`);
    await writeFile(path.join(root, 'colors.ts'), `export const color = 'orange';`);
    const compiler = new ThreeCompiler(root, 'three-raw'), first = await compiler.prepare();
    await writeFile(path.join(root, 'episode.json'), JSON.stringify({ schemaVersion: 1, steps: [{ keysDown: ['w'], durationSeconds: 2 }], targets: [] }));
    const second = await compiler.prepare(); expect(second.worldBuildHash).toBe(first.worldBuildHash); expect(second.candidateCacheHit).toBe(true); expect(second.runtimeCacheHit).toBe(true);
    await writeFile(path.join(root, 'colors.ts'), `export const color = 'purple';`);
    const third = await compiler.prepare(); expect(third.worldBuildHash).not.toBe(first.worldBuildHash); expect(third.runtimeHash).toBe(first.runtimeHash); expect(third.runtimeCacheHit).toBe(true);
    const bundle = await readFile(path.join(third.playableRoot, 'compiled/entry-0.js'), 'utf8'); expect(bundle).toContain('window.authorScene'); expect(bundle).not.toContain('class WebGLRenderer');
  });
  it.each(['node:fs', '@worldkit/three', 'https://example.com/evil.js'])('rejects non-profile module %s without executing it', async specifier => {
    const root = await fixture(`import anything from '${specifier}'; console.log(anything);`);
    await expect(new ThreeCompiler(root, 'three-raw').prepare()).rejects.toThrow(/THREE_IMPORT_NOT_ALLOWED/);
  });
  it('rejects source symlinks and relative imports escaping the snapshot', async () => {
    const root = await fixture(`import '../outside.js';`); await expect(new ThreeCompiler(root, 'three-raw').prepare()).rejects.toThrow(/THREE_IMPORT_PATH_ESCAPE/);
    await writeFile(path.join(root, 'main.ts'), 'console.log(1)'); await symlink(path.join(root, 'main.ts'), path.join(root, 'copy.ts'));
    await expect(new ThreeCompiler(root, 'three-raw').prepare()).rejects.toThrow(/THREE_SOURCE_SYMLINK/);
  });
  it('refuses changed cached browser bytes instead of accepting stale source identity', async () => {
    const root = await fixture(), compiler = new ThreeCompiler(root, 'three-raw'), candidate = await compiler.prepare();
    await writeFile(path.join(candidate.playableRoot, 'compiled/entry-0.js'), 'console.log("forged");');
    await expect(compiler.prepare()).rejects.toThrow(/THREE_ARTIFACT_CHANGED/);
  });
  it('links author CSS emitted by ordinary JavaScript imports', async () => {
    const root = await fixture(`import './style.css'; document.title = 'css';`); await writeFile(path.join(root, 'style.css'), 'body { background: purple; }');
    const candidate = await new ThreeCompiler(root, 'three-raw').prepare(); expect(await readFile(path.join(candidate.playableRoot, 'index.html'), 'utf8')).toContain('href="./compiled/entry-0.css"');
  });
  it('does not trust a runtime cache produced by another service session', async () => {
    const root = await fixture(), first = await new ThreeCompiler(root, 'three-raw').prepare();
    const cacheDirectory = (await readdir(path.join(root, '.three-creator/runtime')))[0]!;
    const runtime = path.join(root, '.three-creator/runtime', cacheDirectory, 'three.js'); await writeFile(runtime, 'forged runtime');
    const second = await new ThreeCompiler(root, 'three-raw').prepare(); expect(second.runtimeCacheHit).toBe(false); expect(await readFile(path.join(second.playableRoot, 'runtime/three.js'), 'utf8')).not.toBe('forged runtime');
  });
  it('accepts an exact Host-pinned prebuilt runtime and rejects changed bytes', async () => {
    const root = await fixture(), compiler = new ThreeCompiler(root, 'three-raw'), runtime = await compiler.prepareRuntime();
    const prebuilt = await mkdtemp(path.join(os.tmpdir(), 'three-prebuilt-test-')); roots.push(prebuilt);
    const { cp } = await import('node:fs/promises'); await cp(runtime.root, path.join(prebuilt, 'runtime'), { recursive: true });
    const manifest = JSON.stringify({ schemaVersion: 1, profile: 'three-raw', cacheIdentity: runtime.cacheIdentity, runtimeHash: runtime.hash, files: await hashTree(runtime.root) }); await writeFile(path.join(prebuilt, 'runtime-manifest.json'), manifest);
    vi.stubEnv('WORLDKIT_THREE_PREBUILT_RUNTIME_ROOT', prebuilt); vi.stubEnv('WORLDKIT_THREE_PREBUILT_RUNTIME_MANIFEST_SHA256', sha256(manifest));
    const candidate = await new ThreeCompiler(root, 'three-raw').prepare(); expect(candidate.runtimeCacheHit).toBe(true); expect(candidate.runtimeHash).toBe(runtime.hash);
    await writeFile(path.join(prebuilt, 'runtime/three.js'), 'forged'); await expect(new ThreeCompiler(root, 'three-raw').prepare()).rejects.toThrow(/THREE_ARTIFACT_CHANGED/);
  });
  it('rejects an output directory symlink before building or writing outside the workspace', async () => {
    const root = await fixture(), outside = await fixture(); await symlink(outside, path.join(root, '.three-creator'));
    await expect(new ThreeCompiler(root, 'three-raw').prepare()).rejects.toThrow(/THREE_SYMLINK_REJECTED/);
    expect(await readdir(outside)).toEqual(['index.html', 'main.ts']);
  });
});
describe('Three tool operations and truthful submission', () => {
  it('fails fast when the real SDK snapshot says stopped and retains its original runtime errors', () => {
    expect(() => assertSdkPlaytestRunning('three-sdk', { isRunning: false, simulationTick: 0, errors: [{ code: 'WORLD_FRAME_FAILED', message: 'original clock failure' }] })).toThrow(/THREE_PLAYTEST_RUNTIME_STOPPED.*WORLD_FRAME_FAILED.*original clock failure/);
    expect(() => assertSdkPlaytestRunning('three-sdk', { isRunning: true, simulationTick: 12, errors: [] })).not.toThrow();
  });
  it('does not fabricate SDK running state for raw worlds or missing optional observations', () => {
    expect(() => assertSdkPlaytestRunning('three-raw', { isRunning: false })).not.toThrow();
    expect(() => assertSdkPlaytestRunning('three-sdk', { isRunning: null })).not.toThrow();
  });
  it('shows raw authors only the common observation contract, without SDK construction APIs', async () => {
    const root = await fixture(), service = new ThreeCreatorTools(root, 'three-raw'), schema = await service.schema();
    expect(schema.observation).toContain('interface WorldObservation'); expect(schema.observation).toContain('targetFrontYawRadiansById'); expect(schema.observation).toContain('startLive()');
    expect(schema.observation).not.toMatch(/PhysicsPort|WorldCommand|WorldSnapshot|addCharacter|createWorld/); expect(schema).not.toHaveProperty('sdkGuide'); expect(schema).not.toHaveProperty('sdkContracts');
    await service.close();
  });
  it('adds the actual SDK public guide and contracts only to the SDK profile', async () => {
    const root = await fixture(), raw = new ThreeCreatorTools(root, 'three-raw'), sdk = new ThreeCreatorTools(root, 'three-sdk');
    const rawSchema = await raw.schema(), sdkSchema = await sdk.schema();
    expect(sdkSchema.observation).toBe(rawSchema.observation); expect(sdkSchema.sdkGuide).toContain('createWorld'); expect(sdkSchema.sdkGuide).toContain('world.registerPrototype'); expect(sdkSchema.sdkGuide).toContain('targetEntityIds'); expect(sdkSchema.sdkGuide).toContain("'./asset-definitions.json'"); expect(sdkSchema.sdkContracts).toContain('WorldCommand'); expect(sdkSchema.sdkContracts).toContain('CharacterEntityOptions');
    await raw.close(); await sdk.close();
  });
  it('archives only payload files, excluding macOS AppleDouble metadata and symlinks', async () => {
    const root = await fixture(), payload = path.join(root, 'payload'); await mkdir(payload); await writeFile(path.join(payload, 'hello.txt'), 'hello'); const execFile = promisify(execFileCallback);
    if (process.platform === 'darwin') await execFile('xattr', ['-w', 'com.apple.metadata:three-creator-test', 'test', payload]);
    const archive = path.join(root, 'result.tar.gz'); await createClosedArchive(root, archive); const members = (await execFile('tar', ['-tzf', archive])).stdout.trim().split('\n'); expect(members.map(name => name.replace(/\/$/, '')).sort()).toEqual(['payload', 'payload/hello.txt']);
    await symlink(path.join(root, 'main.ts'), path.join(payload, 'evil')); await expect(createClosedArchive(root, archive)).rejects.toThrow(/THREE_SYMLINK_REJECTED/);
  });
  it('rejects NaN tool arguments and unknown forged disk operations', async () => {
    const root = await fixture(), service = new ThreeCreatorTools(root, 'three-raw');
    await expect(executeThreeCreatorTool(service, 'world_playtest', { durationSeconds: NaN })).rejects.toThrow(/THREE_TOOL_INPUT_INVALID/);
    await mkdir(path.join(service.evidenceRoot, 'operations'), { recursive: true }); await writeFile(path.join(service.evidenceRoot, 'operations/fake.json'), '{"id":"fake","status":"succeeded"}');
    await expect(service.getOperation('fake')).rejects.toThrow(/THREE_OPERATION_UNKNOWN/); await service.close();
  });
  it('serializes operations and cancelling a queued operation does not cancel the active one', async () => {
    const root = await fixture(), service = new ThreeCreatorTools(root, 'three-raw'); let release!: () => void; let queuedRan = false;
    const first = service.start('first', () => new Promise(resolve => { release = () => resolve('ok'); }));
    const second = service.start('second', async () => { queuedRan = true; return 'bad'; });
    await new Promise(resolve => setTimeout(resolve, 10)); await service.cancel(second.operationId); release();
    expect((await service.getOperation(first.operationId, 1)).status).toBe('succeeded'); expect((await service.getOperation(second.operationId, 1)).status).toBe('cancelled'); expect(queuedRan).toBe(false); await service.close();
  });
  it('refuses fabricated disk playtest receipts in a fresh service', async () => {
    const root = await fixture(); await writeFile(path.join(root, 'episode.json'), JSON.stringify({ schemaVersion: 1, steps: [{ keysDown: ['w'], durationSeconds: 180 }], targets: [] }));
    const service = new ThreeCreatorTools(root, 'three-raw'); await mkdir(service.evidenceRoot, { recursive: true }); await writeFile(path.join(service.evidenceRoot, 'playtest.json'), '{"status":"passed","actualWallSeconds":180,"capturedInput":true}');
    await expect(service.submit()).rejects.toThrow(/THREE_SUBMIT_PLAYTEST_REQUIRED/); await service.close();
  });
});
