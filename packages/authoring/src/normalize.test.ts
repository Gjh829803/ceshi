import { describe, expect, it } from "vitest";
import {
  builtInSubjectDefinitionRegistry,
  createSubjectDefinitionRegistry,
} from "@whitebox-world/subject-registry";

import { normalizeAuthoringSpec } from "./index";
import { createValidAuthoringSpec } from "./test-fixture";

describe("normalizeAuthoringSpec", () => {
  it("normalizes multiple registered subjects with explicit spawn anchors", () => {
    const spec = createValidAuthoringSpec();
    spec.nodes = [
      ...spec.nodes,
      {
        id: "spawn-animal",
        kind: "anchor",
        transform: { positionMeters: [6, 0, 28] },
        semantic: { classId: "spawn.subject" },
      },
      {
        id: "animal",
        kind: "subject",
        kitRef: "worldkit://kit/quadruped.ground-proxy@1",
        spawnAnchorEntityId: "spawn-animal",
      },
    ];

    const result = normalizeAuthoringSpec(spec);

    expect(result.ok).toBe(true);
    expect(result.value?.nodes.filter((node) => node.kind === "subject")).toEqual([
      expect.objectContaining({ id: "animal", spawnAnchorEntityId: "spawn-animal" }),
      expect.objectContaining({ id: "player", spawnAnchorEntityId: "spawn-main" }),
    ]);
    expect(result.value?.resources.subjectDefinitions.map((definition) => definition.kitRef)).toEqual([
      "worldkit://kit/humanoid.third-person@1",
      "worldkit://kit/quadruped.ground-proxy@1",
    ]);
  });

  it("rejects an additional subject without a spawn anchor", () => {
    const spec = createValidAuthoringSpec();
    spec.nodes = [
      ...spec.nodes,
      {
        id: "animal",
        kind: "subject",
        kitRef: "worldkit://kit/quadruped.ground-proxy@1",
      },
    ];

    expect(normalizeAuthoringSpec(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_SUBJECT_SPAWN_REQUIRED",
        instancePath: "/nodes/6/spawnAnchorEntityId",
      }),
    );
  });

  it("reports the registered Kit references when a subject Kit is unknown", () => {
    const spec = createValidAuthoringSpec();
    const player = spec.nodes.find((node) => node.kind === "subject");
    if (player === undefined || player.kind !== "subject") throw new Error("fixture subject missing");
    player.kitRef = "worldkit://kit/unknown@1";

    expect(normalizeAuthoringSpec(spec).diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_RESOURCE_NOT_SUPPORTED",
        instancePath: "/nodes/4/kitRef",
        details: {
          supportedKitRefs: [
            "worldkit://kit/humanoid.third-person@1",
            "worldkit://kit/quadruped.ground-proxy@1",
          ],
        },
      }),
    );
  });

  it("uses an injected registry and materializes its resolved definition into IR", () => {
    const definition = structuredClone(builtInSubjectDefinitionRegistry.list()[0]!);
    definition.id = "robot.ground-proxy";
    definition.kitRef = "package://kit/robot.ground-proxy@1";
    definition.category = "machine";
    definition.bodyTopology = "robot-biped";
    const registry = createSubjectDefinitionRegistry([definition]);
    const spec = createValidAuthoringSpec();
    const player = spec.nodes.find((node) => node.kind === "subject");
    if (player === undefined || player.kind !== "subject") throw new Error("fixture subject missing");
    player.kitRef = definition.kitRef;

    const result = normalizeAuthoringSpec(spec, { subjectDefinitionRegistry: registry });

    expect(result.ok).toBe(true);
    expect(result.value?.resources.subjectDefinitions).toEqual([
      expect.objectContaining({
        id: "robot.ground-proxy",
        kitRef: "package://kit/robot.ground-proxy@1",
      }),
    ]);
  });

  it("produces byte-stable ordering and hashes independent of input collection order", () => {
    const ordered = createValidAuthoringSpec();
    const shuffled = createValidAuthoringSpec();
    shuffled.nodes = [...shuffled.nodes].reverse();
    shuffled.resources.prototypes = [...shuffled.resources.prototypes].reverse();

    const first = normalizeAuthoringSpec(shuffled);
    const second = normalizeAuthoringSpec(ordered);

    expect(first.ok).toBe(true);
    expect(first.value).toEqual(second.value);
    expect(first.normalizedWorldIrHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.normalizedWorldIrHash).toBe(second.normalizedWorldIrHash);
    expect(first.value?.nodes.map((node) => node.id)).toEqual([
      "camera-main",
      "lake-main",
      "player",
      "spawn-main",
      "terrain-main",
      "wall-east",
    ]);
  });

  it("rejects duplicate world entity IDs", () => {
    const spec = createValidAuthoringSpec();
    spec.nodes = [...spec.nodes, structuredClone(spec.nodes[0])!];

    const result = normalizeAuthoringSpec(spec);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "AUTHORING_ID_DUPLICATE", instancePath: "/nodes/6/id" }),
    );
  });

  it("rejects dangling package prototype references", () => {
    const spec = createValidAuthoringSpec();
    const object = spec.nodes.find((node) => node.kind === "object");
    if (object === undefined || object.kind !== "object") throw new Error("fixture object missing");
    object.prototypeRef = "package://prototype/missing";

    const result = normalizeAuthoringSpec(spec);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_REFERENCE_NOT_FOUND",
        instancePath: "/nodes/2/prototypeRef",
      }),
    );
  });

  it("rejects unsupported V1 relationships instead of ignoring them", () => {
    const spec = createValidAuthoringSpec();
    spec.relationships = [{ id: "unsupported", type: "mountedOn", schemaVersion: 1 }];

    const result = normalizeAuthoringSpec(spec);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_FEATURE_NOT_SUPPORTED",
        instancePath: "/relationships/0",
      }),
    );
  });

  it("requires startup references to resolve to the declared node roles", () => {
    const spec = createValidAuthoringSpec();
    spec.startup.cameraEntityId = "terrain-main";

    const result = normalizeAuthoringSpec(spec);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_REFERENCE_KIND_MISMATCH",
        instancePath: "/startup/cameraEntityId",
      }),
    );
  });

  it("rejects spawn anchors outside the terrain grid", () => {
    const spec = createValidAuthoringSpec();
    const anchor = spec.nodes.find((node) => node.kind === "anchor");
    if (anchor === undefined || anchor.kind !== "anchor") throw new Error("fixture anchor missing");
    anchor.transform.positionMeters = [1_000, 0, 1_000];

    const result = normalizeAuthoringSpec(spec);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "AUTHORING_SPAWN_OUT_OF_BOUNDS",
        instancePath: "/nodes/3/transform/positionMeters",
      }),
    );
  });
});
