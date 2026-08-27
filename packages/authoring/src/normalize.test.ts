import { describe, expect, it } from "vitest";

import { normalizeAuthoringSpecV4 } from "./index";
import {
  createValidAuthoringSpec,
  createValidMountedOnAuthoringSpec,
  createValidPackageSubjectWorld,
} from "./test-fixture";

describe("normalizeAuthoringSpecV4", () => {
  it("produces byte-stable normalized ordering and transform defaults", () => {
    const ordered = createValidPackageSubjectWorld();
    const shuffled = createValidPackageSubjectWorld();
    shuffled.nodes = [...shuffled.nodes].reverse();
    shuffled.resources = {
      prototypes: [...shuffled.resources.prototypes].reverse(),
      subjectDefinitions: [...shuffled.resources.subjectDefinitions].reverse(),
    };

    const first = normalizeAuthoringSpecV4(shuffled);
    const second = normalizeAuthoringSpecV4(ordered);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.value?.authoringSpecHash).not.toBe(second.value?.authoringSpecHash);
    expect(first.normalizedWorldIrHash).not.toBe(second.normalizedWorldIrHash);
    expect(first.normalizedWorldIrHash).toMatch(/^sha256:[a-f0-9]{64}$/);
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
    expect(first.value?.nodes.map((node) => node.id)).toEqual(
      second.value?.nodes.map((node) => node.id),
    );
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

    const result = normalizeAuthoringSpecV4(spec);

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

    expect(normalizeAuthoringSpecV4(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_SUBJECT_SPAWN_REQUIRED",
        instancePath: "/nodes/8/spawnAnchorEntityId",
      }),
    );
  });

  it("rejects duplicate world entity IDs", () => {
    const spec = createValidAuthoringSpec();
    spec.nodes = [...spec.nodes, structuredClone(spec.nodes[0]!)];

    expect(normalizeAuthoringSpecV4(spec).diagnostics).toContainEqual(
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

    expect(normalizeAuthoringSpecV4(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_REFERENCE_NOT_FOUND",
        instancePath: "/nodes/2/prototypeRef",
      }),
    );
  });

  it("normalizes the closed mountedOn relationship and still rejects Rules", () => {
    const spec = createValidMountedOnAuthoringSpec();
    spec.rules = [{ id: "unsupported-rule", kind: "combat" }];

    const rejectedRule = normalizeAuthoringSpecV4(spec);
    expect(rejectedRule.diagnostics).toContainEqual(expect.objectContaining({
      code: "AUTHORING_FEATURE_NOT_SUPPORTED",
      instancePath: "/rules/0",
    }));

    spec.rules = [];
    const normalized = normalizeAuthoringSpecV4(spec);
    expect(normalized.diagnostics).toEqual([]);
    expect(normalized.value?.relationships).toEqual(spec.relationships);
  });

  it.each([
    ["missing Rider", "riderEntityId", "missing-rider", "AUTHORING_REFERENCE_NOT_FOUND"],
    ["missing Mount", "mountEntityId", "missing-mount", "AUTHORING_REFERENCE_NOT_FOUND"],
    ["same endpoint", "mountEntityId", "pack-animal-a", "AUTHORING_RELATIONSHIP_ENDPOINTS_INVALID"],
    ["missing Mount slot", "mountSlotId", "missing-slot", "AUTHORING_MOUNT_SLOT_NOT_FOUND"],
  ] as const)("rejects mountedOn with %s", (_label, field, value, code) => {
    const spec = createValidMountedOnAuthoringSpec();
    spec.relationships = [{ ...spec.relationships[0]!, [field]: value }];
    expect(normalizeAuthoringSpecV4(spec).diagnostics).toContainEqual(
      expect.objectContaining({ code }),
    );
  });

  it("rejects duplicate Rider/slot occupancy and contradictory possession", () => {
    const duplicated = createValidMountedOnAuthoringSpec();
    duplicated.relationships = [
      ...duplicated.relationships,
      { ...duplicated.relationships[0]!, id: "second-mounted-on" },
    ];
    const duplicateDiagnostics = normalizeAuthoringSpecV4(duplicated).diagnostics;
    expect(duplicateDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "AUTHORING_MOUNTED_ON_RIDER_OCCUPIED" }),
      expect.objectContaining({ code: "AUTHORING_MOUNT_SLOT_OCCUPIED" }),
    ]));

    const contradictory = createValidMountedOnAuthoringSpec();
    contradictory.startup = {
      ...contradictory.startup,
      spawnAnchorEntityId: "spawn-pack-animal-a",
      controlledEntityId: "pack-animal-a",
    };
    contradictory.nodes = contradictory.nodes.map((node) =>
      node.kind === "camera" && node.id === contradictory.startup.cameraEntityId
        ? {
            ...node,
            components: {
              cameraRig: {
                ...node.components.cameraRig,
                target: { targetEntityId: "pack-animal-a" },
              },
            },
          }
        : node,
    );
    expect(normalizeAuthoringSpecV4(contradictory).diagnostics).toContainEqual(
      expect.objectContaining({ code: "AUTHORING_MOUNTED_ON_POSSESSION_MISMATCH" }),
    );
  });

  it("rejects missing profile Sockets and reserved Relationship capabilities", () => {
    const missingRiderSocket = createValidMountedOnAuthoringSpec();
    const definition = missingRiderSocket.resources.subjectDefinitions[0]!;
    definition.sockets = definition.sockets.filter(({ id }) => id !== "FootAlignment");
    expect(normalizeAuthoringSpecV4(missingRiderSocket).diagnostics).toContainEqual(
      expect.objectContaining({ code: "AUTHORING_RELATIONSHIP_PROFILE_UNSATISFIED" }),
    );

    const reserved = createValidMountedOnAuthoringSpec();
    reserved.resources.subjectDefinitions[0]!.relationshipCapabilityRefs = [
      "worldkit://capability/relationship.seat@1",
    ];
    expect(normalizeAuthoringSpecV4(reserved).diagnostics).toContainEqual(
      expect.objectContaining({ code: "SUBJECT_CAPABILITY_UNSATISFIED" }),
    );
  });

  it("requires startup and camera references to resolve to declared node roles", () => {
    const spec = createValidAuthoringSpec();
    spec.startup = { ...spec.startup, cameraEntityId: "terrain-main" };

    expect(normalizeAuthoringSpecV4(spec).diagnostics).toContainEqual(
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

    expect(normalizeAuthoringSpecV4(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_SPAWN_OUT_OF_BOUNDS",
        instancePath: "/nodes/3/placement/transform/positionMetersXYZ",
      }),
    );
  });
});
