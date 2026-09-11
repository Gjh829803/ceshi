export interface BoundaryCommonDefinition {
  id: string;
  bottomMeters: number;
  topMeters: number;
  thicknessMeters?: number;
  blocksCamera?: boolean;
}

export type BoundaryDefinition = BoundaryCommonDefinition & (
  | { shape: 'rectangle'; minimumXZ: readonly [number, number]; maximumXZ: readonly [number, number] }
  | { shape: 'polyline'; pointsXZ: readonly (readonly [number, number])[]; closed?: boolean }
);

export interface BoundaryBox {
  id: string;
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  rotation: readonly [number, number, number];
  collision: true;
  boundary: true;
  blocksCamera: boolean;
}

const maximumCoordinate = 100_000;
const maximumSegments = 1024;

function invalid(id: string, field: string, reason: string): never {
  throw new Error(`BOUNDARY_INVALID: ${id}.${field} ${reason}`);
}

function coordinate(value: unknown, id: string, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > maximumCoordinate)
    invalid(id, field, 'must be finite and within ±100000 m');
  return value;
}

function point(value: unknown, id: string, field: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) invalid(id, field, 'must be [x, z]');
  return [coordinate(value[0], id, `${field}[0]`), coordinate(value[1], id, `${field}[1]`)];
}

/** Pure configuration: local X follows each segment; its ends extend by half the wall thickness. */
export function compileBoundaryBoxes(definitions: readonly BoundaryDefinition[]): BoundaryBox[] {
  if (!Array.isArray(definitions)) invalid('definitions', 'value', 'must be an array');
  if (definitions.length > maximumSegments) invalid('definitions', 'segments', 'must total at most 1024');
  const boxes: BoundaryBox[] = [];
  const ids = new Set<string>();
  for (let definitionIndex = 0; definitionIndex < definitions.length; definitionIndex++) {
    const definition = definitions[definitionIndex];
    const fallbackId = `definitions[${definitionIndex}]`;
    if (!definition || typeof definition !== 'object') invalid(fallbackId, 'value', 'must be a boundary');
    const id = definition.id;
    if (typeof id !== 'string' || !id.trim()) invalid(fallbackId, 'id', 'must be nonempty');
    if (ids.has(id)) invalid(id, 'id', 'must be unique');
    ids.add(id);
    const bottom = coordinate(definition.bottomMeters, id, 'bottomMeters');
    const top = coordinate(definition.topMeters, id, 'topMeters');
    if (top <= bottom) invalid(id, 'topMeters', 'must exceed bottomMeters');
    const thickness = coordinate(definition.thicknessMeters === undefined ? 0.5 : definition.thicknessMeters, id, 'thicknessMeters');
    if (thickness <= 0) invalid(id, 'thicknessMeters', 'must be positive');
    if (definition.blocksCamera !== undefined && typeof definition.blocksCamera !== 'boolean')
      invalid(id, 'blocksCamera', 'must be boolean');

    let points: readonly (readonly [number, number])[];
    let closed: boolean;
    if (definition.shape === 'rectangle') {
      const minimum = point(definition.minimumXZ, id, 'minimumXZ');
      const maximum = point(definition.maximumXZ, id, 'maximumXZ');
      if (minimum[0] >= maximum[0] || minimum[1] >= maximum[1])
        invalid(id, 'maximumXZ', 'must exceed minimumXZ on both axes');
      points = [minimum, [maximum[0], minimum[1]], maximum, [minimum[0], maximum[1]]];
      closed = true;
    } else if (definition.shape === 'polyline') {
      if (definition.closed !== undefined && typeof definition.closed !== 'boolean') invalid(id, 'closed', 'must be boolean');
      closed = definition.closed ?? false;
      if (!Array.isArray(definition.pointsXZ) || definition.pointsXZ.length < (closed ? 3 : 2))
        invalid(id, 'pointsXZ', closed ? 'needs at least 3 points' : 'needs at least 2 points');
      // Check the budget before traversing or copying an arbitrarily large input.
      if (boxes.length + definition.pointsXZ.length - (closed ? 0 : 1) > maximumSegments)
        invalid(id, 'pointsXZ', 'segments must total at most 1024');
      points = Array.from(definition.pointsXZ, (value, index) => point(value, id, `pointsXZ[${index}]`));
    } else {
      invalid(id, 'shape', 'must be rectangle or polyline');
    }

    const segmentCount = points.length - (closed ? 0 : 1);
    if (boxes.length + segmentCount > maximumSegments) invalid(id, 'segments', 'must total at most 1024');
    const height = coordinate(top - bottom, id, 'heightMeters');
    for (let index = 0; index < segmentCount; index++) {
      const start = points[index]!;
      const end = points[(index + 1) % points.length]!;
      const dx = end[0] - start[0], dz = end[1] - start[1];
      const length = Math.hypot(dx, dz);
      if (length === 0) invalid(id, `segment[${index}]`, 'must have nonzero length');
      const boxId = `${id}:segment-${index}`;
      if (boxId.length > 128) invalid(id, 'id', 'generated segment id must fit 128 characters');
      boxes.push({
        id: boxId,
        position: [(start[0] + end[0]) / 2, (bottom + top) / 2, (start[1] + end[1]) / 2],
        size: [coordinate(length + thickness, id, `segment[${index}].lengthMeters`), height, thickness],
        rotation: [0, -Math.atan2(dz, dx), 0],
        collision: true,
        boundary: true,
        blocksCamera: definition.blocksCamera ?? false,
      });
    }
  }
  return boxes;
}
