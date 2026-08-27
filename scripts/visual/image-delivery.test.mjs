import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { importGeneratedImages } from "./import-generated-images.mjs";

const PNG = Buffer.from("89504e470d0a1a0a00000000", "hex");

test("imports fresh PNGs from the transcript session in generation order", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-image-delivery-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sessionId = "01a01e5d-037f-7e60-b089-810930ba33c3";
    const cache = path.join(codexHome, "generated_images", sessionId);
    const outputRoot = path.join(root, "outputs");
    const transcript = path.join(root, "transcript.log");
    const marker = path.join(root, "started");
    await mkdir(cache, { recursive: true });
    await mkdir(outputRoot, { recursive: true });
    await writeFile(transcript, `OpenAI Codex\nsession id: ${sessionId}\nWORLDKIT_IMAGESET_READY planner 2\n`);
    await writeFile(marker, "started");
    const now = Date.now();
    await utimes(marker, new Date(now - 5_000), new Date(now - 5_000));
    const first = path.join(cache, "exec-11111111-1111-1111-1111-111111111111.png");
    const second = path.join(cache, "exec-22222222-2222-2222-2222-222222222222.png");
    await writeFile(first, Buffer.concat([PNG, Buffer.from("first")]));
    await writeFile(second, Buffer.concat([PNG, Buffer.from("second")]));
    await utimes(first, new Date(now - 2_000), new Date(now - 2_000));
    await utimes(second, new Date(now - 1_000), new Date(now - 1_000));
    const worldTarget = path.join(outputRoot, "world-plan.png");
    const entryTarget = path.join(outputRoot, "entry-whitebox-target.png");

    const result = await importGeneratedImages({
      codexHome,
      transcript,
      stageStarted: marker,
      outputRoot,
      targets: [
        { logicalName: "world-plan", targetPath: worldTarget },
        { logicalName: "entry-whitebox-target", targetPath: entryTarget },
      ],
    });

    assert.equal(result.sessionId, sessionId);
    assert.equal((await readFile(worldTarget)).subarray(-5).toString(), "first");
    assert.equal((await readFile(entryTarget)).subarray(-6).toString(), "second");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects ambiguous extra generated images instead of guessing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-image-ambiguity-"));
  try {
    const codexHome = path.join(root, "codex-home");
    const sessionId = "01a01e5d-037f-7e60-b089-810930ba33c3";
    const cache = path.join(codexHome, "generated_images", sessionId);
    const outputRoot = path.join(root, "outputs");
    const transcript = path.join(root, "transcript.log");
    const marker = path.join(root, "started");
    await mkdir(cache, { recursive: true });
    await mkdir(outputRoot, { recursive: true });
    await writeFile(transcript, `session id: ${sessionId}\n`);
    await writeFile(marker, "started");
    const now = Date.now();
    await utimes(marker, new Date(now - 5_000), new Date(now - 5_000));
    for (const id of ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "33333333-3333-3333-3333-333333333333"]) {
      const image = path.join(cache, `exec-${id}.png`);
      await writeFile(image, PNG);
      await utimes(image, new Date(now - 1_000), new Date(now - 1_000));
    }

    await assert.rejects(
      importGeneratedImages({
        codexHome,
        transcript,
        stageStarted: marker,
        outputRoot,
        targets: [
          { logicalName: "world-plan", targetPath: path.join(outputRoot, "world-plan.png") },
          { logicalName: "entry-whitebox-target", targetPath: path.join(outputRoot, "entry-whitebox-target.png") },
        ],
      }),
      /Expected exactly 2 fresh generated PNGs.*found 3/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
