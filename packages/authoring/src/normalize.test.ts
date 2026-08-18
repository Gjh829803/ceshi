import { describe, expect, it } from "vitest";

import { normalizeAuthoringSpec } from "./index";
import { createValidAuthoringSpec } from "./test-fixture";

describe("normalizeAuthoringSpec", () => {
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
