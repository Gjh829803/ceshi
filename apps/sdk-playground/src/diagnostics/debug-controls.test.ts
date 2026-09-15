import { afterEach, expect, it, vi } from 'vitest';
import { Group, Vector3 } from 'three';
import { createHumanoidCameraDocument, createWorld, type CommandReceipt, type ThreeWorld } from '@worldkit/three';
import { createPlaygroundDebugControls, DEBUG_CONTROL_SCHEMAS, type DebugControlsPort } from './debug-controls';

const retained: ThreeWorld[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const world of retained.splice(0)) world.dispose(); });
async function fixture() {
  const world = await createWorld({ navigation: false, assetDefinitions: {}, humanoid: {
    map: { id: 'debug-controls', name: 'Debug controls', description: '', bounds: { min: [-20, -5, -20], max: [20, 20, 20] },
      boxes: [{ id: 'ground', position: [0, -.5, 0], size: [40, 1, 40] }], water: [], regions: [], spawns: [], playerSpawn: [0, .03, 0] },
    character: { instanceId: 'person', object: new Group() }, vehicles: [],
  } });
  retained.push(world); world.setCameraFollow({ configuration: createHumanoidCameraDocument('person') }); world.step({}, 1);
  let paused = false, ready = true;
  const setPaused = vi.fn((value: boolean) => { paused = value; if (value) world.stop(); });
  const clearInput = vi.fn(() => world.humanoid!.clearInput()), render = vi.fn();
  const setCameraOrbit = vi.fn((input: Parameters<ThreeWorld['setCameraOrbit']>[0]) => world.setCameraOrbit(input));
  const port: DebugControlsPort = { getWorld: () => world, isReady: () => ready, isPaused: () => paused,
    setPaused, clearInput, render, setCameraOrbit };
  return { world, controls: createPlaygroundDebugControls(port), setPaused, clearInput, render, setCameraOrbit,
    pauseState: () => paused, setReady: (value: boolean) => { ready = value; } };
}

it('inspects compact live capabilities without pausing, stepping or rendering', async () => {
  const f = await fixture(), before = f.world.snapshot();
  const state = f.controls.inspect();
  expect(state).toMatchObject({ ready: true, paused: false, simulationTick: before.simulationTick,
    character: { entityId: 'person', mountedInstanceId: null }, capabilities: { characterPose: true, cameraOrbit: true } });
  expect(state).not.toHaveProperty('camera.document');
  expect(state).toMatchObject({ capabilities: { cameraOrbitLimits: { referenceFrame: 'world-up', yawLimitsRadians: { kind: 'unbounded' }, pitchLimitsRadians: { maximumRadians: 1.1 }, zoomRange: { minimumDistanceMeters: 3.2, maximumDistanceMeters: 12 } } } });
  expect(f.controls.inspect()).toEqual(state); expect(f.world.snapshot()).toEqual(before);
  expect(f.setPaused).not.toHaveBeenCalled(); expect(f.clearInput).not.toHaveBeenCalled(); expect(f.render).not.toHaveBeenCalled();
});

it('validates all fields and unavailable capabilities before changing the scene', async () => {
  const f = await fixture(), before = f.world.snapshot();
  for (const value of [null, { frames: 0 }, { frames: 1.5 }, { frames: 121 }, { input: { moveXRatio: Infinity } }, { input: { moveZRatio: 1.1 } }, { input: { run: 'yes' } }, { input: { grounded: true } }, { input: { characterActions: { grounded: true } } }, { input: { characterActions: { toggleCrouch: 1 } } }])
    expect(await f.controls.stepSimulation(value)).toMatchObject({ status: 'rejected', code: 'DEBUG_INPUT_INVALID' });
  expect(await f.controls.setCharacterPose({ positionWorldMetersXYZ: [0, NaN, 0], facingYawRadians: 0 })).toMatchObject({ status: 'rejected', code: 'DEBUG_INPUT_INVALID' });
  expect(await f.controls.setCharacterPose({ positionWorldMetersXYZ: [0, 0, 0], facingYawRadians: 0, stance: 'crouch' })).toMatchObject({ status: 'rejected', code: 'DEBUG_INPUT_INVALID' });
  expect(await f.controls.setCamera({ mode: 'follow', viewId: 'missing' })).toMatchObject({ status: 'rejected', code: 'DEBUG_CAMERA_VIEW_UNAVAILABLE' });
  expect(await f.controls.setCamera({ mode: 'authored', positionWorldMetersXYZ: [0, 1, 0], lookAtWorldMetersXYZ: [0, 1, 0] })).toMatchObject({ status: 'rejected', code: 'DEBUG_INPUT_INVALID' });
  expect(f.world.snapshot()).toEqual(before); expect(f.setPaused).not.toHaveBeenCalled(); expect(f.clearInput).not.toHaveBeenCalled();
  f.setReady(false);
  expect(await f.controls.setSimulation({ paused: true })).toMatchObject({ status: 'rejected', code: 'DEBUG_WORLD_NOT_READY' });
  expect(f.setPaused).not.toHaveBeenCalled();
});

