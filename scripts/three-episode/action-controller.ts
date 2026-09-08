import { emptyTrainingInput, type CommandReceipt, type OperationStatus, type Vec3, type WorldInput, type WorldSnapshot } from '@worldkit/three';
import type { EpisodeCaptureSession } from './browser.js';
import type { EpisodeActionGoal, EpisodeSegmentPlan } from './contracts.js';
import { routeDirectionInput, type RouteDecision } from './route-controller.js';

export const ACTION_CAPTURE_VERSION = 'worldkit-three-action-capture-1';
type Command = Parameters<EpisodeCaptureSession['execute']>[0];
const position = (snapshot: WorldSnapshot): Vec3 => {
  const actor = snapshot.entities.find(e => e.id === snapshot.controlledEntityId);
  if (!actor) throw new Error('EPISODE_CONTROLLED_ENTITY_MISSING');
  return actor.positionWorldMetersXYZ;
};
const distance = (a: Vec3, b: Vec3) => Math.hypot(...a.map((v, i) => v - b[i]!) as [number, number, number]);
function observedState(snapshot: WorldSnapshot) {
  const t = snapshot.training;
  return { positionWorldMetersXYZ: position(snapshot), character: t?.character ?? null, surface: t?.surface ?? null,
    water: t ? { swimming: t.water.swimming, volumeId: t.water.contact?.volumeId ?? null } : null };
}
export interface ActionTimelineEntry {
  goalId: string; intent: EpisodeActionGoal['intent']; targetId: string | null;
  result: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'missing';
  triggerTick: number | null; startTick: number | null; endTick: number | null;
  startFrame: number | null; endFrame: number | null;
  operation: OperationStatus | null;
  commands: { tick: number; command: Command; receipt: CommandReceipt }[];
  stateChanges: { tick: number; frame: number; state: ReturnType<typeof observedState> }[];
  travelledMeters: number; diagnostic: string | null;
}
interface ActiveGoal {
  goal: EpisodeActionGoal; entry: ActionTimelineEntry; started: boolean; triggerTick: number;
  startPosition: Vec3; previousPosition: Vec3; settledAt?: number | undefined; clearInput: boolean;
  operationId?: string; operationComplete: boolean; initialState: ReturnType<typeof observedState>;
  crouchAfterProne?: boolean;
  lastStateKey?: string;
}

