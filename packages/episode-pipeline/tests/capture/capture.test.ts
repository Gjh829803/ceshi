import {openEpisodeBrowser} from '../../src/capture/browser.js';
import {writeFixtureAssetPolicy} from '../fixtures/asset-policy';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { Matrix4, Euler } from 'three';
import type { Vec3, WorldInput, WorldSnapshot } from '@worldkit/three';
import type { EpisodeCapabilities, EpisodeFrame } from '@worldkit/three';
import type { EpisodeCaptureSession } from '../../src/capture/browser.js';
import { frameSimulationTick, runCaptureSegments, normalizeCaptureForVisuals } from '../../src/capture/capture.js';
import type { EpisodePlan } from '../../src/contracts.js';
import { createRenderedFrameEncoder, inspectRenderedVideo } from '@worldkit/browser-capture/video';

const tempRoots: string[] = [];
afterEach(async () => { await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const cameraIdentity={viewId:'explore',viewKind:'third-person',documentHash:'fixture-camera',configurationRevision:1,cameraCommitRevision:1,lifecycleGeneration:1,logicalTargetId:'actor',resolvedSubjectId:'actor',subjectGeneration:1,transition:{kind:'none',configuredDurationSeconds:0,effectiveDurationSeconds:0}} as const;
const capabilities: EpisodeCapabilities = { schemaVersion: 2, controlledEntityId: 'actor', fixedTimeStepSeconds: 1 / 60,
  worldBounds: { minimumWorldMetersXYZ: [-30, 0, -600], maximumWorldMetersXYZ: [100, 20, 100] },
  movement: { kind: 'ground', movementId: 'ground', walkSpeedMetersPerSecond: 4, runSpeedMetersPerSecond: 7, jumpSpeedMetersPerSecond: 0, heightMeters: 1.8, radiusMeters: 0.3, maximumStepHeightMeters: 0.4, maximumSlopeRadians: 0.8 },
  camera: { baselineMode:'follow',documentHash:'fixture-camera',views:[{viewId:'explore',kind:'third-person'},{viewId:'aim',kind:'third-person'}],defaultViewId:'explore',current:{...cameraIdentity,mode:'follow',positionWorldMetersXYZ:[0,3,5],orientationWorldQuaternionXYZW:[0,0,0,1],desiredPositionWorldMetersXYZ:null,desiredYawRadians:0,desiredPitchRadians:0},mode: 'follow', segmentInitialization: 'relative-authored-pose' }, maximumStartAlignmentMeters: 0.75 };
const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function fakeSession(options: { shouldFail?: boolean } = {}) {
  let yaw = 0, pitch = 0;
  let velocity: Vec3 = [0, 0, 0];
  let tick = 1, position: Vec3 = [0, 0, 0], preparations = 0;
  const advances: number[] = [];
  const snapshot = (): WorldSnapshot => ({ schemaVersion: 2, worldRevision: 0, simulationTick: tick, simulationSeconds: tick / 60, controlledEntityId: 'actor', isRunning: false,
    camera: { ...cameraIdentity,mode: 'follow', positionWorldMetersXYZ: [0, 3, 5], orientationWorldQuaternionXYZW: [0, 0, 0, 1], desiredPositionWorldMetersXYZ: [0, 3, 5], desiredYawRadians: yaw, desiredPitchRadians: pitch },
    entities: [{ id: 'actor', generation: 0, geometryVersion: 0, name: 'actor', tags: [], role: 'actor', appearancePrompt: '', positionWorldMetersXYZ: position, rotationLocalRadiansXYZ: [0, 0, 0], scaleLocalXYZ: [1, 1, 1], isVisibleLocal: true, isVisibleEffective: true, controlOwners: [], motion: { phase: 'grounded', isGrounded: true, velocityWorldMetersPerSecondXYZ: velocity, collisionEntityIds: [] } }],
    errors: options.shouldFail && tick > 30 ? [{ code: 'FIXTURE_RUNTIME_ERROR', message: 'fixture failure', phase: 'step', category: 'runtime', entityIds: ['actor'] }] : [] });
  const session: EpisodeCaptureSession = {
    errors: [], capabilities: async () => capabilities,
    execute: async () => { throw new Error('fixture does not expose player actions'); },
    operation: async () => { throw new Error('fixture operation missing'); },
    probeStart: async start => ({ isValid: true, requestedPositionWorldMetersXYZ: start.positionWorldMetersXYZ, resolvedPositionWorldMetersXYZ: start.positionWorldMetersXYZ, diagnostics: [] }),
    prepareSegment: async start => { tick = 1; yaw = start.facingYawRadians; pitch = 0; velocity = [0,0,0]; position = start.positionWorldMetersXYZ; preparations += 1; return snapshot(); },
    advance: async (input: WorldInput, ticks: number) => {
      advances.push(ticks); tick += ticks;
      const speed = input.run ? 7 : 4;
      yaw += (input.cameraYawRatio ?? 0) * 1.8 * ticks / 60;
      pitch += (input.cameraPitchRatio ?? 0) * 1.8 * ticks / 60;
      const x = input.moveXRatio ?? 0, z = input.moveZRatio ?? 0;
      velocity = [(x*Math.cos(yaw) + z*Math.sin(yaw))*speed, 0, (-x*Math.sin(yaw) + z*Math.cos(yaw))*speed];
      position = [position[0] + velocity[0]*ticks/60, position[1], position[2] + velocity[2]*ticks/60];
      return snapshot();
    },
    frame: async mimeType => ({ captureSurface: 'world-renderer-canvas', imageDataUrl: `data:${mimeType};base64,${Buffer.from('fixture image bytes').toString('base64')}`, snapshot: snapshot(), camera: { projectionMatrix: matrix, viewMatrix: matrix, cameraToWorldMatrix: new Matrix4().makeRotationFromEuler(new Euler(-pitch, yaw, 0, 'YXZ')).toArray(), controlForwardWorldXYZ: [-Math.sin(yaw), 0, -Math.cos(yaw)] } } satisfies EpisodeFrame),
    release: vi.fn(async () => {}), close: vi.fn(async () => {}),
  };
  return { session, advances, get preparations() { return preparations; } };
}
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'three-episode-capture-test-')); tempRoots.push(root);
  const playableRoot = path.join(root, 'playable'), outputRoot = path.join(root, 'capture'); await mkdir(playableRoot);
  await writeFile(path.join(playableRoot, 'index.html'), '<canvas></canvas>');
  const assetPolicySha256=await writeFixtureAssetPolicy(playableRoot);
  const plan: EpisodePlan = { kind: 'worldkit-three-episode-plan', schemaVersion: 2, worldBuildHash: 'a'.repeat(64), segments: Array.from({ length: 6 }, (_, index) => ({ id: `segment-0${index}`, start: { positionWorldMetersXYZ: [index * 10, 0, 0], facingYawRadians: 0 }, waypoints: [{ positionWorldMetersXYZ: [index * 10, 0, -500], gait: 'walk' }], endBehavior: 'stop', purpose: 'long route' })) };
  const fake = fakeSession(), openBrowser = vi.fn(async () => fake.session);
  let encoded = 0;
  const abort = vi.fn(async () => {});
  const encoderFactory: typeof createRenderedFrameEncoder = ({ outputPath }) => ({
    write: async () => { encoded += 1; }, finish: async () => { await writeFile(outputPath, 'fixture encoded media'); }, abort,
  });
  const inspectVideo = async () => ({ widthPixels: 1280, heightPixels: 720, codec: 'h264', pixelFormat: 'yuv420p', frameRate: '24/1', averageFrameRate: '24/1', frameCount: 720, durationSeconds: 30, hasAudio: false });
  return { root, plan, fake, assetPolicySha256, openBrowser, abort, get encoded() { return encoded; }, options: { playableRoot, outputRoot, plan, openBrowser, encoderFactory, inspectVideo } };
}

