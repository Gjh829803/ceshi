import { expect, it, vi } from 'vitest';
import type { WorldSnapshot, CommandReceipt, OperationStatus, BoardingObservation } from '@worldkit/three';
import { EpisodeActionController } from './action-controller.js';
import type { EpisodeActionGoal, EpisodeSegmentPlan } from './contracts.js';
import type { RouteDecision } from './route-controller.js';

const vehicleState=(instanceId:string,mode:NonNullable<WorldSnapshot['humanoid']>['vehicles'][number]['mode'],speedMetersPerSecond:number)=>({instanceId,assetId:'fixture',mode,speedMetersPerSecond,available:true,throttle:0,steering:0,grounded:true,submerged:false});
const route: RouteDecision = { mode: 'action', input: {}, waypointIndex: 0, positionWorldMetersXYZ: [0, 0, 0] };
const goal = (intent: EpisodeActionGoal['intent']): EpisodeActionGoal => ({ id: 'demonstration', trigger: { waypointIndex: 0, radiusMeters: .6 }, intent, completion: { kind: 'settled', holdSeconds: 0 }, timeoutSeconds: 3 });
function fixture(action: EpisodeActionGoal, withBoarding = true) {
  const segment: EpisodeSegmentPlan = { id: 'segment-00', start: { positionWorldMetersXYZ: [0, 0, 0], facingYawRadians: 0 },
    waypoints: [{ positionWorldMetersXYZ: [0, 0, 0], gait: 'run' }, { positionWorldMetersXYZ: [0, 0, -8], gait: 'walk' }], endBehavior: 'stop', purpose: 'Exercise an authored affordance', actionGoals: [action] };
  let tick = 0;
  const state = { instanceId: 'actor', state: 'idle', stance: 'stand', carrying: null as string | null, seated: null as string | null,
    activeAction: null as { requestId: string; action: string; phase: string; elapsedSeconds: number } | null, swimming: false, swimStyle: 'freestyle' };
  const surface = { mode: 'none', surfaceId: null as string | null, pose: null };
  const targets: any[] = [];
  let p: [number, number, number] = [0, 0, 0];
  const snapshot = () => structuredClone({ simulationTick: 10 + tick, controlledEntityId: 'actor',
    entities: [{ id: 'actor', positionWorldMetersXYZ: p }], humanoid: { character: state, surface, interactionTargets: targets, water: { swimming: state.swimming, contact: null }, message: 'fixture' } }) as unknown as WorldSnapshot;
  let status: OperationStatus['status'] = 'running';
  const execute = vi.fn(async (): Promise<CommandReceipt> => ({ status: 'accepted', commandId: 'command', worldRevision: 0, operationId: 'skill-op' }));
  const operation = vi.fn(async (): Promise<OperationStatus> => ({ id: 'skill-op', status, phase: status }));
  const boarding = vi.fn(async (_instanceId: string): Promise<BoardingObservation> => ({ approachPositionWorldMetersXYZ: [0, 0, 0], eligible: false, reason: 'HUMANOID_CHARACTER_BUSY', message: 'Busy' }));
  const controller = new EpisodeActionController(segment, { execute, operation, ...(withBoarding ? { boarding } : {}) }, 10, 1 / 60);
  return { controller, execute, operation, boarding, state, surface, targets, snapshot,
    setStatus(value: OperationStatus['status']) { status = value; },
    async observe(nextTick: number, nextPosition = p) { tick = nextTick; p = nextPosition; await controller.observe(snapshot()); } };
}

