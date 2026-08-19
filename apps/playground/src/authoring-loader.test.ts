import { describe, expect, it } from "vitest";

import { createValidPackageSubjectWorldV2 } from "../../../packages/authoring/src/test-fixture";
import type { WorldkitBrowserApiV3 } from "@whitebox-world/runtime-contracts";
import { WORLDKIT_BROWSER_PROTOCOL_VERSION } from "@whitebox-world/runtime-contracts";

import { featureInspections } from "./babylon-world-adapter";
import { loadAuthoringScene } from "./authoring-loader";

describe("loadAuthoringScene", () => {
  it("runs strict Authoring V2 JSON through normalize and Compiler V3", async () => {
    const loaded = await loadAuthoringScene(async () =>
      new Response(JSON.stringify(createValidPackageSubjectWorldV2()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    expect(loaded).toMatchObject({
      ok: true,
      diagnostics: [],
      executionPlan: {
        schemaVersion: 3,
        runtimeBackend: "babylon-havok",
        id: "basic-world",
        subjects: [
          expect.objectContaining({
            entityId: "pack-animal-a",
            subjectDefinitionRef:
              "package://subject-definition/coastal-pack-animal@1",
          }),
          expect.objectContaining({ entityId: "pack-animal-b" }),
          expect.objectContaining({ entityId: "player" }),
        ],
      },
    });
    expect(loaded.normalizedWorldIrHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(loaded.executionPlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("produces one runtime Feature inspection per compiled Subject", async () => {
    const loaded = await loadAuthoringScene(async () =>
      new Response(JSON.stringify(createValidPackageSubjectWorldV2())),
    );
    if (!loaded.ok || loaded.executionPlan === undefined) {
      throw new Error("Fixture did not load.");
    }

    expect(
      featureInspections(loaded.executionPlan)
        .filter((feature) => feature.type.startsWith("runtime.subject-"))
        .map((feature) => feature.id),
    ).toEqual(["pack-animal-a", "pack-animal-b", "player"]);
    expect(
      featureInspections(loaded.executionPlan).find(
        (feature) => feature.id === "pack-animal-a",
      )?.parameters,
    ).toMatchObject({
      subjectDefinitionRef:
        "package://subject-definition/coastal-pack-animal@1",
      subjectDefinitionHash: expect.stringMatching(/^sha256:/),
    });
  });

  it("defines Browser Protocol V3 with explicit control binding", () => {
    const fail = (): never => {
      throw new Error("not invoked");
    };
    const api: WorldkitBrowserApiV3 = {
      version: WORLDKIT_BROWSER_PROTOCOL_VERSION,
      ready: async () => fail(),
      getSnapshot: fail,
      getDiagnostics: () => [],
      bindControl: fail,
      runFixedInput: async () => fail(),
      captureScreenshot: fail,
      reset: fail,
      setPaused: fail,
    };

    expect(api.version).toBe(3);
    expect(api.bindControl).toBeTypeOf("function");
  });

  it("returns machine-readable diagnostics for invalid authoring input", async () => {
    const loaded = await loadAuthoringScene(async () => new Response('{"kind":"bad"}'));

    expect(loaded.ok).toBe(false);
    expect(loaded.executionPlan).toBeUndefined();
    expect(loaded.diagnostics[0]).toMatchObject({ code: "AUTHORING_SCHEMA_INVALID" });
  });

  it("does not parse an unsuccessful source response", async () => {
    const loaded = await loadAuthoringScene(async () =>
      new Response("not configured", { status: 404 }),
    );

    expect(loaded).toMatchObject({
      ok: false,
      diagnostics: [{ code: "AUTHORING_SOURCE_UNAVAILABLE", instancePath: "" }],
    });
  });
});
