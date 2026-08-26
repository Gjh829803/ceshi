import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildModularSubjectRuntimeBundleOutputs,
  canonicalizeModularSubjectRuntimeBundleOutputBytes,
} from "./modular-subject-runtime-bundles";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..");

describe("modular Subject Runtime Bundle publication", () => {
  it("builds the only two active versioned Runtime assets from modular packages", async () => {
    const outputs = await buildModularSubjectRuntimeBundleOutputs({
      repositoryRoot: REPOSITORY_ROOT,
    });

    expect(outputs.map((output) => output.relativePath)).toEqual([
      "apps/playground/public/subject-assets/humanoid/g-bot/v2/g-bot.glb",
      "apps/playground/public/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
      "assets/subjects/runtime-bundles/seedleap/g-bot/v1/runtime-bundle.manifest.json",
      "assets/subjects/runtime-bundles/seedleap/golden-humanoid/v1/runtime-bundle.manifest.json",
    ]);
    for (const output of outputs) {
      expect(output.bytes.byteLength).toBeGreaterThan(0);
      const actual = await readFile(path.join(REPOSITORY_ROOT, output.relativePath));
      expect(Buffer.compare(
        canonicalizeModularSubjectRuntimeBundleOutputBytes(
          output.relativePath,
          actual,
        ),
        Buffer.from(output.bytes),
      )).toBe(0);
    }
  });

  it("canonicalizes only text Manifest line endings", () => {
    expect([
      ...canonicalizeModularSubjectRuntimeBundleOutputBytes(
        "assets/subjects/runtime-bundles/seedleap/g-bot/v1/runtime-bundle.manifest.json",
        Buffer.from("{\r\n  \"kind\": \"bundle\"\r\n}\r\n"),
      ),
    ]).toEqual([...Buffer.from("{\n  \"kind\": \"bundle\"\n}\n")]);
    expect([
      ...canonicalizeModularSubjectRuntimeBundleOutputBytes(
        "apps/playground/public/subject-assets/humanoid/g-bot/v2/g-bot.glb",
        Uint8Array.from([13, 10]),
      ),
    ]).toEqual([13, 10]);
  });
});
