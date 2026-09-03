import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import {
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  createGameplayBootstrapV1,
  RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
} from "@whitebox-world/gameplay-contracts";
import { BIPED_BONE_IDS_V1 } from "@whitebox-world/subject-contracts";
import {
  builtInSubjectResourceRegistry,
  createSubjectResourceRegistry,
} from "@whitebox-world/subject-registry";
import subjectDefinitionsV3 from "../../../assets/registry/subject-definitions/catalog.json";
import {
  BUILT_IN_CAPABILITY_MANIFESTS,
  BUILT_IN_CAPABILITY_RESOURCES,
} from "../../subject-registry/src/built-in-capability-resources";
import { BUILT_IN_SUBJECT_DEFINITIONS } from "../../subject-registry/src/built-in-subject-definitions";
import { BUILT_IN_SUBJECT_RESOURCE_MANIFESTS } from "../../subject-registry/src/built-in-resource-manifests";
import type { RegistrySubjectDefinitionInputV3 } from "../../subject-registry/src/types-v3";
import {
  createValidAuthoringSpecV4 as createValidAuthoringSpec,
  createValidMountedOnAuthoringSpec,
  createValidPackageSubjectWorldV4,
  createValidRiggedPackageDefinition,
  createValidRiggedPackageSubjectWorldV4,
} from "../../authoring/src/test-fixture";

import {
  compileCanonicalWorldV1,
  sampleTerrainHeight,
} from "./index";

const SUBJECT_ASSET_REF = "worldkit://subject-asset/humanoid.golden@2";
const RIG_PROFILE_REF = "worldkit://rig-profile/biped.golden@2";
const ANIMATION_SET_REF = "worldkit://animation-set/humanoid.ground.golden@2";
const COLLIDER_PROFILE_REF =
  "worldkit://collider-profile/humanoid.medium-capsule@1";
const BIPED_BONE_IDS = [...BIPED_BONE_IDS_V1].sort();
const INJECTED_SOURCE_URI = "https://registry.invalid/private/golden-humanoid.glb";
const INJECTED_LICENSE_URI = "https://registry.invalid/private/license";
const INJECTED_AI_TAG = "registry-private-discovery-tag";
function gameplayBootstrapFor(
  normalizedWorldIr: NormalizedWorldIRV4,
) {
  return createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: "compiler-current-test.gameplay",
    version: 1,
    resourceRef: "worldkit://gameplay-bootstrap/compiler-current-test@1",
    semanticFactProjectorProfileResource:
      RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
    entityDescriptors: [],
    featureResourceLocks: [],
    semanticActionDefinitions: [],
    availableCapabilityRefs: [],
    initialRelationshipStates: normalizedWorldIr.relationships.map(
      (relationship) => ({
        ...structuredClone(relationship),
        establishedSimulationTick: 0,
      }),
    ),
  });
}

function projectionGameplayBootstrapFor(
  normalizedWorldIr: NormalizedWorldIRV4,
) {
  return createGameplayBootstrapV1({
    kind: "gameplay-bootstrap",
    id: "bna1-v5-projection.gameplay",
    version: 1,
    resourceRef: "worldkit://gameplay-bootstrap/bna1-v5-projection@1",
    semanticFactProjectorProfileResource:
      RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
    entityDescriptors: [],
    featureResourceLocks: [],
    semanticActionDefinitions: [],
    availableCapabilityRefs: [],
    initialRelationshipStates: normalizedWorldIr.relationships.map(
      (relationship) => ({
        ...structuredClone(relationship),
        establishedSimulationTick: 0,
      }),
    ),
  });
}

function compileWorld(input: {
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly normalizedWorldIrHash: Sha256HashV1;
}) {
  return compileCanonicalWorldV1({
    ...input,
    gameplayBootstrap: gameplayBootstrapFor(input.normalizedWorldIr),
    worldRuntimeBootstrapRef:
      `worldkit://world-runtime-bootstrap/${input.normalizedWorldIr.id}@1`,
  });
}

function createCoherentAsymmetricProjectionSpec(): AuthoringSpecV4 {
  const spec = createValidMountedOnAuthoringSpec();
  spec.world = {
    ...spec.world,
    gravityMetersPerSecondSquaredXYZ: [0.35, -12.5, 0.15],
  };
  spec.resources = {
    ...spec.resources,
    prototypes: spec.resources.prototypes.map((prototype) => ({
      ...prototype,
      collisionEnabled: true,
      traversalSurfaceBindings: [{
        id: "projection-deck",
        kind: "collider-subshape" as const,
        logicalSubshapeId: "primary",
        traversalSurfaceProfileRef:
          "worldkit://traversal-surface-profile/ground.static@1",
      }],
    })),
    subjectDefinitions: [
      ...spec.resources.subjectDefinitions,
      createValidRiggedPackageDefinition(),
    ],
  };
  spec.nodes = spec.nodes.map((node) => {
    if (node.kind === "subject" && node.id === "player") {
      return {
        ...node,
        subjectDefinitionRef:
          "package://subject-definition/rigged-golden-package@1",
      };
    }
    if (node.kind === "camera" && node.id === spec.startup.cameraEntityId) {
      return {
        ...node,
        components: {
          cameraRig: {
            ...node.components.cameraRig,
            thirdPerson: {
              ...node.components.cameraRig.thirdPerson,
              pitchRadians: 0.22,
              distanceMeters: 5.5,
              targetHeightMeters: 1.7,
              fovDegrees: 61,
              aspectRatio: 16 / 9,
            },
          },
        },
      };
    }
    return node;
  });
  return spec;
}

const ALL_BUILT_IN_REGISTRY_INPUTS = [
  ...BUILT_IN_SUBJECT_DEFINITIONS,
  ...(subjectDefinitionsV3 as unknown as readonly RegistrySubjectDefinitionInputV3[]),
  ...BUILT_IN_SUBJECT_RESOURCE_MANIFESTS,
  ...BUILT_IN_CAPABILITY_MANIFESTS,
  ...BUILT_IN_CAPABILITY_RESOURCES,
] as const;

function compileAuthoringSpec(options: {
  subjectDefinitionRef?: string;
} = {}) {
  const spec = createValidAuthoringSpec();
  const subject = spec.nodes.find((node) => node.kind === "subject");
  if (subject === undefined || subject.kind !== "subject") {
    throw new Error("Expected the valid fixture to contain a Subject node.");
  }
  if (options.subjectDefinitionRef !== undefined) {
    subject.subjectDefinitionRef = options.subjectDefinitionRef;
  }
  const normalized = normalizeAuthoringSpecV4(spec);
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    throw new Error(`Authoring spec did not normalize: ${JSON.stringify(normalized.diagnostics)}`);
  }
  const compiled = compileWorld({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (!compiled.ok) {
    throw new Error(`Authoring spec did not compile: ${JSON.stringify(compiled.diagnostics)}`);
  }
  return compiled.worldRuntimeBootstrap;
}

function expectExactKeys(value: object, expectedKeys: readonly string[]): void {
  expect(Object.keys(value).sort()).toEqual([...expectedKeys].sort());
}

function registryWithPrivateAssetMetadata() {
  return createSubjectResourceRegistry(
    ALL_BUILT_IN_REGISTRY_INPUTS.map((resource) =>
      resource.kind === "subject-asset"
        ? {
            ...resource,
            provenance: {
              ...resource.provenance,
              sourceUri: INJECTED_SOURCE_URI,
              licenseUri: INJECTED_LICENSE_URI,
            },
            aiMetadata: {
              ...resource.aiMetadata,
              semanticTags: [...resource.aiMetadata.semanticTags, INJECTED_AI_TAG],
            },
          }
        : structuredClone(resource),
    ),
  );
}

function normalizeRiggedWorld(
  mutate?: (spec: AuthoringSpecV4) => void,
  usePrivateRegistry = false,
) {
  const spec = createValidRiggedPackageSubjectWorldV4();
  mutate?.(spec);
  const normalized = normalizeAuthoringSpecV4(
    spec,
    usePrivateRegistry
      ? { subjectResourceRegistry: registryWithPrivateAssetMetadata() }
      : undefined,
  );
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    throw new Error(`Rigged fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`);
  }
  return normalized;
}

