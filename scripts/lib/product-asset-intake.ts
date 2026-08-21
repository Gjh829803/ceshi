import { isEmpty, isNil, isPlainObject } from "lodash-es";

import type { SubjectResourceRegistryV3 } from "@whitebox-world/subject-registry";

const REQUIRED_RUNTIME_ACTION_IDS = ["idle", "walk", "run", "jump"] as const;
const HOST_PUBLIC_URI_PREFIX = "/subject-assets/";
const FIXTURE_FIELD_NAMES = new Set([
  "schemaVersion",
  "kind",
  "id",
  "subjectDefinitionRef",
  "subjectAssetRef",
  "rigProfileRef",
  "animationSetRef",
  "colliderProfileRef",
  "hostPublicUri",
  "glbRepositoryPath",
  "productAssetManifestPath",
  "productActionManifestPath",
  "authoringWorldPath",
  "artifactDirectoryPath",
  "primaryEntityId",
  "secondaryEntityId",
  "controllerId",
  "requiredRuntimeActionIds",
  "minimumSubjectPoseDifferenceRatio",
]);

export type ProductAssetRuntimeActionIdV1 = (typeof REQUIRED_RUNTIME_ACTION_IDS)[number];

export interface ProductAssetIntakeFixtureV1 {
  readonly schemaVersion: 1;
  readonly kind: "product-asset-intake-fixture";
  readonly id: string;
  readonly subjectDefinitionRef: string;
  readonly subjectAssetRef: string;
  readonly rigProfileRef: string;
  readonly animationSetRef: string;
  readonly colliderProfileRef: string;
  readonly hostPublicUri: string;
  readonly glbRepositoryPath: string;
  readonly productAssetManifestPath: string;
  readonly productActionManifestPath: string;
  readonly authoringWorldPath: string;
  readonly artifactDirectoryPath: string;
  readonly primaryEntityId: string;
  readonly secondaryEntityId: string;
  readonly controllerId: string;
  readonly requiredRuntimeActionIds: readonly [
    "idle",
    "walk",
    "run",
    "jump",
  ];
  readonly minimumSubjectPoseDifferenceRatio: number;
}

function fail(code: string): never {
  throw new Error(code);
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== "string" || isEmpty(value.trim())) {
    return fail(code);
  }
  return value;
}

function requiredWorldkitRef(value: unknown, expectedPrefix: string): string {
  const ref = requiredString(value, "PRODUCT_ASSET_INTAKE_REF_INVALID");
  if (!ref.startsWith(expectedPrefix) || ref.includes("..")) {
    return fail("PRODUCT_ASSET_INTAKE_REF_INVALID");
  }
  return ref;
}

function requiredRepositoryPath(value: unknown): string {
  const repositoryPath = requiredString(value, "PRODUCT_ASSET_INTAKE_PATH_TRAVERSAL");
  if (
    repositoryPath.startsWith("/") ||
    repositoryPath.split("/").some((segment) => segment === ".." || segment === "")
  ) {
    return fail("PRODUCT_ASSET_INTAKE_PATH_TRAVERSAL");
  }
  return repositoryPath;
}

function requiredHostPublicUri(value: unknown): string {
  const hostPublicUri = requiredString(value, "PRODUCT_ASSET_INTAKE_HOST_URI_INVALID");
  if (
    !hostPublicUri.startsWith(HOST_PUBLIC_URI_PREFIX) ||
    hostPublicUri.includes("://") ||
    hostPublicUri.split("/").includes("..")
  ) {
    return fail("PRODUCT_ASSET_INTAKE_HOST_URI_INVALID");
  }
  return hostPublicUri;
}

