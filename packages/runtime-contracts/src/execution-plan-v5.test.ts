import { describe, expect, it } from "vitest";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  hashRootMotionSourceV1,
  type RootMotionSourceBodyV1,
} from "@whitebox-world/character-movement";
import {
  hashActionPresentationBindingV1,
  type ActionPresentationBindingBodyV1,
} from "@whitebox-world/subject-actions";

import {
  hashExecutionPlanV5,
  parseExecutionPlanV5,
  type ExecutionPlanV5,
  type ExecutionSubjectCapabilityAssemblyV1,
} from "./execution-plan";

const HASH = `sha256:${"a".repeat(64)}` as const;

const rootMotionBody = {
  schemaVersion: 1,
  resourceRef: "worldkit://root-motion/execution-plan-test@1",
  fixedDeltaSeconds: 1 / 60,
  samples: [{
    translationDeltaMetersXYZ: [0, 0, 0.1],
    facingYawDeltaRadians: 0,
  }],
} as const satisfies RootMotionSourceBodyV1;
const rootMotionSource = {
  ...rootMotionBody,
  contentHash: hashRootMotionSourceV1(rootMotionBody),
};
const actionPresentationBindingBody = {
  kind: "action-presentation-binding",
  schemaVersion: 1,
  resourceRef: "worldkit://action-presentation/execution-plan-test@1",
  presentationKey: "action.execution-plan-test",
  semanticActionRef: "worldkit://semantic-action/execution-plan-test@1",
  semanticActionHash: HASH,
  isInterruptible: true,
  clip: {
    sourceClipName: "ExecutionPlanTest",
    loopMode: "once",
    playbackSpeedRatio: 1,
    blendDurationTicks: 3,
  },
  rootMotion: {
    mode: "locked",
    rootMotionSourceRef: rootMotionSource.resourceRef,
    rootMotionSourceHash: rootMotionSource.contentHash,
    priority: 100,
  },
} as const satisfies ActionPresentationBindingBodyV1;
const actionPresentationBinding = {
  ...actionPresentationBindingBody,
  contentHash: hashActionPresentationBindingV1(
    actionPresentationBindingBody,
  ),
};

function actionPresentationRegistryFixture() {
  return {
    schemaVersion: 1 as const,
    bindings: [actionPresentationBinding],
    rootMotionSources: [rootMotionSource],
  };
}

function capabilityAssemblyFixture(): ExecutionSubjectCapabilityAssemblyV1 {
  const motionProfile = {
    resourceRef: "worldkit://motion-profile/test@1",
    contentHash: HASH,
    motionKernelRef: "worldkit://motion-kernel/test@1",
    motionTags: ["ground"],
  };
  return {
    authoringAvailability: "recommended",
    physicsBodyProfileRef: "worldkit://physics-body-profile/test@1",
    locomotionProfileRef: "worldkit://locomotion-profile/test@1",
    defaultMotionProfile: motionProfile,
    optionalMotionProfiles: [],
    fallbackMotionProfile: motionProfile,
    motionKernels: [{
      resourceRef: "worldkit://motion-kernel/test@1",
      implementationId: "free-ground",
      commandKind: "planar-vector",
      supportedMediums: ["ground", "air"],
      fallbackMotionProfileRef: motionProfile.resourceRef,
      deterministic: true,
    }],
    controlProfile: {
      resourceRef: "worldkit://control-profile/test@1",
      contentHash: HASH,
      commandKind: "planar-vector",
      inputSpace: "camera-relative",
      facingPolicy: "align-to-move",
      lateralMovementPolicy: "allowed",
      moveDeadzoneRatio: 0.1,
    },
    cameraContext: {
      resourceRef: "worldkit://camera-context/test@1",
      defaultCameraRigProfileRef: "worldkit://camera-profile/test@1",
      rules: [],
      cameraRigProfiles: [],
      cameraModifierProfiles: [],
    },
    mediumProfile: {
      resourceRef: "worldkit://medium-profile/test@1",
      air: { gravityRatio: 1, linearDragPerSecond: 0 },
    },
    relationshipProfiles: [],
    harnessProfileRef: "worldkit://harness-profile/test@1",
    requiredHarnessCheckIds: ["H01"],
    actionOrPoseSetRef: "worldkit://pose-set/test@1",
    renderBindingProfileRef: "worldkit://render-binding/test@1",
  };
}