function normalizeStaticAssetWorld() {
  return normalizeRiggedWorld((spec) => {
    const definition = spec.resources.subjectDefinitions[0]!;
    spec.resources = {
      ...spec.resources,
      subjectDefinitions: [{
        ...definition,
        visualBinding: { mode: "static" },
        sockets: [],
      }],
    };
  });
}

function compileNormalizedWorld(world: NormalizedWorldIRV4) {
  return compileWorld({
    normalizedWorldIr: world,
    normalizedWorldIrHash: sha256CanonicalJson(world) as Sha256HashV1,
  });
}

function compilePackageWorld() {
  const normalized = normalizeAuthoringSpecV4(createValidPackageSubjectWorldV4());
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    throw new Error("Package Subject fixture did not normalize.");
  }
  return compileWorld({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
}

function createSolvedLayoutWorldV4(): AuthoringSpecV4 {
  const base = createValidAuthoringSpec();
  return {
    ...base,
    spatial: {
      regions: [{
        id: "spawn-zone",
        kind: "polygon-xz",
        pointsMetersXZ: [[-4, -4], [4, -4], [4, 4], [-4, 4]],
        semanticClassId: "terrain.spawn-zone",
      }],
      routes: [],
      screenRegions: [],
      traversalAreas: [],
    },
    nodes: base.nodes.map((node) =>
      node.id === "spawn-main" && node.kind === "anchor"
        ? {
            ...node,
            placement: {
              kind: "solved" as const,
              placementConstraintIds: ["spawn-inside", "spawn-supported"],
            },
          }
        : node
    ),
    constraints: {
      placements: [
        {
          id: "spawn-inside",
          kind: "inside-region",
          requirement: "required",
          entityId: "spawn-main",
          regionId: "spawn-zone",
          boundaryClearanceMeters: 0,
        },
        {
          id: "spawn-supported",
          kind: "supported-by",
          requirement: "required",
          supportedEntityId: "spawn-main",
          supportingEntityId: "terrain-main",
          maximumSupportGapMeters: 0,
          minimumSupportRatio: 1,
        },
      ],
      connectivity: [],
    },
  };
}

function normalizeSolvedLayoutWorldV4() {
  const result = normalizeAuthoringSpecV4(createSolvedLayoutWorldV4());
  if (!result.ok || result.value === undefined || result.normalizedWorldIrHash === undefined) {
    throw new Error(`V4 fixture did not normalize: ${JSON.stringify(result.diagnostics)}`);
  }
  return result;
}

const PRODUCT_FIXED_SPAWN_CASES = [
  {
    label: "G Bot",
    path: "../../../examples/authoring/g-bot-subject-world.json",
    spawns: [
      {
        anchorEntityId: "spawn-g-bot-primary",
        subjectEntityId: "g-bot-primary",
        authoredPositionMetersXYZ: [-2, 0, 18],
        normalizedPositionMetersXYZ: [-2, 0, 18],
      },
    ],
  },
  {
    label: "rigged Subject",
    path: "../../../examples/authoring/rigged-subject-world.json",
    spawns: [
      {
        anchorEntityId: "spawn-rigged-primary",
        subjectEntityId: "rigged-primary",
        authoredPositionMetersXYZ: [-3, -0.976004939803828, 30],
        normalizedPositionMetersXYZ: [-3, -0.976, 30],
      },
      {
        anchorEntityId: "spawn-rigged-secondary",
        subjectEntityId: "rigged-secondary",
        authoredPositionMetersXYZ: [3, -0.9764188420353316, 30],
        normalizedPositionMetersXYZ: [3, -0.976, 30],
      },
    ],
  },
] as const;

describe("compileWorld", () => {
  it("matches the one-time V5 projection receipt from one coherent asymmetric world", async () => {
    const normalized = normalizeAuthoringSpecV4(
      createCoherentAsymmetricProjectionSpec(),
    );
    if (
      !normalized.ok ||
      normalized.value === undefined ||
      normalized.normalizedWorldIrHash === undefined
    ) {
      throw new Error(
        `Coherent asymmetric fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`,
      );
    }
    const gameplayBootstrap = projectionGameplayBootstrapFor(normalized.value);
    const compiled = compileCanonicalWorldV1({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
      gameplayBootstrap,
      worldRuntimeBootstrapRef:
        "worldkit://world-runtime-bootstrap/bna1-v5-projection@1",
    });
    if (!compiled.ok) {
      throw new Error(
        `Coherent asymmetric fixture did not compile: ${JSON.stringify(compiled.diagnostics)}`,
      );
    }
    const receipt = JSON.parse(await readFile(
      new URL(
        "../../../artifacts/bna-1/execution-plan-v5-projection-receipt.json",
        import.meta.url,
      ),
      "utf8",
    )) as {
      projectedExecutionPlanHash: string;
      worldRuntimeBootstrapHash: string;
      gameplayBootstrapHash: string;
    };

    expect(compiled.executionPlanHash).toBe(receipt.projectedExecutionPlanHash);
    expect(compiled.worldRuntimeBootstrap.contentHash).toBe(
      receipt.worldRuntimeBootstrapHash,
    );
    expect(gameplayBootstrap.contentHash).toBe(receipt.gameplayBootstrapHash);
  });

  it("compiles Mount slots and initial mountedOn state without re-inferring endpoints", () => {
    const normalized = normalizeAuthoringSpecV4(createValidMountedOnAuthoringSpec());
    if (
      !normalized.ok ||
      normalized.value === undefined ||
      normalized.normalizedWorldIrHash === undefined
    ) {
      throw new Error(`Mounted fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`);
    }
    const compiled = compileWorld({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    });

    expect(compiled.diagnostics).toEqual([]);
    if (!compiled.ok) throw new Error("Mounted fixture did not compile.");
    expect(gameplayBootstrapFor(normalized.value).initialRelationshipStates).toEqual([{
      ...normalized.value.relationships[0],
      establishedSimulationTick: 0,
    }]);
    expect(
      compiled.worldRuntimeBootstrap.subjectRuntimeDescriptors.find(({ entityId }) =>
        entityId === "pack-animal-b")?.mountSlots,
    ).toEqual(normalized.value.resources.subjectDefinitions[0]?.mountSlots);
  });

  it("projects feel and body traversal, not locomotion speeds", () => {
    const plan = compileAuthoringSpec({
      subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
    });
    const player = plan.subjectRuntimeDescriptors.find(
      (subject) => subject.entityId === "player",
    );
    if (player === undefined) {
      throw new Error("Expected player subject in compiled plan.");
    }
    expect(player.locomotion).toEqual({
      allowWalk: true,
      allowRun: true,
      allowJump: true,
    });
    expect(player.controlFeel).toEqual(
      expect.objectContaining({
        resourceRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
        walkSpeedMetersPerSecond: 2.4,
        accelerationMetersPerSecondSquared: 16,
      }),
    );
    expect(player.availableControlFeels.map((feel) => feel.resourceRef)).toEqual([
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
      "worldkit://control-feel-profile/humanoid.heavy-ground@1",
    ]);
    for (const feel of player.availableControlFeels) {
      expect(Object.keys(feel).sort()).toEqual(Object.keys(player.controlFeel).sort());
      expect(feel.walkSpeedMetersPerSecond).toBeGreaterThan(0);
    }
    expect(player.collider.maxStepHeightMeters).toBe(0.3);
    expect(player.collider.maxSlopeDegrees).toBe(42);
    expect(player.physicsBodyProfileRef).toBe(
      "worldkit://physics-body-profile/character.capability-medium@1",
    );
    expect(player.locomotionProfileRef).toBe(
      "worldkit://locomotion-profile/ground.standard@1",
    );
    expect(player.capabilityAssembly?.physicsBodyProfileRef).toBe(
      "worldkit://physics-body-profile/character.capability-medium@1",
    );
    expect(player.capabilityAssembly?.defaultMotionProfile).not.toHaveProperty(
      "parameters",
    );
    expect(player.capabilityAssembly?.mediumProfile).toEqual({
      resourceRef: "worldkit://medium-profile/ground-air.standard@1",
      air: { gravityRatio: 1, linearDragPerSecond: 0.05 },
    });
  });

  it("refuses to compile a published water movementMedium via water bag", () => {
    const spec = createValidAuthoringSpec();
    const subject = spec.nodes.find((node) => node.kind === "subject");
    if (subject === undefined || subject.kind !== "subject") {
      throw new Error("Expected the valid fixture to contain a Subject node.");
    }
    subject.subjectDefinitionRef = "worldkit://subject-definition/humanoid.g-bot@2";
    const normalized = normalizeAuthoringSpecV4(spec);
    if (!normalized.ok || normalized.value === undefined) {
      throw new Error(`G Bot fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`);
    }
    const forged = structuredClone(normalized.value);
    const definition = forged.resources.subjectDefinitions[0];
    if (definition?.capabilityAssembly === undefined) {
      throw new Error("Expected capability assembly on forged G Bot definition.");
    }
    definition.capabilityAssembly.mediumProfile = {
      ...definition.capabilityAssembly.mediumProfile,
      water: { surfaceHoldStrength: 1, linearDragPerSecond: 0.1 },
    } as typeof definition.capabilityAssembly.mediumProfile;

    expect(compileWorld({
      normalizedWorldIr: forged,
      normalizedWorldIrHash: sha256CanonicalJson(forged) as Sha256HashV1,
    })).toMatchObject({
      ok: false,
      diagnostics: [{
        code: "COMPILER_NORMALIZED_IR_INVALID",
        message: expect.stringMatching(/^SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED:/),
      }],
    });
  });

  it("refuses to compile a published water movementMedium via supportedMediums", () => {
    const spec = createValidAuthoringSpec();
    const subject = spec.nodes.find((node) => node.kind === "subject");
    if (subject === undefined || subject.kind !== "subject") {
      throw new Error("Expected the valid fixture to contain a Subject node.");
    }
    subject.subjectDefinitionRef = "worldkit://subject-definition/humanoid.g-bot@2";
    const normalized = normalizeAuthoringSpecV4(spec);
    if (!normalized.ok || normalized.value === undefined) {
      throw new Error(`G Bot fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`);
    }
    const forged = structuredClone(normalized.value);
    const definition = forged.resources.subjectDefinitions[0];
    if (definition?.capabilityAssembly === undefined) {
      throw new Error("Expected capability assembly on forged G Bot definition.");
    }
    definition.capabilityAssembly.mediumProfile = {
      ...definition.capabilityAssembly.mediumProfile,
      supportedMediums: ["ground", "air", "water"],
    } as typeof definition.capabilityAssembly.mediumProfile;

    expect(compileWorld({
      normalizedWorldIr: forged,
      normalizedWorldIrHash: sha256CanonicalJson(forged) as Sha256HashV1,
    })).toMatchObject({
      ok: false,
      diagnostics: [{
        code: "COMPILER_NORMALIZED_IR_INVALID",
        message: expect.stringMatching(/^SUBJECT_MOVEMENT_MEDIUM_UNSUPPORTED:/),
      }],
    });
  });

  it("compiles one rigged Subject into ref-only parts and minimal resource tables", () => {
    const normalized = normalizeRiggedWorld(undefined, true);
    const result = compileWorld({
      normalizedWorldIr: normalized.value!,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash!,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Rigged fixture did not compile.");
    const runtimeBootstrap = result.worldRuntimeBootstrap;
    const subject = runtimeBootstrap.subjectRuntimeDescriptors.find(
      (candidate) => candidate.entityId === "player",
    )!;
    expect(subject.visualParts).toEqual([
      {
        id: "body.asset",
        kind: "asset",
        subjectAssetRef: SUBJECT_ASSET_REF,
        localTransform: {
          positionMetersXYZ: [0, 0, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        appearance: { mode: "whitebox-neutral" },
        semanticTags: ["body", "golden", "rigged"],
      },
    ]);
    expect(subject.visualBinding).toEqual({
      mode: "rigged",
      rigProfileRef: RIG_PROFILE_REF,
      animationSetRef: ANIMATION_SET_REF,
    });
    expect(subject.sockets).toEqual([
      {
        id: "hand.right",
        kind: "bone",
        boneId: "hand.right",
        offsetTransform: {
          positionMetersXYZ: [0, 0, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
        },
        semanticTags: ["equipment-grip", "hand"],
      },
    ]);
    expect(runtimeBootstrap.subjectAssets).toHaveLength(1);
    expect(runtimeBootstrap.rigProfiles).toHaveLength(1);
    expect(runtimeBootstrap.animationSets).toHaveLength(1);
    expect(runtimeBootstrap.colliderProfiles).toHaveLength(1);
    expect(Object.keys(runtimeBootstrap.subjectAssets[0]!).sort()).toEqual([
      "artifactContentHash",
      "byteLength",
      "format",
      "inventory",
      "mediaType",
      "subjectAssetRef",
    ]);
    expect(Object.keys(runtimeBootstrap.rigProfiles[0]!).sort()).toEqual([
      "bodyTopology",
      "requiredBoneIds",
      "rigProfileRef",
      "skeletonRootBoneName",
      "sourceNodeNameByBoneId",
    ]);
    expect(Object.keys(runtimeBootstrap.animationSets[0]!).sort()).toEqual([
      "animationBindings",
      "animationSetRef",
      "defaultActionId",
      "requiredActionIds",
      "rigProfileRef",
      "subjectAssetRef",
    ]);
    expect(Object.keys(runtimeBootstrap.colliderProfiles[0]!).sort()).toEqual([
      "collider",
      "colliderProfileRef",
      "supportedBodyTopologies",
    ]);
    expect(runtimeBootstrap.subjectAssets[0]).toMatchObject({
      subjectAssetRef: SUBJECT_ASSET_REF,
      artifactContentHash:
        "sha256:6cf29a2c9c024bdc108a8a436255abbb5f370d658d78cca0afb30f4872cd25a8",
      byteLength: 48_060,
      mediaType: "model/gltf-binary",
      format: "glb",
      inventory: { vertexCount: 360, triangleCount: 180 },
    });
    const serializedRigProfile = JSON.parse(
      JSON.stringify(runtimeBootstrap.rigProfiles[0]),
    ) as {
      requiredBoneIds: readonly string[];
      skeletonRootBoneName: string;
      sourceNodeNameByBoneId: Readonly<Record<string, unknown>>;
    };
    expect(serializedRigProfile.skeletonRootBoneName).toBe("root");
    expect(serializedRigProfile.requiredBoneIds).toEqual(BIPED_BONE_IDS);
    expectExactKeys(serializedRigProfile.sourceNodeNameByBoneId, BIPED_BONE_IDS);
    for (const boneId of BIPED_BONE_IDS) {
      expect(
        Object.prototype.hasOwnProperty.call(
          serializedRigProfile.sourceNodeNameByBoneId,
          boneId,
        ),
      ).toBe(true);
      const sourceNodeName = serializedRigProfile.sourceNodeNameByBoneId[boneId];
      expect(sourceNodeName).toEqual(expect.any(String));
      expect((sourceNodeName as string).trim()).not.toBe("");
    }

    const serializedNormalized = JSON.stringify(normalized.value);
    const serializedRuntimeBootstrap = JSON.stringify(runtimeBootstrap);
    for (const forbiddenValue of [
      INJECTED_SOURCE_URI,
      INJECTED_LICENSE_URI,
      INJECTED_AI_TAG,
    ]) {
      expect(serializedNormalized).not.toContain(forbiddenValue);
      expect(serializedRuntimeBootstrap).not.toContain(forbiddenValue);
    }
    expect(serializedRuntimeBootstrap).not.toContain("golden-humanoid.glb");
    expect(serializedRuntimeBootstrap).not.toMatch(
      /Babylon|Havok|AssetContainer|Uint8Array|ArrayBuffer/,
    );
    expect(runtimeBootstrap.subjectRuntimeDescriptors[0]?.controlFeel.contentHash)
      .toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("compiles one static Subject Asset into the Runtime Bootstrap asset table", () => {
    const normalized = normalizeStaticAssetWorld();
    const result = compileWorld({
      normalizedWorldIr: normalized.value!,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash!,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Static asset fixture did not compile.");
    const runtimeBootstrap = result.worldRuntimeBootstrap;
    const subject = runtimeBootstrap.subjectRuntimeDescriptors.find(
      (candidate) => candidate.entityId === "player",
    )!;
    expect(subject.visualBinding).toEqual({ mode: "static" });
    expect(subject.visualParts).toEqual([
      expect.objectContaining({
        id: "body.asset",
        kind: "asset",
        subjectAssetRef: SUBJECT_ASSET_REF,
      }),
    ]);
    expect(runtimeBootstrap.subjectAssets).toEqual([
      expect.objectContaining({ subjectAssetRef: SUBJECT_ASSET_REF }),
    ]);
    expect(runtimeBootstrap.rigProfiles).toEqual([]);
    expect(runtimeBootstrap.animationSets).toEqual([]);
  });

  it("preserves the unresolved Subject Asset invariant for a static Subject", () => {
    const normalized = normalizeStaticAssetWorld();
    const world = structuredClone(normalized.value!);
    world.resources.subjectAssets = [];

    expect(compileNormalizedWorld(world)).toEqual({
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_IR_INVALID",
        instancePath: "/normalizedWorldIr",
        message:
          "NormalizedWorldIR invariant violated: missing Subject Asset 'worldkit://subject-asset/humanoid.golden@2'.",
      }],
    });
  });

  it.each([
    {
      label: "missing Subject Asset Resource Lock row",
      expectedMessage:
        "NormalizedWorldIR invariant violated: Subject Asset 'worldkit://subject-asset/humanoid.golden@2' requires one matching locked Subject Asset.",
      mutate: (world: NormalizedWorldIRV4) => {
        world.resources.resourceLock = world.resources.resourceLock.filter(
          (row) => row.resourceRef !== SUBJECT_ASSET_REF,
        );
      },
    },
    {
      label: "duplicate Subject Asset Resource Lock row",
      expectedMessage: "WORLD_RESOURCE_LOCK_INVALID",
      mutate: (world: NormalizedWorldIRV4) => {
        const subjectAssetLock = world.resources.resourceLock.find(
          (row) => row.resourceRef === SUBJECT_ASSET_REF,
        );
        if (subjectAssetLock === undefined) {
          throw new Error("Static Subject Asset lock fixture is missing its lock row.");
        }
        world.resources.resourceLock = [
          ...world.resources.resourceLock,
          structuredClone(subjectAssetLock),
        ];
      },
    },
    {
      label: "wrong-kind Subject Asset Resource Lock row",
      expectedMessage:
        "NormalizedWorldIR invariant violated: Subject Asset 'worldkit://subject-asset/humanoid.golden@2' requires one matching locked Subject Asset.",
      mutate: (world: NormalizedWorldIRV4) => {
        world.resources.resourceLock = world.resources.resourceLock.map((row) =>
          row.resourceRef === SUBJECT_ASSET_REF
            ? { ...row, resourceKind: "rig-profile" }
            : row,
        );
      },
    },
    {
      label: "forged Subject Asset Resource Lock content hash",
      expectedMessage:
        "NormalizedWorldIR invariant violated: Subject Asset 'worldkit://subject-asset/humanoid.golden@2' does not match its locked Registry manifest hash.",
      mutate: (world: NormalizedWorldIRV4) => {
        world.resources.resourceLock = world.resources.resourceLock.map((row) =>
          row.resourceRef === SUBJECT_ASSET_REF
            ? { ...row, contentHash: `sha256:${"f".repeat(64)}` }
            : row,
        );
      },
    },
  ])("rejects a $label for a static Subject", ({ mutate, expectedMessage }) => {
    const normalized = normalizeStaticAssetWorld();
    const world = structuredClone(normalized.value!);
    mutate(world);
    world.resources.resourceLockHash = sha256CanonicalJson(
      world.resources.resourceLock,
    );

    expect(compileNormalizedWorld(world)).toEqual({
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "COMPILER_NORMALIZED_IR_INVALID",
        instancePath: "/normalizedWorldIr",
        message: expectedMessage,
      }],
    });
  });

  it("locks the current valid rigged Canonical Scene and Runtime Bootstrap hashes", () => {
    const rigged = normalizeRiggedWorld();
    const compiled = compileWorld({
      normalizedWorldIr: rigged.value!,
      normalizedWorldIrHash: rigged.normalizedWorldIrHash!,
    });
    if (!compiled.ok) throw new Error("Rigged fixture did not compile.");

    expect({
      executionPlanHash: compiled.executionPlanHash,
      worldRuntimeBootstrapHash: compiled.worldRuntimeBootstrap.contentHash,
    }).toEqual({
      executionPlanHash:
        "sha256:0b57400aff8d6a082fb8780de0c27243d86590a284c7d9acc047da39dde6669f",
      worldRuntimeBootstrapHash:
        "sha256:ef2a6a1d0219d4b721d432eeae7c6ff4e499c1db80e8626f12bbddae9c1ea651",
    });
  });

  it.each([
    {
      label: "missing canonical Bone mapping",
      mutate: (world: NormalizedWorldIRV4) => {
        const sourceNodeNameByBoneId = world.resources.rigProfiles[0]!
          .sourceNodeNameByBoneId as unknown as Record<string, string>;
        delete sourceNodeNameByBoneId.head;
      },
      message:
        "NormalizedWorldIR invariant violated: Rig Profile 'worldkit://rig-profile/biped.golden@2' is missing source-node mapping for Bone 'head'.",
    },
    {
      label: "whitespace-only canonical Bone mapping",
      mutate: (world: NormalizedWorldIRV4) => {
        const sourceNodeNameByBoneId = world.resources.rigProfiles[0]!
          .sourceNodeNameByBoneId as unknown as Record<string, string>;
        sourceNodeNameByBoneId.head = " \t ";
      },
      message:
        "NormalizedWorldIR invariant violated: Rig Profile 'worldkit://rig-profile/biped.golden@2' has an empty source-node mapping for Bone 'head'.",
    },
    {
      label: "own-property undefined canonical Bone mapping",
      mutate: (world: NormalizedWorldIRV4) => {
        const sourceNodeNameByBoneId = world.resources.rigProfiles[0]!
          .sourceNodeNameByBoneId as unknown as Record<string, unknown>;
        sourceNodeNameByBoneId.head = undefined;
      },
      message:
        "NormalizedWorldIR invariant violated: Rig Profile 'worldkit://rig-profile/biped.golden@2' is missing source-node mapping for Bone 'head'.",
    },
    {
      label: "numeric canonical Bone mapping",
      mutate: (world: NormalizedWorldIRV4) => {
        const sourceNodeNameByBoneId = world.resources.rigProfiles[0]!
          .sourceNodeNameByBoneId as unknown as Record<string, unknown>;
        sourceNodeNameByBoneId.head = 123;
      },
      message:
        "NormalizedWorldIR invariant violated: Rig Profile 'worldkit://rig-profile/biped.golden@2' is missing source-node mapping for Bone 'head'.",
    },
    {
      label: "explicit empty canonical Bone mapping",
      mutate: (world: NormalizedWorldIRV4) => {
        const sourceNodeNameByBoneId = world.resources.rigProfiles[0]!
          .sourceNodeNameByBoneId as unknown as Record<string, string>;
        sourceNodeNameByBoneId.head = "";
      },
      message:
        "NormalizedWorldIR invariant violated: Rig Profile 'worldkit://rig-profile/biped.golden@2' has an empty source-node mapping for Bone 'head'.",
    },
  ])("rejects a $label", ({ mutate, message }) => {
    const normalized = normalizeRiggedWorld();
    const world = structuredClone(normalized.value!);
    mutate(world);
    const result = compileNormalizedWorld(world);

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "COMPILER_NORMALIZED_IR_INVALID",
          instancePath: "/normalizedWorldIr",
          message,
        },
      ],
    });
    expect("canonicalSceneExecutionPlan" in result).toBe(false);
  });

  it("recursively projects forged Normalized descriptors and Subject data", () => {
    const forbiddenValues = [
      "normalized-inventory-provider-handle",
      "normalized-rig-provider-handle",
      "normalized-animation-source-uri",
      "normalized-collider-provider-handle",
      "normalized-binding-provider-handle",
      "normalized-asset-transform-provider-handle",
      "normalized-appearance-source-uri",
      "normalized-bone-transform-provider-handle",
      "normalized-local-transform-provider-handle",
      "normalized-subject-collider-provider-handle",
      "normalized-locomotion-provider-handle",
    ] as const;
    const normalized = normalizeRiggedWorld();
    const world = structuredClone(normalized.value!);
    const asset = world.resources.subjectAssets[0]!;
    const rig = world.resources.rigProfiles[0]!;
    const animationSet = world.resources.animationSets[0]!;
    const colliderProfile = world.resources.colliderProfiles[0]!;
    Object.assign(asset.inventory, { providerHandle: forbiddenValues[0] });
    Object.assign(rig.sourceNodeNameByBoneId, { providerHandle: forbiddenValues[1] });
    for (const binding of animationSet.animationBindings) {
      Object.assign(binding, { sourceUri: forbiddenValues[2] });
    }
    Object.assign(colliderProfile.collider, { providerHandle: forbiddenValues[3] });
    const definition = world.resources.subjectDefinitions[0]!;
    Object.assign(definition.visualBinding, { providerHandle: forbiddenValues[4] });
    const assetPart = definition.visualParts.find((part) => part.kind === "asset")!;
    Object.assign(assetPart.localTransform, { providerHandle: forbiddenValues[5] });
    Object.assign(assetPart.appearance, { sourceUri: forbiddenValues[6] });
    const boneSocket = definition.sockets.find((socket) => socket.kind === "bone")!;
    Object.assign(boneSocket.offsetTransform, { providerHandle: forbiddenValues[7] });
    definition.sockets = [
      ...definition.sockets,
      {
        id: "test.local",
        kind: "local",
        localTransform: {
          positionMetersXYZ: [0, 0, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          providerHandle: forbiddenValues[8],
        },
        semanticTags: ["test"],
      } as unknown as (typeof definition.sockets)[number],
    ];
    Object.assign(definition.collider, { providerHandle: forbiddenValues[9] });
    Object.assign(definition.controlFeel, { providerHandle: forbiddenValues[10] });
    for (const availableFeel of definition.availableControlFeels) {
      Object.assign(availableFeel, { providerHandle: forbiddenValues[10] });
    }
    const beforeCompile = structuredClone(world);

    const result = compileNormalizedWorld(world);

    expect(result.ok).toBe(true);
    expect(world).toEqual(beforeCompile);
    if (!result.ok) throw new Error("Forged projection fixture did not compile.");
    const runtimeBootstrap = result.worldRuntimeBootstrap;
    const executionAsset = runtimeBootstrap.subjectAssets[0]!;
    const executionRig = runtimeBootstrap.rigProfiles[0]!;
    const executionAnimationSet = runtimeBootstrap.animationSets[0]!;
    const executionColliderProfile = runtimeBootstrap.colliderProfiles[0]!;
    expectExactKeys(executionAsset.inventory, [
      "animationClipNames",
      "boneCount",
      "meshCount",
      "skeletonCount",
      "triangleCount",
      "vertexCount",
    ]);
    expectExactKeys(executionRig.sourceNodeNameByBoneId, BIPED_BONE_IDS);
    for (const binding of executionAnimationSet.animationBindings) {
      expectExactKeys(binding, [
        "actionId",
        "automaticPresentationKeys",
        "blendDurationSeconds",
        "loopMode",
        "playbackSpeedRatio",
        "rootMotionMode",
        "semanticFamily",
        "sourceClipName",
      ]);
    }
    expectExactKeys(executionColliderProfile.collider, [
      "centerOffsetFromSubjectOriginMetersXYZ",
      "heightMeters",
      "kind",
      "radiusMeters",
    ]);
    expectExactKeys(
      executionColliderProfile.collider.centerOffsetFromSubjectOriginMetersXYZ,
      ["0", "1", "2"],
    );
    const subject = runtimeBootstrap.subjectRuntimeDescriptors.find(
      (candidate) => candidate.entityId === "player",
    )!;
    expectExactKeys(subject.visualBinding, [
      "animationSetRef",
      "mode",
      "rigProfileRef",
    ]);
    const executionAssetPart = subject.visualParts.find((part) => part.kind === "asset")!;
    expectExactKeys(executionAssetPart.localTransform, [
      "positionMetersXYZ",
      "rotationEulerRadiansXYZ",
      "scaleXYZ",
    ]);
    expectExactKeys(executionAssetPart.localTransform.positionMetersXYZ, ["0", "1", "2"]);
    expectExactKeys(executionAssetPart.localTransform.rotationEulerRadiansXYZ, ["0", "1", "2"]);
    expectExactKeys(executionAssetPart.localTransform.scaleXYZ, ["0", "1", "2"]);
    expectExactKeys(executionAssetPart.appearance, ["mode"]);
    const executionBoneSocket = subject.sockets.find((socket) => socket.kind === "bone")!;
    expectExactKeys(executionBoneSocket.offsetTransform, [
      "positionMetersXYZ",
      "rotationEulerRadiansXYZ",
    ]);
    expectExactKeys(executionBoneSocket.offsetTransform.positionMetersXYZ, ["0", "1", "2"]);
    expectExactKeys(executionBoneSocket.offsetTransform.rotationEulerRadiansXYZ, ["0", "1", "2"]);
    const executionLocalSocket = subject.sockets.find((socket) => socket.kind === "local")!;
    expectExactKeys(executionLocalSocket.localTransform, [
      "positionMetersXYZ",
      "rotationEulerRadiansXYZ",
    ]);
    expectExactKeys(executionLocalSocket.localTransform.positionMetersXYZ, ["0", "1", "2"]);
    expectExactKeys(executionLocalSocket.localTransform.rotationEulerRadiansXYZ, ["0", "1", "2"]);
    expectExactKeys(subject.collider, [
      "centerOffsetFromSubjectOriginMetersXYZ",
      "heightMeters",
      "kind",
      "massKilograms",
      "maxSlopeDegrees",
      "maxStepHeightMeters",
      "radiusMeters",
    ]);
    expectExactKeys(subject.collider.centerOffsetFromSubjectOriginMetersXYZ, ["0", "1", "2"]);
    expectExactKeys(subject.locomotion, ["allowJump", "allowRun", "allowWalk"]);
    const controlFeelKeys = [
      "accelerationMetersPerSecondSquared",
      "airControlRatio",
      "contentHash",
      "coyoteTimeSeconds",
      "decelerationMetersPerSecondSquared",
      "jumpBufferSeconds",
      "jumpHoldGravityRatio",
      "jumpReleaseGravityRatio",
      "jumpVariantPolicy",
      "jumpSpeedMetersPerSecond",
      "moveResponseExponent",
      "resourceRef",
      "runSpeedMetersPerSecond",
      "turnRateRadiansPerSecond",
      "variableJumpHoldSeconds",
      "walkSpeedMetersPerSecond",
    ] as const;
    expectExactKeys(subject.controlFeel, controlFeelKeys);
    expect(subject.availableControlFeels.length).toBeGreaterThan(0);
    for (const availableFeel of subject.availableControlFeels) {
      expectExactKeys(availableFeel, controlFeelKeys);
    }
    const serializedRuntimeBootstrap = JSON.stringify(runtimeBootstrap);
    for (const forbiddenValue of forbiddenValues) {
      expect(serializedRuntimeBootstrap).not.toContain(forbiddenValue);
    }
  });

  it("deduplicates reachable resources while charging each rigged Subject instance once", () => {
    const single = normalizeRiggedWorld();
    const shared = normalizeRiggedWorld((spec) => {
      spec.nodes = [
        ...spec.nodes,
        {
          id: "spawn-rigged-copy",
          kind: "anchor",
          placement: { kind: "fixed", transform: { positionMetersXYZ: [6, 0, 30] } },
          semantic: { classId: "spawn" },
        },
        {
          id: "rigged-copy",
          kind: "subject",
          subjectDefinitionRef:
            "package://subject-definition/rigged-golden-package@1",
          spawnAnchorEntityId: "spawn-rigged-copy",
        },
      ];
    });
    const singleCompiled = compileWorld({
      normalizedWorldIr: single.value!,
      normalizedWorldIrHash: single.normalizedWorldIrHash!,
    });
    const result = compileWorld({
      normalizedWorldIr: shared.value!,
      normalizedWorldIrHash: shared.normalizedWorldIrHash!,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || !singleCompiled.ok) {
      throw new Error("Shared rigged fixtures did not compile.");
    }
    const runtimeBootstrap = result.worldRuntimeBootstrap;
    expect(runtimeBootstrap.subjectRuntimeDescriptors.map(
      (subject) => subject.entityId,
    )).toEqual([
      "player",
      "rigged-copy",
    ]);
    expect(runtimeBootstrap.subjectAssets).toHaveLength(1);
    expect(runtimeBootstrap.rigProfiles).toHaveLength(1);
    expect(runtimeBootstrap.animationSets).toHaveLength(1);
    expect(runtimeBootstrap.colliderProfiles).toHaveLength(1);
    expect(result.canonicalSceneExecutionPlan.sceneResourceUsage).toEqual({
      vertices:
        singleCompiled.canonicalSceneExecutionPlan.sceneResourceUsage.vertices +
        360,
      triangles:
        singleCompiled.canonicalSceneExecutionPlan.sceneResourceUsage.triangles +
        180,
      colliders:
        singleCompiled.canonicalSceneExecutionPlan.sceneResourceUsage.colliders +
        1,
    });
  });

  it("excludes normalized resources reachable only from unused Definitions", () => {
    const spec = createValidPackageSubjectWorldV4();
    spec.resources = {
      ...spec.resources,
      subjectDefinitions: [
        ...spec.resources.subjectDefinitions,
        createValidRiggedPackageDefinition(),
      ],
    };
    const normalized = normalizeAuthoringSpecV4(spec);
    expect(normalized.ok).toBe(true);
    expect(normalized.value?.resources.subjectAssets).toHaveLength(1);

    const result = compileWorld({
      normalizedWorldIr: normalized.value!,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash!,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Unused resource fixture did not compile.");
    expect(result.worldRuntimeBootstrap).toMatchObject({
      subjectAssets: [],
      rigProfiles: [],
      animationSets: [],
      colliderProfiles: [expect.objectContaining({
        colliderProfileRef: COLLIDER_PROFILE_REF,
      })],
    });
  });

  it.each([
    {
      label: "missing reachable Subject Asset row",
      mutate: (world: NormalizedWorldIRV4) => {
        world.resources.subjectAssets = [];
      },
      message:
        "NormalizedWorldIR invariant violated: missing Subject Asset 'worldkit://subject-asset/humanoid.golden@2'.",
    },
    {
      label: "duplicate Subject Asset row",
      mutate: (world: NormalizedWorldIRV4) => {
        world.resources.subjectAssets = [
          ...world.resources.subjectAssets,
          structuredClone(world.resources.subjectAssets[0]!),
        ];
      },
      message:
        "NormalizedWorldIR invariant violated: duplicate Subject Asset 'worldkit://subject-asset/humanoid.golden@2'.",
    },
    {
      label: "mismatched Animation Set Asset row",
      mutate: (world: NormalizedWorldIRV4) => {
        world.resources.animationSets = world.resources.animationSets.map((row) => ({
          ...row,
          subjectAssetRef: "worldkit://subject-asset/other@1",
        }));
      },
      message:
        "NormalizedWorldIR invariant violated: Animation Set 'worldkit://animation-set/humanoid.ground.golden@2' targets Subject Asset 'worldkit://subject-asset/other@1', but Subject 'player' selects 'worldkit://subject-asset/humanoid.golden@2'.",
    },
  ])("rejects a $label with a stable diagnostic", ({ mutate, message }) => {
    const normalized = normalizeRiggedWorld();
    const world = structuredClone(normalized.value!);
    mutate(world);

    expect(compileNormalizedWorld(world)).toEqual({
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "COMPILER_NORMALIZED_IR_INVALID",
          instancePath: "/normalizedWorldIr",
          message,
        },
      ],
    });
  });

  it("compiles two instances from one resolved Package Definition", () => {
    const result = compilePackageWorld();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Package fixture did not compile.");
    expect(result.canonicalSceneExecutionPlan.schemaVersion).toBe(1);
    expect(result.worldRuntimeBootstrap.schemaVersion).toBe(1);
    expect(
      result.worldRuntimeBootstrap.subjectRuntimeDescriptors.map((subject) => ({
        entityId: subject.entityId,
        ref: subject.subjectDefinitionRef,
        hash: subject.subjectDefinitionHash,
      })),
    ).toEqual([
      {
        entityId: "pack-animal-a",
        ref: "package://subject-definition/coastal-pack-animal@1",
        hash: expect.stringMatching(/^sha256:/),
      },
      {
        entityId: "pack-animal-b",
        ref: "package://subject-definition/coastal-pack-animal@1",
        hash: expect.stringMatching(/^sha256:/),
      },
      expect.objectContaining({ entityId: "player" }),
    ]);
    expect(result.worldRuntimeBootstrap.subjectRuntimeDescriptors[0]?.subjectDefinitionHash).toBe(
      result.worldRuntimeBootstrap.subjectRuntimeDescriptors[1]?.subjectDefinitionHash,
    );
  });

  it("copies fixed Anchor position without adding Terrain or Collider height", () => {
    const result = compilePackageWorld();
    if (!result.ok) throw new Error("Package fixture did not compile.");
    const scenePlan = result.canonicalSceneExecutionPlan;
    const subjectInstance = scenePlan.subjectInstances.find(
      (candidate) => candidate.entityId === "pack-animal-a",
    )!;
    const subject = result.worldRuntimeBootstrap.subjectRuntimeDescriptors.find(
      (candidate) => candidate.entityId === "pack-animal-a",
    )!;

    expect(sampleTerrainHeight(scenePlan.terrain, [-4, 5])).not.toBe(0);
    expect(subjectInstance.subjectOriginPositionMetersXYZ).toEqual([-4, 0, 5]);
    expect(subject.collider).toMatchObject({
      radiusMeters: 0.7,
      heightMeters: 1.4,
      centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
    });
  });

  it("samples the exact rendered Terrain triangles rather than a bilinear surface", () => {
    const compiled = compilePackageWorld();
    if (!compiled.ok) throw new Error("Package fixture did not compile.");
    const terrain = {
      ...compiled.canonicalSceneExecutionPlan.terrain,
      centerMetersXZ: [0, 0] as const,
      sizeMetersXZ: [2, 2] as const,
      resolutionCellsXZ: [2, 2] as const,
      heightSamplesMeters: [0, 2, 4, 0],
    };

    expect(sampleTerrainHeight(terrain, [0, 0])).toBe(3);
  });

  it("propagates stable Sockets and normalized visual composition", () => {
    const compiled = compilePackageWorld();
    if (!compiled.ok) throw new Error("Package fixture did not compile.");
    const subject = compiled.worldRuntimeBootstrap.subjectRuntimeDescriptors.find(
      (candidate) => candidate.entityId === "pack-animal-a",
    )!;

    expect(subject.sockets.map((socket) => socket.id)).toEqual([
      "seat.mount",
      "tow.rear",
    ]);
    expect(subject.visualParts.map((part) => part.id)).toEqual([
      "body",
      "leg.back-left",
      "leg.back-right",
      "leg.front-left",
      "leg.front-right",
    ]);
    expect(subject.visualParts[0]).toHaveProperty(
      "localTransform.positionMetersXYZ",
    );
  });

  it("aggregates resource cost once per Subject instance", () => {
    const compiled = compilePackageWorld();
    if (!compiled.ok) throw new Error("Package fixture did not compile.");
    expect(compiled.canonicalSceneExecutionPlan.sceneResourceUsage).toEqual({
      vertices: 4_956,
      triangles: 9_380,
      colliders: 5,
    });
  });

  it("is deterministic for the same normalized input and seed", () => {
    const first = compilePackageWorld();
    const second = compilePackageWorld();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("Package fixtures did not compile.");
    expect(first.canonicalSceneExecutionPlan).toEqual(
      second.canonicalSceneExecutionPlan,
    );
    expect(first.worldRuntimeBootstrap).toEqual(second.worldRuntimeBootstrap);
    expect(first.executionPlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.executionPlanHash).toBe(second.executionPlanHash);
  });

  it("fails before runtime construction when the plan exceeds a resource budget", () => {
    const spec = createValidPackageSubjectWorldV4();
    spec.world = {
      ...spec.world,
      resourceBudget: { ...spec.world.resourceBudget, maxVertices: 100 },
    };
    const normalized = normalizeAuthoringSpecV4(spec);
    if (
      !normalized.ok ||
      normalized.value === undefined ||
      normalized.normalizedWorldIrHash === undefined
    ) {
      throw new Error("Fixture did not normalize.");
    }

    const result = compileWorld({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    });

    expect(result.ok).toBe(false);
    expect("canonicalSceneExecutionPlan" in result).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "COMPILER_RESOURCE_BUDGET_EXCEEDED",
        instancePath: "/world/resourceBudget/maxVertices",
      }),
    );
  });

  it("rejects a normalized hash that does not match the supplied V4 IR", () => {
    const normalized = normalizeAuthoringSpecV4(createValidPackageSubjectWorldV4());
    if (!normalized.ok || normalized.value === undefined) {
      throw new Error("Fixture did not normalize.");
    }

    const result = compileWorld({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: `sha256:${"0".repeat(64)}`,
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "COMPILER_NORMALIZED_HASH_MISMATCH",
          instancePath: "/normalizedWorldIrHash",
        },
      ],
    });
  });

  it("compiles V4 solved layout IR into the exact Canonical Scene layout", () => {
    const normalized = normalizeSolvedLayoutWorldV4();
    const result = compileWorld({
      normalizedWorldIr: normalized.value!,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash!,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Solved layout fixture did not compile.");
    expect(result.canonicalSceneExecutionPlan).toMatchObject({
      kind: "worldkit-canonical-scene-execution-plan",
      schemaVersion: 1,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
      layout: {
        layoutSolveReportHash: normalized.layoutSolveReportHash,
        placementsByEntityId: {
          "spawn-main": expect.objectContaining({
            entityId: "spawn-main",
            placementProvenance: expect.objectContaining({ kind: "solved" }),
          }),
          "wall-east": expect.objectContaining({
            entityId: "wall-east",
            placementProvenance: expect.objectContaining({ kind: "fixed" }),
          }),
        },
        layoutAssertions: expect.arrayContaining([
          expect.objectContaining({ constraintId: "spawn-inside", kind: "inside-region" }),
          expect.objectContaining({ constraintId: "spawn-supported", kind: "supported-by" }),
        ]),
      },
    });
    expect(result.worldRuntimeBootstrap.initialCamera).not.toHaveProperty(
      "aspectRatio",
    );
    expect(result.canonicalSceneExecutionPlan.terrain.heightSamplesHash).toBe(
      sha256CanonicalJson(normalized.value!.layout.heightfields[0]!.heightSamplesMeters),
    );
    const serialized = JSON.stringify(result.canonicalSceneExecutionPlan);
    expect(serialized).not.toContain('"constraints"');
    expect(serialized).not.toMatch(/candidateRegionIds|sourceUri|licenseUri|providerHandle/);
    expect(result.executionPlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("copies the solved spawn position and Y rotation without terrain resampling", () => {
    const normalized = normalizeSolvedLayoutWorldV4();
    const world = structuredClone(normalized.value!) as unknown as {
      nodes: Array<NormalizedWorldIRV4["nodes"][number]>;
    } & NormalizedWorldIRV4;
    const spawnAnchor = world.nodes.find(
      (node) => node.kind === "anchor" && node.id === "spawn-main",
    );
    if (spawnAnchor === undefined || spawnAnchor.kind !== "anchor") {
      throw new Error("Solved spawn Anchor fixture is missing.");
    }
    Object.assign(spawnAnchor, {
      transform: {
        ...spawnAnchor.transform,
        positionMetersXYZ: [0, 7.25, 0],
        rotationEulerRadiansXYZ: [0, Math.PI / 2, 0],
      },
    });

    const result = compileNormalizedWorld(world);
    if (!result.ok) throw new Error("Solved spawn fixture did not compile.");
    const terrain = result.canonicalSceneExecutionPlan.terrain;
    const subject = result.canonicalSceneExecutionPlan.subjectInstances.find(
      (candidate) => candidate.entityId === "player",
    );

    expect(new Set(terrain.heightSamplesMeters).size).toBeGreaterThan(1);
    expect(sampleTerrainHeight(terrain, [0, 0])).not.toBe(0);
    expect(subject?.subjectOriginPositionMetersXYZ).toEqual([0, 7.25, 0]);
    expect(subject?.subjectFacingRadians).toBe(Math.PI / 2);
  });

  it("rejects a Subject spawn inside blocked water", () => {
    const spec = createValidAuthoringSpec();
    const water = spec.nodes.find((node) => node.kind === "water");
    const spawn = spec.nodes.find((node) => node.kind === "anchor" && node.id === "spawn-main");
    if (water?.kind !== "water" || spawn?.kind !== "anchor" || spawn.placement.kind !== "fixed") {
      throw new Error("Canonical blocked-water fixture is incomplete.");
    }
    water.components.water.traversalMode = "blocked";
    spawn.placement.transform.positionMetersXYZ = [25, 0, 0];

    const normalized = normalizeAuthoringSpecV4(spec);
    if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
      throw new Error(`Blocked-water fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`);
    }
    const result = compileWorld({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    });

    expect(result.ok).toBe(false);
    expect("canonicalSceneExecutionPlan" in result).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "COMPILER_SPAWN_IN_BLOCKED_WATER",
      instancePath: "/nodes/player/spawnAnchorEntityId",
      details: { subjectEntityId: "player", waterEntityId: "lake-main" },
    }));
  });

  it("rejects capsule-disc overlap with blocked water when the spawn center is outside", () => {
    const spec = createValidAuthoringSpec();
    const water = spec.nodes.find((node) => node.kind === "water");
    const spawn = spec.nodes.find((node) => node.kind === "anchor" && node.id === "spawn-main");
    if (water?.kind !== "water" || spawn?.kind !== "anchor" || spawn.placement.kind !== "fixed") {
      throw new Error("Canonical blocked-water edge fixture is incomplete.");
    }
    water.components.water.traversalMode = "blocked";
    water.components.water.waterLevelMeters = 1;
    water.components.water.depthMeters = 2;
    spawn.placement.transform.positionMetersXYZ = [37.2, 0, 0];

    const normalized = normalizeAuthoringSpecV4(spec);
    if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
      throw new Error(`Blocked-water edge fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`);
    }

    expect(compileWorld({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    }).diagnostics).toContainEqual(expect.objectContaining({
      code: "COMPILER_SPAWN_IN_BLOCKED_WATER",
    }));
  });

  it.each([
    { label: "outside blocked water", traversalMode: "blocked" as const, spawn: [0, 0, 30] as const },
    { label: "inside explicitly walkable water", traversalMode: "walkable" as const, spawn: [25, 0, 0] as const },
  ])("allows a Subject spawn $label", ({ traversalMode, spawn: spawnPosition }) => {
    const spec = createValidAuthoringSpec();
    const water = spec.nodes.find((node) => node.kind === "water");
    const spawn = spec.nodes.find((node) => node.kind === "anchor" && node.id === "spawn-main");
    if (water?.kind !== "water" || spawn?.kind !== "anchor" || spawn.placement.kind !== "fixed") {
      throw new Error("Canonical allowed-water fixture is incomplete.");
    }
    water.components.water.traversalMode = traversalMode;
    spawn.placement.transform.positionMetersXYZ = spawnPosition;

    const normalized = normalizeAuthoringSpecV4(spec);
    if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
      throw new Error(`Allowed-water fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`);
    }
    expect(compileWorld({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    }).ok).toBe(true);
  });

  it("allows a Subject spawn below an elevated blocked-water volume", () => {
    const spec = createValidAuthoringSpec();
    const water = spec.nodes.find((node) => node.kind === "water");
    const spawn = spec.nodes.find((node) => node.kind === "anchor" && node.id === "spawn-main");
    if (water?.kind !== "water" || spawn?.kind !== "anchor" || spawn.placement.kind !== "fixed") {
      throw new Error("Canonical elevated-water fixture is incomplete.");
    }
    water.components.water.traversalMode = "blocked";
    water.components.water.waterLevelMeters = 5;
    water.components.water.depthMeters = 2;
    spawn.placement.transform.positionMetersXYZ = [25, 0, 0];

    const normalized = normalizeAuthoringSpecV4(spec);
    if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
      throw new Error(`Elevated-water fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`);
    }

    expect(compileWorld({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    }).diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "COMPILER_SPAWN_IN_BLOCKED_WATER" }),
    );
  });

  it("rejects a Subject spawn inside a static collision object's footprint", () => {
    const spec = createValidAuthoringSpec();
    const object = spec.nodes.find((node) => node.kind === "object");
    const spawn = spec.nodes.find((node) => node.kind === "anchor" && node.id === "spawn-main");
    if (object?.kind !== "object" || object.placement.kind !== "fixed" ||
        spawn?.kind !== "anchor" || spawn.placement.kind !== "fixed") {
      throw new Error("Canonical static-blocker fixture is incomplete.");
    }
    object.placement.transform.positionMetersXYZ = [0, 2, 30];
    spawn.placement.transform.positionMetersXYZ = [0, 0, 30];

    const normalized = normalizeAuthoringSpecV4(spec);
    if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
      throw new Error(`Static-blocker fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`);
    }
    const result = compileWorld({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "COMPILER_SPAWN_INSIDE_STATIC_BLOCKER",
      instancePath: "/nodes/player/spawnAnchorEntityId",
      details: { subjectEntityId: "player", objectEntityId: "wall-east" },
    }));
  });

  it("conservatively rejects overlap along a non-uniform sphere blocker's long axis", () => {
    const spec = createValidAuthoringSpec();
    const prototypes = spec.resources.prototypes as unknown as Array<
      (typeof spec.resources.prototypes)[number]
    >;
    prototypes[0] = {
      id: "wall",
      version: 1,
      kind: "primitive",
      primitive: "sphere",
      radiusMeters: 1,
      collisionEnabled: true,
      semantic: { classId: "obstacle.sphere" },
    };
    const object = spec.nodes.find((node) => node.kind === "object");
    const spawn = spec.nodes.find((node) => node.kind === "anchor" && node.id === "spawn-main");
    if (object?.kind !== "object" || object.placement.kind !== "fixed" ||
        spawn?.kind !== "anchor" || spawn.placement.kind !== "fixed") {
      throw new Error("Canonical non-uniform blocker fixture is incomplete.");
    }
    object.placement.transform.positionMetersXYZ = [0, 1, 30];
    object.placement.transform.scaleXYZ = [4, 1, 1];
    spawn.placement.transform.positionMetersXYZ = [4.2, 0, 30];

    const normalized = normalizeAuthoringSpecV4(spec);
    if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
      throw new Error(`Non-uniform blocker fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`);
    }

    expect(compileWorld({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    }).diagnostics).toContainEqual(expect.objectContaining({
      code: "COMPILER_SPAWN_INSIDE_STATIC_BLOCKER",
    }));
  });

  it("allows exact capsule-foot contact with a static collision object's top", () => {
    const spec = createValidAuthoringSpec();
    const object = spec.nodes.find((node) => node.kind === "object");
    const spawn = spec.nodes.find((node) => node.kind === "anchor" && node.id === "spawn-main");
    if (object?.kind !== "object" || object.placement.kind !== "fixed" ||
        spawn?.kind !== "anchor" || spawn.placement.kind !== "fixed") {
      throw new Error("Canonical static-blocker contact fixture is incomplete.");
    }
    object.placement.transform.positionMetersXYZ = [0, -2, 30];
    spawn.placement.transform.positionMetersXYZ = [0, 0, 30];

    const normalized = normalizeAuthoringSpecV4(spec);
    if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
      throw new Error(`Static-blocker contact fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`);
    }

    expect(compileWorld({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    }).diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "COMPILER_SPAWN_INSIDE_STATIC_BLOCKER" }),
    );
  });

  it.each(PRODUCT_FIXED_SPAWN_CASES)(
    "keeps $label fixed spawn Anchors at their absolute terrain-surface positions",
    async ({ path, spawns }) => {
      const spec = JSON.parse(
        await readFile(new URL(path, import.meta.url), "utf8"),
      ) as AuthoringSpecV4;
      const normalized = normalizeAuthoringSpecV4(spec);
      if (
        !normalized.ok ||
        normalized.value === undefined ||
        normalized.normalizedWorldIrHash === undefined
      ) {
        throw new Error(
          `Product fixture did not normalize: ${JSON.stringify(normalized.diagnostics)}`,
        );
      }
      const gameplayBootstrap = createGameplayBootstrapV1({
          kind: "gameplay-bootstrap",
          id: `${spec.id}.compile-product-fixture`,
          version: 1,
          resourceRef: `worldkit://gameplay-bootstrap/${spec.id}.compile-product-fixture@1`,
          semanticFactProjectorProfileResource:
            RETAINED_SUPPORT_SEMANTIC_FACT_PROJECTOR_PROFILE_RESOURCE_V1,
          entityDescriptors: [],
          featureResourceLocks: [],
          semanticActionDefinitions: [],
          availableCapabilityRefs: [],
          initialRelationshipStates: [],
        });
      const compiled = compileCanonicalWorldV1({
        normalizedWorldIr: normalized.value,
        normalizedWorldIrHash: normalized.normalizedWorldIrHash,
        gameplayBootstrap,
        worldRuntimeBootstrapRef:
          `worldkit://world-runtime-bootstrap/${spec.id}@1`,
      });
      if (!compiled.ok) throw new Error("Product fixture did not compile.");
      const scenePlan = compiled.canonicalSceneExecutionPlan;
      const runtimeBootstrap = compiled.worldRuntimeBootstrap;

      for (const expected of spawns) {
        const authoredAnchor = spec.nodes.find(
          (node) => node.kind === "anchor" && node.id === expected.anchorEntityId,
        );
        const anchor = normalized.value.nodes.find(
          (node) => node.kind === "anchor" && node.id === expected.anchorEntityId,
        );
        const subjectInstance = scenePlan.subjectInstances.find(
          (candidate) => candidate.entityId === expected.subjectEntityId,
        );
        expect(authoredAnchor?.kind).toBe("anchor");
        if (
          authoredAnchor?.kind !== "anchor" ||
          authoredAnchor.placement.kind !== "fixed"
        ) {
          continue;
        }
        expect(authoredAnchor.placement.transform.positionMetersXYZ).toEqual(
          expected.authoredPositionMetersXYZ,
        );
        expect(anchor?.kind).toBe("anchor");
        if (anchor?.kind !== "anchor") continue;
        expect(anchor.transform.positionMetersXYZ).toEqual(
          expected.normalizedPositionMetersXYZ,
        );
        expect(
          sampleTerrainHeight(scenePlan.terrain, [
            expected.authoredPositionMetersXYZ[0],
            expected.authoredPositionMetersXYZ[2],
          ]),
        ).toBeCloseTo(expected.authoredPositionMetersXYZ[1], 12);
        expect(subjectInstance?.subjectOriginPositionMetersXYZ).toEqual(
          expected.normalizedPositionMetersXYZ,
        );
        expect(subjectInstance?.subjectFacingRadians).toBe(0);
        expect(runtimeBootstrap.subjectRuntimeDescriptors).toContainEqual(
          expect.objectContaining({ entityId: expected.subjectEntityId }),
        );
      }
    },
  );

  it("projects forged nested IR objects explicitly and rejects a V4 IR hash mismatch", () => {
    const normalized = normalizeSolvedLayoutWorldV4();
    const forged = structuredClone(normalized.value!) as unknown as {
      layout: {
        regions: Array<Record<string, unknown>>;
        assertions: Array<Record<string, unknown>>;
      };
    };
    forged.layout.regions[0]!.providerHandle = "private-region-handle";
    forged.layout.assertions[0]!.providerHandle = "private-assertion-handle";
    const projected = compileWorld({
      normalizedWorldIr: forged as unknown as NonNullable<typeof normalized.value>,
      normalizedWorldIrHash: sha256CanonicalJson(forged) as Sha256HashV1,
    });
    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error("Projected fixture did not compile.");
    expect(JSON.stringify({
      scene: projected.canonicalSceneExecutionPlan,
      runtime: projected.worldRuntimeBootstrap,
    })).not.toContain("private-");

    expect(compileWorld({
      normalizedWorldIr: normalized.value!,
      normalizedWorldIrHash: `sha256:${"0".repeat(64)}`,
    })).toMatchObject({
      ok: false,
      diagnostics: [{
        code: "COMPILER_NORMALIZED_HASH_MISMATCH",
        instancePath: "/normalizedWorldIrHash",
      }],
    });
  });
});
