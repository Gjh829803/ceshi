import { randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

import {
  normalizeSubjectDefinitionV2,
  parseCanonicalJson,
  parseSceneBriefV1,
  ResourceLockBuilderV1,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  validatePackageSubjectDefinition,
  type AuthoringDiagnostic,
} from "@whitebox-world/authoring";
import { canonicalJsonBytes } from "@whitebox-world/protocol";
import {
  validateSceneBriefImplementationMapV1,
  type SceneBriefImplementationMapV1,
  type VisualCaptureGroupV1,
  type WhiteboxTriviewManifestV1,
  type WhiteboxTriviewCaptureV1,
  type WorldRuntimeSnapshotV4,
} from "@whitebox-world/runtime-contracts";
import {
  builtInSubjectResourceRegistry,
  type SubjectRegistryResourceV3,
} from "@whitebox-world/subject-registry";
import {
  REGISTRY_RESOURCE_KINDS_V1,
  type RegistryResourceKindV1,
} from "@whitebox-world/authoring-edit";
import { isNil } from "lodash-es";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import {
  parseNativeSceneCheckResultV1,
  parseNativeSceneDiagnosticV1,
  type NativeSceneCheckResultV1,
} from "@whitebox-world/runtime-contracts";

import {
  runChangeApplyV1,
  runChangeCleanupV1,
  runChangeDiffV1,
  runChangeDryRunV1,
  runChangeExplainV1,
  runChangeReceiptV1,
  runChangeValidateV1,
  runRegistrySearchV1,
  runSchemaProjectV1,
  redactAuthoringEditJsonV1,
  type AuthoringEditCliResultV1,
} from "../lib/authoring-edit-cli";
import { explainSubjectFile } from "../lib/subject-explain";
import {
  createRenderEnvironmentDiagnosticsV1,
  inspectRenderEnvironmentV1,
  type BrowserRenderEnvironmentV1,
  type RenderEnvironmentReceiptV1,
} from "../lib/render-environment";
import {
  layoutExplainFile,
  layoutSolveFile,
  layoutValidateFile,
} from "../lib/layout-artifacts";
import {
  cliFailure,
  loadWorldkitRoutePipeline,
  readWorldkitInput,
  type CliDiagnostic,
  type WorldkitDiagnostic,
} from "../lib/worldkit-pipeline";
import { createTrustedCanonicalWorldPackageV1 } from "../lib/trusted-world-package";
import {
  startWorldkitServer,
  type WorldkitServerHandle,
} from "../lib/worldkit-server";
import {
  inspectControlCaptureBundleFileV1,
  inspectSimulationTakeFileV1,
  runSimulationTakeFileV1,
  validateControlCaptureBundleFileV1,
  validateSimulationTakeFileV1,
} from "../lib/simulation-take-cli";
import {
  assertSubjectPresetArtifactLocationV1,
  planSubjectPresetPromotion,
  promoteSubjectPresetTransactionally,
  readSubjectPresetHarnessReceiptFileV1,
  readSubjectPresetPromotionPlanFileV1,
  validateSubjectPresetCandidateFile,
} from "../lib/subject-preset-promotion";
import {
  explainValidationReportFileV1,
  verifyControlCaptureFileV1,
} from "../lib/validation-cli";
import {
  publicRouteValidationRunnerFailureV1,
  verifyRouteFileV1,
} from "../lib/route-validation-cli";
import {
  WORLDKIT_CLI_PROTOCOL_VERSION_V1,
  WORLDKIT_SDK_VERSION_V1,
  WORLDKIT_SPEC_VERSION_V1,
  buildWorldPackageDirectoryV1,
  inspectWorldPackageDirectoryV1,
  loadRuntimeWorldConfigurationFromPackageDirectoryV1,
  type WorldPackageCommandResultV1,
} from "../lib/world-package-cli";
import { runRuntimeSessionNdjsonV1 } from "../lib/runtime-session-ndjson";
import { explainNativeSceneCheckResultV1 } from "../native-scene/explain.js";
import { checkBabylonNativeSceneWorldDirectoryV1 } from
  "../native-scene/native-scene-check.js";

const execFile = promisify(execFileCallback);
const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);

export const HELP = `worldkit - Canonical JSON whitebox world SDK

Usage:
  worldkit validate <file> [--json]
  worldkit build <world.json> --output <package-directory> [--json]
  worldkit inspect <package-directory> [--json]
  worldkit load <package-directory> --headless [--json]
  worldkit run <world.json> [--port <port>] [--refresh-dependencies] [--json]
  worldkit run <package-directory> --interactive --protocol ndjson --headless
    --session-directory <absolute-directory> [--resume]
  worldkit native check <world-directory> --json
  worldkit native explain <world-directory> [--json]
  worldkit native package <attempt-directory> --case <case.json> --output <package-directory> --json
  worldkit capture <file> --output <png> [--snapshot <json>] [--triview-output <directory> --implementation-map <json>] [--port <port>] [--json]
  worldkit registry list --kind <resource-kind> [--json]
  worldkit registry describe --resource-ref <ref> [--json]
  worldkit registry search --lock <registry-lock.json> --kind <resource-kind>
    [--tag <semantic-tag>] [--after-resource-ref <ref>] [--limit <count>] [--json]
  worldkit schema project <world.json> --profile <resource-ref> --output <projection.json> [--json]
  worldkit change validate <change-set.json> [--json]
  worldkit change dry-run <world.json> --change-set <change-set.json>
    --output <candidate-directory> [--json]
  worldkit change diff <world-change-receipt.json> [--json]
  worldkit change explain <world-change-receipt.json>
    [--operation-id <id>] [--diagnostic-code <code>] [--json]
  worldkit change apply <world.json> --change-set <change-set.json>
    --output <new-world.json> --receipt <world-change-receipt.json> --write [--json]
  worldkit change receipt --request-id <id> [--connection-profile <file>] [--json]
  worldkit change cleanup --cleanup-operation-id <id> [--connection-profile <file>] [--json]
  worldkit subject-definition validate <file> [--json]
  worldkit subject explain <world-file> --entity-id <id> [--json]
  worldkit brief validate <scene-brief.md> [--json]
  worldkit layout validate <world-file> [--json]
  worldkit layout solve <world-file> --output <directory> [--json]
  worldkit layout explain <layout-report.json> --entity-id <id> [--json]
  worldkit layout explain <layout-report.json> --constraint-id <id> [--json]
  worldkit take validate <take.json> [--json]
  worldkit take inspect <take.json> [--json]
  worldkit take run <take.json> --world <world.json> --output <directory> --width-pixels <integer> --height-pixels <integer> [--port <port>] [--json]
  worldkit capture validate <bundle-directory> [--json]
  worldkit capture inspect <bundle-directory> [--json]
  worldkit subject-preset validate <candidate.json> [--json]
  worldkit subject-preset plan <candidate.json> --output <plan.json> [--json]
  worldkit subject-preset promote <candidate.json> --plan <plan.json> --harness-receipt <receipt.json> --write [--json]
  worldkit verify capture <bundle-directory> --output <validation-report.json> [--json]
  worldkit verify route <world.json> --profile <validation-profile-ref> --output <validation-report.json> [--json]
  worldkit verify explain <validation-report.json> --gate-id <id> [--json]
`;

export type { CliDiagnostic } from "../lib/worldkit-pipeline";
export {
  createRenderEnvironmentDiagnosticsV1,
  inspectRenderEnvironmentV1,
} from "../lib/render-environment";

export type WorldkitArgs =
  | { command: "help"; json: false }
  | { command: "native-check"; worldDirectoryPath: string; json: true }
  | { command: "native-explain"; worldDirectoryPath: string; json: boolean }
  | {
      command: "native-package";
      attemptDirectoryPath: string;
      casePath: string;
      outputPath: string;
      json: true;
    }
  | { command: "validate"; inputPath: string; json: boolean }
  | { command: "build"; inputPath: string; outputPath: string; json: boolean }
  | { command: "inspect"; packageDirectoryPath: string; json: boolean }
  | { command: "load"; packageDirectoryPath: string; headless: true; json: boolean }
  | {
      command: "run-browser";
      inputPath: string;
      port?: number;
      refreshDependencies?: boolean;
      json: boolean;
    }
  | {
      command: "run-session";
      packageDirectoryPath: string;
      sessionDirectoryPath: string;
      resume: boolean;
      json: false;
    }
  | {
      command: "capture";
      inputPath: string;
      outputPath: string;
      snapshotPath?: string;
      triviewOutputPath?: string;
      implementationMapPath?: string;
      port?: number;
      json: boolean;
    }
  | {
      command: "registry-list";
      resourceKind: SubjectRegistryResourceV3["kind"];
      json: boolean;
    }
  | { command: "registry-describe"; resourceRef: string; json: boolean }
  | {
      command: "subject-definition-validate";
      inputPath: string;
      json: boolean;
    }
  | {
      command: "subject-explain";
      inputPath: string;
      entityId: string;
      json: boolean;
    }
  | { command: "brief-validate"; inputPath: string; json: boolean }
  | { command: "layout-validate"; inputPath: string; json: boolean }
  | { command: "take-validate"; inputPath: string; json: boolean }
  | { command: "take-inspect"; inputPath: string; json: boolean }
  | {
      command: "take-run";
      inputPath: string;
      worldPath: string;
      outputPath: string;
      widthPixels: number;
      heightPixels: number;
      port?: number;
      json: boolean;
    }
  | { command: "capture-validate"; inputPath: string; json: boolean }
  | { command: "capture-inspect"; inputPath: string; json: boolean }
  | {
      command: "subject-preset-validate";
      inputPath: string;
      json: boolean;
    }
  | {
      command: "subject-preset-plan";
      inputPath: string;
      outputPath: string;
      json: boolean;
    }
  | {
      command: "subject-preset-promote";
      inputPath: string;
      planPath: string;
      harnessReceiptPath: string;
      write: true;
      json: boolean;
    }
  | {
      command: "verify-capture";
      inputPath: string;
      outputPath: string;
      json: boolean;
    }
  | {
      command: "verify-route";
      inputPath: string;
      validationProfileRef: string;
      outputPath: string;
      json: boolean;
    }
  | {
      command: "verify-explain";
      inputPath: string;
      gateId: string;
      json: boolean;
    }
  | {
      command: "layout-solve";
      inputPath: string;
      outputPath: string;
      json: boolean;
    }
  | ({ command: "layout-explain"; inputPath: string; json: boolean } &
      (
        | { entityId: string; constraintId?: never }
        | { constraintId: string; entityId?: never }
      ))
  | {
      command: "schema-project";
      inputPath: string;
      profileRef: string;
      outputPath: string;
      json: boolean;
    }
  | {
      command: "registry-search";
      lockPath: string;
      resourceKind: RegistryResourceKindV1;
      semanticTags: readonly string[];
      afterResourceRef?: string;
      limit?: number;
      json: boolean;
    }
  | { command: "change-validate"; inputPath: string; json: boolean }
  | {
      command: "change-dry-run";
      inputPath: string;
      changeSetPath: string;
      outputPath: string;
      json: boolean;
    }
  | { command: "change-diff"; inputPath: string; json: boolean }
  | {
      command: "change-explain";
      inputPath: string;
      operationId?: string;
      diagnosticCode?: string;
      json: boolean;
    }
  | {
      command: "change-apply";
      inputPath: string;
      changeSetPath: string;
      outputPath: string;
      receiptPath: string;
      write: true;
      json: boolean;
    }
  | {
      command: "change-receipt";
      requestId: string;
      connectionProfilePath?: string;
      json: boolean;
    }
  | {
      command: "change-cleanup";
      cleanupOperationId: string;
      connectionProfilePath?: string;
      json: boolean;
    };

