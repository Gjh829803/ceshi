import type {
  Diagnostic,
  FeatureOwnershipInput,
  ResourceId,
} from "./types.js";

export function validateFeatureOwnership(
  input: FeatureOwnershipInput,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const featuresById = new Map(input.features.map((feature) => [feature.id, feature]));
  const declaredOwner = new Map<ResourceId, string>();
  const resourcesById = new Map(
    (input.resources ?? []).map((resource) => [resource.id, resource]),
  );

  for (const feature of input.features) {
    for (const dependency of feature.dependencies ?? []) {
      if (featuresById.has(dependency)) continue;
      diagnostics.push({
        severity: "error",
        code: "FEATURE_DEPENDENCY_MISSING",
        message: `Feature ${feature.id} depends on missing feature ${dependency}.`,
        featureId: feature.id,
        suggestions: ["Create the dependency first or remove it from the feature definition."],
      });
    }

    const localIds = new Set<ResourceId>();
    for (const resourceId of feature.resources) {
      if (localIds.has(resourceId)) {
        diagnostics.push({
          severity: "warning",
          code: "FEATURE_RESOURCE_DUPLICATED",
          message: `Feature ${feature.id} lists resource ${resourceId} more than once.`,
          featureId: feature.id,
        });
        continue;
      }
      localIds.add(resourceId);

      const existingOwner = declaredOwner.get(resourceId);
      if (existingOwner !== undefined && existingOwner !== feature.id) {
        diagnostics.push({
          severity: "error",
          code: "RESOURCE_HAS_MULTIPLE_OWNERS",
          message: `Resource ${resourceId} is claimed by both ${existingOwner} and ${feature.id}.`,
          featureId: feature.id,
          suggestions: ["Resources must be created and disposed by exactly one feature."],
        });
      } else {
        declaredOwner.set(resourceId, feature.id);
      }

      if (input.resources !== undefined && !resourcesById.has(resourceId)) {
        diagnostics.push({
          severity: "error",
          code: "FEATURE_RESOURCE_MISSING",
          message: `Feature ${feature.id} owns missing resource ${resourceId}.`,
          featureId: feature.id,
          suggestions: ["Rebuild the feature or remove the stale resource reference."],
        });
      }
    }
  }

  for (const resource of input.resources ?? []) {
    const expectedOwner = declaredOwner.get(resource.id);
    if (
      resource.ownerFeatureId !== undefined &&
      !featuresById.has(resource.ownerFeatureId)
    ) {
      diagnostics.push({
        severity: "error",
        code: "RESOURCE_OWNER_MISSING",
        message: `Resource ${resource.id} refers to missing owner ${resource.ownerFeatureId}.`,
        featureId: resource.ownerFeatureId,
      });
    } else if (
      expectedOwner !== undefined &&
      resource.ownerFeatureId !== undefined &&
      expectedOwner !== resource.ownerFeatureId
    ) {
      diagnostics.push({
        severity: "error",
        code: "RESOURCE_OWNER_MISMATCH",
        message: `Resource ${resource.id} reports owner ${resource.ownerFeatureId}, but ${expectedOwner} claims it.`,
        featureId: expectedOwner,
        suggestions: ["Use the Feature build context to register ownership atomically."],
      });
    } else if (
      input.requireEveryResourceOwned === true &&
      expectedOwner === undefined &&
      resource.ownerFeatureId === undefined
    ) {
      diagnostics.push({
        severity: "warning",
        code: "RESOURCE_UNOWNED",
        message: `Resource ${resource.id} is not owned by a feature.`,
        suggestions: ["Create Agent-authored resources through a Feature build context."],
      });
    }
  }

  return diagnostics;
}
