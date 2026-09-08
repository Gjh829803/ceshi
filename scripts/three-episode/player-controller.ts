import type { EpisodeCapabilities, EpisodeFrame, Vec3, WorldSnapshot } from '@worldkit/three';
import type { EpisodeCaptureSession } from './browser.js';
import type { EpisodeSegmentPlan } from './contracts.js';
import { RouteController, type RouteDecision, type RouteMovement } from './route-controller.js';
import { TrainingRouteController } from './training-route.js';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const angle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
const pulse = (time: number, start: number, duration: number) => time <= start || time >= start + duration ? 0 : Math.sin(Math.PI * (time - start) / duration) ** 2;
export interface PlayerDecision extends RouteDecision {
  behavior: { phase: 'travel' | 'observe' | 'jump' | 'landing' | 'recovery'; paceRatio: number; plannedJump: 'pending' | 'applied' | 'unsupported' | 'not-scheduled' | 'deferred'; jumpProbe?: string; cameraSupported: boolean };
}

/** Timing and input only. All targets remain the cloud Agent's polyline. The
 * physics port owns clearance, movement, jumps and camera collision response. */
export class PlayerCaptureController {
  private readonly route: RouteController;
  private readonly trainingRoute:TrainingRouteController;
  private mounted=false;
  private readonly ordinal: number;
  private activeSeconds = 0;
  private previousTime = 0;
  private paused = false;
  private yawBase?: number;
  private pitchBase?: number;
  private headingOffset?: number;
  private yawRate?: number;
  private pitchRate?: number;
  private previousCamera?: { yaw: number; pitch: number; yawInput: number; pitchInput: number; time: number } | undefined;
  private jumpState: PlayerDecision['behavior']['plannedJump'];
  private nextJumpAt: number;
  private jumpAppliedAt?: number;
  private airborneSeen = false;
  private landedAt?: number;
  private pace = 0.8;
  constructor(private readonly segment: EpisodeSegmentPlan, private readonly movement: RouteMovement,
    private readonly cameraMode: EpisodeCapabilities['camera']['mode'], private readonly probe: EpisodeCaptureSession['probeStart'], private readonly customInput?:EpisodeCaptureSession['routeInput']) {
    this.route = new RouteController(segment, movement);
    this.trainingRoute=new TrainingRouteController(segment);
    this.ordinal = Number(segment.id.slice(-2));
    this.jumpState = segment.actionGoals?.length ? 'not-scheduled' : (movement.jumpSpeedMetersPerSecond ?? 0) <= 0 ? 'unsupported' : this.ordinal % 2 === 0 ? 'pending' : 'not-scheduled';
    this.nextJumpAt = 14 + this.ordinal * 0.4;
  }
  holdWaypoint(trigger: { waypointIndex: number; radiusMeters: number } | undefined) { this.route.holdWaypoint(trigger);this.trainingRoute.holdWaypoint(trigger); }
  completeHeldWaypoint(index: number) { if(this.mounted){this.trainingRoute.completeHeldWaypoint(index);this.route.seekCursor(this.trainingRoute.cursor);}else{this.route.completeHeldWaypoint(index);this.trainingRoute.seekCursor(this.route.cursor);} }
  pause(time: number) { this.previousTime = time; this.paused = true; this.previousCamera = undefined; }
  async step(snapshot: WorldSnapshot, forward: Vec3, time: number): Promise<PlayerDecision> {
    const mounted=Boolean(snapshot.training?.mountedInstanceId);
    if(mounted!==this.mounted){if(mounted)this.trainingRoute.seekCursor(this.route.cursor);else this.route.seekCursor(this.trainingRoute.cursor);this.mounted=mounted;}
    if(mounted){
      this.previousTime=time;
      const decision=this.trainingRoute.step(snapshot,time);
      return {...decision,input:decision.mode==='action'||this.cameraMode==='authored'?decision.input:{...decision.input,cameraYawRatio:Math.sin(time*.8)*.35,cameraPitchRatio:Math.cos(time*.45)*.08},
        behavior:{phase:'travel',paceRatio:1,plannedJump:'unsupported',cameraSupported:this.cameraMode!=='authored'}};
    }
    const dt = Math.max(0, time - this.previousTime);
    if (!this.paused) this.activeSeconds += dt;
    this.previousTime = time;
    const decision = this.route.step(snapshot, forward, this.activeSeconds);
    if(this.customInput&&this.movement.kind==='custom'){
      this.paused=decision.mode==='action';
      const target=decision.targetPositionWorldMetersXYZ??decision.positionWorldMetersXYZ;
      const input=await this.customInput({targetPositionWorldMetersXYZ:target,gait:decision.mode==='backtrack'?'walk':this.segment.waypoints[decision.waypointIndex]?.gait??'walk',mode:decision.mode==='travel'||decision.mode==='backtrack'?'travel':'stop'});
      return {...decision,input,behavior:{phase:'travel',paceRatio:1,plannedJump:'unsupported',cameraSupported:this.cameraMode!=='authored'}};
    }
    if (decision.mode === 'action') {
      this.paused = true;
      return { ...decision, behavior: { phase: 'observe', paceRatio: 0, plannedJump: this.jumpState, cameraSupported: this.cameraMode !== 'authored' } };
    }
    const actor = snapshot.entities.find(e => e.id === snapshot.controlledEntityId)!;
    const grounded = actor.motion?.isGrounded ?? false;
    const cameraSupported = this.cameraMode !== 'authored';
    const lookStart = 4 + this.ordinal * 0.45;
    const lookDuration = this.ordinal % 2 === 0 ? 2.6 : 1.4;
    const observe = !this.segment.actionGoals?.length && decision.mode === 'travel' && grounded && time >= lookStart && time < lookStart + lookDuration;
    this.paused = observe;
    const input = { ...decision.input };
    let phase: PlayerDecision['behavior']['phase'] = observe ? 'observe' : decision.mode === 'backtrack' ? 'recovery' : 'travel';
    let jumpProbe: string | undefined;
    if ((this.jumpState === 'pending' || this.jumpState === 'deferred') && time >= this.nextJumpAt && time < 23 && grounded && !observe && decision.mode === 'travel' && decision.targetPositionWorldMetersXYZ) {
      // Small local samples along this one Agent edge, never a global route search.
      const p = decision.positionWorldMetersXYZ, target = decision.targetPositionWorldMetersXYZ;
      const distance = Math.hypot(target[0] - p[0], target[2] - p[2]);
      const span = Math.max(2, this.movement.walkSpeedMetersPerSecond * 1.5);
      let safe = distance > span + this.movement.radiusMeters;
      let y = p[1];
      if (safe) for (let offset = 0; offset <= span; offset += 0.5) {
        const result = await this.probe({ positionWorldMetersXYZ: [p[0] + (target[0] - p[0]) * offset / distance, y, p[2] + (target[2] - p[2]) * offset / distance], facingYawRadians: this.segment.start.facingYawRadians });
        if (!result.isValid) { safe = false; break; }
        y = result.resolvedPositionWorldMetersXYZ[1];
      }
      jumpProbe = safe ? 'local-support-and-capsule-clearance-passed' : 'local-clearance-or-edge-length-insufficient';
      if (safe) { input.jumpPressed = true; this.jumpState = 'applied'; this.jumpAppliedAt = time; }
      else { this.jumpState = 'deferred'; this.nextJumpAt = time + 1.5; }
    }
    if (this.jumpAppliedAt !== undefined && !grounded) this.airborneSeen = true;
    if (this.airborneSeen && grounded && this.landedAt === undefined) this.landedAt = time;
    const jumpActive = this.jumpAppliedAt !== undefined && this.landedAt === undefined && time - this.jumpAppliedAt < 4;
    const settling = this.landedAt !== undefined && time - this.landedAt < 0.45;
    if (jumpActive) phase = 'jump'; else if (settling) phase = 'landing';
    if (decision.mode === 'travel') {
      const walkBreak = this.segment.actionGoals?.length ? false : time < 1.1 || observe || jumpActive || settling || (time > 18 && time < 20) || (decision.distanceToTargetMeters ?? 0) < 1.4;
      input.run = !walkBreak && Boolean(input.run);
      // Pace the requested gait so a valid stop route is not exhausted prematurely.
      // A minimum pace preserves the existing too-short-route failure.
      let desiredPace = 1;
      if (this.segment.endBehavior === 'stop' && decision.targetPositionWorldMetersXYZ) {
        let remaining = decision.distanceToTargetMeters ?? 0;
        for (let i = decision.waypointIndex + 1; i < this.segment.waypoints.length; i++) {
          const a = this.segment.waypoints[i-1]!.positionWorldMetersXYZ, b = this.segment.waypoints[i]!.positionWorldMetersXYZ;
          remaining += Math.hypot(b[0]-a[0], b[2]-a[2]);
        }
        const speed = input.run ? this.movement.runSpeedMetersPerSecond : this.movement.walkSpeedMetersPerSecond;
        desiredPace = clamp(remaining / Math.max(1, 28.8-time) / speed, input.run ? 0.85 : 0.65, 1);
      }
      this.pace += clamp(desiredPace - this.pace, -dt * 1.5, dt * 1.5);
      input.moveXRatio = (input.moveXRatio ?? 0) * (observe ? 0 : this.pace);
      input.moveZRatio = (input.moveZRatio ?? 0) * (observe ? 0 : this.pace);
    }
    if (cameraSupported && snapshot.camera) {
      const yaw = snapshot.camera.desiredYawRadians, pitch = snapshot.camera.desiredPitchRadians;
      this.yawBase ??= yaw; this.pitchBase ??= pitch;
      const previous = this.previousCamera;
      if (previous && snapshot.simulationSeconds > previous.time) {
        if (Math.abs(previous.yawInput) > 0.0001) {
          const measured = angle(yaw - previous.yaw) / ((snapshot.simulationSeconds - previous.time) * previous.yawInput);
          if (measured > 0.0001) this.yawRate = measured;
        }
        if (Math.abs(previous.pitchInput) > 0.0001) {
          const measured = (pitch - previous.pitch) / ((snapshot.simulationSeconds - previous.time) * previous.pitchInput);
          if (measured > 0.0001) this.pitchRate = measured;
        }
      }
      // Keep the authored relative framing, and gradually follow Agent turns.
      if (!observe && decision.targetPositionWorldMetersXYZ && grounded) {
        const target = decision.targetPositionWorldMetersXYZ, p = decision.positionWorldMetersXYZ;
        const heading = Math.atan2(-(target[0]-p[0]), -(target[2]-p[2]));
        this.headingOffset ??= angle(yaw - this.segment.start.facingYawRadians);
        this.yawBase += clamp(angle(heading + this.headingOffset - this.yawBase), -dt * 0.4, dt * 0.4);
      }
      const sign = this.ordinal % 2 === 0 ? 1 : -1;
      const offset = sign * (0.7 * pulse(time, lookStart, lookDuration) - 0.55 * pulse(time, 10.5 + this.ordinal * 0.2, 4.5) + 0.65 * pulse(time, 23.5, 5));
      const pitchOffset = 0.09 * pulse(time, lookStart, lookDuration + 0.5) - 0.07 * pulse(time, 21, 5);
      const yawError = angle(this.yawBase + offset - yaw), pitchError = this.pitchBase + pitchOffset - pitch;
      const locked = jumpActive || settling || decision.mode !== 'travel';
      input.cameraYawRatio = locked ? 0 : this.yawRate ? clamp(yawError * 4, -0.85, 0.85) / this.yawRate : (Math.abs(yawError) > 0.005 ? Math.sign(yawError) * 0.01 : 0);
      input.cameraPitchRatio = locked ? 0 : this.pitchRate ? clamp(pitchError * 4, -0.2, 0.2) / this.pitchRate : (Math.abs(pitchError) > 0.003 ? Math.sign(pitchError) * 0.01 : 0);
      input.cameraYawRatio = clamp(input.cameraYawRatio, -1, 1); input.cameraPitchRatio = clamp(input.cameraPitchRatio, -1, 1);
      this.previousCamera = { yaw, pitch, yawInput: input.cameraYawRatio, pitchInput: input.cameraPitchRatio, time: snapshot.simulationSeconds };
    }
    return { ...decision, input, behavior: { phase, paceRatio: observe ? 0 : this.pace, plannedJump: this.jumpState, cameraSupported, ...(jumpProbe ? { jumpProbe } : {}) } };
  }
}

