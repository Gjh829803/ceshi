import {
  validatePackageSubjectDefinition,
  type AuthoringResult,
  type PackageSubjectDefinitionV1,
  type SubjectPrimitiveShapeSpecV1,
  type SubjectVisualPartSpecV2,
  type Vec3,
} from "@whitebox-world/authoring";
import { assertWorldPackageAccessorFreeDataGraphV1 } from "@whitebox-world/world-package";

type NativeSubjectDesignPartV1 =
  | Extract<SubjectVisualPartSpecV2, { kind: "primitive" }>
  | Omit<Extract<SubjectVisualPartSpecV2, { kind: "asset" }>, "appearance">;

/** Authoring data only; the Host supplies the executable capability/profile closure. */
export interface NativeComposedSubjectDesignV1 {
  id: string;
  category: PackageSubjectDefinitionV1["category"];
  bodyTopology: PackageSubjectDefinitionV1["bodyTopology"];
  semanticClassId: string;
  displayName: string;
  description: string;
  visualParts: readonly NativeSubjectDesignPartV1[];
  visualBinding:
    | { mode: "static" }
    | { mode: "rigged"; rigProfileRef: string; animationSetRef: string; colliderProfileRef: string };
}

// Pinned old Block compiler, 9e35ab53:compile.ts. Keep this authoring
// quantization before normalization; it is not a Runtime transform policy.
function stableNumber(value: number): number {
  const quantized = Math.round(value * 1_000_000_000) / 1_000_000_000;
  return Object.is(quantized, -0) ? 0 : quantized;
}

function stableVector(value: Vec3): Vec3 {
  return value.map(stableNumber) as [number, number, number];
}

function stableShape(shape: SubjectPrimitiveShapeSpecV1): SubjectPrimitiveShapeSpecV1 {
  switch (shape.kind) {
    case "box": return { ...shape, sizeMetersXYZ: stableVector(shape.sizeMetersXYZ) };
    case "sphere": return { ...shape, radiusMeters: stableNumber(shape.radiusMeters) };
    case "cylinder":
    case "capsule": return { ...shape, radiusMeters: stableNumber(shape.radiusMeters), heightMeters: stableNumber(shape.heightMeters) };
  }
}

/**
 * Typed design-to-definition translation, not a JSON ingress parser or a scene
 * language. Uses the pinned old Host defaults without interpreting names/prose.
 * The existing Authoring validator/normalizer and Subject compiler remain the
 * owners of admission, resource resolution and executable Runtime semantics.
 */
export function compileNativeComposedSubjectDefinitionV1(
  design: NativeComposedSubjectDesignV1,
): AuthoringResult<PackageSubjectDefinitionV1> {
  try {
    assertWorldPackageAccessorFreeDataGraphV1(design);
    const source = structuredClone(design);
    const definition: PackageSubjectDefinitionV1 = {
      id: source.id,
      version: 1,
      kind: "subject-definition",
      allowedOverridePaths: [],
      authoringAvailability: "advanced",
      category: source.category,
      bodyTopology: source.bodyTopology,
      semanticClassId: source.semanticClassId,
      coordinateConvention: { forwardAxis: "-Z", upAxis: "+Y", metersPerUnit: 1, pivot: "support-center" },
      visualParts: source.visualParts.map((part) => part.kind === "asset" ? {
        ...part,
        localTransform: {
          ...part.localTransform,
          positionMetersXYZ: stableVector(part.localTransform.positionMetersXYZ),
          rotationEulerRadiansXYZ: stableVector(part.localTransform.rotationEulerRadiansXYZ ?? [0, 0, 0]),
          scaleXYZ: stableVector(part.localTransform.scaleXYZ),
        },
        appearance: { mode: "whitebox-neutral" },
      } : {
        ...part,
        shape: stableShape(part.shape),
        localTransform: {
          ...part.localTransform,
          positionMetersXYZ: stableVector(part.localTransform.positionMetersXYZ),
          rotationEulerRadiansXYZ: stableVector(part.localTransform.rotationEulerRadiansXYZ ?? [0, 0, 0]),
        },
      }),
      visualBinding: source.visualBinding.mode === "static" ? { mode: "static" } : {
        mode: "rigged",
        rigProfileRef: source.visualBinding.rigProfileRef,
        animationSetRef: source.visualBinding.animationSetRef,
      },
      sockets: [],
      mountSlots: [],
      colliderPolicy: source.visualBinding.mode === "rigged" ? {
        kind: "profile", colliderProfileRef: source.visualBinding.colliderProfileRef,
      } : {
        kind: "derive",
        colliderDerivationProfileRef: "worldkit://collider-derivation-profile/vertical-character-capsule@1",
      },
      capabilityRefs: ["worldkit://capability/locomotion.ground@1"],
      profiles: {
        physicsBodyProfileRef: "worldkit://physics-body-profile/character.capability-medium@1",
        locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
        controlFeelProfileRef: "worldkit://control-feel-profile/humanoid.medium-ground@1",
        allowedControlFeelProfileRefs: [
          "worldkit://control-feel-profile/humanoid.medium-ground@1",
          "worldkit://control-feel-profile/humanoid.heavy-ground@1",
        ],
        motion: {
          defaultMotionProfileRef: "worldkit://motion-profile/free-ground.humanoid-medium@1",
          optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
          fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
        },
        controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
        cameraContextProfileRef: "worldkit://camera-context/capability-driven.default@1",
        mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
        harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
      },
      relationshipCapabilityRefs: [],
      actionOrPoseSetRef: source.visualBinding.mode === "rigged"
        ? source.visualBinding.animationSetRef : "worldkit://pose-set/static.whitebox@1",
      renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
      aiMetadata: {
        displayName: source.displayName,
        description: source.description,
        semanticTags: [source.category, source.bodyTopology, "block-world-composed"],
      },
    };
    return validatePackageSubjectDefinition(definition);
  } catch {
    return {
      ok: false,
      diagnostics: [{ severity: "error", code: "NATIVE_SUBJECT_HOST_INPUT_INVALID", instancePath: "/subject", message: "Composed Subject design must be valid accessor-free authoring data." }],
    };
  }
}
