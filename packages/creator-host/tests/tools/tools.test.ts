import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ThreeCompiler, hashTree } from '../../src/compiler/compiler.js';
import Ajv from 'ajv';
import ts from 'typescript';
import { WORLD_COMMAND_SCHEMA } from '../../src/schema/command-schema.js';
import { publicContractTopic } from '../../src/discovery/authoring-schema.js';
import { EPISODE_SCHEMA, sha256 } from '../../src/contracts.js';
import { ThreeCreatorTools, createClosedArchive, assertSdkPlaytestRunning, assertSdkObservationVersion, resolvePlaytestBudget, validateCaptureTiming, hasRecordedPlay, withStageDeadline, playtestSubmissionReadiness } from '../../src/tools/tools.js';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { executeThreeCreatorTool, THREE_CREATOR_TOOLS } from '../../src/cli/mcp.js';
import * as THREE from 'three';
import { targetTriviewBasis } from '../../src/browser/bridge.js';
import {recordedVideoEncodingArgs,ffmpegFrameSyncOption,frameSyncOptionFromHelp} from '../../src/tools/video.js';
import {RAW_EXAMPLE} from '../../src/discovery/examples.js';
import {measureEpisodeTargets} from '../../src/tools/target-feedback.js';

const roots: string[] = [];
async function fixture(source = `import * as THREE from 'three'; window.authorScene = new THREE.Scene(); document.title = 'ordinary browser APIs work';`) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'three-creator-test-')); roots.push(root);
  await writeFile(path.join(root, 'index.html'), '<html><head></head><body><script type="module" src="./main.ts"></script></body></html>');
  await writeFile(path.join(root, 'main.ts'), source); return root;
}
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('sampled target feedback',()=>{
  it('retains the first nearest sample, signed XYZ offset and original trace index without changing samples',()=>{
    const samples=Object.freeze([
      Object.freeze({wallSeconds:0,observationError:'missing position'}),
      Object.freeze({wallSeconds:1,simulationTick:60,simulationSeconds:1,worldRevision:3,positionMetersXYZ:Object.freeze([4,8,12])}),
      Object.freeze({wallSeconds:2,simulationTick:120,simulationSeconds:2,worldRevision:3,positionMetersXYZ:Object.freeze([4,8,12])}),
      Object.freeze({wallSeconds:3,positionMetersXYZ:Object.freeze([100,100,100])}),
    ]);
    const targets=[{id:'gate',positionMetersXYZ:[1,12,12] as [number,number,number],toleranceMeters:2}];
    const [result]=measureEpisodeTargets(targets,samples);
    expect(result).toEqual({...targets[0],nearestDistanceMeters:5,reached:false,distanceOutsideToleranceMeters:3,
      nearestSample:{traceSampleIndex:1,wallSeconds:1,simulationTick:60,simulationSeconds:1,worldRevision:3,
        positionMetersXYZ:[4,8,12],deltaToTargetMetersXYZ:[-3,4,0]}});
  });
  it('keeps exact tolerance hits and reset-era sample time without inferring an in-between crossing',()=>{
    const target={id:'gate',positionMetersXYZ:[0,0,0] as [number,number,number],toleranceMeters:1};
    const samples=[{wallSeconds:1,simulationTick:50,simulationSeconds:5,positionMetersXYZ:[-2,0,0]},
      {wallSeconds:2,simulationTick:1,simulationSeconds:.1,positionMetersXYZ:[1,0,0]}];
    expect(measureEpisodeTargets([target],samples)[0]).toMatchObject({reached:true,nearestDistanceMeters:1,distanceOutsideToleranceMeters:0,
      nearestSample:{traceSampleIndex:1,wallSeconds:2,simulationTick:1,simulationSeconds:.1}});
    expect(measureEpisodeTargets([{...target,toleranceMeters:.1}],samples)[0]).toMatchObject({reached:false,nearestDistanceMeters:1});
  });
  it('leaves unavailable measurements null and ignores invalid positions without inventing time',()=>{
    const target={id:'gate',positionMetersXYZ:[0,0,0] as [number,number,number],toleranceMeters:1};
    const invalid=[null,{}, {positionMetersXYZ:[NaN,0,0]}, {positionMetersXYZ:[0,Infinity,0]}, {positionMetersXYZ:[0,0]}, {positionMetersXYZ:['0',0,0]}];
    for(const samples of [[],invalid])expect(measureEpisodeTargets([target],samples)[0]).toMatchObject({reached:false,nearestDistanceMeters:null,nearestSample:null,distanceOutsideToleranceMeters:null});
    expect(measureEpisodeTargets([target],[...invalid,{positionMetersXYZ:[0,0,0],wallSeconds:Infinity,simulationTick:'1'}])[0]).toMatchObject({reached:true,
      nearestSample:{traceSampleIndex:6,wallSeconds:null,simulationTick:null,simulationSeconds:null,worldRevision:null}});
  });
});

