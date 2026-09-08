import { expect, it, vi } from 'vitest';
import type { WorldSnapshot, CommandReceipt, OperationStatus } from '@worldkit/three';
import { EpisodeActionController } from './action-controller.js';
import type { EpisodeActionGoal, EpisodeSegmentPlan } from './contracts.js';
import type { RouteDecision } from './route-controller.js';

const route: RouteDecision = { mode: 'action', input: {}, waypointIndex: 0, positionWorldMetersXYZ: [0, 0, 0] };
const goal = (intent: EpisodeActionGoal['intent']): EpisodeActionGoal => ({ id: 'demonstration', trigger: { waypointIndex: 0, radiusMeters: .6 }, intent, completion: { kind: 'settled', holdSeconds: 0 }, timeoutSeconds: 3 });
function fixture(action: EpisodeActionGoal) {
  const segment: EpisodeSegmentPlan = { id: 'segment-00', start: { positionWorldMetersXYZ: [0, 0, 0], facingYawRadians: 0 },
    waypoints: [{ positionWorldMetersXYZ: [0, 0, 0], gait: 'run' }, { positionWorldMetersXYZ: [0, 0, -8], gait: 'walk' }], endBehavior: 'stop', purpose: 'Exercise an authored affordance', actionGoals: [action] };
  let tick = 0;
  const state = { instanceId: 'actor', state: 'idle', stance: 'stand', carrying: null as string | null, seated: null as string | null,
    activeAction: null as { requestId: string; action: string; phase: string; elapsedSeconds: number } | null, swimming: false, swimStyle: 'freestyle' };
  const surface = { mode: 'none', surfaceId: null as string | null, pose: null };
  const targets: any[] = [];
  let p: [number, number, number] = [0, 0, 0];
  const snapshot = () => structuredClone({ simulationTick: 10 + tick, controlledEntityId: 'actor',
    entities: [{ id: 'actor', positionWorldMetersXYZ: p }], training: { character: state, surface, interactionTargets: targets, water: { swimming: state.swimming, contact: null }, message: 'fixture' } }) as unknown as WorldSnapshot;
  let status: OperationStatus['status'] = 'running';
  const execute = vi.fn(async (): Promise<CommandReceipt> => ({ status: 'accepted', commandId: 'command', worldRevision: 0, operationId: 'skill-op' }));
  const operation = vi.fn(async (): Promise<OperationStatus> => ({ id: 'skill-op', status, phase: status }));
  const controller = new EpisodeActionController(segment, { execute, operation }, 10, 1 / 60);
  return { controller, execute, operation, state, surface, targets, snapshot,
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
  expect(f.execute).toHaveBeenCalledWith(expect.objectContaining({ type: 'training.action', request: expect.objectContaining({ targetId: 'chair' }) }));
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
  expect(f.execute).toHaveBeenLastCalledWith({ type: 'training.input', input: null });
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