export function parseProductAssetIntakeFixtureV1(
  value: unknown,
): ProductAssetIntakeFixtureV1 {
  if (!isPlainObject(value) || isNil(value)) {
    return fail("PRODUCT_ASSET_INTAKE_FIXTURE_INVALID");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((fieldName) => !FIXTURE_FIELD_NAMES.has(fieldName))) {
    return fail("PRODUCT_ASSET_INTAKE_FIELD_UNKNOWN");
  }
  if (record.schemaVersion !== 1 || record.kind !== "product-asset-intake-fixture") {
    return fail("PRODUCT_ASSET_INTAKE_FIXTURE_INVALID");
  }

  const requiredRuntimeActionIds = record.requiredRuntimeActionIds;
  if (
    !Array.isArray(requiredRuntimeActionIds) ||
    requiredRuntimeActionIds.length !== REQUIRED_RUNTIME_ACTION_IDS.length ||
    REQUIRED_RUNTIME_ACTION_IDS.some(
      (actionId, index) => requiredRuntimeActionIds[index] !== actionId,
    )
  ) {
    return fail("PRODUCT_ASSET_INTAKE_ACTION_SET_INVALID");
  }

  const primaryEntityId = requiredString(
    record.primaryEntityId,
    "PRODUCT_ASSET_INTAKE_ENTITY_IDS_INVALID",
  );
  const secondaryEntityId = requiredString(
    record.secondaryEntityId,
    "PRODUCT_ASSET_INTAKE_ENTITY_IDS_INVALID",
  );
  const controllerId = requiredString(
    record.controllerId,
    "PRODUCT_ASSET_INTAKE_ENTITY_IDS_INVALID",
  );
  if (
    primaryEntityId === secondaryEntityId ||
    primaryEntityId === controllerId ||
    secondaryEntityId === controllerId
  ) {
    return fail("PRODUCT_ASSET_INTAKE_ENTITY_IDS_INVALID");
  }

  const minimumSubjectPoseDifferenceRatio = record.minimumSubjectPoseDifferenceRatio;
  if (
    typeof minimumSubjectPoseDifferenceRatio !== "number" ||
    !Number.isFinite(minimumSubjectPoseDifferenceRatio) ||
    minimumSubjectPoseDifferenceRatio <= 0 ||
    minimumSubjectPoseDifferenceRatio > 1
  ) {
    return fail("PRODUCT_ASSET_INTAKE_POSE_RATIO_INVALID");
  }

  return {
    schemaVersion: 1,
    kind: "product-asset-intake-fixture",
    id: requiredString(record.id, "PRODUCT_ASSET_INTAKE_FIXTURE_INVALID"),
    subjectDefinitionRef: requiredWorldkitRef(
      record.subjectDefinitionRef,
      "worldkit://subject-definition/",
    ),
    subjectAssetRef: requiredWorldkitRef(
      record.subjectAssetRef,
      "worldkit://subject-asset/",
    ),
    rigProfileRef: requiredWorldkitRef(
      record.rigProfileRef,
      "worldkit://rig-profile/",
    ),
    animationSetRef: requiredWorldkitRef(
      record.animationSetRef,
      "worldkit://animation-set/",
    ),
    colliderProfileRef: requiredWorldkitRef(
      record.colliderProfileRef,
      "worldkit://collider-profile/",
    ),
    hostPublicUri: requiredHostPublicUri(record.hostPublicUri),
    glbRepositoryPath: requiredRepositoryPath(record.glbRepositoryPath),
    productAssetManifestPath: requiredRepositoryPath(record.productAssetManifestPath),
    productActionManifestPath: requiredRepositoryPath(record.productActionManifestPath),
    authoringWorldPath: requiredRepositoryPath(record.authoringWorldPath),
    artifactDirectoryPath: requiredRepositoryPath(record.artifactDirectoryPath),
    primaryEntityId,
    secondaryEntityId,
    controllerId,
    requiredRuntimeActionIds: [...REQUIRED_RUNTIME_ACTION_IDS],
    minimumSubjectPoseDifferenceRatio,
  };
}

export function assertProductAssetIntakeBindingsV1(
  fixture: ProductAssetIntakeFixtureV1,
  options: {
    readonly registry: SubjectResourceRegistryV3;
    readonly hostPublicUriBySubjectAssetRef: Readonly<Record<string, string>>;
  },
): void {
  const subjectAsset = options.registry.resolveSubjectAsset(fixture.subjectAssetRef);
  const rigProfile = options.registry.resolveRigProfile(fixture.rigProfileRef);
  const animationSet = options.registry.resolveAnimationSet(fixture.animationSetRef);
  const colliderProfile = options.registry.resolveColliderProfile(fixture.colliderProfileRef);
  const subjectDefinition = options.registry.resolveSubjectDefinition(
    fixture.subjectDefinitionRef,
  );
  if (
    isNil(subjectAsset) ||
    isNil(rigProfile) ||
    isNil(animationSet) ||
    isNil(colliderProfile) ||
    isNil(subjectDefinition)
  ) {
    return fail("PRODUCT_ASSET_INTAKE_REGISTRY_RESOURCE_MISSING");
  }

  const hasSubjectAssetPart = subjectDefinition.visualParts.some(
    (part) => part.kind === "asset" && part.subjectAssetRef === fixture.subjectAssetRef,
  );
  const hasRequiredActionBindings = fixture.requiredRuntimeActionIds.every(
    (actionId) =>
      animationSet.requiredActionIds.includes(actionId) &&
      animationSet.animationBindings.some((binding) => binding.actionId === actionId),
  );
  if (
    !hasSubjectAssetPart ||
    subjectDefinition.visualBinding.mode !== "rigged" ||
    subjectDefinition.visualBinding.rigProfileRef !== fixture.rigProfileRef ||
    subjectDefinition.visualBinding.animationSetRef !== fixture.animationSetRef ||
    subjectDefinition.colliderPolicy.kind !== "profile" ||
    subjectDefinition.colliderPolicy.colliderProfileRef !== fixture.colliderProfileRef ||
    !rigProfile.compatibleSubjectAssetRefs.includes(fixture.subjectAssetRef) ||
    animationSet.subjectAssetRef !== fixture.subjectAssetRef ||
    animationSet.rigProfileRef !== fixture.rigProfileRef ||
    !hasRequiredActionBindings ||
    !colliderProfile.supportedBodyTopologies.includes(subjectDefinition.bodyTopology)
  ) {
    return fail("PRODUCT_ASSET_INTAKE_REGISTRY_BINDING_MISMATCH");
  }

  if (
    !Object.hasOwn(options.hostPublicUriBySubjectAssetRef, fixture.subjectAssetRef) ||
    options.hostPublicUriBySubjectAssetRef[fixture.subjectAssetRef] !== fixture.hostPublicUri
  ) {
    return fail("PRODUCT_ASSET_INTAKE_HOST_BINDING_MISMATCH");
  }
}
