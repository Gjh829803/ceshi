import {Euler, Vector3} from 'three';
import {describe, expect, it} from 'vitest';
import {compileBoundaryBoxes, type BoundaryBox, type BoundaryDefinition} from './boundaries.js';

const rectangle = {id: 'yard', shape: 'rectangle', minimumXZ: [-5, -3], maximumXZ: [5, 3], bottomMeters: -2, topMeters: 4} as const;
const polyline = {id: 'route', shape: 'polyline', pointsXZ: [[0, 0], [3, 4], [7, 4]], bottomMeters: 1, topMeters: 5} as const;

function contains(box: BoundaryBox, position: readonly [number, number, number]): boolean {
  const local = new Vector3(...position).sub(new Vector3(...box.position));
  local.applyEuler(new Euler(0, -box.rotation[1], 0));
  return local.toArray().every((value, axis) => Math.abs(value) <= box.size[axis]! / 2 + 1e-10);
}

describe('boundary configuration compilation', () => {
  it('makes four vertical collision walls with shared corners and an empty interior', () => {
    const boxes = compileBoundaryBoxes([rectangle]);
    expect(boxes.map(box => box.id)).toEqual(['yard:segment-0', 'yard:segment-1', 'yard:segment-2', 'yard:segment-3']);
    expect(boxes[0]).toMatchObject({position: [0, 1, -3], size: [10.5, 6, 0.5], collision: true, boundary: true, blocksCamera: false});
    for (const box of boxes) {
      expect(contains(box, [0, 1, 0])).toBe(false);
      expect(contains(box, [box.position[0], -2.01, box.position[2]])).toBe(false);
      expect(contains(box, [box.position[0], 4.01, box.position[2]])).toBe(false);
    }
    for (const corner of [[-5, -3], [5, -3], [5, 3], [-5, 3]] as const)
      expect(boxes.filter(box => contains(box, [corner[0], 1, corner[1]]))).toHaveLength(2);
  });

  it('keeps an open diagonal route open and extends both ends in its actual Three rotation', () => {
    const boxes = compileBoundaryBoxes([{...polyline, thicknessMeters: 2, blocksCamera: true}]);
    expect(boxes).toHaveLength(2);
    const wall = boxes[0]!;
    expect(wall).toMatchObject({position: [1.5, 3, 2], size: [7, 4, 2], blocksCamera: true});
    for (const p of [[-0.6, 3, -0.8], [3.6, 3, 4.8], [1.5, 1, 2], [1.5, 5, 2]] as const)
      expect(contains(wall, p)).toBe(true);
    expect(contains(wall, [-0.66, 3, -0.88])).toBe(false);
    expect(boxes.some(box => contains(box, [3.5, 3, 2]))).toBe(false);
    const closed = compileBoundaryBoxes([{...polyline, closed: true}]);
    expect(closed).toHaveLength(3);
    expect(contains(closed[2]!, [3.5, 3, 2])).toBe(true);
  });

  it('does not mutate author configuration or share output arrays across calls', () => {
    const points = Object.freeze([Object.freeze([0, 0] as const), Object.freeze([1, 0] as const)]);
    const input = Object.freeze([Object.freeze({...polyline, pointsXZ: points})]);
    const first = compileBoundaryBoxes(input), second = compileBoundaryBoxes(input);
    expect(first).toEqual(second);
    expect(first[0]!.position).not.toBe(second[0]!.position);
    expect(points).toEqual([[0, 0], [1, 0]]);
    expect(compileBoundaryBoxes([])).toEqual([]);
  });

  it('rejects malformed geometry with the boundary id and exact field', () => {
    const invalid: [unknown, string][] = [
      [{...rectangle, bottomMeters: undefined}, 'yard.bottomMeters'],
      [{...rectangle, topMeters: -2}, 'yard.topMeters'],
      [{...rectangle, topMeters: Infinity}, 'yard.topMeters'],
      [{...rectangle, thicknessMeters: 0}, 'yard.thicknessMeters'],
      [{...rectangle, thicknessMeters: NaN}, 'yard.thicknessMeters'],
      [{...rectangle, minimumXZ: [0, 0], maximumXZ: [0, 3]}, 'yard.maximumXZ'],
      [{...rectangle, maximumXZ: [100001, 3]}, 'yard.maximumXZ[0]'],
      [{...rectangle, minimumXZ: Object.assign(new Array(2), {0:0})}, 'yard.minimumXZ[1]'],
      [{...polyline, pointsXZ: [[0, 0], [0, 0]]}, 'route.segment[0]'],
      [{...polyline, pointsXZ: [[0, 0], [1, 0], [0, 0]], closed: true}, 'route.segment[2]'],
      [{...polyline, pointsXZ: [[0, 0]], closed: false}, 'route.pointsXZ'],
      [{...polyline, pointsXZ: [[0, 0], [1, 0]], closed: true}, 'route.pointsXZ'],
      [{...polyline, blocksCamera: 'false'}, 'route.blocksCamera'],
      [{...polyline, closed: 'false'}, 'route.closed'],
      [{...polyline, shape: 'circle'}, 'route.shape'],
    ];
    for (const [definition, field] of invalid)
      expect(() => compileBoundaryBoxes([definition] as BoundaryDefinition[])).toThrow(field);
  });

  it('bounds generated dimensions and identities to the existing physics contract', () => {
    expect(() => compileBoundaryBoxes([rectangle, rectangle])).toThrow('yard.id');
    expect(() => compileBoundaryBoxes([{...rectangle, id: ' '}])).toThrow('definitions[0].id');
    expect(() => compileBoundaryBoxes([{...rectangle, id: 'x'.repeat(119)}])).toThrow('generated segment id must fit 128 characters');
    expect(() => compileBoundaryBoxes([{...rectangle, bottomMeters: -100000, topMeters: 100000}])).toThrow('yard.heightMeters');
    expect(() => compileBoundaryBoxes([{...polyline, pointsXZ: [[-100000, 0], [100000, 0]]}])).toThrow('route.segment[0].lengthMeters');
    expect(() => compileBoundaryBoxes(null as unknown as BoundaryDefinition[])).toThrow('definitions.value');
  });

  it('caps total generated segments, including closure and multiple definitions, at 1024', () => {
    const pointsXZ = Array.from({length: 1025}, (_, index) => [index, index % 2] as const);
    expect(compileBoundaryBoxes([{...polyline, pointsXZ}])).toHaveLength(1024);
    expect(() => compileBoundaryBoxes([{...polyline, pointsXZ, closed: true}])).toThrow('route.pointsXZ');
    expect(() => compileBoundaryBoxes([{...polyline, pointsXZ}, rectangle])).toThrow('yard.segments');
    expect(() => compileBoundaryBoxes([{...polyline, pointsXZ: new Array(1_000_000)}])).toThrow('segments must total at most 1024');
  });
});
