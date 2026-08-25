import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("writes per-item prompts and isolated reference lists", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lwdp-manifest-"));
  try {
    const firstPrompt = path.join(root, "first.txt");
    const secondPrompt = path.join(root, "second.txt");
    const output = path.join(root, "manifest.json");
    await Promise.all([
      writeFile(firstPrompt, "first prompt"),
      writeFile(secondPrompt, "second prompt"),
    ]);
    const result = spawnSync(process.execPath, [
      "scripts/write-lwdp-t2i-manifest.mjs",
      "--output", output,
      "--item", `first-item::${firstPrompt}::横图`,
      "--item", `second-item::${secondPrompt}::方图`,
      "--reference", `first-item::${firstPrompt}::structure::first-ref`,
    ], { cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(await readFile(output, "utf8"));
    assert.equal(manifest.items[0].prompt, "first prompt");
    assert.equal(manifest.items[0].referenceImages.length, 1);
    assert.equal(manifest.items[1].referenceImages.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
