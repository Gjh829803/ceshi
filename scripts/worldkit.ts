import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  normalizeAuthoringSpec,
  parseAuthoringSpecJson,
  stringifyCanonicalJson,
  type AuthoringDiagnostic,
  type NormalizedWorldIRV1,
} from "@whitebox-world/authoring";
import { compileWorld } from "@whitebox-world/compiler";
import type {
  CompileDiagnostic,
  ExecutionPlanV2,
  WorldRuntimeSnapshotV2,
} from "@whitebox-world/runtime-contracts";

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
`;

type Diagnostic = AuthoringDiagnostic | CompileDiagnostic | CliDiagnostic;

export interface CliDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  instancePath: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}

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
    };

export interface WorldkitCommandResult {
  ok: boolean;
  exitCode: number;
  diagnostics: readonly Diagnostic[];
  normalizedWorldIrHash?: string;
  executionPlanHash?: string;
  outputPath?: string;
  snapshotPath?: string;
  url?: string;
}

interface PipelineSuccess {
  normalizedWorldIr: NormalizedWorldIRV1;
  normalizedWorldIrHash: string;
  executionPlan: ExecutionPlanV2;
  executionPlanHash: string;
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
    throw new WorldkitUsageError("--port must be an integer from 1 through 65535.");
  }
  return port;
}

function takeOption(tokens: string[], option: string): string | undefined {
  const index = tokens.indexOf(option);
  if (index === -1) return undefined;
  if (tokens.lastIndexOf(option) !== index) throw new WorldkitUsageError(`${option} may be provided only once.`);
  const value = tokens[index + 1];
  if (value === undefined || value.startsWith("--")) throw new WorldkitUsageError(`${option} requires a value.`);
  tokens.splice(index, 2);
  return value;
}

export function parseWorldkitArgs(arguments_: readonly string[]): WorldkitArgs {
  const tokens = [...arguments_];
  if (tokens.length === 0 || tokens[0] === "--help" || tokens[0] === "-h" || tokens[0] === "help") {
    if (tokens.length > 1) throw new WorldkitUsageError("Help does not accept positional arguments.");
    return { command: "help", json: false };
  }
  const command = tokens.shift();
  const jsonIndex = tokens.indexOf("--json");
  const json = jsonIndex !== -1;
  if (json) {
    if (tokens.lastIndexOf("--json") !== jsonIndex) throw new WorldkitUsageError("--json may be provided only once.");
    tokens.splice(jsonIndex, 1);
  }
  const inputPath = tokens.shift();
  if (inputPath === undefined || inputPath.startsWith("--")) {
    throw new WorldkitUsageError(`${command ?? "command"} requires an input file.`);
  }

  if (command === "validate") {
    if (tokens.length > 0) throw new WorldkitUsageError(`Unknown validate option '${tokens[0]}'.`);
    return { command, inputPath, json };
  }
  if (command === "build") {
    const outputPath = takeOption(tokens, "--output");
    if (outputPath === undefined) throw new WorldkitUsageError("build requires --output <file>.");
    if (tokens.length > 0) throw new WorldkitUsageError(`Unknown build option '${tokens[0]}'.`);
    return { command, inputPath, outputPath, json };
  }
  if (command === "run") {
    const portValue = takeOption(tokens, "--port");
    if (tokens.length > 0) throw new WorldkitUsageError(`Unknown run option '${tokens[0]}'.`);
    return { command, inputPath, ...(portValue === undefined ? {} : { port: parsePort(portValue) }), json };
  }
  if (command === "capture") {
    const outputPath = takeOption(tokens, "--output");
    const snapshotPath = takeOption(tokens, "--snapshot");
    const portValue = takeOption(tokens, "--port");
    if (outputPath === undefined) throw new WorldkitUsageError("capture requires --output <png>.");
    if (tokens.length > 0) throw new WorldkitUsageError(`Unknown capture option '${tokens[0]}'.`);
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

function cliFailure(code: string, message: string, details?: Readonly<Record<string, unknown>>): WorldkitCommandResult {
  return {
    ok: false,
    exitCode: 2,
    diagnostics: [{
      severity: "error",
      code,
      instancePath: "",
      message,
      ...(details === undefined ? {} : { details }),
    }],
  };
}

async function loadPipeline(inputPath: string): Promise<PipelineSuccess | WorldkitCommandResult> {
  let sourceText: string;
  try {
    sourceText = await readFile(path.resolve(inputPath), "utf8");
  } catch (error) {
    return cliFailure("CLI_INPUT_UNAVAILABLE", `Unable to read input file '${path.resolve(inputPath)}'.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const parsed = parseAuthoringSpecJson(sourceText);
  if (!parsed.ok || parsed.value === undefined) return { ok: false, exitCode: 2, diagnostics: parsed.diagnostics };
  const normalized = normalizeAuthoringSpec(parsed.value);
  if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
    return { ok: false, exitCode: 2, diagnostics: normalized.diagnostics };
  }
  const compiled = compileWorld({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (!compiled.ok || compiled.executionPlan === undefined || compiled.executionPlanHash === undefined) {
    return { ok: false, exitCode: 2, diagnostics: compiled.diagnostics };
  }
  return {
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    executionPlan: compiled.executionPlan,
    executionPlanHash: compiled.executionPlanHash,
  };
}

function isFailure(value: PipelineSuccess | WorldkitCommandResult): value is WorldkitCommandResult {
  return "ok" in value;
}

export async function validateFile(inputPath: string): Promise<WorldkitCommandResult> {
  const pipeline = await loadPipeline(inputPath);
  if (isFailure(pipeline)) return pipeline;
  return {
    ok: true,
    exitCode: 0,
    diagnostics: [],
    normalizedWorldIrHash: pipeline.normalizedWorldIrHash,
    executionPlanHash: pipeline.executionPlanHash,
  };
}

async function writeAtomic(outputPath: string, bytes: string | Uint8Array): Promise<void> {
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

export async function buildFile(inputPath: string, outputPath: string): Promise<WorldkitCommandResult> {
  const absoluteInputPath = path.resolve(inputPath);
  const absoluteOutputPath = path.resolve(outputPath);
  if (absoluteInputPath === absoluteOutputPath) {
    return cliFailure("CLI_OUTPUT_OVERWRITES_INPUT", "Build output must not overwrite the AuthoringSpec input.");
  }
  const pipeline = await loadPipeline(absoluteInputPath);
  if (isFailure(pipeline)) return pipeline;
  const artifact = {
    kind: "worldkit-build-artifact",
    schemaVersion: 2,
    normalizedWorldIrHash: pipeline.normalizedWorldIrHash,
    executionPlanHash: pipeline.executionPlanHash,
    normalizedWorldIr: pipeline.normalizedWorldIr,
    executionPlan: pipeline.executionPlan,
  };
  try {
    await writeAtomic(absoluteOutputPath, `${stringifyCanonicalJson(artifact)}\n`);
  } catch (error) {
    return cliFailure("CLI_OUTPUT_WRITE_FAILED", `Unable to write build artifact '${absoluteOutputPath}'.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
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
  const absoluteSnapshotPath = options.snapshotPath === undefined ? undefined : path.resolve(options.snapshotPath);
  if (absoluteOutputPath === path.resolve(inputPath) || absoluteSnapshotPath === path.resolve(inputPath)) {
    return cliFailure("CLI_OUTPUT_OVERWRITES_INPUT", "Capture outputs must not overwrite the AuthoringSpec input.");
  }

  let server: WorldkitServerHandle | undefined;
  let browser: Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>> | undefined;
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
      return cliFailure("CLI_SERVER_START_FAILED", "Unable to start the Worldkit playground.", {
        cause: error instanceof Error ? error.message : String(error),
      });
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(() => window.__WORLDKIT__ !== undefined, undefined, { timeout: 30_000 });
    const snapshot = await page.evaluate(async (): Promise<WorldRuntimeSnapshotV2> => {
      const api = window.__WORLDKIT__;
      if (api === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      return api.ready();
    });
    await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await page.locator("canvas.world-canvas").screenshot({ path: temporaryScreenshotPath, type: "png" });
    await rename(temporaryScreenshotPath, absoluteOutputPath);
    if (absoluteSnapshotPath !== undefined) {
      await writeAtomic(absoluteSnapshotPath, `${stringifyCanonicalJson(snapshot)}\n`);
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
      ...(absoluteSnapshotPath === undefined ? {} : { snapshotPath: absoluteSnapshotPath }),
      url: server.url,
    };
  } catch (error) {
    return cliFailure("CLI_CAPTURE_FAILED", "Unable to capture the Canonical JSON world.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await rm(temporaryScreenshotPath, { force: true });
    await browser?.close();
    await server?.stop();
  }
}

function printResult(result: WorldkitCommandResult, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (result.ok) {
    const details = [result.outputPath, result.snapshotPath, result.normalizedWorldIrHash, result.executionPlanHash]
      .filter((value): value is string => value !== undefined)
      .join("\n");
    process.stdout.write(`ok${details.length === 0 ? "" : `\n${details}`}\n`);
    return;
  }
  for (const diagnostic of result.diagnostics) {
    process.stderr.write(`[${diagnostic.severity}] ${diagnostic.code} ${diagnostic.instancePath || "/"}: ${diagnostic.message}\n`);
  }
}

async function runUntilSignal(inputPath: string, port: number | undefined, json: boolean): Promise<number> {
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
    const result = cliFailure("CLI_SERVER_START_FAILED", "Unable to start the Worldkit playground.", {
      cause: error instanceof Error ? error.message : String(error),
    });
    printResult(result, json);
    return result.exitCode;
  }
  if (json) process.stdout.write(`${JSON.stringify({ ok: true, url: server.url, port: server.port })}\n`);
  else process.stdout.write(`Worldkit playground: ${server.url}\n`);
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

export async function main(arguments_: readonly string[] = process.argv.slice(2)): Promise<number> {
  let parsed: WorldkitArgs;
  try {
    parsed = parseWorldkitArgs(arguments_);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${HELP}`);
    return 1;
  }
  if (parsed.command === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (parsed.command === "run") return runUntilSignal(parsed.inputPath, parsed.port, parsed.json);
  const result = parsed.command === "validate"
    ? await validateFile(parsed.inputPath)
    : parsed.command === "build"
      ? await buildFile(parsed.inputPath, parsed.outputPath)
      : await captureFile(parsed.inputPath, parsed.outputPath, {
          ...(parsed.snapshotPath === undefined ? {} : { snapshotPath: parsed.snapshotPath }),
          ...(parsed.port === undefined ? {} : { port: parsed.port }),
        });
  printResult(result, parsed.json);
  return result.exitCode;
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
