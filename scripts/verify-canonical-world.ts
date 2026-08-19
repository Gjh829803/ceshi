import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { chromium } from "playwright";

import type {
  ExecutionPlanV3,
  WorldRuntimeSnapshotV3,
} from "@whitebox-world/runtime-contracts";
import type { NormalizedWorldIRV2 } from "@whitebox-world/authoring";

import { startWorldkitServer } from "./lib/worldkit-server";
import { main as worldkitMain } from "./worldkit";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const INPUT_PATH = path.join(REPOSITORY_ROOT, "examples/authoring/multi-subject-world.json");
const INVALID_INPUT_PATH = path.join(REPOSITORY_ROOT, "examples/authoring/invalid-world.json");
const ARTIFACT_DIRECTORY = path.join(REPOSITORY_ROOT, "artifacts/examples/multi-subject-world");
const BUILD_PATH = path.join(ARTIFACT_DIRECTORY, "world.normalized.json");
const SCREENSHOT_PATH = path.join(ARTIFACT_DIRECTORY, "world.png");
const SNAPSHOT_PATH = path.join(ARTIFACT_DIRECTORY, "snapshot.json");

interface WorldBuildArtifactV3 {
  kind: "worldkit-build-artifact";
  schemaVersion: 3;
  normalizedWorldIrHash: string;
  executionPlanHash: string;
  normalizedWorldIr: NormalizedWorldIRV2;
  executionPlan: ExecutionPlanV3;
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
    "worldkit validate must accept the representative multi-subject world.",
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
  const firstBuildBytes = await readFile(BUILD_PATH, "utf8");
  assert.equal(
    await worldkitMain(["build", INPUT_PATH, "--output", BUILD_PATH, "--json"]),
    0,
    "repeated worldkit build must succeed.",
  );
  assert.equal(
    await readFile(BUILD_PATH, "utf8"),
    firstBuildBytes,
    "Repeated builds of the same input must be byte-identical.",
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
    "worldkit capture must emit a PNG and plural runtime snapshot.",
  );
}

