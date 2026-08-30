import path from "node:path";
import { pathToFileURL } from "node:url";

import type { BlockWorldCheckReportV2 } from "@whitebox-world/block-world";

import {
  checkBlockWorldModuleV2,
  loadBlockWorldModuleV2,
} from "../lib/block-world-module.js";

export { checkBlockWorldModuleV2, loadBlockWorldModuleV2 };

export interface BlockWorldCliIoV2 {
  readonly writeStdout: (value: string) => void;
  readonly writeStderr: (value: string) => void;
}

function requiredArgument(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`BLOCK_WORLD_CLI_ARGUMENT_REQUIRED: ${name}`);
  }
  return value;
}

export async function runBlockWorldCliV2(
  args: readonly string[],
  io: BlockWorldCliIoV2 = {
    writeStdout: (value) => process.stdout.write(value),
    writeStderr: (value) => process.stderr.write(value),
  },
): Promise<0 | 1 | 2> {
  try {
    const modulePath = requiredArgument(args, "--world");
    const report: BlockWorldCheckReportV2 = await checkBlockWorldModuleV2(modulePath);
    io.writeStdout(`${JSON.stringify(report)}\n`);
    return report.status === "passed" ? 0 : 2;
  } catch (error) {
    io.writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runBlockWorldCliV2(process.argv.slice(2));
}
