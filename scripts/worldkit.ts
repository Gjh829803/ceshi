import { randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

import {
  normalizeSubjectDefinitionV2,
  parseCanonicalJson,
  ResourceLockBuilderV1,
  stringifyCanonicalJson,
  validatePackageSubjectDefinition,
  type AuthoringDiagnostic,
} from "@whitebox-world/authoring";
import { canonicalJsonBytes } from "@whitebox-world/protocol";
import type { WorldRuntimeSnapshotV4 } from "@whitebox-world/runtime-contracts";
import {
  builtInSubjectResourceRegistry,
  type SubjectRegistryResourceV3,
} from "@whitebox-world/subject-registry";
import { isNil } from "lodash-es";

import { explainSubjectFile } from "./lib/subject-explain";
import {
  layoutExplainFile,
  layoutSolveFile,
  layoutValidateFile,
} from "./lib/layout-artifacts";
import {
  cliFailure,
  loadWorldkitRoutePipeline,
  readWorldkitInput,
  type CliDiagnostic,
  type WorldkitDiagnostic,
} from "./lib/worldkit-pipeline";
import {
  startWorldkitServer,
  type WorldkitServerHandle,
} from "./lib/worldkit-server";
import {
  inspectControlCaptureBundleFileV1,
  inspectSimulationTakeFileV1,
  runSimulationTakeFileV1,
  validateControlCaptureBundleFileV1,
  validateSimulationTakeFileV1,
} from "./lib/simulation-take-cli";
import {
  assertSubjectPresetArtifactLocationV1,
  planSubjectPresetPromotion,
  promoteSubjectPresetTransactionally,
  readSubjectPresetHarnessReceiptFileV1,
  readSubjectPresetPromotionPlanFileV1,
  validateSubjectPresetCandidateFile,
} from "./lib/subject-preset-promotion";
import {
  explainValidationReportFileV1,
  verifyControlCaptureFileV1,
} from "./lib/validation-cli";
import {
  publicRouteValidationRunnerFailureV1,
  verifyRouteFileV1,
} from "./lib/route-validation-cli";

const execFile = promisify(execFileCallback);
const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

const HELP = `worldkit - Canonical JSON whitebox world SDK

Usage:
  worldkit validate <file> [--json]
  worldkit build <file> --output <file> [--json]
  worldkit run <file> [--port <port>] [--refresh-dependencies] [--json]
  worldkit capture <file> --output <png> [--snapshot <json>] [--port <port>] [--json]
  worldkit registry list --kind subject-definition [--json]
  worldkit registry describe --resource-ref <ref> [--json]
  worldkit subject-definition validate <file> [--json]
  worldkit subject explain <world-file> --entity-id <id> [--json]
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

export type { CliDiagnostic } from "./lib/worldkit-pipeline";

export type WorldkitArgs =
  | { command: "help"; json: false }
  | { command: "validate"; inputPath: string; json: boolean }
  | { command: "build"; inputPath: string; outputPath: string; json: boolean }
  | {
      command: "run";
      inputPath: string;
      port?: number;
      refreshDependencies?: boolean;
      json: boolean;
    }
  | {
      command: "capture";
      inputPath: string;
      outputPath: string;
      snapshotPath?: string;
      port?: number;
      json: boolean;
    }
  | {
      command: "registry-list";
      resourceKind: "subject-definition";
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
      ));

export interface WorldkitCommandResult {
  ok: boolean;
  exitCode: number;
  diagnostics: readonly WorldkitDiagnostic[];
  normalizedWorldIrHash?: string;
  executionPlanHash?: string;
  validationReportHash?: string;
  validationStatus?: string;
  outputPath?: string;
  evidenceDirectory?: string;
  snapshotPath?: string;
  url?: string;
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
      if (resourceKind !== "subject-definition") {
        throw new WorldkitUsageError(
          "registry list requires --kind subject-definition.",
        );
      }
      rejectRemaining(tokens, "registry list");
      return { command: "registry-list", resourceKind, json };
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

  const inputPath = takeRequiredPositional(tokens, `${command ?? "command"} input file`);
  if (command === "validate") {
    rejectRemaining(tokens, "validate");
    return { command, inputPath, json };
  }
  if (command === "build") {
    const outputPath = takeOption(tokens, "--output");
    if (outputPath === undefined) {
      throw new WorldkitUsageError("build requires --output <file>.");
    }
    rejectRemaining(tokens, "build");
    return { command, inputPath, outputPath, json };
  }
  if (command === "run") {
    const portValue = takeOption(tokens, "--port");
    const refreshDependencies = takeFlag(tokens, "--refresh-dependencies");
    rejectRemaining(tokens, "run");
    return {
      command,
      inputPath,
      ...(portValue === undefined ? {} : { port: parsePort(portValue) }),
      ...(refreshDependencies ? { refreshDependencies: true } : {}),
      json,
    };
  }
  if (command === "capture") {
    const outputPath = takeOption(tokens, "--output");
    const snapshotPath = takeOption(tokens, "--snapshot");
    const portValue = takeOption(tokens, "--port");
    if (outputPath === undefined) {
      throw new WorldkitUsageError("capture requires --output <png>.");
    }
    rejectRemaining(tokens, "capture");
    return {
      command,
      inputPath,
      outputPath,
      ...(snapshotPath === undefined ? {} : { snapshotPath }),
      ...(portValue === undefined ? {} : { port: parsePort(portValue) }),
      json,
    };
  }
  throw new WorldkitUsageError(`Unknown command '${command}'.`);
}

export function listRegistryResources(
  resourceKind: "subject-definition",
) {
  const resources = builtInSubjectResourceRegistry
    .listSubjectDefinitions()
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
        [isSubjectDefinition ? "listSubjectDefinitions" : "listResources"]()
        .map((resource) => resource.resourceRef),
      discoveryCommand: isSubjectDefinition
        ? "worldkit registry list --kind subject-definition --json"
        : "worldkit registry describe --resource-ref <ref> --json",
    },
  };
}

export function describeRegistryResource(resourceRef: string) {
  const resource = resourceRef.startsWith("worldkit://subject-definition/")
    ? builtInSubjectResourceRegistry.resolveSubjectDefinition(resourceRef)
    : builtInSubjectResourceRegistry
        .listResources()
        .find((candidate) => candidate.resourceRef === resourceRef);
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
  return {
    ok: true,
    exitCode: 0,
    diagnostics: [],
    normalizedWorldIrHash: pipeline.normalizedWorldIrHash,
    executionPlanHash: pipeline.executionPlanHash,
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

export async function buildFile(
  inputPath: string,
  outputPath: string,
): Promise<WorldkitCommandResult> {
  const absoluteInputPath = path.resolve(inputPath);
  const absoluteOutputPath = path.resolve(outputPath);
  if (absoluteInputPath === absoluteOutputPath) {
    return cliFailure(
      "CLI_OUTPUT_OVERWRITES_INPUT",
      "Build output must not overwrite the AuthoringSpec input.",
    );
  }
  const pipeline = await loadWorldkitRoutePipeline(absoluteInputPath);
  if (!pipeline.ok) return pipeline;
  const artifact = {
    kind: "worldkit-build-artifact",
    schemaVersion: 4,
    normalizedWorldIrHash: pipeline.normalizedWorldIrHash,
    executionPlanHash: pipeline.executionPlanHash,
    normalizedWorldIr: pipeline.normalizedWorldIr,
    executionPlan: pipeline.executionPlan,
  } as const;
  try {
    await writeAtomic(
      absoluteOutputPath,
      `${stringifyCanonicalJson(artifact)}\n`,
    );
  } catch (error) {
    return cliFailure(
      "CLI_OUTPUT_WRITE_FAILED",
      `Unable to write build artifact '${absoluteOutputPath}'.`,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
  return {
    ok: true,
    exitCode: 0,
    diagnostics: [],
    normalizedWorldIrHash: pipeline.normalizedWorldIrHash,
    executionPlanHash: pipeline.executionPlanHash,
    outputPath: absoluteOutputPath,
  };
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
  options: { snapshotPath?: string; port?: number } = {},
): Promise<WorldkitCommandResult> {
  const validation = await validateFile(inputPath);
  if (!validation.ok) return validation;
  const absoluteOutputPath = path.resolve(outputPath);
  const absoluteSnapshotPath =
    options.snapshotPath === undefined
      ? undefined
      : path.resolve(options.snapshotPath);
  if (
    absoluteOutputPath === path.resolve(inputPath) ||
    absoluteSnapshotPath === path.resolve(inputPath)
  ) {
    return cliFailure(
      "CLI_OUTPUT_OVERWRITES_INPUT",
      "Capture outputs must not overwrite the AuthoringSpec input.",
    );
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
    } catch (error) {
      return cliFailure(
        "CLI_PLAYWRIGHT_BROWSER_UNAVAILABLE",
        "Playwright Chromium is unavailable. Run 'pnpm exec playwright install chromium'.",
        { cause: error instanceof Error ? error.message : String(error) },
      );
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
    const capture = await captureVisibleWorldWithRetries(() => page.evaluate(
      async (): Promise<{
        snapshot: WorldRuntimeSnapshotV4;
        screenshotDataUrl: string;
        sampledRgbColorCount: number;
      }> => {
        const api = window.__WORLDKIT__;
        if (api === undefined) {
          throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
        }
        api.setPaused(true);
        const snapshot = await api.reset();
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
        const inspectionContext = inspectionCanvas.getContext("2d", {
          willReadFrequently: true,
        });
        if (inspectionContext === null) {
          throw new Error("WORLDKIT_CAPTURE_INSPECTION_UNAVAILABLE");
        }
        inspectionContext.drawImage(screenshotImage, 0, 0);
        const pixels = inspectionContext.getImageData(
          0,
          0,
          inspectionCanvas.width,
          inspectionCanvas.height,
        ).data;
        const sampledRgbColors = new Set<number>();
        const stridePixels = 16;
        for (let pixel = 0; pixel < pixels.length / 4; pixel += stridePixels) {
          const offset = pixel * 4;
          sampledRgbColors.add(
            (pixels[offset]! << 16) |
              (pixels[offset + 1]! << 8) |
              pixels[offset + 2]!,
          );
          if (sampledRgbColors.size >= 4) break;
        }
        const afterCapture = api.getSnapshot();
        if (
          afterCapture.world.simulationTick !==
            snapshot.world.simulationTick
        ) {
          throw new Error("WORLDKIT_CAPTURE_TICK_ADVANCED");
        }
        return {
          snapshot,
          screenshotDataUrl,
          sampledRgbColorCount: sampledRgbColors.size,
        };
      },
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
    return {
      ok: true,
      exitCode: 0,
      diagnostics: [],
      ...(validation.normalizedWorldIrHash === undefined
        ? {}
        : { normalizedWorldIrHash: validation.normalizedWorldIrHash }),
      ...(validation.executionPlanHash === undefined
        ? {}
        : { executionPlanHash: validation.executionPlanHash }),
      outputPath: absoluteOutputPath,
      ...(absoluteSnapshotPath === undefined
        ? {}
        : { snapshotPath: absoluteSnapshotPath }),
      url: server.url,
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
  evidenceDirectory?: string;
  snapshotPath?: string;
  kind?: string;
  schemaVersion?: number;
  candidateId?: string;
  subjectDefinitionId?: string;
  candidateSemanticContentHash?: string;
  proposedSubjectDefinitionRef?: string;
  planHash?: string;
  writtenLogicalPaths?: readonly string[];
  humanReadableText?: string;
};

function printResult(result: PrintableResult, json: boolean): void {
  if (json) {
    const { humanReadableText: _humanReadableText, ...machineResult } = result;
    process.stdout.write(`${stringifyCanonicalJson(machineResult)}\n`);
    return;
  }
  if (result.ok) {
    if (result.humanReadableText !== undefined) {
      process.stdout.write(`${result.humanReadableText}\n`);
      return;
    }
    const details = [
      result.outputPath,
      result.evidenceDirectory,
      result.validationReportHash,
      result.snapshotPath,
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
    let runnerModule: typeof import("./lib/route-validation-runner") | undefined;
    try {
      runnerModule = await import("./lib/route-validation-runner");
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

export async function main(
  arguments_: readonly string[] = process.argv.slice(2),
): Promise<number> {
  let parsed: WorldkitArgs;
  try {
    parsed = parseWorldkitArgs(arguments_);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n\n${HELP}`,
    );
    return 1;
  }
  if (parsed.command === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (parsed.command === "run") {
    return runUntilSignal(
      parsed.inputPath,
      parsed.port,
      parsed.refreshDependencies === true,
      parsed.json,
    );
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

  const result =
    parsed.command === "validate"
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