it('keeps a skill running until the operation and real target state both complete', async () => {
  const f = fixture({ ...goal({ kind: 'skill', action: 'pickup' }), targetId: 'parcel' });
  f.targets.push({ id: 'parcel', kind: 'pickup', approachPositionWorldMetersXYZ: [0, 0, 0], eligible: true, reason: 'READY' });
  await f.controller.step(f.snapshot(), [0, 0, -1], route);
  expect(f.controller.timeline[0]!.result).toBe('running');
  f.state.activeAction = { requestId: 'ep-segment-00-0', action: 'pickup', phase: 'reach', elapsedSeconds: 0 };
  await f.observe(1); f.setStatus('succeeded'); await f.observe(2);
  expect(f.controller.timeline[0]!.result).toBe('running');
  f.state.carrying = 'parcel'; f.state.activeAction = null; await f.observe(3);
  expect(f.controller.timeline[0]).toMatchObject({ result: 'succeeded', startTick: 0, endTick: 3, targetId: 'parcel' });
  expect(f.operation).toHaveBeenCalledTimes(3);
  expect(f.controller.timeline[0]!.stateChanges.some(e => e.tick === 1 && e.state.character?.activeAction?.phase === 'reach')).toBe(true);
});

it('walks to a nearby actual target approach before dispatching', async () => {
  const f = fixture({ ...goal({ kind: 'skill', action: 'sit' }), targetId: 'chair' });
  const target = { id: 'chair', kind: 'seat', approachPositionWorldMetersXYZ: [1.5, 0, 0], eligible: false, reason: 'OUT_OF_REACH' };
  f.targets.push(target);
  const result = await f.controller.step(f.snapshot(), [0, 0, -1], route);
  expect(result.input.moveXRatio).toBe(1); expect(f.execute).not.toHaveBeenCalled();
  await f.observe(10, [1, 0, 0]); target.eligible = true;
  await f.controller.step(f.snapshot(), [0, 0, -1], route);
  expect(f.execute).toHaveBeenCalledWith(expect.objectContaining({ type: 'humanoid.perform-action', request: expect.objectContaining({ targetId: 'chair' }) }));
});

it('requires observed displacement after a slide and does not mistake acceptance for motion', async () => {
  const f = fixture({ ...goal({ kind: 'skill', action: 'slide' }), completion: { kind: 'displacement', minimumMeters: 2 } });
  await f.controller.step(f.snapshot(), [0, 0, -1], route);
  await f.observe(1, [0, 0, -1]);
  expect(f.controller.timeline[0]!.result).toBe('running');
  f.setStatus('succeeded'); await f.observe(2, [0, 0, -2.1]);
  expect(f.controller.timeline[0]).toMatchObject({ result: 'succeeded', travelledMeters: 2.1 });
  expect(f.controller.takeReleasedWaypoint()).toBe(0);
});

it('clears one-shot input on the following tick and observes a settled prone pose', async () => {
  const f = fixture(goal({ kind: 'posture', stance: 'prone' }));
  f.execute.mockImplementation(async () => ({ status: 'applied', commandId: 'input', worldRevision: 0 }));
  await f.controller.step(f.snapshot(), [0, 0, -1], route);
  f.surface.mode = 'prone'; f.state.state = 'prone-transition'; await f.observe(1);
  expect(f.execute).toHaveBeenLastCalledWith({ type: 'humanoid.set-input', input: null });
  expect(f.controller.timeline[0]!.result).toBe('running');
  f.state.state = 'prone'; await f.observe(45);
  expect(f.controller.timeline[0]).toMatchObject({ result: 'succeeded', endTick: 45, endFrame: 18 });
});

