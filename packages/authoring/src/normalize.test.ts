import { describe, expect, it } from "vitest";

import { normalizeAuthoringSpec } from "./index";
import {
  createValidAuthoringSpecV4 as createValidAuthoringSpec,
  createValidPackageSubjectWorldV4 as createValidPackageSubjectWorld,
} from "./test-fixture";

describe("normalizeAuthoringSpec", () => {
  it("produces byte-stable normalized ordering and transform defaults", () => {
    const ordered = createValidPackageSubjectWorld();
    const shuffled = createValidPackageSubjectWorld();
    shuffled.nodes = [...shuffled.nodes].reverse();
    shuffled.resources = {
      prototypes: [...shuffled.resources.prototypes].reverse(),
      subjectDefinitions: [...shuffled.resources.subjectDefinitions].reverse(),
    };

    const first = normalizeAuthoringSpec(shuffled);
    const second = normalizeAuthoringSpec(ordered);

    expect(first.ok).toBe(true);
    expect(first.value).toEqual(second.value);
    expect(first.normalizedWorldIrHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.normalizedWorldIrHash).toBe(second.normalizedWorldIrHash);
    expect(first.value?.nodes.map((node) => node.id)).toEqual([
      "camera-main",
      "lake-main",
      "pack-animal-a",
      "pack-animal-b",
      "player",
      "spawn-main",
      "spawn-pack-animal-a",
      "spawn-pack-animal-b",
      "terrain-main",
      "wall-east",
    ]);
    expect(first.value?.nodes.find((node) => node.id === "wall-east")).toMatchObject({
      transform: {
        positionMetersXYZ: [12, 2, 10],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1],
      },
    });
  });

  it("injects the startup spawn anchor only for the controlled Subject", () => {
    const spec = createValidAuthoringSpec();
    spec.nodes = spec.nodes.map((node) => {
      if (node.kind !== "subject") return node;
      const { spawnAnchorEntityId: _removed, ...withoutSpawn } = node;
      return withoutSpawn;
    });

    const result = normalizeAuthoringSpec(spec);

    expect(result.ok).toBe(true);
    expect(result.value?.nodes.find((node) => node.id === "player")).toMatchObject({
      kind: "subject",
      spawnAnchorEntityId: "spawn-main",
    });
  });

  it("rejects a non-controlled Subject without a spawn anchor", () => {
    const spec = createValidPackageSubjectWorld();
    spec.nodes = spec.nodes.map((node) => {
      if (node.id !== "pack-animal-a" || node.kind !== "subject") return node;
      const { spawnAnchorEntityId: _removed, ...withoutSpawn } = node;
      return withoutSpawn;
    });

    expect(normalizeAuthoringSpec(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_SUBJECT_SPAWN_REQUIRED",
        instancePath: "/nodes/8/spawnAnchorEntityId",
      }),
    );
  });

  it("rejects duplicate world entity IDs", () => {
    const spec = createValidAuthoringSpec();
    spec.nodes = [...spec.nodes, structuredClone(spec.nodes[0]!)];

    expect(normalizeAuthoringSpec(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_DUPLICATE_ID",
        instancePath: "/nodes/6/id",
      }),
    );
  });

  it("rejects dangling exact package Prototype refs", () => {
    const spec = createValidAuthoringSpec();
    spec.nodes = spec.nodes.map((node) =>
      node.kind === "object"
        ? { ...node, prototypeRef: "package://prototype/missing@1" }
        : node,
    );

    expect(normalizeAuthoringSpec(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_REFERENCE_NOT_FOUND",
        instancePath: "/nodes/2/prototypeRef",
      }),
    );
  });

  it("rejects unsupported Relationships and Rules instead of dropping them", () => {
    const spec = createValidAuthoringSpec();
    spec.relationships = [{ id: "unsupported", type: "mountedOn", schemaVersion: 1 }];
    spec.rules = [{ id: "unsupported-rule", kind: "combat" }];

    expect(normalizeAuthoringSpec(spec).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "AUTHORING_FEATURE_NOT_SUPPORTED",
          instancePath: "/relationships/0",
        }),
        expect.objectContaining({
          code: "AUTHORING_FEATURE_NOT_SUPPORTED",
          instancePath: "/rules/0",
        }),
      ]),
    );
  });

  it("requires startup and camera references to resolve to declared node roles", () => {
    const spec = createValidAuthoringSpec();
    spec.startup = { ...spec.startup, cameraEntityId: "terrain-main" };

    expect(normalizeAuthoringSpec(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_REFERENCE_KIND_MISMATCH",
        instancePath: "/startup/cameraEntityId",
      }),
    );
  });

  it("rejects startup spawn anchors outside the terrain grid", () => {
    const spec = createValidAuthoringSpec();
    spec.nodes = spec.nodes.map((node) =>
      node.id === "spawn-main" && node.kind === "anchor"
        ? {
            ...node,
            placement: {
              kind: "fixed" as const,
              transform: { positionMetersXYZ: [1_000, 0, 1_000] as const },
            },
          }
        : node,
    );

    expect(normalizeAuthoringSpec(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_SPAWN_OUT_OF_BOUNDS",
        instancePath: "/nodes/3/placement/transform/positionMetersXYZ",
      }),
    );
  });
});
