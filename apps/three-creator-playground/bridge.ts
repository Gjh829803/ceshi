import * as THREE from 'three';
import type { WorldCommand, WorldObservation } from '@worldkit/three';
import {captureObjectViews, captureTargets, withCapturePresentation} from './capture.js';
import {CharacterContinuityMonitor} from './character-continuity.js';
export {targetTriviewBasis} from './capture.js';

declare global {
  interface Window {
    __WORLDKIT_EVAL__?: WorldObservation;
    __THREE_CREATOR_HOST__?: ReturnType<typeof createBridge>;
  }
}
const position = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3()).toArray();
export type InspectionSection = 'snapshot' | 'description' | 'hierarchy' | 'diagnostics';
export interface InspectionQuery {
  query?: string;
  entityIds?: string[];
  /** Omit to inspect all sections. */
  sections?: InspectionSection[];
}
function observation(): WorldObservation {
  const value = window.__WORLDKIT_EVAL__;
  if (!value?.ready || !value.scene?.isScene || !value.camera?.isCamera || !value.renderer?.domElement || typeof value.renderer.render !== 'function' || !value.player?.isObject3D || !value.targets) throw new Error('THREE_OBSERVER_NOT_READY: expose scene, camera, renderer, player, targets and lifecycle methods');
  for (const key of ['startLive', 'stopLive', 'reset'] as const) if (typeof value[key] !== 'function') throw new Error(`THREE_OBSERVER_METHOD_MISSING: ${key}`);
  return value;
}
function describe(object: THREE.Object3D) {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object, true);
  return { uuid: object.uuid, name: object.name, type: object.type, parentUuid: object.parent?.uuid ?? null, positionMetersXYZ: position(object), visible: object.visible, childCount: object.children.length, bounds: box.isEmpty() ? null : { minimumMetersXYZ: box.min.toArray(), maximumMetersXYZ: box.max.toArray() } };
}
/** Optional camera feedback for one current-view capture, never the recording sampler. */
function currentCameraObservation(world: WorldObservation) {
  let snapshot: ReturnType<NonNullable<WorldObservation['snapshot']>> | null = null;
  try { snapshot = world.snapshot?.() ?? null; } catch { /* Raw/older observers may not provide telemetry. */ }
  let framing: unknown = null, cameraOverrides: unknown = null, cameraSettings: unknown = null;
  if (snapshot?.training) {
    try {
      const configuration = world.capabilities?.({entityIds: []})?.training?.configuration;
      const camera = configuration?.effective?.camera;
      cameraOverrides = configuration?.profile?.camera ?? null;
      cameraSettings = camera?.settings ?? null;
      framing = camera && 'framing' in camera ? camera.framing ?? null : null;
    } catch { /* Advisory diagnostics must not prevent a real image capture. */ }
  }
  return {
    worldRevision: snapshot?.worldRevision ?? null, simulationTick: snapshot?.simulationTick ?? null,
    simulationSeconds: snapshot?.simulationSeconds ?? null, isRunning: snapshot?.isRunning ?? null,
    camera: snapshot?.camera ?? null, trainingCameraMode: snapshot?.training?.cameraMode ?? null,
    owner: snapshot?.camera?.mode ?? null, framing, cameraOverrides, cameraSettings,
  };
}
function createBridge() {
  const characterContinuity=new CharacterContinuityMonitor();
  let trace: any[] = [], events: any[] = [], frameCount = 0, active = false, startedAt = 0, previousFrameAt = 0, lastSampleAt = 0;
  let recorder: MediaRecorder | undefined, recordedChunks: Blob[] = [], stream: MediaStream | undefined;
  let captureIntervalMilliseconds = 1000 / 3, lastCapturedAt = -Infinity;
  let recordingStartedAt = 0, initialFrameRequestedAt = 0, finalFrameRequestedAt = 0, requestedFrames = 0;
  const requestRecordedFrame = () => { const track = stream?.getVideoTracks()[0]; if (track && 'requestFrame' in track) { (track as CanvasCaptureMediaStreamTrack).requestFrame(); requestedFrames++; } };
  const afterPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  async function flushCurrentCanvas(current: MediaRecorder): Promise<number> {
    // One actual render of the same current scene, without advancing its clock.
    const world = observation();
    const requestedAt = performance.now(); requestRecordedFrame();
    withCapturePresentation(world,()=>world.renderer.render(world.scene,world.camera)); await afterPaint();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { current.removeEventListener('dataavailable', flushed); reject(new Error('THREE_VIDEO_FLUSH_TIMEOUT')); }, 5000);
      const flushed = () => { clearTimeout(timeout); resolve(); };
      current.addEventListener('dataavailable', flushed, { once: true }); current.requestData();
    });
    return requestedAt;
  }
  async function finishRecording(inputEndedAt = performance.now()) {
    const current = recorder; if (!current) throw new Error('THREE_RECORDING_NOT_ACTIVE');
    const postrollStartedAt = performance.now();
    await flushCurrentCanvas(current);
    // Keep recording the real stopped canvas for one sampling interval. This is
    // explicit postroll, outside input/active-play time, never synthesized padding.
    await new Promise(resolve => setTimeout(resolve, captureIntervalMilliseconds));
    finalFrameRequestedAt = await flushCurrentCanvas(current);
    // Allow the native capture/encoder queue to receive that endpoint before stop.
    await new Promise(resolve => setTimeout(resolve, Math.max(100, Math.min(250, captureIntervalMilliseconds / 2))));
    const stopRequestedAt = performance.now();
    await new Promise<void>((resolve, reject) => { current.addEventListener('stop', () => resolve(), { once: true }); current.addEventListener('error', event => reject(event), { once: true }); current.stop(); });
    const recorderStoppedAt = performance.now();
    stream?.getTracks().forEach(track => track.stop()); recorder = undefined; stream = undefined;
    const blob = new Blob(recordedChunks, { type: 'video/webm' }); recordedChunks = [];
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
    return { data, timing: { clock: 'browser-performance', recordingStartedAtMilliseconds: recordingStartedAt,
      initialFrameRequestedAtMilliseconds: initialFrameRequestedAt, finalFrameRequestedAtMilliseconds: finalFrameRequestedAt,
      stopRequestedAtMilliseconds: stopRequestedAt, recorderStoppedAtMilliseconds: recorderStoppedAt,
      framePeriodSeconds: captureIntervalMilliseconds / 1000, requestedFrames, postrollStartedAtMilliseconds: postrollStartedAt, postrollSeconds: (recorderStoppedAt-inputEndedAt)/1000 } };
  }
  function finishTrace() {
    const endedAt = performance.now(); trace.push(sample(0)); active = false;
    return { samples: trace, keyboardEvents: events, browserFrameDeltasSeconds: frames,
      timing: { clock: 'browser-performance', startedAtMilliseconds: startedAt, endedAtMilliseconds: endedAt, durationSeconds: (endedAt-startedAt)/1000 } };
  }
  const keyListener = (event: KeyboardEvent) => { if (active) events.push({ type: event.type, key: event.key, code: event.code, repeat: event.repeat, isTrusted: event.isTrusted, timeSeconds: (performance.now() - startedAt) / 1000, frame: frameCount }); };
  window.addEventListener('keydown', keyListener, true); window.addEventListener('keyup', keyListener, true);
  function sample(deltaSeconds: number) {
    const world = observation(), snapshot = world.snapshot?.(), entity = snapshot?.entities.find(e => e.id === snapshot.controlledEntityId);
    return { wallSeconds: (performance.now() - startedAt) / 1000, browserFrame: frameCount, frameDeltaSeconds: deltaSeconds, snapshotSchemaVersion: snapshot?.schemaVersion ?? null, simulationTick: snapshot?.simulationTick ?? null, simulationSeconds: snapshot?.simulationSeconds ?? null, isRunning: snapshot?.isRunning ?? null, positionMetersXYZ: position(world.player), velocityMetersPerSecondXYZ: entity?.motion?.velocityWorldMetersPerSecondXYZ ?? null, isGrounded: entity?.motion?.isGrounded ?? null, collisionEntityIds: entity?.motion?.collisionEntityIds ?? null, actionId: entity?.animation?.actionId ?? null, clipName: entity?.animation?.clipName ?? null, animationTimeSeconds: entity?.animation?.timeSeconds ?? null, movementId: entity?.movementId ?? null, worldRevision: snapshot?.worldRevision ?? null, camera: snapshot?.camera ?? null, characterContinuity: characterContinuity.read(world,snapshot??null), water: snapshot?.training?.water ?? null, training: snapshot?.training ?? null, errors: snapshot?.errors ?? [] };
  }
  const frames: number[] = [];
  function frame(now: number) {
    if (!active) return;
    if (recorder?.state === 'recording' && now-lastCapturedAt >= captureIntervalMilliseconds) { requestRecordedFrame(); lastCapturedAt = now; }
    frameCount++; const dt = previousFrameAt ? (now - previousFrameAt) / 1000 : 0; previousFrameAt = now; frames.push(dt);
    if (now - lastSampleAt >= 90) { try { trace.push(sample(dt)); } catch (error) { trace.push({ wallSeconds: (now - startedAt) / 1000, observationError: String(error) }); } lastSampleAt = now; }
    requestAnimationFrame(frame);
  }
  return {
    ready() { try { const world=observation();characterContinuity.read(world,world.snapshot?.()??null);return true; } catch { return false; } },
    inspect(query?: InspectionQuery) {
      const world = observation();
      const {sections, ...selection} = query ?? {};
      const includes = (section: InspectionSection) => !sections || sections.includes(section);
      const snapshot = world.snapshot?.() ?? null;
      const hierarchy = () => {
        world.scene.updateMatrixWorld(true);
        const objects: ReturnType<typeof describe>[] = [];
        world.scene.traverse(object => { if (objects.length < 1000) objects.push(describe(object)); });
        return {
          player: describe(world.player),
          camera: {...describe(world.camera), projectionMatrix: world.camera.projectionMatrix.toArray()},
          targets: Object.fromEntries(Object.entries(world.targets).map(([id, object]) => [id, describe(object)])),
          objects,
          renderer: {
            widthPixels: world.renderer.domElement.width, heightPixels: world.renderer.domElement.height,
            memory: {...world.renderer.info.memory}, render: {...world.renderer.info.render},
          },
        };
      };
      return {
        sample: {
          worldRevision: snapshot?.worldRevision ?? null, simulationTick: snapshot?.simulationTick ?? null,
          simulationSeconds: snapshot?.simulationSeconds ?? null, isRunning: snapshot?.isRunning ?? null,
        },
        commandsSupported: typeof world.execute === 'function',
        ...(includes('hierarchy') ? hierarchy() : {}),
        ...(includes('snapshot') ? {snapshot, characterContinuity: characterContinuity.read(world, snapshot)} : {}),
        ...(includes('description') ? {description: world.capabilities?.(selection) ?? null} : {}),
        ...(includes('diagnostics') ? {diagnostics: world.inspect?.() ?? null} : {}),
      };
    },
    async executeCommand(command: WorldCommand, commandId: string) {
      const world = observation(); if (!world.execute) throw new Error('THREE_WORLD_COMMANDS_UNSUPPORTED');
      const before = world.snapshot?.() ?? null;
      const worldCommandReceipt = await world.execute(command, { commandId });
      if (worldCommandReceipt.commandId !== commandId) throw new Error('THREE_WORLD_COMMAND_ID_MISMATCH');
      return { worldCommandReceipt, before, after: world.snapshot?.() ?? null };
    },
    worldOperation(worldOperationId: string) {
      const world = observation(); if (!world.operation) throw new Error('THREE_WORLD_OPERATIONS_UNSUPPORTED');
      return world.operation(worldOperationId);
    },
    async reset() { const world = observation(); await world.stopLive(); await world.reset(); withCapturePresentation(world,()=>world.renderer.render(world.scene,world.camera)); },
    async start() {
      const world = observation();
      // Existing gallery integrations use this small lifecycle alias for both profiles.
      const browser = window as unknown as Record<string, unknown>;
      browser.__WORLDKIT_CREATOR__ ??= { startLive: () => world.startLive(), stopLive: () => world.stopLive() };
      if (world.presentation) world.presentation.focus();
      else { world.renderer.domElement.tabIndex = 0; world.renderer.domElement.focus(); }
      await world.startLive();
    },
    async stop() { await observation().stopLive(); },
    beginTrace() { trace = []; events = []; frames.length = 0; frameCount = 0; active = true; startedAt = performance.now(); previousFrameAt = 0; lastSampleAt = 0; trace.push(sample(0)); requestAnimationFrame(frame); },
    endTrace: finishTrace,
    async finishRun() {
      const traceResult = finishTrace(); await observation().stopLive();
      // Stop and flush recording before serializing the potentially large trace.
      return { trace: traceResult, recording: await finishRecording(traceResult.timing.endedAtMilliseconds) };
    },
    read() { return sample(0); },
    latestSample() { return trace.at(-1) ?? sample(0); },
    async beginRecording(framesPerSecond: number) {
      if (recorder) throw new Error('THREE_RECORDING_ALREADY_ACTIVE');
      recordedChunks = []; requestedFrames = 0; captureIntervalMilliseconds = 1000 / framesPerSecond; lastCapturedAt = -Infinity;
      // Capture the actual canvas at wall-clock times, including a deliberately paused scene.
      // requestFrame does not advance simulation or render a substitute frame.
      stream = observation().renderer.domElement.captureStream(0);
      recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 1_500_000 });
      recorder.addEventListener('dataavailable', event => { if (event.data.size) recordedChunks.push(event.data); });
      const current = recorder;
      const started = new Promise<void>((resolve, reject) => { current.addEventListener('start', () => resolve(), { once: true }); current.addEventListener('error', event => reject(event), { once: true }); });
      recordingStartedAt = performance.now(); current.start(1000);
      // A zero-rate stream needs an actual frame before some browsers emit start.
      initialFrameRequestedAt = performance.now(); requestRecordedFrame();
      const world = observation(); withCapturePresentation(world,()=>world.renderer.render(world.scene,world.camera));
      await started; await flushCurrentCanvas(current);
    },
    endRecording: finishRecording,
    captureTargets() { return captureTargets(observation()); },
    capture(view: 'opening' | 'current' | 'top-down' | 'entity-triview', entityIds: string[] = [], frontYawRadians: number | null = null) {
      const world = observation();
      if (view === 'opening' || view === 'current') return withCapturePresentation(world,()=>{
        world.scene.updateMatrixWorld(true);world.renderer.render(world.scene,world.camera);
        return {view,image:world.renderer.domElement.toDataURL('image/png'),player:describe(world.player),
          ...(view === 'current' ? {cameraObservation: currentCameraObservation(world)} : {})};
      });
      return captureObjectViews(world, view, entityIds, frontYawRadians);
    },
  };
}
if (typeof window !== 'undefined') {
  window.__THREE_CREATOR_HOST__ = createBridge();
  // Install immediately, before author modules finish, so a fresh exported raw
  // page supports gallery lifecycle without first having been opened by a tool.
  (window as unknown as Record<string, unknown>).__WORLDKIT_CREATOR__ ??= {
    startLive: () => observation().startLive(), stopLive: () => observation().stopLive(), reset: () => observation().reset(),
  };
}