it('preserves rejected, cancelled, timed-out and unreached outcomes', async () => {
  const rejected = fixture(goal({ kind: 'skill', action: 'slide' }));
  rejected.execute.mockImplementation(async () => ({ status: 'rejected', commandId: 'input', worldRevision: 0, error: { code: 'SPEED_TOO_LOW', message: 'Run first', category: 'content', phase: 'validate', entityIds: [] } }));
  await expect(rejected.controller.step(rejected.snapshot(), [0, 0, -1], route)).rejects.toThrow('SPEED_TOO_LOW');
  expect(rejected.controller.timeline[0]!.result).toBe('failed');
  const cancelled = fixture(goal({ kind: 'skill', action: 'roll' }));
  await cancelled.controller.step(cancelled.snapshot(), [0, 0, -1], route); cancelled.setStatus('cancelled');
  await expect(cancelled.observe(1)).rejects.toThrow('CANCELLED'); expect(cancelled.controller.timeline[0]!.result).toBe('cancelled');
  const timeout = fixture(goal({ kind: 'posture', stance: 'crouch' }));
  await timeout.controller.step(timeout.snapshot(), [0, 0, -1], route);
  await expect(timeout.observe(180)).rejects.toThrow('TIMEOUT');
  const missing = fixture(goal({ kind: 'posture', stance: 'stand' }));
  missing.controller.finish(missing.snapshot(), false); expect(missing.controller.timeline[0]!.result).toBe('missing');
  expect(() => missing.controller.assertComplete()).toThrow('INCOMPLETE');
});

it('walks to the measured boarding approach and waits for the actual enter transition', async () => {
  const f = fixture({ ...goal({ kind: 'mount', action: 'enter' }), targetId: 'car' });
  f.execute.mockImplementation(async () => ({ status: 'applied', commandId: 'mount', worldRevision: 0 }));
  const vehicle = { instanceId: 'car' };
  const boarding: BoardingObservation = { approachPositionWorldMetersXYZ: [1.5, 0, 0], eligible: false, reason: 'VEHICLE_MOUNT_OUT_OF_REACH', message: 'Walk closer' };
  f.boarding.mockImplementation(async () => boarding);
  const snapshot = (tick: number, mounted: string | null, remainingSeconds: number) => ({ ...f.snapshot(), simulationTick: 10 + tick,
    humanoid: { ...f.snapshot().humanoid!, vehicles: [vehicle], mountedInstanceId: mounted, transition: { kind: 'enter', remainingSeconds } } }) as unknown as WorldSnapshot;
  const approaching = await f.controller.step(snapshot(0, null, 0), [0, 0, -1], route);
  expect(approaching.input.moveXRatio).toBe(1); expect(f.execute).not.toHaveBeenCalled();
  Object.assign(boarding, { eligible: true, reason: 'ELIGIBLE' });
  const entering = await f.controller.step(snapshot(1, null, 0), [0, 0, -1], route);
  expect(f.execute).toHaveBeenCalledExactlyOnceWith({ type: 'vehicle.enter', instanceId: 'car' });
  expect(entering.input.humanoid).toMatchObject({ forward: 0, brake: true });
  await f.controller.observe(snapshot(2, 'car', .4));
  expect(f.controller.timeline[0]!.result).toBe('running');
  await f.controller.observe(snapshot(32, 'car', 0));
  expect(f.controller.timeline[0]!.result).toBe('succeeded');
  expect(f.boarding).toHaveBeenCalledTimes(2);
  expect(f.boarding).toHaveBeenLastCalledWith('car');
});

it('rejects ineligible boarding instead of preparing or relocating the actor', async () => {
  const f = fixture({ ...goal({ kind: 'mount', action: 'enter' }), targetId: 'car' });
  const snapshot = f.snapshot();
  Object.assign(snapshot.humanoid!, { transition: { kind: '', remainingSeconds: 0 }, vehicles: [{ instanceId: 'car' }] });
  await expect(f.controller.step(snapshot, [0, 0, -1], route)).rejects.toThrow('CHARACTER_BUSY');
  expect(f.execute).not.toHaveBeenCalled();
});

