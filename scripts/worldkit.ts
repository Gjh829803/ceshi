import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  normalizeSubjectDefinitionV2,
  parseCanonicalJson,
  ResourceLockBuilderV1,
  stringifyCanonicalJson,
  validatePackageSubjectDefinition,
  type AuthoringDiagnostic,
} from "@whitebox-world/authoring";
import type { WorldRuntimeSnapshotV3 } from "@whitebox-world/runtime-contracts";
import {
  builtInSubjectResourceRegistry,
  type SubjectRegistryResourceV1,
} from "@whitebox-world/subject-registry";

import { explainSubjectFile } from "./lib/subject-explain";
import {
  cliFailure,
  loadWorldkitPipeline,
  readWorldkitInput,
  type CliDiagnostic,
  type WorldkitDiagnostic,
} from "./lib/worldkit-pipeline";
import {
  startWorldkitServer,
  type WorldkitServerHandle,
} from "./lib/worldkit-server";

const HELP = `worldkit - Canonical JSON whitebox world SDK

Usage:
  worldkit validate <file> [--json]
  worldkit build <file> --output <file> [--json]
  worldkit run <file> [--port <port>] [--json]
  worldkit capture <file> --output <png> [--snapshot <json>] [--port <port>] [--json]
  worldkit registry list --kind subject-definition [--json]
  worldkit registry describe --resource-ref <ref> [--json]
  worldkit subject-definition validate <file> [--json]
  worldkit subject explain <world-file> --entity-id <id> [--json]
`;

export type { CliDiagnostic } from "./lib/worldkit-pipeline";

export type WorldkitArgs =
  | { command: "help"; json: false }
  | { command: "validate"; inputPath: string; json: boolean }
  | { command: "build"; inputPath: string; outputPath: string; json: boolean }
  | { command: "run"; inputPath: string; port?: number; json: boolean }
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
    };

export interface WorldkitCommandResult {
  ok: boolean;
  exitCode: number;
  diagnostics: readonly WorldkitDiagnostic[];
  normalizedWorldIrHash?: string;
  executionPlanHash?: string;
  outputPath?: string;
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

function takeJsonFlag(tokens: string[]): boolean {
  const index = tokens.indexOf("--json");
  if (index === -1) return false;
  if (tokens.lastIndexOf("--json") !== index) {
    throw new WorldkitUsageError("--json may be provided only once.");
  }
  tokens.splice(index, 1);
  return true;
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
    rejectRemaining(tokens, "run");
    return {
      command,
      inputPath,
      ...(portValue === undefined ? {} : { port: parsePort(portValue) }),
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
        .listResources()
        .filter((resource) =>
          isSubjectDefinition ? resource.kind === "subject-definition" : true,
        )
        .map((resource) => resource.resourceRef),
      discoveryCommand: isSubjectDefinition
        ? "worldkit registry list --kind subject-definition --json"
        : "worldkit registry describe --resource-ref <ref> --json",
    },
  };
}

export function describeRegistryResource(resourceRef: string) {
  const resource = builtInSubjectResourceRegistry
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
    resource: structuredClone(resource) as SubjectRegistryResourceV1,
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
  const pipeline = await loadWorldkitPipeline(inputPath);
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
  const pipeline = await loadWorldkitPipeline(absoluteInputPath);
  if (!pipeline.ok) return pipeline;
  const artifact = {
    kind: "worldkit-build-artifact",
    schemaVersion: 3,
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
    const snapshot = await page.evaluate(
      async (): Promise<WorldRuntimeSnapshotV3> => {
        const api = window.__WORLDKIT__;
        if (api === undefined) {
          throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
        }
        return api.ready();
      },
    );
    await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await page
      .locator("canvas.world-canvas")
      .screenshot({ path: temporaryScreenshotPath, type: "png" });
    await rename(temporaryScreenshotPath, absoluteOutputPath);
    if (absoluteSnapshotPath !== undefined) {
      await writeAtomic(
        absoluteSnapshotPath,
        `${stringifyCanonicalJson(snapshot)}\n`,
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

type PrintableResult = {
  ok: boolean;
  exitCode: number;
  diagnostics: readonly WorldkitDiagnostic[];
  normalizedWorldIrHash?: string;
  executionPlanHash?: string;
  outputPath?: string;
  snapshotPath?: string;
};

function printResult(result: PrintableResult, json: boolean): void {
  if (json) {
    process.stdout.write(`${stringifyCanonicalJson(result)}\n`);
    return;
  }
  if (result.ok) {
    const details = [
      result.outputPath,
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
  json: boolean,
): Promise<number> {
  const validation = await validateFile(inputPath);
  if (!validation.ok) {
    printResult(validation, json);
    return validation.exitCode;
  }
  let server: WorldkitServerHandle;
  try {
    server = await startWorldkitServer({
      inputPath,
      ...(port === undefined ? { port: 5173 } : { port }),
      forwardOutput: !json,
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
    return runUntilSignal(parsed.inputPath, parsed.port, parsed.json);
  }

  const result =
    parsed.command === "validate"
      ? await validateFile(parsed.inputPath)
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