export interface WorldkitCommandResult {
  ok: boolean;
  exitCode: number;
  diagnostics: readonly WorldkitDiagnostic[];
  normalizedWorldIrHash?: string;
  worldBuildIdentityHash?: string;
  executionPlanHash?: string;
  sceneBriefHash?: string;
  movementMode?: string;
  movementModeLabel?: string;
  visualTargetCount?: number;
  validationReportHash?: string;
  validationStatus?: string;
  outputPath?: string;
  evidenceDirectory?: string;
  snapshotPath?: string;
  triviewOutputPath?: string;
  url?: string;
  renderEnvironment?: RenderEnvironmentReceiptV1;
}

interface PackageNativeBlockAttemptInputV1 {
  readonly repositoryRoot: string;
  readonly attemptDirectoryPath: string;
  readonly casePath: string;
  readonly outputDirectoryPath: string;
}

interface PackagedNativeBlockAttemptCliSourceV1 {
  readonly sceneAuthoringAttemptResult: unknown;
  readonly verifiedWorldPackage: Readonly<{
    receipt: Readonly<{
      worldPackageRef: string;
      worldPackageRootHash: string;
      worldBuildIdentityHash: string;
    }>;
  }>;
  readonly buildReceiptHash: string;
  readonly outputDirectoryPath: string;
  readonly diagnostics: readonly unknown[];
}

type PackageNativeBlockAttemptPortV1 = (
  input: PackageNativeBlockAttemptInputV1,
) => Promise<PackagedNativeBlockAttemptCliSourceV1>;

export interface WorldkitMainPortsV1 {
  readonly packageNativeBlockAttemptV1?: PackageNativeBlockAttemptPortV1;
}

async function loadPackageNativeBlockAttemptPortV1(): Promise<
  PackageNativeBlockAttemptPortV1
> {
  const moduleSpecifier = new URL(
    "../reconstruction/native-package.js",
    import.meta.url,
  ).href;
  const loaded = await import(moduleSpecifier) as Readonly<{
    packageNativeBlockAttemptV1?: unknown;
  }>;
  if (typeof loaded.packageNativeBlockAttemptV1 !== "function") {
    throw new TypeError("WORLDKIT_NATIVE_PACKAGE_ADAPTER_UNAVAILABLE");
  }
  return loaded.packageNativeBlockAttemptV1 as PackageNativeBlockAttemptPortV1;
}

async function runNativePackageCommandV1(
  parsed: Extract<WorldkitArgs, { command: "native-package" }>,
  packageNativeBlockAttemptV1?: PackageNativeBlockAttemptPortV1,
): Promise<Readonly<Record<string, unknown>>> {
  const packageAttempt = packageNativeBlockAttemptV1 ??
    await loadPackageNativeBlockAttemptPortV1();
  const packaged = await packageAttempt({
    repositoryRoot: REPOSITORY_ROOT,
    attemptDirectoryPath: parsed.attemptDirectoryPath,
    casePath: parsed.casePath,
    outputDirectoryPath: parsed.outputPath,
  });
  return Object.freeze({
    outcome: "completed",
    sceneAuthoringAttemptResult: packaged.sceneAuthoringAttemptResult,
    worldPackageRef: packaged.verifiedWorldPackage.receipt.worldPackageRef,
    worldPackageRootHash:
      packaged.verifiedWorldPackage.receipt.worldPackageRootHash,
    worldBuildIdentityHash:
      packaged.verifiedWorldPackage.receipt.worldBuildIdentityHash,
    buildReceiptHash: packaged.buildReceiptHash,
    outputDirectoryPath: packaged.outputDirectoryPath,
    diagnostics: packaged.diagnostics,
  });
}

function nativePackageFailureV1(error: unknown): Readonly<{
  exitCode: 1 | 2;
  result: Readonly<Record<string, unknown>>;
}> {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "diagnostics" in error &&
    Array.isArray(error.diagnostics)
  ) {
    return Object.freeze({
      exitCode: 1,
      result: Object.freeze({
        outcome: "failed",
        code: error.code,
        diagnostics: error.diagnostics,
      }),
    });
  }
  return Object.freeze({
    exitCode: 2,
    result: Object.freeze({
      outcome: "tool-error",
      code: "WORLDKIT_NATIVE_PACKAGE_TOOL_ERROR",
      diagnostics: Object.freeze([]),
    }),
  });
}

export class WorldkitUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorldkitUsageError";
  }
}

function parsePort(value: string | undefined): number {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new WorldkitUsageError(
      "--port must be an integer from 1 through 65535.",
    );
  }
  return port;
}

function parsePositiveIntegerOption(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new WorldkitUsageError(`${option} must be a positive safe integer.`);
  }
  return parsed;
}

function takeOption(tokens: string[], option: string): string | undefined {
  const index = tokens.indexOf(option);
  if (index === -1) return undefined;
  if (tokens.lastIndexOf(option) !== index) {
    throw new WorldkitUsageError(`${option} may be provided only once.`);
  }
  const value = tokens[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new WorldkitUsageError(`${option} requires a value.`);
  }
  tokens.splice(index, 2);
  return value;
}

function takeAllOptions(tokens: string[], option: string): string[] {
  const values: string[] = [];
  let index = tokens.indexOf(option);
  while (index !== -1) {
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new WorldkitUsageError(`${option} requires a value.`);
    }
    values.push(value);
    tokens.splice(index, 2);
    index = tokens.indexOf(option);
  }
  return values;
}

function isRegistryResourceKind(value: string): value is RegistryResourceKindV1 {
  return (REGISTRY_RESOURCE_KINDS_V1 as readonly string[]).includes(value);
}

function takeRequiredPositional(tokens: string[], label: string): string {
  const value = tokens.shift();
  if (value === undefined || value.startsWith("--")) {
    throw new WorldkitUsageError(`${label} is required.`);
  }
  return value;
}

function takeFlag(tokens: string[], option: string): boolean {
  const index = tokens.indexOf(option);
  if (index === -1) return false;
  if (tokens.lastIndexOf(option) !== index) {
    throw new WorldkitUsageError(`${option} may be provided only once.`);
  }
  tokens.splice(index, 1);
  return true;
}

function takeJsonFlag(tokens: string[]): boolean {
  return takeFlag(tokens, "--json");
}

function rejectRemaining(tokens: string[], command: string): void {
  if (tokens.length > 0) {
    throw new WorldkitUsageError(`Unknown ${command} option '${tokens[0]}'.`);
  }
}

