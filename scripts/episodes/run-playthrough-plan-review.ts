import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { captureDeterministicPlaythrough } from "../lib/deterministic-playthrough-capture";
import { launchChromiumWithSystemFallback } from "../lib/playwright-browser-launch";

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  const sceneId = option(arguments_, "--scene-id");
  const origin = option(arguments_, "--origin");
  const planPath = path.resolve(option(arguments_, "--plan"));
  const output = path.resolve(option(arguments_, "--output"));
  const playPath = arguments_.includes("--play-path")
    ? option(arguments_, "--play-path")
    : "/play";
  const segmentIndex = arguments_.includes("--segment-index")
    ? Number(option(arguments_, "--segment-index"))
    : 0;
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex > 3) {
    throw new Error("--segment-index must be 0-3.");
  }
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  await mkdir(output, { recursive: true });
  const segmentId = `segment-${String(segmentIndex).padStart(2, "0")}`;
  const videoPath = path.join(output, `${segmentId}-review.mp4`);
  const firstFramePath = path.join(output, `${segmentId}-first-frame.png`);
  const tracePath = path.join(output, `${segmentId}-review-inputs.json`);
  const browser = await launchChromiumWithSystemFallback();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  try {
    const url = new URL(origin);
    url.pathname = playPath;
    url.searchParams.set("authoring", "1");
    url.searchParams.set("world", sceneId);
    await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForFunction(
      () => window.__WORLDKIT__ !== undefined ||
        document.documentElement.dataset.worldkitStatus === "error",
      undefined,
      { timeout: 120_000 },
    );
    await page.evaluate(async () => {
      if (!window.__WORLDKIT__) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      await window.__WORLDKIT__.ready();
    });
    await page.locator("canvas").first().focus();
    const capture = await captureDeterministicPlaythrough({
      page,
      plan,
      outputPath: videoPath,
      executionStartSeconds: segmentIndex * 31,
      frameCount: 720,
      firstFramePath,
      progressLabel: "WORLDKIT_PLAYTHROUGH_REVIEW_PROGRESS",
    });
    await writeFile(tracePath, `${JSON.stringify({
      kind: "worldkit-playthrough-plan-review",
      schemaVersion: 2,
      sceneId,
      segmentIndex,
      captureMode: capture.captureMode,
      captureFrameRate: capture.captureFrameRate,
      frameCount: capture.frameCount,
      events: capture.events,
      telemetrySamples: capture.telemetrySamples,
    }, null, 2)}\n`, "utf8");
    process.stdout.write(`WORLDKIT_PLAYTHROUGH_REVIEW_READY ${videoPath}\n`);
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
