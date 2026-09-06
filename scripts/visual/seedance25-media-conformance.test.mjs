import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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

// CF-17: pinned old 9e35ab53 used scale/pad/fps/tpad/trim and admitted an
// audio stream, not audible sound or semantic motion. Keep that technical
// contract; a successful normalization is not a visual-quality verdict.
for (const hasAudio of [true, false]) {
  test(`preserves old short portrait media policy with audio stream=${hasAudio}`, async (context) => {
    if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
      context.skip("ffmpeg is not installed");
      return;
    }
    const root = await mkdtemp(path.join(tmpdir(), "seedance25-old-policy-"));
    try {
      const raw = path.join(root, "raw.mp4");
      const output = path.join(root, "final.mp4");
      // Deliberately short, static, portrait, and (when present) silent audio.
      // The old runner normalizes these properties, not rejects them.
      const generated = spawnSync("ffmpeg", [
        "-y", "-v", "error", "-f", "lavfi",
        "-i", "color=c=blue:s=128x192:r=12:d=0.5",
        ...(hasAudio ? ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"] : ["-an"]),
        "-t", "0.5", "-c:v", "libx264", "-pix_fmt", "yuv420p",
        ...(hasAudio ? ["-c:a", "aac"] : []), raw,
      ], { encoding: "utf8", timeout: 30_000 });
      assert.equal(generated.status, 0, generated.stderr);
      const originalBytes = await readFile(raw);
      const python = [
        "import importlib.util, json, pathlib, sys",
        "spec=importlib.util.spec_from_file_location('seedance_runner', sys.argv[1])",
        "module=importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(module)",
        "reference={'width':1280,'height':720,'fps':24,'frameCount':48}",
        "result=module.conform_video(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]), reference)",
        "print(json.dumps(result))",
      ].join("\n");
      const conformed = spawnSync("python3", [
        "-c", python, path.resolve("scripts/visual/run-seedance25-reference-video.py"), raw, output,
      ], { encoding: "utf8", timeout: 60_000 });
      assert.deepEqual(await readFile(raw), originalBytes, "conformance must not edit its raw input");
      if (!hasAudio) {
        assert.notEqual(conformed.status, 0);
        assert.match(conformed.stderr, /Seedance output has no audio stream/);
        await assert.rejects(stat(output), { code: "ENOENT" });
        return;
      }
      assert.equal(conformed.status, 0, conformed.stderr);
      const result = JSON.parse(conformed.stdout.trim());
      assert.deepEqual(Object.keys(result).sort(), ["output", "source"]);
      assert.equal(result.source.width, 128);
      assert.equal(result.source.height, 192);
      assert.equal(result.source.fps, 12);
      assert.equal(result.source.frameCount, 6);
      assert.equal(result.source.hasAudio, true);
      assert.deepEqual({
        width: result.output.width, height: result.output.height,
        fps: result.output.fps, frameCount: result.output.frameCount,
        hasAudio: result.output.hasAudio,
      }, { width: 1280, height: 720, fps: 24, frameCount: 48, hasAudio: true });
      // Prove the actual old letterbox/clone behavior, not only final metadata.
      const decoded = spawnSync("ffmpeg", [
        "-v", "error", "-i", output, "-vf", "select=eq(n\\,0)+eq(n\\,47)",
        "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
      ], { maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
      assert.equal(decoded.status, 0, decoded.stderr.toString());
      const frameBytes = 1280 * 720 * 3;
      assert.equal(decoded.stdout.length, frameBytes * 2);
      for (const offset of [0, frameBytes]) {
        const left = offset + (360 * 1280 + 10) * 3;
        assert.ok(decoded.stdout.subarray(left, left + 3).every((value) => value < 12));
        const center = offset + (360 * 1280 + 640) * 3;
        assert.ok(decoded.stdout[center + 2] > 200);
        assert.ok(decoded.stdout[center] < 20 && decoded.stdout[center + 1] < 20);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
