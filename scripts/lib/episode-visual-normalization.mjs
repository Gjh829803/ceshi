import { spawn } from "node:child_process";
import { readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

const PNG_SIGNATURE = "89504e470d0a1a0a";

export async function readPngSize(filePath) {
  const bytes = await readFile(filePath);
  if (bytes.length < 2_000 || bytes.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
    throw new Error(`Invalid PNG: ${filePath}`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code ?? "none"} signal=${signal ?? "none"}\n${stderr}`));
    });
  });
}

export async function normalizeEpisodePng(filePath, expected = { width: 1280, height: 720 }) {
  const source = await readPngSize(filePath);
  if (source.width === expected.width && source.height === expected.height) {
    return { ...source, normalized: false };
  }
  const sourceAspect = source.width / source.height;
  const expectedAspect = expected.width / expected.height;
  const relativeAspectError = Math.abs(sourceAspect - expectedAspect) / expectedAspect;
  if (relativeAspectError > 0.01) {
    throw new Error(
      `Episode image must be approximately ${expected.width}:${expected.height} before normalization: ` +
      `${filePath} is ${source.width}x${source.height}`,
    );
  }
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.normalized.png`,
  );
  try {
    await run("ffmpeg", [
      "-y", "-v", "error", "-i", filePath,
      "-vf", `scale=${expected.width}:${expected.height}:flags=lanczos,setsar=1`,
      "-frames:v", "1", temporary,
    ]);
    const normalized = await readPngSize(temporary);
    if (normalized.width !== expected.width || normalized.height !== expected.height) {
      throw new Error(
        `Episode image normalization failed: ${temporary} is ${normalized.width}x${normalized.height}`,
      );
    }
    await rename(temporary, filePath);
    return { ...normalized, normalized: true, sourceWidth: source.width, sourceHeight: source.height };
  } finally {
    await rm(temporary, { force: true });
  }
}
