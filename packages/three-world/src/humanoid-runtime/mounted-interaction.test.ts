import RAPIER from "@dimforge/rapier3d-compat";
import { Vector3 } from "three";
import type { Simulation } from "./simulation";
import { it, expect } from "vitest";
import { createMountedFixture } from "./mounted-test-fixture";
it("hands off solved velocity and continues both bodies during the exit transition", async () => {
  const world = await createMountedFixture();
  try {
    const runtime = world.humanoid!;
    expect(runtime.enter("horse-1")).toBe(true);
    world.step({}, 31);
    const horse = runtime.simulation.vehicle!;
    horse.velocity.set(0, 0, 1.5);
    horse.speed = 1.5;
    horse.grounded = true;
    expect(runtime.exit()).toBe(true);
    const human = runtime.simulation.humanoid!;
    expect(human.velocity.z).toBeCloseTo(1.5);
    const humanZ = human.position.z,
      horseZ = horse.position.z;
    world.step({ moveZRatio: -1 }, 1);
    expect(runtime.snapshot().transition.remainingSeconds).toBeGreaterThan(0);
    expect(human.position.z).toBeGreaterThan(humanZ);
    expect(horse.position.z).toBeGreaterThan(horseZ);
    expect(human.velocity.z).toBeLessThan(1.5);
  } finally {
    world.dispose();
  }
});

