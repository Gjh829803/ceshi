import type {
  SubjectRegistryReferenceEdgeV1,
  SubjectRegistryReferenceEdgeTypeV1,
  SubjectRegistryResourceV3,
} from "./types-v3";

type ResourceKindV1 = SubjectRegistryResourceV3["kind"];

const RELATIONSHIP_PROFILE_REF_BY_CAPABILITY_REF_V1: Readonly<Record<string, string>> =
  Object.freeze({
    "worldkit://capability/relationship.mounted-on@1":
      "worldkit://relationship-profile/mounted-on.stand-ground@1",
    "worldkit://capability/relationship.seat@1":
      "worldkit://relationship-profile/seat.driver@1",
    "worldkit://capability/relationship.tether@1":
      "worldkit://relationship-profile/tether.standard@1",
  });

function edge(
  sourceResourceRef: string,
  sourcePath: string,
  targetResourceRef: string,
  expectedResourceKinds: readonly ResourceKindV1[],
  type: SubjectRegistryReferenceEdgeTypeV1,
): SubjectRegistryReferenceEdgeV1 {
  return Object.freeze({
    sourceResourceRef,
    sourcePath,
    targetResourceRef,
    expectedResourceKinds: Object.freeze([...expectedResourceKinds]),
    type,
  });
}

function edgesForRefs(
  sourceResourceRef: string,
  sourcePath: string,
  targetResourceRefs: readonly string[],
  expectedResourceKinds: readonly ResourceKindV1[],
  type: SubjectRegistryReferenceEdgeTypeV1,
): readonly SubjectRegistryReferenceEdgeV1[] {
  return targetResourceRefs.map((targetResourceRef, index) => edge(
    sourceResourceRef,
    `${sourcePath}/${index}`,
    targetResourceRef,
    expectedResourceKinds,
    type,
  ));
}