describe('Three episode deterministic production capture', () => {
  it('schedules exactly 1800 real simulation ticks into 720 unique sample times', () => {
    const samples = Array.from({ length: 721 }, (_, index) => frameSimulationTick(index, 1 / 60));
    expect(samples[0]).toBe(0); expect(samples[720]).toBe(1800);
    expect(new Set(samples).size).toBe(721);
    expect(new Set(samples.slice(1).map((value, index) => value - samples[index]!))).toEqual(new Set([2, 3]));
    expect(() => frameSimulationTick(0, 1 / 30)).toThrow('FIXED_STEP_UNSUPPORTED');
  });
  it('records on the first execution, preserves opening/terminal ticks, and reuses an intact segment after another route changes', async () => {
    const setup = await fixture();
    const result = await runCaptureSegments({ ...setup.options, segmentIds: ['segment-00'] });
    expect(result.status).toBe('completed'); expect(setup.encoded).toBe(720);
    const health=JSON.parse(await readFile(path.join(result.segments[0]!.outputRoot,'health.json'),'utf8'));
    expect(health.playerBehavior.runSeconds).toBe(0);expect(health.playerBehavior.walkSeconds).toBeGreaterThan(2);
    expect(setup.fake.preparations).toBe(1);
    expect(setup.fake.advances.reduce((sum, ticks) => sum + ticks, 0)).toBe(1800);
    expect(setup.fake.session.close).toHaveBeenCalledOnce();
    const output = result.segments[0]!;
    const trace = JSON.parse(await readFile(path.join(output.outputRoot, 'trace.json'), 'utf8'));
    expect(trace.frames[0].snapshot.simulationTick).toBe(1); expect(trace.terminalSnapshot.simulationTick).toBe(1801);
    expect(trace.frames[719].timeSeconds).toBe(719 / 24);
    const updated = structuredClone(setup.plan); updated.segments[1]!.waypoints[0]!.positionWorldMetersXYZ = [10, 0, -300];
    const cached = await runCaptureSegments({ ...setup.options, plan: updated, segmentIds: ['segment-00'] });
    expect(cached.segments[0]!.cacheHit).toBe(true); expect(setup.openBrowser).toHaveBeenCalledOnce();
  });
  it('rejects a modified cached video and captures only the selected segment again', async () => {
    const setup = await fixture();
    const first = await runCaptureSegments({ ...setup.options, segmentIds: ['segment-00'] });
    await writeFile(path.join(first.segments[0]!.outputRoot, 'video.mp4'), 'tampered');
    const second = await runCaptureSegments({ ...setup.options, segmentIds: ['segment-00'] });
    expect(second.segments[0]!.cacheHit).toBe(false); expect(setup.openBrowser).toHaveBeenCalledTimes(2);
    expect(setup.fake.preparations).toBe(2);
  });
  it('keeps failure telemetry and keyframes, aborts encoding, and closes the isolated browser', async () => {
    const setup = await fixture(), failing = fakeSession({ shouldFail: true });
    const result = await runCaptureSegments({ ...setup.options, openBrowser: async () => failing.session, segmentIds: ['segment-00'] });
    expect(result.status).toBe('failed'); expect(result.segments[0]!.failure?.code).toBe('EPISODE_RUNTIME_ERROR');
    expect(result.segments[0]!.frameCount).toBeLessThan(720); expect(setup.abort).toHaveBeenCalledOnce();
    expect(result.segments[0]!.artifacts.some(file => file.path === 'failure.png')).toBe(true);
    expect(result.segments[0]!.artifacts.some(file => file.path.startsWith('failure-window/'))).toBe(true);
    expect(failing.session.release).toHaveBeenCalledOnce(); expect(failing.session.close).toHaveBeenCalledOnce();
  });
  it('does not accept a short stopped route as a 30-second gameplay video', async () => {
    const setup = await fixture(); setup.plan.segments[0]!.waypoints[0]!.positionWorldMetersXYZ = [0, 0, -1];
    const result = await runCaptureSegments({ ...setup.options, segmentIds: ['segment-00'] });
    expect(result.segments[0]!.failure?.code).toBe('EPISODE_ROUTE_TOO_SHORT'); expect(result.segments[0]!.status).toBe('failed');
  });
  it('captures a seated action and a same-waypoint stand-up through real advancing ticks', async () => {
    const setup = await fixture(), session = setup.fake.session;
    const segment = setup.plan.segments[0]!;
    segment.waypoints = [{ positionWorldMetersXYZ: [0, 0, 0], gait: 'walk' }];
    segment.actionGoals = [
      { id: 'sit-at-chair', trigger: { waypointIndex: 0, radiusMeters: .6 }, targetId: 'chair', intent: { kind: 'skill', action: 'sit' }, completion: { kind: 'settled', holdSeconds: 1 }, timeoutSeconds: 4 },
      { id: 'stand-from-chair', trigger: { waypointIndex: 0, radiusMeters: .6 }, intent: { kind: 'skill', action: 'standUp' }, completion: { kind: 'settled', holdSeconds: 0 }, timeoutSeconds: 4 },
    ];
    let tick = 1, started = 0, currentAction = '', requestId = '', seated: string | null = null;
    const commands: string[] = [];
    const player = (snapshot: WorldSnapshot): WorldSnapshot => {
      tick = snapshot.simulationTick;
      if (currentAction && tick >= started + 30) seated = currentAction === 'sit' ? 'chair' : null;
      return { ...snapshot, humanoid: { character: { instanceId: 'actor', state: seated ? 'seated' : 'idle', stance: 'stand', swimming: false, swimStyle: 'freestyle', carrying: null, seated,
        activeAction: currentAction && tick < started + 30 ? { requestId: currentAction, action: currentAction, phase: 'animate', elapsedSeconds: (tick - started) / 60 } : null },
        surface: { mode: 'none', surfaceId: null, pose: null }, water: { swimming: false, contact: null },
        interactionTargets: [{ id: 'chair', slotId: 'seat', generation: 1,
          claim: seated ? { actorId: 'actor', requestId, generation: 1, state: 'occupied', expiresAtSimulationSeconds: null } : null,
          kind: 'seat', eligible: true, reason: 'READY', approachPositionWorldMetersXYZ: [0, 0, 0] }], message: '' } as unknown as NonNullable<WorldSnapshot['humanoid']> };
    };
    const originalPrepare = session.prepareSegment, originalAdvance = session.advance, originalFrame = session.frame;
    session.prepareSegment = async (...args) => player(await originalPrepare(...args));
    session.advance = async (...args) => player(await originalAdvance(...args));
    session.frame = async (...args) => { const frame = await originalFrame(...args); return { ...frame, snapshot: player(frame.snapshot) }; };
    session.execute = async command => {
      if (command.type !== 'humanoid.perform-action') throw new Error('unexpected fixture command');
      currentAction = command.request.action; requestId = command.request.requestId; started = tick; commands.push(currentAction);
      return { status: 'accepted', commandId: currentAction, worldRevision: 0, operationId: currentAction };
    };
    session.operation = async id => ({ id, status: tick >= started + 30 ? 'succeeded' : 'running', phase: 'animate' });
    const result = await runCaptureSegments({ ...setup.options, segmentIds: ['segment-00'] });
    expect(result.status).toBe('completed'); expect(commands).toEqual(['sit', 'standUp']);
    expect(new Set(setup.fake.advances)).toEqual(new Set([1]));
    expect(setup.fake.advances).toHaveLength(1800);
    const evidence = JSON.parse(await readFile(path.join(result.segments[0]!.outputRoot, 'action-timeline.json'), 'utf8'));
    expect(evidence.actionTimeline.map((item: any) => item.result)).toEqual(['succeeded', 'succeeded']);
    expect(evidence.actionTimeline[0]).toMatchObject({ startTick: 0, endTick: 90 });
    expect(evidence.actionTimeline[0].stateChanges.some((item: any) => item.tick === 30 && item.state.character.seated === 'chair')).toBe(true);
    expect(evidence.actionTimeline[1].startTick).toBeGreaterThanOrEqual(90);
  });
  it('shares a single initialized world across all requested segment resets', async () => {
    const setup = await fixture();
    const result = await runCaptureSegments({ ...setup.options, segmentIds: ['segment-00', 'segment-01'] });
    expect(result.status).toBe('completed'); expect(setup.openBrowser).toHaveBeenCalledOnce(); expect(setup.fake.preparations).toBe(2);
  });
  it('normalizes only six completed disk-verified recordings and cannot replace their provenance with caller values', async () => {
    const setup = await fixture(), runtimeHash = 'b'.repeat(64);
    const summary = await runCaptureSegments({ ...setup.options, runtimeHash });
    const expected = { worldBuildHash: setup.plan.worldBuildHash, runtimeHash };
    const input = await normalizeCaptureForVisuals(summary, expected);
    expect(input.segments).toHaveLength(6); expect(input.runtimeHash).toBe(runtimeHash);
    expect(input.segments.every(segment => path.isAbsolute(segment.video.path))).toBe(true);
    await expect(normalizeCaptureForVisuals(summary, { ...expected, runtimeHash: 'c'.repeat(64) })).rejects.toThrow('PROVENANCE_MISMATCH');
    await writeFile(input.segments[2]!.firstFrame.path, 'changed');
    await expect(normalizeCaptureForVisuals(summary, expected)).rejects.toThrow('RECEIPT_INVALID');
  });
  it('pipes each rendered JPEG once into a real silent H264 stream without resizing or extending its timeline', async () => {
    const setup = await fixture(), outputPath = path.join(setup.root, 'real-encoder.mp4');
    const encoder = createRenderedFrameEncoder({ outputPath, frameRate: 24, frameCount: 3 });
    try {
      for (const color of ['red', 'green', 'blue']) {
        const jpeg = await sharp({ create: { width: 96, height: 64, channels: 3, background: color } }).jpeg().toBuffer();
        await encoder.write(jpeg);
      }
      await encoder.finish();
      expect(await inspectRenderedVideo(outputPath)).toMatchObject({ widthPixels: 96, heightPixels: 64, frameCount: 3, frameRate: '24/1', durationSeconds: 0.125, hasAudio: false, codec: 'h264' });
    } catch (error) { await encoder.abort(); throw error; }
  });
});