export function parseWorldkitArgs(arguments_: readonly string[]): WorldkitArgs {
  const tokens = [...arguments_];
  if (
    tokens.length === 0 ||
    tokens[0] === "--help" ||
    tokens[0] === "-h" ||
    tokens[0] === "help"
  ) {
    if (tokens.length > 1) {
      throw new WorldkitUsageError("Help does not accept positional arguments.");
    }
    return { command: "help", json: false };
  }

  const command = tokens.shift();
  const json = takeJsonFlag(tokens);

  if (command === "native") {
    const operation = takeRequiredPositional(tokens, "native operation");
    if (operation === "package") {
      const attemptDirectoryPath = takeRequiredPositional(
        tokens,
        "Native attempt directory",
      );
      const casePath = takeOption(tokens, "--case");
      const outputPath = takeOption(tokens, "--output");
      if (casePath === undefined) {
        throw new WorldkitUsageError(
          "native package requires --case <case.json>.",
        );
      }
      if (outputPath === undefined) {
        throw new WorldkitUsageError(
          "native package requires --output <package-directory>.",
        );
      }
      if (!json) {
        throw new WorldkitUsageError("native package requires --json.");
      }
      const relativeOutputPath = path.relative(
        path.resolve(attemptDirectoryPath),
        path.resolve(outputPath),
      );
      if (
        relativeOutputPath === "" ||
        (
          relativeOutputPath !== ".." &&
          !relativeOutputPath.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(relativeOutputPath)
        )
      ) {
        throw new WorldkitUsageError(
          "native package output must be outside the immutable attempt directory.",
        );
      }
      rejectRemaining(tokens, "native package");
      return {
        command: "native-package",
        attemptDirectoryPath,
        casePath,
        outputPath,
        json: true,
      };
    }
    const worldDirectoryPath = takeRequiredPositional(
      tokens,
      "Native world directory",
    );
    if (operation === "check") {
      if (!json) {
        throw new WorldkitUsageError("native check requires --json.");
      }
      rejectRemaining(tokens, "native check");
      return { command: "native-check", worldDirectoryPath, json: true };
    }
    if (operation === "explain") {
      rejectRemaining(tokens, "native explain");
      return { command: "native-explain", worldDirectoryPath, json };
    }
    throw new WorldkitUsageError(`Unknown native operation '${operation}'.`);
  }

  if (command === "subject-preset") {
    const operation = takeRequiredPositional(tokens, "subject-preset operation");
    const inputPath = takeRequiredPositional(tokens, "Subject Preset candidate file");
    if (operation === "validate") {
      rejectRemaining(tokens, "subject-preset validate");
      return {
        command: "subject-preset-validate",
        inputPath,
        json,
      };
    }
    if (operation === "plan") {
      const outputPath = takeOption(tokens, "--output");
      if (outputPath === undefined) {
        throw new WorldkitUsageError(
          "subject-preset plan requires --output <plan.json>.",
        );
      }
      rejectRemaining(tokens, "subject-preset plan");
      return {
        command: "subject-preset-plan",
        inputPath,
        outputPath,
        json,
      };
    }
    if (operation === "promote") {
      const planPath = takeOption(tokens, "--plan");
      const harnessReceiptPath = takeOption(tokens, "--harness-receipt");
      const write = takeFlag(tokens, "--write");
      if (planPath === undefined) {
        throw new WorldkitUsageError(
          "subject-preset promote requires --plan <plan.json>.",
        );
      }
      if (isNil(harnessReceiptPath)) {
        throw new WorldkitUsageError(
          "subject-preset promote requires --harness-receipt <receipt.json>.",
        );
      }
      if (!write) {
        throw new WorldkitUsageError(
          "subject-preset promote requires explicit --write.",
        );
      }
      rejectRemaining(tokens, "subject-preset promote");
      return {
        command: "subject-preset-promote",
        inputPath,
        planPath,
        harnessReceiptPath,
        write: true,
        json,
      };
    }
    throw new WorldkitUsageError(
      `Unknown subject-preset operation '${operation}'.`,
    );
  }

  if (command === "verify") {
    const operation = takeRequiredPositional(tokens, "verify operation");
    const inputPath = takeRequiredPositional(tokens, "Validation input");
    if (operation === "route") {
      const validationProfileRef = takeOption(tokens, "--profile");
      const outputPath = takeOption(tokens, "--output");
      if (validationProfileRef === undefined) {
        throw new WorldkitUsageError(
          "verify route requires --profile <validation-profile-ref>.",
        );
      }
      if (outputPath === undefined) {
        throw new WorldkitUsageError(
          "verify route requires --output <validation-report.json>.",
        );
      }
      rejectRemaining(tokens, "verify route");
      return {
        command: "verify-route",
        inputPath,
        validationProfileRef,
        outputPath,
        json,
      };
    }
    if (operation === "capture") {
      const outputPath = takeOption(tokens, "--output");
      if (outputPath === undefined) {
        throw new WorldkitUsageError(
          "verify capture requires --output <validation-report.json>.",
        );
      }
      rejectRemaining(tokens, "verify capture");
      return {
        command: "verify-capture",
        inputPath,
        outputPath,
        json,
      };
    }
    if (operation === "explain") {
      const gateId = takeOption(tokens, "--gate-id");
      if (gateId === undefined) {
        throw new WorldkitUsageError(
          "verify explain requires --gate-id <id>.",
        );
      }
      rejectRemaining(tokens, "verify explain");
      return { command: "verify-explain", inputPath, gateId, json };
    }
    throw new WorldkitUsageError(`Unknown verify operation '${operation}'.`);
  }

  if (command === "take") {
    const operation = takeRequiredPositional(tokens, "take operation");
    const inputPath = takeRequiredPositional(tokens, "Simulation Take input file");
    if (operation === "validate" || operation === "inspect") {
      rejectRemaining(tokens, `take ${operation}`);
      return {
        command: operation === "validate" ? "take-validate" : "take-inspect",
        inputPath,
        json,
      };
    }
    if (operation === "run") {
      const worldPath = takeOption(tokens, "--world");
      const outputPath = takeOption(tokens, "--output");
      const widthValue = takeOption(tokens, "--width-pixels");
      const heightValue = takeOption(tokens, "--height-pixels");
      const portValue = takeOption(tokens, "--port");
      if (worldPath === undefined) {
        throw new WorldkitUsageError("take run requires --world <world.json>.");
      }
      if (outputPath === undefined) {
        throw new WorldkitUsageError("take run requires --output <directory>.");
      }
      if (widthValue === undefined) {
        throw new WorldkitUsageError("take run requires --width-pixels <integer>.");
      }
      if (heightValue === undefined) {
        throw new WorldkitUsageError("take run requires --height-pixels <integer>.");
      }
      rejectRemaining(tokens, "take run");
      return {
        command: "take-run",
        inputPath,
        worldPath,
        outputPath,
        widthPixels: parsePositiveIntegerOption(widthValue, "--width-pixels"),
        heightPixels: parsePositiveIntegerOption(heightValue, "--height-pixels"),
        ...(portValue === undefined ? {} : { port: parsePort(portValue) }),
        json,
      };
    }
    throw new WorldkitUsageError(`Unknown take operation '${operation}'.`);
  }

  if (command === "capture" && (tokens[0] === "validate" || tokens[0] === "inspect")) {
    const operation = takeRequiredPositional(tokens, "capture operation");
    const inputPath = takeRequiredPositional(tokens, "Control Capture Bundle directory");
    rejectRemaining(tokens, `capture ${operation}`);
    return {
      command: operation === "validate" ? "capture-validate" : "capture-inspect",
      inputPath,
      json,
    };
  }

  if (command === "registry") {
    const operation = takeRequiredPositional(tokens, "registry operation");
    if (operation === "list") {
      const resourceKind = takeOption(tokens, "--kind");
      if (
        resourceKind === undefined ||
        !builtInSubjectResourceRegistry.listDiscoverableResources().some(
          (resource) => resource.kind === resourceKind,
        )
      ) {
        throw new WorldkitUsageError(
          "registry list requires --kind <discoverable-resource-kind>.",
        );
      }
      rejectRemaining(tokens, "registry list");
      return {
        command: "registry-list",
        resourceKind: resourceKind as SubjectRegistryResourceV3["kind"],
        json,
      };
    }
    if (operation === "describe") {
      const resourceRef = takeOption(tokens, "--resource-ref");
      if (resourceRef === undefined) {
        throw new WorldkitUsageError(
          "registry describe requires --resource-ref <ref>.",
        );
      }
      rejectRemaining(tokens, "registry describe");
      return { command: "registry-describe", resourceRef, json };
    }
    if (operation === "search") {
      const lockPath = takeOption(tokens, "--lock");
      const resourceKind = takeOption(tokens, "--kind");
      const semanticTags = takeAllOptions(tokens, "--tag");
      const afterResourceRef = takeOption(tokens, "--after-resource-ref");
      const limitValue = takeOption(tokens, "--limit");
      if (lockPath === undefined) {
        throw new WorldkitUsageError(
          "registry search requires --lock <registry-lock.json>.",
        );
      }
      if (resourceKind === undefined || !isRegistryResourceKind(resourceKind)) {
        throw new WorldkitUsageError(
          "registry search requires --kind <resource-kind>.",
        );
      }
      rejectRemaining(tokens, "registry search");
      return {
        command: "registry-search",
        lockPath,
        resourceKind,
        semanticTags,
        ...(afterResourceRef === undefined ? {} : { afterResourceRef }),
        ...(limitValue === undefined
          ? {}
          : { limit: parsePositiveIntegerOption(limitValue, "--limit") }),
        json,
      };
    }
    throw new WorldkitUsageError(`Unknown registry operation '${operation}'.`);
  }

  if (command === "subject-definition") {
    const operation = takeRequiredPositional(
      tokens,
      "subject-definition operation",
    );
    if (operation !== "validate") {
      throw new WorldkitUsageError(
        `Unknown subject-definition operation '${operation}'.`,
      );
    }
    const inputPath = takeRequiredPositional(tokens, "Definition input file");
    rejectRemaining(tokens, "subject-definition validate");
    return { command: "subject-definition-validate", inputPath, json };
  }

  if (command === "subject") {
    const operation = takeRequiredPositional(tokens, "subject operation");
    if (operation !== "explain") {
      throw new WorldkitUsageError(`Unknown subject operation '${operation}'.`);
    }
    const inputPath = takeRequiredPositional(tokens, "World input file");
    const entityId = takeOption(tokens, "--entity-id");
    if (entityId === undefined) {
      throw new WorldkitUsageError("subject explain requires --entity-id <id>.");
    }
    rejectRemaining(tokens, "subject explain");
    return { command: "subject-explain", inputPath, entityId, json };
  }

  if (command === "brief") {
    const operation = takeRequiredPositional(tokens, "brief operation");
    if (operation !== "validate") {
      throw new WorldkitUsageError(`Unknown brief operation '${operation}'.`);
    }
    const inputPath = takeRequiredPositional(tokens, "Scene Brief input file");
    rejectRemaining(tokens, "brief validate");
    return { command: "brief-validate", inputPath, json };
  }

  if (command === "layout") {
    const operation = takeRequiredPositional(tokens, "layout operation");
    const inputPath = takeRequiredPositional(tokens, "Layout input file");
    if (operation === "validate") {
      rejectRemaining(tokens, "layout validate");
      return { command: "layout-validate", inputPath, json };
    }
    if (operation === "solve") {
      const outputPath = takeOption(tokens, "--output");
      if (outputPath === undefined) {
        throw new WorldkitUsageError(
          "layout solve requires --output <directory>.",
        );
      }
      rejectRemaining(tokens, "layout solve");
      return { command: "layout-solve", inputPath, outputPath, json };
    }
    if (operation === "explain") {
      const entityId = takeOption(tokens, "--entity-id");
      const constraintId = takeOption(tokens, "--constraint-id");
      if ((entityId === undefined) === (constraintId === undefined)) {
        throw new WorldkitUsageError(
          "layout explain requires exactly one of --entity-id or --constraint-id.",
        );
      }
      rejectRemaining(tokens, "layout explain");
      return entityId === undefined
        ? { command: "layout-explain", inputPath, constraintId: constraintId!, json }
        : { command: "layout-explain", inputPath, entityId, json };
    }
    throw new WorldkitUsageError(`Unknown layout operation '${operation}'.`);
  }

  if (command === "schema") {
    const operation = takeRequiredPositional(tokens, "schema operation");
    if (operation !== "project") {
      throw new WorldkitUsageError(`Unknown schema operation '${operation}'.`);
    }
    const inputPath = takeRequiredPositional(tokens, "world.json");
    const profileRef = takeOption(tokens, "--profile");
    const outputPath = takeOption(tokens, "--output");
    if (profileRef === undefined) {
      throw new WorldkitUsageError(
        "schema project requires --profile <resource-ref>.",
      );
    }
    if (outputPath === undefined) {
      throw new WorldkitUsageError(
        "schema project requires --output <projection.json>.",
      );
    }
    rejectRemaining(tokens, "schema project");
    return { command: "schema-project", inputPath, profileRef, outputPath, json };
  }

  if (command === "change") {
    const operation = takeRequiredPositional(tokens, "change operation");
    if (operation === "validate") {
      const inputPath = takeRequiredPositional(tokens, "change-set.json");
      rejectRemaining(tokens, "change validate");
      return { command: "change-validate", inputPath, json };
    }
    if (operation === "dry-run") {
      const inputPath = takeRequiredPositional(tokens, "world.json");
      const changeSetPath = takeOption(tokens, "--change-set");
      const outputPath = takeOption(tokens, "--output");
      if (changeSetPath === undefined) {
        throw new WorldkitUsageError(
          "change dry-run requires --change-set <change-set.json>.",
        );
      }
      if (outputPath === undefined) {
        throw new WorldkitUsageError(
          "change dry-run requires --output <candidate-directory>.",
        );
      }
      rejectRemaining(tokens, "change dry-run");
      return {
        command: "change-dry-run",
        inputPath,
        changeSetPath,
        outputPath,
        json,
      };
    }
    if (operation === "diff") {
      const inputPath = takeRequiredPositional(tokens, "world-change-receipt.json");
      rejectRemaining(tokens, "change diff");
      return { command: "change-diff", inputPath, json };
    }
    if (operation === "explain") {
      const inputPath = takeRequiredPositional(tokens, "world-change-receipt.json");
      const operationId = takeOption(tokens, "--operation-id");
      const diagnosticCode = takeOption(tokens, "--diagnostic-code");
      if (operationId !== undefined && diagnosticCode !== undefined) {
        throw new WorldkitUsageError(
          "change explain accepts only one of --operation-id or --diagnostic-code.",
        );
      }
      rejectRemaining(tokens, "change explain");
      return {
        command: "change-explain",
        inputPath,
        ...(operationId === undefined ? {} : { operationId }),
        ...(diagnosticCode === undefined ? {} : { diagnosticCode }),
        json,
      };
    }
    if (operation === "apply") {
      const inputPath = takeRequiredPositional(tokens, "world.json");
      const changeSetPath = takeOption(tokens, "--change-set");
      const outputPath = takeOption(tokens, "--output");
      const receiptPath = takeOption(tokens, "--receipt");
      const write = takeFlag(tokens, "--write");
      if (changeSetPath === undefined) {
        throw new WorldkitUsageError(
          "change apply requires --change-set <change-set.json>.",
        );
      }
      if (outputPath === undefined) {
        throw new WorldkitUsageError(
          "change apply requires --output <new-world.json>.",
        );
      }
      if (receiptPath === undefined) {
        throw new WorldkitUsageError(
          "change apply requires --receipt <world-change-receipt.json>.",
        );
      }
      if (!write) {
        throw new WorldkitUsageError(
          "change apply requires explicit --write.",
        );
      }
      rejectRemaining(tokens, "change apply");
      return {
        command: "change-apply",
        inputPath,
        changeSetPath,
        outputPath,
        receiptPath,
        write: true,
        json,
      };
    }
    if (operation === "receipt") {
      const requestId = takeOption(tokens, "--request-id");
      const connectionProfilePath = takeOption(tokens, "--connection-profile");
      if (requestId === undefined) {
        throw new WorldkitUsageError(
          "change receipt requires --request-id <id>.",
        );
      }
      rejectRemaining(tokens, "change receipt");
      return {
        command: "change-receipt",
        requestId,
        ...(connectionProfilePath === undefined ? {} : { connectionProfilePath }),
        json,
      };
    }
    if (operation === "cleanup") {
      const cleanupOperationId = takeOption(tokens, "--cleanup-operation-id");
      const connectionProfilePath = takeOption(tokens, "--connection-profile");
      if (cleanupOperationId === undefined) {
        throw new WorldkitUsageError(
          "change cleanup requires --cleanup-operation-id <id>.",
        );
      }
      rejectRemaining(tokens, "change cleanup");
      return {
        command: "change-cleanup",
        cleanupOperationId,
        ...(connectionProfilePath === undefined ? {} : { connectionProfilePath }),
        json,
      };
    }
    throw new WorldkitUsageError(`Unknown change operation '${operation}'.`);
  }

  const inputPath = takeRequiredPositional(tokens, `${command ?? "command"} input file`);
  if (command === "validate") {
    rejectRemaining(tokens, "validate");
    return { command, inputPath, json };
  }
  if (command === "build") {
    const outputPath = takeOption(tokens, "--output");
    if (outputPath === undefined) {
      throw new WorldkitUsageError("build requires --output <package-directory>.");
    }
    rejectRemaining(tokens, "build");
    return { command, inputPath, outputPath, json };
  }
  if (command === "inspect") {
    rejectRemaining(tokens, "inspect");
    return { command, packageDirectoryPath: inputPath, json };
  }
  if (command === "load") {
    const headless = takeFlag(tokens, "--headless");
    if (!headless) {
      throw new WorldkitUsageError("load requires --headless.");
    }
    rejectRemaining(tokens, "load");
    return { command, packageDirectoryPath: inputPath, headless: true, json };
  }
  if (command === "run") {
    const portValue = takeOption(tokens, "--port");
    const refreshDependencies = takeFlag(tokens, "--refresh-dependencies");
    const interactive = takeFlag(tokens, "--interactive");
    const protocol = takeOption(tokens, "--protocol");
    const headless = takeFlag(tokens, "--headless");
    const sessionDirectoryPath = takeOption(tokens, "--session-directory");
    const resume = takeFlag(tokens, "--resume");
    rejectRemaining(tokens, "run");
    const requestsRuntimeSession = interactive || !isNil(protocol) || headless ||
      !isNil(sessionDirectoryPath) || resume;
    if (requestsRuntimeSession) {
      if (
        !interactive ||
        protocol !== "ndjson" ||
        !headless ||
        isNil(sessionDirectoryPath)
      ) {
        throw new WorldkitUsageError(
          "run --interactive requires --protocol ndjson --headless and --session-directory <absolute-directory>.",
        );
      }
      if (!path.isAbsolute(sessionDirectoryPath)) {
        throw new WorldkitUsageError(
          "--session-directory must be an absolute directory.",
        );
      }
      if (!isNil(portValue) || refreshDependencies || json) {
        throw new WorldkitUsageError(
          "Interactive NDJSON Runtime Sessions do not accept Browser flags or --json.",
        );
      }
      return {
        command: "run-session",
        packageDirectoryPath: inputPath,
        sessionDirectoryPath,
        resume,
        json: false,
      };
    }
    return {
      command: "run-browser",
      inputPath,
      ...(portValue === undefined ? {} : { port: parsePort(portValue) }),
      ...(refreshDependencies ? { refreshDependencies: true } : {}),
      json,
    };
  }
  if (command === "capture") {
    const outputPath = takeOption(tokens, "--output");
    const snapshotPath = takeOption(tokens, "--snapshot");
    const triviewOutputPath = takeOption(tokens, "--triview-output");
    const implementationMapPath = takeOption(tokens, "--implementation-map");
    const portValue = takeOption(tokens, "--port");
    if (outputPath === undefined) {
      throw new WorldkitUsageError("capture requires --output <png>.");
    }
    if ((triviewOutputPath === undefined) !== (implementationMapPath === undefined)) {
      throw new WorldkitUsageError(
        "capture requires --triview-output and --implementation-map together.",
      );
    }
    rejectRemaining(tokens, "capture");
    return {
      command,
      inputPath,
      outputPath,
      ...(snapshotPath === undefined ? {} : { snapshotPath }),
      ...(triviewOutputPath === undefined ? {} : { triviewOutputPath }),
      ...(implementationMapPath === undefined ? {} : { implementationMapPath }),
      ...(portValue === undefined ? {} : { port: parsePort(portValue) }),
      json,
    };
  }
  throw new WorldkitUsageError(`Unknown command '${command}'.`);
}

