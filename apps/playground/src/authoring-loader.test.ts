import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  createValidAuthoringSpecV4,
  createValidPackageSubjectWorld,
  createValidPackageSubjectWorldV4,
} from "../../../packages/authoring/src/test-fixture";
import {
  normalizeAuthoringSpecV4,
  sha256CanonicalJson,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { compileWorldV5 } from "@whitebox-world/compiler";
import {
  CONTROL_TRANSITION_CAPABILITY_REF,
  createCoreControlFeatureFactoryV1,
} from "@whitebox-world/gameplay";
import {
  createGameplayBootstrapResourceLockEntryV1,
  createGameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import type { BabylonRuntimeProjectionV1 } from "@whitebox-world/runtime-babylon";
import { isNil, uniq } from "lodash-es";
import {
  canonicalWorldkitBrowserRouteEvidencePublicationV2,
  WORLDKIT_BROWSER_PROTOCOL_VERSION,
  type WorldkitBrowserApiV5,
  type WorldkitBrowserRouteEvidencePublicationV2,
} from "@whitebox-world/runtime-contracts";

import {
  PhysicalKeyboardActionTracker,
  activeActionForControlledSubject,
  featureInspections,
  mapPlaygroundInputActions,
} from "./babylon-world-adapter";
import { loadAuthoringScene, loadStudioAuthoringPreviewV1 } from "./authoring-loader";

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    for (const nestedValue of Object.values(value)) deepFreeze(nestedValue);
    Object.freeze(value);
  }
  return value;
}

const ROUTE_EVIDENCE_HASH = `sha256:${"9".repeat(64)}` as const;
const coreControlManifest = createCoreControlFeatureFactoryV1().manifest;
const goldenAssetBytes = new Uint8Array(await readFile(fileURLToPath(new URL(
  "../public/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
  import.meta.url,
))));
const gBotAssetBytes = new Uint8Array(await readFile(fileURLToPath(new URL(
  "../public/subject-assets/humanoid/g-bot/v2/g-bot.glb",
  import.meta.url,
))));

beforeEach(() => {
  vi.stubGlobal("location", { origin: "https://playground.test" });
  vi.stubGlobal("fetch", (async (input: URL | RequestInfo) => {
    const requestUrl = String(input);
    return {
      ok: true,
      redirected: false,
      url: requestUrl,
      arrayBuffer: async () => goldenAssetBytes.buffer.slice(
        goldenAssetBytes.byteOffset,
        goldenAssetBytes.byteOffset + goldenAssetBytes.byteLength,
      ),
    } as Response;
  }) as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function runtimeGameplayBootstrap(
  normalizedWorldIr: NormalizedWorldIRV4,
) {
  const entityDescriptors = normalizedWorldIr.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => {
      const definition = normalizedWorldIr.resources.subjectDefinitions.find(
        (candidate) =>
          candidate.subjectDefinitionRef === node.subjectDefinitionRef,
      );
      if (isNil(definition)) {
        throw new Error(`Missing Subject Definition '${node.subjectDefinitionRef}'.`);
      }
      return {
        id: node.id,
        entityDefinitionRef: node.subjectDefinitionRef,
        capabilityRefs: definition.capabilityRefs,
      };
    });
  return createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: `${normalizedWorldIr.id}.gameplay`,
    version: 1,
    resourceRef:
      `worldkit://gameplay-bootstrap/${normalizedWorldIr.id}.${normalizedWorldIr.seed}@1`,
    entityDescriptors,
    featureResourceLocks: [{
      resourceRef: coreControlManifest.resourceRef,
      contentHash: coreControlManifest.contentHash,
    }],
    semanticActionDefinitions: [],
    availableCapabilityRefs: uniq([
      ...entityDescriptors.flatMap((descriptor) => descriptor.capabilityRefs),
      CONTROL_TRANSITION_CAPABILITY_REF,
    ]),
  });
}

function gameplayBootstrapResourceLock(
  normalizedWorldIr: NormalizedWorldIRV4,
) {
  return createGameplayBootstrapResourceLockEntryV1(
    runtimeGameplayBootstrap(normalizedWorldIr),
  );
}

