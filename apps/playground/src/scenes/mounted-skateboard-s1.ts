import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
  type PackageSubjectDefinitionV1,
  type SubjectNodeSpecV2,
} from "@whitebox-world/authoring";
import {
  ACTION_PROJECTION_CAPABILITY_REF,
  CONTROL_TRANSITION_CAPABILITY_REF,
  DISMOUNT_ACTION_REQUEST_SCHEMA_HASH,
  DISMOUNT_ACTION_REQUEST_SCHEMA_REF,
  MOUNTED_RELATIONSHIP_EFFECT_HASH,
  MOUNTED_RELATIONSHIP_EFFECT_REF,
  MOUNT_ACTION_REQUEST_SCHEMA_HASH,
  MOUNT_ACTION_REQUEST_SCHEMA_REF,
  createCoreControlFeatureFactoryV1,
  createCoreSemanticActionFeatureFactoryV1,
  createMountedRelationshipFeatureFactoryV1,
  type GameplayActionRequestResolverV1,
} from "@whitebox-world/gameplay";
import {
  createGameplayActionDefinitionV1,
  createGameplayBootstrapV1,
  type GameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import { defineOutdoorScene } from "@whitebox-world/world";
import { uniq } from "lodash-es";

export const MOUNTED_SKATEBOARD_S1_SCENE_ID =
  "mounted-skateboard-s1" as const;
export const MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID =
  "skateboard" as const;
export const MOUNTED_SKATEBOARD_S1_MOUNT_ACTION_REF =
  "worldkit://semantic-action/mount-skateboard-s1@1" as const;
export const MOUNTED_SKATEBOARD_S1_DISMOUNT_ACTION_REF =
  "worldkit://semantic-action/dismount-skateboard-s1@1" as const;
export const MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST_REF =
  "worldkit://action-request/mount-skateboard-s1@1" as const;
export const MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST_REF =
  "worldkit://action-request/dismount-skateboard-s1@1" as const;
export const MOUNTED_SKATEBOARD_S1_MOUNT_COMMAND_ID =
  "command.mounted-skateboard-s1.mount" as const;
export const MOUNTED_SKATEBOARD_S1_DISMOUNT_COMMAND_ID =
  "command.mounted-skateboard-s1.dismount" as const;
export const MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST = Object.freeze({
  id: "mount-skateboard-s1",
  kind: "mount-action-request" as const,
  mountEntityId: MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
  mountSlotId: "stand",
  riderEntityId: "player",
  schemaVersion: 1 as const,
});

const G_BOT_DEFINITION_REF =
  "worldkit://subject-definition/humanoid.g-bot@2" as const;
const SKATEBOARD_DEFINITION_REF =
  "package://subject-definition/skateboard.s1@1" as const;
const MOUNTED_ON_CAPABILITY_REF =
  "worldkit://capability/relationship.mounted-on@1" as const;
const BOARD_SPAWN_ANCHOR_ID = "spawn-skateboard" as const;
export const MOUNTED_SKATEBOARD_S1_RELATIONSHIP_ID =
  `mounted-on:${sha256CanonicalJson({
    type: "mountedOn",
    acceptedActionCommandId: MOUNTED_SKATEBOARD_S1_MOUNT_COMMAND_ID,
  })}` as const;
export const MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST = Object.freeze({
  id: "dismount-skateboard-s1",
  kind: "dismount-action-request" as const,
  mountedOnRelationshipId: MOUNTED_SKATEBOARD_S1_RELATIONSHIP_ID,
  riderEntityId: "player",
  schemaVersion: 1 as const,
});

const SKATEBOARD_DEFINITION: PackageSubjectDefinitionV1 = {
  id: "skateboard.s1",
  version: 1,
  kind: "subject-definition",
  authoringAvailability: "experimental",
  category: "custom",
  bodyTopology: "custom",
  semanticClassId: "subject.skateboard.whitebox",
  coordinateConvention: {
    forwardAxis: "-Z",
    upAxis: "+Y",
    metersPerUnit: 1,
    pivot: "support-center",
  },
  visualParts: [
    {
      id: "body.support-capsule",
      kind: "primitive",
      shape: { kind: "capsule", radiusMeters: 0.22, heightMeters: 0.44 },
      localTransform: { positionMetersXYZ: [0, 0.22, 0] },
      colliderContribution: "include",
      semanticTags: ["collision-proxy", "support-centered"],
    },
    {
      id: "deck",
      kind: "primitive",
      shape: { kind: "box", sizeMetersXYZ: [0.56, 0.1, 1.65] },
      localTransform: { positionMetersXYZ: [0, 0.19, 0] },
      colliderContribution: "exclude",
      semanticTags: ["deck", "skateboard"],
    },
    ...([
      ["back-left", -0.32, 0.54],
      ["back-right", 0.32, 0.54],
      ["front-left", -0.32, -0.54],
      ["front-right", 0.32, -0.54],
    ] as const).map(([id, x, z]) => ({
      id: `wheel.${id}`,
      kind: "primitive" as const,
      shape: {
        kind: "cylinder" as const,
        radiusMeters: 0.09,
        heightMeters: 0.07,
      },
      localTransform: {
        positionMetersXYZ: [x, 0.09, z] as const,
        rotationEulerRadiansXYZ: [0, 0, Math.PI / 2] as const,
      },
      colliderContribution: "exclude" as const,
      semanticTags: ["visual-only", "wheel"],
    })),
  ],
  visualBinding: { mode: "static" },
  sockets: [{
    id: "MountStand",
    kind: "local",
    localTransform: { positionMetersXYZ: [0, 0.25, 0] },
    semanticTags: ["mount", "stand"],
  }],
  mountSlots: [{
    id: "stand",
    kind: "mount-slot",
    mode: "stand",
    mountSocketId: "MountStand",
    riderSubjectOriginOffsetMetersXYZ: [0, 0, 0],
    dismountCandidateOffsetsMetersXYZ: [
      [0.9, 0, 0],
      [-0.9, 0, 0],
      [0, 0, 1.2],
    ],
  }],
  colliderPolicy: {
    kind: "derive",
    colliderDerivationProfileRef:
      "worldkit://collider-derivation-profile/vertical-capability-capsule@1",
  },
  capabilityRefs: [
    "worldkit://capability/locomotion.ground@1",
    MOUNTED_ON_CAPABILITY_REF,
  ],
  profiles: {
    physicsBodyProfileRef:
      "worldkit://physics-body-profile/character.capability-medium@1",
    locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    controlFeelProfileRef:
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
    allowedControlFeelProfileRefs: [
      "worldkit://control-feel-profile/humanoid.heavy-ground@1",
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
    ],
    motion: {
      defaultMotionProfileRef:
        "worldkit://motion-profile/free-ground.humanoid-medium@1",
      optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
      fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
    },
    controlProfileRef:
      "worldkit://control-profile/planar.camera-relative@1",
    cameraContextProfileRef:
      "worldkit://camera-context/capability-driven.default@1",
    mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
    harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
  },
  relationshipCapabilityRefs: [MOUNTED_ON_CAPABILITY_REF],
  actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
  renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
  allowedOverridePaths: [
    "profiles.controlFeelProfileRef",
    "profiles.controlProfileRef",
    "profiles.motion.defaultMotionProfileRef",
  ],
  aiMetadata: {
    displayName: "S1 whitebox skateboard",
    description:
      "Separate controllable ground Subject for the mountedOn S1 slice; wheel dynamics and tricks are intentionally not claimed.",
    semanticTags: ["ground", "mounted-on", "skateboard", "whitebox"],
  },
};

export const mountedSkateboardS1Scene = defineOutdoorScene({
  id: MOUNTED_SKATEBOARD_S1_SCENE_ID,
  title: "Mounted Skateboard S1",
  seed: 8_260_801,
  budget: {
    maxVertices: 120_000,
    maxTriangles: 240_000,
    maxColliders: 32,
    maxBuildTimeMs: 1_500,
  },
  build(world) {
    const terrain = world.terrain.rolling({
      id: "mounted-skateboard-test-ground",
      size: [80, 80],
      segments: [64, 64],
      amplitude: 0,
      frequency: 0.04,
    });
    world.player.spawn({
      terrain,
      at: [0, 2],
      heightOffset: 0.9,
      facingRadians: 0,
      camera: {
        pitchRadians: 0.22,
        distance: 4.8,
        fovDegrees: 56,
        targetHeight: 1,
      },
    });
    world.atmosphere.set({
      preset: "clear-day",
      semantic: "neutral_skateboard_runtime_test_ground",
    });
  },
});

/** Adds only fixture-owned Subjects and data; Runtime and scene geometry stay SDK-owned. */
export function augmentMountedSkateboardS1AuthoringSpecV1(
  source: AuthoringSpecV4,
): AuthoringSpecV4 {
  const player = source.nodes.find(
    (node): node is SubjectNodeSpecV2 =>
      node.kind === "subject" && node.id === source.startup.controlledEntityId,
  );
  const playerSpawn = source.nodes.find(
    (node) => node.kind === "anchor" && node.id === player?.spawnAnchorEntityId,
  );
  if (
    player?.kind !== "subject" ||
    playerSpawn?.kind !== "anchor" ||
    playerSpawn.placement.kind !== "fixed"
  ) {
    throw new Error("MOUNTED_SKATEBOARD_S1_PLAYER_SPAWN_UNAVAILABLE");
  }
  const [x, y, z] = playerSpawn.placement.transform.positionMetersXYZ;
  return {
    ...source,
    resources: {
      ...source.resources,
      subjectDefinitions: [
        ...source.resources.subjectDefinitions,
        structuredClone(SKATEBOARD_DEFINITION),
      ],
    },
    nodes: [
      ...source.nodes.map((node) =>
        node.id === player.id && node.kind === "subject"
          ? { ...node, subjectDefinitionRef: G_BOT_DEFINITION_REF }
          : node
      ),
      {
        id: BOARD_SPAWN_ANCHOR_ID,
        kind: "anchor",
        placement: {
          kind: "fixed",
          transform: { positionMetersXYZ: [x, y, z - 1.35] },
        },
        semantic: { classId: "spawn.skateboard" },
      },
      {
        id: MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
        kind: "subject",
        subjectDefinitionRef: SKATEBOARD_DEFINITION_REF,
        spawnAnchorEntityId: BOARD_SPAWN_ANCHOR_ID,
      },
    ],
    relationships: [],
  };
}

interface MountedSkateboardActionRequestResourceV1 {
  readonly resourceRef: string;
  readonly contentHash: Sha256HashV1;
  readonly actionRequestSchemaRef: string;
  readonly actionRequestSchemaHash: Sha256HashV1;
  readonly canonicalBytes: Uint8Array;
}

export interface MountedSkateboardGameplayResourcesV1 {
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly actionRequests: readonly MountedSkateboardActionRequestResourceV1[];
  readonly gameplayActionRequestResolver: GameplayActionRequestResolverV1;
}

function requestResource(
  resourceRef: string,
  actionRequestSchemaRef: string,
  actionRequestSchemaHash: Sha256HashV1,
  request: unknown,
): MountedSkateboardActionRequestResourceV1 {
  return Object.freeze({
    resourceRef,
    contentHash: sha256CanonicalJson(request) as Sha256HashV1,
    actionRequestSchemaRef,
    actionRequestSchemaHash,
    canonicalBytes: canonicalJsonBytes(request),
  });
}

export function createMountedSkateboardS1GameplayResourcesV1(
  normalizedWorldIr: NormalizedWorldIRV4,
): MountedSkateboardGameplayResourcesV1 {
  const entityDescriptors = normalizedWorldIr.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => {
      const definition = normalizedWorldIr.resources.subjectDefinitions.find(
        (candidate) => candidate.subjectDefinitionRef === node.subjectDefinitionRef,
      );
      if (definition === undefined) {
        throw new Error("MOUNTED_SKATEBOARD_S1_DEFINITION_UNAVAILABLE");
      }
      return {
        id: node.id,
        entityDefinitionRef: node.subjectDefinitionRef,
        capabilityRefs: definition.capabilityRefs,
      };
    });
  const factories = [
    createCoreControlFeatureFactoryV1(),
    createCoreSemanticActionFeatureFactoryV1(),
    createMountedRelationshipFeatureFactoryV1(),
  ];
  const actionDefinition = (
    operation: "mount" | "dismount",
  ) => createGameplayActionDefinitionV1({
    kind: "semantic-action",
    id: `${operation}-skateboard-s1`,
    version: 1,
    resourceRef: operation === "mount"
      ? MOUNTED_SKATEBOARD_S1_MOUNT_ACTION_REF
      : MOUNTED_SKATEBOARD_S1_DISMOUNT_ACTION_REF,
    executionMode: "exclusive-per-subject",
    completion: { mode: "immediate" },
    effect: {
      mode: "trusted",
      gameplayActionEffectRef: MOUNTED_RELATIONSHIP_EFFECT_REF,
      gameplayActionEffectHash: MOUNTED_RELATIONSHIP_EFFECT_HASH,
    },
    isMovementInputBlocked: true,
    allowedActorEntityDefinitionRefs: [G_BOT_DEFINITION_REF],
    requiredActorCapabilityRefs: [],
    request: {
      mode: "required",
      actionRequestSchemaRef: operation === "mount"
        ? MOUNT_ACTION_REQUEST_SCHEMA_REF
        : DISMOUNT_ACTION_REQUEST_SCHEMA_REF,
      actionRequestSchemaHash: operation === "mount"
        ? MOUNT_ACTION_REQUEST_SCHEMA_HASH
        : DISMOUNT_ACTION_REQUEST_SCHEMA_HASH,
    },
  });
  const actionRequests = Object.freeze([
    requestResource(
      MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST_REF,
      DISMOUNT_ACTION_REQUEST_SCHEMA_REF,
      DISMOUNT_ACTION_REQUEST_SCHEMA_HASH,
      MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST,
    ),
    requestResource(
      MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST_REF,
      MOUNT_ACTION_REQUEST_SCHEMA_REF,
      MOUNT_ACTION_REQUEST_SCHEMA_HASH,
      MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST,
    ),
  ]);
  const requestByRef = new Map(
    actionRequests.map((resource) => [resource.resourceRef, resource]),
  );
  const gameplayActionRequestResolver: GameplayActionRequestResolverV1 = (
    resourceRef,
    contentHash,
  ) => {
    const resource = requestByRef.get(resourceRef);
    if (resource === undefined || resource.contentHash !== contentHash) {
      return undefined;
    }
    return Object.freeze({
      actionRequestSchemaRef: resource.actionRequestSchemaRef,
      actionRequestSchemaHash: resource.actionRequestSchemaHash,
      actionRequestBytes: new Uint8Array(resource.canonicalBytes),
    });
  };
  return Object.freeze({
    gameplayBootstrap: createGameplayBootstrapV1({
      kind: "gameplay-bootstrap",
      id: `${normalizedWorldIr.id}.gameplay`,
      version: 1,
      resourceRef:
        `worldkit://gameplay-bootstrap/${normalizedWorldIr.id}.${normalizedWorldIr.seed}@1`,
      entityDescriptors,
      featureResourceLocks: factories.map(({ manifest }) => ({
        resourceRef: manifest.resourceRef,
        contentHash: manifest.contentHash,
      })),
      semanticActionDefinitions: [
        actionDefinition("dismount"),
        actionDefinition("mount"),
      ],
      availableCapabilityRefs: uniq([
        ...entityDescriptors.flatMap(({ capabilityRefs }) => capabilityRefs),
        ACTION_PROJECTION_CAPABILITY_REF,
        CONTROL_TRANSITION_CAPABILITY_REF,
      ]),
      initialRelationshipStates: normalizedWorldIr.relationships.map(
        (relationship) => ({ ...relationship, establishedSimulationTick: 0 }),
      ),
    }),
    actionRequests,
    gameplayActionRequestResolver,
  });
}
