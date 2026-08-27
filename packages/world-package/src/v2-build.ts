import type {
  AuthoringSpecV4,
  NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import type { GameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import { gameplayBootstrapCanonicalBytesV1 } from "@whitebox-world/gameplay-contracts";
import type { LayoutSolveResultV1 } from "@whitebox-world/layout-solver";
import {
  canonicalJsonBytes,
  sha256Bytes,
} from "@whitebox-world/protocol";
import type { ExecutionPlanV5 } from "@whitebox-world/runtime-contracts";
import { isEmpty, isNil, isPlainObject } from "lodash-es";

import {
  assertWorldPackageBuildReceiptClosureV1,
  createWorldPackageBuildReceiptV1,
} from "./build-receipt.js";
import {
  assertSafeWorldPackagePathV1,
  assertWorldPackageAccessorFreeDataGraphV1,
  copyAdmittedWorldPackageBytesV1,
} from "./manifest.js";
import {
  migrateWorldPackageBuildReceiptV1ToV2,
} from "./v2-contract.js";
import {
  assembleWorldPackageDirectoryV2,
  type WorldPackageDirectoryFileV2,
  type WorldPackageDirectoryV2,
} from "./v2-directory.js";
import type {
  WorldPackageDistributionPolicyV2,
  WorldPackageHostCompatibilityV2,
  WorldPackageManifestV2,
} from "./v2-types.js";
import type { WorldPackageSha256HashV1 } from "./types.js";

type UnknownRecord = Record<string, unknown>;

const INPUT_FIELDS = [
  "packageId",
  "title",
  "sdkVersion",
  "distributionPolicy",
  "canonicalAuthoringSchemaHash",
  "aiSchemaProjectionProfile",
  "hostCompatibility",
  "authoringSpec",
  "normalizedWorldIr",
  "layoutSolveResult",
  "executionPlan",
  "gameplayBootstrap",
  "resourceArtifacts",
  "generatedResourceProvenance",
  "licenseDocuments",
  "noticeText",
  "includeAuthoringSpec",
] as const;
const RESOURCE_REQUIRED_FIELDS = [
  "resourceRef",
  "packagePath",
  "mediaType",
  "bytes",
  "subjectAssetManifestHash",
  "licenseDocumentId",
  "licenseSpdxExpression",
  "redistributionPolicy",
] as const;
const RESOURCE_ALLOWED_FIELDS = [
  ...RESOURCE_REQUIRED_FIELDS,
  "sourceUri",
  "author",
] as const;
const GENERATED_PROVENANCE_REQUIRED_FIELDS = [
  "licenseDocumentId",
  "licenseSpdxExpression",
  "redistributionPolicy",
] as const;
const GENERATED_PROVENANCE_ALLOWED_FIELDS = [
  ...GENERATED_PROVENANCE_REQUIRED_FIELDS,
  "sourceUri",
  "author",
] as const;
const LICENSE_DOCUMENT_FIELDS = [
  "id",
  "spdxLicenseExpression",
  "path",
  "text",
] as const;
const UTF8_BOM = "\ufeff";

export interface ResolvedWorldPackageResourceArtifactV2 {
  readonly resourceRef: string;
  readonly packagePath: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly subjectAssetManifestHash: WorldPackageSha256HashV1;
  readonly licenseDocumentId: string;
  readonly licenseSpdxExpression: string;
  readonly redistributionPolicy: "allowed" | "internal-only" | "prohibited";
  readonly sourceUri?: string;
  readonly author?: string;
}

export interface WorldPackageGeneratedResourceProvenanceV2 {
  readonly licenseDocumentId: string;
  readonly licenseSpdxExpression: string;
  readonly redistributionPolicy: "allowed" | "internal-only" | "prohibited";
  readonly sourceUri?: string;
  readonly author?: string;
}

export interface WorldPackageLicenseDocumentInputV2 {
  readonly id: string;
  readonly spdxLicenseExpression: string;
  readonly path: `LICENSES/${string}`;
  readonly text: string;
}

export interface CreateWorldPackageV2Input {
  readonly packageId: string;
  readonly title: string;
  readonly sdkVersion: string;
  readonly distributionPolicy: WorldPackageDistributionPolicyV2;
  readonly canonicalAuthoringSchemaHash: WorldPackageSha256HashV1;
  readonly aiSchemaProjectionProfile: WorldPackageManifestV2["aiSchemaProjectionProfile"];
  readonly hostCompatibility: WorldPackageHostCompatibilityV2;
  readonly authoringSpec: AuthoringSpecV4;
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly layoutSolveResult: LayoutSolveResultV1;
  readonly executionPlan: ExecutionPlanV5;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly resourceArtifacts: readonly ResolvedWorldPackageResourceArtifactV2[];
  readonly generatedResourceProvenance: WorldPackageGeneratedResourceProvenanceV2;
  readonly licenseDocuments: readonly WorldPackageLicenseDocumentInputV2[];
  readonly noticeText: string;
  readonly includeAuthoringSpec: boolean;
}

export type WorldPackageBuildContextV2 = Pick<
  CreateWorldPackageV2Input,
  | "title"
  | "sdkVersion"
  | "distributionPolicy"
  | "canonicalAuthoringSchemaHash"
  | "aiSchemaProjectionProfile"
  | "hostCompatibility"
  | "generatedResourceProvenance"
  | "licenseDocuments"
  | "noticeText"
  | "includeAuthoringSpec"
>;

interface CanonicalLegalDocument {
  readonly id: string;
  readonly spdxLicenseExpression: string;
  readonly path: `LICENSES/${string}`;
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly contentHash: WorldPackageSha256HashV1;
}

function buildFail(path: string, message: string): never {
  throw new Error(
    `WORLD_PACKAGE_V2_BUILD_INVALID: ${isEmpty(path) ? message : `${path}: ${message}`}`,
  );
}

function exactRecord(
  value: unknown,
  requiredFields: readonly string[],
  allowedFields: readonly string[],
  path: string,
): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) {
    buildFail(path, "expected a plain object");
  }
  const record = value as UnknownRecord;
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(record).find((field) => !allowed.has(field));
  if (!isNil(unknown)) buildFail(path, `unknown field '${unknown}'`);
  for (const field of requiredFields) {
    if (!Object.hasOwn(record, field) || isNil(record[field])) {
      buildFail(path, `missing field '${field}'`);
    }
  }
  return record;
}

