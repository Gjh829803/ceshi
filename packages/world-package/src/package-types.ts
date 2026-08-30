import type { GameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import type { Sha256HashV1 } from "@whitebox-world/protocol";
import type {
  WorldResourceLockEntryV1,
  CanonicalSceneExecutionPlanV1,
  WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import type {
  WorldBuildIdentityV1,
  WorldPackageRefV1,
} from "@whitebox-world/world-identity";

export type WorldPackageDistributionPolicyV1 =
  | "internal-only"
  | "redistributable";

export interface WorldPackageFileIntegrityEntryV1 {
  readonly path: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly contentHash: Sha256HashV1;
}

export interface WorldPackageLegalDocumentV1 {
  readonly id: string;
  readonly spdxLicenseExpression: string;
  readonly path: `LICENSES/${string}`;
  readonly mediaType: "text/plain; charset=utf-8";
  readonly sizeBytes: number;
  readonly contentHash: Sha256HashV1;
}

export interface WorldPackageResourceArtifactV1 {
  readonly resourceRef: string;
  readonly packagePath: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly contentHash: Sha256HashV1;
  readonly licenseDocumentId: string;
  readonly redistributionPolicy: "allowed" | "internal-only" | "prohibited";
  readonly sourceUri?: string;
  readonly author?: string;
}

export interface WorldPackageHostCompatibilityV1 {
  readonly profileRef: string;
  readonly profileHash: Sha256HashV1;
  readonly runtimeContractVersion: 1;
  readonly requiredFeatureIds: readonly string[];
}

export interface WorldPackageTrustedCompatibilityProfileV1 {
  readonly profileRef: string;
  readonly profileHash: Sha256HashV1;
}

export type WorldPackageHostSignaturePolicyV1 =
  | Readonly<{ readonly mode: "not-required" }>
  | Readonly<{
      readonly mode: "required";
      readonly trustDomain: string;
    }>;

export interface WorldPackageHostPolicyV1 {
  readonly acceptedRuntimeTargets: readonly ["babylon-web"];
  readonly acceptedPackageFormatVersions: readonly [1];
  readonly acceptedManifestSchemaVersions: readonly [1];
  readonly runtimeContractVersion: 1;
  readonly supportedFeatureIds: readonly string[];
  readonly trustedCompatibilityProfiles:
    readonly WorldPackageTrustedCompatibilityProfileV1[];
  readonly allowedDistributionPolicies:
    readonly WorldPackageDistributionPolicyV1[];
  readonly signaturePolicy: WorldPackageHostSignaturePolicyV1;
}

export interface WorldPackageManifestV1 {
  readonly kind: "worldkit-world-package-manifest";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly packageFormatVersion: 1;
  readonly sdkVersion: string;
  readonly worldId: string;
  readonly seed: number;
  readonly runtimeTarget: "babylon-web";
  readonly canonicalizationProfile: "canonical-json-jcs@1";
  readonly hashAlgorithm: "sha256";
  readonly authoringSchema: Readonly<{
    readonly schemaVersion: 4;
    readonly contentHash: Sha256HashV1;
  }>;
  readonly aiSchemaProjectionProfile: Readonly<{
    readonly resourceRef: string;
    readonly contentHash: Sha256HashV1;
  }>;
  readonly normalizedWorldIrSchemaVersion: 4;
  readonly canonicalSceneExecutionPlanSchemaVersion: 1;
  readonly worldRuntimeBootstrapSchemaVersion: 1;
  readonly authoringSpecHash: Sha256HashV1;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly executionPlanHash: Sha256HashV1;
  readonly gameplayBootstrapHash: Sha256HashV1;
  readonly worldRuntimeBootstrapHash: Sha256HashV1;
  readonly registryLockHash: Sha256HashV1;
  readonly layoutSolveReportHash: Sha256HashV1;
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
  readonly lockedResources: readonly WorldResourceLockEntryV1[];
  readonly entryPoint: Readonly<{
    readonly canonicalSceneExecutionPlanPath:
      "targets/babylon-web/canonical-scene-execution-plan.json";
    readonly gameplayBootstrapPath: "gameplay/bootstrap.json";
    readonly worldRuntimeBootstrapPath:
      "runtime/world-runtime-bootstrap.json";
  }>;
  readonly legal: Readonly<{
    readonly distributionPolicy: WorldPackageDistributionPolicyV1;
    readonly noticePath: "NOTICE";
    readonly licenseDocuments: readonly WorldPackageLegalDocumentV1[];
  }>;
  readonly hostCompatibility: WorldPackageHostCompatibilityV1;
  readonly resources: readonly WorldPackageResourceArtifactV1[];
}

export interface WorldPackageBuildReceiptV1 {
  readonly kind: "worldkit-world-package-build-receipt";
  readonly schemaVersion: 1;
  readonly manifest: WorldPackageManifestV1;
  readonly manifestHash: Sha256HashV1;
  readonly fileIntegrityEntries: readonly WorldPackageFileIntegrityEntryV1[];
  readonly worldPackageRootHash: Sha256HashV1;
  readonly worldPackageRef: WorldPackageRefV1;
  readonly worldBuildIdentity: WorldBuildIdentityV1;
  readonly worldBuildIdentityHash: Sha256HashV1;
}

export interface WorldPackageGameplayBootstrapMembershipInputV1 {
  readonly canonicalSceneExecutionPlan: CanonicalSceneExecutionPlanV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly worldPackageBuildReceipt: WorldPackageBuildReceiptV1;
}

export interface WorldPackageSignatureEnvelopeV1 {
  readonly kind: "worldkit-package-signature-envelope";
  readonly schemaVersion: 1;
  readonly packageRootHash: Sha256HashV1;
  readonly packageId: string;
  readonly packageFormatVersion: 1;
  readonly runtimeTarget: "babylon-web";
  readonly signatureAlgorithm: "ed25519";
  readonly keyId: string;
  readonly trustDomain: string;
  readonly signedAt: string;
}
