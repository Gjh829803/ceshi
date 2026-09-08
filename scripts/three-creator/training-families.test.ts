import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera } from 'three';
import { createWorld, training, type EpisodeStart, type TrainingMap as MapDefinition, type TrainingVehicleSpec as VehicleSpec } from '@worldkit/three';

// Headless physical integration evidence, not rendered Creator self-check or Episode
// video acceptance. Starts use the Episode runtime initializer; subsequent motion
// uses only the SDK fixed input path, with no renderer or campus imports.
const catalog = JSON.parse(readFileSync(new URL('../../assets/three-creator/asset-catalog.json', import.meta.url), 'utf8'));
const assets = (catalog.assets as { id: string; training?: { spec?: VehicleSpec } }[])
  .filter((asset): asset is { id: string; training: { spec: VehicleSpec } } => !!asset.training?.spec);
const families = ['wheeled', 'bike', 'slide', 'hover', 'boat', 'sub', 'glider', 'plane', 'space', 'mount', 'carriage', 'dragon'] as const;
type Family = typeof families[number];
const representative = (family: Family) => assets.find(asset => asset.training.spec.mode === family)!;
const barrierFront = 59;

function course(family: Family | 'character', barrier = false): MapDefinition {
  const aquatic = family === 'boat' || family === 'sub';
  const floor = aquatic ? -80 : 0;
  return {
    id: `independent-${family}`, name: 'Independent physical integration course', description: '',
    bounds: { min: [-2000, -100, -2000], max: [2000, 1500, 2000] },
    boxes: [{ id: 'floor', position: [0, floor - 1, 0], size: [4000, 2, 4000] },
      ...(barrier ? [{ id: 'barrier', position: [0, 650, 60] as const, size: [4000, 1500, 2] as const }] : [])],
    water: aquatic ? [{ id: 'water', min: [-1900, -79, -1900], max: [1900, 0, 1900], surface: 0 }] : [],
    regions: [{ id: 'course', name: 'Course', description: '', center: [0, 0, 0], size: [3800, 3800], color: '#aaa', modes: ['character', family] }],
    spawns: [], playerSpawn: [-100, aquatic ? -1.25 : .03, -100],
  };
}

function vehicleStart(family: Family, spec: VehicleSpec, instanceId = 'subject'): EpisodeStart {
  const clearance = Math.max(0, spec.envelope.halfExtents[1] - spec.envelope.offset[1]);
  const y = family === 'boat' ? .1 : family === 'sub' ? -15 : family === 'hover' ? 1.3 :
    ['plane', 'glider', 'space', 'dragon'].includes(family) ? 100 : clearance + .03;
  return { positionWorldMetersXYZ: [0, y, 0], facingYawRadians: Math.PI,
    training: { vehicleInstanceId: instanceId, mounted: true, cameraMode: 0,
      ...(['plane', 'glider'].includes(family) ? { velocityWorldMetersPerSecondXYZ: [0, 0, 30] as const, throttle: .7, launched: true } : {}),
      ...(family === 'dragon' ? { launched: true } : {}) } };
}

async function fixture(family: Family, map = course(family), duplicate = false) {
  const asset = representative(family);
  const spec = structuredClone(asset.training.spec);
  const vehicles = [{ instanceId: 'subject', assetId: asset.id, spec, object: new Group() },
    ...(duplicate ? [{ instanceId: 'parked', assetId: asset.id, spec: structuredClone(spec), object: new Group() }] : [])];
  // Authored parking belongs to this independent map, not the donor spawn coordinates.
  map = { ...map, spawns: vehicles.map((vehicle, i) => ({ id: vehicle.instanceId, name: vehicle.instanceId,
    vehicleId: vehicle.instanceId, regionId: 'course', position: [-100 - i * 30, map.playerSpawn[1], -150] as const, yaw: 0 })) };
  const world = await createWorld({ assetDefinitions: {}, camera: new PerspectiveCamera(), training: {
    map, vehicles, character: { instanceId: 'person', object: new Group() },
  } });
  return { world, runtime: world.training!, start: vehicleStart(family, spec), spec };
}

function drive(family: Family) {
  return { training: { ...training.emptyInput(), forward: ['plane', 'glider'].includes(family) ? 0 : 1,
    boost: family === 'plane' || family === 'glider' } };
}

