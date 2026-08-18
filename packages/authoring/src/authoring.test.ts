import { describe, expect, it } from "vitest";

import { parseAuthoringSpecJson, validateAuthoringSpec } from "./index";

const validSpec = {
  kind: "worldkit-authoring-spec",
  schemaVersion: 1,
  id: "basic-world",
  seed: 1024,
  world: {
    coordinateSystem: "right-handed-y-up-minus-z-forward",
    bounds: {
      centerXZ: [0, 0],
      sizeXZ: [160, 160],
      heightRangeMeters: [-10, 30],
    },
    gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
    environment: { preset: "clear-day" },
    resourceBudget: {
      maxVertices: 200_000,
      maxTriangles: 300_000,
      maxColliders: 128,
    },
  },
  resources: { prototypes: [] },
  nodes: [
    {
      id: "terrain-main",
      kind: "terrain",
      components: {
        terrain: {
          source: { kind: "procedural", relief: "plain" },
          grid: {
            originXZ: [0, 0],
            sizeXZ: [160, 160],
            resolutionXZ: [65, 65],
          },
        },
      },
    },
    {
      id: "spawn-main",
      kind: "anchor",
      transform: { positionMeters: [0, 0, 30] },
      semantic: { classId: "spawn" },
    },
    {
      id: "player",
      kind: "subject",
      kitRef: "worldkit://kit/humanoid.third-person@1",
    },
    {
      id: "camera-main",
      kind: "camera",
      components: {
        cameraRig: {
          defaultRigRef: "worldkit://camera/third-person.standard@1",
          allowedRigRefs: ["worldkit://camera/third-person.standard@1"],
          target: { entityId: "player" },
          thirdPerson: {
            pitchRadians: 0.3,
            distanceMeters: 5,
            targetHeightMeters: 1,
            fovDegrees: 56,
          },
          manualSwitchAllowed: false,
        },
      },
    },
  ],
  relationships: [],
  rules: [],
  startup: {
    spawnAnchorId: "spawn-main",
    controlledEntityId: "player",
    cameraEntityId: "camera-main",
  },
  constraints: {},
} as const;

describe("AuthoringSpecV1", () => {
  it("strictly parses a valid canonical authoring document", () => {
    const result = parseAuthoringSpecJson(JSON.stringify(validSpec));

    expect(result.ok).toBe(true);
    expect(result.value).toEqual(validSpec);
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects duplicate JSON object keys before schema validation", () => {
    const result = parseAuthoringSpecJson(
      '{"kind":"worldkit-authoring-spec","kind":"other"}',
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_JSON_DUPLICATE_KEY",
        instancePath: "/kind",
      }),
    );
  });

  it("rejects unknown public fields instead of silently ignoring them", () => {
    const result = validateAuthoringSpec({ ...validSpec, unexpected: true });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_SCHEMA_INVALID",
        instancePath: "",
      }),
    );
  });

  it("rejects comments and trailing commas as non-JSON input", () => {
    const result = parseAuthoringSpecJson(`{
      // comments are not canonical JSON
      "kind": "worldkit-authoring-spec",
    }`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toEqual(
      expect.objectContaining({ code: "AUTHORING_JSON_SYNTAX_INVALID" }),
    );
  });
});