function isPlainDenseArray(value: unknown): value is readonly unknown[] {
  return (
    Array.isArray(value) &&
    Object.getPrototypeOf(value) === Array.prototype &&
    Object.getOwnPropertyNames(value).length === value.length + 1
  );
}

function requireArray(value: unknown, path: string): readonly unknown[] {
  if (!isPlainDenseArray(value)) buildFail(path, "must be a plain dense array");
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || isEmpty(value) || value.trim() !== value) {
    buildFail(path, "must be a non-empty canonical string");
  }
  return value;
}

function requireText(value: unknown, path: string): string {
  if (
    typeof value !== "string" ||
    isEmpty(value) ||
    value.startsWith(UTF8_BOM) ||
    value.includes("\u0000") ||
    value.normalize("NFC") !== value
  ) {
    buildFail(path, "must be non-empty canonical UTF-8 text without BOM or NUL");
  }
  return value;
}

function requirePolicy(
  value: unknown,
  path: string,
): ResolvedWorldPackageResourceArtifactV2["redistributionPolicy"] {
  if (
    value !== "allowed" &&
    value !== "internal-only" &&
    value !== "prohibited"
  ) {
    buildFail(path, "invalid redistribution policy");
  }
  return value;
}

function requireHash(value: unknown, path: string): WorldPackageSha256HashV1 {
  if (
    typeof value !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(value) ||
    value === `sha256:${"0".repeat(64)}`
  ) {
    buildFail(path, "must be a non-zero lowercase sha256 hash");
  }
  return value as WorldPackageSha256HashV1;
}