export function listRegistryResources(
  resourceKind: SubjectRegistryResourceV3["kind"],
) {
  const resources = builtInSubjectResourceRegistry
    .listDiscoverableResources({ kind: resourceKind })
    .map((resource) => structuredClone(resource));
  return {
    ok: true as const,
    exitCode: 0 as const,
    kind: "worldkit-registry-list" as const,
    schemaVersion: 1 as const,
    resourceKind,
    diagnostics: [] as const,
    resources,
  };
}

function missingRegistryResourceDiagnostic(resourceRef: string): CliDiagnostic {
  const isSubjectDefinition = resourceRef.startsWith(
    "worldkit://subject-definition/",
  );
  const requestedKind = /^worldkit:\/\/([^/]+)\//.exec(resourceRef)?.[1];
  const discoverableKind = builtInSubjectResourceRegistry
    .listDiscoverableResources()
    .find((resource) => resource.kind === requestedKind)?.kind;
  return {
    severity: "error",
    code: isSubjectDefinition
      ? "SUBJECT_DEFINITION_NOT_FOUND"
      : "REGISTRY_RESOURCE_NOT_FOUND",
    instancePath: "/resourceRef",
    message: `Registry resource '${resourceRef}' does not exist at the exact requested version.`,
    details: {
      resourceRef,
      availableResourceRefs: builtInSubjectResourceRegistry
        .listDiscoverableResources(
          discoverableKind === undefined ? {} : { kind: discoverableKind },
        )
        .map((resource) => resource.resourceRef),
      discoveryCommand: discoverableKind === undefined
        ? "worldkit registry describe --resource-ref <ref> --json"
        : `worldkit registry list --kind ${discoverableKind} --json`,
    },
  };
}

export function describeRegistryResource(resourceRef: string) {
  const resource = builtInSubjectResourceRegistry.resolveResource(resourceRef);
  if (resource === undefined) {
    return {
      ok: false as const,
      exitCode: 2 as const,
      diagnostics: [missingRegistryResourceDiagnostic(resourceRef)],
    };
  }
  return {
    ok: true as const,
    exitCode: 0 as const,
    kind: "worldkit-registry-description" as const,
    schemaVersion: 1 as const,
    diagnostics: [] as const,
    resource: structuredClone(resource) as SubjectRegistryResourceV3,
  };
}

export async function validateSubjectDefinitionFile(inputPath: string) {
  const input = await readWorldkitInput(inputPath);
  if (!input.ok) return input;

  const parsed = parseCanonicalJson(input.sourceText);
  if (!parsed.ok) return { ok: false as const, exitCode: 2 as const, diagnostics: parsed.diagnostics };
  const validated = validatePackageSubjectDefinition(parsed.value);
  if (!validated.ok || validated.value === undefined) {
    return { ok: false as const, exitCode: 2 as const, diagnostics: validated.diagnostics };
  }

  const diagnostics: AuthoringDiagnostic[] = [];
  const resourceLockBuilder = new ResourceLockBuilderV1();
  const subjectDefinitionRef = `package://subject-definition/${validated.value.id}@${validated.value.version}`;
  const normalized = normalizeSubjectDefinitionV2({
    definition: validated.value,
    subjectDefinitionRef,
    source: "package",
    instancePath: "",
    subjectResourceRegistry: builtInSubjectResourceRegistry,
    resourceLockBuilder,
    diagnostics,
  });
  const { resourceLock, resourceLockHash } = resourceLockBuilder.finish();
  if (
    normalized === undefined ||
    diagnostics.some((diagnostic) => diagnostic.severity === "error")
  ) {
    return { ok: false as const, exitCode: 2 as const, diagnostics };
  }

  return {
    ok: true as const,
    exitCode: 0 as const,
    kind: "worldkit-subject-definition-validation" as const,
    schemaVersion: 1 as const,
    diagnostics: [] as const,
    subjectDefinition: {
      subjectDefinitionRef,
      subjectDefinitionHash: normalized.subjectDefinitionHash,
      collider: {
        ...(normalized.colliderPolicy.kind === "derive"
          ? {
              colliderDerivationProfileRef:
                normalized.colliderPolicy.colliderDerivationProfileRef,
            }
          : { colliderProfileRef: normalized.colliderPolicy.colliderProfileRef }),
        ...normalized.collider,
      },
      resourceCost: normalized.resourceCost,
      resourceLockHash,
      resourceLockEntries: resourceLock,
    },
  };
}