async function verifyArtifacts(): Promise<{ dimensions: { width: number; height: number }; bodyCount: number }> {
  const artifact = parseJson<WorldBuildArtifactV3>(await readFile(BUILD_PATH, "utf8"), "Build artifact");
  assert.equal(artifact.kind, "worldkit-build-artifact");
  assert.equal(artifact.schemaVersion, 3);
  assert.match(artifact.normalizedWorldIrHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(artifact.executionPlanHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(artifact.normalizedWorldIr.schemaVersion, 2);
  assert.equal(artifact.executionPlan.schemaVersion, 3);
  assert.equal(artifact.executionPlan.runtimeBackend, "babylon-havok");
  assert.equal(artifact.executionPlan.terrain.entityId, "terrain-main");
  assert.deepEqual(artifact.executionPlan.waters.map((water) => water.entityId), ["lake-main"]);
  assert.deepEqual(artifact.executionPlan.objects.map((object) => object.entityId), ["tower", "wall-east", "wall-west"]);
  assert.equal(artifact.executionPlan.controlledEntityId, "player");
  assert.deepEqual(artifact.executionPlan.subjects.map((subject) => subject.entityId), ["animal", "player"]);
  assert.equal(artifact.executionPlan.camera.cameraEntityId, "camera-main");

  const snapshot = parseJson<WorldRuntimeSnapshotV3>(await readFile(SNAPSHOT_PATH, "utf8"), "Runtime snapshot");
  assert.equal(snapshot.schemaVersion, 3);
  assert.equal(snapshot.runtimeBackend, "babylon-havok");
  assert.deepEqual(snapshot.physics, {
    backend: "havok",
    ready: true,
    fixedTimeStepSeconds: 1 / 60,
  });
  assert.equal(snapshot.controlledEntityId, "player");
  assert.deepEqual(Object.keys(snapshot.subjectStatesByEntityId).sort(), ["animal", "player"]);
  assert.equal(snapshot.controllersById["controller-primary"]?.controlledEntityId, "player");
  assert.equal(snapshot.camera.entityId, "camera-main");
  assert.ok(snapshot.resources.bodies >= 6, "Terrain, three static objects, and two Subjects must own Havok bodies.");
  assert.equal(snapshot.resources.terrainSamples, 65 * 65);

  const dimensions = inspectPng(await readFile(SCREENSHOT_PATH));
  assert.ok(dimensions.width >= 800 && dimensions.height >= 450, "Captured PNG dimensions are unexpectedly small.");
  return { dimensions, bodyCount: snapshot.resources.bodies };
}

async function verifyBrowserProtocolAndPhysics(): Promise<{
  wallStopPositionMeters: readonly [number, number, number];
  waterEntryPositionMeters: readonly [number, number, number];
  animalMovePositionMeters: readonly [number, number, number];
}> {
  const server = await startWorldkitServer({ inputPath: INPUT_PATH });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(() => window.__WORLDKIT__ !== undefined, undefined, { timeout: 30_000 });
    assert.equal(await page.evaluate(() => window.__WORLDKIT__!.version), 3);
    const ready = await page.evaluate(async () => window.__WORLDKIT__!.ready());
    assert.equal(ready.schemaVersion, 3);
    assert.equal(ready.runtimeBackend, "babylon-havok");
    assert.equal(ready.physics.backend, "havok");
    assert.equal(ready.physics.ready, true);
    assert.equal(ready.controlledEntityId, "player");
    assert.deepEqual(Object.keys(ready.subjectStatesByEntityId).sort(), ["animal", "player"]);

    const wallStop = await page.evaluate(async () => {
      const api = window.__WORLDKIT__!;
      api.setPaused(true);
      api.reset();
      return api.runFixedInput([{ actions: ["move-right"], ticks: 360 }]);
    });
    const wallStopPlayer = wallStop.subjectStatesByEntityId.player!;
    assert.ok(wallStopPlayer.positionMetersXYZ[0] > 2, "Fixed input did not move player toward the east wall.");
    assert.ok(
      wallStopPlayer.positionMetersXYZ[0] < 6.2,
      `Player crossed the east wall at x=${wallStopPlayer.positionMetersXYZ[0]}.`,
    );

    const waterEntry = await page.evaluate(async () => {
      const api = window.__WORLDKIT__!;
      api.reset();
      return api.runFixedInput([{ actions: ["move-forward"], ticks: 600 }]);
    });
    const waterEntryPlayer = waterEntry.subjectStatesByEntityId.player!;
    assert.ok(waterEntryPlayer.positionMetersXYZ[2] < 5, "Fixed input did not move player toward the lake.");
    assert.equal(waterEntryPlayer.movementMedium, "water", "The lake must deterministically activate water movement.");

    const beforeControlSwitch = await page.evaluate(() => window.__WORLDKIT__!.reset());
    const receipt = await page.evaluate(() => window.__WORLDKIT__!.bindControl({
      controllerId: "controller-primary",
      expectedControlledEntityId: "player",
      controlledEntityId: "animal",
    }));
    assert.equal(receipt.status, "committed");
    assert.equal(receipt.controlledEntityId, "animal");
    const animalMove = await page.evaluate(() => window.__WORLDKIT__!.runFixedInput([
      { actions: ["move-right"], ticks: 120 },
    ]));
    assert.equal(animalMove.controlledEntityId, "animal");
    assert.equal(animalMove.camera.targetEntityId, "animal");
    assert.ok(
      animalMove.subjectStatesByEntityId.animal!.positionMetersXYZ[0] >
        beforeControlSwitch.subjectStatesByEntityId.animal!.positionMetersXYZ[0],
      "The committed animal did not move.",
    );
    assert.deepEqual(
      animalMove.subjectStatesByEntityId.player!.positionMetersXYZ,
      beforeControlSwitch.subjectStatesByEntityId.player!.positionMetersXYZ,
      "The uncontrolled player moved during animal input.",
    );

    const reset = await page.evaluate(() => window.__WORLDKIT__!.reset());
    assert.equal(reset.controlledEntityId, "player");
    assert.equal(reset.camera.targetEntityId, "player");
    assert.deepEqual(reset.subjectStatesByEntityId, ready.subjectStatesByEntityId);

    return {
      wallStopPositionMeters: wallStopPlayer.positionMetersXYZ,
      waterEntryPositionMeters: waterEntryPlayer.positionMetersXYZ,
      animalMovePositionMeters: animalMove.subjectStatesByEntityId.animal!.positionMetersXYZ,
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
      "deterministic-v3-build-artifact",
      "playwright-capture",
      "browser-protocol-v3",
      "babylon-havok-runtime",
      "multi-subject-visuals",
      "blocking-wall-collision",
      "water-medium-transition",
      "atomic-control-switch",
      "deterministic-reset",
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
