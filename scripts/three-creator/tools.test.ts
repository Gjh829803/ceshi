import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ThreeCompiler, hashTree } from './compiler.js';
import Ajv from 'ajv';
import ts from 'typescript';
import { WORLD_COMMAND_SCHEMA } from './command-schema.js';
import { publicContractTopic } from './authoring-schema.js';
import { EPISODE_SCHEMA, sha256 } from './contracts.js';
import { ThreeCreatorTools, createClosedArchive, encodePlaytestVideo, assertSdkPlaytestRunning, assertSdkObservationVersion, resolvePlaytestBudget, validateCaptureTiming, hasMinimumRecordedPlay, withStageDeadline, playtestSubmissionReadiness } from './tools.js';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { executeThreeCreatorTool, toolContent } from './mcp.js';
import * as THREE from 'three';
import type { WorldObservation } from '@worldkit/three';
import { cameraPreviewDelta, observeCameraPreview, projectedPlayerBounds, targetTriviewBasis, type CameraPreviewSample } from '../../apps/three-creator-playground/bridge.js';

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
describe('short preview camera evidence', () => {
  const sample = (wallSeconds: number, angle: number, distance = 0): CameraPreviewSample => ({ renderIndex: Math.round(wallSeconds * 60), wallSeconds,
    positionWorldMetersXYZ: [distance, 0, 0], orientationWorldQuaternionXYZW: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle).toArray(), playerBounds: null });
  it('measures the actual elapsed wall interval, handles quaternion signs and never divides by zero', () => {
    const before = sample(2, 0), after = sample(2 + 1 / 60, Math.PI / 18, 0.5);
    const fast = cameraPreviewDelta(before, after);
    expect(fast.angularStepRadians).toBeCloseTo(Math.PI / 18); expect(fast.positionSpeedMetersPerSecond).toBeCloseTo(30);
    expect(fast.signals).toEqual(['large-angular-step', 'large-position-step']);
    expect(cameraPreviewDelta(before, { ...after, wallSeconds: 2.5 }).signals).toEqual([]);
    expect(cameraPreviewDelta(before, { ...after, wallSeconds: 2 }).angularSpeedRadiansPerSecond).toBeNull();
    expect(cameraPreviewDelta(after, { ...after, wallSeconds: 3, orientationWorldQuaternionXYZW: after.orientationWorldQuaternionXYZW.map(value => -value) }).angularStepRadians).toBeCloseTo(0);
    for (const hz of [30, 60, 120]) expect(cameraPreviewDelta(sample(0, 0), sample(1 / hz, 0.8 / hz, 5 / hz)).signals).toEqual([]);
  });
  it('projects parented player and camera world bounds and marks near-plane overlap without infinite UVs', () => {
    const parent = new THREE.Group(); parent.position.set(7, 2, -3); parent.rotation.y = 0.8;
    const player = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1)); player.position.y = 1; parent.add(player);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100); parent.add(camera); camera.position.set(0, 1, 6);
    const bounds = projectedPlayerBounds(player, camera)!;
    expect(bounds.isFullyInsideViewport).toBe(true); expect(bounds.minimumMetersXYZ[0]).toBeGreaterThan(6);
    player.position.x = 20; expect(projectedPlayerBounds(player, camera)!.isFullyInsideViewport).toBe(false);
    player.position.set(0, 1, 6); const clipped = projectedPlayerBounds(player, camera)!;
    expect(clipped.isFullyInFrontOfCamera).toBe(false); expect(clipped.minimumUv).toBeNull(); expect(clipped.maximumUv).toBeNull();
  });
  it('observes actual primary renders, bounds captures, restores the renderer and isolates evidence failures', () => {
    const scene = new THREE.Scene(), player = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1)), camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 6; scene.add(player); const cameraParent = new THREE.Group(); cameraParent.rotation.y = 0.1; cameraParent.add(camera); scene.add(cameraParent);
    const render = vi.fn(), toDataURL = vi.fn(() => 'data:image/png;base64,actual-canvas'), getRenderTarget = vi.fn((): object | null => null);
    const renderer = { render, domElement: { toDataURL }, getRenderTarget } as unknown as THREE.WebGLRenderer;
    const world = { scene, player, camera, renderer, snapshot: vi.fn(() => { throw new Error('optional snapshot unavailable'); }) } as unknown as WorldObservation;
    const observation = observeCameraPreview(world);
    renderer.render(scene, new THREE.Camera());
    getRenderTarget.mockReturnValueOnce({}); renderer.render(scene, camera);
    cameraParent.rotation.y += 1; renderer.render(scene, camera);
    cameraParent.rotation.y += 1; renderer.render(scene, camera);
    const result = observation.finish();
    expect(render).toHaveBeenCalledTimes(5); expect(renderer.render).toBe(render); expect(result.observedRenderCount).toBe(3);
    expect(result.samples[0]!.orientationWorldQuaternionXYZW[1]).toBeCloseTo(Math.sin(0.1 / 2));
    expect(result.keyframes).toHaveLength(2); expect(toDataURL).toHaveBeenCalledTimes(2);
    expect(result.warnings).toContain('Error: optional snapshot unavailable'); expect(result.informationalOnly).toBe(true);
    toDataURL.mockImplementation(() => { throw new Error('canvas unavailable'); });
    const second = observeCameraPreview(world); cameraParent.rotation.y += 1; expect(() => renderer.render(scene, camera)).not.toThrow();
    expect(second.finish().warnings).toContain('Error: canvas unavailable'); expect(renderer.render).toBe(render);
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
  it('identifies source drift separately from a passing complete recording instead of suggesting another identical long test', () => {
    const report = { status: 'passed', isCompleteEpisode: true, capturedInput: true, actualWallSeconds: 184, inputWallSeconds: 180.008, activePlaySeconds: 180.004, videoMetadata: { durationSeconds: 183.367 }, worldBuildHash: 'recorded-world', episodeHash: 'unchanged-episode' };
    expect(playtestSubmissionReadiness(report, { worldBuildHash: 'recorded-world', episodeHash: 'unchanged-episode' })).toEqual({ eligible: true, issues: [] });
    expect(playtestSubmissionReadiness(report, { worldBuildHash: 'changed-world', episodeHash: 'unchanged-episode' })).toEqual({ eligible: false, issues: [{ code: 'WORLD_SOURCE_CHANGED_AFTER_PLAYTEST', actual: 'recorded-world', required: 'changed-world' }] });
    const changedEpisode = playtestSubmissionReadiness(report, { worldBuildHash: 'recorded-world', episodeHash: 'changed-episode' });
    expect(changedEpisode.issues.map(issue => issue.code)).toEqual(['EPISODE_CHANGED_AFTER_PLAYTEST']);
  });
  it('keeps actual short, missing and incomplete playtests ineligible and reports the precise missing evidence', () => {
    const current = { worldBuildHash: 'world', episodeHash: 'episode' };
    expect(playtestSubmissionReadiness(undefined, current).issues).toEqual([{ code: 'NO_PLAYTEST_IN_THIS_SERVICE_SESSION' }]);
    const result = playtestSubmissionReadiness({ status: 'passed', isCompleteEpisode: false, capturedInput: true, actualWallSeconds: 183, inputWallSeconds: 181, activePlaySeconds: 179.999, videoMetadata: { durationSeconds: 182 }, ...current }, current);
    expect(result.eligible).toBe(false);
    expect(result.issues).toEqual([{ code: 'INCOMPLETE_EPISODE', actual: false, required: true }, { code: 'RECORDED_DURATION_INSUFFICIENT', field: 'activePlaySeconds', actual: 179.999, required: 180 }]);
  });
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
    expect(sdkSchema.observation).toBe(rawSchema.observation); expect(sdkSchema.sdkGuide).toContain('createWorld'); expect(sdkSchema.sdkGuide).toContain('setCaptureTargets'); expect(sdkSchema.sdkGuide).toContain("'./asset-definitions.json'"); expect(sdkSchema.sdkContracts).toContain('CharacterOptions'); expect(sdkSchema.sdkContracts).not.toContain('WorldEngine');
    const extensions = await sdk.schema('extensions'); expect(extensions.sdkContracts).toContain('registerMovement'); expect(extensions.sdkGuide).toContain('flight navigation'); expect(extensions.sdkContracts).toContain('GeometryDefinition'); expect(sdkSchema.sdkContracts).not.toContain('MovementDefinition');
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
    await expect(service.submit()).rejects.toThrow(/THREE_SUBMIT_PREVIEW_REQUIRED/); await service.close();
  });
});