describe('Three semantic target views', () => {

  it('reads verified historical trace windows after browser close and source edits, without recompilation or a new operation', async () => {
    const root=await fixture(RAW_EXAMPLE),service=new ThreeCreatorTools(root,'three-raw');
    await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
    await writeFile(path.join(root,'episode.json'),JSON.stringify({schemaVersion:1,steps:[{keysDown:['w'],durationSeconds:.3},{keysUp:['w'],durationSeconds:.1}],targets:[]}));
    try {
      const started=await executeThreeCreatorTool(service,'world_playtest',{}) as {operationId:string};
      const operation=await service.getOperation(started.operationId,25),report=operation.result;
      expect(operation.status).toBe('succeeded');expect(report.status).toBe('passed');
      await service.close();
      await writeFile(path.join(root,'main.ts'),'invalid current code');
      const prepare=vi.spyOn(service.compiler,'prepare').mockRejectedValue(new Error('must not compile'));
      const start=vi.spyOn(service,'start');
      const result:any=await executeThreeCreatorTool(service,report.readTrace.tool,{...report.readTrace.arguments,maxSamples:2});
      expect(result).toMatchObject({status:'observed',advisory:true,currentWorldComparison:'not-performed',source:{creatorOperationId:started.operationId,operationCompletedAt:operation.updatedAt,worldBuildHash:report.worldBuildHash,episodeHash:report.episodeHash},recording:{status:'passed',isCompleteEpisode:true,executionMode:'full-episode'},summary:{speedSampleCount:0}});
      expect(result.samples).toHaveLength(2);expect(result.samples[0].speedMetersPerSecond).toBeNull();
      expect(result.keyboardEvents.some((e:any)=>e.type==='keydown'&&e.code==='KeyW')).toBe(true);
      expect(prepare).not.toHaveBeenCalled();expect(start).not.toHaveBeenCalled();
      expect(await service.getOperation(started.operationId)).toEqual(operation);
      const traceFile=path.join(path.dirname(report.videoPath),'trace.json');
      const original=await readFile(traceFile);
      await writeFile(traceFile,'{"samples":[]}');
      expect(await service.readPlaytest(started.operationId)).toMatchObject({status:'unavailable',reason:'RECORDED_TRACE_CHANGED'});
      await rm(traceFile);await writeFile(path.join(root,'outside.json'),original);await symlink(path.join(root,'outside.json'),traceFile);
      expect(await service.readPlaytest(started.operationId)).toMatchObject({status:'unavailable',reason:'RECORDED_TRACE_UNREADABLE'});
      const fresh=new ThreeCreatorTools(root,'three-raw');
      await expect(fresh.readPlaytest(started.operationId)).rejects.toThrow('THREE_OPERATION_UNKNOWN');await fresh.close();
    } finally {await service.close();}
  },30000);

  it('keeps pending, unrelated and unknown recording queries distinct', async () => {
    const service=new ThreeCreatorTools(await fixture(),'three-raw');let release!:()=>void;
    try {
      const started=service.start('world.playtest',()=>new Promise(resolve=>{release=()=>resolve({});}));
      expect(await service.readPlaytest(started.operationId)).toMatchObject({status:'not-ready',operationId:started.operationId});
      await new Promise(resolve=>setTimeout(resolve,0));release();await service.getOperation(started.operationId,1);
      expect(await service.readPlaytest(started.operationId)).toMatchObject({status:'unavailable'});
      const other=service.start('world.validate',async()=>({}));
      await expect(service.readPlaytest(other.operationId)).rejects.toThrow('THREE_PLAYTEST_OPERATION_REQUIRED');
      await expect(service.readPlaytest('../trace')).rejects.toThrow('THREE_OPERATION_UNKNOWN');
      await expect(executeThreeCreatorTool(service,'world_read_playtest',{operationId:started.operationId,maxSamples:100})).rejects.toThrow('THREE_TOOL_INPUT_INVALID');
    } finally {release?.();await service.close();}
  });

  it('returns trace-backed target offsets and viewport warnings through playtest and delivery without adding a gate', async () => {
    const lowResolution = RAW_EXAMPLE.replace('renderer.setSize(innerWidth, innerHeight);','renderer.setSize(innerWidth, innerHeight); renderer.setSize(480,270,false);');
    const root=await fixture(lowResolution),service=new ThreeCreatorTools(root,'three-raw');
    await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
    await writeFile(path.join(root,'episode.json'),JSON.stringify({schemaVersion:1,
      steps:[{keysDown:['w'],durationSeconds:.5},{keysUp:['w'],durationSeconds:.15}],
      targets:[{id:'high-gate',positionMetersXYZ:[0,20,-.5],toleranceMeters:1}]}));
    try {
      const started=await executeThreeCreatorTool(service,'world_playtest',{}) as {operationId:string};
      const operation=await service.getOperation(started.operationId,25),report=operation.result;
      expect(operation.status).toBe('succeeded');expect(report.status).toBe('passed');
      expect(report.recordingReadiness).toMatchObject({scope:'recording-only',creatorOperationId:started.operationId,
        worldBuildHash:report.worldBuildHash,episodeHash:report.episodeHash,eligible:true,issues:[]});
      expect(report.feedback.viewport).toMatchObject({advisory:true,status:'measured',warnings:[{code:'CANVAS_UNDERSAMPLED'}]});
      expect(Number.isFinite(Date.parse(report.recordingReadiness.checkedAt))).toBe(true);
      const target=report.targetResults[0];
      expect(target.reached).toBe(false);
      expect(target.nearestSample).toMatchObject({traceSampleIndex:expect.any(Number),wallSeconds:expect.any(Number),simulationTick:null,simulationSeconds:null});
      const trace=JSON.parse(await readFile(path.join(path.dirname(report.videoPath),'trace.json'),'utf8'));
      const sample=trace.samples[target.nearestSample.traceSampleIndex];
      expect(target.nearestSample.positionMetersXYZ).toEqual(sample.positionMetersXYZ);
      expect(target.nearestSample.wallSeconds).toBe(sample.wallSeconds);
      expect(target.nearestSample.deltaToTargetMetersXYZ).toEqual([0,20,-.5-sample.positionMetersXYZ[2]]);
      expect(target.distanceOutsideToleranceMeters).toBeCloseTo(target.nearestDistanceMeters-1,10);
      expect(target.nearestDistanceMeters).toBeCloseTo(Math.hypot(...target.nearestSample.deltaToTargetMetersXYZ),10);
      // A same-build historical capture without an overview must be completed
      // automatically, without rerunning or extending the real input episode.
      await service.triviews();
      const priorCaptures=(service as any).captureEvidence;
      priorCaptures.report.images=priorCaptures.report.images.filter((image:any)=>image.view!=='top-down');
      const delivery=await service.submit();
      expect((service as any).captureEvidence.root).not.toBe(priorCaptures.root);
      expect(delivery.targetResults).toEqual(report.targetResults);
      expect(delivery.episodeHash).toBe(report.episodeHash);expect(delivery.worldBuildHash).toBe(report.worldBuildHash);
      const execFile=promisify(execFileCallback);
      const captured=JSON.parse((await execFile('tar',['-xOf',delivery.archivePath,'payload/captures/captures.json'])).stdout);
      expect(captured.images.map((image:any)=>image.view)).toEqual(['opening','top-down','entity-triview']);
      expect(captured.images[1]).toMatchObject({boundsSource:'visible-scene',panelOrder:['top-down'],worldBuildHash:delivery.worldBuildHash});
      expect(captured.conditioningEntityIds).not.toContain('top-down');
      for(const image of captured.images){
        const bytes=(await execFile('tar',['-xOf',delivery.archivePath,'payload/captures/'+path.basename(image.image.path)],{encoding:'buffer',maxBuffer:16*1024*1024})).stdout;
        expect(sha256(bytes)).toBe(image.image.sha256);
      }
      const saved=JSON.parse(await readFile(path.join(path.dirname(report.videoPath),'playtest.json'),'utf8'));
      expect(saved.recordingReadiness).toEqual(report.recordingReadiness);
      expect(saved.feedback.viewport).toEqual(report.feedback.viewport);
      // Historical eligibility does not approve an edited input plan.
      const episodeFile=path.join(root,'episode.json');await writeFile(episodeFile,(await readFile(episodeFile,'utf8'))+'\n');
      await expect(service.submit()).rejects.toThrow('EPISODE_CHANGED_AFTER_PLAYTEST');
      expect(report.recordingReadiness.episodeHash).toBe(delivery.episodeHash);
    } finally {await service.close();}
  },30_000);

  it('reports incomplete recording prerequisites on a technically passing debug run before submit',async()=>{
    const root=await fixture(RAW_EXAMPLE),service=new ThreeCreatorTools(root,'three-raw');
    await writeFile(path.join(root,'project.json'),JSON.stringify({schemaVersion:1,assetIds:[]}));
    await writeFile(path.join(root,'episode.json'),JSON.stringify({schemaVersion:1,
      steps:[{keysDown:['w'],durationSeconds:1},{keysUp:['w'],durationSeconds:.1}],targets:[]}));
    try {
      const before=Date.now();
      const started=await executeThreeCreatorTool(service,'world_playtest',{durationSeconds:.2}) as {operationId:string};
      const operation=await service.getOperation(started.operationId,25),report=operation.result;
      expect(operation.status).toBe('succeeded');expect(report.status).toBe('passed');
      expect(report.executionMode).toBe('debug');
      expect(report.recordingReadiness).toMatchObject({scope:'recording-only',creatorOperationId:started.operationId,
        worldBuildHash:report.worldBuildHash,episodeHash:report.episodeHash,eligible:false,
        issues:[{code:'INCOMPLETE_EPISODE',actual:false,required:true}]});
      expect(Date.parse(report.recordingReadiness.checkedAt)).toBeGreaterThanOrEqual(before);
      expect(Date.parse(report.recordingReadiness.checkedAt)).toBeLessThanOrEqual(Date.now());
      await expect(service.submit()).rejects.toThrow('INCOMPLETE_EPISODE');
    } finally {await service.close();}
  },30_000);


  it('packages a runnable animated humanoid in the SDK starter', async () => {
    const root = await fixture(), service = new ThreeCreatorTools(root, 'three-sdk');
    try {
      const example = await service.examples();
      for (const [name, source] of Object.entries(example.files)) await writeFile(path.join(root,name),source);
      const candidate = await service.compiler.prepare();
      const catalog = JSON.parse(await readFile(path.join(candidate.playableRoot,'asset-definitions.json'),'utf8'));
      const humanoid = catalog.assets.find((asset:any) => asset.id === 'humanoid.uefn-mannequin');
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
  it('identifies source and episode drift separately from a passing complete recording', () => {
    const report = { status: 'passed', isCompleteEpisode: true, capturedInput: true, actualWallSeconds: 2.4, inputWallSeconds: 1.008, activePlaySeconds: 1.004, videoMetadata: { durationSeconds: 1.367 }, worldBuildHash: 'recorded-world', episodeHash: 'unchanged-episode' };
    expect(playtestSubmissionReadiness(report, { worldBuildHash: 'recorded-world', episodeHash: 'unchanged-episode' })).toEqual({ eligible: true, issues: [] });
    expect(playtestSubmissionReadiness(report, { worldBuildHash: 'changed-world', episodeHash: 'unchanged-episode' })).toEqual({ eligible: false, issues: [{ code: 'WORLD_SOURCE_CHANGED_AFTER_PLAYTEST', actual: 'recorded-world', required: 'changed-world' }] });
    const changedEpisode = playtestSubmissionReadiness(report, { worldBuildHash: 'recorded-world', episodeHash: 'changed-episode' });
    expect(changedEpisode.issues.map(issue => issue.code)).toEqual(['EPISODE_CHANGED_AFTER_PLAYTEST']);
  });
  it.each([.001, .1, 1, 9.75])('accepts a complete recording of %s seconds without a fixed length threshold', seconds => {
    const current = { worldBuildHash: 'world', episodeHash: 'episode' };
    const report = { status: 'passed', isCompleteEpisode: true, capturedInput: true, actualWallSeconds: seconds, inputWallSeconds: seconds, activePlaySeconds: seconds, videoMetadata: { durationSeconds: seconds }, ...current };
    expect(playtestSubmissionReadiness(report, current)).toEqual({ eligible: true, issues: [] });
  });
  it('keeps missing and incomplete playtests ineligible and reports the precise missing evidence', () => {
    const current = { worldBuildHash: 'world', episodeHash: 'episode' };
    expect(playtestSubmissionReadiness(undefined, current).issues).toEqual([{ code: 'NO_PLAYTEST_IN_THIS_SERVICE_SESSION' }]);
    const result = playtestSubmissionReadiness({ status: 'passed', isCompleteEpisode: false, capturedInput: true, actualWallSeconds: 2, inputWallSeconds: 1, activePlaySeconds: 0, videoMetadata: { durationSeconds: 1.5 }, ...current }, current);
    expect(result.eligible).toBe(false);
    expect(result.issues).toEqual([{ code: 'INCOMPLETE_EPISODE', actual: false, required: true }, { code: 'RECORDED_TIME_INVALID', field: 'activePlaySeconds', actual: 0, required: 'finite-positive' }]);
  });
  it.each(['actualWallSeconds', 'inputWallSeconds', 'activePlaySeconds', 'videoDurationSeconds'])('requires real finite positive %s evidence', field => {
    const current = { worldBuildHash: 'world', episodeHash: 'episode' };
    const report = { status: 'passed', isCompleteEpisode: true, capturedInput: true, actualWallSeconds: .1, inputWallSeconds: .1, activePlaySeconds: .1, videoMetadata: { durationSeconds: .1 }, ...current };
    for (const value of [0, -1, Infinity, NaN, undefined]) {
      const invalid = field === 'videoDurationSeconds' ? { ...report, videoMetadata: { durationSeconds: value } } : { ...report, [field]: value };
      expect(playtestSubmissionReadiness(invalid, current)).toMatchObject({ eligible: false, issues: [{ code: 'RECORDED_TIME_INVALID', field }] });
    }
  });
  it('requires successful execution and trusted keyboard input even for a complete nonempty recording', () => {
    const current = { worldBuildHash: 'world', episodeHash: 'episode' };
    const report = { status: 'failed', isCompleteEpisode: true, capturedInput: false, actualWallSeconds: 1, inputWallSeconds: 1, activePlaySeconds: 1, videoMetadata: { durationSeconds: 1 }, ...current };
    expect(playtestSubmissionReadiness(report, current).issues.map(issue => issue.code)).toEqual(['PLAYTEST_DID_NOT_PASS', 'RECORDED_INPUT_MISSING']);
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
    expect(schema.observation).not.toMatch(/PhysicsPort|WorldCommand|WorldSnapshot|addCharacter|createWorld/); expect(schema.sdkGuide).toContain('In three-raw'); expect(schema).not.toHaveProperty('sdkContracts');
    await service.close();
  });
  it('adds the actual SDK public guide and contracts only to the SDK profile', async () => {
    const root = await fixture(), raw = new ThreeCreatorTools(root, 'three-raw'), sdk = new ThreeCreatorTools(root, 'three-sdk');
    const rawSchema = await raw.schema(), sdkSchema = await sdk.schema();
    expect(sdkSchema.observation).toBe(rawSchema.observation); expect(sdkSchema.sdkGuide).toContain('createWorld'); expect(sdkSchema.sdkGuide).toContain('programming.md'); expect(sdkSchema.sdkGuide).toContain('createHumanoidWorld'); expect(sdkSchema.sdkContracts).toContain('CharacterOptions'); expect(sdkSchema.sdkContracts).not.toContain('WorldEngine');
    const extensions = await sdk.schema('extensions'); expect(extensions.sdkContracts).toContain('registerMovement'); expect(extensions.sdkGuide).toContain('flight navigation'); expect(extensions.sdkContracts).toContain('GeometryDefinition'); expect(sdkSchema.sdkContracts).not.toContain('MovementDefinition');
    await raw.close(); await sdk.close();
  });
  it('discovers named camera documents and rejects retired profile view commands',async()=>{
    const root=await fixture(),service=new ThreeCreatorTools(root,'three-sdk');
    try{
      const schema=await service.schema('humanoid');
      expect(schema.sdkGuide).toContain('defaultViewId');expect(schema.sdkGuide).toContain('cycleViewIds');
      expect(schema.sdkGuide).toContain('setCameraView');expect(schema.humanoidSourceContracts?.['humanoid-runtime/runtime.ts']).not.toContain('HumanoidViewSettings');
      const check=new Ajv({strict:false}).compile(WORLD_COMMAND_SCHEMA);
      expect(check({type:'humanoid.apply-profile',profile:{view:{defaultPerspective:'first-person',keyboardToggleEnabled:true}}})).toBe(false);
      expect(check({type:'humanoid.apply-profile',profile:{view:{defaultPerspective:'invented'}}})).toBe(false);
    }finally{await service.close();}
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
    expect((await service.getOperation(first.operationId, 1)).status).toBe('succeeded'); expect((await service.getOperation(second.operationId, 1)).status).toBe('cancelled'); expect(queuedRan).toBe(false);
    await expect.poll(async () => JSON.parse(await readFile(path.join(service.evidenceRoot, 'operations', `${second.operationId}.json`), 'utf8')))
      .toMatchObject({id: second.operationId, type: 'second', status: 'cancelled'});
    await service.close();
  });
  it('refuses fabricated disk playtest receipts in a fresh service', async () => {
    const root = await fixture(); await writeFile(path.join(root, 'episode.json'), JSON.stringify({ schemaVersion: 1, steps: [{ keysDown: ['w'], durationSeconds: 1 }], targets: [] }));
    const service = new ThreeCreatorTools(root, 'three-raw'); await mkdir(service.evidenceRoot, { recursive: true }); await writeFile(path.join(service.evidenceRoot, 'playtest.json'), '{"status":"passed","actualWallSeconds":1,"capturedInput":true}');
    await expect(service.submit()).rejects.toThrow(/THREE_SUBMIT_PLAYTEST_REQUIRED/); await service.close();
  });
  it.each([
    { steps: [], error: 'THREE_EPISODE_INVALID' },
    { steps: [{ keysDown: ['w'], durationSeconds: 0 }], error: 'THREE_EPISODE_DURATION_INVALID' },
  ])('rejects an empty episode before opening a browser: $error', async ({ steps, error }) => {
    const root = await fixture(), service = new ThreeCreatorTools(root, 'three-raw');
    await writeFile(path.join(root, 'episode.json'), JSON.stringify({ schemaVersion: 1, steps, targets: [] }));
    try { await expect(service.playtest('empty-plan')).rejects.toThrow(error); }
    finally { await service.close(); }
  });
});


describe('v2 command and discovery boundary', () => {
  const discoveryCall=(service:ThreeCreatorTools,name:string,args:Record<string,unknown>={})=>executeThreeCreatorTool(service,name,args) as Promise<any>;
  it('delivers camera guidance through default and selected Agent schema sections and example file selection',async()=>{
    const service=new ThreeCreatorTools(await fixture(),'three-sdk');
    try{
      const initial=await discoveryCall(service,'creator_get_authoring_schema');
      expect((await discoveryCall(service,'creator_describe_environment')).cameraAuthoring).toEqual(initial.cameraAuthoring);
      expect(initial.cameraAuthoring).toMatchObject({scope:'named-camera-views',runtimeAuthority:'host-sdk-baseline'});
      const startup=await discoveryCall(service,initial.cameraAuthoring.authoring.tool,initial.cameraAuthoring.authoring.arguments);
      expect(startup.sdkGuide).toContain('initialMountId');expect(startup.sdkGuide).toContain('parseCameraDocument');
      const configuration=await discoveryCall(service,initial.cameraAuthoring.configuration.tool,initial.cameraAuthoring.configuration.arguments);
      expect(configuration.cameraConfiguration.status).toBe('available');
      expect(initial.cameraAuthoring.verify.currentView).toEqual({tool:'world_preview',arguments:{view:'current'}});
      expect(initial.cameraAuthoring.verify.opening).toMatch(/reset/i);
      expect(initial.cameraAuthoring.verify.read).toContain('cameraObservation.camera');
      expect(initial.cameraAuthoring.inspect).toMatchObject({tool:'world_inspect',arguments:{sections:['camera']},path:'observation.camera'});
      for(const request of [initial.cameraAuthoring.configuration,initial.cameraAuthoring.verify.currentView,initial.cameraAuthoring.inspect]){
        const tool=THREE_CREATOR_TOOLS.find(tool=>tool.name===request.tool);
        expect(tool,request.tool).toBeDefined();
        expect(new Ajv({strict:false}).compile(tool!.inputSchema)(request.arguments),request.tool).toBe(true);
      }
      for(const [topic,sections] of [['humanoid',['guide']],['mounted-interaction',['humanoid']],['control',['commands']],['getting-started',['all']]] as const){
        const selected=await discoveryCall(service,'creator_get_authoring_schema',{topic,sections});
        expect(selected.cameraAuthoring).toEqual(initial.cameraAuthoring);
        if(topic==='mounted-interaction'){
          const declarations=selected.humanoidSourceContracts['humanoid-runtime/runtime.ts'];
          for(const method of ['inspectBoarding','inspectControls','inputGuide'])expect(declarations).toContain(`${method}(`);
        }
      }
      for(const args of [{},{topic:'custom-vehicle',variant:'car',files:[]}]){
        const example=await discoveryCall(service,'creator_get_examples',args);
        expect(example.cameraAuthoring).toEqual(initial.cameraAuthoring);
      }
      const commands=await discoveryCall(service,'creator_get_authoring_schema',{topic:'control',sections:['commands']});
      const profile=commands.worldCommandSchema.oneOf.find((entry:any)=>entry.properties.type.const==='humanoid.apply-profile').properties.profile;
      expect(profile.properties).not.toHaveProperty('camera');expect(profile.properties).not.toHaveProperty('cameraDistanceMeters');
      const check=new Ajv({strict:false}).compile(commands.worldCommandSchema);
      for(const camera of [{targetHeightOffset:1.1,horizontalOffset:0},{targetHeightOffset:-2,horizontalOffset:-3},{targetHeightOffset:5,horizontalOffset:3}])expect(check({type:'humanoid.apply-profile',profile:{cameraDistanceMeters:11,camera}})).toBe(false);
    }finally{await service.close();}
  });
  it('uses current workspace source for camera guidance instead of presenting Host numeric defaults as active',async()=>{
    const service=new ThreeCreatorTools(await fixture(),'three-sdk');
    try{
      await service.materializeRuntime();
      const file=path.join(service.workspace,'sdk/three-world/src/config/camera/defaults.ts');
      await writeFile(file,(await readFile(file,'utf8')).replace('activation: "on-input"','activation: "immediate"'));
      const selected=await discoveryCall(service,'creator_get_authoring_schema',{topic:'humanoid',sections:['guide','humanoid']});
      expect(selected.cameraAuthoring).toMatchObject({runtimeAuthority:'workspace-sdk-source'});
      expect(selected.cameraAuthoring).not.toHaveProperty('parameters');
      expect((await discoveryCall(service,'creator_describe_environment')).cameraAuthoring).toEqual(selected.cameraAuthoring);
      expect(selected.cameraAuthoring.source).toContain('sdk/three-world/src/config/camera/index.ts');
      expect(selected.runtimeDefinitions['config/camera/defaults.ts']).toContain('activation: "immediate"');
      expect(selected.runtimeDefinitions['camera/subject.ts']).toBe(await readFile(path.join(service.workspace,'sdk/three-world/src/camera/subject.ts'),'utf8'));
      const example=await discoveryCall(service,'creator_get_examples');
      expect(example.cameraAuthoring).toEqual(selected.cameraAuthoring);
      expect(example.exampleAuthority).toBe('host-baseline');
      expect(example.runtimeGuidance.runtimeSourceHash).toBe(selected.runtimeGuidance.runtimeSourceHash);
    }finally{await service.close();}
  });
  it('omits absent optional workspace modules without substituting Host aircraft configuration',async()=>{
    const service=new ThreeCreatorTools(await fixture(),'three-sdk');
    try{
      await service.materializeRuntime();
      for(const file of ['aircraft-spec.ts','vehicle-inspection.ts'])await rm(path.join(service.workspace,'sdk/three-world/src/humanoid-runtime',file));
      const selected=await discoveryCall(service,'creator_get_authoring_schema',{topic:'humanoid',sections:['humanoid','contracts']});
      expect(selected).not.toHaveProperty('aircraftConfigurations');
      expect(selected.humanoidSourceContracts).not.toHaveProperty('humanoid-runtime/aircraft-spec.ts');
      expect(selected.runtimeDefinitions).not.toHaveProperty('humanoid-runtime/vehicle-inspection.ts');
      expect(selected.runtimeDefinitions['humanoid-runtime/road-vehicle.ts']).toContain('createRoadVehicleSpec');
      expect(selected.runtimeGuidance.runtimeSourceHash).toMatch(/^[a-f0-9]{64}$/);
    }finally{await service.close();}
  });
  it('keeps Player camera offsets out of raw and standalone nonhuman guidance',async()=>{
    const raw=new ThreeCreatorTools(await fixture(),'three-raw'),sdk=new ThreeCreatorTools(await fixture(),'three-sdk');
    try{
      for(const name of ['creator_describe_environment','creator_get_authoring_schema','creator_get_examples'])expect(await discoveryCall(raw,name)).not.toHaveProperty('cameraAuthoring');
      for(const name of ['creator_get_authoring_schema','creator_get_examples']){
        const result=await discoveryCall(sdk,name,{topic:'nonhuman-subject'});
        expect(result.cameraAuthoring).toMatchObject({scope:'named-camera-views',subject:'nonhuman'});
        expect(result.cameraAuthoring).not.toHaveProperty('parameters');
        expect(JSON.stringify(result.cameraAuthoring)).toContain('setCameraFollow');
        expect(JSON.stringify(result.cameraAuthoring)).not.toMatch(/player\.camera|targetHeightOffset|configuration\.effective\.camera\.framing/);
      }
    }finally{await raw.close();await sdk.close();}
  });
  it('rejects retired camera distance fields through Host movement-profile transport', () => {
    const check=new Ajv({strict:false,strictNumbers:true}).compile(WORLD_COMMAND_SCHEMA);
    for(const value of [.1,.5,1,40,75,100,null])expect(check({type:'humanoid.apply-profile',profile:{cameraDistanceMeters:value}}),String(value)).toBe(false);
    for(const value of [0,-.1,100.1,Infinity])expect(check({type:'humanoid.apply-profile',profile:{cameraDistanceMeters:value}}),String(value)).toBe(false);
  });
  it('accepts expanded handling controls in Creator commands and rejects out-of-range or unknown controls',()=>{
    const check=new Ajv({strict:false,strictNumbers:true}).compile(WORLD_COMMAND_SCHEMA);
    expect(check({type:'humanoid.apply-profile',profile:{vehicles:{rover:{maxSpeed:40,coastDeceleration:2,brakeDeceleration:30}},character:{jumpSpeed:7,slowSpeed:2}}})).toBe(true);
    expect(check({type:'humanoid.apply-profile',profile:{vehicles:{rover:{coastDeceleration:-1}}}})).toBe(false);
    expect(check({type:'humanoid.apply-profile',profile:{character:{inventedControl:1}}})).toBe(false);
  });
  it('does not label a legacy or missing SDK snapshot as v2, while raw remains minimal', () => {
    expect(() => assertSdkObservationVersion('three-sdk', 2)).not.toThrow();
    expect(() => assertSdkObservationVersion('three-sdk', 1)).toThrow('THREE_SDK_OBSERVATION_VERSION_MISMATCH');
    expect(() => assertSdkObservationVersion('three-sdk', null)).toThrow('THREE_SDK_OBSERVATION_VERSION_MISMATCH');
    expect(() => assertSdkObservationVersion('three-raw', null)).not.toThrow();
  });
  it('covers every declared World command discriminator and rejects old dialect/extra authority/NaN', async () => {
    const source = await readFile('packages/three-world/src/contracts.ts', 'utf8') + '\n' + await readFile('packages/three-world/src/humanoid-runtime/runtime.ts','utf8');
    const file = ts.createSourceFile('contracts.ts', source, ts.ScriptTarget.Latest, true);
    const types: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isPropertySignature(node) && node.name.getText(file) === 'type' && node.type) {
        for(const literal of ts.isUnionTypeNode(node.type)?node.type.types:[node.type])
          if(ts.isLiteralTypeNode(literal)&&ts.isStringLiteral(literal.literal))types.push(literal.literal.text);
      }
      ts.forEachChild(node, visit);
    };
    for (const node of file.statements) if (ts.isTypeAliasDeclaration(node) && ['PrimitiveCommand','ParameterCommand','WorldCommand','HumanoidCommand'].includes(node.name.text)) visit(node);
    expect(WORLD_COMMAND_SCHEMA.oneOf.map(schema => (schema.properties.type as {const:string}).const).sort()).toEqual(types.sort());
    const check = new Ajv({ strict:false, strictNumbers:true }).compile(WORLD_COMMAND_SCHEMA);
    for (const command of [
      {type:'entity.set-visible',entityId:'a',visible:false},
      {type:'entity.set-scale',entityId:'a',scaleLocalXYZ:[1,NaN,1]},
      {type:'actor.stop',entityId:'a',priority:100},
      {type:'action.invoke',actionId:'x',arguments:{callback:{eval:'evil'}}},
      {type:'space.set-drive-mode',mode:'automatic'},
      {type:'space.dock',portId:''},
      {type:'space.dock'},
      {type:'space.dock',portId:'home',teleport:true},
      {type:'space.dock',portId:'home',actorId:42},
      {type:'space.set-drive-mode',mode:'inertial',actorId:''},
    ]) expect(check(command)).toBe(false);
    expect(check({type:'parameter.set',parameterId:'sky.mode',value:'aurora'})).toBe(true);
    expect(check({type:'entity.set-geometry',entityId:'bridge',geometryId:'long'})).toBe(true);
    for(const mode of ['assisted','inertial'])for(const actor of [{},{actorId:'npc'}])expect(check({type:'space.set-drive-mode',mode,...actor})).toBe(true);
    for(const portId of ['home',null])for(const actor of [{},{actorId:'npc'}])expect(check({type:'space.dock',portId,...actor})).toBe(true);
  });
  it('keeps input v1 unchanged and permits closed v2 lifecycle/command steps', () => {
    const check=new Ajv({strict:false,strictNumbers:true}).compile(EPISODE_SCHEMA);
    const episode={schemaVersion:2,steps:[{lifecycle:'pause',durationSeconds:.5},{lifecycle:'start',commands:[{type:'actor.stop',entityId:'npc'}],keysDown:['w'],durationSeconds:1}],targets:[]};
    expect(check(episode)).toBe(true); expect(check({...episode,schemaVersion:1})).toBe(false);
    expect(check({...episode,steps:[{commands:[{type:'space.set-drive-mode',actorId:'npc',mode:'inertial'},{type:'space.dock',actorId:'npc',portId:'home'},{type:'space.dock',actorId:'npc',portId:null}],durationSeconds:1}]})).toBe(true);
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
 it('preserves irregular browser frame timestamps and frame count in the actual MP4 encoder',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'three-video-timing-'));roots.push(root);
  const input=path.join(root,'irregular.webm'),output=path.join(root,'recorded.mp4'),execFile=promisify(execFileCallback);
  await execFile('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=64x64:rate=10:duration=1','-vf',"select='eq(n,0)+eq(n,1)+eq(n,4)+eq(n,9)'",await ffmpegFrameSyncOption(),'passthrough','-c:v','libvpx-vp9','-enc_time_base','1:1000',input]);
  await execFile('ffmpeg',await recordedVideoEncodingArgs(input,output));
  const probe=async(file:string)=>JSON.parse((await execFile('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time:format=duration','-of','json',file])).stdout);
  const source=await probe(input),encoded=await probe(output);
  const times=(value:any):number[]=>value.frames.map((frame:any)=>Number(frame.best_effort_timestamp_time));
  const sourceTimes=times(source),encodedTimes=times(encoded);
  expect(sourceTimes).toHaveLength(4);expect(new Set(sourceTimes.slice(1).map((t,index)=>Math.round((t-sourceTimes[index]!)*1000))).size).toBeGreaterThan(1);
  expect(encodedTimes).toHaveLength(sourceTimes.length);
  for(let i=0;i<sourceTimes.length;i++)expect(Math.abs((encodedTimes[i]!-encodedTimes[0]!)-(sourceTimes[i]!-sourceTimes[0]!))).toBeLessThanOrEqual(.0011);
  expect(Number(encoded.format.duration)).toBeGreaterThanOrEqual(sourceTimes.at(-1)!-sourceTimes[0]!);
 });
 it('reserves bounded overhead for complete episodes instead of cutting off their final steps', () => {
  const full=resolvePlaytestBudget(12,12,9); expect(full.mode).toBe('full-episode'); expect(full.executionBudgetSeconds).toBeGreaterThan(12); expect(full.executionBudgetSeconds).toBeLessThanOrEqual(132);
  expect(resolvePlaytestBudget(12,undefined,9).mode).toBe('full-episode');
  expect(resolvePlaytestBudget(12,3,9).mode).toBe('debug');
  expect(resolvePlaytestBudget(6.00000000000001,6,121).mode).toBe('full-episode');
  expect(()=>resolvePlaytestBudget(12,NaN,9)).toThrow('THREE_PLAYTEST_DURATION_INVALID');
 });
 it('checks the browser input clock and actual capture boundaries, independent of report transfer time', () => {
  const input={clock:'browser-performance',startedAtMilliseconds:1000,endedAtMilliseconds:4000,durationSeconds:3};
  const capture={clock:'browser-performance',initialFrameRequestedAtMilliseconds:900,finalFrameRequestedAtMilliseconds:4100,framePeriodSeconds:1};
  expect(()=>validateCaptureTiming(input,capture,3.1)).not.toThrow();
  expect(()=>validateCaptureTiming(input,{...capture,finalFrameRequestedAtMilliseconds:3999},3.1)).toThrow('THREE_VIDEO_BOUNDARY_INVALID');
  expect(()=>validateCaptureTiming({...input,durationSeconds:8},capture,3.1)).toThrow('THREE_INPUT_CLOCK_INVALID');
  expect(()=>validateCaptureTiming(input,capture,.5)).toThrow('THREE_VIDEO_DURATION_MISMATCH');
 });
 it('accepts nonempty recorded play while rejecting absent video or paused-only time', () => {
  const report={actualWallSeconds:.3,inputWallSeconds:.1,activePlaySeconds:.08,videoMetadata:{durationSeconds:.2}};
  expect(hasRecordedPlay(report)).toBe(true);
  expect(hasRecordedPlay({...report,videoMetadata:{durationSeconds:.001}})).toBe(true);
  expect(hasRecordedPlay({...report,videoMetadata:null})).toBe(false);
  expect(hasRecordedPlay({...report,activePlaySeconds:0})).toBe(false);
  expect(hasRecordedPlay({...report,inputWallSeconds:NaN})).toBe(false);
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

// Both supported FFmpeg generations must preserve timestamps, without retrying a failed encode.
it('selects a supported frame-sync option from the actual executable help contract',()=>{
 expect(frameSyncOptionFromHelp('  -fps_mode[:stream_specifier] <string>  set framerate mode\n-vsync <string> video sync')).toBe('-fps_mode');
 expect(frameSyncOptionFromHelp('-vsync <string> video sync method')).toBe('-vsync');
 expect(()=>frameSyncOptionFromHelp('unrelated help')).toThrow('THREE_FFMPEG_FRAME_SYNC_UNSUPPORTED');
});
