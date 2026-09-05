import * as THREE from 'three';
import type { WorldCommand, WorldDescription, WorldObservation } from '@worldkit/three';

declare global {
  interface Window {
    __WORLDKIT_EVAL__?: WorldObservation;
    __THREE_CREATOR_HOST__?: ReturnType<typeof createBridge>;
  }
}
const position = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3()).toArray();
/** Projection of cached geometry bounds, not a pixel mask or an occlusion test. */
export function projectedPlayerBounds(player: THREE.Object3D, camera: THREE.Camera) {
  player.updateWorldMatrix(true, true); camera.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3().setFromObject(player);
  if (bounds.isEmpty()) return null;
  const points: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) points.push(new THREE.Vector3(x, y, z));
  const near = (camera as THREE.PerspectiveCamera).near ?? 0;
  const isFullyInFrontOfCamera = points.every(point => point.clone().applyMatrix4(camera.matrixWorldInverse).z < -near);
  const projected = isFullyInFrontOfCamera ? points.map(point => point.project(camera)) : [];
  const minimumUv = projected.length ? [Math.min(...projected.map(point => (point.x + 1) / 2)), Math.min(...projected.map(point => (1 - point.y) / 2))] : null;
  const maximumUv = projected.length ? [Math.max(...projected.map(point => (point.x + 1) / 2)), Math.max(...projected.map(point => (1 - point.y) / 2))] : null;
  return { minimumMetersXYZ: bounds.min.toArray(), maximumMetersXYZ: bounds.max.toArray(), minimumUv, maximumUv, isFullyInFrontOfCamera,
    isFullyInsideViewport: !!minimumUv && !!maximumUv && minimumUv.every(value => value >= 0) && maximumUv.every(value => value <= 1) };
}
export type CameraPreviewSample = {
  renderIndex: number; wallSeconds: number; positionWorldMetersXYZ: number[]; orientationWorldQuaternionXYZW: number[];
  playerBounds: ReturnType<typeof projectedPlayerBounds>;
};
export const CAMERA_PREVIEW_THRESHOLDS = { angularStepRadians: Math.PI / 36, angularSpeedRadiansPerSecond: Math.PI,
  positionStepMeters: 0.35, positionSpeedMetersPerSecond: 20 } as const;
