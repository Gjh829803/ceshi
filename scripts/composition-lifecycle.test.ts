import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tsxCliPath = createRequire(import.meta.url).resolve("tsx/cli");

describe("composition workflow lifecycle", () => {
  it("refuses Visual Bible inputs when persisted reference composition evidence is untrusted", async () => {
    await expect(execFileAsync(
      process.execPath,
      [
        tsxCliPath,
        "scripts/validate-visual-package.ts",
        "--scene",
        "world-08170639-54db",
        "--mode",
        "inputs",
      ],
      { cwd: process.cwd() },
    )).rejects.toMatchObject({
      stderr: expect.stringMatching(/COMPOSITION_REPORT_(?:FAILED|STALE)/),
    });
  }, 30_000);
});