it('keeps exit running after control handoff until the real transition finishes', async () => {
  const f = fixture(goal({ kind: 'mount', action: 'exit' }));
  f.execute.mockImplementation(async () => ({ status: 'applied', commandId: 'exit', worldRevision: 0 }));
  const snapshot = (tick: number, mounted: string | null, remainingSeconds: number) => ({ ...f.snapshot(), simulationTick: 10 + tick,
    humanoid: { ...f.snapshot().humanoid!, mountedInstanceId: mounted, vehicles: [vehicleState('car','wheeled',0)], transition: { kind: 'exit', remainingSeconds } } }) as WorldSnapshot;
  const decision = await f.controller.step(snapshot(0, 'car', 0), [0, 0, -1], route);
  expect(f.execute).toHaveBeenCalledExactlyOnceWith({ type: 'vehicle.exit' });
  expect(decision.input.humanoid).toMatchObject({ forward: 0, brake: true });
  await f.controller.observe(snapshot(1, null, .3)); expect(f.controller.timeline[0]!.result).toBe('running');
  await f.controller.observe(snapshot(24, null, 0)); expect(f.controller.timeline[0]!.result).toBe('succeeded');
  expect(f.boarding).not.toHaveBeenCalled();
});

it('changes a non-Player view and completes only after the actual camera matches', async () => {
  const f = fixture(goal({ kind: 'view', perspective: 'first-person' }));
  f.execute.mockImplementation(async () => ({ status: 'applied', commandId: 'view', worldRevision: 0 }));
  const snapshot = (tick: number, perspective: string) => {
    const { humanoid: _humanoid, ...base } = f.snapshot();
    return { ...base, simulationTick: tick + 10, camera: { perspective } } as WorldSnapshot;
  };
  await f.controller.step(snapshot(0, 'third-person'), [0, 0, -1], route);
  expect(f.execute).toHaveBeenCalledExactlyOnceWith({ type: 'camera.set-perspective', perspective: 'first-person' });
  await f.controller.observe(snapshot(1, 'third-person')); expect(f.controller.timeline[0]!.result).toBe('running');
  await f.controller.observe(snapshot(2, 'first-person')); expect(f.controller.timeline[0]!.result).toBe('succeeded');
  expect(f.boarding).not.toHaveBeenCalled();
});

it('prefers actual camera perspective over Player mode and falls back only when absent', async () => {
  const f = fixture(goal({ kind: 'view', perspective: 'first-person' }));
  f.execute.mockImplementation(async () => ({ status: 'applied', commandId: 'view', worldRevision: 0 }));
  const snapshot = f.snapshot(); Object.assign(snapshot.humanoid!, { cameraMode: 1 });
  Object.assign(snapshot, { camera: { perspective: 'third-person' } });
  await f.controller.step(snapshot, [0, 0, -1], route);
  await f.controller.observe(snapshot); expect(f.controller.timeline[0]!.result).toBe('running');
  Object.assign(snapshot, { camera: {} });
  await f.controller.observe(snapshot); expect(f.controller.timeline[0]!.result).toBe('succeeded');
});

it('reports missing boarding observation only when an enter goal triggers', async () => {
  const f = fixture({ ...goal({ kind: 'mount', action: 'enter' }), targetId: 'car' }, false);
  const snapshot = f.snapshot();
  Object.assign(snapshot.humanoid!, { transition: { kind: '', remainingSeconds: 0 }, vehicles: [{ instanceId: 'car' }] });
  expect((await f.controller.step(snapshot, [0, 0, -1], { ...route, mode: 'travel' })).mode).toBe('travel');
  await expect(f.controller.step(snapshot, [0, 0, -1], route)).rejects.toThrow('EPISODE_BOARDING_OBSERVATION_UNAVAILABLE');
  expect(f.execute).not.toHaveBeenCalled();
});