export async function validateFile(
  inputPath: string,
): Promise<WorldkitCommandResult> {
  const pipeline = await loadWorldkitRoutePipeline(inputPath);
  if (!pipeline.ok) return pipeline;
  let worldBuildIdentityHash: `sha256:${string}`;
  try {
    const directory = await createTrustedCanonicalWorldPackageV1(pipeline);
    worldBuildIdentityHash = directory.receipt.worldBuildIdentityHash;
  } catch (error) {
    return cliFailure(
      "WORLD_BUILD_IDENTITY_UNAVAILABLE",
      "The complete World Build identity could not be created.",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
  return {
    ok: true,
    exitCode: 0,
    diagnostics: [],
    normalizedWorldIrHash: pipeline.normalizedWorldIrHash,
    worldBuildIdentityHash,
  };
}

export async function validateSceneBriefFile(
  inputPath: string,
): Promise<WorldkitCommandResult> {
  const input = await readWorldkitInput(inputPath);
  if (!input.ok) return input;
  const validated = parseSceneBriefV1(input.sourceText);
  if (!validated.ok) {
    return {
      ok: false,
      exitCode: 2,
      diagnostics: validated.diagnostics.map((diagnostic) => {
        const separator = diagnostic.indexOf(":");
        return {
          severity: "error" as const,
          code: separator < 0 ? "SCENE_BRIEF_INVALID" : diagnostic.slice(0, separator),
          instancePath: "",
          message: separator < 0 ? diagnostic : diagnostic.slice(separator + 1).trim(),
        };
      }),
    };
  }
  return {
    ok: true,
    exitCode: 0,
    diagnostics: [],
    sceneBriefHash: validated.sceneBriefHash,
    movementMode: validated.value.movement.mode,
    movementModeLabel: validated.value.movement.label,
    visualTargetCount: validated.value.visualTargets.length,
  };
}

async function writeAtomic(
  outputPath: string,
  bytes: string | Uint8Array,
): Promise<void> {
  const absoluteOutputPath = path.resolve(outputPath);
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(absoluteOutputPath),
    `.${path.basename(absoluteOutputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, absoluteOutputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function packageCommandFailure(
  command: "build" | "inspect" | "load",
  exitCode: 1 | 2 | 3 | 4 | 5 | 6,
  code: string,
  message: string,
): WorldPackageCommandResultV1 {
  return Object.freeze({
    kind: "worldkit-package-command-result",
    schemaVersion: 1,
    protocolVersion: WORLDKIT_CLI_PROTOCOL_VERSION_V1,
    sdkVersion: WORLDKIT_SDK_VERSION_V1,
    specVersion: WORLDKIT_SPEC_VERSION_V1,
    command,
    ok: false,
    exitCode,
    diagnostics: Object.freeze([Object.freeze({
      severity: "error" as const,
      code,
      instancePath: "",
      message,
    })]),
  });
}

async function withBabylonProtocolSilence<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const previousLog = Logger.Log;
  const previousWarn = Logger.Warn;
  const previousError = Logger.Error;
  Logger.LogLevels = Logger.NoneLogLevel;
  try {
    return await operation();
  } finally {
    Logger.Log = previousLog;
    Logger.Warn = previousWarn;
    Logger.Error = previousError;
  }
}

export async function buildFile(
  inputPath: string,
  outputPath: string,
): Promise<WorldPackageCommandResultV1> {
  const requestedOutputPath = path.resolve(outputPath);
  const requestedParentPath = path.dirname(requestedOutputPath);
  let canonicalParentPath: string;
  try {
    await mkdir(requestedParentPath, { recursive: true });
    canonicalParentPath = await realpath(requestedParentPath);
  } catch {
    return packageCommandFailure(
      "build",
      1,
      "WORLD_PACKAGE_OUTPUT_UNAVAILABLE",
      "The WorldPackage output parent directory is unavailable.",
    );
  }
  return buildWorldPackageDirectoryV1({
    inputPath: path.resolve(inputPath),
    outputDirectoryPath: path.join(
      canonicalParentPath,
      path.basename(requestedOutputPath),
    ),
  });
}

export async function captureVisibleWorldWithRetries<
  T extends Readonly<{ sampledRgbColorCount: number }>,
>(
  capture: () => Promise<T>,
  maximumAttempts = 8,
): Promise<T> {
  if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1) {
    throw new RangeError("maximumAttempts must be a positive safe integer.");
  }
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const result = await capture();
    if (result.sampledRgbColorCount >= 4) return result;
  }
  throw new Error("WORLDKIT_CAPTURE_VISIBLE_WORLD_MISSING");
}

export async function captureFile(
  inputPath: string,
  outputPath: string,
  options: {
    snapshotPath?: string;
    triviewOutputPath?: string;
    implementationMapPath?: string;
    port?: number;
  } = {},
): Promise<WorldkitCommandResult> {
  const validation = await validateFile(inputPath);
  if (!validation.ok) return validation;
  const absoluteOutputPath = path.resolve(outputPath);
  const absoluteSnapshotPath =
    options.snapshotPath === undefined
      ? undefined
      : path.resolve(options.snapshotPath);
  const absoluteTriviewOutputPath = options.triviewOutputPath === undefined
    ? undefined
    : path.resolve(options.triviewOutputPath);
  const absoluteImplementationMapPath = options.implementationMapPath === undefined
    ? undefined
    : path.resolve(options.implementationMapPath);
  if ((absoluteTriviewOutputPath === undefined) !== (absoluteImplementationMapPath === undefined)) {
    return cliFailure(
      "CLI_CAPTURE_GROUPS_REQUIRED",
      "Tri-view capture requires the trusted visual implementation map.",
    );
  }
  if (
    absoluteOutputPath === path.resolve(inputPath) ||
    absoluteSnapshotPath === path.resolve(inputPath) ||
    absoluteTriviewOutputPath === path.resolve(inputPath)
  ) {
    return cliFailure(
      "CLI_OUTPUT_OVERWRITES_INPUT",
      "Capture outputs must not overwrite the AuthoringSpec input.",
    );
  }

  let configuredCaptureGroups: readonly VisualCaptureGroupV1[] = [];
  if (absoluteImplementationMapPath !== undefined) {
    try {
      const [mapSource, worldSource] = await Promise.all([
        readFile(absoluteImplementationMapPath, "utf8"),
        readFile(path.resolve(inputPath), "utf8"),
      ]);
      const [mapResult, worldResult] = [
        parseCanonicalJson(mapSource),
        parseCanonicalJson(worldSource),
      ];
      if (!mapResult.ok || mapResult.value === undefined ||
          !worldResult.ok || worldResult.value === undefined) {
        throw new Error("Implementation map or AuthoringSpec is not canonical JSON.");
      }
      const implementationMap = mapResult.value as unknown as SceneBriefImplementationMapV1;
      const mapErrors = validateSceneBriefImplementationMapV1(implementationMap);
      if (mapErrors.length > 0) {
        throw new Error(mapErrors.map(({ code, instancePath, message }) =>
          `${code} ${instancePath}: ${message}`).join(" "));
      }
      if (implementationMap.authoringSpecHash !== sha256CanonicalJson(worldResult.value)) {
        throw new Error("Implementation map does not bind this AuthoringSpec.");
      }
      configuredCaptureGroups = implementationMap.visualCaptureGroups;
    } catch (error) {
      return cliFailure(
        "CLI_CAPTURE_GROUPS_INVALID",
        "Unable to load trusted visual capture groups.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  let server: WorldkitServerHandle | undefined;
  let browser:
    | Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>>
    | undefined;
  const temporaryScreenshotPath = path.join(
    path.dirname(absoluteOutputPath),
    `.${path.basename(absoluteOutputPath)}.${process.pid}.${randomUUID()}.tmp.png`,
  );
  try {
    try {
      server = await startWorldkitServer({
        inputPath,
        ...(options.port === undefined ? {} : { port: options.port }),
      });
    } catch (error) {
      return cliFailure(
        "CLI_SERVER_START_FAILED",
        "Unable to start the Worldkit playground.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
    const { chromium } = await import("playwright");
    try {
      browser = await chromium.launch({ headless: true });
    } catch (bundledError) {
      try {
        browser = await chromium.launch({ headless: true, channel: "chrome" });
      } catch (systemChromeError) {
        return cliFailure(
          "CLI_PLAYWRIGHT_BROWSER_UNAVAILABLE",
          "Neither Playwright Chromium nor a system Chrome channel is available.",
          {
            bundledCause: bundledError instanceof Error ? bundledError.message : String(bundledError),
            systemChromeCause: systemChromeError instanceof Error
              ? systemChromeError.message
              : String(systemChromeError),
          },
        );
      }
    }
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    await page.goto(server.url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForFunction(
      () => window.__WORLDKIT__ !== undefined,
      undefined,
      { timeout: 30_000 },
    );
    await page.evaluate(async () => {
      const api = window.__WORLDKIT__;
      if (api === undefined) {
        throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      }
      await api.ready();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    const reportedRenderEnvironment = await page.evaluate(
      (): BrowserRenderEnvironmentV1 => {
        const canvas = document.createElement("canvas");
        const webgl2Context = canvas.getContext("webgl2");
        const context = webgl2Context ?? canvas.getContext("webgl");
        if (context === null) {
          return {
            webglApi: "unavailable",
            webglVendor: "",
            webglRenderer: "",
            isUnmaskedRenderer: false,
          };
        }

        const debugRendererInfo = context.getExtension(
          "WEBGL_debug_renderer_info",
        );
        const isUnmaskedRenderer = debugRendererInfo !== null;
        const vendorParameter = debugRendererInfo?.UNMASKED_VENDOR_WEBGL ??
          context.VENDOR;
        const rendererParameter = debugRendererInfo?.UNMASKED_RENDERER_WEBGL ??
          context.RENDERER;
        return {
          webglApi: webgl2Context === null ? "webgl" : "webgl2",
          webglVendor: String(context.getParameter(vendorParameter) ?? ""),
          webglRenderer: String(context.getParameter(rendererParameter) ?? ""),
          isUnmaskedRenderer,
        };
      },
    );
    const renderEnvironment = inspectRenderEnvironmentV1(
      reportedRenderEnvironment,
    );
    const captureDiagnostics = createRenderEnvironmentDiagnosticsV1(
      renderEnvironment,
    );
    if (configuredCaptureGroups.length > 0) {
      await page.waitForFunction(
        () => window.__WORLDKIT_AUTHORING_CAPTURE__ !== undefined,
        undefined,
        { timeout: 30_000 },
      );
    }
    const capture = await captureVisibleWorldWithRetries(() => page.evaluate(
      async (captureGroups): Promise<{
        snapshot: WorldRuntimeSnapshotV4;
        screenshotDataUrl: string;
        sampledRgbColorCount: number;
        triviews: readonly {
          target: VisualCaptureGroupV1;
          capture: WhiteboxTriviewCaptureV1;
          sampledRgbColorCount: number;
        }[];
      }> => {
        const api = window.__WORLDKIT__;
        if (api === undefined) {
          throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
        }
        const authoringCaptureApi = window.__WORLDKIT_AUTHORING_CAPTURE__;
        api.setPaused(true);
        const snapshot = await api.reset();
        const configuredGroups = captureGroups.length === 0
          ? []
          : authoringCaptureApi?.configureVisualCaptureGroups(captureGroups) ?? (() => {
              throw new Error("WORLDKIT_CAPTURE_TARGET_CONFIGURATION_UNAVAILABLE");
            })();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const beforeCapture = api.getSnapshot();
        if (
          beforeCapture.world.simulationTick !==
            snapshot.world.simulationTick
        ) {
          throw new Error("WORLDKIT_CAPTURE_TICK_MISMATCH");
        }
        api.captureScreenshot();
        const screenshotDataUrl = api.captureScreenshot();
        const screenshotImage = new Image();
        screenshotImage.src = screenshotDataUrl;
        await screenshotImage.decode();
        const inspectionCanvas = document.createElement("canvas");
        inspectionCanvas.width = screenshotImage.naturalWidth;
        inspectionCanvas.height = screenshotImage.naturalHeight;
        const inspectionContext = inspectionCanvas.getContext("2d", { willReadFrequently: true });
        if (inspectionContext === null) throw new Error("WORLDKIT_CAPTURE_INSPECTION_UNAVAILABLE");
        inspectionContext.drawImage(screenshotImage, 0, 0);
        const screenshotPixels = inspectionContext.getImageData(
          0,
          0,
          inspectionCanvas.width,
          inspectionCanvas.height,
        ).data;
        const sampledRgbColors = new Set<number>();
        for (let pixel = 0; pixel < screenshotPixels.length / 4; pixel += 16) {
          const offset = pixel * 4;
          sampledRgbColors.add(
            (screenshotPixels[offset]! << 16) |
              (screenshotPixels[offset + 1]! << 8) |
              screenshotPixels[offset + 2]!,
          );
          if (sampledRgbColors.size >= 4) break;
        }
        const sampledRgbColorCount = sampledRgbColors.size;
        const afterCapture = api.getSnapshot();
        if (
          afterCapture.world.simulationTick !==
            snapshot.world.simulationTick
        ) {
          throw new Error("WORLDKIT_CAPTURE_TICK_ADVANCED");
        }
        const triviews: {
          target: VisualCaptureGroupV1;
          capture: WhiteboxTriviewCaptureV1;
          sampledRgbColorCount: number;
        }[] = [];
        if (authoringCaptureApi !== undefined) {
          for (const target of configuredGroups) {
            const triviewCapture = authoringCaptureApi.captureWhiteboxTriview(target.visualTargetId);
            const triviewImage = new Image();
            triviewImage.src = triviewCapture.imageDataUri;
            await triviewImage.decode();
            inspectionCanvas.width = triviewImage.naturalWidth;
            inspectionCanvas.height = triviewImage.naturalHeight;
            inspectionContext.drawImage(triviewImage, 0, 0);
            const triviewPixels = inspectionContext.getImageData(
              0,
              0,
              inspectionCanvas.width,
              inspectionCanvas.height,
            ).data;
            const triviewRgbColors = new Set<number>();
            for (let pixel = 0; pixel < triviewPixels.length / 4; pixel += 16) {
              const offset = pixel * 4;
              triviewRgbColors.add(
                (triviewPixels[offset]! << 16) |
                  (triviewPixels[offset + 1]! << 8) |
                  triviewPixels[offset + 2]!,
              );
              if (triviewRgbColors.size >= 4) break;
            }
            triviews.push({
              target,
              capture: triviewCapture,
              sampledRgbColorCount: triviewRgbColors.size,
            });
          }
        }
        return {
          snapshot,
          screenshotDataUrl,
          sampledRgbColorCount,
          triviews,
        };
      }, configuredCaptureGroups,
    ));
    const pngDataUrlPrefix = "data:image/png;base64,";
    if (!capture.screenshotDataUrl.startsWith(pngDataUrlPrefix)) {
      throw new Error("WORLDKIT_CAPTURE_PNG_DATA_URL_INVALID");
    }
    await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await writeFile(
      temporaryScreenshotPath,
      Buffer.from(capture.screenshotDataUrl.slice(pngDataUrlPrefix.length), "base64"),
    );
    await rename(temporaryScreenshotPath, absoluteOutputPath);
    if (absoluteSnapshotPath !== undefined) {
      await writeAtomic(
        absoluteSnapshotPath,
        `${stringifyCanonicalJson(capture.snapshot)}\n`,
      );
    }
    if (absoluteTriviewOutputPath !== undefined) {
      const whiteboxTriviews = [] as {
        visualTargetId: string;
        runtimeEntityIds: readonly string[];
        role: VisualCaptureGroupV1["role"];
        semanticClassId: string;
        identityColor: `#${string}`;
        views: readonly ["front", "right", "back"];
        imageUri: string;
      }[];
      for (const triview of capture.triviews) {
        if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(triview.target.visualTargetId)) {
          throw new Error(`WORLDKIT_CAPTURE_TARGET_ID_INVALID: ${triview.target.visualTargetId}`);
        }
        if (!triview.capture.imageDataUri.startsWith(pngDataUrlPrefix)) {
          throw new Error(`WORLDKIT_CAPTURE_TRIVIEW_DATA_URL_INVALID: ${triview.target.visualTargetId}`);
        }
        if (triview.sampledRgbColorCount < 2) {
          throw new Error(`WORLDKIT_CAPTURE_TRIVIEW_EMPTY: ${triview.target.visualTargetId}`);
        }
        const relativeImagePath = `${triview.target.visualTargetId}/whitebox-triview.png`;
        const imagePath = path.join(absoluteTriviewOutputPath, relativeImagePath);
        await mkdir(path.dirname(imagePath), { recursive: true });
        await writeFile(
          imagePath,
          Buffer.from(
            triview.capture.imageDataUri.slice(pngDataUrlPrefix.length),
            "base64",
          ),
        );
        whiteboxTriviews.push({
          ...triview.target,
          views: ["front", "right", "back"],
          imageUri: relativeImagePath,
        });
      }
      if (validation.worldBuildIdentityHash === undefined) {
        throw new Error("WORLDKIT_CAPTURE_WORLD_BUILD_IDENTITY_HASH_MISSING");
      }
      const manifest: WhiteboxTriviewManifestV1 = {
        kind: "worldkit-whitebox-triview-manifest",
        schemaVersion: 1,
        worldBuildIdentityHash:
          validation.worldBuildIdentityHash as `sha256:${string}`,
        whiteboxTriviews,
      };
      await writeAtomic(
        path.join(absoluteTriviewOutputPath, "whitebox-triview-manifest.json"),
        `${stringifyCanonicalJson(manifest)}\n`,
      );
    }
    return {
      ok: true,
      exitCode: 0,
      diagnostics: captureDiagnostics,
      ...(validation.normalizedWorldIrHash === undefined
        ? {}
        : { normalizedWorldIrHash: validation.normalizedWorldIrHash }),
      ...(validation.worldBuildIdentityHash === undefined
        ? {}
        : { worldBuildIdentityHash: validation.worldBuildIdentityHash }),
      outputPath: absoluteOutputPath,
      ...(absoluteSnapshotPath === undefined
        ? {}
        : { snapshotPath: absoluteSnapshotPath }),
      ...(absoluteTriviewOutputPath === undefined
        ? {}
        : { triviewOutputPath: absoluteTriviewOutputPath }),
      url: server.url,
      renderEnvironment,
    };
  } catch (error) {
    return cliFailure(
      "CLI_CAPTURE_FAILED",
      "Unable to capture the Canonical JSON world.",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  } finally {
    await rm(temporaryScreenshotPath, { force: true });
    await browser?.close();
    await server?.stop();
  }
}

function subjectPresetCliFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = /^([A-Z][A-Z0-9_]+):/.exec(message)?.[1] ??
    "SUBJECT_PRESET_PROMOTION_FAILED";
  return cliFailure(code, message);
}

async function validateSubjectPresetForCli(
  inputPath: string,
) {
  try {
    const candidate = await validateSubjectPresetCandidateFile(inputPath);
    return {
      ok: true as const,
      exitCode: 0 as const,
      kind: "worldkit-subject-preset-validation" as const,
      schemaVersion: 1 as const,
      diagnostics: [] as const,
      candidateId: candidate.semanticContent.candidateId,
      subjectDefinitionId: candidate.semanticContent.subjectDefinitionId,
      candidateSemanticContentHash: candidate.semanticContentHash,
      sourceFormat: "candidate-v1" as const,
      generatedRegistryWriteCount: 0 as const,
    };
  } catch (error) {
    return subjectPresetCliFailure(error);
  }
}

async function planSubjectPresetForCli(
  inputPath: string,
  outputPath: string,
) {
  try {
    assertSubjectPresetArtifactLocationV1(outputPath, REPOSITORY_ROOT);
    const plan = await planSubjectPresetPromotion(inputPath, {
      repositoryRoot: REPOSITORY_ROOT,
    });
    const absoluteOutputPath = path.resolve(outputPath);
    if (absoluteOutputPath === path.resolve(inputPath)) {
      throw new Error(
        "SUBJECT_PRESET_PROMOTION_OUTPUT_OVERWRITES_INPUT: Plan output must not overwrite its candidate.",
      );
    }
    await writeAtomic(
      absoluteOutputPath,
      `${stringifyCanonicalJson(plan)}\n`,
    );
    return {
      ok: true as const,
      exitCode: 0 as const,
      kind: "worldkit-subject-preset-promotion-plan" as const,
      schemaVersion: 1 as const,
      diagnostics: [] as const,
      candidateId: plan.candidateId,
      proposedSubjectDefinitionRef: plan.proposedSubjectDefinitionRef,
      planHash: plan.planHash,
      outputPath: absoluteOutputPath,
    };
  } catch (error) {
    return subjectPresetCliFailure(error);
  }
}

