import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { chromium } from "playwright";

import type {
  ExecutionPlanV1,
  WorldRuntimeSnapshotV1,
} from "@whitebox-world/runtime-contracts";

import { startWorldkitServer } from "./lib/worldkit-server";
import { main as worldkitMain } from "./worldkit";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const INPUT_PATH = path.join(REPOSITORY_ROOT, "examples/authoring/basic-world.json");
const INVALID_INPUT_PATH = path.join(REPOSITORY_ROOT, "examples/authoring/invalid-world.json");
const ARTIFACT_DIRECTORY = path.join(REPOSITORY_ROOT, "artifacts/examples/basic-world");
const BUILD_PATH = path.join(ARTIFACT_DIRECTORY, "world.normalized.json");
const SCREENSHOT_PATH = path.join(ARTIFACT_DIRECTORY, "world.png");
const SNAPSHOT_PATH = path.join(ARTIFACT_DIRECTORY, "snapshot.json");

interface BuildArtifactV1 {
  kind: "worldkit-build-artifact";
  schemaVersion: 1;
  normalizedWorldIrHash: string;
  executionPlanHash: string;
  executionPlan: ExecutionPlanV1;
}

function parseJson<T>(sourceText: string, label: string): T {
  try {
    return JSON.parse(sourceText) as T;
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
}

function inspectPng(bytes: Buffer): { width: number; height: number } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(bytes.length >= 24, "Captured PNG is too small to contain an IHDR chunk.");
  assert.ok(bytes.subarray(0, 8).equals(signature), "Captured file does not have a PNG signature.");
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR", "Captured PNG has no leading IHDR chunk.");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function runCliGates(): Promise<void> {
  assert.equal(
    await worldkitMain(["validate", INPUT_PATH, "--json"]),
    0,
    "worldkit validate must accept the representative world.",
  );
  assert.equal(
    await worldkitMain(["validate", INVALID_INPUT_PATH, "--json"]),
    2,
    "worldkit validate must reject unknown fields.",
  );
  assert.equal(
    await worldkitMain(["build", INPUT_PATH, "--output", BUILD_PATH, "--json"]),
    0,
    "worldkit build must emit the canonical build artifact.",
  );
  assert.equal(
    await worldkitMain([
      "capture",
      INPUT_PATH,
      "--output",
      SCREENSHOT_PATH,
      "--snapshot",
      SNAPSHOT_PATH,
      "--json",
    ]),
    0,
    "worldkit capture must emit a PNG and runtime snapshot.",
  );
}

async function verifyArtifacts(): Promise<{ dimensions: { width: number; height: number }; bodyCount: number }> {
  const artifact = parseJson<BuildArtifactV1>(await readFile(BUILD_PATH, "utf8"), "Build artifact");
  assert.equal(artifact.kind, "worldkit-build-artifact");
  assert.equal(artifact.schemaVersion, 1);
  assert.match(artifact.normalizedWorldIrHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(artifact.executionPlanHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(artifact.executionPlan.runtimeBackend, "babylon-havok");
  assert.equal(artifact.executionPlan.terrain.entityId, "terrain-main");
  assert.deepEqual(artifact.executionPlan.waters.map((water) => water.entityId), ["lake-main"]);
  assert.deepEqual(artifact.executionPlan.objects.map((object) => object.entityId), ["tower", "wall-east", "wall-west"]);
  assert.equal(artifact.executionPlan.subject.entityId, "player");
  assert.equal(artifact.executionPlan.camera.cameraEntityId, "camera-main");

  const snapshot = parseJson<WorldRuntimeSnapshotV1>(await readFile(SNAPSHOT_PATH, "utf8"), "Runtime snapshot");
  assert.equal(snapshot.runtimeBackend, "babylon-havok");
  assert.deepEqual(snapshot.physics, {
    backend: "havok",
    ready: true,
    fixedTimeStepSeconds: 1 / 60,
  });
  assert.equal(snapshot.subject.entityId, "player");
  assert.equal(snapshot.camera.entityId, "camera-main");
  assert.ok(snapshot.resources.bodies >= 4, "Terrain and all three collision objects must own Havok bodies.");
  assert.equal(snapshot.resources.terrainSamples, 65 * 65);

  const dimensions = inspectPng(await readFile(SCREENSHOT_PATH));
  assert.ok(dimensions.width >= 800 && dimensions.height >= 450, "Captured PNG dimensions are unexpectedly small.");
  return { dimensions, bodyCount: snapshot.resources.bodies };
}

async function verifyBrowserProtocolAndPhysics(): Promise<{
  wallStopPositionMeters: readonly [number, number, number];
  waterEntryPositionMeters: readonly [number, number, number];
}> {
  const server = await startWorldkitServer({ inputPath: INPUT_PATH });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(() => window.__WORLDKIT__ !== undefined, undefined, { timeout: 30_000 });
    const ready = await page.evaluate(async () => window.__WORLDKIT__!.ready());
    assert.equal(ready.runtimeBackend, "babylon-havok");
    assert.equal(ready.physics.backend, "havok");
    assert.equal(ready.physics.ready, true);

    const wallStop = await page.evaluate(async () => {
      const api = window.__WORLDKIT__!;
      api.setPaused(true);
      api.reset();
      return api.runFixedInput([{ actions: ["move-right"], ticks: 360 }]);
    });
    assert.ok(wallStop.subject.positionMeters[0] > 2, "The fixed input did not move the subject toward the east wall.");
    assert.ok(
      wallStop.subject.positionMeters[0] < 6.2,
      `The subject crossed the east wall at x=${wallStop.subject.positionMeters[0]}.`,
    );

    const waterEntry = await page.evaluate(async () => {
      const api = window.__WORLDKIT__!;
      api.reset();
      return api.runFixedInput([{ actions: ["move-forward"], ticks: 600 }]);
    });
    assert.ok(waterEntry.subject.positionMeters[2] < 5, "The fixed input did not move the subject toward the lake.");
    assert.equal(waterEntry.subject.movementMedium, "water", "The lake must deterministically activate water movement.");

    return {
      wallStopPositionMeters: wallStop.subject.positionMeters,
      waterEntryPositionMeters: waterEntry.subject.positionMeters,
    };
  } finally {
    await browser.close();
    await server.stop();
  }
}

async function run(): Promise<void> {
  await runCliGates();
  const artifacts = await verifyArtifacts();
  const physics = await verifyBrowserProtocolAndPhysics();
  process.stdout.write(`${JSON.stringify({
    ok: true,
    gates: [
      "strict-valid-input",
      "strict-invalid-input-rejection",
      "deterministic-build-artifact",
      "playwright-capture",
      "babylon-havok-runtime",
      "blocking-wall-collision",
      "water-medium-transition",
    ],
    screenshot: { path: SCREENSHOT_PATH, ...artifacts.dimensions },
    havokBodies: artifacts.bodyCount,
    ...physics,
  }, null, 2)}\n`);
}

try {
  await run();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
