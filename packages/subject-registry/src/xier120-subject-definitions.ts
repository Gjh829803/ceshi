import type { SubjectBodyTopologyV2 } from "@whitebox-world/subject-contracts";

import { FIRST_SLICE_ALLOWED_OVERRIDE_PATHS } from "./subject-resource-registry";
import type { RegistrySubjectDefinitionInputV3 } from "./types-v3";

interface Xier120SubjectClassificationV1 {
  readonly slug: string;
  readonly displayName: string;
  readonly category: RegistrySubjectDefinitionInputV3["category"];
  readonly bodyTopology: SubjectBodyTopologyV2;
  readonly authoringAvailability:
    RegistrySubjectDefinitionInputV3["authoringAvailability"];
}

const XIER120_SUBJECT_CLASSIFICATIONS = [
  { slug: "aerial-cockpit", displayName: "Aerial cockpit composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "aerial-hanging", displayName: "Aerial hanging composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "aerial-seated", displayName: "Aerial seated composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "aerial-seated-variant", displayName: "Aerial seated composition variant", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "aerial-standing", displayName: "Aerial standing composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "biped-animal", displayName: "Biped animal", category: "animal", bodyTopology: "biped", authoringAvailability: "advanced" },
  { slug: "flat-seated-glider", displayName: "Flat seated glider composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "four-wheel", displayName: "Four-wheel vehicle", category: "vehicle", bodyTopology: "four-wheel", authoringAvailability: "experimental" },
  { slug: "four-wheel-variant", displayName: "Four-wheel vehicle variant", category: "vehicle", bodyTopology: "four-wheel", authoringAvailability: "experimental" },
  { slug: "hoverboard-standing", displayName: "Hoverboard standing composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "prone-glider", displayName: "Prone glider composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "quadruped-animal", displayName: "Quadruped animal", category: "animal", bodyTopology: "quadruped", authoringAvailability: "advanced" },
  { slug: "quadruped-reptile", displayName: "Quadruped reptile", category: "animal", bodyTopology: "quadruped", authoringAvailability: "advanced" },
  { slug: "quadruped-ridable", displayName: "Quadruped ridable composition", category: "composite", bodyTopology: "composite", authoringAvailability: "experimental" },
  { slug: "snake-animal", displayName: "Snake animal", category: "animal", bodyTopology: "custom", authoringAvailability: "advanced" },
  { slug: "three-wheel", displayName: "Three-wheel vehicle", category: "vehicle", bodyTopology: "custom", authoringAvailability: "experimental" },
  { slug: "tracked", displayName: "Tracked vehicle", category: "vehicle", bodyTopology: "custom", authoringAvailability: "experimental" },
  { slug: "two-wheel-motorcycle", displayName: "Two-wheel motorcycle", category: "vehicle", bodyTopology: "custom", authoringAvailability: "experimental" },
  { slug: "two-wheel-motorcycle-variant", displayName: "Two-wheel motorcycle variant", category: "vehicle", bodyTopology: "custom", authoringAvailability: "experimental" },
] as const satisfies readonly Xier120SubjectClassificationV1[];

const SHARED_COORDINATE_CONVENTION = {
  forwardAxis: "-Z",
  upAxis: "+Y",
  metersPerUnit: 1,
  pivot: "support-center",
} as const;

const SHARED_GROUND_PROFILES = {
  physicsBodyProfileRef:
    "worldkit://physics-body-profile/character.capability-medium@1",
  locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
  controlFeelProfileRef:
    "worldkit://control-feel-profile/humanoid.medium-ground@1",
  allowedControlFeelProfileRefs: [
    "worldkit://control-feel-profile/humanoid.medium-ground@1",
    "worldkit://control-feel-profile/humanoid.heavy-ground@1",
  ],
  motion: {
    defaultMotionProfileRef:
      "worldkit://motion-profile/free-ground.humanoid-medium@1",
    optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
    fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
  },
  controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
  cameraContextProfileRef:
    "worldkit://camera-context/capability-driven.default@1",
  mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
  harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
} as const;

export const XIER120_SUBJECT_DEFINITIONS = Object.freeze(
  XIER120_SUBJECT_CLASSIFICATIONS.map(
    (row): RegistrySubjectDefinitionInputV3 => ({
      kind: "subject-definition",
      schemaVersion: 3,
      id: `xier120.${row.slug}`,
      version: 1,
      resourceRef: `worldkit://subject-definition/xier120.${row.slug}@1`,
      authoringAvailability: row.authoringAvailability,
      category: row.category,
      bodyTopology: row.bodyTopology,
      semanticClassId: `subject.xier120.${row.slug}`,
      coordinateConvention: SHARED_COORDINATE_CONVENTION,
      visualParts: [{
        id: "body.asset",
        kind: "asset",
        subjectAssetRef: `worldkit://subject-asset/xier120.${row.slug}@1`,
        localTransform: {
          positionMetersXYZ: [0, 0, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        appearance: { mode: "whitebox-neutral" },
        semanticTags: ["body", "static", "xier120"],
      }],
      visualBinding: { mode: "static" },
      sockets: [],
      colliderPolicy: {
        kind: "profile",
        colliderProfileRef:
          `worldkit://collider-profile/xier120.${row.slug}@1`,
      },
      capabilityRefs: ["worldkit://capability/locomotion.ground@1"],
      profiles: SHARED_GROUND_PROFILES,
      relationshipCapabilityRefs: [],
      actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
      renderBindingProfileRef:
        "worldkit://render-binding/subject.standard@1",
      allowedOverridePaths: FIRST_SLICE_ALLOWED_OVERRIDE_PATHS,
      aiMetadata: {
        displayName: row.displayName,
        description:
          `${row.displayName} as one static xier120 visual driven only by the existing ground Character capability; no vehicle, flight, mount, NPC, rig, or animation behavior is claimed.`,
        semanticTags: row.category === row.bodyTopology
          ? [row.category, "static", "xier120"]
          : [row.bodyTopology, row.category, "static", "xier120"],
      },
    }),
  ),
);