async function promoteSubjectPresetForCli(
  inputPath: string,
  planPath: string,
  harnessReceiptPath: string,
) {
  try {
    const plan = await readSubjectPresetPromotionPlanFileV1(planPath);
    const harnessReceipt = await readSubjectPresetHarnessReceiptFileV1(
      harnessReceiptPath,
    );
    const promotion = await promoteSubjectPresetTransactionally(inputPath, {
      repositoryRoot: REPOSITORY_ROOT,
      plan,
      planPath,
      harnessReceipt,
      harnessReceiptPath,
      write: true,
    });
    return {
      ok: true as const,
      exitCode: 0 as const,
      kind: "worldkit-subject-preset-promotion" as const,
      schemaVersion: 1 as const,
      diagnostics: [] as const,
      planHash: promotion.planHash,
      writtenLogicalPaths: promotion.writtenLogicalPaths,
    };
  } catch (error) {
    return subjectPresetCliFailure(error);
  }
}

type PrintableResult = {
  ok: boolean;
  exitCode: number;
  diagnostics: readonly WorldkitDiagnostic[];
  normalizedWorldIrHash?: string;
  executionPlanHash?: string;
  validationReportHash?: string;
  validationStatus?: string;
  outputPath?: string;
  receiptPath?: string;
  evidenceDirectory?: string;
  snapshotPath?: string;
  triviewOutputPath?: string;
  kind?: string;
  schemaVersion?: number;
  candidateId?: string;
  subjectDefinitionId?: string;
  candidateSemanticContentHash?: string;
  proposedSubjectDefinitionRef?: string;
  planHash?: string;
  writtenLogicalPaths?: readonly string[];
  humanReadableText?: string;
  requestId?: string;
  receipt?: AuthoringEditCliResultV1["receipt"];
  projection?: AuthoringEditCliResultV1["projection"];
  searchReceipt?: AuthoringEditCliResultV1["searchReceipt"];
  explain?: AuthoringEditCliResultV1["explain"];
  diff?: AuthoringEditCliResultV1["diff"];
  cleanupReport?: AuthoringEditCliResultV1["cleanupReport"];
};

function printResult(result: PrintableResult, json: boolean): void {
  if (json) {
    const { humanReadableText: _humanReadableText, ...machineResult } = result;
    process.stdout.write(
      `${stringifyCanonicalJson(redactAuthoringEditJsonV1(machineResult))}\n`,
    );
    return;
  }
  if (result.ok) {
    for (const diagnostic of result.diagnostics) {
      process.stderr.write(
        `[${diagnostic.severity}] ${diagnostic.code} ${diagnostic.instancePath || "/"}: ${diagnostic.message}\n`,
      );
    }
    if (result.humanReadableText !== undefined) {
      process.stdout.write(`${result.humanReadableText}\n`);
      return;
    }
    const details = [
      result.outputPath,
      result.receiptPath,
      result.requestId,
      result.evidenceDirectory,
      result.validationReportHash,
      result.snapshotPath,
      result.triviewOutputPath,
      result.normalizedWorldIrHash,
      result.executionPlanHash,
    ]
      .filter((value): value is string => value !== undefined)
      .join("\n");
    process.stdout.write(`ok${details.length === 0 ? "" : `\n${details}`}\n`);
    return;
  }
  for (const diagnostic of result.diagnostics) {
    process.stderr.write(
      `[${diagnostic.severity}] ${diagnostic.code} ${diagnostic.instancePath || "/"}: ${diagnostic.message}\n`,
    );
  }
}

async function runUntilSignal(
  inputPath: string,
  port: number | undefined,
  refreshDependencies: boolean,
  json: boolean,
): Promise<number> {
  try {
    if ((await stat(path.resolve(inputPath))).isDirectory()) {
      const result = cliFailure(
        "CLI_RUN_INPUT_KIND_MISMATCH",
        "A WorldPackage directory requires run --interactive --protocol ndjson --headless.",
      );
      printResult(result, json);
      return result.exitCode;
    }
  } catch {
    // The shared input reader below owns the stable unavailable-input result.
  }
  const input = await readWorldkitInput(inputPath);
  if (!input.ok) {
    printResult(input, json);
    return input.exitCode;
  }
  const parsedInput = parseCanonicalJson(input.sourceText);
  if (!parsedInput.ok) {
    const result = {
      ok: false as const,
      exitCode: 2 as const,
      diagnostics: parsedInput.diagnostics,
    };
    printResult(result, json);
    return result.exitCode;
  }
  const parsedRecord = !isNil(parsedInput.value) &&
      typeof parsedInput.value === "object" &&
      !Array.isArray(parsedInput.value)
    ? parsedInput.value as Readonly<Record<string, unknown>>
    : undefined;
  let routeEvidence: Parameters<typeof startWorldkitServer>[0]["routeEvidence"];
  if (parsedRecord?.schemaVersion === 4) {
    const pipeline = await loadWorldkitRoutePipeline(inputPath);
    if (!pipeline.ok) {
      printResult(pipeline, json);
      return pipeline.exitCode;
    }
    let runnerModule: typeof import("../lib/route-validation-runner") | undefined;
    try {
      runnerModule = await import("../lib/route-validation-runner");
      const trustedRouteValidation =
        await runnerModule.runTrustedRouteValidationV1(inputPath);
      routeEvidence = {
        publication: trustedRouteValidation.routeEvidencePublication,
        canonicalBytes: canonicalJsonBytes(
          trustedRouteValidation.routeEvidencePublication,
        ),
      };
    } catch (error) {
      const runnerInfrastructureError = !isNil(runnerModule) &&
          error instanceof
            runnerModule.RouteValidationRunnerInfrastructureErrorV1
        ? error
        : undefined;
      const result = publicRouteValidationRunnerFailureV1(
        "run-playground",
        runnerInfrastructureError?.reason,
      );
      printResult(result, json);
      return result.exitCode;
    }
  } else {
    const validation = await validateFile(inputPath);
    if (!validation.ok) {
      printResult(validation, json);
      return validation.exitCode;
    }
  }
  let server: WorldkitServerHandle;
  try {
    server = await startWorldkitServer({
      inputPath,
      ...(port === undefined ? { port: 5173 } : { port }),
      ...(refreshDependencies ? { refreshDependencies: true } : {}),
      forwardOutput: !json,
      ...(isNil(routeEvidence) ? {} : { routeEvidence }),
    });
  } catch (error) {
    const result = cliFailure(
      "CLI_SERVER_START_FAILED",
      "Unable to start the Worldkit playground.",
      { cause: error instanceof Error ? error.message : String(error) },
    );
    printResult(result, json);
    return result.exitCode;
  }
  if (json) {
    process.stdout.write(
      `${stringifyCanonicalJson({ ok: true, url: server.url, port: server.port })}\n`,
    );
  } else {
    process.stdout.write(`Worldkit playground: ${server.url}\n`);
  }
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      process.off("SIGINT", finish);
      process.off("SIGTERM", finish);
      resolve();
    };
    process.once("SIGINT", finish);
    process.once("SIGTERM", finish);
    void server.waitForExit().then(finish);
  });
  await server.stop();
  return 0;
}

export async function inspectPackageDirectory(
  packageDirectoryPath: string,
): Promise<WorldPackageCommandResultV1> {
  let canonicalPackageDirectoryPath: string;
  try {
    canonicalPackageDirectoryPath = await realpath(
      path.resolve(packageDirectoryPath),
    );
  } catch {
    return packageCommandFailure(
      "inspect",
      2,
      "WORLD_PACKAGE_INPUT_INVALID",
      "The WorldPackage directory is unavailable.",
    );
  }
  return inspectWorldPackageDirectoryV1({
    packageDirectoryPath: canonicalPackageDirectoryPath,
  });
}

export async function loadPackageHeadless(
  packageDirectoryPath: string,
): Promise<WorldPackageCommandResultV1> {
  let canonicalPackageDirectoryPath: string;
  try {
    canonicalPackageDirectoryPath = await realpath(
      path.resolve(packageDirectoryPath),
    );
  } catch {
    return packageCommandFailure(
      "load",
      2,
      "WORLD_PACKAGE_INPUT_INVALID",
      "The WorldPackage directory is unavailable.",
    );
  }
  const loaded = await loadRuntimeWorldConfigurationFromPackageDirectoryV1({
    packageDirectoryPath: canonicalPackageDirectoryPath,
  });
  if (!("runtimeWorldConfiguration" in loaded)) return loaded.result;
  if (loaded.verifiedDirectory.kind !== "canonical-execution-plan") {
    return packageCommandFailure(
      "load",
      6,
      "WORLD_PACKAGE_RUNTIME_ADAPTER_UNAVAILABLE",
      "The selected headless Runtime adapter cannot run this admitted Scene Source.",
    );
  }
  const verifiedDirectory = loaded.verifiedDirectory;
  try {
    await withBabylonProtocolSilence(async () => {
      const { createHeadlessRuntimeSessionV1 } = await import(
        "../lib/headless-runtime-session"
      );
      const session = await createHeadlessRuntimeSessionV1({
        runtimeSessionId: `runtime-session.load.${randomUUID()}`,
        initialWorldSessionId: `world-session.load.${randomUUID()}`,
        runtimeWorldConfiguration: loaded.runtimeWorldConfiguration,
        verifiedDirectory,
      });
      await session.dispose();
    });
    return loaded.result;
  } catch {
    return packageCommandFailure(
      "load",
      5,
      "WORLD_PACKAGE_RUNTIME_READY_FAILED",
      "The admitted WorldPackage did not reach and cleanly leave World Ready.",
    );
  }
}

function processTerminationSignal(): Readonly<{
  promise: Promise<"SIGINT" | "SIGTERM">;
  cleanup(): void;
}> {
  let resolveSignal!: (signal: "SIGINT" | "SIGTERM") => void;
  const promise = new Promise<"SIGINT" | "SIGTERM">((resolve) => {
    resolveSignal = resolve;
  });
  const onSigint = (): void => resolveSignal("SIGINT");
  const onSigterm = (): void => resolveSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  return Object.freeze({
    promise,
    cleanup: () => {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
    },
  });
}

