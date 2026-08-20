import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createValidPackageSubjectWorld } from "../../../packages/authoring/src/test-fixture";
import type { WorldkitBrowserApiV3 } from "@whitebox-world/runtime-contracts";
import { WORLDKIT_BROWSER_PROTOCOL_VERSION } from "@whitebox-world/runtime-contracts";

import {
  PhysicalKeyboardActionTracker,
  activeActionForControlledSubject,
  featureInspections,
  mapPlaygroundInputActions,
} from "./babylon-world-adapter";
import { loadAuthoringScene } from "./authoring-loader";

describe("loadAuthoringScene", () => {
  it("keeps the rigged canonical world ref-only with two stable non-overlapping instances", async () => {
    const inputPath = fileURLToPath(
      new URL("../../../examples/authoring/rigged-subject-world.json", import.meta.url),
    );
    const source = JSON.parse(await readFile(inputPath, "utf8")) as {
      resources: { subjectDefinitions: unknown[] };
      nodes: Array<Record<string, unknown>>;
      startup: {
        controlledEntityId: string;
        spawnAnchorEntityId: string;
        cameraEntityId: string;
      };
    };
    const subjects = source.nodes.filter((node) => node.kind === "subject");
    const anchors = source.nodes.filter((node) => node.kind === "anchor");
    const camera = source.nodes.find((node) => node.kind === "camera") as {
      id: string;
      components: { cameraRig: { target: { targetEntityId: string } } };
    };

    expect(source.resources.subjectDefinitions).toEqual([]);
    expect(subjects).toHaveLength(2);
    for (const subject of subjects) {
      expect(Object.keys(subject).sort()).toEqual([
        "id",
        "kind",
        "spawnAnchorEntityId",
        "subjectDefinitionRef",
      ]);
      expect(subject.subjectDefinitionRef).toBe(
        "worldkit://subject-definition/humanoid.rigged-golden@1",
      );
    }
    expect(anchors.map((anchor) => anchor.id)).toEqual([
      "spawn-rigged-primary",
      "spawn-rigged-secondary",
    ]);
    expect(
      anchors.map((anchor) =>
        (anchor.placement as {
          kind: "fixed";
          transform: { positionMetersXYZ: readonly number[] };
        }).transform.positionMetersXYZ,
      ),
    ).toEqual([
      [-3, 0, 30],
      [3, 0, 30],
    ]);
    expect(source.startup).toEqual({
      controlledEntityId: "rigged-primary",
      spawnAnchorEntityId: "spawn-rigged-primary",
      cameraEntityId: "camera-main",
    });
    expect(camera.components.cameraRig.target.targetEntityId).toBe("rigged-primary");
    const subjectBoundaryJson = JSON.stringify({
      subjects,
      subjectDefinitions: source.resources.subjectDefinitions,
    });
    for (const forbiddenField of [
      "subjectAssetRef",
      "rigProfileRef",
      "animationSetRef",
      "colliderProfileRef",
      "boneId",
      "sourceClipName",
      "artifact",
    ]) {
      expect(subjectBoundaryJson).not.toContain(forbiddenField);
    }
  });

  it("tracks physical Shift keys and maps legacy run without deriving HUD Action from velocity", () => {
    const tracker = new PhysicalKeyboardActionTracker();
    tracker.press("ShiftLeft");
    tracker.press("ShiftRight");
    tracker.release("ShiftLeft");
    expect(tracker.actions()).toEqual(["run"]);
    tracker.clear();
    expect(tracker.actions()).toEqual([]);
    expect(mapPlaygroundInputActions(["forward", "run"])).toEqual([
      "move-forward",
      "run",
    ]);

    const snapshot = {
      kind: "worldkit-runtime-snapshot",
      schemaVersion: 3,
      runtimeBackend: "babylon-havok",
      tick: 1,
      ready: true,
      controlledEntityId: "player",
      controllersById: {},
      subjectStatesByEntityId: {
        player: {
          entityId: "player",
          subjectDefinitionRef: "worldkit://subject-definition/humanoid.rigged-golden@1",
          subjectDefinitionHash: `sha256:${"1".repeat(64)}`,
          positionMetersXYZ: [0, 0, 0],
          velocityMetersPerSecondXYZ: [0, 0, 0],
          movementMedium: "ground",
          activeActionId: "run",
        },
      },
      camera: {
        entityId: "camera-main",
        targetEntityId: "player",
        positionMetersXYZ: [0, 4, 6],
      },
      physics: { backend: "havok", ready: true, fixedTimeStepSeconds: 1 / 60 },
      resources: { meshes: 1, bodies: 1, terrainSamples: 9 },
    } as const;
    expect(activeActionForControlledSubject(snapshot)).toBe("run");
  });

  it("runs strict Authoring V3 JSON through NormalizedWorldIR V3 and ExecutionPlan V4", async () => {
    const loaded = await loadAuthoringScene(async () =>
      new Response(JSON.stringify(createValidPackageSubjectWorld()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    expect(loaded).toMatchObject({
      ok: true,
      diagnostics: [],
      executionPlan: {
        schemaVersion: 4,
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
      new Response(JSON.stringify(createValidPackageSubjectWorld())),
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