function physicalState(
  world: Awaited<ReturnType<typeof createMountedFixture>>,
) {
  const s = world.humanoid!.simulation,
    h = s.humanoid!;
  return {
    active: s.active,
    position: h.position.toArray(),
    velocity: h.velocity.toArray(),
    vertical: h.vertical,
    facing: h.facing.toArray(),
    mounted: h.isMounted,
    capsule: h.capsule.isEnabled(),
    count: s.environment!.colliderCount,
    player: {
      position: s.player.position.toArray(),
      velocity: s.player.velocity.toArray(),
      yaw: s.player.yaw,
    },
    transition: s.transition,
    vehicles: s.vehicles.map((v) => ({
      position: v.position.toArray(),
      velocity: v.velocity.toArray(),
      yaw: v.yaw,
    })),
  };
}
it("checks an explicit simulation interaction through the atomic mount gate", async () => {
  const world = await createMountedFixture();
  try {
    const simulation = world.humanoid!.simulation;
    simulation.humanoid.position.set(0, 0.025, 2.4);
    const before = physicalState(world);
    expect(simulation.interact("horse-1")).toBe(false);
    expect(simulation.failureCode).toBe("VEHICLE_MOUNT_SIDE_REQUIRED");
    expect(physicalState(world)).toEqual(before);
  } finally {
    world.dispose();
  }
});
it("enters the explicit farther instance and preserves repeated-request state", async () => {
  const world = await createMountedFixture({
    secondHorsePosition: [3, 0.025, 0],
  });
  try {
    const r = world.humanoid!;
    expect(r.enter("horse-2")).toBe(true);
    expect(r.simulation.vehicle!.spec.id).toBe("horse-2");
    const before = physicalState(world);
    expect(r.enter("horse-1")).toBe(false);
    expect(r.simulation.failureCode).toBe("HUMANOID_TRANSITION_ACTIVE");
    expect(physicalState(world)).toEqual(before);
    world.step({}, 31);
    const mounted = physicalState(world);
    expect(r.enter("horse-1")).toBe(false);
    expect(r.simulation.failureCode).toBe("HUMANOID_ALREADY_MOUNTED");
    expect(physicalState(world)).toEqual(mounted);
  } finally {
    world.dispose();
  }
});
it.each([
  [-1, 0],
  [1, 0],
  [-1, Math.PI / 2],
  [1, Math.PI / 2],
  [-1, -Math.PI / 2],
  [1, -Math.PI / 2],
])("boards side %s at yaw %s", async (side, yaw) => {
  const world = await createMountedFixture();
  try {
    const r = world.humanoid!,
      v = r.simulation.vehicles[0]!;
    v.yaw = yaw!;
    v.rotation.setFromAxisAngle(new Vector3(0, 1, 0), yaw!);
    r.prepareCharacter([
      side! * 1.45 * Math.cos(yaw!),
      0.025,
      -side! * 1.45 * Math.sin(yaw!),
    ]);
    expect(r.enter("horse-1")).toBe(true);
  } finally {
    world.dispose();
  }
});
it.each([
  [
    "head",
    (s: Simulation): void => {
      s.humanoid!.position.set(0, 0.025, 2.4);
    },
    "VEHICLE_MOUNT_SIDE_REQUIRED",
  ],
  [
    "tail",
    (s: Simulation): void => {
      s.humanoid!.position.set(0, 0.025, -2.4);
    },
    "VEHICLE_MOUNT_SIDE_REQUIRED",
  ],
  [
    "overlap",
    (s: Simulation): void => {
      s.humanoid!.position.set(0.9, 0.025, 0);
    },
    "VEHICLE_MOUNT_SPACE_BLOCKED",
  ],
  [
    "far",
    (s: Simulation): void => {
      s.humanoid!.position.set(10, 0.025, 0);
    },
    "VEHICLE_MOUNT_OUT_OF_REACH",
  ],
  [
    "airborne rider",
    (s: Simulation): void => {
      s.humanoid!.position.y = 1;
    },
    "VEHICLE_MOUNT_GROUND_REQUIRED",
  ],
  [
    "unsupported horse",
    (s: Simulation): void => {
      s.vehicles[0]!.grounded = false;
    },
    "VEHICLE_MOUNT_GROUND_REQUIRED",
  ],
  [
    "airborne horse",
    (s: Simulation): void => {
      s.vehicles[0]!.position.y = 3;
    },
    "VEHICLE_MOUNT_GROUND_REQUIRED",
  ],
  [
    "busy",
    (s: Simulation): void => {
      s.humanoid!.stance = "crouch";
    },
    "HUMANOID_CHARACTER_BUSY",
  ],
  [
    "fast",
    (s: Simulation): void => {
      s.vehicles[0]!.velocity.z = 3;
    },
    "VEHICLE_MOUNT_TOO_FAST",
  ],
  [
    "deep water",
    (s: Simulation): void => {
      s.environment!.map.water = [
        { id: "water", min: [-10, -10, -10], max: [10, 10, 10], surface: 2 },
      ];
    },
    "VEHICLE_MOUNT_GROUND_REQUIRED",
  ],
  [
    "no support",
    (s: Simulation): void => {
      s.humanoid!.world.colliders.forEach((c) => {
        if (c.translation().y < 0) c.setEnabled(false);
      });
    },
    "VEHICLE_MOUNT_GROUND_REQUIRED",
  ],
] as const)(
  "refuses %s without physical mutation",
  async (_name, change, code) => {
    const world = await createMountedFixture();
    try {
      const r = world.humanoid!;
      change(r.simulation);
      const before = physicalState(world);
      expect(r.enter("horse-1")).toBe(false);
      expect(r.simulation.failureCode).toBe(code);
      expect(physicalState(world)).toEqual(before);
    } finally {
      world.dispose();
    }
  },
);
it.each([
  { id: "wall", position: [1.25, 1, 0], size: [0.1, 2, 2] },
  { id: "ceiling", position: [0, 3.1, 0], size: [2, 0.2, 4] },
] as const)("rejects $id without moving the rider", async (box) => {
  const world = await createMountedFixture({ boxes: [box] });
  try {
    const r = world.humanoid!;
    r.simulation.humanoid!.position.set(1.7, 0.025, 0);
    const before = physicalState(world);
    expect(r.enter("horse-1")).toBe(false);
    expect(physicalState(world)).toEqual(before);
  } finally {
    world.dispose();
  }
});
it("keeps binding and collider disabled when both exits are blocked", async () => {
  const world = await createMountedFixture();
  try {
    const r = world.humanoid!;
    expect(r.enter("horse-1")).toBe(true);
    world.step({}, 31);
    const h = r.simulation.humanoid!,
      q = r.simulation.environment!;
    for (const x of [-1.12, 1.12])
      h.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.15, 1, 1).setTranslation(x, 1, 0),
      );
    const before = physicalState(world);
    expect(r.exit()).toBe(false);
    expect(r.simulation.failureCode).toBe("VEHICLE_DISMOUNT_NO_SAFE_POINT");
    expect(physicalState(world)).toEqual(before);
    expect(q.colliderCount).toBe(before.count);
  } finally {
    world.dispose();
  }
});
it("propagates structured refusal through the existing command path", async () => {
  const world = await createMountedFixture();
  try {
    expect(() =>
      world.humanoid!.command({
        type: "vehicle.enter",
        instanceId: "missing",
      }),
    ).toThrow("HUMANOID_TARGET_UNAVAILABLE");
  } finally {
    world.dispose();
  }
});
it("settles an unoccupied horse whose ground support disappeared", async () => {
  const world = await createMountedFixture();
  try {
    const v = world.humanoid!.simulation.vehicles[0]!;
    v.position.y = 3;
    v.grounded = true;
    world.step({}, 2);
    expect(v.position.y).toBeLessThan(3);
  } finally {
    world.dispose();
  }
});
it("collides with a wall beyond the exit while suppressing active jump and movement", async () => {
  const world = await createMountedFixture();
  try {
    const r = world.humanoid!;
    expect(r.enter("horse-1")).toBe(true);
    world.step({}, 31);
    const v = r.simulation.vehicle!;
    v.velocity.set(0, 0, 1.5);
    v.speed = 1.5;
    expect(r.exit()).toBe(true);
    const h = r.simulation.humanoid!,
      x = h.position.x;
    h.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.2, 1, 0.04).setTranslation(x, 1, 0.4),
    );
    world.step({ moveZRatio: -1, jump: true }, 20);
    expect(h.position.z).toBeLessThan(0.1);
    expect(h.position.y).toBeLessThan(0.08);
    expect(r.snapshot().transition.remainingSeconds).toBeGreaterThan(0);
  } finally {
    world.dispose();
  }
});
it.each(["fast", "air", "water"] as const)(
  "rejects %s exit atomically",
  async (reason) => {
    const world = await createMountedFixture();
    try {
      const r = world.humanoid!;
      expect(r.enter("horse-1")).toBe(true);
      world.step({}, 31);
      const v = r.simulation.vehicle!;
      if (reason === "fast") v.velocity.z = 5.01;
      else if (reason === "air") v.grounded = false;
      else v.submerged = true;
      const before = physicalState(world);
      expect(r.exit()).toBe(false);
      expect(r.simulation.failureCode).toBe(
        reason === "fast"
          ? "VEHICLE_MOUNT_TOO_FAST"
          : "VEHICLE_MOUNT_GROUND_REQUIRED",
      );
      expect(physicalState(world)).toEqual(before);
    } finally {
      world.dispose();
    }
  },
);
it("retains the parked non-mount motion policy", async () => {
  const world = await createMountedFixture();
  try {
    const v = world.humanoid!.simulation.vehicles[0]!;
    v.spec.mode = "wheeled";
    v.velocity.z = 1.5;
    v.speed = 1.5;
    const before = v.position.clone();
    world.step({}, 1);
    expect(v.position).toEqual(before);
  } finally {
    world.dispose();
  }
});

