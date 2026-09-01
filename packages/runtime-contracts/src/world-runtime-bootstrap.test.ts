import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  hashRootMotionSourceV1,
  type RootMotionSourceBodyV1,
} from "@whitebox-world/character-movement";
import {
  hashActionPresentationBindingV1,
  type ActionPresentationBindingBodyV1,
} from "@whitebox-world/subject-actions";

import worldRuntimeBootstrapSchema from "./world-runtime-bootstrap-v1.schema.json";
import {
  createWorldRuntimeBootstrapV1,
  hashWorldRuntimeBootstrapBodyV1,
  parseWorldRuntimeBootstrapV1,
  worldRuntimeBootstrapCanonicalBytesV1,
  type RuntimeRigProfileV1,
  type RuntimeSubjectCapabilityAssemblyV1,
  type WorldRuntimeBootstrapBodyV1,
} from "./world-runtime-bootstrap";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const GAMEPLAY_REF = "worldkit://gameplay-bootstrap/runtime-test@1";

const rootMotionBody = {
  schemaVersion: 1,
  resourceRef: "worldkit://root-motion/runtime-bootstrap-test@1",
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
const actionBindingBody = {
  kind: "action-presentation-binding",
  schemaVersion: 1,
  resourceRef: "worldkit://action-presentation/runtime-bootstrap-test@1",
  presentationKey: "action.runtime-bootstrap-test",
  semanticActionRef: "worldkit://semantic-action/runtime-bootstrap-test@1",
  semanticActionHash: HASH_A,
  isInterruptible: true,
  clip: {
    sourceClipName: "RuntimeBootstrapTest",
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
const actionBinding = {
  ...actionBindingBody,
  contentHash: hashActionPresentationBindingV1(actionBindingBody),
};

const cameraParameters = {
  distanceMeters: 5,
  minimumDistanceMeters: 2,
  maximumDistanceMeters: 8,
  targetHeightMeters: 1.4,
  shoulderOffsetMeters: 0.2,
  pitchRadians: 0.2,
  minimumPitchRadians: -0.8,
  maximumPitchRadians: 0.6,
  positionDampingPerSecond: 8,
  horizontalPositionDampingPerSecond: 8,
  verticalPositionDampingPerSecond: 8,
  maximumPositionLagMeters: 2,
  rotationDampingPerSecond: 8,
  yawDampingPerSecond: 8,
  pitchDampingPerSecond: 8,
  collisionRadiusMeters: 0.2,
  collisionRetractionMetersPerSecond: 20,
  collisionRecoveryMetersPerSecond: 8,
  baseFovDegrees: 60,
  speedFovDegreesPerMeterPerSecond: 0,
  maximumSpeedFovDegrees: 0,
  lookAheadSeconds: 0,
  accelerationLookAheadSecondsSquared: 0,
  transitionSeconds: 0.2,
  minimumHeadingSpeedMetersPerSecond: 0.1,
  velocityHeadingDampingPerSecond: 8,
  fovDampingPerSecond: 8,
  horizontalDeadZoneRatio: 0,
  verticalDeadZoneRatio: 0,
  recenterDelaySeconds: 0.5,
  recenterDurationSeconds: 0.3,
  recenterMinimumSpeedMetersPerSecond: 0.5,
  teleportSnapDistanceMeters: 10,
  lookSensitivityXRatio: 1,
  lookSensitivityYRatio: 1,
} as const;

function capabilityAssemblyFixture(): RuntimeSubjectCapabilityAssemblyV1 {
  const motionProfile = {
    resourceRef: "worldkit://motion-profile/runtime-test@1",
    contentHash: HASH_A,
    motionKernelRef: "worldkit://motion-kernel/runtime-test@1",
    motionTags: ["ground"],
  };
  return {
    authoringAvailability: "recommended",
    physicsBodyProfileRef: "worldkit://physics-body-profile/runtime-test@1",
    locomotionProfileRef: "worldkit://locomotion-profile/runtime-test@1",
    defaultMotionProfile: motionProfile,
    optionalMotionProfiles: [{ ...motionProfile, resourceRef: "worldkit://motion-profile/runtime-alt@1" }],
    fallbackMotionProfile: motionProfile,
    motionKernels: [{
      resourceRef: "worldkit://motion-kernel/runtime-test@1",
      implementationId: "free-ground",
      commandKind: "planar-vector",
      supportedMediums: ["ground", "air"],
      fallbackMotionProfileRef: motionProfile.resourceRef,
      deterministic: true,
    }],
    controlProfile: {
      resourceRef: "worldkit://control-profile/runtime-test@1",
      contentHash: HASH_A,
      commandKind: "planar-vector",
      inputSpace: "camera-relative",
      facingPolicy: "align-to-move",
      lateralMovementPolicy: "allowed",
      moveDeadzoneRatio: 0.1,
    },
    cameraContext: {
      resourceRef: "worldkit://camera-context/runtime-test@1",
      defaultCameraRigProfileRef: "worldkit://camera-profile/runtime-test@1",
      firstPersonCameraRigProfileRef: "worldkit://camera-profile/runtime-first-person@1",
      rules: [{
        id: "running",
        priority: 10,
        when: {
          allRelationshipConditions: [{
            type: "mountedOn",
            entityRole: "rider",
          }],
          locomotionStatuses: ["active"],
          mobilityModes: ["grounded"],
          gaits: ["run"],
          verticalPhases: ["none"],
          requiredActiveActionRefs: ["worldkit://semantic-action/run@1"],
          actionInterruptibility: "interruptible",
          movementMediums: ["ground"],
          minimumSpeedMetersPerSecond: 1,
          maximumSpeedMetersPerSecond: 8,
          requiredSocketIds: ["camera-target"],
          requiredCameraContextTags: ["follow"],
        },
        cameraRigProfileRef: "worldkit://camera-profile/runtime-test@1",
        cameraModifierRefs: ["worldkit://camera-modifier/runtime-test@1"],
      }],
      cameraRigProfiles: [{
        resourceRef: "worldkit://camera-profile/runtime-test@1",
        contentHash: HASH_A,
        baseMode: "stable-follow",
        algorithmRef: "worldkit://camera-rig/stable-follow@1",
        headingSource: "view",
        reverseHeadingPolicy: "preserve-target-forward",
        recenterMode: "forward-motion",
        preferredSocketIds: ["camera-target"],
        parameters: cameraParameters,
        authoringRanges: {
          distanceMeters: { minimum: 2, maximum: 8, step: 0.25 },
        },
      }],
      cameraModifierProfiles: [{
        resourceRef: "worldkit://camera-modifier/runtime-test@1",
        parameterOverrides: { distanceMeters: 6 },
        headingSourceOverride: "target-forward",
        reverseHeadingPolicyOverride: "follow-velocity",
        recenterModeOverride: "always",
      }],
    },
    mediumProfile: {
      resourceRef: "worldkit://medium-profile/runtime-test@1",
      air: { gravityRatio: 1, linearDragPerSecond: 0.1 },
    },
    relationshipProfiles: [{
      resourceRef: "worldkit://relationship-profile/mounted-on.stand-ground@1",
      relationshipType: "mountedOn",
      requiredRiderSocketIds: ["feet"],
      requiredMountSocketIds: ["deck"],
      controlTransferMode: "to-mount",
      cameraTargetRole: "mount",
      maximumMountDistanceMeters: 1,
    }],
    harnessProfileRef: "worldkit://harness-profile/runtime-test@1",
    requiredHarnessCheckIds: ["H01"],
    actionOrPoseSetRef: "worldkit://pose-set/runtime-test@1",
    renderBindingProfileRef: "worldkit://render-binding/runtime-test@1",
  };
}

function bodyFixture(): WorldRuntimeBootstrapBodyV1 {
  return {
    kind: "world-runtime-bootstrap",
    schemaVersion: 1,
    id: "world.runtime-test",
    gameplayBootstrapRef: GAMEPLAY_REF,
    gameplayBootstrapHash: HASH_A,
    initialControlledEntityId: "player",
    gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
    initialCamera: {
      mode: "third-person",
      cameraEntityId: "camera-main",
      targetEntityId: "player",
      cameraRigProfileRef: "worldkit://camera-profile/runtime-test@1",
      pitchRadians: 0.2,
      distanceMeters: 5,
      targetHeightMeters: 1.5,
      fovDegrees: 60,
      manualSwitchAllowed: true,
    },
    subjectAssets: [{
      subjectAssetRef: "worldkit://subject-asset/runtime-test@1",
      artifactContentHash: HASH_B,
      byteLength: 1024,
      mediaType: "model/gltf-binary",
      format: "glb",
      inventory: {
        meshCount: 1,
        vertexCount: 100,
        triangleCount: 50,
        skeletonCount: 1,
        boneCount: 17,
        animationClipNames: ["Idle"],
      },
    }],
    rigProfiles: [{
      rigProfileRef: "worldkit://rig-profile/runtime-test@1",
      bodyTopology: "biped",
      skeletonRootBoneName: "Armature",
      requiredBoneIds: ["hips"],
      sourceNodeNameByBoneId: {
        hips: "Hips",
      } as unknown as RuntimeRigProfileV1["sourceNodeNameByBoneId"],
    }],
    animationSets: [{
      animationSetRef: "worldkit://animation-set/runtime-test@1",
      subjectAssetRef: "worldkit://subject-asset/runtime-test@1",
      rigProfileRef: "worldkit://rig-profile/runtime-test@1",
      defaultActionId: "idle",
      requiredActionIds: ["idle"],
      animationBindings: [{
        actionId: "idle",
        sourceClipName: "Idle",
        semanticFamily: "ground",
        automaticPresentationKeys: ["locomotion.idle"],
        loopMode: "repeat",
        playbackSpeedRatio: 1,
        blendDurationSeconds: 0.2,
        rootMotionMode: "in-place",
      }],
    }],
    colliderProfiles: [{
      colliderProfileRef: "worldkit://collider-profile/runtime-test@1",
      supportedBodyTopologies: ["biped"],
      collider: {
        kind: "capsule",
        radiusMeters: 0.3,
        heightMeters: 1.8,
        centerOffsetFromSubjectOriginMetersXYZ: [0, 0.9, 0],
      },
    }],
    actionPresentationRegistry: {
      schemaVersion: 1,
      bindings: [actionBinding],
      rootMotionSources: [rootMotionSource],
    },
    subjectRuntimeDescriptors: [{
      entityId: "player",
      subjectDefinitionRef: "worldkit://subject-definition/runtime-test@1",
      subjectDefinitionHash: HASH_A,
      bodyTopology: "biped",
      semanticClassId: "subject.player",
      forwardDirection: "-z",
      visualParts: [{
        id: "model",
        kind: "asset",
        subjectAssetRef: "worldkit://subject-asset/runtime-test@1",
        localTransform: {
          positionMetersXYZ: [0, 0, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        appearance: { mode: "whitebox-neutral" },
        semanticTags: ["controlled-subject"],
      }],
      visualBinding: {
        mode: "rigged",
        rigProfileRef: "worldkit://rig-profile/runtime-test@1",
        animationSetRef: "worldkit://animation-set/runtime-test@1",
      },
      sockets: [
        {
          id: "camera-target",
          kind: "local",
          localTransform: {
            positionMetersXYZ: [0, 1.4, 0],
            rotationEulerRadiansXYZ: [0, 0, 0],
          },
          semanticTags: ["camera"],
        },
        {
          id: "feet",
          kind: "bone",
          boneId: "hips",
          offsetTransform: {
            positionMetersXYZ: [0, -0.9, 0],
            rotationEulerRadiansXYZ: [0, 0, 0],
          },
          semanticTags: ["mount"],
        },
      ],
      mountSlots: [{
        id: "deck-slot",
        kind: "mount-slot",
        mode: "stand",
        mountSocketId: "feet",
        riderSubjectOriginOffsetMetersXYZ: [0, 0, 0],
        dismountCandidateOffsetsMetersXYZ: [[1, 0, 0]],
      }],
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
      locomotionCapabilityHash: HASH_A,
      physicsBodyProfileRef: "worldkit://physics-body-profile/runtime-test@1",
      locomotionProfileRef: "worldkit://locomotion-profile/runtime-test@1",
      controlFeel: {
        resourceRef: "worldkit://control-feel-profile/runtime-test@1",
        contentHash: HASH_A,
        jumpVariantPolicy: { mode: "hold-height" },
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
    runtimeResourceLockEntries: [
      {
        resourceRef: "worldkit://subject-asset/runtime-test@1",
        resourceKind: "subject-asset",
        resolvedVersion: "1",
        contentHash: HASH_B,
      },
      {
        resourceRef: GAMEPLAY_REF,
        resourceKind: "gameplay-bootstrap",
        resolvedVersion: "1",
        contentHash: HASH_A,
      },
    ],
  };
}

function expectInvalid(input: unknown): void {
  expect(() => parseWorldRuntimeBootstrapV1(input)).toThrow(
    /WorldRuntimeBootstrapV1/,
  );
}

describe("WorldRuntimeBootstrapV1", () => {
  it("uses the Camera package as the sole CameraContextRuleV2 owner", () => {
    const source = readFileSync(
      new URL("./world-runtime-bootstrap.ts", import.meta.url),
      "utf8",
    );

    expect(source).toMatch(
      /import \{[\s\S]*type CameraContextRuleV2,[\s\S]*\} from "@whitebox-world\/camera";/,
    );
    expect(source).not.toMatch(
      /export interface RuntimeCameraContextRuleV[12]\s*\{/,
    );
  });

  it("requires one canonical jump variant policy in every runtime control feel", () => {
    const valid = createWorldRuntimeBootstrapV1(bodyFixture());
    expect(valid.subjectRuntimeDescriptors[0]?.controlFeel.jumpVariantPolicy).toEqual({
      mode: "hold-height",
    });
    const descriptor = valid.subjectRuntimeDescriptors[0]!;
    const { jumpVariantPolicy: _removed, ...legacyControlFeel } = descriptor.controlFeel;
    expectInvalid({
      ...valid,
      subjectRuntimeDescriptors: [{
        ...descriptor,
        controlFeel: legacyControlFeel,
      }],
    });
  });

  it("keeps the Draft 2020-12 Schema and exact Parser aligned for serialized shape cases", () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      worldRuntimeBootstrapSchema,
    );
    const valid = createWorldRuntimeBootstrapV1(bodyFixture());
    const cases = [
      valid,
      { ...valid, terrain: {} },
      { ...valid, waters: [] },
      { ...valid, objects: [] },
      { ...valid, staticColliders: [] },
      { ...valid, layout: {} },
      { ...valid, traversal: {} },
      { ...valid, babylonScene: {} },
      { ...valid, havokWorld: {} },
      { ...valid, providerHandle: 1 },
      { ...valid, initialCamera: { ...valid.initialCamera, aspectRatio: 16 / 9 } },
      {
        ...valid,
        subjectRuntimeDescriptors: [{
          ...valid.subjectRuntimeDescriptors[0]!,
          spawnAnchorEntityId: "spawn-main",
        }],
      },
    ];
    for (const candidate of cases) {
      const schemaAccepted = validate(candidate);
      let parserAccepted = true;
      try {
        parseWorldRuntimeBootstrapV1(candidate);
      } catch {
        parserAccepted = false;
      }
      expect(parserAccepted, JSON.stringify(validate.errors)).toBe(schemaAccepted);
    }
  });

  it("keeps every serialized nested DTO closed in both Schema and Parser", () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      worldRuntimeBootstrapSchema,
    );
    const paths: readonly (readonly (string | number)[])[] = [
      ["initialCamera"],
      ["subjectAssets", 0],
      ["subjectAssets", 0, "inventory"],
      ["rigProfiles", 0],
      ["animationSets", 0],
      ["animationSets", 0, "animationBindings", 0],
      ["colliderProfiles", 0],
      ["colliderProfiles", 0, "collider"],
      ["actionPresentationRegistry"],
      ["actionPresentationRegistry", "bindings", 0],
      ["actionPresentationRegistry", "bindings", 0, "clip"],
      ["actionPresentationRegistry", "bindings", 0, "rootMotion"],
      ["actionPresentationRegistry", "rootMotionSources", 0],
      ["actionPresentationRegistry", "rootMotionSources", 0, "samples", 0],
      ["subjectRuntimeDescriptors", 0],
      ["subjectRuntimeDescriptors", 0, "visualParts", 0],
      ["subjectRuntimeDescriptors", 0, "visualParts", 0, "localTransform"],
      ["subjectRuntimeDescriptors", 0, "visualParts", 0, "appearance"],
      ["subjectRuntimeDescriptors", 0, "visualBinding"],
      ["subjectRuntimeDescriptors", 0, "sockets", 0],
      ["subjectRuntimeDescriptors", 0, "sockets", 0, "localTransform"],
      ["subjectRuntimeDescriptors", 0, "sockets", 1],
      ["subjectRuntimeDescriptors", 0, "sockets", 1, "offsetTransform"],
      ["subjectRuntimeDescriptors", 0, "mountSlots", 0],
      ["subjectRuntimeDescriptors", 0, "collider"],
      ["subjectRuntimeDescriptors", 0, "locomotion"],
      ["subjectRuntimeDescriptors", 0, "controlFeel"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "defaultMotionProfile"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "motionKernels", 0],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "controlProfile"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "cameraContext"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "cameraContext", "rules", 0],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "cameraContext", "rules", 0, "when"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "cameraContext", "cameraRigProfiles", 0],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "cameraContext", "cameraModifierProfiles", 0],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "mediumProfile"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "mediumProfile", "air"],
      ["subjectRuntimeDescriptors", 0, "capabilityAssembly", "relationshipProfiles", 0],
      ["runtimeResourceLockEntries", 0],
    ];

    for (const path of paths) {
      const candidate = structuredClone(
        createWorldRuntimeBootstrapV1(bodyFixture()),
      ) as unknown as Record<string, unknown>;
      let target: unknown = candidate;
      for (const segment of path) {
        target = (target as Record<string | number, unknown>)[segment];
      }
      (target as Record<string, unknown>).unknownField = true;
      expect(validate(candidate), path.join(".")).toBe(false);
      expectInvalid(candidate);
    }
  });

  it("keeps signed zero as an exact-Parser invariant beyond JSON Schema equality", () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      worldRuntimeBootstrapSchema,
    );
    const valid = createWorldRuntimeBootstrapV1(bodyFixture());
    const candidate = {
      ...valid,
      gravityMetersPerSecondSquaredXYZ: [-0, -9.81, 0],
    };

    expect(validate(candidate)).toBe(true);
    expectInvalid(candidate);
  });

  it("creates canonical, detached, deeply frozen bytes and binds the body hash", () => {
    const source = bodyFixture();
    const body = {
      ...source,
      runtimeResourceLockEntries: [...source.runtimeResourceLockEntries].reverse(),
    };
    const bootstrap = createWorldRuntimeBootstrapV1(body);

    expect(bootstrap.contentHash).toBe(hashWorldRuntimeBootstrapBodyV1(body));
    expect(bootstrap.runtimeResourceLockEntries.map(({ resourceKind }) => resourceKind))
      .toEqual(["gameplay-bootstrap", "subject-asset"]);
    expect(Object.isFrozen(bootstrap)).toBe(true);
    expect(Object.isFrozen(bootstrap.subjectRuntimeDescriptors[0]?.capabilityAssembly)).toBe(true);
    expect(new TextDecoder().decode(worldRuntimeBootstrapCanonicalBytesV1(bootstrap)))
      .toContain(bootstrap.contentHash);

    (body.gravityMetersPerSecondSquaredXYZ as unknown as number[])[1] = -1;
    expect(bootstrap.gravityMetersPerSecondSquaredXYZ[1]).toBe(-9.81);
  });

  it("rejects duplicate Subjects, absent controlled/Camera targets, and Gameplay lock mismatch", () => {
    const valid = createWorldRuntimeBootstrapV1(bodyFixture());
    expectInvalid({
      ...valid,
      subjectRuntimeDescriptors: [
        valid.subjectRuntimeDescriptors[0],
        { ...valid.subjectRuntimeDescriptors[0], semanticClassId: "duplicate" },
      ],
    });
    expectInvalid({ ...valid, initialControlledEntityId: "missing" });
    expectInvalid({
      ...valid,
      initialCamera: { ...valid.initialCamera, targetEntityId: "missing" },
    });
    expect(() => createWorldRuntimeBootstrapV1({
      ...bodyFixture(),
      gameplayBootstrapHash: HASH_B,
    })).toThrow(/WorldRuntimeBootstrapV1/);
    expect(() => createWorldRuntimeBootstrapV1({
      ...bodyFixture(),
      gameplayBootstrapRef: "worldkit://gameplay-bootstrap/other@1",
    })).toThrow(/WorldRuntimeBootstrapV1/);
  });

  it("rejects the removed Camera relationship role condition alias", () => {
    const body = bodyFixture();
    const rules = body.subjectRuntimeDescriptors[0]!.capabilityAssembly.cameraContext.rules;
    const candidate = {
      ...body,
      subjectRuntimeDescriptors: [{
        ...body.subjectRuntimeDescriptors[0]!,
        capabilityAssembly: {
          ...body.subjectRuntimeDescriptors[0]!.capabilityAssembly,
          cameraContext: {
            ...body.subjectRuntimeDescriptors[0]!.capabilityAssembly.cameraContext,
            rules: [{
              ...rules[0]!,
              when: { relationshipRoles: ["rider"] },
            }],
          },
        },
      }],
    };

    expect(() => createWorldRuntimeBootstrapV1(
      candidate as unknown as WorldRuntimeBootstrapBodyV1,
    )).toThrow(/WorldRuntimeBootstrapV1/);
  });

  it.each(["motionKernelRefs", "requiredMotionTags"] as const)(
    "rejects the removed Camera rule field %s",
    (fieldName) => {
      const body = bodyFixture();
      const descriptor = body.subjectRuntimeDescriptors[0]!;
      const rule = descriptor.capabilityAssembly.cameraContext.rules[0]!;
      const candidate = {
        ...body,
        subjectRuntimeDescriptors: [{
          ...descriptor,
          capabilityAssembly: {
            ...descriptor.capabilityAssembly,
            cameraContext: {
              ...descriptor.capabilityAssembly.cameraContext,
              rules: [{
                ...rule,
                when: {
                  ...rule.when,
                  [fieldName]: ["legacy"],
                },
              }],
            },
          },
        }],
      };

      expect(() => createWorldRuntimeBootstrapV1(
        candidate as unknown as WorldRuntimeBootstrapBodyV1,
      )).toThrow(/WorldRuntimeBootstrapV1/);
    },
  );

  it.each([
    ["water medium", { movementMediums: ["water"] }],
    ["unknown mobility mode", { mobilityModes: ["flying"] }],
    ["duplicate gait", { gaits: ["walk", "walk"] }],
    ["non-canonical Action ref", { requiredActiveActionRefs: ["action.ride"] }],
    ["invalid Socket id", { requiredSocketIds: ["camera target"] }],
    ["invalid Camera tag", { requiredCameraContextTags: ["Aim Mode"] }],
    ["negative speed", { minimumSpeedMetersPerSecond: -1 }],
    ["incoherent speed bounds", {
      minimumSpeedMetersPerSecond: 4,
      maximumSpeedMetersPerSecond: 3,
    }],
    ["oversized condition array", {
      requiredCameraContextTags: Array.from(
        { length: 65 },
        (_, index) => `tag-${index}`,
      ),
    }],
  ])("rejects Camera V2 rule schema drift: %s", (_label, when) => {
    const body = bodyFixture();
    const descriptor = body.subjectRuntimeDescriptors[0]!;
    const rule = descriptor.capabilityAssembly.cameraContext.rules[0]!;
    const candidate = {
      ...body,
      subjectRuntimeDescriptors: [{
        ...descriptor,
        capabilityAssembly: {
          ...descriptor.capabilityAssembly,
          cameraContext: {
            ...descriptor.capabilityAssembly.cameraContext,
            rules: [{ ...rule, when }],
          },
        },
      }],
    };

    expect(() => createWorldRuntimeBootstrapV1(
      candidate as unknown as WorldRuntimeBootstrapBodyV1,
    )).toThrow(/WorldRuntimeBootstrapV1/);
  });

  it("rejects stale hashes, noncanonical serialized order, nested unknown fields, and accessors", () => {
    const valid = createWorldRuntimeBootstrapV1(bodyFixture());
    expectInvalid({ ...valid, id: "changed" });
    expectInvalid({
      ...valid,
      runtimeResourceLockEntries: [...valid.runtimeResourceLockEntries].reverse(),
    });
    expectInvalid({
      ...valid,
      subjectRuntimeDescriptors: [{
        ...valid.subjectRuntimeDescriptors[0]!,
        collider: {
          ...valid.subjectRuntimeDescriptors[0]!.collider,
          impostor: "havok",
        },
      }],
    });

    const getter = vi.fn(() => "player");
    const hostile = { ...valid } as Record<string, unknown>;
    Object.defineProperty(hostile, "initialControlledEntityId", {
      enumerable: true,
      get: getter,
    });
    expectInvalid(hostile);
    expect(getter).not.toHaveBeenCalled();
  });
});
