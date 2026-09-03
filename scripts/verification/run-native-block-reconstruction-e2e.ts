import { fileURLToPath } from "node:url";
import path from "node:path";

import { stringifyCanonicalJson } from "@whitebox-world/protocol";

import { createHostedNativePlayabilityLaunchPortV1 } from
  "../reconstruction/hosted-playability.js";
import {
  NativeBlockReconstructionVerificationClosedErrorV1,
  verifyNativeBlockReconstructionE2EV1,
} from "./verify-native-block-reconstruction-e2e.js";

interface NativeBlockReconstructionVerifierArgumentsV1 {
  readonly runDirectoryPath: string;
  readonly finalDirectoryPath?: string;
}

function usageError(message: string): never {
  throw new Error(
    `${message}\nUsage: pnpm verify:native-block-reconstruction-e2e -- --run <run-directory> [--final <final-directory>]`,
  );
}

export function parseNativeBlockReconstructionVerifierArgumentsV1(
  arguments_: readonly string[],
): NativeBlockReconstructionVerifierArgumentsV1 {
  const normalizedArguments = arguments_[0] === "--"
    ? arguments_.slice(1)
    : arguments_;
  let runDirectoryPath: string | undefined;
  let finalDirectoryPath: string | undefined;
  for (let index = 0; index < normalizedArguments.length; index += 1) {
    const argument = normalizedArguments[index];
    const value = normalizedArguments[index + 1];
    if (argument !== "--run" && argument !== "--final") {
      usageError(`Unknown option '${argument ?? ""}'.`);
    }
    if (value === undefined || value.startsWith("--")) {
      usageError(`${argument} requires a directory path.`);
    }
    if (argument === "--run") {
      if (runDirectoryPath !== undefined) usageError("--run may appear only once.");
      runDirectoryPath = value;
    } else {
      if (finalDirectoryPath !== undefined) {
        usageError("--final may appear only once.");
      }
      finalDirectoryPath = value;
    }
    index += 1;
  }
  if (runDirectoryPath === undefined) {
    usageError("--run <run-directory> is required.");
  }
  return Object.freeze({
    runDirectoryPath: path.resolve(runDirectoryPath),
    ...(finalDirectoryPath === undefined
      ? {}
      : { finalDirectoryPath: path.resolve(finalDirectoryPath) }),
  });
}

export async function main(
  arguments_: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const parsed = parseNativeBlockReconstructionVerifierArgumentsV1(arguments_);
  try {
    const verification = await verifyNativeBlockReconstructionE2EV1({
      candidate: parsed.finalDirectoryPath === undefined
        ? {
          kind: "run",
          runDirectoryPath: parsed.runDirectoryPath,
        }
        : {
          kind: "final",
          runDirectoryPath: parsed.runDirectoryPath,
          finalDirectoryPath: parsed.finalDirectoryPath,
        },
      playability: createHostedNativePlayabilityLaunchPortV1(),
    });
    process.stdout.write(`${stringifyCanonicalJson(verification)}\n`);
  } catch (error) {
    const result = error instanceof
        NativeBlockReconstructionVerificationClosedErrorV1
      ? Object.freeze({
        outcome: "closed" as const,
        diagnosticCodes: error.diagnosticCodes,
        cleanupOutcome: error.cleanupOutcome,
      })
      : Object.freeze({
        outcome: "closed" as const,
        diagnosticCodes: Object.freeze([
          "NBR70_VERIFICATION_FAILED",
        ]),
        cleanupOutcome: "not-started" as const,
      });
    process.stdout.write(`${stringifyCanonicalJson(result)}\n`);
    process.exitCode = 2;
  }
}

const entryPath = process.argv[1] === undefined
  ? ""
  : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  });
}