function planFixture(): ExecutionPlanV5 {
  const resourceLockEntries = [{
    resourceRef: "package://gameplay/bootstrap@1",
    resourceKind: "gameplay-bootstrap" as const,
    resolvedVersion: "1",
    contentHash: HASH,
  }];
  const heightSamplesMeters = [0, 0, 0, 0];
  return {
    kind: "worldkit-execution-plan",
    schemaVersion: 5,
    id: "world.test",
    seed: 7,
    runtimeBackend: "babylon-havok",
    normalizedWorldIrHash: HASH,
    resourceLockHash: sha256CanonicalJson(resourceLockEntries),
    coordinateSystem: "right-handed-y-up-minus-z-forward",
    gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
    atmospherePreset: "clear-day",
    terrain: {
      entityId: "terrain-main",
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [8, 8],
      resolutionCellsXZ: [2, 2],
      heightSamplesMeters,
      heightSamplesHash: sha256CanonicalJson(heightSamplesMeters),
      minimumHeightMeters: 0,
      maximumHeightMeters: 0,
      semanticClassId: "terrain.ground",
    },
    waters: [],
    objects: [],
    subjectAssets: [],
    rigProfiles: [],
    animationSets: [],
    colliderProfiles: [],
    actionPresentationRegistry: {
      schemaVersion: 1,
      bindings: [],
      rootMotionSources: [],
    },
    initialControlledEntityId: "player",
    subjects: [{
      entityId: "player",
      subjectDefinitionRef: "worldkit://subject-definition/test@1",
      subjectDefinitionHash: HASH,
      bodyTopology: "biped",
      semanticClassId: "subject.test",
      spawnAnchorEntityId: "spawn-main",
      spawnSubjectOriginPositionMetersXYZ: [0, 0, 0],
      spawnSubjectFacingRadians: 0,
      forwardDirection: "-z",
      visualParts: [],
      visualBinding: { mode: "static" },
      sockets: [],
      mountSlots: [],
      collider: {
        kind: "capsule",
        radiusMeters: 0.3,
        heightMeters: 1.8,
        centerOffsetFromSubjectOriginMetersXYZ: [0, 0.9, 0],
        massKilograms: 75,
        maxSlopeDegrees: 42,
        maxStepHeightMeters: 0.3,
      },
      locomotion: { allowWalk: true, allowRun: true, allowJump: true },
      locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
      locomotionCapabilityHash: HASH,
      physicsBodyProfileRef: "worldkit://physics-body-profile/test@1",
      locomotionProfileRef: "worldkit://locomotion-profile/test@1",
      controlFeel: {
        resourceRef: "worldkit://control-feel-profile/test@1",
        contentHash: HASH,
        walkSpeedMetersPerSecond: 2,
        runSpeedMetersPerSecond: 4,
        jumpSpeedMetersPerSecond: 5,
        accelerationMetersPerSecondSquared: 12,
        decelerationMetersPerSecondSquared: 16,
        turnRateRadiansPerSecond: 8,
        moveResponseExponent: 1,
        airControlRatio: 0.25,
        coyoteTimeSeconds: 0.1,
        jumpBufferSeconds: 0.1,
        variableJumpHoldSeconds: 0.2,
        jumpHoldGravityRatio: 0.5,
        jumpReleaseGravityRatio: 2,
      },
      availableControlFeels: [],
      capabilityAssembly: capabilityAssemblyFixture(),
    }],
    initialRelationships: [],
    camera: {
      cameraEntityId: "camera-main",
      rigRef: "worldkit://camera/third-person.standard@1",
      targetEntityId: "player",
      pitchRadians: 0.2,
      distanceMeters: 5,
      targetHeightMeters: 1.5,
      fovDegrees: 60,
      manualSwitchAllowed: true,
      aspectRatio: 16 / 9,
    },
    resourceUsage: { vertices: 4, triangles: 2, colliders: 1 },
    layout: {
      solverProfileRef: "worldkit://layout-solver/default@1",
      resolvedVersion: "1",
      solverProfileHash: HASH,
      layoutSolveReportHash: HASH,
      regions: [],
      routes: [],
      screenRegions: [],
      placementsByEntityId: {},
      layoutAssertions: [],
    },
    authoringSpecHash: HASH,
    resourceLockEntries,
    traversal: {
      surfaces: [],
      traversalAreas: [],
      connectivityRequirements: [],
      anchorEntityIds: [],
    },
    staticColliders: [],
  };
}