describe('v2 command and discovery boundary', () => {
  it('does not label a legacy or missing SDK snapshot as v2, while raw remains minimal', () => {
    expect(() => assertSdkObservationVersion('three-sdk', 2)).not.toThrow();
    expect(() => assertSdkObservationVersion('three-sdk', 1)).toThrow('THREE_SDK_OBSERVATION_VERSION_MISMATCH');
    expect(() => assertSdkObservationVersion('three-sdk', null)).toThrow('THREE_SDK_OBSERVATION_VERSION_MISMATCH');
    expect(() => assertSdkObservationVersion('three-raw', null)).not.toThrow();
  });
  it('covers every declared World command discriminator and rejects old dialect/extra authority/NaN', async () => {
    const source = await readFile('packages/three-world/src/contracts.ts', 'utf8');
    const file = ts.createSourceFile('contracts.ts', source, ts.ScriptTarget.Latest, true);
    const types: string[] = [];
    const visit = (node: ts.Node) => { if (ts.isPropertySignature(node) && node.name.getText(file) === 'type' && node.type && ts.isLiteralTypeNode(node.type) && ts.isStringLiteral(node.type.literal)) types.push(node.type.literal.text); ts.forEachChild(node, visit); };
    for (const node of file.statements) if (ts.isTypeAliasDeclaration(node) && ['PrimitiveCommand','ParameterCommand','WorldCommand'].includes(node.name.text)) visit(node);
    expect(WORLD_COMMAND_SCHEMA.oneOf.map(schema => (schema.properties.type as {const:string}).const).sort()).toEqual(types.sort());
    const check = new Ajv({ strict:false, strictNumbers:true }).compile(WORLD_COMMAND_SCHEMA);
    for (const command of [
      {type:'entity.set-visible',entityId:'a',visible:false},
      {type:'entity.set-scale',entityId:'a',scaleLocalXYZ:[1,NaN,1]},
      {type:'actor.stop',entityId:'a',priority:100},
      {type:'action.invoke',actionId:'x',arguments:{callback:{eval:'evil'}}},
    ]) expect(check(command)).toBe(false);
    expect(check({type:'parameter.set',parameterId:'sky.mode',value:'aurora'})).toBe(true);
    expect(check({type:'entity.set-geometry',entityId:'bridge',geometryId:'long'})).toBe(true);
  });
  it('keeps input v1 unchanged and permits closed v2 lifecycle/command steps', () => {
    const check=new Ajv({strict:false,strictNumbers:true}).compile(EPISODE_SCHEMA);
    const episode={schemaVersion:2,steps:[{lifecycle:'pause',durationSeconds:.5},{lifecycle:'start',commands:[{type:'actor.stop',entityId:'npc'}],keysDown:['w'],durationSeconds:1}],targets:[]};
    expect(check(episode)).toBe(true); expect(check({...episode,schemaVersion:1})).toBe(false);
    expect(check({...episode,steps:[{commands:[{type:'eval',source:'anything'}],durationSeconds:1}]})).toBe(false);
  });
  it('keeps caller command receipt and World operation ID distinct from Creator operations', async () => {
    const root=await fixture(), service=new ThreeCreatorTools(root,'three-sdk');
    const execute=vi.spyOn(service,'executeCommand').mockResolvedValue({worldCommandReceipt:{status:'accepted',commandId:'command-1',worldRevision:4,operationId:'world-op-1'}});
    const get=vi.spyOn(service,'worldOperation').mockResolvedValue({sourceHash:'s',worldBuildHash:'w',worldOperation:{id:'world-op-1',status:'succeeded',phase:'reached'}});
    const started=await executeThreeCreatorTool(service,'world_execute_command',{command:{type:'actor.stop',entityId:'npc'}}) as {operationId:string};
    expect(started.operationId).not.toBe('world-op-1');
    const done=await service.getOperation(started.operationId,1); expect(done.result.worldCommandReceipt.operationId).toBe('world-op-1');
    const query=await executeThreeCreatorTool(service,'world_get_operation',{worldOperationId:'world-op-1'}) as {operationId:string};
    const queried=await service.getOperation(query.operationId,1); expect(queried.result.worldOperation.id).toBe('world-op-1'); expect(execute).toHaveBeenCalledTimes(1); expect(execute).toHaveBeenCalledWith({type:'actor.stop',entityId:'npc'},started.operationId); expect(get).toHaveBeenCalledWith('world-op-1',0);
    await expect(executeThreeCreatorTool(service,'world_get_operation',{operationId:'world-op-1'})).rejects.toThrow('THREE_TOOL_INPUT_INVALID'); await service.close();
  });
  it('fails closed for raw SDK commands before opening a browser', async () => {
    const root=await fixture(), service=new ThreeCreatorTools(root,'three-raw');
    await expect(service.executeCommand({type:'actor.stop',entityId:'npc'})).rejects.toThrow('THREE_WORLD_COMMANDS_UNSUPPORTED');
    await expect(service.worldOperation('invented')).rejects.toThrow('THREE_WORLD_OPERATIONS_UNSUPPORTED'); await service.close();
  });
  it('extracts public declaration dependencies with an AST despite multiline methods and nested types', () => {
    const output=publicContractTopic(`export type Vec3=readonly [number,number,number]; export interface Shape { value:Vec3 } export interface World { scene:Shape; registerMovement():void; start():Promise<void> } export interface PrivateUnused { secret:string }`, 'getting-started');
    expect(output).toContain('interface Shape'); expect(output).toContain('type Vec3'); expect(output).not.toContain('PrivateUnused'); expect(output).not.toContain('registerMovement');
  });
});