describe('catalog training families in an independent physical world', () => {
  it('covers the catalog 19 vehicle assets and all twelve runtime families', () => {
    expect(assets).toHaveLength(19);
    expect([...new Set(assets.map(asset => asset.training.spec.mode))].sort()).toEqual([...families].sort());
  });

  for (const family of families) {
    it(`${family}: advances thirty seconds from an Episode start and resets the actual solver`, async () => {
      const { world, runtime, start } = await fixture(family);
      try {
        expect(runtime.probeEpisodeStart(start).isValid).toBe(true);
        runtime.prepareEpisodeStart(start);
        const origin = runtime.simulation.vehicle!.position.clone();
        const revision = runtime.simulation.teleportRevision;
        let travelled = 0, previous = origin.clone();
        for (let sample = 0; sample < 60; sample++) {
          const snapshot = world.step(drive(family), 30);
          const actor = runtime.simulation.vehicle!;
          expect(snapshot.errors).toEqual([]);
          expect(snapshot.training?.mountedInstanceId).toBe('subject');
          expect([...actor.position.toArray(), ...actor.velocity.toArray(), ...actor.rotation.toArray()].every(Number.isFinite)).toBe(true);
          expect(runtime.environment.overlaps(actor.position, training.vehicleBody(actor.spec), actor.rotation)).toBe(false);
          travelled += actor.position.distanceTo(previous); previous.copy(actor.position);
        }
        expect(world.simulationTick).toBe(1800);
        expect(runtime.simulation.teleportRevision).toBe(revision);
        expect(travelled).toBeGreaterThan(20);
        expect(previous.distanceTo(origin)).toBeGreaterThan(20);
        if (family === 'boat') expect(Math.abs(previous.y)).toBeLessThan(.5);
        if (family === 'sub') expect(previous.y).toBeLessThan(-1);
        if (['plane', 'glider', 'space', 'dragon'].includes(family)) expect(previous.y).toBeGreaterThan(20);
        await world.reset();
        expect(world.simulationTick).toBe(0);
        expect(runtime.snapshot().mountedInstanceId).toBeNull();
        expect(runtime.simulation.vehicles[0]!.velocity.length()).toBe(0);
        expect(runtime.snapshot().mapId).toBe(`independent-${family}`);
      } finally { world.dispose(); }
    }, 20_000);

    it(`${family}: rejects an occupied Episode start and cannot drive through a full-height barrier`, async () => {
      const { world, runtime, start } = await fixture(family, course(family, true));
      try {
        expect(runtime.probeEpisodeStart({ ...start, positionWorldMetersXYZ: [0, start.positionWorldMetersXYZ[1], 60] }).isValid).toBe(false);
        expect(runtime.probeEpisodeStart(start).isValid).toBe(true);
        runtime.prepareEpisodeStart(start);
        const revision = runtime.simulation.teleportRevision;
        for (let sample = 0; sample < 60; sample++) {
          const snapshot = world.step(drive(family), 30);
          expect(snapshot.errors).toEqual([]);
          expect(runtime.simulation.vehicle!.position.z).toBeLessThan(barrierFront);
        }
        const actor = runtime.simulation.vehicle!;
        expect(actor.position.z).toBeGreaterThan(20);
        expect(actor.position.z).toBeLessThan(barrierFront);
        expect(runtime.simulation.teleportRevision).toBe(revision);
      } finally { world.dispose(); }
    }, 20_000);
  }

  it('character: collides with the independent course wall after thirty seconds of real input', async () => {
    const map = { ...course('character', true), playerSpawn: [0, .03, 0] as const };
    const world = await createWorld({ assetDefinitions: {}, camera: new PerspectiveCamera(), training: {
      map, vehicles: [], character: { instanceId: 'person', object: new Group() },
    } });
    try {
      const runtime = world.training!, start = { positionWorldMetersXYZ: [0, .03, 0] as const, facingYawRadians: Math.PI };
      expect(runtime.probeEpisodeStart(start).isValid).toBe(true); runtime.prepareEpisodeStart(start);
      const revision = runtime.simulation.teleportRevision;
      for (let sample = 0; sample < 60; sample++) world.step({ training: { ...training.emptyInput(), forward: 1 } }, 30);
      const state = world.getEntityState('person');
      expect(world.snapshot().errors).toEqual([]);
      expect(world.simulationTick).toBe(1800);
      expect(runtime.simulation.teleportRevision).toBe(revision);
      expect(state.positionWorldMetersXYZ[2]).toBeGreaterThan(58);
      expect(state.positionWorldMetersXYZ[2]).toBeLessThan(barrierFront);
      expect(state.motion?.isGrounded).toBe(true);
      expect(state.motion?.collisionEntityIds).toContain('barrier');
      await world.reset(); expect(world.getEntityState('person').positionWorldMetersXYZ[2]).toBeCloseTo(0);
    } finally { world.dispose(); }
  }, 20_000);

  it('two instances of the same catalog asset retain independent physics and profile state', async () => {
    const { world, runtime, start, spec } = await fixture('wheeled', course('wheeled'), true);
    try {
      const parked = runtime.simulation.vehicles[1]!.position.clone();
      runtime.applyProfile({ vehicles: { subject: { speed: 8 } } });
      runtime.prepareEpisodeStart(start);
      world.step(drive('wheeled'), 1800);
      expect(runtime.simulation.vehicles[0]!.position.z).toBeGreaterThan(100);
      expect(runtime.simulation.vehicles[1]!.position.distanceTo(parked)).toBeLessThan(.1);
      expect(runtime.simulation.vehicles[0]!.spec.speed).toBe(8);
      expect(runtime.simulation.vehicles[1]!.spec.speed).toBe(spec.speed);
      expect(runtime.snapshot().vehicles.map(vehicle => vehicle.assetId)).toEqual(['training.rover', 'training.rover']);
    } finally { world.dispose(); }
  }, 20_000);

  it('an occupied vehicle remains mounted when every exit is blocked', async () => {
    const base = course('wheeled');
    const map: MapDefinition = { ...base, boxes: [...base.boxes,
      { id: 'left', position: [-2.6, 4, 0], size: [1, 8, 10] },
      { id: 'right', position: [2.6, 4, 0], size: [1, 8, 10] },
      { id: 'front', position: [0, 4, 3.4], size: [10, 8, 1] },
      { id: 'rear', position: [0, 4, -3.4], size: [10, 8, 1] },
    ] };
    const { world, runtime, start } = await fixture('wheeled', map);
    try {
      expect(runtime.probeEpisodeStart(start).isValid).toBe(true);
      runtime.prepareEpisodeStart(start); world.step({}, 60);
      const position = runtime.simulation.player.position.clone();
      const revision = runtime.simulation.teleportRevision;
      expect(runtime.exit()).toBe(false);
      expect(runtime.snapshot().mountedInstanceId).toBe('subject');
      expect(runtime.simulation.player.position.distanceTo(position)).toBe(0);
      expect(runtime.simulation.teleportRevision).toBe(revision);
      expect(world.snapshot().errors).toEqual([]);
    } finally { world.dispose(); }
  });
});