export function listSubjectRegistryReferenceEdgesV1(
  resource: SubjectRegistryResourceV3,
): readonly SubjectRegistryReferenceEdgeV1[] {
  const sourceResourceRef = resource.resourceRef;
  const edges: SubjectRegistryReferenceEdgeV1[] = [];
  switch (resource.kind) {
    case "rig-profile":
      edges.push(...edgesForRefs(
        sourceResourceRef,
        "/compatibleSubjectAssetRefs",
        resource.compatibleSubjectAssetRefs,
        ["subject-asset"],
        "metadata",
      ));
      break;
    case "animation-set":
      edges.push(
        edge(
          sourceResourceRef,
          "/subjectAssetRef",
          resource.subjectAssetRef,
          ["subject-asset"],
          "dependency",
        ),
        edge(
          sourceResourceRef,
          "/rigProfileRef",
          resource.rigProfileRef,
          ["rig-profile"],
          "dependency",
        ),
      );
      break;
    case "capability":
      edges.push(
        ...edgesForRefs(
          sourceResourceRef,
          "/requiredCapabilityRefs",
          resource.requiredCapabilityRefs,
          ["capability"],
          "dependency",
        ),
        ...edgesForRefs(
          sourceResourceRef,
          "/conflictingCapabilityRefs",
          resource.conflictingCapabilityRefs,
          ["capability"],
          "metadata",
        ),
      );
      break;
    case "locomotion-profile":
      edges.push(...edgesForRefs(
        sourceResourceRef,
        "/requiredCapabilityRefs",
        resource.requiredCapabilityRefs,
        ["capability"],
        "dependency",
      ));
      break;
    case "motion-kernel":
      edges.push(
        ...edgesForRefs(
          sourceResourceRef,
          "/requiredCapabilityRefs",
          resource.requiredCapabilityRefs,
          ["capability"],
          "dependency",
        ),
        edge(
          sourceResourceRef,
          "/fallbackMotionProfileRef",
          resource.fallbackMotionProfileRef,
          ["motion-profile"],
          "back-reference",
        ),
      );
      break;
    case "motion-profile":
      edges.push(edge(
        sourceResourceRef,
        "/motionKernelRef",
        resource.motionKernelRef,
        ["motion-kernel"],
        "dependency",
      ));
      break;
    case "camera-rig-profile":
      edges.push(edge(
        sourceResourceRef,
        "/algorithmRef",
        resource.algorithmRef,
        ["camera-rig-algorithm"],
        "dependency",
      ));
      break;
    case "camera-context-profile":
      edges.push(edge(
        sourceResourceRef,
        "/defaultCameraRigProfileRef",
        resource.defaultCameraRigProfileRef,
        ["camera-rig-profile"],
        "dependency",
      ));
      if (resource.firstPersonCameraRigProfileRef !== undefined) {
        edges.push(edge(
          sourceResourceRef,
          "/firstPersonCameraRigProfileRef",
          resource.firstPersonCameraRigProfileRef,
          ["camera-rig-profile"],
          "dependency",
        ));
      }
      resource.rules.forEach((rule, ruleIndex) => {
        edges.push(...edgesForRefs(
          sourceResourceRef,
          `/rules/${ruleIndex}/when/motionKernelRefs`,
          rule.when.motionKernelRefs ?? [],
          ["motion-kernel"],
          "metadata",
        ));
        if (rule.cameraRigProfileRef !== undefined) {
          edges.push(edge(
            sourceResourceRef,
            `/rules/${ruleIndex}/cameraRigProfileRef`,
            rule.cameraRigProfileRef,
            ["camera-rig-profile"],
            "dependency",
          ));
        }
        edges.push(...edgesForRefs(
          sourceResourceRef,
          `/rules/${ruleIndex}/cameraModifierRefs`,
          rule.cameraModifierRefs ?? [],
          ["camera-modifier-profile"],
          "dependency",
        ));
      });
      break;
    case "subject-definition":
      resource.visualParts.forEach((visualPart, partIndex) => {
        if (visualPart.kind !== "asset") return;
        edges.push(edge(
          sourceResourceRef,
          `/visualParts/${partIndex}/subjectAssetRef`,
          visualPart.subjectAssetRef,
          ["subject-asset"],
          "dependency",
        ));
      });
      if (resource.visualBinding.mode === "rigged") {
        edges.push(
          edge(
            sourceResourceRef,
            "/visualBinding/rigProfileRef",
            resource.visualBinding.rigProfileRef,
            ["rig-profile"],
            "dependency",
          ),
          edge(
            sourceResourceRef,
            "/visualBinding/animationSetRef",
            resource.visualBinding.animationSetRef,
            ["animation-set"],
            "dependency",
          ),
        );
      }
      edges.push(edge(
        sourceResourceRef,
        resource.colliderPolicy.kind === "profile"
          ? "/colliderPolicy/colliderProfileRef"
          : "/colliderPolicy/colliderDerivationProfileRef",
        resource.colliderPolicy.kind === "profile"
          ? resource.colliderPolicy.colliderProfileRef
          : resource.colliderPolicy.colliderDerivationProfileRef,
        [resource.colliderPolicy.kind === "profile"
          ? "collider-profile"
          : "collider-derivation-profile"],
        "dependency",
      ));
      edges.push(
        ...edgesForRefs(
          sourceResourceRef,
          "/capabilityRefs",
          resource.capabilityRefs,
          ["capability"],
          "dependency",
        ),
        edge(
          sourceResourceRef,
          "/profiles/physicsBodyProfileRef",
          resource.profiles.physicsBodyProfileRef,
          ["physics-body-profile"],
          "dependency",
        ),
        edge(
          sourceResourceRef,
          "/profiles/locomotionProfileRef",
          resource.profiles.locomotionProfileRef,
          ["locomotion-profile"],
          "dependency",
        ),
        edge(
          sourceResourceRef,
          "/profiles/controlFeelProfileRef",
          resource.profiles.controlFeelProfileRef,
          ["control-feel-profile"],
          "dependency",
        ),
        ...edgesForRefs(
          sourceResourceRef,
          "/profiles/allowedControlFeelProfileRefs",
          resource.profiles.allowedControlFeelProfileRefs,
          ["control-feel-profile"],
          "dependency",
        ),
        edge(
          sourceResourceRef,
          "/profiles/motion/defaultMotionProfileRef",
          resource.profiles.motion.defaultMotionProfileRef,
          ["motion-profile"],
          "dependency",
        ),
        ...edgesForRefs(
          sourceResourceRef,
          "/profiles/motion/optionalMotionProfileRefs",
          resource.profiles.motion.optionalMotionProfileRefs,
          ["motion-profile"],
          "dependency",
        ),
        edge(
          sourceResourceRef,
          "/profiles/motion/fallbackMotionProfileRef",
          resource.profiles.motion.fallbackMotionProfileRef,
          ["motion-profile"],
          "dependency",
        ),
        edge(
          sourceResourceRef,
          "/profiles/controlProfileRef",
          resource.profiles.controlProfileRef,
          ["control-profile"],
          "dependency",
        ),
        edge(
          sourceResourceRef,
          "/profiles/cameraContextProfileRef",
          resource.profiles.cameraContextProfileRef,
          ["camera-context-profile"],
          "dependency",
        ),
        edge(
          sourceResourceRef,
          "/profiles/mediumProfileRef",
          resource.profiles.mediumProfileRef,
          ["medium-profile"],
          "dependency",
        ),
        edge(
          sourceResourceRef,
          "/profiles/harnessProfileRef",
          resource.profiles.harnessProfileRef,
          ["harness-profile"],
          "dependency",
        ),
        ...edgesForRefs(
          sourceResourceRef,
          "/relationshipCapabilityRefs",
          resource.relationshipCapabilityRefs,
          ["capability"],
          "dependency",
        ),
        edge(
          sourceResourceRef,
          "/actionOrPoseSetRef",
          resource.actionOrPoseSetRef,
          ["animation-set", "pose-set-profile"],
          "dependency",
        ),
        edge(
          sourceResourceRef,
          "/renderBindingProfileRef",
          resource.renderBindingProfileRef,
          ["render-binding-profile"],
          "dependency",
        ),
      );
      resource.relationshipCapabilityRefs.forEach((capabilityRef, index) => {
        const relationshipProfileRef =
          RELATIONSHIP_PROFILE_REF_BY_CAPABILITY_REF_V1[capabilityRef];
        if (relationshipProfileRef === undefined) return;
        edges.push(edge(
          sourceResourceRef,
          `/relationshipCapabilityRefs/${index}`,
          relationshipProfileRef,
          ["relationship-profile"],
          "dependency",
        ));
      });
      break;
    case "subject-asset":
    case "collider-profile":
    case "physics-body-profile":
    case "collider-derivation-profile":
    case "control-feel-profile":
    case "control-profile":
    case "camera-rig-algorithm":
    case "camera-modifier-profile":
    case "medium-profile":
    case "relationship-profile":
    case "harness-profile":
    case "pose-set-profile":
    case "render-binding-profile":
    case "ai-schema-projection-profile":
      break;
  }
  return Object.freeze(edges);
}
