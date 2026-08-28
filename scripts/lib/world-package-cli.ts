import { worldPackageRefFromRootHashV1, type WorldPackageRefV1 } from "@whitebox-world/world-identity";

import path from "node:path";

import {
  BABYLON_WEB_WORLD_PACKAGE_HOST_POLICY_V1,
  type VerifiedWorldPackageDirectoryV1,
  type WorldPackageDirectoryV1,
  type WorldPackageHostPolicyV1,
} from "@whitebox-world/world-package";
import type { RuntimeWorldConfigurationV1 } from "@whitebox-world/runtime-host";

import {
  readWorldPackageDirectoryV1,
  writeWorldPackageDirectoryV1,
} from "./file-world-package";
import {
  verifyWorldPackageForHostV1,
  type WorldPackageTrustedPublicKeyV1,
} from "./world-package-signing";
import {
  createTrustedCanonicalWorldPackageV1,
} from "./trusted-world-package";
import {
  loadWorldkitRoutePipeline,
  type WorldkitDiagnostic,
} from "./worldkit-pipeline";

export const WORLDKIT_CLI_PROTOCOL_VERSION_V1 = 1 as const;
export const WORLDKIT_SDK_VERSION_V1 = "0.0.0" as const;
export const WORLDKIT_SPEC_VERSION_V1 = "2026-08-17" as const;

export type WorldPackageCommandNameV1 = "build" | "inspect" | "load";

interface WorldPackageCommandEnvelopeV1 {
  readonly kind: "worldkit-package-command-result";
  readonly schemaVersion: 1;
  readonly protocolVersion: typeof WORLDKIT_CLI_PROTOCOL_VERSION_V1;
  readonly sdkVersion: typeof WORLDKIT_SDK_VERSION_V1;
  readonly specVersion: typeof WORLDKIT_SPEC_VERSION_V1;
  readonly command: WorldPackageCommandNameV1;
}

export interface WorldPackageCommandSummaryV1 {
  readonly packageId: string;
  readonly worldId: string;
  readonly runtimeTarget: "babylon-web";
  readonly packageFormatVersion: 1;
  readonly manifestSchemaVersion: 1;
  readonly worldPackageRef: WorldPackageRefV1;
  readonly worldPackageRootHash: `sha256:${string}`;
  readonly manifestHash: `sha256:${string}`;
  readonly authoringSpecHash: `sha256:${string}`;
  readonly normalizedWorldIrHash: `sha256:${string}`;
  readonly executionPlanHash: `sha256:${string}`;
  readonly registryLockHash: `sha256:${string}`;
  readonly layoutSolveReportHash: `sha256:${string}`;
  readonly distributionPolicy: "internal-only" | "redistributable";
  readonly lockedResourceCount: number;
  readonly resourceCount: number;
  readonly fileCount: number;
  readonly signatureCount: number;
}

export type WorldPackageCommandSuccessV1 =
  WorldPackageCommandEnvelopeV1 &
  WorldPackageCommandSummaryV1 &
  Readonly<{
    readonly ok: true;
    readonly exitCode: 0;
    readonly diagnostics: readonly [];
  }>;

export type WorldPackageCommandFailureV1 =
  WorldPackageCommandEnvelopeV1 &
  Readonly<{
    readonly ok: false;
    readonly exitCode: 1 | 2 | 3 | 4 | 5 | 6;
    readonly diagnostics: readonly WorldkitDiagnostic[];
  }>;

export type WorldPackageCommandResultV1 =
  | WorldPackageCommandSuccessV1
  | WorldPackageCommandFailureV1;

export type LoadRuntimeWorldPackageResultV1 =
  | Readonly<{
      readonly result: WorldPackageCommandSuccessV1;
      readonly verifiedDirectory: VerifiedWorldPackageDirectoryV1;
      readonly runtimeWorldConfiguration: RuntimeWorldConfigurationV1;
    }>
  | Readonly<{
      readonly result: WorldPackageCommandFailureV1;
    }>;

interface WorldPackageHostAdmissionOptionsV1 {
  readonly hostPolicy?: WorldPackageHostPolicyV1;
  readonly trustedPublicKeys?: readonly WorldPackageTrustedPublicKeyV1[];
  readonly maximumTotalBytes?: number;
  readonly maximumFileCount?: number;
}

const MAXIMUM_PACKAGE_TOTAL_BYTES = 512 * 1024 * 1024;
const MAXIMUM_PACKAGE_FILE_COUNT = 4_096;
const EMPTY_DIAGNOSTICS = Object.freeze([]) as readonly [];

