import type {
  ColliderProfileManifestInputV1,
  LocomotionProfileManifestInputV1,
  SubjectAssetManifestInputV1,
} from "./types-v2";
import type { ControlFeelProfileInputV1 } from "./types-v3";

export const KART_CONTROL_LAB_SUBJECT_ASSET_REF =
  "worldkit://subject-asset/kart-control-lab.stk-kart@1";
export const KART_CONTROL_LAB_COLLIDER_PROFILE_REF =
  "worldkit://collider-profile/kart-control-lab.stk-kart@1";
export const KART_CONTROL_LAB_CONTROL_FEEL_PROFILE_REF =
  "worldkit://control-feel-profile/kart-control-lab.stk-kart@1";
export const KART_CONTROL_LAB_LOCOMOTION_PROFILE_REF =
  "worldkit://locomotion-profile/ground.kart-control-lab-stk@1";

export const KART_CONTROL_LAB_SUBJECT_ASSET_MANIFESTS = Object.freeze([
  {
    kind: "subject-asset",
    id: "kart-control-lab.stk-kart",
    version: 1,
    resourceRef: KART_CONTROL_LAB_SUBJECT_ASSET_REF,
    format: "glb",
    artifact: {
      mediaType: "model/gltf-binary",
      byteLength: 79_468,
      contentHash:
        "sha256:59a638438fc2ad81f564497e0949919cd74b9517d3cc11ca99adb7ad8cc0fab1",
    },
    coordinateConvention: {
      forwardAxis: "-Z",
      upAxis: "+Y",
      metersPerUnit: 1,
      pivot: "support-center",
    },
    bounds: {
      minimumMetersXYZ: [-1.256000003218651, 0.005469218492507866, -1.560000001490116],
      maximumMetersXYZ: [1.256000003218651, 1.4999999928474426, 1.439999994635582],
    },
    inventory: {
      meshCount: 17,
      vertexCount: 1_620,
      triangleCount: 1_528,
      skeletonCount: 0,
      boneCount: 0,
      animationClipCount: 0,
      animationClipNames: [],
    },
    provenance: {
      licenseSpdxId: "GPL-3.0-or-later",
      redistributionPolicy: "allowed",
      sourceUri:
        "worldkit-source://kart-control-lab/stk-kart-control-handoff-v1.zip#assets/stk-kart.glb",
      licenseUri:
        "worldkit-license://kart-control-lab-stk-kart/GPL-3.0-or-later",
      author: "Kart Control Lab handoff contributors",
    },
    runtimeReadiness: {
      productionReady: true,
      runtimeStateBinding: "implemented",
    },
    aiMetadata: {
      displayName: "STK arcade kart",
      description:
        "Static low-poly kart and driver visual from the verified STK Kart Control Handoff v1.",
      semanticTags: ["arcade", "four-wheel", "kart", "static", "vehicle"],
    },
  } satisfies SubjectAssetManifestInputV1,
]);

export const KART_CONTROL_LAB_COLLIDER_PROFILES = Object.freeze([
  {
    kind: "collider-profile",
    id: "kart-control-lab.stk-kart",
    version: 1,
    resourceRef: KART_CONTROL_LAB_COLLIDER_PROFILE_REF,
    supportedBodyTopologies: ["four-wheel"],
    collider: {
      kind: "capsule",
      radiusMeters: 1,
      heightMeters: 2,
      centerOffsetFromSubjectOriginMetersXYZ: [0, 1, 0],
    },
    aiMetadata: {
      displayName: "STK kart traversal collider",
      description:
        "Authored character-controller capsule for the three-metre kart visual.",
      semanticTags: ["capsule", "four-wheel", "kart", "vehicle"],
    },
  } satisfies ColliderProfileManifestInputV1,
]);