it("hands off the full solved world velocity on a supported upward step", async () => {
  const world = await createMountedFixture({
    boxes: [{ id: "step", position: [0, 0.02, 4], size: [8, 0.04, 4] }],
  });
  try {
    const runtime = world.humanoid!;
    expect(runtime.enter("horse-1")).toBe(true);
    world.step({}, 31);
    const horse = runtime.simulation.vehicle!;
    let upwardVelocity: Vector3 | undefined;
    for (let tick = 0; tick < 60; tick++) {
      const before = horse.position.clone();
      world.step({ moveZRatio: -1 }, 1);
      const solved = horse.position.clone().sub(before).multiplyScalar(60);
      if (horse.grounded && solved.y > 0.1) {
        // A dynamic body's instantaneous velocity differs from the mean
        // displacement across two accelerating solver slices.
        upwardVelocity = horse.velocity.clone();
        break;
      }
    }
    expect(upwardVelocity).toBeDefined();
    expect(horse.velocity.y).toBeCloseTo(upwardVelocity!.y, 6);
    expect(runtime.exit()).toBe(true);
    expect(runtime.simulation.humanoid!.vertical).toBeCloseTo(
      upwardVelocity!.y,
      6,
    );
    expect(runtime.simulation.humanoid!.velocity.x).toBeCloseTo(
      upwardVelocity!.x,
      6,
    );
    expect(runtime.simulation.humanoid!.velocity.z).toBeCloseTo(
      upwardVelocity!.z,
      6,
    );
  } finally {
    world.dispose();
  }
});

it("rejects command-driven roll during exit without storing or advancing an action", async () => {
  const world = await createMountedFixture();
  try {
    const runtime = world.humanoid!;
    expect(runtime.enter("horse-1")).toBe(true);
    world.step({}, 31);
    expect(runtime.exit()).toBe(true);
    world.step({}, 3);
    const human = runtime.simulation.humanoid!;
    human.skills.availableClips.add("roll");
    expect(human.grounded).toBe(true);
    expect(runtime.simulation.transition).toBeGreaterThan(0);
    const request = { requestId: "exit-roll", action: "roll" as const };
    expect(() => runtime.command({ type: "humanoid.perform-action", request })).toThrow(
      "HUMANOID_TRANSITION_ACTIVE",
    );
    expect(human.skills.active).toBeNull();
    expect(human.skills.status(request.requestId)).toBeNull();
    world.step({}, 1);
    expect(human.skills.active).toBeNull();
    world.step({}, 24);
    expect(human.skills.active).toBeNull();
    expect(runtime.command({ type: "humanoid.perform-action", request })).toMatchObject(
      { status: "running", code: "STARTED" },
    );
  } finally {
    world.dispose();
  }
});