function routeAuthoringWorld(): AuthoringSpecV4 {
  const source = createValidAuthoringSpecV4();
  return {
    ...source,
    schemaVersion: 4,
    spatial: {
      ...source.spatial,
      traversalAreas: [],
      routes: [{
        id: "main-route",
        kind: "polyline-xz",
        pointsMetersXZ: [[0, 30], [0, -20]],
        widthMeters: 4,
        locomotionProfileRef:
          "worldkit://locomotion-profile/ground.standard@1",
      }],
    },
    nodes: [
      ...source.nodes,
      {
        id: "goal",
        kind: "anchor",
        placement: {
          kind: "fixed",
          transform: { positionMetersXYZ: [0, 0, -20] },
        },
        semantic: { classId: "route.destination" },
      },
    ],
    constraints: {
      placements: source.constraints.placements,
      connectivity: [{
        id: "player-to-goal",
        kind: "connected-by-route",
        requirement: "required",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn-main",
        destinationAnchorEntityId: "goal",
        routeId: "main-route",
      }],
    },
  };
}

function assetFreeAuthoringWorld(): AuthoringSpecV4 {
  const source = createValidPackageSubjectWorldV4();
  return {
    ...source,
    schemaVersion: 4,
    spatial: {
      ...source.spatial,
      traversalAreas: [],
    },
    nodes: source.nodes.map((node) =>
      node.kind === "subject"
        ? {
            ...node,
            subjectDefinitionRef:
              "package://subject-definition/coastal-pack-animal@1",
          }
        : node,
    ),
    constraints: {
      placements: source.constraints.placements,
      connectivity: [],
    },
  };
}

