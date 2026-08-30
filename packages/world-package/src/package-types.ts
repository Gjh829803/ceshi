import type { GameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import type { Sha256HashV1 } from "@whitebox-world/protocol";
import type {
  BabylonNativeAssetLockV1,
  BabylonNativeDependencyLockV1,
  BabylonNativeSceneBootstrapV1,
  BabylonNativeSceneContributionV1,
  BabylonNativeSceneModuleBundleManifestV1,
  NativeSceneCheckResultV1,
  WorldResourceLockEntryV1,
  CanonicalSceneExecutionPlanV1,
  WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import type {
  SceneAuthoringAttemptResultV1,
  SceneAuthoringAttemptV1,
  SceneAuthoringRouteDecisionV1,
} from "@whitebox-world/scene-authoring-contracts";
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

export interface WorldPackageWorldBoundsV1 {
  readonly centerMetersXZ: readonly [number, number];
  readonly sizeMetersXZ: readonly [number, number];
  readonly heightRangeMeters: readonly [number, number];
}

export interface WorldPackageResourceBudgetV1 {
  readonly maximumVertices: number;
  readonly maximumTriangles: number;
  readonly maximumColliders: number;
}

export interface WorldPackageLegalV1 {
  readonly distributionPolicy: WorldPackageDistributionPolicyV1;
  readonly noticePath: "NOTICE";
  readonly licenseDocuments: readonly WorldPackageLegalDocumentV1[];
}

export type WorldPackageSceneSourceV1 =
  | Readonly<{
      readonly kind: "canonical-execution-plan";
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
      readonly authoringSpecHash: Sha256HashV1;
      readonly normalizedWorldIrHash: Sha256HashV1;
      readonly executionPlanHash: Sha256HashV1;
      readonly layoutSolveReportHash: Sha256HashV1;
      readonly canonicalSceneExecutionPlanPath:
        "targets/babylon-web/canonical-scene-execution-plan.json";
    }>
  | Readonly<{
      readonly kind: "babylon-native-scene";
      readonly nativeSceneBootstrapHash: Sha256HashV1;
      readonly sceneModuleBundleHash: Sha256HashV1;
      readonly nativeSceneContributionHash: Sha256HashV1;
      readonly dependencyLockHash: Sha256HashV1;
      readonly assetLockHash: Sha256HashV1;
      readonly nativeSceneCheckResultHash: Sha256HashV1;
      readonly sceneAuthoringRouteDecisionHash: Sha256HashV1;
      readonly sceneAuthoringAttemptHash: Sha256HashV1;
      readonly sceneAuthoringAttemptResultRef: string;
      readonly sceneAuthoringAttemptResultHash: Sha256HashV1;
      readonly nativeSceneBootstrapPath: "native/bootstrap.json";
      readonly sceneModuleBundleManifestPath: "native/module-bundle.json";
      readonly sceneModuleBundlePath: "native/scene.mjs";
      readonly dependencyLockPath: "native/dependency-lock.json";
      readonly assetLockPath: "native/asset-lock.json";
      readonly nativeSceneContributionPath: "native/contribution.json";
      readonly nativeSceneCheckResultPath: "native/check-result.json";
      readonly sceneAuthoringRouteDecisionPath:
        "authoring/scene-authoring-route-decision.json";
      readonly sceneAuthoringAttemptPath:
        "authoring/scene-authoring-attempt.json";
      readonly sceneAuthoringAttemptResultPath:
        "authoring/scene-authoring-attempt-result.json";
    }>;

export type CanonicalWorldPackageSceneSourceV1 = Extract<
  WorldPackageSceneSourceV1,
  { readonly kind: "canonical-execution-plan" }
>;

export type BabylonNativeWorldPackageSceneSourceV1 = Extract<
  WorldPackageSceneSourceV1,
  { readonly kind: "babylon-native-scene" }
>;

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
  readonly sceneSource: WorldPackageSceneSourceV1;
  readonly worldRuntimeBootstrapSchemaVersion: 1;
  readonly gameplayBootstrapHash: Sha256HashV1;
  readonly worldRuntimeBootstrapHash: Sha256HashV1;
  readonly registryLockHash: Sha256HashV1;
  readonly initialControlledEntityId: string;
  readonly worldBounds: WorldPackageWorldBoundsV1;
  readonly resourceBudget: WorldPackageResourceBudgetV1;
  readonly lockedResources: readonly WorldResourceLockEntryV1[];
  readonly entryPoint: Readonly<{
    readonly gameplayBootstrapPath: "gameplay/bootstrap.json";
    readonly worldRuntimeBootstrapPath:
      "runtime/world-runtime-bootstrap.json";
  }>;
  readonly legal: WorldPackageLegalV1;
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

export type CanonicalWorldPackageManifestV1 = Omit<
  WorldPackageManifestV1,
  "sceneSource"
> & Readonly<{
  readonly sceneSource: CanonicalWorldPackageSceneSourceV1;
}>;

export type CanonicalWorldPackageBuildReceiptV1 = Omit<
  WorldPackageBuildReceiptV1,
  "manifest"
> & Readonly<{
  readonly manifest: CanonicalWorldPackageManifestV1;
}>;

export type BabylonNativeWorldPackageManifestV1 = Omit<
  WorldPackageManifestV1,
  "sceneSource"
> & Readonly<{
  readonly sceneSource: BabylonNativeWorldPackageSceneSourceV1;
}>;

export type BabylonNativeWorldPackageBuildReceiptV1 = Omit<
  WorldPackageBuildReceiptV1,
  "manifest"
> & Readonly<{
  readonly manifest: BabylonNativeWorldPackageManifestV1;
}>;

export interface CanonicalWorldPackageGameplayBootstrapMembershipInputV1 {
  readonly canonicalSceneExecutionPlan: CanonicalSceneExecutionPlanV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly worldPackageBuildReceipt: WorldPackageBuildReceiptV1;
}

export interface BabylonNativeWorldPackageMembershipInputV1 {
  readonly nativeSceneBootstrap: BabylonNativeSceneBootstrapV1;
  readonly sceneModuleBundleManifest:
    BabylonNativeSceneModuleBundleManifestV1;
  readonly dependencyLock: BabylonNativeDependencyLockV1;
  readonly assetLock: BabylonNativeAssetLockV1;
  readonly sceneAuthoringRouteDecision: SceneAuthoringRouteDecisionV1;
  readonly sceneAuthoringAttempt: SceneAuthoringAttemptV1;
  readonly sceneAuthoringAttemptResult: SceneAuthoringAttemptResultV1;
  readonly nativeSceneCheckResult: NativeSceneCheckResultV1;
  readonly nativeSceneContribution: BabylonNativeSceneContributionV1;
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