function optionalString(
  record: UnknownRecord,
  field: "sourceUri" | "author",
  path: string,
): Readonly<Record<string, string>> {
  const value = record[field];
  return isNil(value) ? {} : { [field]: requireString(value, `${path}/${field}`) };
}

function canonicalResources(
  value: unknown,
): readonly ResolvedWorldPackageResourceArtifactV2[] {
  const resources = requireArray(value, "resourceArtifacts").map((candidate, index) => {
    const path = `resourceArtifacts/${index}`;
    const row = exactRecord(
      candidate,
      RESOURCE_REQUIRED_FIELDS,
      RESOURCE_ALLOWED_FIELDS,
      path,
    );
    if (
      !(row.bytes instanceof Uint8Array) ||
      Object.getPrototypeOf(row.bytes) !== Uint8Array.prototype
    ) {
      buildFail(`${path}/bytes`, "must be a plain Uint8Array");
    }
    return {
      resourceRef: requireString(row.resourceRef, `${path}/resourceRef`),
      packagePath: assertSafeWorldPackagePathV1(
        row.packagePath,
        `${path}/packagePath`,
        "WORLD_PACKAGE_V2_BUILD_INVALID",
      ),
      mediaType: requireString(row.mediaType, `${path}/mediaType`),
      bytes: copyAdmittedWorldPackageBytesV1(row.bytes),
      subjectAssetManifestHash: requireHash(
        row.subjectAssetManifestHash,
        `${path}/subjectAssetManifestHash`,
      ),
      licenseDocumentId: requireString(
        row.licenseDocumentId,
        `${path}/licenseDocumentId`,
      ),
      licenseSpdxExpression: requireString(
        row.licenseSpdxExpression,
        `${path}/licenseSpdxExpression`,
      ),
      redistributionPolicy: requirePolicy(
        row.redistributionPolicy,
        `${path}/redistributionPolicy`,
      ),
      ...optionalString(row, "sourceUri", path),
      ...optionalString(row, "author", path),
    } as ResolvedWorldPackageResourceArtifactV2;
  }).sort((left, right) =>
    left.resourceRef < right.resourceRef
      ? -1
      : left.resourceRef > right.resourceRef
        ? 1
        : left.packagePath < right.packagePath
          ? -1
          : left.packagePath > right.packagePath
            ? 1
            : 0
  );
  if (
    new Set(resources.map((resource) => resource.resourceRef)).size !== resources.length ||
    new Set(resources.map((resource) => resource.packagePath)).size !== resources.length
  ) {
    buildFail("resourceArtifacts", "resource Refs and package paths must be unique");
  }
  return resources;
}

function canonicalGeneratedProvenance(
  value: unknown,
): WorldPackageGeneratedResourceProvenanceV2 {
  const path = "generatedResourceProvenance";
  const row = exactRecord(
    value,
    GENERATED_PROVENANCE_REQUIRED_FIELDS,
    GENERATED_PROVENANCE_ALLOWED_FIELDS,
    path,
  );
  return {
    licenseDocumentId: requireString(
      row.licenseDocumentId,
      `${path}/licenseDocumentId`,
    ),
    licenseSpdxExpression: requireString(
      row.licenseSpdxExpression,
      `${path}/licenseSpdxExpression`,
    ),
    redistributionPolicy: requirePolicy(
      row.redistributionPolicy,
      `${path}/redistributionPolicy`,
    ),
    ...optionalString(row, "sourceUri", path),
    ...optionalString(row, "author", path),
  } as WorldPackageGeneratedResourceProvenanceV2;
}

