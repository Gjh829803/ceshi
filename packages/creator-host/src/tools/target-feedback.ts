import type {Episode} from '../contracts.js';

type Position = [number, number, number];
type NearestSample = {
  traceSampleIndex: number;
  wallSeconds: number | null;
  simulationTick: number | null;
  simulationSeconds: number | null;
  worldRevision: number | null;
  positionMetersXYZ: Position;
  /** World-space target minus the sampled player position, in meters. */
  deltaToTargetMetersXYZ: Position;
};
const finiteOrNull = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const isPosition = (value: unknown): value is Position => Array.isArray(value) && value.length === 3 &&
  [0, 1, 2].every(index => finiteOrNull(value[index]) !== null);

/** Reuse saved player samples only; no interpolation, steering or acceptance gate. */
export function measureEpisodeTargets(targets: readonly Episode['targets'][number][], samples: readonly unknown[]) {
  const validSamples = samples.flatMap((value, traceSampleIndex) => {
    if (!value || typeof value !== 'object') return [];
    const sample = value as Record<string, unknown>;
    return isPosition(sample.positionMetersXYZ) ? [{sample, position: sample.positionMetersXYZ, traceSampleIndex}] : [];
  });
  return targets.map(target => {
    let nearestDistance = Infinity, nearestSample: NearestSample | null = null;
    for (const {sample, position, traceSampleIndex} of validSamples) {
      const delta: Position = [target.positionMetersXYZ[0] - position[0], target.positionMetersXYZ[1] - position[1], target.positionMetersXYZ[2] - position[2]];
      const distance = Math.hypot(...delta);
      if (distance >= nearestDistance || !Number.isFinite(distance)) continue;
      nearestDistance = distance;
      nearestSample = {traceSampleIndex, wallSeconds: finiteOrNull(sample.wallSeconds),
        simulationTick: finiteOrNull(sample.simulationTick), simulationSeconds: finiteOrNull(sample.simulationSeconds),
        worldRevision: finiteOrNull(sample.worldRevision), positionMetersXYZ: [...position], deltaToTargetMetersXYZ: delta};
    }
    return {...target, nearestDistanceMeters: nearestSample ? nearestDistance : null,
      reached: nearestDistance <= target.toleranceMeters,
      distanceOutsideToleranceMeters: nearestSample ? Math.max(0, nearestDistance - target.toleranceMeters) : null,
      nearestSample};
  });
}
