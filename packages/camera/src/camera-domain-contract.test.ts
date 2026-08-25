import { describe, expect, it } from "vitest";

describe("@whitebox-world/camera public domain contract", () => {
  it("exports admission and deterministic selection as provider-neutral pure functions", async () => {
    const cameraDomain: Record<string, unknown> = await import("./index.js");

    expect(cameraDomain).toMatchObject({
      admitCameraContextProfileV1: expect.any(Function),
      admitCameraViewPreferenceV1: expect.any(Function),
      selectCameraViewV1: expect.any(Function),
    });
    expect(cameraDomain).not.toHaveProperty("ThirdPersonCameraRig");
    expect(cameraDomain).not.toHaveProperty("CameraMovementBasis");
  });

  it("owns the closed, unit-qualified Camera Rig parameter vocabulary", async () => {
    const cameraDomain: Record<string, unknown> = await import("./index.js");

    expect(cameraDomain.CAMERA_RIG_PARAMETER_NAMES_V1).toEqual(
      expect.arrayContaining([
        "distanceMeters",
        "pitchRadians",
        "baseFovDegrees",
        "positionDampingPerSecond",
        "transitionSeconds",
      ]),
    );
    expect(cameraDomain.CAMERA_RIG_PARAMETER_NAMES_V1).toHaveLength(35);
  });
});