it('pauses and advances only the requested fixed ticks through public input', async () => {
  const f = await fixture(), tick = f.world.simulationTick;
  expect(await f.controls.stepSimulation({})).toMatchObject({ status: 'applied', result: { advancedTicks: 1 } });
  expect(f.world.simulationTick).toBe(tick + 1); expect(f.pauseState()).toBe(true);
  expect(await f.controls.stepSimulation({ frames: 12, input: { moveXRatio: 1 } })).toMatchObject({ status: 'applied', result: { advancedTicks: 12 } });
  expect(f.world.simulationTick).toBe(tick + 13);
  expect(Math.abs(f.world.getEntityState('person').positionWorldMetersXYZ[0])).toBeGreaterThan(.1);
  expect(f.clearInput).toHaveBeenCalledTimes(2); expect(f.render).toHaveBeenCalledTimes(2);
  expect(await f.controls.setSimulation({ paused: false })).toMatchObject({ status: 'applied', state: { paused: false } });
});

it('places the current humanoid with public -Z heading without resetting the world', async () => {
  const f = await fixture(), tick = f.world.simulationTick, reset = vi.spyOn(f.world, 'reset');
  const beforeConfiguration = f.world.inspectCamera().documentHash;
  expect(await f.controls.setCharacterPose({ positionWorldMetersXYZ: [3, .03, -2], facingYawRadians: 0 })).toMatchObject({ status: 'applied' });
  expect(f.world.simulationTick).toBe(tick); expect(reset).not.toHaveBeenCalled();
  expect(f.world.getEntityState('person').positionWorldMetersXYZ[0]).toBeCloseTo(3);
  expect(f.world.getEntityState('person').positionWorldMetersXYZ[2]).toBeCloseTo(-2);
  expect(f.world.humanoid!.simulation.controlledActor.controller.facing.dot(new Vector3(0, 0, -1))).toBeGreaterThan(.99999);
  expect(f.controls.inspect()).toMatchObject({ character: { facingYawRadians: expect.closeTo(0, 7) } });
  expect(await f.controls.setCharacterPose({ positionWorldMetersXYZ: [2, .03, 1], facingYawRadians: Math.PI / 2 })).toMatchObject({ status: 'applied' });
  expect(f.world.humanoid!.simulation.controlledActor.controller.facing.dot(new Vector3(-1, 0, 0))).toBeGreaterThan(.99999);
  expect(f.controls.inspect()).toMatchObject({ character: { facingYawRadians: expect.closeTo(Math.PI / 2, 7) } });
  expect(f.world.inspectCamera().documentHash).toBe(beforeConfiguration); expect(f.pauseState()).toBe(true);
});

it('preserves pause/input state and surfaces the actual SDK placement refusal', async () => {
  const f = await fixture(), runtime = f.world.humanoid!, before = f.world.getEntityState('person');
  vi.spyOn(runtime, 'prepareCharacter').mockReturnValue(false);
  vi.spyOn(runtime, 'snapshot').mockReturnValue({ ...runtime.snapshot(), message: '人物测试点没有站立净空' });
  expect(await f.controls.setCharacterPose({ positionWorldMetersXYZ: [0, .03, 0], facingYawRadians: 0 })).toMatchObject({ status: 'rejected', code: 'DEBUG_CHARACTER_PLACEMENT_REJECTED', message: '人物测试点没有站立净空' });
  expect(f.world.getEntityState('person')).toEqual(before); expect(f.setPaused).not.toHaveBeenCalled(); expect(f.clearInput).not.toHaveBeenCalled();
});