function envelope(command: WorldPackageCommandNameV1): WorldPackageCommandEnvelopeV1 {
  return Object.freeze({
    kind: "worldkit-package-command-result",
    schemaVersion: 1,
    protocolVersion: WORLDKIT_CLI_PROTOCOL_VERSION_V1,
    sdkVersion: WORLDKIT_SDK_VERSION_V1,
    specVersion: WORLDKIT_SPEC_VERSION_V1,
    command,
  });
}

function diagnostic(
  code: string,
  message: string,
): WorldkitDiagnostic {
  return Object.freeze({
    severity: "error" as const,
    code,
    instancePath: "",
    message,
  });
}

function failure(
  command: WorldPackageCommandNameV1,
  exitCode: WorldPackageCommandFailureV1["exitCode"],
  code: string,
  message: string,
): WorldPackageCommandFailureV1 {
  return Object.freeze({
    ...envelope(command),
    ok: false,
    exitCode,
    diagnostics: Object.freeze([diagnostic(code, message)]),
  });
}

function summary(
  command: WorldPackageCommandNameV1,
  directory: WorldPackageDirectoryV1,
): WorldPackageCommandSuccessV1 {
  const receipt = directory.receipt;
  const manifest = receipt.manifest;
  return Object.freeze({
    ...envelope(command),
    ok: true,
    exitCode: 0,
    diagnostics: EMPTY_DIAGNOSTICS,
    packageId: manifest.id,
    worldId: manifest.worldId,
    runtimeTarget: manifest.runtimeTarget,
    packageFormatVersion: manifest.packageFormatVersion,
    manifestSchemaVersion: manifest.schemaVersion,
    worldPackageRef: worldPackageRefFromRootHashV1(
      receipt.worldPackageRootHash,
    ),
    worldPackageRootHash: receipt.worldPackageRootHash,
    manifestHash: receipt.manifestHash,
    authoringSpecHash: manifest.authoringSpecHash,
    normalizedWorldIrHash: manifest.normalizedWorldIrHash,
    executionPlanHash: manifest.executionPlanHash,
    registryLockHash: manifest.registryLockHash,
    layoutSolveReportHash: manifest.layoutSolveReportHash,
    distributionPolicy: manifest.legal.distributionPolicy,
    lockedResourceCount: manifest.lockedResources.length,
    resourceCount: manifest.resources.length,
    fileCount: directory.files.length + directory.signatureFiles.length,
    signatureCount: directory.signatureFiles.length,
  });
}

function admissionFailure(
  command: "inspect" | "load",
  error: unknown,
): WorldPackageCommandFailureV1 {
  const message = error instanceof Error ? error.message : "";
  if (
    message.startsWith("WORLD_PACKAGE_HOST_INCOMPATIBLE") ||
    message.startsWith("WORLD_PACKAGE_SIGNATURE_REQUIRED") ||
    message.startsWith("WORLD_PACKAGE_SIGNATURE_UNTRUSTED") ||
    message.startsWith("WORLD_PACKAGE_SIGNATURE_ENVELOPE_INVALID")
  ) {
    const code = message.startsWith("WORLD_PACKAGE_HOST_INCOMPATIBLE")
      ? "WORLD_PACKAGE_HOST_INCOMPATIBLE"
      : "WORLD_PACKAGE_SIGNATURE_UNTRUSTED";
    return failure(
      command,
      6,
      code,
      "The WorldPackage is not admitted by the selected Host policy.",
    );
  }
  return failure(
    command,
    2,
    "WORLD_PACKAGE_INPUT_INVALID",
    "The WorldPackage directory failed trusted verification.",
  );
}

async function readAndAdmitWorldPackageDirectoryV1(
  command: "inspect" | "load",
  input: Readonly<{
    packageDirectoryPath: string;
  }> & WorldPackageHostAdmissionOptionsV1,
): Promise<
  | Readonly<{
      readonly ok: true;
      readonly directory: WorldPackageDirectoryV1;
      readonly verifiedDirectory: VerifiedWorldPackageDirectoryV1;
    }>
  | Readonly<{
      readonly ok: false;
      readonly failure: WorldPackageCommandFailureV1;
    }>
