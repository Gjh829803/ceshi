import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  createValidAuthoringSpec,
  createValidPackageSubjectWorld,
} from "../../../packages/authoring/src/test-fixture";
import type { WorldkitBrowserApiV3 } from "@whitebox-world/runtime-contracts";
import { WORLDKIT_BROWSER_PROTOCOL_VERSION } from "@whitebox-world/runtime-contracts";

import {
  PhysicalKeyboardActionTracker,
  activeActionForControlledSubject,
  featureInspections,
  mapPlaygroundInputActions,
} from "./babylon-world-adapter";
import { loadAuthoringScene } from "./authoring-loader";

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    for (const nestedValue of Object.values(value)) deepFreeze(nestedValue);
    Object.freeze(value);
  }
  return value;
}

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
      [-3, -0.976004939803828, 30],
      [3, -0.9764188420353316, 30],
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
    tracker.press("ShiftLeft");
    tracker.press("Space");
    tracker.press("ControlLeft");
    tracker.press("AltLeft");
    tracker.press("KeyF");
    tracker.press("KeyC");
    expect(
      tracker.actions("worldkit://motion-kernel/wheeled-arcade@1"),
    ).toEqual(["boost", "brake", "handbrake", "aim", "camera-look-back"]);
    tracker.clear();
    tracker.press("Space");
    expect(
      tracker.actions("worldkit://motion-kernel/unpowered-glide@1"),
    ).toEqual(["primary-action"]);
    tracker.clear();
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
    expect(loaded).not.toHaveProperty("hostOverlay");
  });

  it("previews water and air packages without claiming their reserved relationships run", async () => {
    const mutableSource = createValidAuthoringSpec();
    const sourceSnapshot = structuredClone(mutableSource);
    const source = deepFreeze(mutableSource);
    const waterLoaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(source)),
      {
        subjectDefinitionRef:
          "worldkit://subject-definition/watercraft.kayak.surface@1",
      },
    );
    const airLoaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(source)),
      {
        subjectDefinitionRef:
          "worldkit://subject-definition/glider.paraglider.unpowered@1",
      },
    );

    expect(waterLoaded).toMatchObject({
      ok: true,
      diagnostics: [],
      executionPlan: {
        subjects: [expect.objectContaining({
          subjectDefinitionRef:
            "worldkit://subject-definition/playground-preview.watercraft.kayak.surface@1",
          capabilityAssembly: expect.objectContaining({
            relationshipProfiles: [],
            motionKernels: [expect.objectContaining({
              resourceRef: "worldkit://motion-kernel/free-ground@1",
            })],
          }),
        })],
      },
      hostOverlay: {
        schemaVersion: 1,
        kind: "capability-demo",
        id: "capability-demo",
        subjectDefinitionRef:
          "worldkit://subject-definition/watercraft.kayak.surface@1",
        changes: [
          {
            type: "subject-definition-replaced",
            subjectEntityId: "player",
            beforeSubjectDefinitionRef:
              "worldkit://subject-definition/humanoid.third-person@1",
            afterSubjectDefinitionRef:
              "worldkit://subject-definition/playground-preview.watercraft.kayak.surface@1",
          },
          {
            type: "relationship-capabilities-deferred",
            sourceSubjectDefinitionRef:
              "worldkit://subject-definition/watercraft.kayak.surface@1",
            runtimeSubjectDefinitionRef:
              "worldkit://subject-definition/playground-preview.watercraft.kayak.surface@1",
            deferredCapabilityRefs: [
              "worldkit://capability/relationship.seat@1",
            ],
          },
        ],
      },
    });
    expect(airLoaded).toMatchObject({
      ok: true,
      diagnostics: [],
      executionPlan: {
        subjects: [expect.objectContaining({
          subjectDefinitionRef:
            "worldkit://subject-definition/playground-preview.glider.paraglider.unpowered@1",
          capabilityAssembly: expect.objectContaining({
            relationshipProfiles: [],
            motionKernels: expect.arrayContaining([expect.objectContaining({
              resourceRef: "worldkit://motion-kernel/free-ground@1",
            })]),
          }),
        })],
      },
      hostOverlay: {
        schemaVersion: 1,
        kind: "capability-demo",
        id: "capability-demo",
        subjectDefinitionRef:
          "worldkit://subject-definition/glider.paraglider.unpowered@1",
        changes: [
          {
            type: "subject-definition-replaced",
            subjectEntityId: "player",
            beforeSubjectDefinitionRef:
              "worldkit://subject-definition/humanoid.third-person@1",
            afterSubjectDefinitionRef:
              "worldkit://subject-definition/playground-preview.glider.paraglider.unpowered@1",
          },
          {
            type: "relationship-capabilities-deferred",
            sourceSubjectDefinitionRef:
              "worldkit://subject-definition/glider.paraglider.unpowered@1",
            runtimeSubjectDefinitionRef:
              "worldkit://subject-definition/playground-preview.glider.paraglider.unpowered@1",
            deferredCapabilityRefs: [
              "worldkit://capability/relationship.tether@1",
            ],
          },
        ],
      },
    });
    expect(source).toEqual(sourceSnapshot);
    expect(Object.isFrozen(source)).toBe(true);
    expect(Object.isFrozen(source.nodes)).toBe(true);
    expect(Object.isFrozen(source.nodes[3])).toBe(true);
    expect(Object.isFrozen(waterLoaded.hostOverlay)).toBe(true);
    expect(Object.isFrozen(waterLoaded.hostOverlay?.changes)).toBe(true);
    expect(Object.isFrozen(waterLoaded.hostOverlay?.changes[0])).toBe(true);
    expect(Object.isFrozen(waterLoaded.hostOverlay?.changes[1])).toBe(true);
    expect(
      Object.isFrozen(
        waterLoaded.hostOverlay?.changes[1]?.type ===
          "relationship-capabilities-deferred"
          ? waterLoaded.hostOverlay.changes[1].deferredCapabilityRefs
          : undefined,
      ),
    ).toBe(true);
  });

  it("loads the exact quadruped public-default version with its tuned motion and camera profiles", async () => {
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(createValidAuthoringSpec())),
      {
        subjectDefinitionRef:
          "worldkit://subject-definition/animal.quadruped.forward-steer@2",
      },
    );

    expect(loaded).toMatchObject({
      ok: true,
      diagnostics: [],
      executionPlan: {
        subjects: [expect.objectContaining({
          subjectDefinitionRef:
            "worldkit://subject-definition/playground-preview.animal.quadruped.forward-steer@2",
          controlFeel: expect.objectContaining({
            resourceRef:
              "worldkit://control-feel-profile/subject.animal.quadruped.forward-steer.default@1",
            turnRateRadiansPerSecond: 2.4,
            jumpSpeedMetersPerSecond: 3.1,
          }),
          capabilityAssembly: expect.objectContaining({
            defaultMotionProfile: expect.objectContaining({
              resourceRef:
                "worldkit://motion-profile/free-ground.humanoid-medium@1",
            }),
            cameraContext: expect.objectContaining({
              resourceRef:
                "worldkit://camera-context/capability-driven.quadruped-official@1",
              defaultCameraRigProfileRef:
                "worldkit://camera-profile/orbit.quadruped-official@1",
              cameraRigProfiles: expect.arrayContaining([
                expect.objectContaining({
                  resourceRef:
                    "worldkit://camera-profile/orbit.quadruped-official@1",
                  parameters: expect.objectContaining({
                    targetHeightMeters: 1.35,
                    collisionRetractionMetersPerSecond: 4.5,
                    collisionRecoveryMetersPerSecond: 3.25,
                  }),
                }),
              ]),
            }),
          }),
        })],
      },
      hostOverlay: expect.objectContaining({
        subjectDefinitionRef:
          "worldkit://subject-definition/animal.quadruped.forward-steer@2",
      }),
    });
  });

  it("gives the capability Playground enough explicit budget for the locked G Bot asset", async () => {
    const source = createValidAuthoringSpec();
    source.world.resourceBudget = {
      maxVertices: 20_000,
      maxTriangles: 30_000,
      maxColliders: 16,
    };
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(source)),
      {
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@1",
      },
    );

    expect(loaded).toMatchObject({
      ok: true,
      diagnostics: [],
      executionPlan: {
        subjects: [
          expect.objectContaining({
            subjectDefinitionRef:
              "worldkit://subject-definition/humanoid.g-bot@1",
          }),
        ],
      },
      hostOverlay: {
        schemaVersion: 1,
        kind: "capability-demo",
        id: "capability-demo",
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@1",
        changes: [
          {
            type: "subject-definition-replaced",
            subjectEntityId: "player",
            beforeSubjectDefinitionRef:
              "worldkit://subject-definition/humanoid.third-person@1",
            afterSubjectDefinitionRef:
              "worldkit://subject-definition/humanoid.g-bot@1",
          },
          {
            type: "resource-budget-changed",
            beforeResourceBudget: {
              maxVertices: 20_000,
              maxTriangles: 30_000,
              maxColliders: 16,
            },
            afterResourceBudget: {
              maxVertices: 200_000,
              maxTriangles: 300_000,
              maxColliders: 128,
            },
          },
        ],
      },
    });
    expect(loaded.executionPlan?.resourceUsage.triangles).toBeGreaterThan(30_000);
    expect(Object.isFrozen(loaded.hostOverlay)).toBe(true);
    expect(Object.isFrozen(loaded.hostOverlay?.changes)).toBe(true);
    expect(
      Object.isFrozen(
        loaded.hostOverlay?.changes[1]?.type === "resource-budget-changed"
          ? loaded.hostOverlay.changes[1].beforeResourceBudget
          : undefined,
      ),
    ).toBe(true);
  });

  it("retains an immutable overlay only on an overlaid compile failure", async () => {
    const source = createValidAuthoringSpec();
    const staticBlocker = source.nodes.find((node) => node.kind === "object");
    const spawn = source.nodes.find(
      (node) => node.kind === "anchor" && node.id === "spawn-main",
    );
    if (
      staticBlocker?.kind !== "object" ||
      staticBlocker.placement.kind !== "fixed" ||
      spawn?.kind !== "anchor" ||
      spawn.placement.kind !== "fixed"
    ) {
      throw new Error("Compile-failure overlay fixture is incomplete.");
    }
    staticBlocker.placement.transform.positionMetersXYZ = [0, 2, 30];
    spawn.placement.transform.positionMetersXYZ = [0, 0, 30];
    const sourceText = JSON.stringify(source);

    const overlaid = await loadAuthoringScene(
      async () => new Response(sourceText),
      {
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@1",
      },
    );
    const unmodified = await loadAuthoringScene(
      async () => new Response(sourceText),
    );

    for (const loaded of [overlaid, unmodified]) {
      expect(loaded).toMatchObject({
        ok: false,
        diagnostics: [expect.objectContaining({
          code: "COMPILER_SPAWN_INSIDE_STATIC_BLOCKER",
          instancePath: "/nodes/player/spawnAnchorEntityId",
          details: {
            subjectEntityId: "player",
            objectEntityId: "wall-east",
          },
        })],
      });
      expect(loaded.executionPlan).toBeUndefined();
    }
    expect(overlaid.hostOverlay).toEqual({
      schemaVersion: 1,
      kind: "capability-demo",
      id: "capability-demo",
      subjectDefinitionRef:
        "worldkit://subject-definition/humanoid.g-bot@1",
      changes: [{
        type: "subject-definition-replaced",
        subjectEntityId: "player",
        beforeSubjectDefinitionRef:
          "worldkit://subject-definition/humanoid.third-person@1",
        afterSubjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@1",
      }],
    });
    expect(Object.isFrozen(overlaid.hostOverlay)).toBe(true);
    expect(Object.isFrozen(overlaid.hostOverlay?.changes)).toBe(true);
    expect(Object.isFrozen(overlaid.hostOverlay?.changes[0])).toBe(true);
    expect(unmodified).not.toHaveProperty("hostOverlay");
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
      getControlCaptureCapabilities: fail,
      waitForSimulationTick: async () => fail(),
      waitForRenderReady: async () => fail(),
      captureControlFrame: async () => fail(),
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

  it("returns the canonical startup command when Authoring mode has no configured source", async () => {
    const loaded = await loadAuthoringScene(async () =>
      new Response(JSON.stringify({
        diagnostics: [{
          severity: "error",
          code: "AUTHORING_SOURCE_NOT_CONFIGURED",
          instancePath: "",
          message: "WORLDKIT_AUTHORING_SPEC_PATH is not configured for this server.",
        }],
      }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    expect(loaded).toMatchObject({
      ok: false,
      diagnostics: [{
        code: "AUTHORING_SOURCE_UNAVAILABLE",
        instancePath: "",
        message: expect.stringContaining(
          "pnpm worldkit run <world.json>",
        ),
        details: {
          status: 404,
          sourceDiagnosticCode: "AUTHORING_SOURCE_NOT_CONFIGURED",
        },
      }],
    });
  });
});