/** Goals share SDK commands and fixed ticks with live controls. No simulation wait or pose writes. */
export class EpisodeActionController {
  readonly timeline: ActionTimelineEntry[];
  private cursor = 0;
  private active: ActiveGoal | undefined;
  private chained = false;
  private failure: string | undefined;
  private releasedWaypoint: number | undefined;
  constructor(private readonly segment: EpisodeSegmentPlan, private readonly session: Pick<EpisodeCaptureSession, 'execute' | 'operation'>,
    private readonly initialTick: number, private readonly fixedTimeStepSeconds: number) {
    this.timeline = (segment.actionGoals ?? []).map(goal => ({ goalId: goal.id, intent: goal.intent, targetId: goal.targetId ?? null,
      result: 'pending', triggerTick: null, startTick: null, endTick: null, startFrame: null, endFrame: null,
      operation: null, commands: [], stateChanges: [], travelledMeters: 0, diagnostic: null }));
  }
  get pendingTrigger() { return this.segment.actionGoals?.[this.cursor]?.trigger; }
  get isActive() { return !!this.active || this.chained; }
  get hasGoals() { return this.timeline.length > 0; }
  takeReleasedWaypoint() { const index = this.releasedWaypoint; this.releasedWaypoint = undefined; return index; }
  private tick(snapshot: WorldSnapshot) { return snapshot.simulationTick - this.initialTick; }
  private frame(tick: number) { return Math.min(719, Math.floor(tick * this.fixedTimeStepSeconds * 24)); }
  private record(snapshot: WorldSnapshot, force = false) {
    const active = this.active!;
    const state = observedState(snapshot), tick = this.tick(snapshot);
    // Positions accumulate every tick; emit only real controller state/phase changes.
    const key = JSON.stringify({ character: state.character && { ...state.character, activeAction: state.character.activeAction && {
      ...state.character.activeAction, elapsedSeconds: 0 } }, surface: state.surface && { ...state.surface, pose: state.surface.pose && { ...state.surface.pose, timeSeconds: 0 } }, water: state.water });
    if (force || key !== active.lastStateKey) {
      active.entry.stateChanges.push({ tick, frame: this.frame(tick), state }); active.lastStateKey = key;
    }
    if (active.started) active.entry.travelledMeters += distance(state.positionWorldMetersXYZ, active.previousPosition);
    active.previousPosition = state.positionWorldMetersXYZ;
  }
  private fail(message: string, snapshot: WorldSnapshot, result: 'failed' | 'cancelled' = 'failed') {
    this.failure = message;
    if (this.active) {
      this.record(snapshot, true);
      Object.assign(this.active.entry, { result, diagnostic: message, endTick: this.tick(snapshot), endFrame: this.frame(this.tick(snapshot)) });
    }
    throw new Error(message);
  }
  private async execute(command: Command, snapshot: WorldSnapshot) {
    const receipt = await this.session.execute(command);
    this.active!.entry.commands.push({ tick: this.tick(snapshot), command, receipt });
    if (receipt.status === 'rejected') this.fail(`EPISODE_ACTION_REJECTED: ${receipt.error.code}: ${receipt.error.message}`, snapshot);
    return receipt;
  }
  private stateMatches(snapshot: WorldSnapshot) {
    const { goal, initialState } = this.active!, t = snapshot.training;
    if (!t) return false;
    const intent = goal.intent;
    if (intent.kind === 'posture') return intent.stance === 'prone'
      ? t.surface.mode === 'prone' && t.character.state !== 'prone-transition'
      : t.surface.mode === 'none' && !t.character.seated && !t.character.swimming && t.character.stance === intent.stance;
    if (intent.kind === 'climb') return intent.direction === 'exit' ? t.surface.mode === 'none'
      : t.surface.mode === 'climbing' && !!t.surface.pose && !['hang-enter', 'hang-exit'].includes(t.surface.pose.actionId) && (!goal.targetId || t.surface.surfaceId === goal.targetId);
    if (intent.kind === 'swim-style') return t.character.swimming && t.character.swimStyle === intent.style;
    if (intent.action === 'pickup') return t.character.carrying === goal.targetId;
    if (intent.action === 'sit') return t.character.seated === goal.targetId;
    if (intent.action === 'putDown') return initialState.character?.carrying !== null && t.character.carrying === null;
    if (intent.action === 'standUp') return initialState.character?.seated !== null && t.character.seated === null;
    return this.active!.operationComplete;
  }
  private continuationInput(snapshot: WorldSnapshot, forward: Vec3): WorldInput {
    const goal = this.active!.goal;
    if (goal.intent.kind === 'climb' && !['enter', 'exit'].includes(goal.intent.direction)) {
      const direction = goal.intent.direction;
      return { training: { ...emptyTrainingInput(), forward: direction === 'up' ? 1 : direction === 'down' ? -1 : 0,
        steer: direction === 'right' ? 1 : direction === 'left' ? -1 : 0 } };
    }
    if (goal.completion.kind !== 'displacement' || (goal.intent.kind === 'skill' && ['pickup', 'sit', 'putDown', 'standUp'].includes(goal.intent.action))) return {};
    const target = this.segment.waypoints[goal.trigger.waypointIndex + 1]?.positionWorldMetersXYZ;
    if (!target) return {};
    return routeDirectionInput(position(snapshot), target, forward, goal.intent.kind === 'skill' && goal.intent.action === 'slide');
  }
  /** Called before a rendered interval. Command receipts acknowledge dispatch only. */
  async step(snapshot: WorldSnapshot, forward: Vec3, route: RouteDecision): Promise<RouteDecision> {
    if (this.failure) throw new Error(this.failure);
    const goal = this.segment.actionGoals?.[this.cursor];
    if (!goal || (!this.active && !this.chained && route.mode !== 'action')) return route;
    if (!snapshot.training) throw new Error('EPISODE_ACTION_RUNTIME_UNAVAILABLE');
    if (!this.active) {
      this.chained = false;
      const tick = this.tick(snapshot), entry = this.timeline[this.cursor]!;
      entry.result = 'running'; entry.triggerTick = tick;
      this.active = { goal, entry, started: false, triggerTick: tick, startPosition: position(snapshot), previousPosition: position(snapshot),
        clearInput: false, operationComplete: false, initialState: observedState(snapshot) };
      this.record(snapshot, true);
    }
    const active = this.active;
    let input: WorldInput = {};
    if (!active.started) {
      if (goal.intent.kind === 'skill' && ['pickup', 'sit'].includes(goal.intent.action)) {
        const target = snapshot.training.interactionTargets.find(t => t.id === goal.targetId);
        if (!target) this.fail(`EPISODE_ACTION_TARGET_MISSING: ${goal.targetId}`, snapshot);
        const approach = target!.approachPositionWorldMetersXYZ;
        if (!approach) this.fail(`EPISODE_ACTION_TARGET_APPROACH_MISSING: ${goal.targetId}`, snapshot);
        if (!target!.eligible) {
          if (target!.reason !== 'OUT_OF_REACH') this.fail(`EPISODE_ACTION_REJECTED: ${target!.reason}: ${target!.message}`, snapshot);
          if (distance(position(snapshot), approach!) > 2) this.fail(`EPISODE_ACTION_APPROACH_TOO_FAR: put the trigger waypoint within 2m of ${goal.targetId}'s approach`, snapshot);
          input = routeDirectionInput(position(snapshot), approach!, forward, false);
          return { ...route, mode: 'action', input, positionWorldMetersXYZ: position(snapshot) };
        }
      }
      const tick = this.tick(snapshot);
      active.started = true; active.startPosition = position(snapshot); active.previousPosition = position(snapshot);
      active.entry.startTick = tick; active.entry.startFrame = this.frame(tick);
      let command: Command | undefined;
      const intent = goal.intent;
      if (intent.kind === 'skill') command = { type: 'training.action', request: { requestId: `ep-${this.segment.id}-${this.cursor}`, action: intent.action, ...(goal.targetId ? { targetId: goal.targetId } : {}) } };
      else if (!this.stateMatches(snapshot)) {
        const training = emptyTrainingInput();
        if (intent.kind === 'posture') {
          active.crouchAfterProne = intent.stance === 'crouch' && snapshot.training.surface.mode === 'prone';
          if (intent.stance === 'prone' || snapshot.training.surface.mode === 'prone') training.humanoid = { prone: true };
          else training.humanoid = { toggleCrouch: true };
        } else if (intent.kind === 'climb') {
          if (['enter', 'exit'].includes(intent.direction)) training.humanoid = intent.direction === 'exit' ? { releaseClimb: true } : { climb: true };
          else this.fail('EPISODE_ACTION_CLIMB_REQUIRED: attach to the intended surface before climbing along it', snapshot);
        } else {
          if (!snapshot.training.character.swimming) this.fail('EPISODE_ACTION_WATER_REQUIRED: swim-style requires actual swimming in a declared water volume', snapshot);
          training.humanoid = { toggleSwimStyle: true };
        }
        command = { type: 'training.input', input: training }; active.clearInput = true;
      }
      if (command) {
        const receipt = await this.execute(command, snapshot);
        if (receipt.status === 'accepted') active.operationId = receipt.operationId;
        else if (receipt.status === 'applied') active.operationComplete = true;
      } else active.operationComplete = true;
    }
    input = this.continuationInput(snapshot, forward);
    return { ...route, mode: 'action', input, positionWorldMetersXYZ: position(snapshot) };
  }
  /** Called after every actual simulation tick, including between captured frames. */
  async observe(snapshot: WorldSnapshot) {
    if (!this.active) return;
    const active = this.active, tick = this.tick(snapshot);
    this.record(snapshot);
    if (active.clearInput) {
      await this.execute({ type: 'training.input', input: null }, snapshot); active.clearInput = false;
    }
    if (active.crouchAfterProne && snapshot.training?.surface.mode === 'none') {
      await this.execute({ type: 'training.input', input: { ...emptyTrainingInput(), humanoid: { toggleCrouch: true } } }, snapshot);
      active.crouchAfterProne = false; active.clearInput = true;
    }
    if (active.operationId) {
      const operation = await this.session.operation(active.operationId); active.entry.operation = operation;
      if (operation.status === 'failed' || operation.status === 'cancelled') this.fail(`EPISODE_ACTION_${operation.status.toUpperCase()}: ${operation.error?.code ?? operation.phase}: ${operation.error?.message ?? ''}`, snapshot, operation.status === 'cancelled' ? 'cancelled' : 'failed');
      active.operationComplete = operation.status === 'succeeded';
    }
    const ready = active.started && active.operationComplete && this.stateMatches(snapshot);
    if (ready) active.settledAt ??= tick; else active.settledAt = undefined;
    const completion = active.goal.completion;
    if (ready && active.goal.intent.kind === 'skill' && completion.kind === 'displacement' && distance(position(snapshot), active.startPosition) < completion.minimumMeters) this.fail(`EPISODE_ACTION_DISPLACEMENT_SHORT: ${active.goal.id} completed before the required displacement`, snapshot);
    const complete = ready && (completion.kind === 'settled'
      ? (tick - active.settledAt!) * this.fixedTimeStepSeconds >= completion.holdSeconds
      : distance(position(snapshot), active.startPosition) >= completion.minimumMeters);
    if (complete) {
      this.record(snapshot, true);
      Object.assign(active.entry, { result: 'succeeded', endTick: tick, endFrame: this.frame(tick) });
      this.cursor++;
      this.chained = this.segment.actionGoals?.[this.cursor]?.trigger.waypointIndex === active.goal.trigger.waypointIndex;
      if (!this.chained) this.releasedWaypoint = active.goal.trigger.waypointIndex;
      this.active = undefined;
      return;
    }
    if ((tick - active.triggerTick) * this.fixedTimeStepSeconds >= active.goal.timeoutSeconds) this.fail(`EPISODE_ACTION_TIMEOUT: ${active.goal.id}; actual state: ${snapshot.training?.character.state}; ${snapshot.training?.message ?? ''}`, snapshot);
  }
  finish(snapshot: WorldSnapshot | undefined, failed: boolean) {
    for (const entry of this.timeline) {
      if (entry.result === 'pending') { entry.result = 'missing'; entry.diagnostic = 'Trigger was not reached during capture.'; }
      else if (entry.result === 'running') {
        entry.result = failed ? 'cancelled' : 'missing'; entry.diagnostic = failed ? 'Capture ended before this goal completed.' : 'Capture duration ended before this goal completed.';
        if (snapshot) { entry.endTick = this.tick(snapshot); entry.endFrame = this.frame(entry.endTick); }
      }
    }
  }
  assertComplete() {
    const missing = this.timeline.filter(entry => entry.result !== 'succeeded');
    if (missing.length) throw new Error(`EPISODE_ACTION_INCOMPLETE: ${missing.map(entry => `${entry.goalId}:${entry.result}`).join(', ')}`);
  }
}
