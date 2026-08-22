import type { AuthoringSpecV4, NormalizedWorldIRV4 } from "@whitebox-world/authoring";
import type { LayoutSolveResultV1 } from "@whitebox-world/layout-solver";
import type { ExecutionPlanV5 } from "@whitebox-world/runtime-contracts";

export type WorldPackageSha256HashV1 = `sha256:${string}`;

export interface WorldPackageResourceArtifactV1 {
  readonly resourceRef: string;
  readonly packagePath: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly contentHash: WorldPackageSha256HashV1;
}

export interface WorldPackageFileIntegrityEntryV1 {
  readonly path: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly sha256: WorldPackageSha256HashV1;
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
  readonly authoringSpecHash: WorldPackageSha256HashV1;
  readonly normalizedWorldIrHash: WorldPackageSha256HashV1;
  readonly executionPlanHash: WorldPackageSha256HashV1;
  readonly resourceLockHash: WorldPackageSha256HashV1;
  readonly layoutSolveReportHash: WorldPackageSha256HashV1;
  readonly controlledEntityId: string;
  readonly entryPoint: Readonly<{
    readonly executionPlanPath: "targets/babylon-web/execution-plan.json";
  }>;
  readonly resources: readonly WorldPackageResourceArtifactV1[];
}

export interface WorldPackageBuildReceiptV1 {
  readonly kind: "worldkit-world-package-build-receipt";
  readonly schemaVersion: 1;
  readonly manifest: WorldPackageManifestV1;
  readonly manifestHash: WorldPackageSha256HashV1;
  readonly fileIntegrityEntries: readonly WorldPackageFileIntegrityEntryV1[];
  readonly worldPackageRootHash: WorldPackageSha256HashV1;
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
  readonly resourceArtifacts: readonly ResolvedWorldPackageResourceArtifactV1[];
  readonly includeAuthoringSpec?: boolean;
}
