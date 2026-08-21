import { isEmpty, isNil, isPlainObject } from "lodash-es";

const REQUIRED_RUNTIME_ACTION_IDS = ["idle", "walk", "run", "jump"] as const;
const WORLDKIT_REF_PREFIX = "worldkit://";
const HOST_PUBLIC_URI_PREFIX = "/subject-assets/";

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

function requiredWorldkitRef(value: unknown): string {
  const ref = requiredString(value, "PRODUCT_ASSET_INTAKE_REF_INVALID");
  if (!ref.startsWith(WORLDKIT_REF_PREFIX) || ref.includes("..")) {
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
    subjectDefinitionRef: requiredWorldkitRef(record.subjectDefinitionRef),
    subjectAssetRef: requiredWorldkitRef(record.subjectAssetRef),
    rigProfileRef: requiredWorldkitRef(record.rigProfileRef),
    animationSetRef: requiredWorldkitRef(record.animationSetRef),
    colliderProfileRef: requiredWorldkitRef(record.colliderProfileRef),
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
