import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("composition workflow lifecycle", () => {
  it("refuses Visual Bible inputs when persisted reference composition evidence is untrusted", async () => {
    await expect(execFileAsync(
      "pnpm",
      [
        "exec",
        "tsx",
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
