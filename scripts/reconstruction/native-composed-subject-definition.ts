import {
  validatePackageSubjectDefinition,
  validateSubjectDesignV1,
  type AuthoringResult,
  type AuthoringDiagnostic,
  type ComposedSubjectDesignV1,
  type PackageSubjectDefinitionV1,
  type SubjectPrimitiveShapeSpecV1,
  type Vec3,
} from "@whitebox-world/authoring";
import { assertWorldPackageAccessorFreeDataGraphV1 } from "@whitebox-world/world-package";

/**
 * The pinned old task-level Subject policy (check.ts:88-152,591-608).
 * Call after shared schema validation, at the same compilation/self-check stage,
 * not as a pre-generation gate. This is not a Runtime collider measurement.
 */
export function checkNativeComposedSubjectDesignV1(
  design: ComposedSubjectDesignV1,
): readonly AuthoringDiagnostic[] {
  const diagnostics: AuthoringDiagnostic[] = [];
  const invalid = (code: string, message: string): void => {
    diagnostics.push({ severity: "error", code, instancePath: "/subjectDesign/definition", message });
  };
  const id = /^[a-z0-9][a-z0-9-]{2,79}$/;
  const parts = design.visualParts;
  if (!id.test(design.id) || design.displayName.trim().length === 0 || design.description.trim().length === 0 ||
    !/^[a-z0-9][a-z0-9.-]{2,95}$/.test(design.semanticClassId) || parts.length < 1 || parts.length > 48 ||
    new Set(parts.map((part) => part.id)).size !== parts.length || parts.some((part) =>
      !id.test(part.id) || part.semanticTags.length === 0 ||
      part.semanticTags.some((tag) => !/^[a-z0-9][a-z0-9.-]{1,63}$/.test(tag)))) {
    invalid("NATIVE_SUBJECT_DESIGN_INVALID", "Composed Subject requires the existing stable IDs, nonempty labels/tags and at most 48 unique parts.");
  }
  if (design.category === "human" && design.bodyTopology === "biped") {
    const primitives = parts.filter((part) => part.kind === "primitive");
    if (primitives.length === parts.length && primitives.length > 0) {
      let minimum = Number.POSITIVE_INFINITY;
      let maximum = Number.NEGATIVE_INFINITY;
      for (const part of primitives) {
        const rotation = part.localTransform.rotationEulerRadiansXYZ ?? [0, 0, 0];
        const upright = Math.abs(rotation[0]) <= 1e-8 && Math.abs(rotation[2]) <= 1e-8;
        const shape = part.shape;
        const halfHeight = shape.kind === "sphere" ? shape.radiusMeters
          : shape.kind === "box" ? (upright ? shape.sizeMetersXYZ[1] / 2 : Math.hypot(...shape.sizeMetersXYZ) / 2)
          : (upright ? shape.heightMeters / 2 : Math.hypot(shape.radiusMeters, shape.heightMeters / 2));
        minimum = Math.min(minimum, part.localTransform.positionMetersXYZ[1] - halfHeight);
        maximum = Math.max(maximum, part.localTransform.positionMetersXYZ[1] + halfHeight);
      }
      const height = maximum - minimum;
      if (height < 1.6 - 1e-8 || height > 2.1 + 1e-8) {
        invalid("NATIVE_SUBJECT_DESIGN_SCALE_INVALID", "An ordinary composed humanoid must be 1.6–2.1 meters tall.");
      }
    }
    if (parts.some((part) => part.kind === "asset" && part.localTransform.scaleXYZ.some((scale) => scale > 1.25 + 1e-8))) {
      invalid("NATIVE_SUBJECT_DESIGN_SCALE_INVALID", "An ordinary composed humanoid Asset Part cannot exceed 1.25x Registry scale.");
    }
  }
  return diagnostics;
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
  design: ComposedSubjectDesignV1,
): AuthoringResult<PackageSubjectDefinitionV1> {
  try {
    assertWorldPackageAccessorFreeDataGraphV1(design);
    const source = structuredClone(design);
    const proposal = validateSubjectDesignV1({ kind: "composed", definition: source });
    if (!proposal.ok) return { ok: false, diagnostics: proposal.diagnostics };
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
