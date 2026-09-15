import { Euler, Vector3 } from 'three';
import { emptyHumanoidInput, type CameraOrbitOptions, type ThreeWorld, type WorldCommand, type WorldInput } from '@worldkit/three';

export type DebugWorld = Pick<ThreeWorld, 'camera' | 'humanoid' | 'snapshot' | 'inspectCamera' | 'getEntityState' | 'setCameraFollow' | 'setCameraView' | 'useAuthoredCamera' | 'step' | 'execute'>;
export interface DebugControlsPort {
  readonly getWorld: () => DebugWorld | undefined;
  readonly isReady: () => boolean;
  readonly isPaused: () => boolean;
  readonly setPaused: (paused: boolean) => void | Promise<void>;
  readonly clearInput: () => void;
  /** Draw the existing paused world; must not advance simulation. */
  readonly render: () => void;
  /** Bind only the public SDK owner entry; never an editor/private-state shim. */
  readonly setCameraOrbit: (options: CameraOrbitOptions) => void | Promise<void>;
}
export interface DebugControlTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: object;
  readonly annotations: { readonly readOnlyHint: boolean };
  readonly execute: (input: unknown) => unknown | Promise<unknown>;
}
const objectSchema = <const T extends Record<string, unknown>>(properties: T, required: readonly string[] = Object.keys(properties)) =>
  ({ type: 'object', properties, required, additionalProperties: false });
const numberSchema = { type: 'number' };
const vectorSchema = { type: 'array', items: numberSchema, minItems: 3, maxItems: 3 };
const ratioKeys = ['moveXRatio', 'moveZRatio', 'moveYRatio', 'cameraYawRatio', 'cameraPitchRatio'] as const;
const booleanKeys = ['run', 'jumpPressed', 'interactPressed'] as const;
const postureKeys = ['toggleCrouch', 'prone', 'cancel'] as const;
export const DEBUG_CONTROL_SCHEMAS = {
  inspect: objectSchema({}),
  simulation: objectSchema({ paused: { type: 'boolean' } }),
  step: objectSchema({ frames: { type: 'integer', minimum: 1, maximum: 120, default: 1 }, input: objectSchema({
    ...Object.fromEntries(ratioKeys.map(key => [key, { type: 'number', minimum: -1, maximum: 1 }])),
    ...Object.fromEntries(booleanKeys.map(key => [key, { type: 'boolean' }])),
    characterActions: objectSchema(Object.fromEntries(postureKeys.map(key => [key, { type: 'boolean' }])), []),
  }, []) }, []),
  characterPose: objectSchema({ positionWorldMetersXYZ: vectorSchema, facingYawRadians: {
    type: 'number', description: 'Public World/Episode heading: zero faces -Z; radians around +Y.',
  } }),
  camera: { oneOf: [
    { ...objectSchema({ mode: { const: 'orbit' }, yawRadians: numberSchema, pitchRadians: numberSchema, distanceMeters: { type: 'number', minimum: 0 } }, ['mode']),
      anyOf: ['yawRadians', 'pitchRadians', 'distanceMeters'].map(key => ({ required: [key] })) },
    objectSchema({ mode: { const: 'authored' }, positionWorldMetersXYZ: vectorSchema, lookAtWorldMetersXYZ: vectorSchema, upWorldXYZ: vectorSchema }, ['mode', 'positionWorldMetersXYZ', 'lookAtWorldMetersXYZ']),
    objectSchema({ mode: { const: 'follow' }, viewId: { type: 'string', minLength: 1 } }),
  ] },
  vehicleAction: { oneOf: [objectSchema({ action: { const: 'enter' }, vehicleId: { type: 'string', minLength: 1 } }), objectSchema({ action: { const: 'exit' } })] },
} as const;