describe('real episode and video timing boundaries', () => {
 it.each([[720,405,720,406],[721,406,722,406],[721,405,722,406],[720,406,720,406]])('encodes %ix%i VFR frames as %ix%i without changing frame count, PTS or duration', async (width,height,outputWidth,outputHeight) => {
  const root=await fixture(),raw=path.join(root,'source.webm'),output=path.join(root,'playtest.mp4'),execFile=promisify(execFileCallback);
  // Four real frames with unequal timestamp gaps exercise the same WebM-to-MP4
  // encoding path as browser captures. This is synthetic local evidence only.
  await execFile('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',`testsrc=size=${width}x${height}:rate=10:duration=0.8`,'-vf',"select='eq(n,0)+eq(n,1)+eq(n,3)+eq(n,7)'",'-vsync','0','-c:v','libvpx-vp9','-lossless','1','-pix_fmt','yuv444p',raw]);
  const probe=async(file:string)=>JSON.parse((await execFile('ffprobe',['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=width,height,nb_read_frames,pix_fmt:frame=pts_time:format=duration','-of','json',file])).stdout);
  const source=await probe(raw);expect([source.streams[0].width,source.streams[0].height]).toEqual([width,height]);
  await encodePlaytestVideo(raw,output);const encoded=await probe(output);
  expect([encoded.streams[0].width,encoded.streams[0].height]).toEqual([outputWidth,outputHeight]);expect(encoded.streams[0].pix_fmt).toBe('yuv420p');
  expect(Number(source.streams[0].nb_read_frames)).toBe(4);expect(encoded.streams[0].nb_read_frames).toBe(source.streams[0].nb_read_frames);
  const sourcePts=source.frames.map((frame:{pts_time:string})=>Number(frame.pts_time)),outputPts=encoded.frames.map((frame:{pts_time:string})=>Number(frame.pts_time));
  expect(sourcePts).toEqual([0,0.1,0.3,0.7]);expect(outputPts).toEqual(sourcePts);expect(Number(encoded.format.duration)).toBe(Number(source.format.duration));
 },20_000);
 it('reserves bounded overhead for complete episodes instead of cutting off their final steps', () => {
  const full=resolvePlaytestBudget(180,180,91); expect(full.mode).toBe('full-episode'); expect(full.executionBudgetSeconds).toBeGreaterThan(180); expect(full.executionBudgetSeconds).toBeLessThanOrEqual(300);
  expect(resolvePlaytestBudget(180,undefined,91).mode).toBe('full-episode');
  expect(resolvePlaytestBudget(180,6,91).mode).toBe('debug');
  expect(resolvePlaytestBudget(6.00000000000001,6,121).mode).toBe('full-episode');
  expect(()=>resolvePlaytestBudget(180,NaN,91)).toThrow('THREE_PLAYTEST_DURATION_INVALID');
 });
 it('checks the browser input clock and actual capture boundaries, independent of report transfer time', () => {
  const input={clock:'browser-performance',startedAtMilliseconds:1000,endedAtMilliseconds:181000,durationSeconds:180};
  const capture={clock:'browser-performance',initialFrameRequestedAtMilliseconds:900,finalFrameRequestedAtMilliseconds:181100,framePeriodSeconds:1};
  expect(()=>validateCaptureTiming(input,capture,180.1)).not.toThrow();
  expect(()=>validateCaptureTiming(input,{...capture,finalFrameRequestedAtMilliseconds:180999},180.1)).toThrow('THREE_VIDEO_BOUNDARY_INVALID');
  expect(()=>validateCaptureTiming({...input,durationSeconds:185},capture,180.1)).toThrow('THREE_INPUT_CLOCK_INVALID');
  expect(()=>validateCaptureTiming(input,capture,177)).toThrow('THREE_VIDEO_DURATION_MISMATCH');
 });
 it('never accepts 179 seconds of real video or paused-only time for a full submission', () => {
  const report={actualWallSeconds:183,inputWallSeconds:181,activePlaySeconds:180.2,videoMetadata:{durationSeconds:180}};
  expect(hasMinimumRecordedPlay(report)).toBe(true);
  expect(hasMinimumRecordedPlay({...report,videoMetadata:{durationSeconds:179}})).toBe(false);
  expect(hasMinimumRecordedPlay({...report,activePlaySeconds:179})).toBe(false);
  expect(hasMinimumRecordedPlay({...report,inputWallSeconds:NaN})).toBe(false);
 });
});


