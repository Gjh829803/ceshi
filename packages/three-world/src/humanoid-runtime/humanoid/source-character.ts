import { AnimationAction, AnimationClip, AnimationMixer, Group, LoopOnce, Mesh, Object3D, PropertyBinding, Quaternion, Vector3 } from 'three';
import {disposeSourceGraphs,leaseSourceCharacter,type SourceCharacterLease} from './source-character-assets';
import type { SourceCharacterFrame as Simulation } from './animation';
import type { MotionSource } from './motion';
import { SWIMMING_ASSET_IDS, ACTION_NAMES, ANIMATION_LABELS as LABELS } from './catalog';
import { SWIM_ROOT_DEPTH, SWIM_SPEED } from './water-physics';
export { CHARACTER_ASSET_IDS } from './catalog';

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** Runtime entries already target the same GASP skeleton; UAL is retargeted offline. */
export interface CharacterClipEntry {
  id: string;
  clip: AnimationClip;
  metadata?: undefined | {
    rawDuration?: number;
    scalarCurves?: { control: string; values: number[] }[];
  };
}


// Contact intervals are measured in the reconstructed original poses. They are
// not interchangeable with UE Motion Warping notify windows. End times trim
// the long authored approach/exit tails once the landing pose is usable.
const TRAVERSAL_CALIBRATION: Record<string, Pick<MotionSource,
  'startTime' | 'endTime' | 'contactStart' | 'contactEnd' | 'referenceHeight' | 'referenceFrontZ' | 'referenceDepth' | 'landingTime'>> = {
  'hurdle-1m': { startTime: 0, endTime: 1.0333333, contactStart: .70, contactEnd: .85, referenceHeight: 1, referenceFrontZ: 4.28994274, referenceDepth: .4, landingTime: 1.0333333 },
  'mantle-1m': { startTime: 0, endTime: .8666667, contactStart: .5333333, contactEnd: .60, referenceHeight: 1, referenceFrontZ: 3.41263975, referenceDepth: 1.8, landingTime: .8333333 },
  'climb-2m5': { startTime: 0, endTime: 3.25, contactStart: .885, contactEnd: 1.50, referenceHeight: 2.5, referenceFrontZ: 3.88134408, referenceDepth: 1.5, landingTime: 2.9 },
};

/** Source root is copied before removing translation from the mixer clips. */
export function motionSourceFromClip(entry: CharacterClipEntry): MotionSource | undefined {
  const calibration = TRAVERSAL_CALIBRATION[entry.id];
  if (!calibration) return;
  const track = entry.clip.tracks.find(t => t.name === 'root.position');
  if (!track || track.getValueSize() !== 3) throw new Error(`${entry.id}: 缺少原始根位移`);
  const initial = track.values.slice(0, 3);
  const positions = Array.from(track.values, (value, i) => value - initial[i % 3]!);
  return { id: entry.id, times: Array.from(track.times), positions, duration: entry.clip.duration, ...calibration };
}

function authoredSpeed(entry: CharacterClipEntry) {
  const root = entry.clip.tracks.find(t => t.name === 'root.position');
  if (root && root.times.length > 1) {
    let distance = 0;
    for (let i = 3; i < root.values.length; i += 3) {
      distance += Math.hypot(root.values[i]! - root.values[i - 3]!, root.values[i + 2]! - root.values[i - 1]!);
    }
    const seconds = root.times.at(-1)! - root.times[0]!;
    if (seconds > 0 && distance > .01) return distance / seconds;
  }
  const speedCurve = entry.metadata?.scalarCurves?.find(c => c.control === 'MoveData_Speed_CURVE_CONTROL');
  if (speedCurve?.values.length) return speedCurve.values.reduce((a, b) => a + b, 0) / speedCurve.values.length / 100;
  return 0;
}