export function summarizePlayerBehavior(frames: readonly { snapshot: WorldSnapshot; camera: EpisodeFrame['camera']; decision: RouteDecision }[]) {
  let walkSeconds = 0, runSeconds = 0, stillSeconds = 0, diagonalSeconds = 0, takeoffs = 0, landings = 0, airSeconds = 0, jumpPresses = 0;
  let yaw = 0, yawTravel = 0, previousYaw: number | undefined, previousGrounded: boolean | undefined;
  const yaws: number[] = [], pitches: number[] = [];
  for (const f of frames) {
    const actor = f.snapshot.entities.find(e => e.id === f.snapshot.controlledEntityId), m = f.camera.cameraToWorldMatrix;
    const observedYaw = Math.atan2(m[8]!, m[10]!);
    if (previousYaw !== undefined) { const delta = angle(observedYaw - previousYaw); yaw += delta; yawTravel += Math.abs(delta); }
    previousYaw = observedYaw; yaws.push(yaw); pitches.push(Math.asin(clamp(m[9]!, -1, 1)));
    const grounded = actor?.motion?.isGrounded;
    if (previousGrounded === true && grounded === false) takeoffs++;
    if (previousGrounded === false && grounded === true) landings++;
    previousGrounded = grounded;
    if (grounded === false) airSeconds += 1/24;
    if (f.decision.input.jumpPressed) jumpPresses++;
    const velocity = actor?.motion?.velocityWorldMetersPerSecondXYZ ?? [0,0,0];
    const speed = Math.hypot(velocity[0], velocity[2]);
    if (speed < 0.1) stillSeconds += 1/24; else if (f.decision.input.run) runSeconds += 1/24; else walkSeconds += 1/24;
    if (speed >= 0.1 && Math.abs(f.decision.input.moveXRatio ?? 0) > 0.2 && Math.abs(f.decision.input.moveZRatio ?? 0) > 0.2) diagonalSeconds += 1/24;
  }
  const plannedJumps = frames.flatMap((f, index) => {
    if (!(f.decision as PlayerDecision).behavior || !f.decision.input.jumpPressed || (f.decision as PlayerDecision).behavior.plannedJump !== 'applied') return [];
    const takeoffIndex = frames.findIndex((next, nextIndex) => {
      const motion = next.snapshot.entities.find(e => e.id === next.snapshot.controlledEntityId)?.motion;
      return nextIndex > index && nextIndex < index + 24 && motion?.isGrounded === false && motion.velocityWorldMetersPerSecondXYZ[1] > 0.1;
    });
    const landingIndex = takeoffIndex < 0 ? -1 : frames.findIndex((next, nextIndex) => nextIndex > takeoffIndex && nextIndex < index + 96 && next.snapshot.entities.find(e => e.id === next.snapshot.controlledEntityId)?.motion?.isGrounded === true);
    return [{ requestedAtSeconds: index/24, takeoffAtSeconds: takeoffIndex < 0 ? null : takeoffIndex/24, landedAtSeconds: landingIndex < 0 ? null : landingIndex/24 }];
  });
  return { plannedJumps, walkSeconds, runSeconds, stillSeconds, diagonalSeconds, takeoffs, landings, airSeconds, jumpPresses,
    renderedYawTravelDegrees: yawTravel*180/Math.PI, renderedYawRangeDegrees: (Math.max(0,...yaws)-Math.min(0,...yaws))*180/Math.PI,
    renderedPitchRangeDegrees: pitches.length ? (Math.max(...pitches)-Math.min(...pitches))*180/Math.PI : 0 };
}