export const KART_CONTROL_LAB_LOCOMOTION_PROFILES = Object.freeze([
  {
    kind: "locomotion-profile",
    id: "ground.kart-control-lab-stk",
    version: 1,
    resourceRef: KART_CONTROL_LAB_LOCOMOTION_PROFILE_REF,
    requiredCapabilityRefs: ["worldkit://capability/locomotion.wheeled@1"],
    allowWalk: true,
    allowRun: true,
    allowJump: false,
    aiMetadata: {
      displayName: "STK kart ground driving",
      description: "Ground-only wheeled locomotion with no character jump action.",
      semanticTags: ["drive", "ground", "kart", "wheeled"],
    },
  } satisfies LocomotionProfileManifestInputV1,
]);

export const KART_CONTROL_LAB_CONTROL_FEEL_PROFILES = Object.freeze([
  {
    kind: "control-feel-profile",
    id: "kart-control-lab.stk-kart",
    version: 1,
    resourceRef: KART_CONTROL_LAB_CONTROL_FEEL_PROFILE_REF,
    authoringAvailability: "advanced",
    walkSpeedMetersPerSecond: 0,
    runSpeedMetersPerSecond: 0,
    jumpSpeedMetersPerSecond: 0,
    accelerationMetersPerSecondSquared: 0,
    decelerationMetersPerSecondSquared: 0,
    turnRateRadiansPerSecond: 0,
    moveResponseExponent: 1,
    airControlRatio: 0,
    coyoteTimeSeconds: 0,
    jumpBufferSeconds: 0,
    variableJumpHoldSeconds: 0,
    jumpHoldGravityRatio: 1,
    jumpReleaseGravityRatio: 1,
    wheeledArcade: {
      maximumForwardSpeedMetersPerSecond: 25,
      maximumReverseSpeedMetersPerSecond: 12.1875,
      accelerationMetersPerSecondSquared: 8,
      coastDecelerationMetersPerSecondSquared: 5,
      brakeInitialDecelerationMetersPerSecondSquared: 12,
      brakeRampMetersPerSecondCubed: 18,
      reverseAccelerationMetersPerSecondSquared: 14.4,
      reverseToForwardRecoveryMultiplier: 2.5,
      steeringMultiplier: 1,
      steeringRiseLowSeconds: 0.17,
      steeringRiseHighSeconds: 0.28,
      steeringRiseSplitRatio: 0.5,
      steeringReturnSeconds: 0.1,
      lateralGripPerSecond: 10,
      driftLateralGripPerSecond: 2.1,
      airborneYawMultiplier: 0.35,
      gearAccelerationCurve: [
        [0, 1],
        [0.1, 1],
        [0.25, 0.83],
        [0.45, 0.71],
        [0.7, 0.58],
        [1, 0.5],
        [4, 0.42],
      ],
      speedTurnRadiusMetersCurve: [
        [0, 2.3],
        [10, 8.625],
        [25, 17.25],
        [45, 34.5],
      ],
      drift: {
        minimumSpeedMetersPerSecond: 10,
        minimumSteeringRatio: 0.001,
        directionLocksOnEntry: true,
        turnMinimumRatio: 0.2,
        turnMaximumRatio: 0.8,
        boostTriggersOnRelease: true,
        levels: [
          {
            strictlyGreaterThanSeconds: 1,
            maximumSpeedBonusMetersPerSecond: 4.5,
            durationSeconds: 3,
            releaseImpulseMetersPerSecond: 2.25,
          },
          {
            strictlyGreaterThanSeconds: 3,
            maximumSpeedBonusMetersPerSecond: 6.5,
            durationSeconds: 4,
            releaseImpulseMetersPerSecond: 3.25,
          },
        ],
      },
    },
    aiMetadata: {
      displayName: "STK medium kart feel",
      description:
        "Verified 25 m/s arcade kart acceleration, speed-radius steering, locked drift and release boost parameters.",
      semanticTags: ["arcade", "drift", "kart", "stk", "wheeled"],
    },
  } satisfies ControlFeelProfileInputV1,
]);
