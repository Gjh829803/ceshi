import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera } from 'three';
import { createWorld, humanoid, type EpisodeStart, type EnvironmentDefinition, type VehicleSpec } from '@worldkit/three';

// Headless physical integration evidence, not rendered Creator self-check or Episode
// video acceptance. Starts use the native physical placement helper; subsequent motion
// uses only the SDK fixed input path, with no renderer or campus imports.
const catalog = JSON.parse(readFileSync(new URL('@worldkit/asset-library/catalog', import.meta.url), 'utf8'));
import {composeAssetCatalog} from '@worldkit/preset-content/assets/host-adapter';
catalog.assets=composeAssetCatalog(catalog.assets);
const assets = (catalog.assets as { id: string; vehicle?: { spec?: VehicleSpec } }[])
  .filter((asset): asset is { id: string; vehicle: { spec: VehicleSpec } } => !!asset.vehicle?.spec);
const families = ['paddled_boat', 'tank', 'wheeled', 'motorcycle', 'unicycle', 'skateboard', 'bus', 'sled', 'ski', 'hover', 'boat', 'submarine', 'glider', 'plane', 'spacecraft', 'mount', 'carriage', 'dragon'] as const;
type Family = typeof families[number];
const representativeIds:Record<Family,string>={paddled_boat:'vehicle.canoe',tank:'vehicle.tank',wheeled:'vehicle.rover',motorcycle:'vehicle.motorcycle',unicycle:'vehicle.unicycle',skateboard:'vehicle.skateboard',bus:'vehicle.bus',sled:'vehicle.sled',ski:'vehicle.ski',hover:'vehicle.hovercraft',boat:'vehicle.boat',submarine:'vehicle.submarine',glider:'vehicle.glider',plane:'vehicle.plane',spacecraft:'vehicle.spacecraft',mount:'creature.horse',carriage:'vehicle.carriage',dragon:'creature.dragon-evolved'};
const representative = (family: Family) => assets.find(asset => asset.id === representativeIds[family])!;
const barrierFront = 59;

function course(family: Family | 'character', barrier = false): EnvironmentDefinition {
  const aquatic = family === 'paddled_boat' || family === 'boat' || family === 'submarine';
  const floor = aquatic ? -80 : 0;
  return {
    id: `independent-${family}`, name: 'Independent physical integration course', description: '',
    bounds: { min: [-2000, -100, -2000], max: [2000, 1500, 2000] },
    boxes: [{ id: 'floor', position: [0, floor - 1, 0], size: [4000, 2, 4000] },
      ...(barrier ? [{ id: 'barrier', position: [0, 650, 60] as const, size: [4000, 1500, 2] as const }] : [])],
    water: aquatic ? [{ id: 'water', min: [-1900, -79, -1900], max: [1900, 0, 1900], surface: 0 }] : [],
    regions: [{ id: 'course', name: 'Course', description: '', center: [0, 0, 0], size: [3800, 3800], color: '#aaa', modes: ['character', family === 'glider' ? 'plane' : family] }],
    spawns: [], playerSpawn: [-100, aquatic ? -1.25 : .03, -100],
  };
}

function vehicleStart(family: Family, spec: VehicleSpec, instanceId = 'subject'): Omit<EpisodeStart,'cameraViewId'> {
  const clearance = Math.max(0, spec.envelope.halfExtents[1] - spec.envelope.offset[1]);
  const y = (family === 'boat'||family === 'paddled_boat') ? .1 : family === 'submarine' ? -15 : family === 'hover' ? 1.3 :
    ['plane', 'glider', 'spacecraft', 'dragon'].includes(family) ? 100 : clearance + .03;
  return { positionWorldMetersXYZ: [0, y, 0], facingYawRadians: Math.PI,
    humanoid: { vehicleInstanceId: instanceId, mounted: true,
      ...(['plane', 'glider'].includes(family) ? { velocityWorldMetersPerSecondXYZ: [0, 0, 30] as const, throttle: .7, launched: true } : {}),
      ...(family === 'dragon' ? { launched: true } : {}) } };
}

