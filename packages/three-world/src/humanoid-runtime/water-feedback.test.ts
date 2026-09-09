import { expect, it } from 'vitest';
import { Group, PerspectiveCamera } from 'three';
import { createWorld } from '../world';
import type { EnvironmentDefinition } from './environment/types';
import type { VehicleSpec } from './config';
import { emptyInput } from './simulation';

const forward = { humanoid: { ...emptyInput(), forward: 1 } };
function pool(overrides: Partial<EnvironmentDefinition> = {}): EnvironmentDefinition {
  return { id: 'water-feedback', name: 'Water feedback', description: '',
    bounds: { min: [-40, -10, -40], max: [40, 20, 40] },
    boxes: [{ id: 'pool-floor', position: [0, -0.5, 0], size: [60, 1, 60] }],
    water: [{ id: 'pool', min: [-5, -1, -5], max: [5, 3, 5], surface: 2 }],
    regions: [], spawns: [], playerSpawn: [0, 0.03, 0], ...overrides };
}
const boat: VehicleSpec = { id: 'boat', name: 'Boat', en: 'BOAT', mode: 'boat', kernel: 'fixture',
  color: '#fff', spawn: [3, 2, 0], yaw: 0, speed: 8, accel: 4, grip: 4, steer: 1,
  radius: 0.8, seat: [0, 0.5, 0], camera: 8, hint: '', archetype: 'boat',
  envelope: { kind: 'box', halfExtents: [0.6, 0.4, 1], offset: [0, 0.4, 0] } };
async function fixture(map: EnvironmentDefinition, withBoat = false) {
  return createWorld({ camera: new PerspectiveCamera(), navigation: false, assetDefinitions: {},
    humanoid: { map, character: { instanceId: 'player', object: new Group() },
      vehicles: withBoat ? [{ instanceId: 'boat-1', assetId: 'boat', spec: boat, object: new Group() }] : [] } });
}

it('distinguishes no declared water from no current contact with a declared volume', async () => {
  for (const [map, declaredVolumeCount] of [[pool({ water: [] }), 0], [pool({ playerSpawn: [0, 0.03, -8] }), 1]] as const) {
    const world = await fixture(map);
    try {
      world.step({}, 2);
      expect(world.snapshot().humanoid!.water).toEqual({ declaredVolumeCount, controllerActive: true, swimming: false, contact: null });
    } finally { world.dispose(); }
  }
});

it('reports actual collider-limited shallow depth without turning sufficient immersion into swimming', async () => {
  const world = await fixture(pool({ water: [{ id: 'shallow', min: [-5, -1, -5], max: [5, 2, 5], surface: 1.2 }] }));
  try {
    world.step({}, 20);
    expect(world.humanoid!.simulation.humanoid!.swimming).toBe(false);
    const water = world.snapshot().humanoid!.water;
    expect(water).toMatchObject({ controllerActive: true, swimming: false, contact: {
      volumeId: 'shallow', surfaceHeightMeters: 1.2, depthCheckPassed: false,
      immersionCheckPassed: true, wasSwimmingAtSample: false, entrySerial: 0,
    } });
    expect(water.contact!.depthMeters).toBeCloseTo(1.2, 4);
    expect(water.contact!.requiredDepthMeters).toBeCloseTo(1.28, 8);
    expect(water.contact!.requiredFeetBelowSurfaceMeters).toBe(0.95);
    expect(water.contact!.feetBelowSurfaceMeters).toBeGreaterThan(0.95);
  } finally { world.dispose(); }
});

it('shows insufficient immersion before an actual falling character enters deep swimming', async () => {
  const world = await fixture(pool({ playerSpawn: [0, 1.5, 0] }));
  try {
    world.step({}, 1);
    expect(world.humanoid!.simulation.humanoid!.swimming).toBe(false);
    const before = world.snapshot().humanoid!.water;
    expect(before).toMatchObject({ swimming: false, contact: {
      depthCheckPassed: true, immersionCheckPassed: false, wasSwimmingAtSample: false, entrySerial: 0,
    } });
    expect(before.contact!.feetBelowSurfaceMeters).toBeLessThan(0.95);
    world.step({}, 90);
    expect(world.humanoid!.simulation.humanoid!.swimming).toBe(true);
    const after = world.snapshot().humanoid!.water;
    expect(after).toMatchObject({ swimming: true, contact: {
      depthCheckPassed: true, immersionCheckPassed: true, wasSwimmingAtSample: true, entrySerial: 1,
    } });
    expect(after.contact!.entrySpeedMetersPerSecond).toBeGreaterThan(0);
    expect(after.contact!.requiredDepthMeters).toBeCloseTo(1.16, 8);
    expect(after.contact!.requiredFeetBelowSurfaceMeters).toBe(0.5);
    expect(after.contact!.submersionRatio).toBeGreaterThan(0);
    expect(after.contact!.submersionRatio).toBeLessThanOrEqual(1);
  } finally { world.dispose(); }
});