it('sets genuine follow orbit without altering framing, document, actor or simulation time', async () => {
  const f = await fixture(), before = f.world.snapshot(), configuration = f.world.inspectCamera().documentHash;
  expect(await f.controls.setCamera({ mode: 'orbit', yawRadians: 1.2, pitchRadians: .4, distanceMeters: 5 })).toMatchObject({ status: 'applied' });
  expect(f.setCameraOrbit).toHaveBeenCalledWith({ yawRadians: 1.2, pitchRadians: .4, distanceMeters: 5 });
  expect(f.world.inspectCamera().intent).toMatchObject({ yawRadians: 1.2, pitchRadians: .4, distanceMeters: 5 });
  expect(f.world.inspectCamera().documentHash).toBe(configuration); expect(f.world.inspectCamera().resolved).toMatchObject({ values: { framing: { kind: 'look-at' } } });
  expect(f.world.simulationTick).toBe(before.simulationTick); expect(f.world.getEntityState('person')).toEqual(before.entities.find(entity => entity.id === 'person'));
  f.setPaused.mockClear(); f.clearInput.mockClear(); const valid = f.world.inspectCamera();
  expect(await f.controls.setCamera({ mode: 'orbit', pitchRadians: 2 })).toMatchObject({ status: 'rejected' });
  expect(f.world.inspectCamera()).toEqual(valid); expect(f.setPaused).not.toHaveBeenCalled(); expect(f.clearInput).not.toHaveBeenCalled();
  expect(await f.controls.setCamera({ mode: 'follow', viewId: 'first-person' })).toMatchObject({ status: 'applied' });
  const eye = f.world.inspectCamera(); f.setPaused.mockClear();
  expect(await f.controls.setCamera({ mode: 'orbit', distanceMeters: 2 })).toMatchObject({ status: 'rejected', code: 'CAMERA_ORBIT_DISTANCE_UNAVAILABLE' });
  expect(f.world.inspectCamera()).toEqual(eye); expect(f.setPaused).not.toHaveBeenCalled();
  expect(await f.controls.setCamera({ mode: 'orbit', yawRadians: .6 })).toMatchObject({ status: 'applied' });
});

it('uses an explicitly authored diagnostic camera and restores the original follow document', async () => {
  const f = await fixture(), tick = f.world.simulationTick, document = f.world.inspectCamera().document;
  expect(await f.controls.setCamera({ mode: 'authored', positionWorldMetersXYZ: [4, 3, 2], lookAtWorldMetersXYZ: [0, 1, 0] })).toMatchObject({ status: 'applied' });
  expect(f.world.cameraMode).toBe('authored'); expect(f.world.camera.getWorldPosition(new Vector3()).toArray()).toEqual([4, 3, 2]);
  expect(f.world.camera.getWorldDirection(new Vector3()).distanceTo(new Vector3(-4, -2, -2).normalize())).toBeLessThan(1e-7);
  expect(f.world.simulationTick).toBe(tick); expect(f.world.inspectCamera().document).toEqual(document);
  const before = f.world.snapshot(); f.setPaused.mockClear();
  expect(await f.controls.setCamera({ mode: 'orbit', yawRadians: 1 })).toMatchObject({ status: 'rejected', code: 'CAMERA_FOLLOW_REQUIRED' });
  expect(await f.controls.setCamera({ mode: 'follow', viewId: 'shoulder' })).toMatchObject({ status: 'rejected', code: 'DEBUG_CAMERA_RESTORE_DEFAULT_FIRST' });
  expect(f.world.snapshot()).toEqual(before); expect(f.setPaused).not.toHaveBeenCalled();
  expect(await f.controls.setCamera({ mode: 'follow', viewId: document!.defaultViewId })).toMatchObject({ status: 'applied' });
  expect(f.world.cameraMode).toBe('follow'); expect(f.world.inspectCamera().document).toEqual(document);
});

it('routes vehicle intent through public SDK receipts and rejects arbitrary mounted-state edits', async () => {
  const f = await fixture(), before = f.world.snapshot();
  const receipt: CommandReceipt = { status: 'rejected', commandId: 'debug-test', worldRevision: before.worldRevision,
    error: { code: 'VEHICLE_EXIT_REJECTED', message: 'No mounted vehicle to exit.', phase: 'command', category: 'content', entityIds: ['person'] } };
  const execute = vi.spyOn(f.world, 'execute').mockResolvedValue(receipt);
  expect(await f.controls.vehicleAction({ action: 'enter', vehicleId: 'missing' })).toMatchObject({ status: 'rejected', code: 'DEBUG_VEHICLE_UNAVAILABLE' });
  expect(await f.controls.vehicleAction({ action: 'set-mounted', mounted: true })).toMatchObject({ status: 'rejected', code: 'DEBUG_INPUT_INVALID' });
  expect(execute).not.toHaveBeenCalled(); expect(f.setPaused).not.toHaveBeenCalled();
  expect(await f.controls.vehicleAction({ action: 'exit' })).toMatchObject({ status: 'rejected', code: 'VEHICLE_EXIT_REJECTED', message: 'No mounted vehicle to exit.' });
  expect(execute).toHaveBeenCalledWith({ type: 'vehicle.exit', actorId: 'person' }, { expectedWorldRevision: before.worldRevision });
});