it('resumes an admitted six-clip boundary without a planner or GPU job and rejects corrupted media',async()=>{
 const setup=await fixture(),runtimeHash='b'.repeat(64),{canonicalHash,PRE_SEEDANCE_PROFILE}=await import('../../src/contracts.js');
 const {runEpisodeWorkflow}=await import('../../src/workflow/workflow.js'),{saveEpisodeSource}=await import('../../src/source/source.js'),{hashTree}=await import('@worldkit/creator-host/compiler');
 const {createHash}=await import('node:crypto');const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
 setup.root=await realpath(setup.root);setup.options.playableRoot=await realpath(setup.options.playableRoot);setup.options.outputRoot=path.join(setup.root,'capture');
 const summary=await runCaptureSegments({...setup.options,runtimeHash});
 const sourceRoot=path.join(setup.root,'source');await mkdir(sourceRoot);await writeFile(path.join(sourceRoot,'main.ts'),'fixture source');
 const opening=path.join(setup.root,'opening.png');await writeFile(opening,'fixture opening');const image={path:opening,sha256:hash('fixture opening')};
 const source={assetPolicySha256:setup.assetPolicySha256,kind:'three-episode-source' as const,schemaVersion:1 as const,worldId:'fixture-world',sourceHash:'c'.repeat(64),worldBuildHash:setup.plan.worldBuildHash,runtimeHash,sourceWorldBuildHash:setup.plan.worldBuildHash,sourceRuntimeHash:runtimeHash,sourceDeliveryManifestSha256:'d'.repeat(64),sourceRoot,playableRoot:setup.options.playableRoot,sourceFiles:await hashTree(sourceRoot),playableFiles:await hashTree(setup.options.playableRoot),opening:image,targets:[{id:'actor',name:'actor',role:'primary-subject',whiteboxTriview:image}]};
 const sourceManifestPath=path.join(setup.root,'source.json'),planPath=path.join(setup.root,'plan.json');await saveEpisodeSource(sourceManifestPath,source);await writeFile(planPath,JSON.stringify(setup.plan));
 await writeFile(path.join(setup.root,'capture/capture-summary.local.json'),JSON.stringify(summary));
 await writeFile(path.join(setup.root,'episode.json'),JSON.stringify({episodeId:'fixture-episode',worldBuildHash:source.worldBuildHash,worldId:source.worldId,profile:PRE_SEEDANCE_PROFILE,planPath,planHash:canonicalHash(setup.plan),segments:summary.segments,status:'failed',stage:'style-planning',planRepairsBySegment:{}}));
 const capture=vi.fn(async()=>{throw new Error('unexpected GPU dispatch');}),runCodex=vi.fn(async()=>{throw new Error('unexpected planner');});
 const options={sourceManifestPath,outputRoot:setup.root,episodeId:'fixture-episode',stopBeforeSeedance:true as const,until:'capture' as const,runtimeConfig:{},capture,cloud:{runCodex} as any};
 expect((await runEpisodeWorkflow(options)).status).toBe('paused-before-visuals');expect(capture).not.toHaveBeenCalled();expect(runCodex).not.toHaveBeenCalled();
 // Queue suspension must publish the checkpoint before authorizing a CPU continuation.
 const admittedState=JSON.parse(await readFile(path.join(setup.root,'episode.json'),'utf8'));
 await writeFile(path.join(setup.root,'episode.json'),JSON.stringify({...admittedState,segments:[]}));
 capture.mockRejectedValueOnce(Object.assign(new Error('queued'),{code:'EPISODE_CAPTURE_BATCH_PENDING',taskId:'capture-test',cohortId:'cohort-test'}));
 const checkpointOrder:string[]=[];
 const paused=await runEpisodeWorkflow({...options,publishS3Prefix:'s3://bucket/checkpoint',cloud:{runCodex,publishDirectory:async()=>{checkpointOrder.push('published');}} as any,batchQueue:{checkpointReady:async()=>{checkpointOrder.push('continuation-ready');}} as any});
 expect(paused.status).toBe('paused-capture-queue');expect(checkpointOrder).toEqual(['published','continuation-ready']);expect(runCodex).not.toHaveBeenCalled();
 await writeFile(path.join(setup.root,'episode.json'),JSON.stringify(admittedState));capture.mockClear();
 // A completed legacy summary cannot silently bypass the new input policy.
 await writeFile(path.join(setup.root,'capture/capture-summary.local.json'),JSON.stringify({...summary,playerCaptureVersion:'legacy-constant-travel'}));
 await expect(runEpisodeWorkflow(options)).rejects.toThrow('unexpected GPU dispatch');expect(capture).toHaveBeenCalledOnce();expect(runCodex).not.toHaveBeenCalled();
 capture.mockClear();
 await writeFile(path.join(setup.root,'capture/capture-summary.local.json'),JSON.stringify(summary));
 await writeFile(path.join(summary.segments[2]!.outputRoot,'video.mp4'),'corrupted');
 await expect(runEpisodeWorkflow(options)).rejects.toThrow('RECEIPT_INVALID');expect(capture).not.toHaveBeenCalled();expect(runCodex).not.toHaveBeenCalled();
});