> {
  const packageDirectoryPath = path.resolve(input.packageDirectoryPath);
  try {
    const directory = await readWorldPackageDirectoryV1({
      packageDirectoryPath,
      maximumTotalBytes: input.maximumTotalBytes ?? MAXIMUM_PACKAGE_TOTAL_BYTES,
      maximumFileCount: input.maximumFileCount ?? MAXIMUM_PACKAGE_FILE_COUNT,
    });
    const verifiedDirectory = verifyWorldPackageForHostV1({
      directory,
      hostPolicy: input.hostPolicy ?? BABYLON_WEB_WORLD_PACKAGE_HOST_POLICY_V1,
      trustedPublicKeys: input.trustedPublicKeys ?? [],
    });
    return Object.freeze({ ok: true as const, directory, verifiedDirectory });
  } catch (error) {
    return Object.freeze({
      ok: false as const,
      failure: admissionFailure(command, error),
    });
  }
}

export async function buildWorldPackageDirectoryV1(input: {
  readonly inputPath: string;
  readonly outputDirectoryPath: string;
}): Promise<WorldPackageCommandResultV1> {
  let pipeline: Awaited<ReturnType<typeof loadWorldkitRoutePipeline>>;
  try {
    pipeline = await loadWorldkitRoutePipeline(input.inputPath);
  } catch {
    return failure(
      "build",
      1,
      "WORLD_PACKAGE_BUILD_FAILED",
      "The trusted Authoring pipeline failed unexpectedly.",
    );
  }
  if (!pipeline.ok) {
    return failure(
      "build",
      2,
      "WORLD_PACKAGE_BUILD_INPUT_INVALID",
      "The AuthoringSpec failed trusted Normalize, Layout, or Compile admission.",
    );
  }
  let directory: WorldPackageDirectoryV1;
  try {
    directory = await createTrustedCanonicalWorldPackageV1(pipeline);
    verifyWorldPackageForHostV1({
      directory,
      hostPolicy: BABYLON_WEB_WORLD_PACKAGE_HOST_POLICY_V1,
      trustedPublicKeys: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return failure(
      "build",
      message.startsWith("WORLDKIT_WORLD_PACKAGE_RESOURCE_RESOLVE") ? 3 : 4,
      message.startsWith("WORLDKIT_WORLD_PACKAGE_RESOURCE_RESOLVE")
        ? "WORLD_PACKAGE_RESOURCE_RESOLUTION_FAILED"
        : "WORLD_PACKAGE_BUILD_FAILED",
      message.startsWith("WORLDKIT_WORLD_PACKAGE_RESOURCE_RESOLVE")
        ? "The locked Package resources could not be resolved."
        : "The complete WorldPackage closure could not be built.",
    );
  }
  try {
    await writeWorldPackageDirectoryV1({
      outputDirectoryPath: path.resolve(input.outputDirectoryPath),
      directory,
    });
  } catch {
    return failure(
      "build",
      1,
      "WORLD_PACKAGE_OUTPUT_UNAVAILABLE",
      "The WorldPackage output directory could not be published atomically.",
    );
  }
  return summary("build", directory);
}

export async function inspectWorldPackageDirectoryV1(
  input: Readonly<{
    readonly packageDirectoryPath: string;
  }> & WorldPackageHostAdmissionOptionsV1,
): Promise<WorldPackageCommandResultV1> {
  const admitted = await readAndAdmitWorldPackageDirectoryV1(
    "inspect",
    input,
  );
  if (!admitted.ok) return admitted.failure;
  return summary("inspect", admitted.directory);
}

export async function loadRuntimeWorldConfigurationFromPackageDirectoryV1(
  input: Readonly<{
    readonly packageDirectoryPath: string;
  }> & WorldPackageHostAdmissionOptionsV1,
): Promise<LoadRuntimeWorldPackageResultV1> {
  const admitted = await readAndAdmitWorldPackageDirectoryV1("load", input);
  if (!admitted.ok) {
    return Object.freeze({
      result: admitted.failure,
    });
  }
  const receipt = admitted.verifiedDirectory.receipt;
  const runtimeWorldConfiguration = Object.freeze({
    worldBuildIdentity: receipt.worldBuildIdentity,
    gameplayBootstrap: admitted.verifiedDirectory.gameplayBootstrap,
    worldRuntimeBootstrap: admitted.verifiedDirectory.worldRuntimeBootstrap,
    sceneSource: Object.freeze({
      kind: "canonical-execution-plan" as const,
      executionPlan: admitted.verifiedDirectory.executionPlan,
      executionPlanHash: receipt.manifest.executionPlanHash,
    }),
  }) satisfies RuntimeWorldConfigurationV1;
  return Object.freeze({
    result: summary("load", admitted.directory),
    verifiedDirectory: admitted.verifiedDirectory,
    runtimeWorldConfiguration,
  });
}
