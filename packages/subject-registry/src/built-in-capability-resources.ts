import cameraCatalog from "../../../assets/registry/camera-profiles/catalog.json";
import controlFeelProfiles from "../../../assets/registry/control-feel-profiles/catalog.json";
import controlProfiles from "../../../assets/registry/control-profiles/catalog.json";
import harnessProfiles from "../../../assets/registry/harness-profiles/catalog.json";
import mediumProfiles from "../../../assets/registry/medium-profiles/catalog.json";
import motionKernels from "../../../assets/registry/motion-kernels/catalog.json";
import motionProfiles from "../../../assets/registry/motion-profiles/catalog.json";
import poseAndRenderCatalog from "../../../assets/registry/pose-and-render-profiles/catalog.json";
import relationshipProfiles from "../../../assets/registry/relationship-profiles/catalog.json";
import aiSchemaProjectionProfiles from "../../../assets/registry/ai-schema-projection-profiles/catalog.json";

import type { CapabilityManifestInputV1 } from "./types-v2";
import type { SubjectCapabilityResourceInputV1 } from "./types-v3";

const CAPABILITY_MANIFESTS = [
  {
    kind: "capability",
    id: "locomotion.forward-steer",
    version: 1,
    resourceRef: "worldkit://capability/locomotion.forward-steer@1",
    requiredCapabilityRefs: [],
    providedFeatures: ["forward-steer", "controllable"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Forward Steer Locomotion",
      description: "Subject-local forward and reverse travel with steering.",
      semanticTags: ["forward", "locomotion", "steer"],
    },
  },
  {
    kind: "capability",
    id: "locomotion.wheeled",
    version: 1,
    resourceRef: "worldkit://capability/locomotion.wheeled@1",
    requiredCapabilityRefs: ["worldkit://capability/locomotion.forward-steer@1"],
    providedFeatures: ["wheeled-locomotion", "controllable"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Wheeled Arcade Locomotion",
      description: "Arcade four-wheel motion expressed through the shared steer command.",
      semanticTags: ["arcade", "locomotion", "wheeled"],
    },
  },
  {
    kind: "capability",
    id: "locomotion.surface-slide",
    version: 1,
    resourceRef: "worldkit://capability/locomotion.surface-slide@1",
    requiredCapabilityRefs: ["worldkit://capability/locomotion.forward-steer@1"],
    providedFeatures: ["surface-slide", "controllable", "motion-switch"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Surface Slide Locomotion",
      description: "Inertial travel constrained to a support surface.",
      semanticTags: ["locomotion", "slide", "surface"],
    },
  },
  {
    kind: "capability",
    id: "locomotion.water-surface",
    version: 1,
    resourceRef: "worldkit://capability/locomotion.water-surface@1",
    requiredCapabilityRefs: [],
    providedFeatures: ["water-surface-locomotion", "controllable"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Water Surface Locomotion",
      description: "Surface-height constrained propulsion and steering.",
      semanticTags: ["locomotion", "surface", "water"],
    },
  },
  {
    kind: "capability",
    id: "locomotion.unpowered-glide",
    version: 1,
    resourceRef: "worldkit://capability/locomotion.unpowered-glide@1",
    requiredCapabilityRefs: [],
    providedFeatures: ["unpowered-glide", "controllable"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Unpowered Glide",
      description: "Gravity-powered glide using shared flight-attitude intent.",
      semanticTags: ["glide", "locomotion", "unpowered"],
    },
  },
  {
    kind: "capability",
    id: "relationship.seat",
    version: 1,
    resourceRef: "worldkit://capability/relationship.seat@1",
    requiredCapabilityRefs: [],
    providedFeatures: ["seat"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Seat Relationship",
      description: "Seat alignment, control transfer and camera target facts.",
      semanticTags: ["relationship", "seat"],
    },
  },
  {
    kind: "capability",
    id: "relationship.tether",
    version: 1,
    resourceRef: "worldkit://capability/relationship.tether@1",
    requiredCapabilityRefs: [],
    providedFeatures: ["tether"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Tether Relationship",
      description: "Bounded anchor-to-anchor relationship with safe disconnection.",
      semanticTags: ["relationship", "tether"],
    },
  },
  {
    kind: "capability",
    id: "relationship.mounted-on",
    version: 1,
    resourceRef: "worldkit://capability/relationship.mounted-on@1",
    requiredCapabilityRefs: [],
    providedFeatures: ["mountedOn"],
    conflictingCapabilityRefs: [],
    aiMetadata: {
      displayName: "Mounted On Relationship",
      description: "Role-qualified mountedOn relationship with implemented Ground stand-slot behavior.",
      semanticTags: ["mountedOn", "relationship", "implemented"],
    },
  },
] as const satisfies readonly CapabilityManifestInputV1[];

export const BUILT_IN_CAPABILITY_RESOURCES = [
  ...motionKernels,
  ...motionProfiles,
  ...controlFeelProfiles,
  ...controlProfiles,
  ...cameraCatalog.algorithms,
  ...cameraCatalog.profiles,
  ...cameraCatalog.modifiers,
  ...cameraCatalog.contexts,
  ...mediumProfiles,
  ...relationshipProfiles,
  ...harnessProfiles,
  ...poseAndRenderCatalog.poseSets,
  ...poseAndRenderCatalog.renderBindings,
  ...aiSchemaProjectionProfiles,
] as unknown as readonly SubjectCapabilityResourceInputV1[];

export const BUILT_IN_CAPABILITY_MANIFESTS = CAPABILITY_MANIFESTS;
