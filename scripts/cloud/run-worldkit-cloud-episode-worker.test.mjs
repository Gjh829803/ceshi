import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { materializeEpisodeRuntimeConfig } from
  "./run-worldkit-cloud-episode-worker.mjs";

test("cloud Episode worker defaults to the platform fetch implementation", async () => {
  const source = await readFile(new URL("./run-worldkit-cloud-episode-worker.mjs", import.meta.url), "utf8");
  assert.match(source, /fetchImplementation = fetch,/);
  assert.match(source, /request\.styleVariantMode === "ten-style" \? "1" : "0"/);
  assert.match(source, /attempt-\$\{cloudStageAttempt\}/);
});

test("materializes Episode provider Secrets only inside the ephemeral project workspace", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "worldkit-episode-runtime-"));
  const repoRoot = path.join(root, "repo");
  const secretRoot = path.join(root, "secret");
  await mkdir(secretRoot, { recursive: true });
  for (const fileName of [
    "infinite-canvas.key",
    "gemini.env",
    "google-service-account.json",
    "aws-credentials",
    "aws-config",
  ]) await writeFile(path.join(secretRoot, fileName), `fake-${fileName}\n`);
  try {
    const runtimeRoot = await materializeEpisodeRuntimeConfig({
      repoRoot,
      secretRoot,
      cloudConfig: {
        baseUrl: "https://lwdp.example.test",
        token: "fake-lwdp-token",
        userId: "worldkit-test",
      },
    });
    assert.equal(runtimeRoot, path.join(repoRoot, ".codex-tmp/runtime-config"));
    assert.match(await readFile(path.join(runtimeRoot, "lwdp.env"), "utf8"),
      /LWDP_GENERATION_API_TOKEN=fake-lwdp-token/);
    assert.equal((await stat(path.join(runtimeRoot, "infinite-canvas.key"))).mode & 0o777, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
