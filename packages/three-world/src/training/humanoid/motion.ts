import {Vector3} from 'three';

/** Converted original root translation; meters, Y-up, +Z forward, frame zero at the origin. */
export interface MotionSource {
  id: string;
  times: readonly number[];
  positions: readonly number[];
  duration: number;
  startTime: number;
  endTime: number;
  /** Actual authored contact interval, not necessarily a MotionWarping notify interval. */
  contactStart: number;
  contactEnd: number;
  referenceHeight: number;
  referenceFrontZ: number;
  referenceDepth: number;
  landingTime?: number;
}

export interface TraversalMotionTarget {
  start: Vector3;
  /** X/Z define the front wall plane. The entry ground is start.y. */
  front: Vector3;
  /** Outward wall normal. */
  normal: Vector3;
  height: number;
  depth: number;
  end: Vector3;
  kind: 'vault' | 'mantle' | 'climb';
  entryMode?: 'ground' | 'air';
  /** World velocity before an airborne catch; used only before hand contact. */
  entryVelocity?: Vector3;
}

export interface MotionSample {
  position: Vector3;
  sourceTime: number;
  phase: 'reach' | 'grip' | 'pull' | 'settle';
  contactWeight: number;
}

export interface MotionPlan {
  sourceId: string;
  startTime: number;
  endTime: number;
  duration: number;
  /** Real seconds before authored hand contact (may exceed the source interval). */
  approachDuration?: number;
  end: Vector3;
  entryError?: number;
  sample(elapsedSeconds: number): MotionSample;
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const ease = (from: number, to: number, t: number) => {
  const p = clamp((t - from) / Math.max(1e-6, to - from), 0, 1);
  return clamp(p * p * p * (p * (6 * p - 15) + 10), 0, 1);
};

/** Sample the original displacement rather than replacing it with an actor lerp. */
export function sampleRoot(source: MotionSource, time: number): Vector3 {
  const {times, positions} = source;
  if (!Number.isFinite(time) || !times.length || positions.length !== times.length * 3) {
    throw new Error('Invalid root-motion samples');
  }
  let lo = 0, hi = times.length - 1;
  const t = clamp(time, times[0]!, times[hi]!);
  while (lo < hi - 1) {
    const middle = (lo + hi) >> 1;
    if (times[middle]! <= t) lo = middle;
    else hi = middle;
  }
  const a = new Vector3(positions[lo * 3]!, positions[lo * 3 + 1]!, positions[lo * 3 + 2]!);
  if (lo === hi) return a;
  const b = new Vector3(positions[hi * 3]!, positions[hi * 3 + 1]!, positions[hi * 3 + 2]!);
  return a.lerp(b, (t - times[lo]!) / (times[hi]! - times[lo]!));
}

/**
 * Experimental actor-root warping for an authored ledge. All skeleton-local
 * translations, rotations and scales remain the source animation's responsibility.
 * This is not UE's Skew Warp or Pose Search implementation.
 *
 * The source path is anchored against the wall while the hands are in contact.
 * Quintic corrections reconcile the entry and exit outside that interval. A low
 * hurdle returns its height correction to zero at landing; a mantle keeps it.
 */
export function createTraversalMotion(source: MotionSource, target: TraversalMotionTarget): MotionPlan {
  validate(source, target);
  const forward = target.normal.clone().setY(0).normalize().negate();
  const right = new Vector3(forward.z, 0, -forward.x);
  const start = target.start.clone(), end = target.end.clone();
  const airborne = target.entryMode === 'air';
  const wall = new Vector3(target.front.x, airborne ? start.y + target.height - source.referenceHeight : start.y, target.front.z);
  const heightDelta = airborne ? 0 : target.height - source.referenceHeight;
  const endTime = source.endTime;
  const entryOffset = start.clone().sub(target.front).setY(0);
  const wallDistance = entryOffset.dot(target.normal.clone().setY(0).normalize());
  // An already touching capsule cannot reproduce the recorded running approach.
  // Permit its last reach frames only in a bounded, grounded near-wall band.
  // The ordinary source-error gate still rejects unrelated/faraway pairings.
  const closeGroundEntry = !airborne && wallDistance >= .2 && wallDistance <= .6
    && Math.abs(entryOffset.dot(right)) <= .3;
  const minimumApproach = airborne ? .12 : closeGroundEntry ? .05 : .15;
  const latestEntry = Math.max(source.startTime, source.contactStart - minimumApproach);
  const earliestEntry = airborne ? Math.max(source.startTime, source.contactStart - .32) : source.startTime;

  // Match a real approach frame to the observed wall distance. Sampling at 120 Hz
  // avoids assuming monotone forward motion in arbitrary source root tracks.
  let startTime = source.startTime, bestDistance = Infinity;
  for (let i = 0, steps = Math.max(1, Math.ceil((latestEntry - earliestEntry) * 120)); i <= steps; i++) {
    const t = earliestEntry + (latestEntry - earliestEntry) * i / steps;
    const r = sampleRoot(source, t);
    const p = wall.clone().addScaledVector(right, r.x).addScaledVector(forward, r.z - source.referenceFrontZ);
    p.y += r.y;
    const d = airborne ? p.distanceTo(start) : Math.hypot(p.x - start.x, p.z - start.z);
    if (d < bestDistance) { bestDistance = d; startTime = t; }
  }
  // A bad source/ledge pairing must be rejected by the controller rather than
  // producing the former multi-meter shove hidden inside an animation.
  if (bestDistance > (airborne ? .72 : 1)) throw new Error('Root-motion entry is more than 1 m from the authored approach');

  const landing = clamp(source.landingTime ?? endTime, source.contactEnd + 1e-4, endTime);
  const heightWeight = (t: number) => ease(startTime, source.contactStart, t)
    * (target.kind === 'vault' ? 1 - ease(source.contactEnd, landing, t) : 1);
  const anchored = (t: number) => {
    const root = sampleRoot(source, t);
    return wall.clone().addScaledVector(right, root.x)
      .addScaledVector(forward, root.z - source.referenceFrontZ)
      .add(new Vector3(0, root.y + heightDelta * heightWeight(t), 0));
  };
  const entryCorrection = start.clone().sub(anchored(startTime));
  const sourceApproachDuration = source.contactStart - startTime;
  // Stretch the shortened reach in real time. Physics and skeleton sampling
  // share this clock, so contact does not snap in after a single pose frame.
  const approachDuration = closeGroundEntry ? Math.max(.35, sourceApproachDuration) : sourceApproachDuration;
  const extraApproachTime = approachDuration - sourceApproachDuration;
  const sourceVelocity = anchored(startTime + .001).sub(anchored(startTime)).multiplyScalar(1000);
  const velocityCorrection = (target.entryVelocity ?? sourceVelocity).clone().sub(sourceVelocity);
  const exitCorrection = end.clone().sub(anchored(endTime));
  const duration = endTime - startTime + extraApproachTime;

  return {
    sourceId: source.id, startTime, endTime, duration, approachDuration, end: end.clone(), entryError: bestDistance,
    sample(elapsedSeconds) {
      if (!Number.isFinite(elapsedSeconds)) throw new Error('Motion time must be finite');
      const elapsed = clamp(elapsedSeconds, 0, duration);
      const t = elapsed < approachDuration
        ? startTime + elapsed * sourceApproachDuration / approachDuration
        : source.contactStart + elapsed - approachDuration;
      const position = anchored(t);
      if (airborne && t < source.contactStart) {
        // Hermite correction preserves the incoming airborne velocity and
        // vanishes, together with its derivative, at authored hand contact.
        const u = clamp(elapsed / approachDuration, 0, 1);
        position.addScaledVector(entryCorrection, 2*u*u*u - 3*u*u + 1)
          .addScaledVector(velocityCorrection, approachDuration*(u*u*u - 2*u*u + u));
      } else if (!airborne) position.addScaledVector(entryCorrection, 1 - ease(startTime, source.contactStart, t));
      position.addScaledVector(exitCorrection, ease(source.contactEnd, endTime, t));
      // The root represents capsule feet. Lower obstacles must not make a
      // height correction drag the physics capsule below its entry ground.
      const minimumGround = t < landing ? start.y : Math.min(start.y, end.y);
      if (!airborne) position.y = Math.max(minimumGround, position.y);
      // Explicit endpoints also avoid accumulating tiny capsule/animation drift.
      if (elapsed === 0) position.copy(start);
      if (elapsed === duration) position.copy(end);
      const phase = t < source.contactStart ? 'reach'
        : t < source.contactStart + (source.contactEnd - source.contactStart) * .45 ? 'grip'
          : t <= source.contactEnd ? 'pull' : 'settle';
      const contactWeight = ease(source.contactStart - .1, source.contactStart, t)
        * (1 - ease(source.contactEnd, Math.min(endTime, source.contactEnd + .15), t));
      return {position, sourceTime: t, phase, contactWeight};
    },
  };
}

function validate(source: MotionSource, target: TraversalMotionTarget) {
  const numbers = [source.duration, source.startTime, source.endTime, source.contactStart,
    source.contactEnd, source.referenceHeight, source.referenceFrontZ, source.referenceDepth,
    target.height, target.depth, ...(source.landingTime === undefined ? [] : [source.landingTime])];
  if (numbers.some(v => !Number.isFinite(v)) || source.times.length < 2
    || source.positions.length !== source.times.length * 3
    || source.times.some((t, i) => !Number.isFinite(t) || i > 0 && t <= source.times[i - 1]!)
    || source.positions.some(v => !Number.isFinite(v))
    || source.startTime < source.times[0]! || source.endTime > source.times.at(-1)! + 1e-5
    || source.startTime >= source.contactStart || source.contactStart >= source.contactEnd
    || source.contactEnd >= source.endTime || source.endTime > source.duration + 1e-5
    || target.height < 0 || target.depth < 0
    || [target.start, target.front, target.normal, target.end, ...(target.entryVelocity ? [target.entryVelocity] : [])].some(v => v.toArray().some(n => !Number.isFinite(n)))
    || Math.hypot(target.normal.x, target.normal.z) < 1e-6) {
    throw new Error('Invalid traversal motion source or target');
  }
}