describe('recording callback deadlines', () => {
 it('fails a stalled native callback and closes its session instead of hanging after the input timer', async () => {
  const close=vi.fn(async()=>{});
  await expect(withStageDeadline(()=>new Promise<void>(()=>{}),5,'THREE_RECORDING_FINALIZATION_TIMEOUT',close)).rejects.toThrow('THREE_RECORDING_FINALIZATION_TIMEOUT');
  expect(close).toHaveBeenCalledTimes(1);
 });
 it('clears its timeout after successful recording setup/finalization', async () => {
  const close=vi.fn(async()=>{}); expect(await withStageDeadline(async()=>42,5,'timeout',close)).toBe(42);
  await new Promise(resolve=>setTimeout(resolve,10));expect(close).not.toHaveBeenCalled();
 });
});

describe('interactive preview delivery without recording', () => {
 it('moves the actual page, returns PNGs, releases input and submits a closed v2 archive without an episode or video', async () => {
  const root=await fixture(), service=new ThreeCreatorTools(root,'three-sdk');
  vi.stubEnv('WORLDKIT_CREATOR_RUNTIME_HASH','a'.repeat(64));
  try {
   const example=await service.examples();
   expect(example.files).not.toHaveProperty('episode.json');
   for(const [name,source] of Object.entries(example.files)) await writeFile(path.join(root,name),source);
   await expect(executeThreeCreatorTool(service,'world_playtest',{})).rejects.toThrow('THREE_TOOL_INPUT_INVALID');
   await expect(service.submit()).rejects.toThrow('THREE_SUBMIT_PREVIEW_REQUIRED');
   const opening=await service.preview('opening');
   expect(opening.pageErrors).toEqual([]);expect(opening.runtimeErrors).toEqual([]);
   expect(opening).not.toHaveProperty('cameraDiagnostics');
   const current=await service.preview('current',[],undefined,{keys:['w'],durationSeconds:0.8});
   expect(current.observation.positionMetersXYZ[2]).toBeLessThan(opening.observation.positionMetersXYZ[2]-0.1);
   expect(current.observation.isRunning).toBe(false);
   expect((await readFile(current.image.path)).subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
   expect(current.cameraDiagnostics.observedRenderCount).toBeGreaterThan(2); expect(current.cameraDiagnostics.informationalOnly).toBe(true);
   expect(current.cameraDiagnostics.sdkCameraSamples[0].simulationTick).toBeTypeOf('number');
   expect(current.cameraDiagnostics.sdkCameraSamples[0].camera).not.toBeNull();
   const cameraSamples = JSON.parse(await readFile(current.cameraDiagnostics.samples.path,'utf8'));
   expect(cameraSamples.samples).toHaveLength(current.cameraDiagnostics.storedSampleCount);
   expect(cameraSamples.samples[0].orientationWorldQuaternionXYZW).toHaveLength(4);
   const released=await service.preview('current',[],undefined,{durationSeconds:0.3});
   expect(Math.abs(released.observation.positionMetersXYZ[2]-current.observation.positionMetersXYZ[2])).toBeLessThan(0.2);
   const reset=await service.preview('opening');
   expect(reset.observation.positionMetersXYZ).toEqual(opening.observation.positionMetersXYZ);
   const receipt=await service.submit();
   expect(receipt.schemaVersion).toBe(2);expect(receipt.validationMode).toBe('interactive-preview');
   for(const key of ['episodeHash','actualWallSeconds','activePlaySeconds','inputWallSeconds','videoMetadata','captureTiming']) expect(receipt).not.toHaveProperty(key);
   const files=Object.keys(receipt.files);expect(files).toContain('preview/preview.json');expect(files.some(name=>name.startsWith('playtest/')||name==='episode.json'||name.endsWith('.mp4')||name.endsWith('.webm'))).toBe(false);
   const execFile=promisify(execFileCallback),verified=path.join(await realpath(root),'.host-verification');
   await execFile('python3',['scripts/cloud/three-eval-unpack.py','--archive',receipt.archivePath,'--receipt',path.join(root,'creator-result.json'),'--output',verified],{cwd:process.cwd()});
   expect(JSON.parse(await readFile(path.join(verified,'host-artifact-verification.json'),'utf8')).validationMode).toBe('interactive-preview');
   await writeFile(path.join(root,'main.ts'),example.files['main.ts']+'\n// author change\n');
   await expect(service.submit()).rejects.toThrow('THREE_SUBMIT_PREVIEW_REQUIRED');
  } finally { await service.close(); }
 },120_000);
 it('returns actual transition PNGs for a short browser camera cut without turning diagnostics into a submit gate', async () => {
  const root=await fixture(),service=new ThreeCreatorTools(root,'three-raw'); vi.stubEnv('WORLDKIT_CREATOR_RUNTIME_HASH','b'.repeat(64));
  try {
   const example=await service.examples();
   for(const [name,source] of Object.entries(example.files)) await writeFile(path.join(root,name),source);
   // A timer may fire across a stalled browser interval, which correctly lowers
   // the measured angular rate. Render both sides of the deliberate cut in one
   // authored animation callback, with real render timestamps and no fake clock.
   await writeFile(path.join(root,'main.ts'),example.files['main.ts']+`
let cameraFrame = 0;
const originalFrame = frame;
frame = function(now) {
  if (running && ++cameraFrame === 3) {
    renderer.render(scene, camera);
    camera.rotation.y += 0.7;
  }
  originalFrame(now);
};
const originalStart = window.__WORLDKIT_EVAL__.startLive;
window.__WORLDKIT_EVAL__.startLive = () => { cameraFrame = 0; originalStart(); };
`);
   await service.preview('opening');
   const preview=await service.preview('current',[],undefined,{keys:['w'],durationSeconds:0.8});
   const cut=preview.cameraDiagnostics.events.find((event:any)=>event.delta.signals.includes('large-angular-step'));
   expect(cut).toBeDefined(); expect(cut.delta.fromRenderIndex).toBe(3); expect(cut.delta.toRenderIndex).toBe(4);
   expect(preview.cameraDiagnostics.keyframes).toHaveLength(2); expect(preview.cameraDiagnostics.sdkCameraSamples.every((value:any)=>value.simulationTick===null)).toBe(true);
   const content=await toolContent(service,{status:'succeeded',result:preview});
   expect(content.filter(item=>item.type==='image')).toHaveLength(3);
   for(const frame of preview.cameraDiagnostics.keyframes) {
    const bytes=await readFile(frame.image.path); expect(sha256(bytes)).toBe(frame.image.sha256); expect(bytes.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
   }
   expect(preview.cameraDiagnostics.keyframes[0].image.sha256).not.toBe(preview.cameraDiagnostics.keyframes[1].image.sha256);
   expect((await service.submit()).status).toBe('ready');
  } finally { await service.close(); }
 },120_000);
 it('rejects unbounded or incompatible current-page input before opening a browser', async () => {
  const root=await fixture(),service=new ThreeCreatorTools(root,'three-sdk');
  for(const input of [{keys:['w'],durationSeconds:16},{durationSeconds:NaN},{click:{xPixels:2000,yPixels:20}}]) await expect(executeThreeCreatorTool(service,'world_preview',{view:'current',input})).rejects.toThrow('THREE_TOOL_INPUT_INVALID');
  await expect(service.preview('opening',[],undefined,{keys:['w']})).rejects.toThrow('THREE_PREVIEW_INPUT_INVALID');await service.close();
 });
});