it('brakes before exit and waits for measured rest and any existing transition', async () => {
  const f = fixture(goal({ kind: 'mount', action: 'exit' }));
  f.execute.mockImplementation(async () => ({ status: 'applied', commandId: 'exit', worldRevision: 0 }));
  const snapshot = (speed: number, remainingSeconds = 0) => ({ ...f.snapshot(), humanoid: { ...f.snapshot().humanoid!,
    mountedInstanceId: 'car', vehicles: [vehicleState('car','wheeled',speed)], transition: { kind: 'enter', remainingSeconds } } }) as WorldSnapshot;
  const braking = await f.controller.step(snapshot(12), [0, 0, -1], route);
  expect(braking.input.humanoid).toMatchObject({ forward: 0, brake: true, boost: false });
  expect(f.execute).not.toHaveBeenCalled();
  await f.controller.step(snapshot(.5), [0, 0, -1], route);
  await f.controller.step(snapshot(.05, .1), [0, 0, -1], route);
  expect(f.execute).not.toHaveBeenCalled();
  await f.controller.step(snapshot(.05), [0, 0, -1], route);
  expect(f.execute).toHaveBeenCalledExactlyOnceWith({ type: 'vehicle.exit' });
});

it('uses each mounted family stop input while waiting and changing view', async () => {
  for (const kind of ['mount', 'view'] as const) for (const mode of ['spacecraft', 'submarine', 'dragon'] as const) {
    const f = fixture(goal(kind === 'mount' ? { kind, action: 'exit' } : { kind, perspective: 'first-person' }));
    f.execute.mockImplementation(async () => ({ status: 'applied', commandId: 'view', worldRevision: 0 }));
    const snapshot = { ...f.snapshot(), humanoid: { ...f.snapshot().humanoid!, cameraMode: 0, mountedInstanceId: 'craft',
      vehicles: [vehicleState('craft',mode,10)], transition: { kind: '', remainingSeconds: 0 } } } as WorldSnapshot;
    const input = (await f.controller.step(snapshot, [0, 0, -1], route)).input.humanoid!;
    expect(input).toMatchObject({ forward: 0, lift: 0, steer: 0, boost: mode !== 'dragon', brake: false, slow: false });
    if (kind === 'mount') expect(f.execute).not.toHaveBeenCalled();
  }
});

it('times out honestly when an aircraft cannot stop for exit', async () => {
  const f = fixture(goal({ kind: 'mount', action: 'exit' }));
  const snapshot = { ...f.snapshot(), humanoid: { ...f.snapshot().humanoid!, mountedInstanceId: 'plane',
    vehicles: [vehicleState('plane','plane',30)], transition: { kind: '', remainingSeconds: 0 } } } as WorldSnapshot;
  expect((await f.controller.step(snapshot, [0, 0, -1], route)).input.humanoid).toMatchObject({ forward: 0, boost: false, slow: true });
  expect(f.execute).not.toHaveBeenCalled();
  await expect(f.controller.observe({ ...snapshot, simulationTick: 190 })).rejects.toThrow('EPISODE_ACTION_TIMEOUT');
  expect(f.controller.timeline[0]!.result).toBe('failed');
});

it('uses the custom stop adapter throughout nonhuman view holds',async()=>{
 const segment:EpisodeSegmentPlan={id:'segment-00',start:{positionWorldMetersXYZ:[0,3,0],facingYawRadians:0},waypoints:[{positionWorldMetersXYZ:[0,3,0],gait:'walk'}],endBehavior:'stop',purpose:'Hover during a view change',actionGoals:[{...goal({kind:'view',perspective:'first-person'}),completion:{kind:'settled',holdSeconds:1}}]};
 const calls:any[]=[];const controller=new EpisodeActionController(segment,{execute:async()=>({status:'applied',commandId:'view',worldRevision:0}),operation:async()=>{throw Error('unexpected operation');}},0,1/60,async request=>{calls.push(request);return {moveYRatio:.25};});
 const state={schemaVersion:2,simulationTick:0,controlledEntityId:'bird',entities:[{id:'bird',positionWorldMetersXYZ:[0,3,0]}],camera:{perspective:'third-person'}} as unknown as WorldSnapshot;
 expect((await controller.step(state,[0,0,-1],route)).input).toEqual({moveYRatio:.25});expect(calls[0]).toMatchObject({mode:'stop',targetPositionWorldMetersXYZ:[0,3,0]});
});
