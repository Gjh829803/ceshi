import type { Sha256HashV1 } from "@whitebox-world/protocol";

import type { AuthoringSpecV4, NormalizedWorldIRV4 } from "@whitebox-world/authoring";
import type { GameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import type { LayoutSolveResultV1 } from "@whitebox-world/layout-solver";
import type { ExecutionPlanV5 } from "@whitebox-world/runtime-contracts";

export interface WorldPackageResourceArtifactV1 {
  readonly resourceRef: string;
  readonly packagePath: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly contentHash: Sha256HashV1;
}

export interface WorldPackageFileIntegrityEntryV1 {
  readonly path: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly sha256: Sha256HashV1;
}

export interface WorldPackageManifestV1 {
  readonly kind: "worldkit-world-package-manifest";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly packageFormatVersion: 1;
  readonly worldId: string;
  readonly seed: number;
  readonly runtimeTarget: "babylon-web";
  readonly canonicalizationProfile: "canonical-json-jcs@1";
  readonly hashAlgorithm: "sha256";
  readonly authoringSchemaVersion: 4;
  readonly normalizedWorldIrSchemaVersion: 4;
  readonly executionPlanSchemaVersion: 5;
  readonly authoringSpecHash: Sha256HashV1;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly executionPlanHash: Sha256HashV1;
  readonly resourceLockHash: Sha256HashV1;
  readonly layoutSolveReportHash: Sha256HashV1;
  readonly initialControlledEntityId: string;
  readonly entryPoint: Readonly<{
    readonly executionPlanPath: "targets/babylon-web/execution-plan.json";
  }>;
  readonly resources: readonly WorldPackageResourceArtifactV1[];
}

export interface WorldPackageBuildReceiptV1 {
  readonly kind: "worldkit-world-package-build-receipt";
  readonly schemaVersion: 1;
  readonly manifest: WorldPackageManifestV1;
  readonly manifestHash: Sha256HashV1;
  readonly fileIntegrityEntries: readonly WorldPackageFileIntegrityEntryV1[];
  readonly worldPackageRootHash: Sha256HashV1;
}

export interface WorldPackageBuildClosureV1 {
  readonly authoringSpec: AuthoringSpecV4;
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly layoutSolveResult: LayoutSolveResultV1;
  readonly executionPlan: ExecutionPlanV5;
  readonly gameplayBootstrap: GameplayBootstrapV1;
}

export interface ResolvedWorldPackageResourceArtifactV1 {
  readonly resourceRef: string;
  readonly packagePath: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface CreateWorldPackageBuildReceiptInputV1 {
  readonly packageId: string;
  readonly authoringSpec: AuthoringSpecV4;
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly layoutSolveResult: LayoutSolveResultV1;
  readonly executionPlan: ExecutionPlanV5;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly resourceArtifacts: readonly ResolvedWorldPackageResourceArtifactV1[];
  readonly includeAuthoringSpec?: boolean;
}

export interface WorldPackageGameplayBootstrapMembershipInputV1 {
  readonly executionPlan: ExecutionPlanV5;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldPackageBuildReceipt: WorldPackageBuildReceiptV1;
}
