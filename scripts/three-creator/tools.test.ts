import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ThreeCompiler, hashTree } from './compiler.js';
import Ajv from 'ajv';
import ts from 'typescript';
import { WORLD_COMMAND_SCHEMA } from './command-schema.js';
import { publicContractTopic } from './authoring-schema.js';
import { EPISODE_SCHEMA, sha256 } from './contracts.js';
import { ThreeCreatorTools, createClosedArchive, assertSdkPlaytestRunning, assertSdkObservationVersion, resolvePlaytestBudget, validateCaptureTiming, hasMinimumRecordedPlay, withStageDeadline, playtestSubmissionReadiness } from './tools.js';
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
  it('packages a runnable animated humanoid in the SDK starter', async () => {
    const root = await fixture(), service = new ThreeCreatorTools(root, 'three-sdk');
    try {
      const example = await service.examples();
      for (const [name, source] of Object.entries(example.files)) await writeFile(path.join(root,name),source);
      const candidate = await service.compiler.prepare();
      const catalog = JSON.parse(await readFile(path.join(candidate.playableRoot,'asset-definitions.json'),'utf8'));
      const humanoid = catalog.assets.find((asset:any) => asset.id === 'humanoid.preset-101');
      expect(humanoid).toBeDefined();
      for (const action of ['idle','walk','run','jump']) expect(humanoid.actions[action].clipName).toBeTruthy();
      expect(sha256(await readFile(path.join(candidate.playableRoot,humanoid.uri)))).toBe(humanoid.sha256);
    } finally { await service.close(); }
  });
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
    const archive = path.join(root, 'result.tar.gz'); await createClosedArchive(root, archive); const members = (await execFile('tar', ['-tzf', archive])).stdout.trim().split(/\r?\n/); expect(members.map(name => name.replace(/\/$/, '')).sort()).toEqual(['payload', 'payload/hello.txt']);
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


describe('v2 command and discovery boundary', () => {
  it('does not label a legacy or missing SDK snapshot as v2, while raw remains minimal', () => {
    expect(() => assertSdkObservationVersion('three-sdk', 2)).not.toThrow();
    expect(() => assertSdkObservationVersion('three-sdk', 1)).toThrow('THREE_SDK_OBSERVATION_VERSION_MISMATCH');
    expect(() => assertSdkObservationVersion('three-sdk', null)).toThrow('THREE_SDK_OBSERVATION_VERSION_MISMATCH');
    expect(() => assertSdkObservationVersion('three-raw', null)).not.toThrow();
  });
  it('covers every declared World command discriminator and rejects old dialect/extra authority/NaN', async () => {
    const source = await readFile('packages/three-world/src/contracts.ts', 'utf8') + '\n' + await readFile('packages/three-world/src/training/runtime.ts','utf8');
    const file = ts.createSourceFile('contracts.ts', source, ts.ScriptTarget.Latest, true);
    const types: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isPropertySignature(node) && node.name.getText(file) === 'type' && node.type) {
        for(const literal of ts.isUnionTypeNode(node.type)?node.type.types:[node.type])
          if(ts.isLiteralTypeNode(literal)&&ts.isStringLiteral(literal.literal))types.push(literal.literal.text);
      }
      ts.forEachChild(node, visit);
    };
    for (const node of file.statements) if (ts.isTypeAliasDeclaration(node) && ['PrimitiveCommand','ParameterCommand','WorldCommand','TrainingCommand'].includes(node.name.text)) visit(node);
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
