import { describe, expect, it } from "vitest";

import { calculatePrimitiveResourceCost, deriveVerticalCharacterCapsule } from "./index";

describe("subject composition", () => {
  it("derives a grounded capsule from primitive bounds without an engine", () => {
    const result = deriveVerticalCharacterCapsule([
      {
        id: "body",
        shape: { kind: "box", sizeMetersXYZ: [0.8, 1.2, 0.6] },
        localPositionMetersXYZ: [0, 0.6, 0],
        localRotationEulerRadiansXYZ: [0, 0, 0],
      },
    ]);

    expect(result).toEqual({
      ok: true,
      bounds: {
        minimumMetersXYZ: [-0.4, 0, -0.3],
        maximumMetersXYZ: [0.4, 1.2, 0.3],
      },
      collider: {
        kind: "capsule",
        radiusMeters: 0.4,
        heightMeters: 1.2,
        centerOffsetFromSubjectOriginMetersXYZ: [0, 0.6, 0],
      },
    });
  });

  it("applies right-handed X-then-Y-then-Z rotation to conservative bounds", () => {
    const result = deriveVerticalCharacterCapsule([
      {
        id: "rotated-cylinder",
        shape: { kind: "cylinder", radiusMeters: 0.5, heightMeters: 2 },
        localPositionMetersXYZ: [0, 0.5, 0],
        localRotationEulerRadiansXYZ: [0, 0, Math.PI / 2],
      },
    ]);

    expect(result).toEqual({
      ok: true,
      bounds: {
        minimumMetersXYZ: [-1, 0, -0.5],
        maximumMetersXYZ: [1, 1, 0.5],
      },
      collider: {
        kind: "capsule",
        radiusMeters: 1,
        heightMeters: 2,
        centerOffsetFromSubjectOriginMetersXYZ: [0, 1, 0],
      },
    });
  });

  it("rejects a composition whose included bounds do not meet support-center", () => {
    const result = deriveVerticalCharacterCapsule([
      {
        id: "floating-body",
        shape: { kind: "box", sizeMetersXYZ: [1, 1, 1] },
        localPositionMetersXYZ: [0, 2, 0],
        localRotationEulerRadiansXYZ: [0, 0, 0],
      },
    ]);

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: "SUBJECT_SUPPORT_ORIGIN_INVALID", partIds: ["floating-body"] }],
    });
  });

  it("uses a deterministic resource-cost table", () => {
    expect(
      calculatePrimitiveResourceCost([
        { shape: { kind: "box", sizeMetersXYZ: [1, 1, 1] } },
        { shape: { kind: "sphere", radiusMeters: 0.5 } },
      ]),
    ).toEqual({ vertices: 313, triangles: 524, colliders: 1 });
  });

  it("rejects an empty collider-source composition", () => {
    expect(deriveVerticalCharacterCapsule([])).toMatchObject({
      ok: false,
      issues: [{ code: "SUBJECT_COMPOSITION_EMPTY", partIds: [] }],
    });
  });

  it("reports every primitive with non-finite transforms or invalid dimensions", () => {
    const result = deriveVerticalCharacterCapsule([
      {
        id: "invalid-box",
        shape: { kind: "box", sizeMetersXYZ: [0, 1, 1] },
        localPositionMetersXYZ: [0, 0, 0],
        localRotationEulerRadiansXYZ: [0, 0, 0],
      },
      {
        id: "invalid-sphere",
        shape: { kind: "sphere", radiusMeters: Number.NaN },
        localPositionMetersXYZ: [0, 0, 0],
        localRotationEulerRadiansXYZ: [0, 0, 0],
      },
      {
        id: "invalid-cylinder",
        shape: { kind: "cylinder", radiusMeters: 0.5, heightMeters: Number.POSITIVE_INFINITY },
        localPositionMetersXYZ: [0, 0, 0],
        localRotationEulerRadiansXYZ: [0, 0, 0],
      },
      {
        id: "invalid-capsule",
        shape: { kind: "capsule", radiusMeters: 0.4, heightMeters: 0.5 },
        localPositionMetersXYZ: [0, 0, 0],
        localRotationEulerRadiansXYZ: [0, 0, 0],
      },
      {
        id: "invalid-transform",
        shape: { kind: "box", sizeMetersXYZ: [1, 1, 1] },
        localPositionMetersXYZ: [Number.NaN, 0.5, 0],
        localRotationEulerRadiansXYZ: [0, 0, 0],
      },
    ]);

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: "SUBJECT_PRIMITIVE_INVALID",
          partIds: [
            "invalid-box",
            "invalid-sphere",
            "invalid-cylinder",
            "invalid-capsule",
            "invalid-transform",
          ],
        },
      ],
    });
  });

  it("unions every included primitive before deriving one character proxy", () => {
    const result = deriveVerticalCharacterCapsule([
      {
        id: "body",
        shape: { kind: "box", sizeMetersXYZ: [1, 1, 1] },
        localPositionMetersXYZ: [0, 0.5, 0],
        localRotationEulerRadiansXYZ: [0, 0, 0],
      },
      {
        id: "head",
        shape: { kind: "sphere", radiusMeters: 0.5 },
        localPositionMetersXYZ: [0.75, 1.5, 0],
        localRotationEulerRadiansXYZ: [0, 0, 0],
      },
    ]);

    expect(result).toEqual({
      ok: true,
      bounds: {
        minimumMetersXYZ: [-0.5, 0, -0.5],
        maximumMetersXYZ: [1.25, 2, 0.5],
      },
      collider: {
        kind: "capsule",
        radiusMeters: 0.875,
        heightMeters: 2,
        centerOffsetFromSubjectOriginMetersXYZ: [0.375, 1, 0],
      },
    });
  });
});
