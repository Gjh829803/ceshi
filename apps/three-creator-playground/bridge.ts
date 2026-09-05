import * as THREE from 'three';
import type { WorldCommand, WorldDescription, WorldObservation } from '@worldkit/three';

declare global {
  interface Window {
    __WORLDKIT_EVAL__?: WorldObservation;
    __THREE_CREATOR_HOST__?: ReturnType<typeof createBridge>;
  }
}
const position = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3()).toArray();
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
function createBridge() {
  let trace: any[] = [], events: any[] = [], frameCount = 0, active = false, startedAt = 0, previousFrameAt = 0, lastSampleAt = 0;
  let recorder: MediaRecorder | undefined, recordedChunks: Blob[] = [], stream: MediaStream | undefined;
  let captureIntervalMilliseconds = 1000 / 3, lastCapturedAt = -Infinity;
  const requestRecordedFrame = () => { const track = stream?.getVideoTracks()[0]; if (track && 'requestFrame' in track) (track as CanvasCaptureMediaStreamTrack).requestFrame(); };
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
      world.renderer.domElement.tabIndex = 0; world.renderer.domElement.focus(); await world.startLive();
    },
    async stop() { await observation().stopLive(); },
    beginTrace() { trace = []; events = []; frames.length = 0; frameCount = 0; active = true; startedAt = performance.now(); previousFrameAt = 0; lastSampleAt = 0; trace.push(sample(0)); requestAnimationFrame(frame); },
    endTrace() { active = false; trace.push(sample(0)); return { samples: trace, keyboardEvents: events, browserFrameDeltasSeconds: frames }; },
    read() { return sample(0); },
    latestSample() { return trace.at(-1) ?? sample(0); },
    beginRecording(framesPerSecond: number) {
      if (recorder) throw new Error('THREE_RECORDING_ALREADY_ACTIVE');
      recordedChunks = []; captureIntervalMilliseconds = 1000 / framesPerSecond; lastCapturedAt = -Infinity;
      // Capture the actual canvas at wall-clock times, including a deliberately paused scene.
      // requestFrame does not advance simulation or render a substitute frame.
      stream = observation().renderer.domElement.captureStream(0);
      recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 1_500_000 });
      recorder.addEventListener('dataavailable', event => { if (event.data.size) recordedChunks.push(event.data); }); recorder.start(1000); requestRecordedFrame();
    },
    async endRecording() {
      const current = recorder; if (!current) throw new Error('THREE_RECORDING_NOT_ACTIVE');
      requestRecordedFrame(); await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve, reject) => { current.addEventListener('stop', () => resolve(), { once: true }); current.addEventListener('error', event => reject(event), { once: true }); current.stop(); });
      stream?.getTracks().forEach(track => track.stop()); recorder = undefined; stream = undefined;
      const blob = new Blob(recordedChunks, { type: 'video/webm' }); recordedChunks = [];
      return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
    },
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