export class Character {
  private disposed=false;
  private createResourceInstance:(()=>Promise<Character>)|undefined;
  private releaseResources:()=>void;
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    try{this.mixer.stopAllAction();this.mixer.uncacheRoot(this.mixer.getRoot());}
    finally{try{this.releaseResources();}finally{this.root.removeFromParent();}}
  }
  root = new Group();
  mixer: AnimationMixer;
  actions: Record<string, AnimationAction> = {};
  bones: Record<string, Object3D> = {};
  weights: Record<string, number> = {};
  motionSources: MotionSource[] = [];
  smoothing = true;
  phase = 0;
  clipLabel = LABELS.idle!;
  clipCount = 0;
  rigTargets = 0;
  readonly authoredSpeeds: Record<string, number> = {};
  private readonly poseTimes: Record<string, number> = {};
  private lastLocomotionTargets: Record<string, number> = { idle: 1, walk: 0, run: 0 };
  private gait: 'idle' | 'walk' | 'run' = 'idle';
  private visualSpeed = 0;
  private observedMotionSerial = -1;
  private observedSimulation: Simulation | null = null;
  private traversalEntry: {serial: number; weights: Record<string, number>; duration: number} | null = null;

  static async load(assetBaseUrl:string|((logicalPath:string)=>string) = './assets/humanoid/source/') {
    return Character.fromLease(await leaseSourceCharacter(assetBaseUrl));
  }
  private static fromLease(lease:SourceCharacterLease):Character {
    try{
      const instance=new Character(lease.model,lease.entries,lease.dispose);
      const factory=lease.factory;instance.createResourceInstance=async()=>Character.fromLease(await factory());
      return instance;
    }catch(error){try{lease.dispose();}catch{/* Preserve binding failure. */}throw error;}
  }
  /** The immutable source factory survives the lifetime of any individual model. */
  createFactory():(()=>Promise<Character>)|undefined{
    if(this.disposed)throw new Error('SOURCE_CHARACTER_DISPOSED');return this.createResourceInstance;
  }

  constructor(model: Group, entries: CharacterClipEntry[],releaseResources?:()=>void) {
    this.releaseResources=releaseResources??(()=>disposeSourceGraphs([model]));
    // GLBs contain raw root tracks plus an origin-normalizing parent offset.
    // Physics owns translation in the playable scene, so remove that offset
    // and only root.position in cloned clips. Do not resize or rebind the rig.
    const stage = model.getObjectByName('GASP_DirectFK_Research');
    if (!stage) throw new Error('缺少 GASP 原始骨架节点');
    stage.position.set(0, 0, 0);
    this.root.name = 'GASP_Runner';
    this.root.add(model);
    model.traverse(o => {
      if (o.name) this.bones[o.name] = o;
      if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    const rootBone = this.bones.root;
    if (!rootBone || rootBone.type !== 'Bone') throw new Error('GASP 缺少 root 骨骼');
    rootBone.position.set(0, 0, 0);
    this.mixer = new AnimationMixer(model);
    for (const entry of entries) {
      const source = motionSourceFromClip(entry);
      if (source) this.motionSources.push(source);
      const key = ACTION_NAMES[entry.id] ?? entry.id;
      if (this.actions[key]) throw new Error(`重复 GASP 动作: ${entry.id}`);
      const clip = entry.clip.clone();
      clip.tracks = clip.tracks.filter(t => t.name !== 'root.position');
      // The controller owns heading as well as position. Retain pitch/roll,
      // but remove authored yaw so Turn/Pivot never rotate the actor twice.
      if (!source) {
        const track = clip.tracks.find(t => t.name === 'root.quaternion');
        if (track) for (let i = 0; i < track.values.length; i += 4) {
          const rotation = new Quaternion().fromArray(track.values, i);
          const yaw = new Quaternion(0, rotation.y, 0, rotation.w);
          if (yaw.lengthSq() > 1e-8) rotation.premultiply(yaw.normalize().invert());
          rotation.normalize().toArray(track.values, i);
        }
      }
      for (const track of clip.tracks) {
        const binding = PropertyBinding.parseTrackName(track.name);
        const bone = this.bones[binding.nodeName];
        if (!bone || bone.type !== 'Bone') throw new Error(`GASP 动作骨骼不匹配: ${entry.id}/${track.name}`);
      }
      const action = this.mixer.clipAction(clip);
      action.setLoop(LoopOnce, 1); action.clampWhenFinished = true;
      action.play(); action.paused = true; action.setEffectiveWeight(key === 'idle' ? 1 : 0);
      this.actions[key] = action;
      this.weights[key] = key === 'idle' ? 1 : 0;
      this.authoredSpeeds[key] = authoredSpeed(entry);
      this.poseTimes[key] = 0;
    }
    for (const key of ['idle', 'walk', 'run']) if (!this.actions[key]) throw new Error(`缺少 GASP 基础动作: ${key}`);
    if (this.authoredSpeeds.walk! <= 0 || this.authoredSpeeds.run! <= 0) throw new Error('GASP 移动动作缺少可用速度');
    this.clipCount = entries.length;
    this.rigTargets = Object.values(this.bones).filter(o => o.type === 'Bone').length;
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
  }

  private loop(key: string, dt: number, rate = 1) {
    const action = this.actions[key];
    if (!action) return;
    this.poseTimes[key] = (this.poseTimes[key]! + dt * Math.max(0, Math.min(2, rate))) % action.getClip().duration;
    action.time = this.poseTimes[key]!;
    action.enabled = true;
  }

  /** Animation events are produced by the fixed-step controller, not keydown. */
  private eventPose(sim: Simulation): {key: string; weight: number} | null {
    const event = sim.animationEvent;
    if (!event) return null;
    let key: string;
    let duration: number;
    let sourceStart = 0;
    switch (event.kind) {
      // The originals include anticipation/falling tails. Physical takeoff
      // and contact must enter their measured segments, not replay those tails.
      case 'jump': key = event.moving ? 'jump-run' : 'jump-stand'; duration = .36; sourceStart = event.moving ? 7 / 30 : 10 / 30; break;
      case 'land': key = event.moving ? event.heavy ? 'land-run-heavy' : 'land-run-light' : event.heavy ? 'land-heavy' : 'land-light'; duration = event.heavy ? .75 : .45; sourceStart = event.heavy ? 1 : .5; break;
      case 'start': key = 'run-start'; duration = .5; break;
      case 'stop': key = 'run-stop'; duration = .55; sourceStart = .7; break;
      case 'turn': key = event.turn > 0 ? 'turn-left' : 'turn-right'; duration = .7; break;
      case 'pivot': key = event.turn > 0 ? 'turn-back-left' : 'turn-back-right'; duration = .75; break;
    }
    const action = this.actions[key];
    if (!action || event.elapsed >= duration) return null;
    if (event.kind === 'jump') {
      if (sim.grounded) return null;
      // Map source takeoff -> apex to the actual ballistic ascent. The two
      // sources have different anticipation lengths, but share this controller.
      const progress = Math.max(0, Math.min(1, 1 - sim.vertical / 6.3));
      const apex = event.moving ? 21 / 30 : 25 / 30;
      action.time = sourceStart + (apex - sourceStart) * progress;
    } else {
      // The original stop still leans at 1.15 s. Include its recovery to 1.7 s,
      // instead of cutting the clip off while the pelvis is ahead of the feet.
      const sourceElapsed = event.kind === 'stop' ? event.elapsed / duration : event.elapsed;
      action.time = Math.min(action.getClip().duration, sourceStart + sourceElapsed);
    }
    action.enabled = true;
    this.phase = event.elapsed / duration;
    let weight = 1;
    if (event.kind === 'land') {
      // Absorb the impact before returning to whichever gait is now requested.
      // Finish the authored recovery blend before the controller releases the
      // event; a full-weight clip until that deadline produced an abrupt run.
      const hold = event.heavy ? .22 : .14;
      weight = 1 - smooth((event.elapsed - hold) / (duration - .06 - hold));
    } else if (event.kind !== 'jump') {
      const strength = Math.max(0, Math.min(1, event.strength ?? 1));
      const moving = event.moving || sim.speed > .2;
      const peak = event.kind === 'start' ? .28 : event.kind === 'stop' ? .32
        : moving ? event.kind === 'pivot' ? .18 : .12 : 1;
      const release = event.kind === 'start' ? .18 : event.kind === 'stop' ? .12 : .3;
      weight = peak * strength * smooth(event.elapsed / .06)
        * (1 - smooth((event.elapsed - release) / (duration - release)));
      if (event.kind === 'start' && sim.speed < .2) weight = 0;
    }
    return {key, weight};
  }

  update(dt: number, sim: Simulation) {
    this.root.position.copy(sim.position);
    this.root.rotation.set(0, Math.atan2(sim.facing.x, sim.facing.z), 0, 'YXZ');
    const tr = sim.traversal;
    // A new level creates a Simulation whose local serial can match the old
    // level. Neither reset may carry an old wall/swimming pose into its spawn.
    if ((sim !== this.observedSimulation || sim.motionSerial !== this.observedMotionSerial) && !tr && !sim.completedMotion) {
      for (const [key, action] of Object.entries(this.actions)) {
        action.time = 0;
        this.poseTimes[key] = 0;
        this.weights[key] = key === 'idle' ? 1 : 0;
      }
      this.lastLocomotionTargets = { idle: 1, walk: 0, run: 0 };
      this.gait = 'idle';
      this.visualSpeed = 0;
      this.traversalEntry = null;
    }
    this.observedSimulation = sim;
    this.observedMotionSerial = sim.motionSerial;
    // Character-controller seam corrections can report one almost-zero speed
    // tick. A 60 ms visual filter prevents that tick from selecting idle/walk.
    this.visualSpeed += (sim.speed - this.visualSpeed) * (1 - Math.exp(-Math.max(0, dt) / .06));
    const animationGrounded = sim.animationGrounded;
    const targets: Record<string, number> = {};
    if (tr) {
      const key = tr.motion.sourceId;
      const action = this.actions[key];
      if (!action) throw new Error(`未加载的 GASP 穿越动作: ${key}`);
      if (this.traversalEntry?.serial !== sim.motionSerial) {
        const source = this.motionSources.find(s => s.id === key);
        if (!source) throw new Error(`缺少 GASP 接触时序: ${key}`);
        this.traversalEntry = {
          serial: sim.motionSerial,
          weights: {...this.weights},
          duration: Math.min(.12, Math.max(0, tr.motion.approachDuration ?? source.contactStart - tr.motion.startTime)),
        };
      }
      const sample = tr.motion.sample(tr.elapsed);
      action.time = sample.sourceTime;
      action.enabled = true;
      targets[key] = 1;
      this.phase = Math.min(1, tr.elapsed / tr.duration);
      this.clipLabel = LABELS[key] ?? key;
    } else if (sim.swimming && this.actions['swim-idle'] && this.actions['swim-forward']) {
      const movingKey=sim.swimStyle==='freestyle'&&this.actions['swim-freestyle']?'swim-freestyle':'swim-forward';
      const key = this.visualSpeed > .12 ? movingKey : 'swim-idle';
      targets[key] = 1;
      this.loop('swim-idle', dt);
      this.loop(movingKey, dt, Math.max(.65, this.visualSpeed / SWIM_SPEED));
      this.phase = this.poseTimes[key]! / this.actions[key]!.getClip().duration;
      this.clipLabel = LABELS[key]!;
    } else if (sim.surface?.pose && this.actions[sim.surface.pose.key]) {
      const pose=sim.surface.pose,action=this.actions[pose.key]!;
      action.time=pose.time;action.enabled=true;targets[pose.key]=1;
      this.phase=pose.time/action.getClip().duration;this.clipLabel=LABELS[pose.key]??pose.key;
    } else if (sim.skills?.pose && this.actions[sim.skills.pose.key]) {
      const pose=sim.skills.pose,action=this.actions[pose.key]!;
      action.time=pose.time;action.enabled=true;targets[pose.key]=1;
      this.phase=pose.time/action.getClip().duration;this.clipLabel=LABELS[pose.key]??pose.key;
    } else if (sim.skills?.seated && this.actions['sit-idle']) {
      targets['sit-idle']=1;this.loop('sit-idle',dt);this.clipLabel=LABELS['sit-idle']!;
    } else if (sim.skills?.carrying && animationGrounded && this.actions['carry-walk']) {
      targets['carry-walk']=1;
      if(this.visualSpeed>.07)this.loop('carry-walk',dt,this.visualSpeed/1.45);
      else this.actions['carry-walk']!.time=1.90;
      this.clipLabel=this.visualSpeed>.07?LABELS['carry-walk']!:'UAL · 搬运持物（原行走静帧）';
    } else if (!animationGrounded) {
      const eventKey = sim.animationEvent?.kind === 'jump' && sim.vertical > 0 ? this.eventPose(sim)?.key : null;
      if (eventKey) targets[eventKey] = 1;
      else if (this.actions['fall-loop']) {
        targets['fall-loop'] = 1;
        this.loop('fall-loop', dt);
      } else Object.assign(targets, this.lastLocomotionTargets); // Six-clip comparison fixtures.
      this.clipLabel = LABELS[eventKey ?? 'fall-loop'] ?? '未载入空中动画';
    } else if (sim.stance === 'crouch' && this.actions['crouch-idle'] && this.actions['crouch-walk']) {
      const authored = this.authoredSpeeds['crouch-walk'] || 1.05;
      // Rate follows real speed. A permanent idle/walk blend puts knees from
      // different contact phases together and can push a foot below the floor.
      const movingWeight = this.visualSpeed > .08 ? 1 : 0;
      targets['crouch-walk'] = movingWeight;
      targets['crouch-idle'] = 1 - movingWeight;
      this.loop('crouch-walk', dt, this.visualSpeed / authored);
      this.loop('crouch-idle', dt);
      this.clipLabel = LABELS[sim.speed > .1 ? 'crouch-walk' : 'crouch-idle']!;
    } else {
      const speed = this.visualSpeed;
      const walkSpeed = this.authoredSpeeds.walk!;
      // These recordings contain different numbers of strides and opposite
      // foot phases. Permanently mixing them cancelled leg swing at 3.1 m/s.
      // Select a gait with hysteresis; only the short transition mixes poses.
      const runThreshold = walkSpeed * 1.2;
      if (speed < .08) this.gait = 'idle';
      else if (this.gait === 'run') this.gait = speed < runThreshold - .15 ? 'walk' : 'run';
      else this.gait = speed > runThreshold + .15 ? 'run' : 'walk';
      targets[this.gait] = 1;
      this.lastLocomotionTargets = { ...targets };
      for (const key of ['idle', 'walk', 'run']) {
        const rate = key === 'idle' ? 1 : speed / this.authoredSpeeds[key]!;
        this.loop(key, dt, rate);
      }
      const leading = this.gait;
      this.phase = this.poseTimes[leading]! / this.actions[leading]!.getClip().duration;
      this.clipLabel = Object.entries(targets).filter(([, weight]) => weight > .05).map(([key]) => LABELS[key]).join(' + ');
      const event = this.eventPose(sim);
      if (event && event.weight > 0) {
        for (const key of Object.keys(targets)) targets[key]! *= 1 - event.weight;
        targets[event.key] = event.weight;
        this.clipLabel = event.weight > .8 ? LABELS[event.key]! : `${this.clipLabel} + ${LABELS[event.key]}`;
      }
    }
    // Entry has a finite deadline: the source pose owns every joint before
    // contact begins. An exponential blend never fully removes locomotion and
    // would leave the authored hands away from the ledge during a short entry.
    // Exit/locomotion retain ordinary exponential blending, not UE PoseSearch.
    const entry = tr ? this.traversalEntry : null;
    const progress = entry && entry.duration > 0 ? Math.min(1, Math.max(0, tr!.elapsed / entry.duration)) : 1;
    const landing = !tr && animationGrounded && sim.animationEvent?.kind === 'land'
      && sim.animationEvent.elapsed < (sim.animationEvent.heavy ? .9 : .6);
    const blend = !this.smoothing ? 1 : entry ? progress * progress * (3 - 2 * progress)
      : 1 - Math.exp(-Math.max(0, dt) / (landing ? .055 : sim.swimming ? .18 : .1));
    for (const [key, action] of Object.entries(this.actions)) {
      const previous = (entry ? entry.weights[key] : this.weights[key]) ?? 0;
      this.weights[key] = previous + ((targets[key] ?? 0) - previous) * blend;
      action.setEffectiveWeight(this.weights[key]!);
    }
    if (!tr) this.traversalEntry = null;
    // The last physics tick can complete or interrupt a traversal before the
    // next rendered frame. Preserve its exact source pose for the exit blend.
    if (sim.completedMotion && !tr) {
      this.actions[sim.completedMotion.sourceId]!.time = sim.completedMotion.sourceTime;
    }
    this.mixer.update(0);
    this.bones.root!.position.set(0, 0, 0);
    // UAL swim poses are authored about the water plane, land poses about feet.
    // Blend this convention change with the exact same pose weights. Following
    // the physical reference preserves plunge depth and buoyancy, without a snap
    // to the surface. Traversal fully removes the offset before ledge contact.
    this.root.position.y += SWIM_ROOT_DEPTH * SWIMMING_ASSET_IDS.reduce((sum,key)=>sum+(this.weights[key]??0),0);
    this.root.updateMatrixWorld(true);
    if(sim.skills?.carrying){
      const left=this.bones.hand_l!.getWorldPosition(new Vector3());
      if(sim.skills.active?.id!=='pickup')left.lerp(this.bones.hand_r!.getWorldPosition(new Vector3()),.5);
      sim.skills.syncCarried(left);
    }
  }
}
