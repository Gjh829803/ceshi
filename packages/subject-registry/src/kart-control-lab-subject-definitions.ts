import { FIRST_SLICE_ALLOWED_OVERRIDE_PATHS } from "./subject-resource-registry";
import type { RegistrySubjectDefinitionInputV3 } from "./types-v3";
import {
  KART_CONTROL_LAB_COLLIDER_PROFILE_REF,
  KART_CONTROL_LAB_CONTROL_FEEL_PROFILE_REF,
  KART_CONTROL_LAB_LOCOMOTION_PROFILE_REF,
  KART_CONTROL_LAB_SUBJECT_ASSET_REF,
} from "./kart-control-lab-resource-manifests";

export const KART_CONTROL_LAB_SUBJECT_DEFINITIONS = Object.freeze([
  {
    kind: "subject-definition",
    schemaVersion: 3,
    id: "kart-control-lab.stk-kart",
    version: 1,
    resourceRef:
      "worldkit://subject-definition/kart-control-lab.stk-kart@1",
    authoringAvailability: "advanced",
    category: "vehicle",
    bodyTopology: "four-wheel",
    semanticClassId: "subject.vehicle.kart-control-lab-stk",
    coordinateConvention: {
      forwardAxis: "-Z",
      upAxis: "+Y",
      metersPerUnit: 1,
      pivot: "support-center",
    },
    visualParts: [{
      id: "body.asset",
      kind: "asset",
      subjectAssetRef: KART_CONTROL_LAB_SUBJECT_ASSET_REF,
      localTransform: {
        positionMetersXYZ: [0, 0, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 1],
      },
      appearance: { mode: "whitebox-neutral" },
      semanticTags: ["body", "driver", "kart", "static", "vehicle"],
    }],
    visualBinding: { mode: "static" },
    sockets: [
      {
        id: "DriverSeat",
        kind: "local",
        localTransform: {
          positionMetersXYZ: [0, 0.86, 0.38],
          rotationEulerRadiansXYZ: [0, 0, 0],
        },
        semanticTags: ["driver", "seat"],
      },
      {
        id: "FirstPersonView",
        kind: "local",
        localTransform: {
          positionMetersXYZ: [0, 1.25, 0.08],
          rotationEulerRadiansXYZ: [0, 0, 0],
        },
        semanticTags: ["camera", "first-person"],
      },
      {
        id: "CameraTarget3D",
        kind: "local",
        localTransform: {
          positionMetersXYZ: [0, 0.82, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
        },
        semanticTags: ["camera", "target"],
      },
      {
        id: "LookAhead",
        kind: "local",
        localTransform: {
          positionMetersXYZ: [0, 0.82, -3],
          rotationEulerRadiansXYZ: [0, 0, 0],
        },
        semanticTags: ["camera", "look-ahead"],
      },
    ],
    colliderPolicy: {
      kind: "profile",
      colliderProfileRef: KART_CONTROL_LAB_COLLIDER_PROFILE_REF,
    },
    capabilityRefs: [
      "worldkit://capability/locomotion.forward-steer@1",
      "worldkit://capability/locomotion.wheeled@1",
    ],
    profiles: {
      physicsBodyProfileRef:
        "worldkit://physics-body-profile/character.capability-medium@1",
      locomotionProfileRef: KART_CONTROL_LAB_LOCOMOTION_PROFILE_REF,
      controlFeelProfileRef: KART_CONTROL_LAB_CONTROL_FEEL_PROFILE_REF,
      allowedControlFeelProfileRefs: [KART_CONTROL_LAB_CONTROL_FEEL_PROFILE_REF],
      motion: {
        defaultMotionProfileRef:
          "worldkit://motion-profile/wheeled-arcade.medium@1",
        optionalMotionProfileRefs: [],
        fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
      },
      controlProfileRef:
        "worldkit://control-profile/throttle-steer.subject-local@1",
      cameraContextProfileRef:
        "worldkit://camera-context/capability-driven.default@1",
      mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
      harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
    },
    relationshipCapabilityRefs: [],
    actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
    renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
    allowedOverridePaths: FIRST_SLICE_ALLOWED_OVERRIDE_PATHS,
    aiMetadata: {
      displayName: "STK arcade kart",
      description:
        "Verified static kart visual with an authored collider and the registered STK arcade driving feel.",
      semanticTags: ["arcade", "driver", "four-wheel", "kart", "stk", "vehicle"],
    },
  } satisfies RegistrySubjectDefinitionInputV3,
]);
