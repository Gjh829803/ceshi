import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("conforms Seedance video to the exact whitebox raster, fps, frame count, and audio contract", async (context) => {
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
    context.skip("ffmpeg is not installed");
    return;
  }
  const root = await mkdtemp(path.join(tmpdir(), "seedance25-conformance-"));
  try {
    const reference = path.join(root, "whitebox.mp4");
    const raw = path.join(root, "seedance-raw.mp4");
    const output = path.join(root, "seedance25.mp4");
    const referenceResult = spawnSync("ffmpeg", [
      "-y", "-v", "error", "-f", "lavfi",
      "-i", "color=c=white:s=1280x720:r=24:d=2",
      "-an", "-frames:v", "48", "-c:v", "libx264", "-pix_fmt", "yuv420p", reference,
    ], { encoding: "utf8" });
    assert.equal(referenceResult.status, 0, referenceResult.stderr);
    const rawResult = spawnSync("ffmpeg", [
      "-y", "-v", "error",
      "-f", "lavfi", "-i", "color=c=blue:s=640x360:r=24:d=2.3",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2.3",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", raw,
    ], { encoding: "utf8" });
    assert.equal(rawResult.status, 0, rawResult.stderr);

    const python = [
      "import importlib.util, json, pathlib, sys",
      "spec=importlib.util.spec_from_file_location('seedance_runner', sys.argv[1])",
      "module=importlib.util.module_from_spec(spec)",
      "spec.loader.exec_module(module)",
      "reference=module.probe_video(pathlib.Path(sys.argv[2]))",
      "result=module.conform_video(pathlib.Path(sys.argv[3]), pathlib.Path(sys.argv[4]), reference)",
      "print(json.dumps(result['output']))",
    ].join("\n");
    const conformed = spawnSync("python3", [
      "-c", python,
      path.resolve("scripts/visual/run-seedance25-reference-video.py"), reference, raw, output,
    ], { encoding: "utf8" });
    assert.equal(conformed.status, 0, conformed.stderr);
    const media = JSON.parse(conformed.stdout.trim());
    assert.deepEqual({
      width: media.width,
      height: media.height,
      fps: media.fps,
      frameCount: media.frameCount,
      hasAudio: media.hasAudio,
    }, {
      width: 1280,
      height: 720,
      fps: 24,
      frameCount: 48,
      hasAudio: true,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