it('follows real horizontal water entry and exit while retaining detached earlier samples', async () => {
  const world = await fixture(pool({ playerSpawn: [0, 0.03, -7] }));
  try {
    world.step({}, 10);
    const dry = world.snapshot().humanoid!.water;
    expect(dry).toMatchObject({ swimming: false, contact: null });
    for (let tick = 0; tick < 180 && !world.humanoid!.simulation.humanoid!.swimming; tick++) world.step(forward, 1);
    expect(world.humanoid!.simulation.humanoid!.swimming).toBe(true);
    const inside = world.snapshot().humanoid!.water;
    const saved = structuredClone(inside);
    expect(inside).toMatchObject({ swimming: true, contact: { volumeId: 'pool', entrySerial: 1 } });
    expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThanOrEqual(-5);
    for (let tick = 0; tick < 600 && world.humanoid!.simulation.humanoid!.swimming; tick++) world.step(forward, 1);
    expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(5);
    expect(world.snapshot().humanoid!.water).toEqual({ declaredVolumeCount: 1, controllerActive: true, swimming: false, contact: null });
    expect(inside).toEqual(saved);
    expect(dry.contact).toBeNull();
  } finally { world.dispose(); }
});

it('clears latest water contact and swimming on reset before taking a fresh controller sample', async () => {
  const world = await fixture(pool());
  try {
    world.step({}, 30);
    const before = world.snapshot().humanoid!.water;
    expect(before).toMatchObject({ swimming: true, contact: { volumeId: 'pool' } });
    await world.reset();
    expect(world.snapshot().humanoid!.water).toEqual({ declaredVolumeCount: 1, controllerActive: true, swimming: false, contact: null });
    expect(before.swimming).toBe(true);
    expect(before.contact!.volumeId).toBe('pool');
    world.step({}, 1);
    expect(world.snapshot().humanoid!.water).toMatchObject({ swimming: true, contact: { volumeId: 'pool' } });
  } finally { world.dispose(); }
});

it('does not share mutable contact objects between SDK snapshots or with the controller', async () => {
  const world = await fixture(pool());
  try {
    world.step({}, 30);
    const first = world.snapshot().humanoid!.water;
    const second = world.snapshot().humanoid!.water;
    expect(first.contact).not.toBeNull();
    expect(first.contact).not.toBe(second.contact);
    const mutable = first.contact as unknown as { volumeId: string; depthMeters: number };
    // Mutation may be refused by a frozen snapshot; either way live data must stay intact.
    try { mutable.volumeId = 'edited by reader'; mutable.depthMeters = -100; } catch { /* Frozen snapshots are also safe. */ }
    expect(second.contact!.volumeId).toBe('pool');
    expect(world.snapshot().humanoid!.water.contact!.volumeId).toBe('pool');
    expect(world.snapshot().humanoid!.water.contact!.depthMeters).toBeCloseTo(2, 4);
  } finally { world.dispose(); }
});

it('suppresses an old swimming contact when control is handed to a real mounted boat', async () => {
  const world = await fixture(pool({
    regions: [{ id: 'lake', name: 'Lake', description: '', center: [0, 0, 0], size: [10, 10], color: '#abc', modes: ['boat'] }],
    spawns: [{ id: 'boat-spawn', name: 'Boat', vehicleId: 'boat', position: [3, 2, 0], yaw: 0, regionId: 'lake' }],
  }), true);
  try {
    world.step({}, 30);
    const runtime = world.humanoid!;
    expect(runtime.simulation.humanoid!.swimming).toBe(true);
    expect(runtime.enter('boat-1')).toBe(true);
    expect(runtime.simulation.humanoid!.water).not.toBeNull(); // Last controller sample is deliberately retained internally.
    expect(world.snapshot().humanoid!.water).toEqual({ declaredVolumeCount: 1, controllerActive: false, swimming: false, contact: null });
    world.step({}, 2);
    expect(world.snapshot().humanoid!.water.contact).toBeNull();
  } finally { world.dispose(); }
});

it('retains a swimmer over a 1.2 metre shelf that cannot admit a fresh swimmer', async () => {
  const shelf = pool({ playerSpawn: [0, 0.03, -2], boxes: [
    { id: 'pool-floor', position: [0, -0.5, 0], size: [60, 1, 60] },
    { id: 'shelf', position: [0, 0.4, 3], size: [10, 0.8, 6] },
  ] });
  const world = await fixture(shelf);
  try {
    world.step({}, 90);
    expect(world.humanoid!.simulation.humanoid!.swimming).toBe(true);
    world.step(forward, 130);
    const retained = world.snapshot().humanoid!.water;
    expect(world.getEntityState('player').positionWorldMetersXYZ[2]).toBeGreaterThan(0.5);
    expect(retained).toMatchObject({ swimming: true, contact: { wasSwimmingAtSample: true, depthCheckPassed: true } });
    expect(retained.contact!.depthMeters).toBeCloseTo(1.2, 4);
    expect(retained.contact!.requiredDepthMeters).toBeCloseTo(1.16, 8);
    world.humanoid!.switchMap({ ...shelf, id: 'fresh-on-shelf', playerSpawn: [0, 0.83, 2] });
    world.step({}, 30);
    const fresh = world.snapshot().humanoid!.water;
    expect(fresh).toMatchObject({ swimming: false, contact: { wasSwimmingAtSample: false, depthCheckPassed: false, immersionCheckPassed: true } });
    expect(fresh.contact!.depthMeters).toBeCloseTo(1.2, 4);
    expect(fresh.contact!.requiredDepthMeters).toBeCloseTo(1.28, 8);
  } finally { world.dispose(); }
});