it('rejects a prior-route candidate from another source before dispatching the cloud Agent',async()=>{
 const setup=await fixture(),{runEpisodeWorkflow}=await import('../../src/workflow/workflow.js'),{saveEpisodeSource}=await import('../../src/source/source.js'),{hashTree}=await import('@worldkit/creator-host/compiler'),{createHash}=await import('node:crypto');
 const hash=(value:string)=>createHash('sha256').update(value).digest('hex');setup.root=await realpath(setup.root);setup.options.playableRoot=await realpath(setup.options.playableRoot);
 const sourceRoot=path.join(setup.root,'source');await mkdir(sourceRoot);await writeFile(path.join(sourceRoot,'main.ts'),'unchanged author source');
 const opening=path.join(setup.root,'opening.png');await writeFile(opening,'fixture opening');const image={path:opening,sha256:hash('fixture opening')};
 const sourceManifestPath=path.join(setup.root,'source.json');await saveEpisodeSource(sourceManifestPath,{assetPolicySha256:setup.assetPolicySha256,kind:'three-episode-source',schemaVersion:1,worldId:'fixture-world',sourceHash:'c'.repeat(64),worldBuildHash:setup.plan.worldBuildHash,runtimeHash:'b'.repeat(64),sourceWorldBuildHash:setup.plan.worldBuildHash,sourceRuntimeHash:'b'.repeat(64),sourceDeliveryManifestSha256:'d'.repeat(64),sourceRoot,playableRoot:setup.options.playableRoot,sourceFiles:await hashTree(sourceRoot),playableFiles:await hashTree(setup.options.playableRoot),opening:image,targets:[{id:'actor',name:'actor',role:'primary-subject',whiteboxTriview:image}]});
 const candidatePath=path.join(setup.root,'prior-route.json'),candidate=JSON.stringify(setup.plan);await writeFile(candidatePath,candidate);
 const runCodex=vi.fn(async()=>{throw new Error('unexpected cloud dispatch');}),capture=vi.fn(async()=>{throw new Error('unexpected capture');});
 const options={sourceManifestPath,outputRoot:path.join(setup.root,'new-runtime'),episodeId:'fixture-rerun',stopBeforeSeedance:true as const,until:'plan' as const,capture,cloud:{runCodex} as any,runtimeConfig:{routePlanCandidate:{path:candidatePath,sha256:hash(candidate),sourceHash:'e'.repeat(64)}}};
 await expect(runEpisodeWorkflow(options)).rejects.toThrow('EPISODE_ROUTE_CANDIDATE_SOURCE_MISMATCH');expect(runCodex).not.toHaveBeenCalled();expect(capture).not.toHaveBeenCalled();
 options.runtimeConfig.routePlanCandidate.sourceHash='c'.repeat(64);await writeFile(candidatePath,'tampered route');
 await expect(runEpisodeWorkflow(options)).rejects.toThrow('EPISODE_ROUTE_CANDIDATE_SOURCE_MISMATCH');expect(runCodex).not.toHaveBeenCalled();expect(capture).not.toHaveBeenCalled();
});

