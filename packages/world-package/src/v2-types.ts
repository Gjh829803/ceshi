import type { ExecutionResourceLockEntryV1 } from "@whitebox-world/runtime-contracts";

import type {
  WorldPackageBuildReceiptV1,
  WorldPackageFileIntegrityEntryV1,
  WorldPackageSha256HashV1,
} from "./types.js";

export type WorldPackageDistributionPolicyV2 =
  | "internal-only"
  | "redistributable";

export interface WorldPackageLegalDocumentV2 {
  readonly id: string;
  readonly spdxLicenseExpression: string;
  readonly path: `LICENSES/${string}`;
  readonly mediaType: "text/plain; charset=utf-8";
  readonly sizeBytes: number;
  readonly contentHash: WorldPackageSha256HashV1;
}

export interface WorldPackageResourceArtifactV2 {
  readonly resourceRef: string;
  readonly packagePath: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly contentHash: WorldPackageSha256HashV1;
  readonly licenseDocumentId: string;
  readonly redistributionPolicy: "allowed" | "internal-only" | "prohibited";
  readonly sourceUri?: string;
  readonly author?: string;
}

export interface WorldPackageHostCompatibilityV2 {
  readonly profileRef: string;
  readonly profileHash: WorldPackageSha256HashV1;
  readonly runtimeContractVersion: 1;
  readonly requiredFeatureIds: readonly string[];
}

export interface WorldPackageManifestV2 {
  readonly kind: "worldkit-world-package-manifest";
  readonly schemaVersion: 2;
  readonly id: string;
  readonly title: string;
  readonly packageFormatVersion: 2;
  readonly sdkVersion: string;
  readonly worldId: string;
  readonly seed: number;
  readonly runtimeTarget: "babylon-web";
  readonly canonicalizationProfile: "canonical-json-jcs@1";
  readonly hashAlgorithm: "sha256";
  readonly authoringSchema: Readonly<{
    readonly schemaVersion: 4;
    readonly contentHash: WorldPackageSha256HashV1;
  }>;
  readonly aiSchemaProjectionProfile: Readonly<{
    readonly resourceRef: string;
    readonly contentHash: WorldPackageSha256HashV1;
  }>;
  readonly normalizedWorldIrSchemaVersion: 4;
  readonly executionPlanSchemaVersion: 5;
  readonly authoringSpecHash: WorldPackageSha256HashV1;
  readonly normalizedWorldIrHash: WorldPackageSha256HashV1;
  readonly executionPlanHash: WorldPackageSha256HashV1;
  readonly registryLockHash: WorldPackageSha256HashV1;
  readonly layoutSolveReportHash: WorldPackageSha256HashV1;
  readonly initialControlledEntityId: string;
  readonly worldBounds: Readonly<{
    readonly centerMetersXZ: readonly [number, number];
    readonly sizeMetersXZ: readonly [number, number];
    readonly heightRangeMeters: readonly [number, number];
  }>;
  readonly resourceBudget: Readonly<{
    readonly maximumVertices: number;
    readonly maximumTriangles: number;
    readonly maximumColliders: number;
  }>;
  readonly lockedResources: readonly ExecutionResourceLockEntryV1[];
  readonly entryPoint: Readonly<{
    readonly executionPlanPath: "targets/babylon-web/execution-plan.json";
    readonly gameplayBootstrapPath: "gameplay/bootstrap.json";
  }>;
  readonly legal: Readonly<{
    readonly distributionPolicy: WorldPackageDistributionPolicyV2;
    readonly noticePath: "NOTICE";
    readonly licenseDocuments: readonly WorldPackageLegalDocumentV2[];
  }>;
  readonly hostCompatibility: WorldPackageHostCompatibilityV2;
  readonly resources: readonly WorldPackageResourceArtifactV2[];
}

export interface WorldPackageBuildReceiptV2 {
  readonly kind: "worldkit-world-package-build-receipt";
  readonly schemaVersion: 2;
  readonly manifest: WorldPackageManifestV2;
  readonly manifestHash: WorldPackageSha256HashV1;
  readonly fileIntegrityEntries: readonly WorldPackageFileIntegrityEntryV1[];
  readonly worldPackageRootHash: WorldPackageSha256HashV1;
}

export interface WorldPackageSignatureEnvelopeV1 {
  readonly kind: "worldkit-package-signature-envelope";
  readonly schemaVersion: 1;
  readonly packageRootHash: WorldPackageSha256HashV1;
  readonly packageId: string;
  readonly packageFormatVersion: 2;
  readonly runtimeTarget: "babylon-web";
  readonly signatureAlgorithm: "ed25519";
  readonly keyId: string;
  readonly trustDomain: string;
  readonly signedAt: string;
}

export interface WorldPackageMigrationReportV1 {
  readonly kind: "worldkit-world-package-migration-report";
  readonly schemaVersion: 1;
  readonly sourceManifestSchemaVersion: 1;
  readonly targetManifestSchemaVersion: 2;
  readonly sourceWorldPackageRootHash: WorldPackageSha256HashV1;
  readonly targetWorldPackageRootHash: WorldPackageSha256HashV1;
  readonly sourceManifestHash: WorldPackageSha256HashV1;
  readonly targetManifestHash: WorldPackageSha256HashV1;
  readonly migratedFieldIds: readonly string[];
}

export interface WorldPackageV1ToV2MigrationContextV1 {
  readonly title: string;
  readonly sdkVersion: string;
  readonly canonicalAuthoringSchemaHash: WorldPackageSha256HashV1;
  readonly aiSchemaProjectionProfile: WorldPackageManifestV2["aiSchemaProjectionProfile"];
  readonly worldBounds: WorldPackageManifestV2["worldBounds"];
  readonly resourceBudget: WorldPackageManifestV2["resourceBudget"];
  readonly lockedResources: WorldPackageManifestV2["lockedResources"];
  readonly legal: WorldPackageManifestV2["legal"];
  readonly hostCompatibility: WorldPackageManifestV2["hostCompatibility"];
  readonly resources: WorldPackageManifestV2["resources"];
  readonly v2OnlyFileIntegrityEntries: readonly WorldPackageFileIntegrityEntryV1[];
}

export interface MigrateWorldPackageBuildReceiptV1ToV2Input {
  readonly sourceReceipt: WorldPackageBuildReceiptV1;
  readonly context: WorldPackageV1ToV2MigrationContextV1;
}

export interface MigrateWorldPackageBuildReceiptV1ToV2Result {
  readonly receipt: WorldPackageBuildReceiptV2;
  readonly report: WorldPackageMigrationReportV1;
}
