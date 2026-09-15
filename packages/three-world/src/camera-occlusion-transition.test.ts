import { Group, Quaternion, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { createHumanoidCameraDocument, type CameraDocument } from './config/camera/index';
import { WorldEngine } from './engine';
import { humanoidHost } from './humanoid-runtime/host-access';
import type { EnvironmentDefinition } from './humanoid-runtime/environment/types';
import { createWorld, type ThreeWorld } from './world';

const map: EnvironmentDefinition = {
  id: 'camera-roof-return', name: 'Camera roof return', description: '',
  bounds: { min: [-50, -10, -50], max: [50, 50, 50] },
  boxes: [
    { id: 'ground', position: [0, -.5, 0], size: [100, 1, 100] },
    { id: 'roof', position: [-13, 2.7, -3], size: [12, .4, 12] },
  ],
  water: [], regions: [], spawns: [], playerSpawn: [-13, .03, -3],
};
const engine = (world: ThreeWorld) => (world as unknown as { engine: WorldEngine }).engine;
const point = (value: readonly [number, number, number]) => new Vector3(...value);

it.each([60, 30])('retracts before returning under a roof with real Humanoid movement and %i Hz presentation', async presentationHz => {
  // The native controller requires 60 Hz physics. 30 Hz here samples every other
  // fixed tick; it must not silently replace the actor's simulation frequency.
  // Mesh/animation loading is irrelevant to the real KCC and capsule visibility.
  const world = await createWorld({ navigation: false, assetDefinitions: {}, humanoid: {
    map, character: { instanceId: 'person', object: new Group() }, vehicles: [],
  } });
  try {
    const defaults = createHumanoidCameraDocument('person');
    const configuration: CameraDocument = { ...defaults, views: { ...defaults.views,
      'third-person': { kind: 'third-person', overrides: { position: { distanceMeters: 5.6 } } },
    } };
    world.setCameraFollow({ configuration });
    expect(world.humanoid!.prepareCharacter([-13, .03, -3], 0)).toBe(true);
    world.step({}, 0);
    expect(world.inspectCamera().resolved).toMatchObject({ kind: 'third-person', values: { position: { distanceMeters: 5.6 } } });
    const runtime = engine(world), binding = configuration.binding;
    let previousFixed = point(world.inspectCamera().current!.positionWorldMetersXYZ);
    let previousDisplay: Vector3 | undefined, previousRenderedEndpoint: Vector3 | undefined;
    let maximumFixedMovement = 0, maximumDisplayedMovement = 0, maximumRenderedFrameMovement = 0;
    let hiddenTicks = 0, maximumHiddenTicks = 0, hiddenDisplayFrames = 0, maximumHiddenDisplayFrames = 0;
    let outsidePosition: Vector3 | undefined;
    let movementTick = 0;
    for (const phase of [
      { kind: 'pitch', ticks: 45, input: { cameraPitchRatio: 1 } },
      { kind: 'out', ticks: 210, input: { moveXRatio: 1 } },
      { kind: 'return', ticks: 210, input: { moveXRatio: -1 } },
    ] as const) {
      for (let index = 0; index < phase.ticks; index++) {
        world.step(phase.input);
        const inspection = world.inspectCamera(), current = inspection.current!;
        const fixed = point(current.positionWorldMetersXYZ);
        const subject = runtime.cameraSubjects.sample(binding)!;
        const geometry = humanoidHost(world.humanoid!).cameraGeometry(subject);
        const radius = inspection.resolved!.values.constraints.collision.radiusMeters;
        expect(geometry.probe(current.positionWorldMetersXYZ, current.positionWorldMetersXYZ, radius).startedOverlapping,
          `${phase.kind} tick ${world.simulationTick}: fixed eye overlaps`).not.toBe(true);
        expect(Math.abs(new Vector3(1, 0, 0).applyQuaternion(new Quaternion(...current.quaternionWorldXYZW)).y),
          `${phase.kind} tick ${world.simulationTick}: fixed horizon rolls`).toBeLessThan(1e-7);
        const visible = geometry.isSubjectVisible!(current.positionWorldMetersXYZ, geometry.probe);
        hiddenTicks = visible ? 0 : hiddenTicks + 1;
        maximumHiddenTicks = Math.max(maximumHiddenTicks, hiddenTicks);
        if (phase.kind !== 'pitch') {
          movementTick++;
          maximumFixedMovement = Math.max(maximumFixedMovement, fixed.distanceTo(previousFixed));
        }
        previousFixed = fixed;
        if (phase.kind !== 'pitch' && movementTick % (60 / presentationHz) === 0) {
          const tick = world.simulationTick, revision = inspection.cameraCommitRevision;
          for (const alpha of [0, .25, .5, .75, 1]) runtime.withPresentation(() => {
            const displayed = world.camera.getWorldPosition(new Vector3());
            const quaternion = world.camera.getWorldQuaternion(new Quaternion());
            const displayedSubject = runtime.cameraSubjects.sample(binding, true)!;
            const displayedGeometry = humanoidHost(world.humanoid!).cameraGeometry(displayedSubject);
            expect(displayedGeometry.probe(displayed.toArray(), displayed.toArray(), radius).startedOverlapping,
              `${phase.kind} tick ${tick}, alpha ${alpha}: displayed eye overlaps`).not.toBe(true);
            expect(Math.abs(new Vector3(1, 0, 0).applyQuaternion(quaternion).y),
              `${phase.kind} tick ${tick}, alpha ${alpha}: displayed horizon rolls`).toBeLessThan(1e-7);
            if (previousDisplay) maximumDisplayedMovement = Math.max(maximumDisplayedMovement, displayed.distanceTo(previousDisplay));
            previousDisplay = displayed;
            if (alpha === 1) {
              expect(displayed.distanceTo(fixed), 'display endpoint must not apply the soft arm reduction a second time').toBeLessThan(1e-6);
              hiddenDisplayFrames = displayedGeometry.isSubjectVisible!(displayed.toArray(), displayedGeometry.probe) ? 0 : hiddenDisplayFrames + 1;
              maximumHiddenDisplayFrames = Math.max(maximumHiddenDisplayFrames, hiddenDisplayFrames);
              if (previousRenderedEndpoint) maximumRenderedFrameMovement = Math.max(maximumRenderedFrameMovement, displayed.distanceTo(previousRenderedEndpoint));
              previousRenderedEndpoint = displayed;
            }
          }, alpha);
          expect(world.simulationTick).toBe(tick);
          expect(world.inspectCamera().cameraCommitRevision).toBe(revision);
          expect(world.inspectCamera()).toEqual(inspection);
        }
      }
      if (phase.kind === 'pitch') expect(world.inspectCamera().intent!.pitchRadians).toBeCloseTo(1.1, 7);
      if (phase.kind === 'out') outsidePosition = point(world.getEntityState('person').positionWorldMetersXYZ);
    }
    const returned = point(world.getEntityState('person').positionWorldMetersXYZ);
    expect(Math.abs(outsidePosition!.x + 13), 'actor really left the 12 m roof').toBeGreaterThan(6.3);
    expect(Math.abs(returned.x + 13), 'same actor returned under the roof through input').toBeLessThan(5);
    expect(Math.abs(returned.z + 3)).toBeLessThan(.02);
    expect(maximumFixedMovement, `maximum fixed eye step at ${presentationHz} Hz presentation`).toBeLessThan(1);
    expect(maximumDisplayedMovement, `maximum displayed eye step at ${presentationHz} Hz presentation`).toBeLessThan(1);
    expect(maximumRenderedFrameMovement, 'rendered frame travel respects the same per-second bound at both cadences').toBeLessThan(60 / presentationHz);
    expect(maximumHiddenTicks, 'camera must not stay behind the roof with the actor fully hidden').toBeLessThan(15);
    expect(maximumHiddenDisplayFrames, 'displayed subject must not stay hidden after reprojection').toBeLessThan(presentationHz / 4);
    expect(world.snapshot().errors).toEqual([]);
  } finally { world.dispose(); }
}, 30_000);