function canonicalLegalDocuments(
  value: unknown,
  noticeText: string,
): readonly CanonicalLegalDocument[] {
  const documents = requireArray(value, "licenseDocuments").map((candidate, index) => {
    const path = `licenseDocuments/${index}`;
    const row = exactRecord(
      candidate,
      LICENSE_DOCUMENT_FIELDS,
      LICENSE_DOCUMENT_FIELDS,
      path,
    );
    const licensePath = assertSafeWorldPackagePathV1(
      row.path,
      `${path}/path`,
      "WORLD_PACKAGE_V2_BUILD_INVALID",
    );
    if (!licensePath.startsWith("LICENSES/")) {
      buildFail(`${path}/path`, "must be inside LICENSES/");
    }
    const text = requireText(row.text, `${path}/text`);
    const bytes = copyAdmittedWorldPackageBytesV1(
      new TextEncoder().encode(text),
    );
    return {
      id: requireString(row.id, `${path}/id`),
      spdxLicenseExpression: requireString(
        row.spdxLicenseExpression,
        `${path}/spdxLicenseExpression`,
      ),
      path: licensePath as `LICENSES/${string}`,
      text,
      bytes,
      contentHash: sha256Bytes(bytes) as WorldPackageSha256HashV1,
    };
  }).sort((left, right) =>
    left.id < right.id
      ? -1
      : left.id > right.id
        ? 1
        : left.path < right.path
          ? -1
          : left.path > right.path
            ? 1
            : 0
  );
  if (isEmpty(documents)) {
    buildFail("licenseDocuments", "must contain at least one legal document");
  }
  if (
    new Set(documents.map((document) => document.id)).size !== documents.length ||
    new Set(documents.map((document) => document.path)).size !== documents.length
  ) {
    buildFail("licenseDocuments", "IDs and paths must be unique");
  }
  for (const document of documents) {
    if (!noticeText.includes(document.path)) {
      buildFail("noticeText", `must reference '${document.path}'`);
    }
  }
  return documents;
}

function assertLegalClosure(
  distributionPolicy: WorldPackageDistributionPolicyV2,
  resources: readonly ResolvedWorldPackageResourceArtifactV2[],
  generated: WorldPackageGeneratedResourceProvenanceV2,
  documents: readonly CanonicalLegalDocument[],
): void {
  const allProvenance = [...resources, generated];
  if (
    allProvenance.some((resource) => resource.redistributionPolicy === "prohibited") ||
    (distributionPolicy === "redistributable" &&
      allProvenance.some((resource) =>
        resource.redistributionPolicy !== "allowed"
      ))
  ) {
    buildFail("distributionPolicy", "conflicts with resource redistribution policy");
  }
  const documentIds = new Set(documents.map((document) => document.id));
  if (allProvenance.some((resource) => !documentIds.has(resource.licenseDocumentId))) {
    buildFail("licenseDocuments", "every resource must bind one legal document");
  }
  const usedDocumentIds = new Set(
    allProvenance.map((resource) => resource.licenseDocumentId),
  );
  if (documents.some((document) => !usedDocumentIds.has(document.id))) {
    buildFail("licenseDocuments", "unused legal documents are forbidden");
  }
  const documentById = new Map(documents.map((document) => [document.id, document]));
  if (allProvenance.some((resource) =>
    documentById.get(resource.licenseDocumentId)?.spdxLicenseExpression !==
      resource.licenseSpdxExpression
  )) {
    buildFail("licenseDocuments", "resource SPDX provenance does not match its document");
  }
}

function assertSubjectAssetManifestClosure(
  resources: readonly ResolvedWorldPackageResourceArtifactV2[],
  normalizedWorldIr: NormalizedWorldIRV4,
): void {
  const assetsByRef = new Map(
    normalizedWorldIr.resources.subjectAssets.map((asset) => [
      asset.subjectAssetRef,
      asset,
    ]),
  );
  if (assetsByRef.size !== resources.length) {
    buildFail("resourceArtifacts", "must contain every and only locked Subject Asset");
  }
  for (const resource of resources) {
    const asset = assetsByRef.get(resource.resourceRef);
    if (
      isNil(asset) ||
      asset.subjectAssetManifestHash !== resource.subjectAssetManifestHash
    ) {
      buildFail(
        `resourceArtifacts/${resource.resourceRef}/subjectAssetManifestHash`,
        "does not match NormalizedWorldIRV4",
      );
    }
  }
}