describe("ExecutionPlanV5 canonical boundary", () => {
  it("requires a closed, hash-locked Action Presentation registry", () => {
    const {
      actionPresentationRegistry: _missingRegistry,
      ...missingRegistry
    } = planFixture();
    expect(() => parseExecutionPlanV5(missingRegistry)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );

    const unknownRegistryKey = {
      ...planFixture(),
      actionPresentationRegistry: {
        ...actionPresentationRegistryFixture(),
        legacyAlias: true,
      },
    };
    expect(() => parseExecutionPlanV5(unknownRegistryKey)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );

    const badBindingHash = {
      ...planFixture(),
      actionPresentationRegistry: {
        ...actionPresentationRegistryFixture(),
        bindings: [{ ...actionPresentationBinding, contentHash: HASH }],
      },
    };
    expect(() => parseExecutionPlanV5(badBindingHash)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );

    const badSourceHash = {
      ...planFixture(),
      actionPresentationRegistry: {
        ...actionPresentationRegistryFixture(),
        rootMotionSources: [{ ...rootMotionSource, contentHash: HASH }],
      },
    };
    expect(() => parseExecutionPlanV5(badSourceHash)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
  });

  it("admits, detaches and deeply freezes a serializable non-empty Action Presentation registry", () => {
    const registry = actionPresentationRegistryFixture();
    const input = {
      ...planFixture(),
      actionPresentationRegistry: registry,
    };
    const parsed = parseExecutionPlanV5(input);

    expect(parsed.actionPresentationRegistry).toEqual(registry);
    expect(parsed.actionPresentationRegistry).not.toBe(registry);
    expect(Object.isFrozen(parsed.actionPresentationRegistry)).toBe(true);
    expect(Object.isFrozen(parsed.actionPresentationRegistry.bindings)).toBe(true);
    expect(Object.isFrozen(parsed.actionPresentationRegistry.bindings[0]?.clip)).toBe(true);
    expect(Object.isFrozen(parsed.actionPresentationRegistry.rootMotionSources)).toBe(true);
    expect(Object.isFrozen(
      parsed.actionPresentationRegistry.rootMotionSources[0]?.samples[0]
        ?.translationDeltaMetersXYZ,
    )).toBe(true);
    expect(JSON.parse(JSON.stringify(parsed.actionPresentationRegistry))).toEqual(
      registry,
    );
    expect(hashExecutionPlanV5(input)).toBe(
      hashExecutionPlanV5(structuredClone(input)),
    );
    expect(hashExecutionPlanV5(input)).not.toBe(hashExecutionPlanV5({
      ...input,
      actionPresentationRegistry: {
        schemaVersion: 1,
        bindings: [],
        rootMotionSources: [],
      },
    }));
  });

  it("parses an accessor-free closed Plan into a detached deeply frozen value", () => {
    const input = planFixture();
    const parsed = parseExecutionPlanV5(input);

    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.terrain)).toBe(true);
    expect(Object.isFrozen(parsed.terrain.heightSamplesMeters)).toBe(true);
    expect(Object.isFrozen(parsed.resourceLockEntries[0])).toBe(true);

    (input.terrain.heightSamplesMeters as number[])[0] = 9;
    expect(parsed.terrain.heightSamplesMeters[0]).toBe(0);
  });

  it("preserves committed Locomotion and Action Camera rule predicates", () => {
    const input = structuredClone(planFixture());
    input.subjects[0]!.capabilityAssembly.cameraContext.rules = [{
      id: "run-action",
      priority: 100,
      when: {
        locomotionStatuses: ["active"],
        mobilityModes: ["grounded"],
        gaits: ["run"],
        verticalPhases: ["none"],
        requiredActiveActionRefs: ["worldkit://semantic-action/aim@1"],
        actionInterruptibility: "interruptible",
      },
      cameraModifierRefs: ["worldkit://camera-modifier/run@1"],
    }];

    expect(parseExecutionPlanV5(input).subjects[0]!.capabilityAssembly
      .cameraContext.rules).toEqual(
      input.subjects[0]!.capabilityAssembly.cameraContext.rules,
    );

    const invalid = structuredClone(input) as unknown as {
      subjects: Array<{
        capabilityAssembly: {
          cameraContext: { rules: Array<{ when: Record<string, unknown> }> };
        };
      }>;
    };
    invalid.subjects[0]!.capabilityAssembly.cameraContext.rules[0]!.when
      .actionInterruptibility = "sometimes";
    expect(() => parseExecutionPlanV5(invalid)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
  });

  it("parses only closed initial mountedOn state with Subject and slot closure", () => {
    const base = planFixture();
    const subjects: ExecutionPlanV5["subjects"] = [
      {
        ...base.subjects[0]!,
        sockets: [{
          id: "FootAlignment",
          kind: "local",
          localTransform: {
            positionMetersXYZ: [0, 0, 0],
            rotationEulerRadiansXYZ: [0, 0, 0],
          },
          semanticTags: ["rider"],
        }],
      },
      {
        ...structuredClone(base.subjects[0]!),
        entityId: "board",
        spawnAnchorEntityId: "spawn-board",
        sockets: [{
          id: "MountStand",
          kind: "local",
          localTransform: {
            positionMetersXYZ: [0, 0.2, 0],
            rotationEulerRadiansXYZ: [0, 0, 0],
          },
          semanticTags: ["mount"],
        }],
        mountSlots: [{
          id: "stand",
          kind: "mount-slot",
          mode: "stand",
          mountSocketId: "MountStand",
          riderSubjectOriginOffsetMetersXYZ: [0, 0.2, 0],
          dismountCandidateOffsetsMetersXYZ: [[0.8, 0, 0], [-0.8, 0, 0]],
        }],
        capabilityAssembly: {
          ...capabilityAssemblyFixture(),
          relationshipProfiles: [{
            resourceRef:
              "worldkit://relationship-profile/mounted-on.stand-ground@1",
            relationshipType: "mountedOn",
            requiredRiderSocketIds: ["FootAlignment"],
            requiredMountSocketIds: ["MountStand"],
            controlTransferMode: "to-mount",
            cameraTargetRole: "controlled-entity",
            maximumMountDistanceMeters: 2,
          }],
        },
      },
    ];
    const input: ExecutionPlanV5 = {
      ...base,
      subjects,
      initialControlledEntityId: "board",
      camera: { ...base.camera, targetEntityId: "board" },
      initialRelationships: [{
        id: "player-mounted-on-board",
        type: "mountedOn",
        schemaVersion: 1,
        riderEntityId: "player",
        mountEntityId: "board",
        mountSlotId: "stand",
        establishedSimulationTick: 0,
      }],
    };

    expect(parseExecutionPlanV5(input).initialRelationships).toEqual(
      input.initialRelationships,
    );

    const danglingSlot = {
      ...structuredClone(input),
      initialRelationships: [{
        ...input.initialRelationships[0]!,
        mountSlotId: "missing",
      }],
    };
    expect(() => parseExecutionPlanV5(danglingSlot)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );

    const oldGenericShape = structuredClone(input) as unknown as {
      initialRelationships: Array<Record<string, unknown>>;
    };
    oldGenericShape.initialRelationships = [{
      id: "legacy",
      type: "mount",
      schemaVersion: 1,
      sourceEntityId: "player",
      targetEntityId: "board",
      params: { mountSlotId: "stand" },
      establishedSimulationTick: 0,
    }];
    expect(() => parseExecutionPlanV5(oldGenericShape)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
  });

  it("rejects the removed controlledEntityId alias and unknown nested fields", () => {
    const oldAlias: Record<string, unknown> = {
      ...planFixture(),
      controlledEntityId: "player",
    };
    delete oldAlias.initialControlledEntityId;
    const nestedUnknown = planFixture() as ExecutionPlanV5 & {
      terrain: ExecutionPlanV5["terrain"] & { providerHandle: string };
    };
    nestedUnknown.terrain = {
      ...nestedUnknown.terrain,
      providerHandle: "opaque",
    };

    expect(() => parseExecutionPlanV5(oldAlias)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
    expect(() => parseExecutionPlanV5(nestedUnknown)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
  });

  it("rejects retired Motion Kernel Catalog fields from capability assemblies", () => {
    const withRuntimeParameterNames = structuredClone(planFixture()) as unknown as {
      subjects: Array<{
        capabilityAssembly: {
          motionKernels: Array<Record<string, unknown>>;
        };
      }>;
    };
    withRuntimeParameterNames.subjects[0]!.capabilityAssembly
      .motionKernels[0]!.runtimeParameterNames = [];

    const withParameterSchemaRef = structuredClone(planFixture()) as unknown as {
      subjects: Array<{
        capabilityAssembly: {
          motionKernels: Array<Record<string, unknown>>;
        };
      }>;
    };
    withParameterSchemaRef.subjects[0]!.capabilityAssembly
      .motionKernels[0]!.parameterSchemaRef =
        "worldkit://motion-parameter-schema/free-ground@1";

    expect(() => parseExecutionPlanV5(withRuntimeParameterNames)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
    expect(() => parseExecutionPlanV5(withParameterSchemaRef)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
  });

  it("parses mountedOn Relationship Profiles and rejects the old generic mount shape", () => {
    const input = structuredClone(planFixture()) as unknown as {
      subjects: Array<{
        capabilityAssembly: {
          relationshipProfiles: Array<Record<string, unknown>>;
        };
      }>;
    };
    input.subjects[0]!.capabilityAssembly.relationshipProfiles = [{
      resourceRef:
        "worldkit://relationship-profile/mounted-on.stand-ground@1",
      relationshipType: "mountedOn",
      requiredRiderSocketIds: ["FootAlignment"],
      requiredMountSocketIds: ["MountStand"],
      controlTransferMode: "to-mount",
      cameraTargetRole: "controlled-entity",
      maximumMountDistanceMeters: 2,
    }];

    expect(parseExecutionPlanV5(input).subjects[0]!.capabilityAssembly
      .relationshipProfiles).toEqual(
      input.subjects[0]!.capabilityAssembly.relationshipProfiles,
    );

    const oldShape = structuredClone(input);
    oldShape.subjects[0]!.capabilityAssembly.relationshipProfiles = [{
      resourceRef: "worldkit://relationship-profile/mount.reserved@1",
      relationshipType: "mount",
      requiredSourceSocketIds: ["SeatAlignment"],
      requiredTargetSocketIds: ["MountSeat"],
      controlTransferPolicy: "transfer-to-target",
      cameraTargetPolicy: "controlled-entity",
    }];
    expect(() => parseExecutionPlanV5(oldShape)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
  });

  it("rejects a V5 Subject without its locked capability assembly", () => {
    const input = structuredClone(planFixture()) as unknown as {
      subjects: Array<Record<string, unknown>>;
    };
    delete input.subjects[0]!.capabilityAssembly;

    expect(() => parseExecutionPlanV5(input)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
  });

  it("rejects more than one Asset Part for a static Subject", () => {
    const input = structuredClone(planFixture());
    const assetPart = {
      id: "body.asset",
      kind: "asset" as const,
      subjectAssetRef: "worldkit://subject-asset/test@1",
      localTransform: {
        positionMetersXYZ: [0, 0, 0] as [number, number, number],
        rotationEulerRadiansXYZ: [0, 0, 0] as [number, number, number],
        scaleXYZ: [1, 1, 1] as [number, number, number],
      },
      appearance: { mode: "whitebox-neutral" as const },
      semanticTags: ["body"],
    };
    input.subjects[0]!.visualParts = [
      assetPart,
      { ...structuredClone(assetPart), id: "body.asset.duplicate" },
    ];

    expect(() => parseExecutionPlanV5(input)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
  });

  it("rejects unknown serialized Subject Action, Bone, and Topology terms", () => {
    const unknownAction = structuredClone(planFixture()) as unknown as {
      animationSets: Array<Record<string, unknown>>;
    };
    unknownAction.animationSets = [{
      animationSetRef: "worldkit://animation-set/test@1",
      subjectAssetRef: "worldkit://subject-asset/test@1",
      rigProfileRef: "worldkit://rig-profile/test@1",
      defaultActionId: "teleport",
      requiredActionIds: ["teleport"],
      animationBindings: [{
        actionId: "teleport",
        sourceClipName: "teleport",
        loopMode: "once",
        playbackSpeedRatio: 1,
        blendDurationSeconds: 0.1,
        rootMotionMode: "in-place",
      }],
    }];

    const unknownBone = structuredClone(planFixture()) as unknown as {
      rigProfiles: Array<Record<string, unknown>>;
    };
    unknownBone.rigProfiles = [{
      rigProfileRef: "worldkit://rig-profile/test@1",
      bodyTopology: "biped",
      skeletonRootBoneName: "Armature",
      requiredBoneIds: ["root"],
      sourceNodeNameByBoneId: { root: "Armature" },
    }];

    const unknownTopology = structuredClone(planFixture()) as unknown as {
      subjects: Array<Record<string, unknown>>;
    };
    unknownTopology.subjects[0]!.bodyTopology = "hoverboard";

    for (const candidate of [unknownAction, unknownBone, unknownTopology]) {
      expect(() => parseExecutionPlanV5(candidate)).toThrowError(
        "EXECUTION_PLAN_V5_INVALID",
      );
    }
  });

  it("rejects accessors before reading them", () => {
    const input = planFixture() as unknown as Record<string, unknown>;
    let getterCalls = 0;
    Object.defineProperty(input, "initialControlledEntityId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "player";
      },
    });

    expect(() => parseExecutionPlanV5(input)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
    expect(getterCalls).toBe(0);
  });

  it("rejects null-prototype records at every canonical object boundary", () => {
    const root = Object.assign(Object.create(null) as object, planFixture());
    const nested = planFixture() as unknown as Record<string, unknown>;
    nested.resourceUsage = Object.assign(Object.create(null) as object, {
      vertices: 4,
      triangles: 2,
      colliders: 1,
    });

    expect(() => parseExecutionPlanV5(root)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
    expect(() => parseExecutionPlanV5(nested)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
  });

  it("rejects internally inconsistent Heightfield metadata", () => {
    const variants = [
      { resolutionCellsXZ: [0, 2] },
      { resolutionCellsXZ: [1.5, 2] },
      { heightSamplesMeters: [0, 0, 0] },
      { heightSamplesHash: HASH },
      { minimumHeightMeters: -1 },
      { maximumHeightMeters: 1 },
      { minimumHeightMeters: 1, maximumHeightMeters: 0 },
    ];

    for (const terrainPatch of variants) {
      const base = planFixture();
      const input = {
        ...base,
        terrain: { ...base.terrain, ...terrainPatch },
      };
      expect(() => parseExecutionPlanV5(input)).toThrowError(
        "EXECUTION_PLAN_V5_INVALID",
      );
    }
  });

  it("requires unique Subject ids and valid initial-control and camera targets", () => {
    const base = planFixture();
    const duplicate = {
      ...base,
      subjects: [...base.subjects, structuredClone(base.subjects[0]!)],
    };
    const missingInitialTarget = {
      ...planFixture(),
      initialControlledEntityId: "missing",
    };
    const cameraBase = planFixture();
    const missingCameraTarget = {
      ...cameraBase,
      camera: { ...cameraBase.camera, targetEntityId: "missing" },
    };

    expect(() => parseExecutionPlanV5(duplicate)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
    expect(() => parseExecutionPlanV5(missingInitialTarget)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
    expect(() => parseExecutionPlanV5(missingCameraTarget)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
  });

  it("uses the Resource Lock kind/ref pair as the unique key and canonicalizes order", () => {
    const base = planFixture();
    const sameRefDifferentKind = {
      ...base.resourceLockEntries[0]!,
      resourceKind: "subject-definition" as const,
    };
    const canonicalEntries = [
      base.resourceLockEntries[0]!,
      sameRefDifferentKind,
    ].sort((left, right) =>
      left.resourceRef.localeCompare(right.resourceRef) ||
      left.resourceKind.localeCompare(right.resourceKind));
    const input = {
      ...base,
      resourceLockEntries: [
        sameRefDifferentKind,
        base.resourceLockEntries[0]!,
      ],
      resourceLockHash: sha256CanonicalJson(canonicalEntries),
    };

    const parsed = parseExecutionPlanV5(input);
    expect(parsed.resourceLockEntries.map((entry) => entry.resourceKind)).toEqual([
      "gameplay-bootstrap",
      "subject-definition",
    ]);

    const duplicateEntry = structuredClone(input.resourceLockEntries[0]!);
    const duplicateEntries = [duplicateEntry, structuredClone(duplicateEntry)];
    const duplicatePair = {
      ...input,
      resourceLockEntries: duplicateEntries,
      resourceLockHash: sha256CanonicalJson(duplicateEntries),
    };
    expect(() => parseExecutionPlanV5(duplicatePair)).toThrowError(
      "EXECUTION_PLAN_V5_INVALID",
    );
  });

  it("hashes the canonical parsed Plan and rejects invalid input", () => {
    const input = planFixture();

    expect(hashExecutionPlanV5(input)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashExecutionPlanV5(structuredClone(input))).toBe(
      hashExecutionPlanV5(input),
    );
    expect(() => hashExecutionPlanV5({
      ...input,
      provider: "havok",
    })).toThrowError("EXECUTION_PLAN_V5_INVALID");
  });
});