function matchingRouteEvidencePublication(
  source: AuthoringSpecV4,
): WorldkitBrowserRouteEvidencePublicationV2 {
  const normalized = normalizeAuthoringSpecV4(source);
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined ||
    normalized.layoutSolveReportHash === undefined
  ) {
    throw new Error("Route Authoring fixture did not normalize.");
  }
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrapResourceLock:
      gameplayBootstrapResourceLock(normalized.value),
  });
  if (
    !compiled.ok ||
    compiled.executionPlan === undefined ||
    compiled.executionPlanHash === undefined
  ) {
    throw new Error("Route Authoring fixture did not compile.");
  }
  return canonicalWorldkitBrowserRouteEvidencePublicationV2({
    kind: "worldkit-browser-route-evidence-publication",
    schemaVersion: 2,
    worldPackageRootHash: ROUTE_EVIDENCE_HASH,
    authoringSpecHash: normalized.value.authoringSpecHash,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    executionPlanHash: compiled.executionPlanHash,
    resourceLockHash: compiled.executionPlan.resourceLockHash,
    layoutSolveReportHash: normalized.layoutSolveReportHash,
    validationReportHash: ROUTE_EVIDENCE_HASH,
    routeValidationSetReceiptHash: ROUTE_EVIDENCE_HASH,
    validationProfileRef:
      "worldkit://validation-profile/outdoor-world-package-dev@2",
    validationProfileResolvedVersion: "2.0.0",
    validationProfileHash: ROUTE_EVIDENCE_HASH,
    routes: [],
  });
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("loadAuthoringScene", () => {
  it("loads one Studio authoring Preview bootstrap with its closed implementation map", async () => {
    const authoringSpec = createValidAuthoringSpecV4();
    const worldId = "studio-preview-world";
    const authoringSpecHash = sha256CanonicalJson(authoringSpec);
    const implementationMap = {
      kind: "worldkit-scene-brief-implementation-map" as const,
      schemaVersion: 1 as const,
      sceneId: authoringSpec.id,
      sceneBriefHash: `sha256:${"b".repeat(64)}` as const,
      authoringSpecId: authoringSpec.id,
      authoringSpecHash: authoringSpecHash as `sha256:${string}`,
      visualTargetMappings: [{ visualTargetId: "player-subject", runtimeEntityIds: ["player"] }],
      visualCaptureGroups: [{
        visualTargetId: "player-subject",
        runtimeEntityIds: ["player"],
        role: "primary-subject",
        semanticClassId: "subject.player",
        identityColor: "#E85D5D",
      }],
    };
    const fetchBootstrap = vi.fn(async () => jsonResponse({
      kind: "worldkit-studio-preview-bootstrap",
      schemaVersion: 1,
      worldId,
      sceneId: authoringSpec.id,
      attempt: 2,
      attemptStartedAt: "2026-08-25T09:00:00.000Z",
      authoringSpecHash,
      authoringSpec,
      implementationMap,
    }));

    const preview = await loadStudioAuthoringPreviewV1(worldId, fetchBootstrap);
    expect(fetchBootstrap).toHaveBeenCalledTimes(1);
    expect(preview.loaded.ok).toBe(true);
    expect(preview.attempt).toBe(2);
    expect(preview.visualCaptureGroups).toEqual([{
      visualTargetId: "player-subject",
      runtimeEntityIds: ["player"],
      role: "primary-subject",
      semanticClassId: "subject.player",
      identityColor: "#E85D5D",
    }]);
    implementationMap.visualCaptureGroups[0]!.runtimeEntityIds.push("mutated");
    expect(preview.visualCaptureGroups[0]!.runtimeEntityIds).toEqual(["player"]);
  });

  it("rejects malformed or cross-authority Studio Preview bootstraps", async () => {
    const authoringSpec = createValidAuthoringSpecV4();
    const worldId = "studio-preview-world";
    const authoringSpecHash = sha256CanonicalJson(authoringSpec);
    const validPayload = {
      kind: "worldkit-studio-preview-bootstrap",
      schemaVersion: 1,
      worldId,
      sceneId: authoringSpec.id,
      attempt: 1,
      attemptStartedAt: "2026-08-25T09:00:00.000Z",
      authoringSpecHash,
      authoringSpec,
      implementationMap: {
        kind: "worldkit-scene-brief-implementation-map",
        schemaVersion: 1,
        sceneId: authoringSpec.id,
        sceneBriefHash: `sha256:${"b".repeat(64)}`,
        authoringSpecId: authoringSpec.id,
        authoringSpecHash,
        visualTargetMappings: [{ visualTargetId: "player-subject", runtimeEntityIds: ["player"] }],
        visualCaptureGroups: [{
          visualTargetId: "player-subject",
          runtimeEntityIds: ["player"],
          role: "primary-subject",
          semanticClassId: "subject.player",
          identityColor: "#E85D5D",
        }],
      },
    };
    const invalidPayloads = [
      { ...validPayload, kind: "wrong-kind" },
      { ...validPayload, attempt: 0 },
      { ...validPayload, worldId: "another-world" },
      { ...validPayload, authoringSpecHash: `sha256:${"0".repeat(64)}` },
      {
        ...validPayload,
        implementationMap: {
          ...validPayload.implementationMap,
          visualCaptureGroups: [],
        },
      },
    ];
    for (const payload of invalidPayloads) {
      await expect(loadStudioAuthoringPreviewV1(
        worldId,
        async () => jsonResponse(payload),
      )).rejects.toThrow(/Studio Preview bootstrap/);
    }
    await expect(loadStudioAuthoringPreviewV1(
      worldId,
      async () => jsonResponse({ error: "not ready" }, 409),
    )).rejects.toThrow(/HTTP 409/);
  });

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
        "worldkit://subject-definition/humanoid.rigged-golden@2",
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

  it("tracks physical Shift keys and maps run without deriving HUD Action from velocity", () => {
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

    const snapshot: BabylonRuntimeProjectionV1 = {
      runtimeBackend: "babylon-havok",
      tick: 1,
      ready: true,
      possessionTarget: {
        mode: "possessed",
        controlledEntityId: "player",
      },
      subjectStatesByEntityId: {
        player: {
          entityId: "player",
          subjectDefinitionRef: "worldkit://subject-definition/humanoid.rigged-golden@2",
          subjectDefinitionHash: `sha256:${"1".repeat(64)}`,
          positionMetersXYZ: [0, 0, 0],
          velocityMetersPerSecondXYZ: [0, 0, 0],
          movementMedium: "ground",
          activeActionId: "run",
          forwardXYZ: [0, 0, -1],
          speedMetersPerSecond: 0,
          activeControlFeelProfileRef:
            "worldkit://control-feel-profile/test@1",
          activePhysicsBodyProfileRef:
            "worldkit://physics-body-profile/test@1",
          activeLocomotionProfileRef:
            "worldkit://locomotion-profile/test@1",
          locomotionMode: "run",
          activeMotionProfileRef: "worldkit://motion-profile/test@1",
          activeMotionKernelRef: "worldkit://motion-kernel/free-ground@1",
          motionTags: ["ground"],
          relationshipRole: "none",
          safeFallbackActive: false,
        },
      },
      camera: {
        entityId: "camera-main",
        targetEntityId: "player",
        positionMetersXYZ: [0, 4, 6],
        activeCameraProfileRef: "worldkit://camera-profile/test@1",
        activeCameraRigRef: "worldkit://camera-rig/test@1",
        activeCameraModifierRefs: [],
        safeFallbackActive: false,
        viewYawOffsetRadians: 0,
        viewPitchOffsetRadians: 0,
        viewDistanceOffsetMeters: 0,
      },
      physics: { backend: "havok", ready: true, fixedTimeStepSeconds: 1 / 60 },
      resources: { meshes: 1, bodies: 1, terrainSamples: 9 },
    };
    expect(activeActionForControlledSubject(snapshot)).toBe("run");
  });

  it("rejects obsolete Authoring V3 input before compilation", async () => {
    const obsolete = {
      ...createValidPackageSubjectWorld(),
      schemaVersion: 3,
    };
    const loaded = await loadAuthoringScene(async () =>
      new Response(JSON.stringify(obsolete), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    expect(loaded).toMatchObject({
      ok: false,
      diagnostics: [{
        code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
        instancePath: "/schemaVersion",
        details: { supportedSchemaVersions: [4] },
      }],
    });
    expect(loaded.executionPlan).toBeUndefined();
  });

  it("runs strict Authoring V4 JSON through NormalizedWorldIR V4 and ExecutionPlan V5", async () => {
    const source = routeAuthoringWorld();
    const normalized = normalizeAuthoringSpecV4(source);
    if (!normalized.ok || isNil(normalized.value)) {
      throw new Error("Route Authoring fixture did not normalize.");
    }
    const gameplayBootstrap = runtimeGameplayBootstrap(normalized.value);
    const loaded = await loadAuthoringScene(
      async () => jsonResponse(source),
    );
    const repeated = await loadAuthoringScene(
      async () => jsonResponse(source),
    );

    expect(loaded).toMatchObject({
      ok: true,
      diagnostics: [],
      executionPlan: {
        schemaVersion: 5,
        authoringSpecHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        traversal: {
          connectivityRequirements: [{
            constraintId: "player-to-goal",
            routeId: "main-route",
          }],
        },
      },
    });
    expect(gameplayBootstrap.availableCapabilityRefs).toEqual(uniq(
      [
        ...gameplayBootstrap.entityDescriptors.flatMap(
          (descriptor) => descriptor.capabilityRefs,
        ),
        CONTROL_TRANSITION_CAPABILITY_REF,
      ],
    ));
    if (loaded.executionPlan?.schemaVersion !== 5) {
      throw new Error("Expected an ExecutionPlanV5.");
    }
    expect(loaded.executionPlan.resourceLockEntries).toContainEqual(
      createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap),
    );
    expect(loaded.runtimeWorldConfiguration).toMatchObject({
      executionPlan: loaded.executionPlan,
      executionPlanHash: loaded.executionPlanHash,
      gameplayBootstrap,
      worldPackageRef: "worldkit://world-package/basic-world.1024@1",
      worldPackageBuildReceipt: {
        kind: "worldkit-world-package-build-receipt",
        schemaVersion: 1,
        manifest: {
          authoringSpecHash: normalized.value.authoringSpecHash,
          normalizedWorldIrHash: loaded.normalizedWorldIrHash,
          executionPlanHash: loaded.executionPlanHash,
        },
        worldPackageRootHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
    });
    expect(
      loaded.runtimeWorldConfiguration?.gameplayBootstrap.featureResourceLocks,
    ).toEqual([{
      resourceRef: coreControlManifest.resourceRef,
      contentHash: coreControlManifest.contentHash,
    }]);
    expect(
      loaded.runtimeWorldConfiguration?.gameplayBootstrap.availableCapabilityRefs,
    ).toContain(CONTROL_TRANSITION_CAPABILITY_REF);
    expect(
      loaded.runtimeWorldConfiguration?.executionPlanHash,
    ).toBe(loaded.runtimeWorldConfiguration?.worldPackageBuildReceipt.manifest.executionPlanHash);
    expect(repeated.runtimeWorldConfiguration?.worldPackageRef).toBe(
      loaded.runtimeWorldConfiguration?.worldPackageRef,
    );
    expect(
      repeated.runtimeWorldConfiguration?.worldPackageBuildReceipt.worldPackageRootHash,
    ).toBe(
      loaded.runtimeWorldConfiguration?.worldPackageBuildReceipt.worldPackageRootHash,
    );
    expect(loaded.routeEvidencePublication).toBeUndefined();
  });

  it("builds an asset-free V4 Runtime World Configuration without fetching", async () => {
    let fetchCount = 0;
    const loaded = await loadAuthoringScene(
      async () => jsonResponse(assetFreeAuthoringWorld()),
      {
        fetchSubjectAsset: (async () => {
          fetchCount += 1;
          throw new Error("asset-free worlds must not fetch");
        }) as typeof fetch,
      },
    );

    expect(loaded.ok).toBe(true);
    expect(fetchCount).toBe(0);
    expect(
      loaded.runtimeWorldConfiguration?.worldPackageBuildReceipt.manifest.resources
        .filter(({ resourceRef }) =>
          resourceRef.startsWith("worldkit://subject-asset/"),
        ),
    ).toEqual([]);
  });

  it("builds the G Bot Runtime World Configuration from fetched locked bytes", async () => {
    vi.stubGlobal("location", { origin: "https://playground.test" });
    const fetchCalls: string[] = [];
    const loaded = await loadAuthoringScene(
      async () => jsonResponse(routeAuthoringWorld()),
      {
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@2",
        fetchSubjectAsset: (async (input: URL | RequestInfo) => {
          const requestUrl = String(input);
          fetchCalls.push(requestUrl);
          return {
            ok: true,
            redirected: false,
            url: requestUrl,
            arrayBuffer: async () => gBotAssetBytes.buffer.slice(
              gBotAssetBytes.byteOffset,
              gBotAssetBytes.byteOffset + gBotAssetBytes.byteLength,
            ),
          } as Response;
        }) as typeof fetch,
      },
    );

    expect(loaded.ok).toBe(true);
    expect(fetchCalls).toEqual([
      expect.stringMatching(
        /^https:\/\/playground\.test\/subject-assets\/humanoid\/g-bot\/v2\/g-bot\.glb\?worldkit-content-hash=sha256%3A[a-f0-9]{64}$/,
      ),
    ]);
    expect(
      loaded.runtimeWorldConfiguration?.worldPackageBuildReceipt.manifest.resources,
    ).toContainEqual({
      resourceRef: "worldkit://subject-asset/actor.humanoid.g-bot@2",
      packagePath: "resources/subject-assets/actor.humanoid.g-bot.glb",
      mediaType: "model/gltf-binary",
      sizeBytes: gBotAssetBytes.byteLength,
      contentHash:
        "sha256:4bcf3fabdba1e083ef54bf172fd962ca740e0f2fabdb9cddaae45d5ea208718f",
    });
  }, 15_000);

  it("accepts and freezes same-world Host Route evidence for Authoring V4", async () => {
    const source = routeAuthoringWorld();
    const publication = matchingRouteEvidencePublication(source);
    const loaded = await loadAuthoringScene(
      async () => jsonResponse(source),
      { fetchRouteEvidence: async () => jsonResponse(publication) },
    );

    expect(loaded).toMatchObject({
      ok: true,
      diagnostics: [],
      routeEvidencePublication: publication,
    });
    expect(Object.isFrozen(loaded.routeEvidencePublication)).toBe(true);
    expect(Object.isFrozen(loaded.routeEvidencePublication?.routes)).toBe(true);
  });

  it.each([
    "authoringSpecHash",
    "normalizedWorldIrHash",
    "executionPlanHash",
    "resourceLockHash",
    "layoutSolveReportHash",
  ] as const)("rejects Route evidence with a different %s", async (field) => {
    const source = routeAuthoringWorld();
    const publication = matchingRouteEvidencePublication(source);
    const mismatched = {
      ...publication,
      [field]: `sha256:${"8".repeat(64)}`,
    };
    const loaded = await loadAuthoringScene(
      async () => jsonResponse(source),
      { fetchRouteEvidence: async () => jsonResponse(mismatched) },
    );

    expect(loaded).toMatchObject({
      ok: false,
      diagnostics: [{
        code: "WORLDKIT_ROUTE_EVIDENCE_WORLD_MISMATCH",
        instancePath: `/${field}`,
        details: { field },
      }],
    });
    expect(loaded.executionPlan).toBeUndefined();
    expect(loaded.routeEvidencePublication).toBeUndefined();
  });

  it("rejects malformed configured Route evidence", async () => {
    const loaded = await loadAuthoringScene(
      async () => jsonResponse(routeAuthoringWorld()),
      {
        fetchRouteEvidence: async () => jsonResponse({
          kind: "worldkit-browser-route-evidence-publication",
          schemaVersion: 1,
        }),
      },
    );

    expect(loaded).toMatchObject({
      ok: false,
      diagnostics: [{
        code: "WORLDKIT_ROUTE_EVIDENCE_INVALID",
        instancePath: "",
      }],
    });
  });

  it("treats the explicit unconfigured Route evidence response as optional", async () => {
    const loaded = await loadAuthoringScene(
      async () => jsonResponse(routeAuthoringWorld()),
      {
        fetchRouteEvidence: async () => jsonResponse({
          diagnostics: [{
            severity: "error",
            code: "WORLDKIT_ROUTE_EVIDENCE_NOT_CONFIGURED",
            instancePath: "",
            message: "Route evidence is not configured for this server.",
          }],
        }, 404),
      },
    );

    expect(loaded).toMatchObject({
      ok: true,
      diagnostics: [],
      executionPlan: { schemaVersion: 5 },
    });
    expect(loaded.routeEvidencePublication).toBeUndefined();
  });

  it("previews water and air packages without claiming their reserved relationships run", async () => {
    const mutableSource = createValidAuthoringSpecV4();
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
      async () => new Response(JSON.stringify(createValidAuthoringSpecV4())),
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
    const source = createValidAuthoringSpecV4();
    source.world.resourceBudget = {
      maxVertices: 20_000,
      maxTriangles: 30_000,
      maxColliders: 16,
    };
    const loaded = await loadAuthoringScene(
      async () => new Response(JSON.stringify(source)),
      {
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@2",
        fetchSubjectAsset: (async (input: URL | RequestInfo) => ({
          ok: true,
          redirected: false,
          url: String(input),
          arrayBuffer: async () => gBotAssetBytes.buffer.slice(
            gBotAssetBytes.byteOffset,
            gBotAssetBytes.byteOffset + gBotAssetBytes.byteLength,
          ),
        })) as typeof fetch,
      },
    );

    expect(loaded).toMatchObject({
      ok: true,
      diagnostics: [],
      executionPlan: {
        subjects: [
          expect.objectContaining({
            subjectDefinitionRef:
              "worldkit://subject-definition/humanoid.g-bot@2",
          }),
        ],
      },
      hostOverlay: {
        schemaVersion: 1,
        kind: "capability-demo",
        id: "capability-demo",
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@2",
        changes: [
          {
            type: "subject-definition-replaced",
            subjectEntityId: "player",
            beforeSubjectDefinitionRef:
              "worldkit://subject-definition/humanoid.third-person@1",
            afterSubjectDefinitionRef:
              "worldkit://subject-definition/humanoid.g-bot@2",
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
  }, 15_000);

  it("retains an immutable overlay only on an overlaid compile failure", async () => {
    const source = createValidAuthoringSpecV4();
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
          "worldkit://subject-definition/humanoid.g-bot@2",
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
        "worldkit://subject-definition/humanoid.g-bot@2",
      changes: [{
        type: "subject-definition-replaced",
        subjectEntityId: "player",
        beforeSubjectDefinitionRef:
          "worldkit://subject-definition/humanoid.third-person@1",
        afterSubjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@2",
      }],
    });
    expect(Object.isFrozen(overlaid.hostOverlay)).toBe(true);
    expect(Object.isFrozen(overlaid.hostOverlay?.changes)).toBe(true);
    expect(Object.isFrozen(overlaid.hostOverlay?.changes[0])).toBe(true);
    expect(unmodified).not.toHaveProperty("hostOverlay");
  });

  it("produces one runtime Feature inspection per compiled Subject", async () => {
    const loaded = await loadAuthoringScene(async () =>
      new Response(JSON.stringify(createValidPackageSubjectWorldV4())),
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

  it("defines Browser Protocol V5 with Gameplay command ownership", () => {
    const methodName = "executeGameplayCommand" satisfies keyof WorldkitBrowserApiV5;

    expect(WORLDKIT_BROWSER_PROTOCOL_VERSION).toBe(5);
    expect(methodName).toBe("executeGameplayCommand");
  });

  it("returns machine-readable diagnostics for invalid authoring input", async () => {
    const loaded = await loadAuthoringScene(async () => new Response('{"kind":"bad"}'));

    expect(loaded.ok).toBe(false);
    expect(loaded.executionPlan).toBeUndefined();
    expect(loaded.diagnostics[0]).toMatchObject({ code: "AUTHORING_SCHEMA_INVALID" });
  });

  it("reports the complete loader schema-version support set", async () => {
    const source = { ...createValidAuthoringSpecV4(), schemaVersion: 5 };
    const loaded = await loadAuthoringScene(async () => jsonResponse(source));

    expect(loaded).toMatchObject({
      ok: false,
      diagnostics: [{
        code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
        instancePath: "/schemaVersion",
        details: { supportedSchemaVersions: [4] },
      }],
    });
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
