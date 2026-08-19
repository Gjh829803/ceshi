import { describe, expect, it } from "vitest";

import { createValidAuthoringSpec } from "../../../packages/authoring/src/test-fixture";
import type { WorldkitBrowserApiV2 } from "./playground-world";
import { featureInspections } from "./babylon-world-adapter";
import { loadAuthoringScene } from "./authoring-loader";

describe("loadAuthoringScene", () => {
  it("runs strict JSON through normalize and compile before exposing an execution plan", async () => {
    const loaded = await loadAuthoringScene(async () =>
      new Response(JSON.stringify(createValidAuthoringSpec()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    expect(loaded).toMatchObject({
      ok: true,
      diagnostics: [],
      executionPlan: {
        schemaVersion: 2,
        runtimeBackend: "babylon-havok",
        id: "basic-world",
        subjects: [expect.objectContaining({ entityId: "player" })],
      },
    });
    expect(loaded.normalizedWorldIrHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(loaded.executionPlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("produces one runtime Feature inspection per compiled subject", async () => {
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
    const loaded = await loadAuthoringScene(async () => new Response(JSON.stringify(spec)));
    if (!loaded.ok || loaded.executionPlan === undefined) throw new Error("Fixture did not load.");

    expect(
      featureInspections(loaded.executionPlan)
        .filter((feature) => feature.type.startsWith("runtime.subject-"))
        .map((feature) => feature.id),
    ).toEqual(["animal", "player"]);
  });

  it("defines Browser Protocol V2 with explicit control binding", () => {
    const fail = (): never => {
      throw new Error("not invoked");
    };
    const api: WorldkitBrowserApiV2 = {
      version: 2,
      ready: async () => fail(),
      getSnapshot: fail,
      getDiagnostics: () => [],
      bindControl: fail,
      runFixedInput: async () => fail(),
      captureScreenshot: fail,
      reset: fail,
      setPaused: fail,
    };

    expect(api.version).toBe(2);
    expect(api.bindControl).toBeTypeOf("function");
  });

  it("returns machine-readable diagnostics for invalid authoring input", async () => {
    const loaded = await loadAuthoringScene(async () => new Response('{"kind":"bad"}'));

    expect(loaded.ok).toBe(false);
    expect(loaded.executionPlan).toBeUndefined();
    expect(loaded.diagnostics[0]).toMatchObject({ code: "AUTHORING_SCHEMA_INVALID" });
  });

  it("does not parse an unsuccessful source response", async () => {
    const loaded = await loadAuthoringScene(async () => new Response("not configured", { status: 404 }));

    expect(loaded).toMatchObject({
      ok: false,
      diagnostics: [{ code: "AUTHORING_SOURCE_UNAVAILABLE", instancePath: "" }],
    });
  });
});
