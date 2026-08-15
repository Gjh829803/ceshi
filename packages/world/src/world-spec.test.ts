import { describe, expect, it } from "vitest";

import {
  defineOutdoorWorldSpec,
  validateOutdoorWorldSpec,
  validateWorldSpecImplementation,
} from "./world-spec";

function validSpec() {
  return {
    kind: "outdoor-world-spec" as const,
    version: 1 as const,
    id: "valid-world",
    source: { request: "a field with one tower" },
    intent: "A small planning validation fixture.",
    bounds: { center: [0, 0] as const, size: [100, 100] as const, heightRange: [-2, 20] as const },
    terrain: {
      baseRelief: "plain" as const,
      regions: [
        {
          id: "ground",
          semantic: "field",
          role: "ground" as const,
          area: {
            kind: "polygon" as const,
            points: [[-50, -50], [50, -50], [50, 50], [-50, 50]] as const,
          },
          featureId: "terrain",
          evidence: "user-explicit" as const,
        },
      ],
    },
    water: [],
    landmarks: [
      {
        id: "tower-anchor",
        semantic: "tower",
        position: [0, 0, -20] as const,
        approximateSize: [6, 20, 6] as const,
        importance: "primary" as const,
        featureId: "tower",
        evidence: "user-explicit" as const,
      },
    ],
    routes: [
      {
        id: "route",
        points: [[0, 20], [0, -20]] as const,
        width: 5,
        priority: "primary" as const,
        maxSlopeDegrees: 35,
        evidence: "planner-inferred" as const,
      },
    ],
    entry: {
      spawn: [0, 20] as const,
      facingRadians: 0,
      camera: { pitchRadians: 0.3, distance: 4.5, fovDegrees: 56 },
      composition: {
        foreground: ["field"],
        middleground: ["tower"],
        background: ["horizon"],
        visibleLandmarkIds: ["tower-anchor"],
      },
    },
    claims: [{ id: "claim", evidence: "user-explicit" as const, statement: "The tower is ahead." }],
    artifacts: [
      {
        kind: "world-plan" as const,
        generator: "codex-imagegen" as const,
        uri: "/scene-plans/valid-world/world-plan.png",
        prompt: "Top-down planning image.",
      },
      {
        kind: "opening-shot" as const,
        generator: "codex-imagegen" as const,
        uri: "/scene-plans/valid-world/opening-shot.png",
        prompt: "Opening-shot planning image.",
      },
      {
        kind: "height-slope-plan" as const,
        generator: "sdk-derived" as const,
        uri: "runtime://planning/height-slope" as const,
      },
    ],
    traceability: { requiredFeatureIds: ["terrain", "tower"] },
  };
}

describe("OutdoorWorldSpec", () => {
  it("accepts a complete multi-view planning contract", () => {
    expect(defineOutdoorWorldSpec(validSpec()).id).toBe("valid-world");
  });

  it("rejects missing planning views and unsafe external paths", () => {
    const spec = validSpec();
    spec.artifacts = [
      {
        kind: "world-plan",
        generator: "codex-imagegen",
        uri: "../../outside.png",
        prompt: "unsafe",
      },
    ];
    const codes = validateOutdoorWorldSpec(spec).map((item) => item.code);
    expect(codes).toContain("WORLD_SPEC_IMAGE_ARTIFACT_INVALID");
    expect(codes.filter((code) => code === "WORLD_SPEC_ARTIFACT_MISSING")).toHaveLength(2);
  });

  it("reports a primary route that was planned above the recommended slope margin", () => {
    const spec = validSpec();
    spec.routes[0] = { ...spec.routes[0]!, maxSlopeDegrees: 40 };
    expect(validateOutdoorWorldSpec(spec)).toContainEqual(
      expect.objectContaining({ severity: "warning", code: "WORLD_SPEC_PRIMARY_ROUTE_STEEP" }),
    );
  });

  it("rejects planned landmarks and routes outside the declared world", () => {
    const base = validSpec();
    const spec = {
      ...base,
      landmarks: [{ ...base.landmarks[0]!, position: [80, 0, -20] as const }],
      routes: [{ ...base.routes[0]!, points: [[0, 20], [0, -80]] as const }],
    };
    const codes = validateOutdoorWorldSpec(spec).map((item) => item.code);
    expect(codes).toContain("WORLD_SPEC_LANDMARK_OUTSIDE_BOUNDS");
    expect(codes).toContain("WORLD_SPEC_ROUTE_OUTSIDE_BOUNDS");
  });

  it("detects when the built primary terrain does not match planned bounds", () => {
    const diagnostics = validateWorldSpecImplementation(validSpec(), {
      featureIds: ["terrain", "tower"],
      bounds: { center: [0, 0], size: [80, 100] },
      spawn: [0, 20],
      facingRadians: 0,
      camera: { pitchRadians: 0.3, distance: 4.5, fovDegrees: 56 },
    });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ severity: "error", code: "WORLD_SPEC_BOUNDS_MISMATCH" }),
    );
  });
});