class DebugControlError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
function fail(code: string, message: string): never { throw new DebugControlError(code, message); }
function record(value: unknown, allowed: readonly string[], required: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('DEBUG_INPUT_INVALID', 'Expected an object.');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(result, key)))
    fail('DEBUG_INPUT_INVALID', 'Unexpected or missing fields.');
  return result;
}
function finite(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('DEBUG_INPUT_INVALID', `${field} must be finite.`);
  return value;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) fail('DEBUG_INPUT_INVALID', `${field} must be a nonempty string.`);
  return value;
}
function vector(value: unknown, field: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) fail('DEBUG_INPUT_INVALID', `${field} must contain three finite numbers.`);
  return value.map((entry, index) => finite(entry, `${field}[${index}]`)) as [number, number, number];
}
function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') fail('DEBUG_INPUT_INVALID', `${field} must be boolean.`);
  return value;
}

/** Small explicit maintainer controls. State and simulation remain owned by SDK. */
export function createPlaygroundDebugControls(port: DebugControlsPort) {
  let busy = false;
  const world = (): DebugWorld => {
    const value = port.getWorld();
    if (!port.isReady() || !value) fail('DEBUG_WORLD_NOT_READY', 'The Playground world is not ready.');
    return value;
  };
  const controlledHumanoid = (sdk: DebugWorld) => {
    const snapshot = sdk.snapshot();
    if (!sdk.humanoid || snapshot.humanoid?.character.instanceId !== snapshot.controlledEntityId)
      fail('DEBUG_HUMANOID_REQUIRED', 'The controlled entity must be a native humanoid.');
    return { runtime: sdk.humanoid, snapshot, actorId: snapshot.controlledEntityId! };
  };
  const readState = (includeCapabilities = false) => {
    const sdk = port.getWorld();
    if (!port.isReady() || !sdk) return { ready: false, paused: port.isPaused() };
    const snapshot = sdk.snapshot(), camera = sdk.inspectCamera(), actorId = snapshot.controlledEntityId;
    const entity = actorId ? snapshot.entities.find(value => value.id === actorId) : undefined;
    const humanoid = snapshot.humanoid;
    const facing = entity && humanoid && !humanoid.mountedInstanceId ? new Vector3(0, 0, 1).applyEuler(new Euler(...entity.rotationLocalRadiansXYZ)) : undefined;
    return {
      ready: true, paused: port.isPaused(), isRunning: snapshot.isRunning, simulationTick: snapshot.simulationTick,
      simulationSeconds: snapshot.simulationSeconds, worldRevision: snapshot.worldRevision,
      character: entity ? { entityId: entity.id, positionWorldMetersXYZ: entity.positionWorldMetersXYZ,
        rotationLocalRadiansXYZ: entity.rotationLocalRadiansXYZ, facingYawRadians: facing ? Math.atan2(-facing.x, -facing.z) : null, motion: entity.motion ?? null,
        ...(humanoid ? { ...humanoid.character, mountedInstanceId: humanoid.mountedInstanceId, transition: humanoid.transition, surface: humanoid.surface, traversal: humanoid.traversal, message: humanoid.message } : {}) } : null,
      camera: { ...snapshot.camera, intent: camera.intent ? { yawRadians: camera.intent.yawRadians, pitchRadians: camera.intent.pitchRadians, distanceMeters: camera.intent.distanceMeters } : null,
        views: Object.entries(camera.document?.views ?? {}).map(([viewId, view]) => ({ viewId, kind: view.kind })),
        defaultViewId: camera.document?.defaultViewId ?? null,
      },
      ...(includeCapabilities ? { capabilities: {
        characterPose: !!humanoid && humanoid.character.instanceId === actorId && humanoid.mountedInstanceId === null && humanoid.transition.remainingSeconds === 0,
        cameraOrbit: camera.mode === 'follow',
        cameraOrbitDistance: camera.mode === 'follow' && camera.resolved?.kind !== 'first-person',
        cameraOrbitLimits: camera.mode === 'follow' && camera.resolved ? {
          referenceFrame: camera.resolved.values.orientation.referenceFrame,
          yawLimitsRadians: camera.resolved.values.orientation.yawLimitsRadians,
          pitchLimitsRadians: camera.resolved.values.orientation.pitchLimitsRadians,
          zoomRange: camera.resolved.kind === 'first-person' ? null : camera.resolved.values.zoom.range,
        } : null,
        cameraOrbitUnavailableReason: camera.mode !== 'follow' ? 'An active follow view is required.' : null,
        authoredCamera: true,
        actions: humanoid?.characterCapabilities ?? [],
        vehicles: humanoid?.vehicles.map(({ instanceId, mode, available }) => ({ instanceId, mode, available })) ?? [],
        interactionTargets: humanoid?.interactionTargets.map(({ id, slotId, kind, eligible, reason, message }) => ({ id, slotId, kind, eligible, reason, message })) ?? [],
      } } : {}),
      errors: snapshot.errors,
    };
  };
  const inspect = () => readState(true);
  const errorDetails = (error: unknown) => {
    const detail = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : undefined;
    return { code: typeof detail?.code === 'string' ? detail.code : 'DEBUG_CONTROL_FAILED',
      message: typeof detail?.message === 'string' ? detail.message : String(error) };
  };
  const safeState = () => {
    try { return readState(); }
    catch (error) { return { available: false, error: errorDetails(error) }; }
  };
  const rejection = (error: unknown) => ({ status: 'rejected' as const, ...errorDetails(error), state: safeState() });
  const run = async (work: () => unknown | Promise<unknown>) => {
    if (busy) return rejection(new DebugControlError('DEBUG_CONTROL_BUSY', 'Another debug operation is in progress.'));
    busy = true;
    try { const result = await work(); return { status: 'applied' as const, result, state: safeState() }; }
    catch (error) { return rejection(error); }
    finally { busy = false; }
  };
  const pauseAfterChange = async () => { await port.setPaused(true); port.clearInput(); port.render(); };
  const setSimulation = (value: unknown) => run(async () => {
    const input = record(value, ['paused'], ['paused']), paused = boolean(input.paused, 'paused');
    world(); await port.setPaused(paused); if (paused) port.render();
  });
  const stepSimulation = (value: unknown) => run(async () => {
    const input = record(value, ['frames', 'input']);
    const frames = Object.hasOwn(input, 'frames') ? finite(input.frames, 'frames') : 1;
    if (!Number.isInteger(frames) || frames < 1 || frames > 120) fail('DEBUG_INPUT_INVALID', 'frames must be an integer from 1 to 120.');
    const raw = Object.hasOwn(input, 'input') ? record(input.input, [...ratioKeys, ...booleanKeys, 'characterActions']) : {};
    const controls: Record<string, number | boolean> = {};
    for (const key of ratioKeys) if (Object.hasOwn(raw, key)) {
      const amount = finite(raw[key], key); if (amount < -1 || amount > 1) fail('DEBUG_INPUT_INVALID', `${key} must be between -1 and 1.`); controls[key] = amount;
    }
    for (const key of booleanKeys) if (Object.hasOwn(raw, key)) controls[key] = boolean(raw[key], key);
    const sdk = world();
    let sdkInput = controls as WorldInput;
    if (Object.hasOwn(raw, 'characterActions')) {
      controlledHumanoid(sdk);
      const actionFields = record(raw.characterActions, postureKeys);
      const actions = Object.fromEntries(Object.entries(actionFields).map(([key, value]) => [key, boolean(value, `characterActions.${key}`)]));
      // An explicit native input must carry movement too: runtime intentionally
      // does not merge WorldInput movement into input.humanoid. SDK.step clears
      // actions and jump after its first fixed tick, even in a multi-tick call.
      sdkInput = { ...sdkInput, humanoid: { ...emptyHumanoidInput(),
        forward: -(sdkInput.moveZRatio ?? 0), steer: sdkInput.moveXRatio ?? 0, lift: sdkInput.moveYRatio ?? 0,
        boost: !!sdkInput.run, jump: !!sdkInput.jumpPressed, actions,
      } };
    }
    await port.setPaused(true); port.clearInput();
    const beforeTick = sdk.snapshot().simulationTick; sdk.step(sdkInput, frames); port.render();
    return { advancedTicks: sdk.snapshot().simulationTick - beforeTick };
  });
  const setCharacterPose = (value: unknown) => run(async () => {
    const input = record(value, ['positionWorldMetersXYZ', 'facingYawRadians'], ['positionWorldMetersXYZ', 'facingYawRadians']);
    const position = vector(input.positionWorldMetersXYZ, 'positionWorldMetersXYZ'), facing = finite(input.facingYawRadians, 'facingYawRadians');
    const { runtime, snapshot } = controlledHumanoid(world());
    if (snapshot.humanoid!.mountedInstanceId || snapshot.humanoid!.transition.remainingSeconds > 0)
      fail('DEBUG_CHARACTER_POSE_REQUIRES_ON_FOOT', 'Dismount and finish the transition before placing the character.');
    // prepareCharacter uses native +Z yaw. Public World/Episode heading is -Z.
    if (!runtime.prepareCharacter(position, facing + Math.PI)) fail('DEBUG_CHARACTER_PLACEMENT_REJECTED', runtime.snapshot().message);
    await pauseAfterChange();
  });
  const setCamera = (value: unknown) => run(async () => {
    const mode = record(value, ['mode', 'yawRadians', 'pitchRadians', 'distanceMeters', 'positionWorldMetersXYZ', 'lookAtWorldMetersXYZ', 'upWorldXYZ', 'viewId'], ['mode']).mode;
    const sdk = world(), camera = sdk.inspectCamera();
    if (mode === 'orbit') {
      const input = record(value, ['mode', 'yawRadians', 'pitchRadians', 'distanceMeters'], ['mode']);
      const options: Record<string, number> = {};
      for (const key of ['yawRadians', 'pitchRadians', 'distanceMeters'] as const) if (Object.hasOwn(input, key)) options[key] = finite(input[key], key);
      if (!Object.keys(options).length || (options.distanceMeters !== undefined && options.distanceMeters < 0)) fail('DEBUG_INPUT_INVALID', 'Supply at least one valid orbit field; distance cannot be negative.');
      if (camera.mode !== 'follow') fail('CAMERA_FOLLOW_REQUIRED', 'An active follow view is required.');
      if (camera.resolved?.kind === 'first-person' && options.distanceMeters !== undefined) fail('CAMERA_ORBIT_DISTANCE_UNAVAILABLE', 'First-person views do not have an orbit distance.');
      await port.setCameraOrbit(options); await pauseAfterChange();
    } else if (mode === 'follow') {
      const input = record(value, ['mode', 'viewId'], ['mode', 'viewId']), viewId = text(input.viewId, 'viewId');
      const document = camera.document;
      if (!document?.views[viewId]) fail('DEBUG_CAMERA_VIEW_UNAVAILABLE', `View ${viewId} is not declared in the current camera document.`);
      if (camera.mode === 'authored') {
        if (viewId !== document.defaultViewId) fail('DEBUG_CAMERA_RESTORE_DEFAULT_FIRST', `Restore ${document.defaultViewId} before selecting another follow view.`);
        sdk.setCameraFollow({ configuration: document });
      } else sdk.setCameraView(viewId);
      await pauseAfterChange();
    } else if (mode === 'authored') {
      const input = record(value, ['mode', 'positionWorldMetersXYZ', 'lookAtWorldMetersXYZ', 'upWorldXYZ'], ['mode', 'positionWorldMetersXYZ', 'lookAtWorldMetersXYZ']);
      const position = vector(input.positionWorldMetersXYZ, 'positionWorldMetersXYZ'), target = vector(input.lookAtWorldMetersXYZ, 'lookAtWorldMetersXYZ');
      const up = Object.hasOwn(input, 'upWorldXYZ') ? vector(input.upWorldXYZ, 'upWorldXYZ') : [0, 1, 0] as const;
      const span = Math.hypot(...position.map((n, i) => n - target[i]!)), upLength = Math.hypot(...up);
      if (!Number.isFinite(span) || span < 1e-6 || !Number.isFinite(upLength) || upLength < 1e-6) fail('DEBUG_INPUT_INVALID', 'Camera eye and target must differ, and up must be a nonzero finite vector.');
      const parent = sdk.camera.parent, scale = parent?.getWorldScale(new Vector3());
      if (scale && (Math.abs(scale.x - 1) > 1e-7 || Math.abs(scale.y - 1) > 1e-7 || Math.abs(scale.z - 1) > 1e-7)) fail('DEBUG_AUTHORED_PARENT_UNSUPPORTED', 'Authored debug positioning requires an unscaled camera parent.');
      const local = parent ? parent.worldToLocal(new Vector3(...position)) : new Vector3(...position);
      const owned = sdk.useAuthoredCamera(); owned.position.copy(local); owned.up.set(up[0], up[1], up[2]).normalize(); owned.lookAt(...target); owned.updateMatrixWorld(true);
      await pauseAfterChange();
    } else fail('DEBUG_INPUT_INVALID', 'Camera mode must be orbit, authored or follow.');
  });
  const execute = async (sdk: DebugWorld, command: WorldCommand) => {
    const receipt = await sdk.execute(command, { expectedWorldRevision: sdk.snapshot().worldRevision });
    if (receipt.status === 'rejected') fail(receipt.error.code, receipt.error.message);
    if (port.isPaused()) port.render();
    return receipt;
  };
  const vehicleAction = (value: unknown) => run(async () => {
    const input = record(value, ['action', 'vehicleId'], ['action']);
    if (input.action !== 'enter' && input.action !== 'exit') fail('DEBUG_INPUT_INVALID', 'Vehicle action must be enter or exit.');
    if (input.action === 'exit' && Object.hasOwn(input, 'vehicleId')) fail('DEBUG_INPUT_INVALID', 'Exit uses the currently mounted vehicle.');
    const vehicleId = input.action === 'enter' ? text(input.vehicleId, 'vehicleId') : undefined;
    const sdk = world(), { actorId, snapshot } = controlledHumanoid(sdk);
    if (vehicleId && !snapshot.humanoid!.vehicles.some(vehicle => vehicle.instanceId === vehicleId)) fail('DEBUG_VEHICLE_UNAVAILABLE', `Unknown vehicle ${vehicleId}.`);
    return execute(sdk, vehicleId ? { type: 'vehicle.enter', actorId, instanceId: vehicleId } : { type: 'vehicle.exit', actorId });
  });
  const tools: readonly DebugControlTool[] = [
    { name: 'inspect_debug_controls', description: 'Read compact character/camera state, declared views and actual action eligibility. Does not pause, step or change the scene.', inputSchema: DEBUG_CONTROL_SCHEMAS.inspect, annotations: { readOnlyHint: true }, execute: value => { record(value, []); return inspect(); } },
    { name: 'set_debug_simulation', description: 'Explicitly pause or resume the existing SDK clock.', inputSchema: DEBUG_CONTROL_SCHEMAS.simulation, annotations: { readOnlyHint: false }, execute: setSimulation },
    { name: 'step_debug_simulation', description: 'Pause and advance 1-120 fixed SDK ticks with explicit public input. Defaults to a single neutral tick. characterActions toggleCrouch/prone/cancel are first-tick edges, not arbitrary state writes; movement is preserved. Leaves the world paused.', inputSchema: DEBUG_CONTROL_SCHEMAS.step, annotations: { readOnlyHint: false }, execute: stepSimulation },
    { name: 'set_debug_character_pose', description: 'Place the controlled on-foot humanoid using SDK clearance validation. Public heading 0 faces -Z. Successful placement resets local character motion/action state and leaves paused; does not reset the world.', inputSchema: DEBUG_CONTROL_SCHEMAS.characterPose, annotations: { readOnlyHint: false }, execute: setCharacterPose },
    { name: 'set_debug_camera', description: 'orbit cuts to an absolute follow-camera intent and resolves safety without ticking or changing framing/document; this is a reproduction start, not a history checkpoint. authored explicitly releases follow and sets an unconstrained diagnostic eye/lookAt. follow selects a declared view; from authored restore the original default view first. Leaves paused on success.', inputSchema: DEBUG_CONTROL_SCHEMAS.camera, annotations: { readOnlyHint: false }, execute: setCamera },
    { name: 'execute_debug_vehicle_action', description: 'Request entering a named vehicle or exiting the current vehicle using SDK interaction rules; does not teleport or force mounted fields. Preserves pause state.', inputSchema: DEBUG_CONTROL_SCHEMAS.vehicleAction, annotations: { readOnlyHint: false }, execute: vehicleAction },
  ];
  return { inspect, setSimulation, stepSimulation, setCharacterPose, setCamera, vehicleAction, tools };
}