async function runRuntimeSession(
  packageDirectoryPath: string,
  sessionDirectoryPath: string,
  resume: boolean,
): Promise<number> {
  const walFilePath = path.join(
    sessionDirectoryPath,
    "runtime-session.wal.ndjson",
  );
  if (resume) {
    try {
      if (!(await stat(walFilePath)).isFile()) {
        throw new Error("not a file");
      }
    } catch {
      process.stderr.write(
        "--resume requires an existing Runtime Session WAL in --session-directory.\n",
      );
      return 2;
    }
  }

  try {
    return await withBabylonProtocolSilence(async () => {
      const {
        createRuntimeSessionExecutorV1,
        resumeRuntimeSessionExecutorV1,
      } = await import("../lib/runtime-session-executor");
      const canonicalPackageDirectoryPath = await realpath(
        path.resolve(packageDirectoryPath),
      );
      const executor = resume
        ? await resumeRuntimeSessionExecutorV1({
            packageDirectoryPath: canonicalPackageDirectoryPath,
            walFilePath,
          })
        : await createRuntimeSessionExecutorV1({
            packageDirectoryPath: canonicalPackageDirectoryPath,
            walFilePath,
            runtimeSessionId: `runtime-session.${randomUUID()}`,
            initialWorldSessionId: `world-session.${randomUUID()}`,
          });
      const signal = processTerminationSignal();
      try {
        const result = await runRuntimeSessionNdjsonV1({
          executor,
          input: process.stdin,
          output: process.stdout,
          terminationSignal: signal.promise,
        });
        return result.exitCode;
      } finally {
        signal.cleanup();
      }
    });
  } catch {
    process.stderr.write(
      "Runtime Session creation or recovery failed before the ready Event.\n",
    );
    return 1;
  }
}

const NATIVE_EXIT_BY_OUTCOME = Object.freeze({
  passed: 0,
  rejected: 1,
  "tool-error": 2,
} as const);

function nativeToolUsageResult(): NativeSceneCheckResultV1 {
  const diagnostic = parseNativeSceneDiagnosticV1({
    kind: "native-scene-diagnostic",
    schemaVersion: 1,
    id: "native-scene-cli.tool-usage-invalid",
    severity: "error",
    stage: "tooling",
    code: "WORLDKIT_NATIVE_SCENE_TOOL_USAGE_INVALID",
    location: { kind: "none" },
    measurement: { kind: "none" },
    message: "The worldkit native command arguments are invalid.",
    repairHint: "Use native check <world-directory> --json or native explain <world-directory> [--json].",
  });
  return parseNativeSceneCheckResultV1({
    kind: "native-scene-check-result",
    schemaVersion: 1,
    id: "native-scene-cli.unresolved-world-check",
    checkedInput: { kind: "unresolved-world" },
    outcome: "tool-error",
    diagnostics: [diagnostic],
  });
}

function writeNativeJsonResult(result: NativeSceneCheckResultV1): void {
  process.stdout.write(`${stringifyCanonicalJson(result)}\n`);
}

function writeNativePackageJsonResult(
  result: Readonly<Record<string, unknown>>,
): void {
  process.stdout.write(`${stringifyCanonicalJson(result)}\n`);
}

async function runNativeCommand(
  parsed: Extract<WorldkitArgs, {
    command: "native-check" | "native-explain";
  }>,
): Promise<number> {
  const result = await withBabylonProtocolSilence(() =>
    checkBabylonNativeSceneWorldDirectoryV1(parsed.worldDirectoryPath)
  );
  if (parsed.command === "native-check" || parsed.json) {
    writeNativeJsonResult(result);
  } else {
    process.stdout.write(explainNativeSceneCheckResultV1(result));
  }
  return NATIVE_EXIT_BY_OUTCOME[result.outcome];
}

export async function main(
  arguments_: readonly string[] = process.argv.slice(2),
  ports: WorldkitMainPortsV1 = {},
): Promise<number> {
  let parsed: WorldkitArgs;
  try {
    parsed = parseWorldkitArgs(arguments_);
  } catch (error) {
    if (arguments_[0] === "native" && arguments_[1] === "package") {
      writeNativePackageJsonResult(Object.freeze({
        outcome: "tool-error",
        code: "WORLDKIT_NATIVE_PACKAGE_TOOL_USAGE_INVALID",
        diagnostics: Object.freeze([]),
      }));
      return 2;
    }
    if (arguments_[0] === "native") {
      writeNativeJsonResult(nativeToolUsageResult());
      return 2;
    }
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n\n${HELP}`,
    );
    return 1;
  }
  if (parsed.command === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (
    parsed.command === "native-check" ||
    parsed.command === "native-explain"
  ) {
    return runNativeCommand(parsed);
  }
  if (parsed.command === "native-package") {
    try {
      const result = await runNativePackageCommandV1(
        parsed,
        ports.packageNativeBlockAttemptV1,
      );
      writeNativePackageJsonResult(result);
      return 0;
    } catch (error) {
      const failure = nativePackageFailureV1(error);
      writeNativePackageJsonResult(failure.result);
      return failure.exitCode;
    }
  }
  if (parsed.command === "run-browser") {
    return runUntilSignal(
      parsed.inputPath,
      parsed.port,
      parsed.refreshDependencies === true,
      parsed.json,
    );
  }
  if (parsed.command === "run-session") {
    return runRuntimeSession(
      parsed.packageDirectoryPath,
      parsed.sessionDirectoryPath,
      parsed.resume,
    );
  }
  if (parsed.command === "inspect") {
    const result = await inspectPackageDirectory(parsed.packageDirectoryPath);
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "load") {
    const result = await loadPackageHeadless(parsed.packageDirectoryPath);
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "take-validate") {
    const result = await validateSimulationTakeFileV1(parsed.inputPath);
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "take-inspect") {
    const result = await inspectSimulationTakeFileV1(parsed.inputPath);
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "take-run") {
    const result = await runSimulationTakeFileV1(parsed.inputPath, {
      worldPath: parsed.worldPath,
      outputPath: parsed.outputPath,
      widthPixels: parsed.widthPixels,
      heightPixels: parsed.heightPixels,
      ...(parsed.port === undefined ? {} : { port: parsed.port }),
    });
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "capture-validate") {
    const result = await validateControlCaptureBundleFileV1(parsed.inputPath);
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "capture-inspect") {
    const result = await inspectControlCaptureBundleFileV1(parsed.inputPath);
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "subject-preset-validate") {
    const result = await validateSubjectPresetForCli(parsed.inputPath);
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "subject-preset-plan") {
    const result = await planSubjectPresetForCli(
      parsed.inputPath,
      parsed.outputPath,
    );
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "subject-preset-promote") {
    const result = await promoteSubjectPresetForCli(
      parsed.inputPath,
      parsed.planPath,
      parsed.harnessReceiptPath,
    );
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "verify-capture") {
    const result = await verifyControlCaptureFileV1(
      parsed.inputPath,
      parsed.outputPath,
    );
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "verify-route") {
    const result = await verifyRouteFileV1(
      parsed.inputPath,
      parsed.validationProfileRef,
      parsed.outputPath,
    );
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "verify-explain") {
    const result = await explainValidationReportFileV1(
      parsed.inputPath,
      parsed.gateId,
    );
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "schema-project") {
    const result = await runSchemaProjectV1({
      worldJsonPath: parsed.inputPath,
      profileRef: parsed.profileRef,
      outputPath: parsed.outputPath,
    });
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "registry-search") {
    const result = await runRegistrySearchV1({
      lockPath: parsed.lockPath,
      resourceKind: parsed.resourceKind,
      semanticTags: parsed.semanticTags,
      ...(parsed.afterResourceRef === undefined
        ? {}
        : { afterResourceRef: parsed.afterResourceRef }),
      ...(parsed.limit === undefined ? {} : { limit: parsed.limit }),
    });
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "change-validate") {
    const result = await runChangeValidateV1({ changeSetPath: parsed.inputPath });
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "change-dry-run") {
    const result = await runChangeDryRunV1({
      worldJsonPath: parsed.inputPath,
      changeSetPath: parsed.changeSetPath,
      outputPath: parsed.outputPath,
    });
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "change-diff") {
    const result = await runChangeDiffV1({ receiptPath: parsed.inputPath });
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "change-explain") {
    const result = await runChangeExplainV1({
      receiptPath: parsed.inputPath,
      ...(parsed.operationId === undefined ? {} : { operationId: parsed.operationId }),
      ...(parsed.diagnosticCode === undefined
        ? {}
        : { diagnosticCode: parsed.diagnosticCode }),
    });
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "change-apply") {
    const result = await runChangeApplyV1({
      worldJsonPath: parsed.inputPath,
      changeSetPath: parsed.changeSetPath,
      outputPath: parsed.outputPath,
      receiptPath: parsed.receiptPath,
    });
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "change-receipt") {
    const result = await runChangeReceiptV1({
      requestId: parsed.requestId,
      ...(parsed.connectionProfilePath === undefined
        ? {}
        : { connectionProfilePath: parsed.connectionProfilePath }),
    });
    printResult(result, parsed.json);
    return result.exitCode;
  }
  if (parsed.command === "change-cleanup") {
    const result = await runChangeCleanupV1({
      cleanupOperationId: parsed.cleanupOperationId,
      ...(parsed.connectionProfilePath === undefined
        ? {}
        : { connectionProfilePath: parsed.connectionProfilePath }),
    });
    printResult(result, parsed.json);
    return result.exitCode;
  }

  const result =
    parsed.command === "brief-validate"
      ? await validateSceneBriefFile(parsed.inputPath)
      : parsed.command === "validate"
      ? await validateFile(parsed.inputPath)
      : parsed.command === "layout-validate"
        ? await layoutValidateFile(parsed.inputPath)
        : parsed.command === "layout-solve"
          ? await layoutSolveFile(parsed.inputPath, parsed.outputPath)
          : parsed.command === "layout-explain"
            ? await layoutExplainFile(
                parsed.inputPath,
                parsed.entityId === undefined
                  ? { constraintId: parsed.constraintId }
                  : { entityId: parsed.entityId },
              )
      : parsed.command === "build"
        ? await buildFile(parsed.inputPath, parsed.outputPath)
        : parsed.command === "capture"
          ? await captureFile(parsed.inputPath, parsed.outputPath, {
              ...(parsed.snapshotPath === undefined
                ? {}
                : { snapshotPath: parsed.snapshotPath }),
              ...(parsed.triviewOutputPath === undefined
                ? {}
                : { triviewOutputPath: parsed.triviewOutputPath }),
              ...(parsed.implementationMapPath === undefined
                ? {}
                : { implementationMapPath: parsed.implementationMapPath }),
              ...(parsed.port === undefined ? {} : { port: parsed.port }),
            })
          : parsed.command === "registry-list"
            ? listRegistryResources(parsed.resourceKind)
            : parsed.command === "registry-describe"
              ? describeRegistryResource(parsed.resourceRef)
              : parsed.command === "subject-definition-validate"
                ? await validateSubjectDefinitionFile(parsed.inputPath)
                : await explainSubjectFile(parsed.inputPath, parsed.entityId);
  printResult(result, parsed.json);
  return result.exitCode;
}

const entryPath =
  process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
