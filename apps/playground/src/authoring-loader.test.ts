import { describe, expect, it } from "vitest";

import { createValidAuthoringSpec } from "../../../packages/authoring/src/test-fixture";
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
      executionPlan: { runtimeBackend: "babylon-havok", id: "basic-world" },
    });
    expect(loaded.normalizedWorldIrHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(loaded.executionPlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
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