async function fixture(family: Family, map = course(family), duplicate = false) {
  const asset = representative(family);
  const spec = structuredClone(asset.vehicle.spec);
  const vehicles = [{ instanceId: 'subject', assetId: asset.id, spec, object: new Group() },
    ...(duplicate ? [{ instanceId: 'parked', assetId: asset.id, spec: structuredClone(spec), object: new Group() }] : [])];
  // Authored parking belongs to this independent map, not the donor spawn coordinates.
  map = { ...map, spawns: vehicles.map((vehicle, i) => ({ id: vehicle.instanceId, name: vehicle.instanceId,
    vehicleId: vehicle.instanceId, regionId: 'course', position: [-100 - i * 30, map.playerSpawn[1], -150] as const, yaw: 0 })) };
  const world = await createWorld({ assetDefinitions: {}, camera: new PerspectiveCamera(), humanoid: {
    map, vehicles, character: { instanceId: 'person', object: new Group() },
  } });
  return { world, runtime: world.humanoid!, start: vehicleStart(family, spec), spec };
}

function drive(family: Family) {
  return { humanoid: { ...humanoid.emptyInput(), forward: ['plane', 'glider'].includes(family) ? 0 : 1,
    boost: family === 'plane' || family === 'glider' } };
}

describe('catalog humanoid families in an independent physical world', () => {
  it('covers every supported runtime family with an explicit catalog fixture', () => {
    const familyOf = (spec: VehicleSpec) => spec.aircraftSubtype === 'glider' ? 'glider' : spec.mode;
    for(const family of families)expect(familyOf(representative(family).vehicle.spec)).toBe(family);
    expect(representative('glider').vehicle.spec).toMatchObject({mode:'plane',aircraftSubtype:'glider'});
    expect([...new Set(assets.map(asset => familyOf(asset.vehicle.spec)))].sort()).toEqual([...families].sort());
  });

  for (const family of families) {
    it(`${family}: advances thirty seconds from an Episode start and resets the actual solver`, async () => {
      const { world, runtime, start } = await fixture(family);
      try {
        expect(runtime.probeEpisodeStart(start).isValid).toBe(true);
        runtime.prepareEpisodeStart(start);
        const origin = runtime.simulation.controlledActor.vehicle!.position.clone();
        const revision = runtime.simulation.controlledActor.teleportRevision;
        let travelled = 0, previous = origin.clone();
        for (let sample = 0; sample < 60; sample++) {
          const snapshot = world.step(drive(family), 30);
          const actor = runtime.simulation.controlledActor.vehicle!;
          expect(snapshot.errors).toEqual([]);
          expect(snapshot.humanoid?.mountedInstanceId).toBe('subject');
          expect([...actor.position.toArray(), ...actor.velocity.toArray(), ...actor.rotation.toArray()].every(Number.isFinite)).toBe(true);
          if (actor.spec.wheelPhysics) {
            // Suspension and beveled chassis leave empty space inside the broad envelope.
            // Check every native solid against the actual course colliders instead.
            const physics = runtime.environment.borrowPhysics();
            const colliderOwner = physics.colliderOwner;
            if (!colliderOwner) throw new Error('Native vehicle collision ownership is required');
            let colliders = 0;
            physics.world.forEachCollider(collider => {
              if (colliderOwner(collider.handle) !== actor.spec.id || !collider.parent()?.isDynamic()) return;
              colliders++;
              const overlap = physics.world.intersectionWithShape(collider.translation(), collider.rotation(), collider.shape,
                undefined, undefined, collider, undefined, other => !other.isSensor() && colliderOwner(other.handle) !== actor.spec.id && (other.parent()?.isFixed() ?? true));
              expect(overlap, `${family}: native collider ${collider.handle}, sample ${sample}`).toBeNull();
            });
            expect(colliders).toBeGreaterThan(0);
          } else expect(runtime.environment.overlaps(actor.position, humanoid.vehicleBody(actor.spec), actor.rotation)).toBe(false);
          travelled += actor.position.distanceTo(previous); previous.copy(actor.position);
        }
        expect(world.simulationTick).toBe(1800);
        expect(runtime.simulation.controlledActor.teleportRevision).toBe(revision);
        expect(travelled).toBeGreaterThan(20);
        expect(previous.distanceTo(origin)).toBeGreaterThan(20);
        if (family === 'boat') expect(Math.abs(previous.y)).toBeLessThan(.5);
        if (family === 'submarine') expect(previous.y).toBeLessThan(-1);
        if (['plane', 'glider', 'spacecraft', 'dragon'].includes(family)) expect(previous.y).toBeGreaterThan(20);
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
        const revision = runtime.simulation.controlledActor.teleportRevision;
        let furthestForward = runtime.simulation.controlledActor.vehicle!.position.z;
        for (let sample = 0; sample < 60; sample++) {
          const snapshot = world.step(drive(family), 30);
          expect(snapshot.errors).toEqual([]);
          expect(runtime.simulation.controlledActor.vehicle!.position.z).toBeLessThan(barrierFront);
          furthestForward = Math.max(furthestForward, runtime.simulation.controlledActor.vehicle!.position.z);
        }
        const actor = runtime.simulation.controlledActor.vehicle!;
        // Dynamic aircraft can rebound or turn after impact; prove approach separately from containment.
        expect(furthestForward).toBeGreaterThan(20);
        expect(actor.position.z).toBeLessThan(barrierFront);
        expect(runtime.simulation.controlledActor.teleportRevision).toBe(revision);
      } finally { world.dispose(); }
    }, 20_000);
  }

  it('character: collides with the independent course wall after thirty seconds of real input', async () => {
    const map = { ...course('character', true), playerSpawn: [0, .03, 0] as const };
    const world = await createWorld({ assetDefinitions: {}, camera: new PerspectiveCamera(), humanoid: {
      map, vehicles: [], character: { instanceId: 'person', object: new Group() },
    } });
    try {
      const runtime = world.humanoid!, start = { positionWorldMetersXYZ: [0, .03, 0] as const, facingYawRadians: Math.PI };
      expect(runtime.probeEpisodeStart(start).isValid).toBe(true); runtime.prepareEpisodeStart(start);
      const revision = runtime.simulation.controlledActor.teleportRevision;
      for (let sample = 0; sample < 60; sample++) world.step({ humanoid: { ...humanoid.emptyInput(), forward: 1 } }, 30);
      const state = world.getEntityState('person');
      expect(world.snapshot().errors).toEqual([]);
      expect(world.simulationTick).toBe(1800);
      expect(runtime.simulation.controlledActor.teleportRevision).toBe(revision);
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
      expect(runtime.snapshot().vehicles.map(vehicle => vehicle.assetId)).toEqual(['vehicle.rover', 'vehicle.rover']);
    } finally { world.dispose(); }
  }, 20_000);

  it('an occupied vehicle remains mounted when every exit is blocked', async () => {
    const base = course('wheeled');
    const map: EnvironmentDefinition = { ...base, boxes: [...base.boxes,
      { id: 'left', position: [-2.6, 4, 0], size: [1, 8, 10] },
      { id: 'right', position: [2.6, 4, 0], size: [1, 8, 10] },
      { id: 'front', position: [0, 4, 3.4], size: [10, 8, 1] },
      { id: 'rear', position: [0, 4, -3.4], size: [10, 8, 1] },
    ] };
    const { world, runtime, start } = await fixture('wheeled', map);
    try {
      expect(runtime.probeEpisodeStart(start).isValid).toBe(true);
      runtime.prepareEpisodeStart(start); world.step({}, 60);
      const position = runtime.simulation.controlledActor.player.position.clone();
      const revision = runtime.simulation.controlledActor.teleportRevision;
      expect(runtime.exit()).toBe(false);
      expect(runtime.snapshot().mountedInstanceId).toBe('subject');
      expect(runtime.simulation.controlledActor.player.position.distanceTo(position)).toBe(0);
      expect(runtime.simulation.controlledActor.teleportRevision).toBe(revision);
      expect(world.snapshot().errors).toEqual([]);
    } finally { world.dispose(); }
  });
});