export function cameraPreviewDelta(before: CameraPreviewSample, after: CameraPreviewSample) {
  const elapsedSeconds = after.wallSeconds - before.wallSeconds;
  const angularStepRadians = new THREE.Quaternion().fromArray(before.orientationWorldQuaternionXYZW).angleTo(new THREE.Quaternion().fromArray(after.orientationWorldQuaternionXYZW));
  const positionStepMeters = new THREE.Vector3().fromArray(before.positionWorldMetersXYZ).distanceTo(new THREE.Vector3().fromArray(after.positionWorldMetersXYZ));
  const angularSpeedRadiansPerSecond = elapsedSeconds > 0 ? angularStepRadians / elapsedSeconds : null;
  const positionSpeedMetersPerSecond = elapsedSeconds > 0 ? positionStepMeters / elapsedSeconds : null;
  const signals: string[] = [];
  if (angularStepRadians > CAMERA_PREVIEW_THRESHOLDS.angularStepRadians && angularSpeedRadiansPerSecond !== null && angularSpeedRadiansPerSecond > CAMERA_PREVIEW_THRESHOLDS.angularSpeedRadiansPerSecond) signals.push('large-angular-step');
  if (positionStepMeters > CAMERA_PREVIEW_THRESHOLDS.positionStepMeters && positionSpeedMetersPerSecond !== null && positionSpeedMetersPerSecond > CAMERA_PREVIEW_THRESHOLDS.positionSpeedMetersPerSecond) signals.push('large-position-step');
  if (before.playerBounds?.isFullyInsideViewport && after.playerBounds && !after.playerBounds.isFullyInsideViewport) signals.push('player-bounds-left-viewport');
  return { fromRenderIndex: before.renderIndex, toRenderIndex: after.renderIndex, wallSeconds: after.wallSeconds, elapsedSeconds,
    angularStepRadians, angularSpeedRadiansPerSecond, positionStepMeters, positionSpeedMetersPerSecond, signals };
}
/** Semantic local front is -Z; preserve the entire parent/object orientation. */
export function targetTriviewBasis(object: THREE.Object3D, frontYawRadians = 0) {
  if (!Number.isFinite(frontYawRadians)) throw new Error('THREE_TARGET_FRONT_YAW_INVALID');
  object.updateWorldMatrix(true, false);
  const rotation = object.getWorldQuaternion(new THREE.Quaternion());
  const front = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), frontYawRadians).applyQuaternion(rotation).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).normalize();
  const right = front.clone().cross(up).normalize();
  return { front, right, back: front.clone().negate(), up };
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
export function filterDescription(value: WorldDescription | null, query?: { query?: string; entityIds?: string[] }): WorldDescription | null {
  if (!value || !query) return value;
  const words = query.query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  return { ...value, entities: value.entities.filter(entity => (!query.entityIds?.length || query.entityIds.includes(entity.state.id)) && words.every(word => JSON.stringify(entity).toLowerCase().includes(word))) };
}
/** Observes the real renderer temporarily; never advances the world clock. */
export function observeCameraPreview(world: WorldObservation) {
  const startedAt = performance.now(), renderer = world.renderer, originalRender = renderer.render;
  const samples: CameraPreviewSample[] = [], events: Array<{ delta: ReturnType<typeof cameraPreviewDelta>; before: CameraPreviewSample; after: CameraPreviewSample }> = [];
  const keyframes: Array<{ reason: string; renderIndex: number; wallSeconds: number; captureSurface: 'world-canvas'; image: string }> = [];
  const sdkCameraSamples: Array<{ reason: string; renderIndex: number; wallSeconds: number; simulationTick: number | null; simulationSeconds: number | null; camera: unknown }> = [];
  const warnings: string[] = [];
  const maxima: Record<string, { value: number; fromRenderIndex: number; toRenderIndex: number; elapsedSeconds: number }> = {};
  let previous: CameraPreviewSample | undefined, renderCount = 0, droppedSamples = 0, captureAttempts = 0, isObserving = true, isBeforeInput = true;
  const warn = (error: unknown) => { if (warnings.length < 4) warnings.push(String(error)); };
  function sdkSample(reason: string, sample: CameraPreviewSample) {
    try { const snapshot = world.snapshot?.(); sdkCameraSamples.push({ reason, renderIndex: sample.renderIndex, wallSeconds: (performance.now() - startedAt) / 1000,
      simulationTick: snapshot?.simulationTick ?? null, simulationSeconds: snapshot?.simulationSeconds ?? null, camera: snapshot?.camera ?? null }); } catch (error) { warn(error); }
  }
  function capture(reason: string, sample: CameraPreviewSample) {
    captureAttempts++;
    try { keyframes.push({ reason, renderIndex: sample.renderIndex, wallSeconds: sample.wallSeconds, captureSurface: 'world-canvas', image: renderer.domElement.toDataURL('image/png') }); } catch (error) { warn(error); }
    sdkSample(reason, sample);
  }
  function observeRenderedFrame() {
    const current: CameraPreviewSample = { renderIndex: renderCount++, wallSeconds: (performance.now() - startedAt) / 1000,
      positionWorldMetersXYZ: position(world.camera), orientationWorldQuaternionXYZW: world.camera.getWorldQuaternion(new THREE.Quaternion()).toArray(),
      playerBounds: projectedPlayerBounds(world.player, world.camera) };
    if (samples.length < 4096) samples.push(current); else droppedSamples++;
    if (!previous) capture(isBeforeInput ? 'before-input' : 'first-observed-render', current);
    else {
      const delta = cameraPreviewDelta(previous, current);
      for (const name of ['angularStepRadians', 'angularSpeedRadiansPerSecond', 'positionStepMeters', 'positionSpeedMetersPerSecond'] as const) {
        const value = delta[name]; if (value !== null && (!maxima[name] || value > maxima[name].value)) maxima[name] = { value, fromRenderIndex: delta.fromRenderIndex, toRenderIndex: delta.toRenderIndex, elapsedSeconds: delta.elapsedSeconds };
      }
      if (delta.signals.length) {
        if (events.length < 8) events.push({ delta, before: previous, after: current });
        if (captureAttempts < 2) capture('first-heuristic-transition', current);
      }
    }
    previous = current;
  }
  const wrappedRender: typeof renderer.render = function (...args) {
    originalRender.apply(renderer, args);
    if (isObserving && args[0] === world.scene && args[1] === world.camera && renderer.getRenderTarget?.() == null) {
      try { observeRenderedFrame(); } catch (error) { warn(error); }
    }
  };
  renderer.render = wrappedRender;
  try { renderer.render(world.scene, world.camera); }
  catch (error) { renderer.render = originalRender; throw error; }
  isBeforeInput = false;
  return { finish() {
    isObserving = false;
    if (renderer.render === wrappedRender) renderer.render = originalRender;
    if (previous) sdkSample('after-input', previous);
    else warn('No direct main-scene canvas renders observed; camera continuity is unavailable.');
    return { kind: 'three-camera-preview-diagnostics', schemaVersion: 1, informationalOnly: true,
      evidence: { poseSampling: 'after-actual-main-scene-render', rateClock: 'browser-performance-wall-seconds', playerBounds: 'cached-geometry-world-aabb-projection',
        limitation: 'Observes direct main-scene canvas renders; offscreen/postprocessing passes are excluded. Bounds are approximate (including cached animated-mesh bounds), not a visible-pixel or occlusion test. Large steps are heuristics; intentional orbit, camera cuts and input can trigger them. Rates include actual browser stalls and capture overhead. SDK arm/obstruction/ticks are sampled only at the labeled points, not every render.' },
      durationSeconds: (performance.now() - startedAt) / 1000, observedRenderCount: renderCount, storedSampleCount: samples.length, droppedSampleCount: droppedSamples,
      heuristicThresholds: CAMERA_PREVIEW_THRESHOLDS, maxima, events, sdkCameraSamples, warnings, keyframes, samples };
  } };
}
function createBridge() {
  let cameraPreview: ReturnType<typeof observeCameraPreview> | undefined;
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
    world.renderer.render(world.scene, world.camera); await afterPaint();
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
    return { wallSeconds: (performance.now() - startedAt) / 1000, browserFrame: frameCount, frameDeltaSeconds: deltaSeconds, snapshotSchemaVersion: snapshot?.schemaVersion ?? null, simulationTick: snapshot?.simulationTick ?? null, simulationSeconds: snapshot?.simulationSeconds ?? null, isRunning: snapshot?.isRunning ?? null, positionMetersXYZ: position(world.player), velocityMetersPerSecondXYZ: entity?.motion?.velocityWorldMetersPerSecondXYZ ?? null, isGrounded: entity?.motion?.isGrounded ?? null, collisionEntityIds: entity?.motion?.collisionEntityIds ?? null, actionId: entity?.animation?.actionId ?? null, clipName: entity?.animation?.clipName ?? null, animationTimeSeconds: entity?.animation?.timeSeconds ?? null, movementId: entity?.movementId ?? null, worldRevision: snapshot?.worldRevision ?? null, camera: snapshot?.camera ?? null, errors: snapshot?.errors ?? [] };
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
    ready() { try { observation(); return true; } catch { return false; } },
    inspect(query?: { query?: string; entityIds?: string[] }) {
      const world = observation(); world.scene.updateMatrixWorld(true);
      const objects: ReturnType<typeof describe>[] = []; world.scene.traverse(object => { if (objects.length < 1000) objects.push(describe(object)); });
      return { player: describe(world.player), camera: { ...describe(world.camera), projectionMatrix: world.camera.projectionMatrix.toArray() }, targets: Object.fromEntries(Object.entries(world.targets).map(([id, object]) => [id, describe(object)])), snapshot: world.snapshot?.() ?? null, description: filterDescription(world.capabilities?.() ?? null, query), commandsSupported: typeof world.execute === 'function', diagnostics: world.inspect?.() ?? null, objects, renderer: { widthPixels: world.renderer.domElement.width, heightPixels: world.renderer.domElement.height, memory: { ...world.renderer.info.memory }, render: { ...world.renderer.info.render } } };
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
    async reset() { const world = observation(); await world.stopLive(); await world.reset(); world.renderer.render(world.scene, world.camera); },
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
    beginCameraPreview() { cameraPreview?.finish(); cameraPreview = observeCameraPreview(observation()); },
    endCameraPreview() { const current = cameraPreview; cameraPreview = undefined; return current?.finish() ?? null; },
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
      const world = observation(); world.renderer.render(world.scene, world.camera);
      await started; await flushCurrentCanvas(current);
    },
    endRecording: finishRecording,
    capture(view: 'opening' | 'top-down' | 'entity-triview', entityIds: string[] = [], frontYawRadians: number | null = null) {
      const world = observation(), { scene, renderer } = world;
      scene.updateMatrixWorld(true);
      if (view === 'opening') { renderer.render(scene, world.camera); return { view, image: renderer.domElement.toDataURL('image/png'), player: describe(world.player) }; }
      const targets = entityIds.length ? entityIds.map(id => { const target = id === 'player' ? world.player : world.targets[id]; if (!target) throw new Error(`THREE_TARGET_UNKNOWN: ${id}`); return target; }) : view === 'entity-triview' ? [world.player] : [scene];
      const firstId = entityIds[0] ?? 'player';
      const orientationTargetId = firstId === 'player' ? Object.entries(world.targets).find(([, object]) => object === world.player)?.[0] ?? 'player' : firstId;
      const semanticFrontYawRadians = frontYawRadians ?? world.targetFrontYawRadiansById?.[orientationTargetId] ?? world.targetFrontYawRadiansById?.[firstId] ?? 0;
      const basis = targetTriviewBasis(targets[0]!, semanticFrontYawRadians);
      const bounds = new THREE.Box3(); for (const object of targets) bounds.union(new THREE.Box3().setFromObject(object, true));
      if (bounds.isEmpty() || !Number.isFinite(bounds.min.x + bounds.max.x)) throw new Error('THREE_TARGET_BOUNDS_EMPTY');
      const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3()), extent = Math.max(size.x, size.y, size.z, 0.1) * 0.65;
      const oldSize = renderer.getSize(new THREE.Vector2()), pixelRatio = renderer.getPixelRatio(), viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4()), scissorTest = renderer.getScissorTest(), background = scene.background, autoClear = renderer.autoClear;
      const hidden: THREE.Object3D[] = [];
      if (view === 'entity-triview') {
        const included = new Set<THREE.Object3D>(); for (const target of targets) { target.traverse(object => included.add(object)); let parent = target.parent; while (parent) { included.add(parent); parent = parent.parent; } }
        scene.traverse(object => { if ((object as THREE.Mesh).isMesh && object.visible && !included.has(object)) { object.visible = false; hidden.push(object); } });
        scene.background = new THREE.Color('#e6e9ef');
      }
      try {
        const panels = view === 'entity-triview' ? 3 : 1, panelWidth = view === 'entity-triview' ? 512 : 960, height = view === 'entity-triview' ? 640 : 720;
        renderer.setPixelRatio(1); renderer.setSize(panelWidth * panels, height, false); renderer.autoClear = false; renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
        for (let index = 0; index < panels; index++) {
          const halfY = extent * Math.max(1, height / panelWidth), halfX = halfY * panelWidth / height;
          const camera = new THREE.OrthographicCamera(-halfX, halfX, halfY, -halfY, 0.01, extent * 30 + 100);
          if (view === 'top-down') { camera.position.copy(center).add(new THREE.Vector3(0, extent * 4 + 5, 0)); camera.up.set(0, 0, -1); }
          else { const direction = [basis.front, basis.right, basis.back][index]!; camera.position.copy(center).addScaledVector(direction, extent * 4); camera.up.copy(basis.up); }
          camera.lookAt(center); camera.updateMatrixWorld(true);
          renderer.setViewport(index * panelWidth, 0, panelWidth, height); renderer.setScissor(index * panelWidth, 0, panelWidth, height); renderer.render(scene, camera);
        }
        return { view, entityIds: entityIds.length ? entityIds : ['player'], orientationTargetId, frontYawRadians: semanticFrontYawRadians, frontDirectionWorldXYZ: basis.front.toArray(), rightDirectionWorldXYZ: basis.right.toArray(), upDirectionWorldXYZ: basis.up.toArray(), image: renderer.domElement.toDataURL('image/png'), bounds: { minimumMetersXYZ: bounds.min.toArray(), maximumMetersXYZ: bounds.max.toArray() }, panelOrder: view === 'entity-triview' ? ['front', 'right', 'back'] : ['top-down'] };
      } finally {
        for (const object of hidden) object.visible = true;
        scene.background = background; renderer.autoClear = autoClear; renderer.setPixelRatio(pixelRatio); renderer.setSize(oldSize.x, oldSize.y, false); renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest); renderer.render(scene, world.camera);
      }
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
