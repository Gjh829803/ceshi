import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
    worldPrompt: {
      identity: "A field with one tower.",
      spatialComposition: "The player faces the tower across open ground.",
      environment: "A small open field.",
      lighting: "Neutral daylight.",
      visualStyle: "Simple readable realism.",
      openingShot: "Third-person view toward the tower.",
      invariants: ["Keep one tower."],
      negativePrompt: ["extra structures"],
    },
    entityCatalog: {
      prototypes: [
        {
          id: "player-prototype",
          role: "subject" as const,
          semantic: "player",
          description: "A neutral player humanoid.",
          approximateSize: [1, 2, 1] as const,
          forwardAxis: "-Z" as const,
          pivot: "ground-center" as const,
          instanceColor: "#E85D5D" as const,
          appearancePrompt: "a neutral player humanoid",
          negativePrompt: "no oversized silhouette",
          evidence: "planner-inferred" as const,
          views: {
            canonical: ["front", "right", "back"] as const,
            whiteboxUri: "/scene-plans/valid-world/prototypes/player-prototype/whitebox-triview.png",
            styledUri: "/scene-plans/valid-world/prototypes/player-prototype/styled-triview.png",
          },
        },
        {
          id: "tower-prototype",
          role: "landmark" as const,
          semantic: "tower",
          description: "A simple tower.",
          approximateSize: [6, 20, 6] as const,
          forwardAxis: "-Z" as const,
          pivot: "ground-center" as const,
          instanceColor: "#4C78D0" as const,
          appearancePrompt: "a simple stone tower",
          negativePrompt: "no city",
          evidence: "user-explicit" as const,
          views: {
            canonical: ["front", "right", "back"] as const,
            whiteboxUri: "/scene-plans/valid-world/prototypes/tower-prototype/whitebox-triview.png",
            styledUri: "/scene-plans/valid-world/prototypes/tower-prototype/styled-triview.png",
          },
        },
      ],
      instances: [
        {
          id: "player",
          prototypeId: "player-prototype",
          binding: { kind: "runtime-entity" as const, id: "player" },
          evidence: "planner-inferred" as const,
        },
        {
          id: "tower",
          prototypeId: "tower-prototype",
          binding: { kind: "feature" as const, id: "tower" },
          evidence: "user-explicit" as const,
        },
      ],
    },
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
        pointsMetersXZ: [[0, 20], [0, -20]] as const,
        widthMeters: 5,
        locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
        priority: "primary" as const,
        maximumDesignSlopeDegrees: 35,
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

  it("accepts frozen project references and rejects unsafe or duplicate reference images", () => {
    const validBase = validSpec();
    const valid = {
      ...validBase,
      source: {
        ...validBase.source,
        referenceImages: ["/scene-plans/valid-world/reference-0.png"],
      },
    };
    expect(validateOutdoorWorldSpec(valid)).not.toContainEqual(
      expect.objectContaining({ code: "WORLD_SPEC_REFERENCE_IMAGE_INVALID" }),
    );
    expect(validateOutdoorWorldSpec(valid)).toContainEqual(
      expect.objectContaining({ code: "WORLD_SPEC_REFERENCE_COMPOSITION_GUIDE_MISSING" }),
    );

    const invalidBase = validSpec();
    const invalid = {
      ...invalidBase,
      source: {
        ...invalidBase.source,
        referenceImages: ["../../outside.png", "../../outside.png"],
      },
    };
    expect(validateOutdoorWorldSpec(invalid)).toContainEqual(
      expect.objectContaining({ severity: "error", code: "WORLD_SPEC_REFERENCE_IMAGE_INVALID" }),
    );
  });

  it("reports a primary route that was planned above the recommended slope margin", () => {
    const spec = validSpec();
    spec.routes[0] = { ...spec.routes[0]!, maximumDesignSlopeDegrees: 40 };
    expect(validateOutdoorWorldSpec(spec)).toContainEqual(
      expect.objectContaining({ severity: "warning", code: "WORLD_SPEC_PRIMARY_ROUTE_STEEP" }),
    );
  });

  it("rejects planned landmarks and routes outside the declared world", () => {
    const base = validSpec();
    const spec = {
      ...base,
      landmarks: [{ ...base.landmarks[0]!, position: [80, 0, -20] as const }],
      routes: [{ ...base.routes[0]!, pointsMetersXZ: [[0, 20], [0, -80]] as const }],
    };
    const codes = validateOutdoorWorldSpec(spec).map((item) => item.code);
    expect(codes).toContain("WORLD_SPEC_LANDMARK_OUTSIDE_BOUNDS");
    expect(codes).toContain("WORLD_SPEC_ROUTE_OUTSIDE_BOUNDS");
  });

  it("rejects duplicate instance colors and prototype views outside their declared directory", () => {
    const base = validSpec();
    const spec = {
      ...base,
      entityCatalog: {
        ...base.entityCatalog,
        prototypes: [
          base.entityCatalog.prototypes[0]!,
          {
            ...base.entityCatalog.prototypes[1]!,
            instanceColor: base.entityCatalog.prototypes[0]!.instanceColor,
            views: {
              ...base.entityCatalog.prototypes[1]!.views,
              styledUri: "/scene-plans/valid-world/prototypes/player-prototype/styled-triview.png",
            },
          },
        ],
      },
    };
    const codes = validateOutdoorWorldSpec(spec).map((item) => item.code);
    expect(codes).toContain("WORLD_SPEC_PROTOTYPE_COLOR_INVALID");
    expect(codes).toContain("WORLD_SPEC_PROTOTYPE_VIEWS_INVALID");
  });

  it("requires every planned landmark to bind to an Entity Catalog instance", () => {
    const base = validSpec();
    const spec = {
      ...base,
      entityCatalog: {
        ...base.entityCatalog,
        instances: base.entityCatalog.instances.filter(
          (instance) => instance.binding.kind !== "feature",
        ),
      },
    };
    expect(validateOutdoorWorldSpec(spec)).toContainEqual(
      expect.objectContaining({ severity: "error", code: "WORLD_SPEC_LANDMARK_ENTITY_MISSING" }),
    );
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

  it("drops legacy Planner Route field names from PlannedRoute", () => {
    const source = readFileSync(fileURLToPath(new URL("./world-spec.ts", import.meta.url)), "utf8");
    const block = source.match(/export interface PlannedRoute \{[\s\S]*?\n\}/)?.[0];
    expect(block).toEqual(expect.stringContaining("pointsMetersXZ"));
    expect(block).toEqual(expect.stringContaining("widthMeters"));
    expect(block).toEqual(expect.stringContaining("maximumDesignSlopeDegrees"));
    expect(block).toEqual(expect.stringContaining("locomotionProfileRef"));
    expect(block).not.toMatch(/(^|\n)\s*points:/);
    expect(block).not.toMatch(/(^|\n)\s*width:/);
    expect(block).not.toMatch(/(^|\n)\s*maxSlopeDegrees:/);
  });
});