function jsonFile(path: string, value: unknown): WorldPackageDirectoryFileV2 {
  return {
    path,
    mediaType: "application/json",
    bytes: copyAdmittedWorldPackageBytesV1(canonicalJsonBytes(value)),
  };
}

function createWorldPackageV2Internal(
  input: CreateWorldPackageV2Input,
): WorldPackageDirectoryV2 {
  assertWorldPackageAccessorFreeDataGraphV1(
    input,
    "WORLD_PACKAGE_V2_BUILD_ACCESSOR_FORBIDDEN",
  );
  const record = exactRecord(input, INPUT_FIELDS, INPUT_FIELDS, "");
  if (
    record.distributionPolicy !== "internal-only" &&
    record.distributionPolicy !== "redistributable"
  ) {
    buildFail("distributionPolicy", "invalid package distribution policy");
  }
  if (typeof record.includeAuthoringSpec !== "boolean") {
    buildFail("includeAuthoringSpec", "must be boolean");
  }
  const distributionPolicy = record.distributionPolicy;
  const noticeText = requireText(record.noticeText, "noticeText");
  const noticeBytes = copyAdmittedWorldPackageBytesV1(
    new TextEncoder().encode(noticeText),
  );
  const resources = canonicalResources(record.resourceArtifacts);
  const generatedProvenance = canonicalGeneratedProvenance(
    record.generatedResourceProvenance,
  );
  const legalDocuments = canonicalLegalDocuments(
    record.licenseDocuments,
    noticeText,
  );
  assertSubjectAssetManifestClosure(
    resources,
    record.normalizedWorldIr as NormalizedWorldIRV4,
  );
  assertLegalClosure(
    distributionPolicy,
    resources,
    generatedProvenance,
    legalDocuments,
  );

  const v1Receipt = createWorldPackageBuildReceiptV1({
    packageId: requireString(record.packageId, "packageId"),
    authoringSpec: record.authoringSpec as AuthoringSpecV4,
    normalizedWorldIr: record.normalizedWorldIr as NormalizedWorldIRV4,
    layoutSolveResult: record.layoutSolveResult as LayoutSolveResultV1,
    executionPlan: record.executionPlan as ExecutionPlanV5,
    gameplayBootstrap: record.gameplayBootstrap as GameplayBootstrapV1,
    resourceArtifacts: resources.map((resource) => ({
      resourceRef: resource.resourceRef,
      packagePath: resource.packagePath,
      mediaType: resource.mediaType,
      bytes: resource.bytes,
    })),
    includeAuthoringSpec: record.includeAuthoringSpec,
  });
  assertWorldPackageBuildReceiptClosureV1(v1Receipt, {
    authoringSpec: record.authoringSpec as AuthoringSpecV4,
    normalizedWorldIr: record.normalizedWorldIr as NormalizedWorldIRV4,
    layoutSolveResult: record.layoutSolveResult as LayoutSolveResultV1,
    executionPlan: record.executionPlan as ExecutionPlanV5,
    gameplayBootstrap: record.gameplayBootstrap as GameplayBootstrapV1,
  });

  const resourcesByRef = new Map(resources.map((resource) => [
    resource.resourceRef,
    resource,
  ]));
  const manifestResources = v1Receipt.manifest.resources.map((resource) => {
    const provenance = resource.packagePath === "gameplay/bootstrap.json"
      ? generatedProvenance
      : resourcesByRef.get(resource.resourceRef);
    if (isNil(provenance)) {
      buildFail(
        `resourceArtifacts/${resource.resourceRef}`,
        "legal provenance is missing",
      );
    }
    return {
      ...resource,
      licenseDocumentId: provenance.licenseDocumentId,
      redistributionPolicy: provenance.redistributionPolicy,
      ...(isNil(provenance.sourceUri) ? {} : { sourceUri: provenance.sourceUri }),
      ...(isNil(provenance.author) ? {} : { author: provenance.author }),
    };
  });
  const v2OnlyFileIntegrityEntries = [
    ...legalDocuments.map((document) => ({
      path: document.path,
      mediaType: "text/plain; charset=utf-8",
      sizeBytes: document.bytes.byteLength,
      sha256: document.contentHash,
    })),
    {
      path: "NOTICE",
      mediaType: "text/plain; charset=utf-8",
      sizeBytes: noticeBytes.byteLength,
      sha256: sha256Bytes(noticeBytes) as WorldPackageSha256HashV1,
    },
  ].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);

  const migrated = migrateWorldPackageBuildReceiptV1ToV2({
    sourceReceipt: v1Receipt,
    context: {
      title: requireString(record.title, "title"),
      sdkVersion: requireString(record.sdkVersion, "sdkVersion"),
      canonicalAuthoringSchemaHash:
        record.canonicalAuthoringSchemaHash as WorldPackageSha256HashV1,
      aiSchemaProjectionProfile:
        record.aiSchemaProjectionProfile as WorldPackageManifestV2["aiSchemaProjectionProfile"],
      worldBounds: (record.authoringSpec as AuthoringSpecV4).world.bounds,
      resourceBudget: {
        maximumVertices: (record.authoringSpec as AuthoringSpecV4)
          .world.resourceBudget.maxVertices,
        maximumTriangles: (record.authoringSpec as AuthoringSpecV4)
          .world.resourceBudget.maxTriangles,
        maximumColliders: (record.authoringSpec as AuthoringSpecV4)
          .world.resourceBudget.maxColliders,
      },
      lockedResources: (record.executionPlan as ExecutionPlanV5).resourceLockEntries,
      legal: {
        distributionPolicy,
        noticePath: "NOTICE",
        licenseDocuments: legalDocuments.map((document) => ({
          id: document.id,
          spdxLicenseExpression: document.spdxLicenseExpression,
          path: document.path,
          mediaType: "text/plain; charset=utf-8",
          sizeBytes: document.bytes.byteLength,
          contentHash: document.contentHash,
        })),
      },
      hostCompatibility:
        record.hostCompatibility as WorldPackageHostCompatibilityV2,
      resources: manifestResources,
      v2OnlyFileIntegrityEntries,
    },
  });

  const rootFiles: WorldPackageDirectoryFileV2[] = [
    jsonFile("manifest.json", migrated.receipt.manifest),
    ...(record.includeAuthoringSpec
      ? [jsonFile("authoring-spec.json", record.authoringSpec)]
      : []),
    jsonFile("world.normalized.json", record.normalizedWorldIr),
    jsonFile(
      "registry-lock.json",
      (record.executionPlan as ExecutionPlanV5).resourceLockEntries,
    ),
    jsonFile(
      "layout-solve-report.json",
      (record.layoutSolveResult as LayoutSolveResultV1).report,
    ),
    jsonFile(
      "targets/babylon-web/execution-plan.json",
      record.executionPlan,
    ),
    {
      path: "gameplay/bootstrap.json",
      mediaType: "application/vnd.worldkit.gameplay-bootstrap+json",
      bytes: copyAdmittedWorldPackageBytesV1(
        gameplayBootstrapCanonicalBytesV1(record.gameplayBootstrap),
      ),
    },
    ...resources.map((resource) => ({
      path: resource.packagePath,
      mediaType: resource.mediaType,
      bytes: resource.bytes,
    })),
    { path: "NOTICE", mediaType: "text/plain; charset=utf-8", bytes: noticeBytes },
    ...legalDocuments.map((document) => ({
      path: document.path,
      mediaType: "text/plain; charset=utf-8",
      bytes: document.bytes,
    })),
  ];
  return assembleWorldPackageDirectoryV2({
    receipt: migrated.receipt,
    files: rootFiles,
  });
}

export function createWorldPackageV2(
  input: CreateWorldPackageV2Input,
): WorldPackageDirectoryV2 {
  try {
    return createWorldPackageV2Internal(input);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("WORLD_PACKAGE_V2_BUILD_INVALID")
    ) {
      throw error;
    }
    buildFail(
      "",
      `trusted build closure validation failed: ${
        error instanceof Error ? error.message : "unknown owner failure"
      }`,
    );
  }
}