it('publishes explicit read-only/mutation schemas instead of arbitrary state setters', async () => {
  const f = await fixture();
  expect(f.controls.tools).toHaveLength(6);
  expect(f.controls.tools.filter(tool => tool.annotations.readOnlyHint).map(tool => tool.name)).toEqual(['inspect_debug_controls']);
  expect(f.controls.tools.find(tool => tool.name === 'set_debug_camera')?.inputSchema).toBe(DEBUG_CONTROL_SCHEMAS.camera);
  expect(DEBUG_CONTROL_SCHEMAS.characterPose.properties.facingYawRadians.description).toContain('zero faces -Z');
});


it('preserves SDK Failure messages even when failure inspection itself becomes unavailable', async () => {
  const f = await fixture();
  f.setCameraOrbit.mockImplementation(() => {
    vi.spyOn(f.world, 'snapshot').mockImplementation(() => { throw new Error('snapshot unavailable'); });
    throw { code: 'CAMERA_ORBIT_OUT_OF_RANGE', message: 'Pitch is outside the active view range.' };
  });
  const result = await f.controls.setCamera({ mode: 'orbit', pitchRadians: .4 });
  expect(result).toMatchObject({ status: 'rejected', code: 'CAMERA_ORBIT_OUT_OF_RANGE', message: 'Pitch is outside the active view range.',
    state: { available: false, error: { message: 'snapshot unavailable' } } });
  expect(f.setPaused).not.toHaveBeenCalled(); expect(f.clearInput).not.toHaveBeenCalled();
});

it('returns compact mutation state while explicit inspection retains capability discovery', async () => {
  const f = await fixture();
  const result = await f.controls.setSimulation({ paused: true });
  expect(result.state).not.toHaveProperty('capabilities');
  expect(f.controls.inspect()).toHaveProperty('capabilities.actions');
});

it('applies crouch posture edges once while preserving simultaneous movement', async () => {
  const f = await fixture(); f.world.step({}, 30);
  const before = f.world.getEntityState('person').positionWorldMetersXYZ;
  expect(await f.controls.stepSimulation({ frames: 120, input: { moveXRatio: 1, characterActions: { toggleCrouch: true } } })).toMatchObject({ status: 'applied' });
  expect(f.world.snapshot().humanoid!.character.stance).toBe('crouch');
  expect(Math.abs(f.world.getEntityState('person').positionWorldMetersXYZ[0] - before[0])).toBeGreaterThan(1);
  expect(await f.controls.stepSimulation({ frames: 10, input: { characterActions: { toggleCrouch: true } } })).toMatchObject({ status: 'applied' });
  expect(f.world.snapshot().humanoid!.character.stance).toBe('stand');

});


it('submits prone only on the first tick and retains SDK asset eligibility instead of forcing state', async () => {
  const f = await fixture(); f.world.step({}, 30);
  const pulses: boolean[] = [];
  const stop = f.world.onUpdate(() => { pulses.push(!!f.world.humanoid!.inspectControls().lastApplied?.input.actions?.prone); });
  try {
    expect(await f.controls.stepSimulation({ frames: 120, input: { characterActions: { prone: true } } })).toMatchObject({ status: 'applied', result: { advancedTicks: 120 } });
  } finally { stop(); }
  expect(pulses.filter(Boolean)).toHaveLength(1);
  // This fixture has actual physics but no character animation asset. The SDK
  // owns the refusal; the debug tool must not invent the missing capability.
  expect(f.world.snapshot().humanoid!.surface.mode).toBe('none');
  expect(f.world.snapshot().humanoid!.characterCapabilities.find(value => value.id === 'prone')).toMatchObject({ eligible: false, reason: 'ASSET_UNAVAILABLE' });
});


it('preserves input when the SDK pause owner refuses manual stepping', async () => {
  const f = await fixture(), before = f.world.snapshot();
  f.setPaused.mockImplementation(() => { throw { code: 'EPISODE_CAPTURE_OWNS_CLOCK', message: 'Episode owns the clock.' }; });
  expect(await f.controls.stepSimulation({ frames: 12, input: { moveXRatio: 1 } })).toMatchObject({ status: 'rejected', code: 'EPISODE_CAPTURE_OWNS_CLOCK' });
  expect(f.clearInput).not.toHaveBeenCalled(); expect(f.render).not.toHaveBeenCalled(); expect(f.world.snapshot()).toEqual(before);
});