it('rejects v1 capabilities before probing or preparing the frozen runtime',async()=>{
 const setup=await fixture();
 setup.fake.session.capabilities=async()=>({...capabilities,schemaVersion:1}) as unknown as EpisodeCapabilities;
 await expect(runCaptureSegments({...setup.options,segmentIds:['segment-00']})).rejects.toThrow('EPISODE_CAMERA_PROTOCOL_UNSUPPORTED');
 expect(setup.fake.preparations).toBe(0);
});
it('rejects a prepared named view mismatch before recording',async()=>{
 const setup=await fixture();setup.plan.segments[0]!.start={...setup.plan.segments[0]!.start,cameraViewId:'aim'};
 const result=await runCaptureSegments({...setup.options,segmentIds:['segment-00']});
 expect(result.status).not.toBe('completed');expect(setup.encoded).toBe(0);
});

it('admits port v2 over real browser transport and rejects a mismatched prepared response',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'episode-protocol-browser-'));tempRoots.push(root);
 const html=(version:number|undefined,capabilityVersion:number|undefined=2)=>`<script>window.__WORLDKIT_EVAL__={ready:true,stopLive:async()=>{},episode:{schemaVersion:${String(version)},capabilities:()=>(${JSON.stringify({...capabilities,schemaVersion:capabilityVersion})}),prepareSegment:async()=>({camera:${JSON.stringify(capabilities.camera.current)}}),execute:async()=>{},operation:()=>{},release:()=>{window.released=true}}};</script>`;
 for(const [version,capabilityVersion] of [[1,2],[undefined,2],[2,1]] as const){
  await writeFile(path.join(root,'index.html'),html(version,capabilityVersion));
  await expect(openEpisodeBrowser({playableRoot:root})).rejects.toThrow('EPISODE_CAMERA_PROTOCOL_UNSUPPORTED');
 }
 await writeFile(path.join(root,'index.html'),html(2));const session=await openEpisodeBrowser({playableRoot:root});try{
  await expect(session.prepareSegment({positionWorldMetersXYZ:[0,0,0],facingYawRadians:0,cameraViewId:'aim'},{widthPixels:640,heightPixels:360})).rejects.toThrow('EPISODE_CAMERA_PREPARED_STATE_MISMATCH');
  expect(await session.page.evaluate(()=> (window as any).released)).toBe(true);
 }finally{await session.close();}
},30000);
