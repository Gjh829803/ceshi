import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createOwnedNativePackageFixtureV1,
  type OwnedNativePackageFixtureV1,
} from "./owned-native-package-fixture.js";

const BUILD_SHELL_ORIGIN = "http://127.0.0.1:5174";
const BUILD_RUNTIME_ORIGIN = "http://127.0.0.1:5175";

export interface NativeScenePlaygroundBuildArgumentsV1 {
  readonly fixtureDirectoryPath: string;
}

export interface BuildNativeScenePlaygroundInputV1 {
  readonly repositoryRootPath: string;
  readonly fixtureDirectoryPath: string;
}

class NativeSceneBuildInterruptedErrorV1 extends Error {
  readonly name = "NativeSceneBuildInterruptedErrorV1";
  readonly exitCode: number;

  constructor(readonly signal: "SIGINT" | "SIGTERM") {
    super(`WORLDKIT_NATIVE_SCENE_BUILD_INTERRUPTED: ${signal}`);
    this.exitCode = signal === "SIGINT" ? 130 : 143;
  }
}

function usage(): never {
  throw new Error(
    "WORLDKIT_NATIVE_SCENE_BUILD_USAGE: expected --fixture <package-directory>",
  );
}

export function parseNativeScenePlaygroundBuildArgumentsV1(
  arguments_: readonly string[],
): NativeScenePlaygroundBuildArgumentsV1 {
  if (
    arguments_.length !== 2 ||
    arguments_[0] !== "--fixture" ||
    arguments_[1] === undefined ||
    arguments_[1].length === 0 ||
    arguments_[1].trim() !== arguments_[1]
  ) usage();
  return Object.freeze({ fixtureDirectoryPath: arguments_[1] });
}

function signalOwnedChild(
  child: ChildProcess,
  signal: NodeJS.Signals,
): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ESRCH"
      ) {
        child.kill(signal);
        return;
      }
    }
  }
  child.kill(signal);
}

async function waitForChild(
  child: ChildProcess,
): Promise<Readonly<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}>> {
  return new Promise((resolve) => {
    let processError: Error | undefined;
    child.once("error", (error) => {
      processError = error;
    });
    child.once("close", (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        ...(processError === undefined ? {} : { error: processError }),
      });
    });
  });
}

export async function buildNativeScenePlaygroundV1(
  input: BuildNativeScenePlaygroundInputV1,
): Promise<void> {
  const repositoryRootPath = path.resolve(input.repositoryRootPath);
  const applicationRootPath = path.join(
    repositoryRootPath,
    "apps/native-scene-playground",
  );
  const configPath = path.join(applicationRootPath, "vite.config.ts");
  const viteCliPath = path.join(
    repositoryRootPath,
    "node_modules/vite/bin/vite.js",
  );
  let interruption: NativeSceneBuildInterruptedErrorV1 | undefined;
  let activeChild: ChildProcess | undefined;
  let ownedFixture: OwnedNativePackageFixtureV1 | undefined;
  const stagingAbortController = new AbortController();
  const interrupt = (signal: "SIGINT" | "SIGTERM"): void => {
    interruption ??= new NativeSceneBuildInterruptedErrorV1(signal);
    if (!stagingAbortController.signal.aborted) {
      stagingAbortController.abort(interruption);
    }
    if (activeChild !== undefined) signalOwnedChild(activeChild, signal);
  };
  const onSigint = (): void => interrupt("SIGINT");
  const onSigterm = (): void => interrupt("SIGTERM");
  const throwIfInterrupted = (): void => {
    if (interruption !== undefined) throw interruption;
  };
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    throwIfInterrupted();
    ownedFixture = await createOwnedNativePackageFixtureV1({
      fixtureDirectoryPath: input.fixtureDirectoryPath,
      signal: stagingAbortController.signal,
    });
    throwIfInterrupted();

    activeChild = spawn(
      process.execPath,
      [
        viteCliPath,
        "build",
        "--config",
        configPath,
        "--configLoader",
        "runner",
      ],
      {
        cwd: applicationRootPath,
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          WORLDKIT_NATIVE_PACKAGE_PATH: ownedFixture.packageDirectoryPath,
          WORLDKIT_AUTHORING_SERVER_NONCE: randomUUID(),
          WORLDKIT_NATIVE_SERVER_ROLE: "shell",
          WORLDKIT_HOSTED_SHELL_ORIGIN: BUILD_SHELL_ORIGIN,
          WORLDKIT_HOSTED_RUNTIME_ORIGIN: BUILD_RUNTIME_ORIGIN,
        },
        stdio: "inherit",
      },
    );
    const outcome = await waitForChild(activeChild);
    activeChild = undefined;
    throwIfInterrupted();
    if (
      outcome.error !== undefined ||
      outcome.exitCode !== 0 ||
      outcome.signal !== null
    ) {
      const detail = outcome.error?.message ??
        (outcome.signal === null
          ? `exit ${String(outcome.exitCode)}`
          : `signal ${outcome.signal}`);
      throw new Error(`WORLDKIT_NATIVE_SCENE_BUILD_FAILED: ${detail}`);
    }
  } finally {
    if (
      activeChild !== undefined &&
      activeChild.exitCode === null &&
      activeChild.signalCode === null
    ) {
      signalOwnedChild(activeChild, "SIGKILL");
      await waitForChild(activeChild);
      activeChild = undefined;
    }
    await ownedFixture?.dispose();
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}

async function main(): Promise<void> {
  const repositoryRootPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const arguments_ = parseNativeScenePlaygroundBuildArgumentsV1(
    process.argv.slice(2),
  );
  await buildNativeScenePlaygroundV1({
    repositoryRootPath,
    fixtureDirectoryPath: path.resolve(
      repositoryRootPath,
      arguments_.fixtureDirectoryPath,
    ),
  });
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = error instanceof NativeSceneBuildInterruptedErrorV1
      ? error.exitCode
      : 1;
  });
}