/** Optional enrichment diagnostics; explicit requested actions are checked by EpisodeActionController. */
export function playerBehaviorFeedback(frames: readonly {snapshot:WorldSnapshot;camera:EpisodeFrame['camera'];decision:RouteDecision}[],capabilities:EpisodeCapabilities,hasActionGoals=false){
  const evidence=summarizePlayerBehavior(frames),diagnostics:{code:string;message:string}[]=[];
  if(!hasActionGoals){
    const mounted=frames.some(f=>!!f.snapshot.training?.mountedInstanceId);
    if(capabilities.camera.mode!=='authored'&&(mounted?evidence.renderedYawTravelDegrees<10:evidence.renderedYawRangeDegrees<20||evidence.renderedYawTravelDegrees<40))diagnostics.push({code:'CAMERA_VARIATION_LOW',message:'Recorded camera variation was limited; compare the actual framing with the requested composition.'});
    if(evidence.plannedJumps.some(j=>j.takeoffAtSeconds===null||j.landedAtSeconds===null))diagnostics.push({code:'OPTIONAL_JUMP_INCOMPLETE',message:'An automatically suggested jump lacked observed takeoff/landing; this is not an explicitly requested action failure.'});
  }
  return {evidence,diagnostics};
}
/** @deprecated Use playerBehaviorFeedback; enrichment does not reject valid recordings. */
export function assertPlayerBehavior(frames: readonly {snapshot:WorldSnapshot;camera:EpisodeFrame['camera'];decision:RouteDecision}[],capabilities:EpisodeCapabilities,hasActionGoals=false){playerBehaviorFeedback(frames,capabilities,hasActionGoals);}
