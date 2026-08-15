import { Group, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { ThirdPersonCameraRig } from "./index.js";

describe("ThirdPersonCameraRig", () => {
  it("orbits a target and exposes a horizontal movement basis", () => {
    const target = new Group();
    const camera = new PerspectiveCamera();
    const rig = new ThirdPersonCameraRig({
      camera,
      target,
      targetOffset: [0, 1, 0],
      distance: 4,
      pitch: 0,
      yaw: 0,
    });

    rig.update(0);
    expect(camera.position.toArray()).toEqual([0, 1, 4]);
    expect(rig.getMovementBasis().forward[2]).toBeCloseTo(-1);
    expect(rig.getMovementBasis().right[0]).toBeCloseTo(1);
  });

  it("clamps pitch and delegates obstruction handling", () => {
    const resolve = vi.fn(() => new Vector3(0, 1, 2));
    const rig = new ThirdPersonCameraRig({
      camera: new PerspectiveCamera(),
      target: new Group(),
      minPitch: -0.5,
      maxPitch: 0.5,
      collision: { resolve },
    });
    rig.setOrbit(0, 10);
    rig.update(0);
    expect(rig.orbit.pitch).toBe(0.5);
    expect(resolve).toHaveBeenCalledOnce();
    expect(rig.camera.position.toArray()).toEqual([0, 1, 2]);
  });

  it("filters small vertical ground steps out of the camera focus", () => {
    const target = new Group();
    const rig = new ThirdPersonCameraRig({
      camera: new PerspectiveCamera(),
      target,
      targetOffset: [0, 1, 0],
      distance: 4,
      pitch: 0,
      verticalDeadZone: 0.05,
      verticalFocusDamping: 6,
    });
    rig.update(0);
    target.position.y = 0.03;
    rig.update(1 / 60);
    expect(rig.focus.y).toBeCloseTo(1);

    target.position.y = 0.5;
    rig.update(1 / 60);
    expect(rig.focus.y).toBeGreaterThan(1);
    expect(rig.focus.y).toBeLessThan(1.5);
  });

  it("does not turn alternating ground-contact jitter into camera bob", () => {
    const target = new Group();
    const rig = new ThirdPersonCameraRig({
      camera: new PerspectiveCamera(),
      target,
      targetOffset: [0, 1, 0],
      verticalDeadZone: 0.04,
      verticalFocusDamping: 8,
    });
    rig.update(0);
    const samples: number[] = [];
    for (let frame = 0; frame < 120; frame += 1) {
      target.position.y = frame % 2 === 0 ? 0.025 : -0.025;
      rig.update(1 / 60);
      samples.push(rig.focus.y);
    }
    expect(Math.max(...samples) - Math.min(...samples)).toBeLessThan(0.005);
  });
});
