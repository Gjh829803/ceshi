import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import {
  hashValidationReportV1,
  validateValidationReportV1,
  type Sha256HashV1,
} from "@whitebox-world/validation";
import { isPlainObject } from "lodash-es";

import {
  createControlCaptureValidationFixtureV1,
  rewriteControlCaptureFrameAndManifestHashesV1,
  rewriteControlCaptureTakeHashV1,
} from "./lib/control-capture-validation-fixture";
import { verifyControlCaptureFileV1 } from "./lib/validation-cli";

type ExpectedGateIdV1 =
  | "capture-bundle-integrity"
  | "capture-completeness"
  | "capture-ownership";

interface VerificationCaseResultV1 {
  readonly id: string;
  readonly status: "passed" | "failed";
  readonly validationReportHash: Sha256HashV1;
  readonly failedGateIds: readonly string[];
  readonly diagnosticCodes: readonly string[];
}

const SNAPSHOT_V4_ROOT_KEYS = [
  "kind",
  "resources",
  "runtime",
  "runtimeSessionId",
  "schemaVersion",
  "view",
  "world",
  "worldSessionId",
] as const;

const REMOVED_SNAPSHOT_V3_ROOT_KEYS = [
  "camera",
  "controlledEntityId",
  "controllersById",
  "physics",
  "ready",
  "runtimeBackend",
  "subjectStatesByEntityId",
  "tick",
] as const;

async function assertSnapshotTrackUsesV4(
  bundleDirectory: string,
): Promise<void> {
  const trackPath = path.join(
    bundleDirectory,
    "tracks/snapshots.ndjson",
  );
  const rows = (await readFile(trackPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
  assert.equal(rows.length, 2, "Snapshot track must contain both capture frames");

  rows.forEach((row, captureFrameIndex) => {
    assert.ok(isPlainObject(row), "Snapshot track row must be an object");
    const record = row as Readonly<Record<string, unknown>>;
    assert.deepEqual(
      Object.keys(record).sort(),
      ["captureFrameIndex", "simulationTick", "snapshot"],
      "Snapshot track row must keep the exact V1 envelope",
    );
    assert.equal(record.captureFrameIndex, captureFrameIndex);
    assert.ok(isPlainObject(record.snapshot), "Snapshot payload must be an object");
    const snapshot = record.snapshot as Readonly<Record<string, unknown>>;
    assert.deepEqual(
      Object.keys(snapshot).sort(),
      [...SNAPSHOT_V4_ROOT_KEYS].sort(),
      "Capture must publish the exact Runtime Snapshot V4 root envelope",
    );
    assert.equal(snapshot.kind, "worldkit-runtime-snapshot");
    assert.equal(snapshot.schemaVersion, 4);
    assert.equal(snapshot.runtimeSessionId, "validation-fixture-session");
    assert.equal(
      snapshot.worldSessionId,
      "validation-fixture-world-session",
    );
    for (const removedKey of REMOVED_SNAPSHOT_V3_ROOT_KEYS) {
      assert.equal(
        removedKey in snapshot,
        false,
        `Capture Snapshot V4 must not publish removed V3 field '${removedKey}'`,
      );
    }
    assert.ok(isPlainObject(snapshot.world), "Snapshot V4 world must be an object");
    const world = snapshot.world as Readonly<Record<string, unknown>>;
    assert.equal(
      world.simulationTick,
      record.simulationTick,
      "Snapshot V4 World Tick must match its Capture track row",
    );
    assert.ok(
      isPlainObject(world.gameplayInspection),
      "Snapshot V4 must publish Gameplay inspection state",
    );
  });
}

async function runCaseV1(
  parentDirectory: string,
  id: string,
  mutate: (bundleDirectory: string) => Promise<void>,
  expected: {
    readonly status: "passed" | "failed";
    readonly gateId?: ExpectedGateIdV1;
    readonly diagnosticCode?: string;
  },
): Promise<VerificationCaseResultV1> {
  const bundleDirectory = path.join(parentDirectory, id);
  const reportPath = path.join(parentDirectory, `${id}.validation-report.json`);
  await createControlCaptureValidationFixtureV1(bundleDirectory);
  await assertSnapshotTrackUsesV4(bundleDirectory);
  await mutate(bundleDirectory);
  const commandResult = await verifyControlCaptureFileV1(
    bundleDirectory,
    reportPath,
  );
  assert.ok(
    "validationStatus" in commandResult,
    `${id}: Validation CLI failed before producing a Report`,
  );
  const parsedReport: unknown = JSON.parse(await readFile(reportPath, "utf8"));
  const reportValidation = validateValidationReportV1(parsedReport);
  assert.equal(
    reportValidation.ok,
    true,
    `${id}: emitted Report failed strict canonical round-trip validation`,
  );
  if (!reportValidation.ok) {
    throw new Error(`${id}: unreachable invalid Validation Report`);
  }
  const report = reportValidation.value;
  const reportHash = hashValidationReportV1(report);
  assert.equal(
    commandResult.validationReportHash,
    reportHash,
    `${id}: CLI Report Hash differs from canonical round-trip Hash`,
  );
  assert.equal(report.status, expected.status, `${id}: unexpected Report status`);
  if (expected.gateId !== undefined) {
    assert.equal(
      report.gateResultsById[expected.gateId]?.status,
      "failed",
      `${id}: expected ${expected.gateId} to fail`,
    );
  }
  if (expected.diagnosticCode !== undefined) {
    assert.ok(
      report.diagnostics.some(({ code }) => code === expected.diagnosticCode),
      `${id}: expected Diagnostic ${expected.diagnosticCode}`,
    );
  }
  return {
    id,
    status: report.status as "passed" | "failed",
    validationReportHash: reportHash,
    failedGateIds: Object.values(report.gateResultsById)
      .filter(({ status }) => status === "failed")
      .map(({ id: gateId }) => gateId),
    diagnosticCodes: report.diagnostics.map(({ code }) => code),
  };
}

export async function verifyValidationCaptureV1(): Promise<{
  readonly ok: true;
  readonly caseResults: readonly VerificationCaseResultV1[];
}> {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "worldkit-verify-validation-"),
  );
  try {
    const caseResults = await Promise.all([
      runCaseV1(
        temporaryDirectory,
        "valid",
        async () => undefined,
        { status: "passed" },
      ),
      runCaseV1(
        temporaryDirectory,
        "missing-required-pass",
        async (bundleDirectory) => {
          await unlink(path.join(
            bundleDirectory,
            "frames/000000/world-normal.bin",
          ));
        },
        {
          status: "failed",
          gateId: "capture-completeness",
          diagnosticCode: "CAPTURE_REQUIRED_PASS_MISSING",
        },
      ),
      runCaseV1(
        temporaryDirectory,
        "invalid-linear-depth",
        async (bundleDirectory) => {
          const depthPath = path.join(
            bundleDirectory,
            "frames/000000/linear-depth-meters.bin",
          );
          const bytes = new Uint8Array(await readFile(depthPath));
          new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength,
          ).setFloat32(0, Number.NaN, true);
          await writeFile(depthPath, bytes);
          await rewriteControlCaptureFrameAndManifestHashesV1(
            bundleDirectory,
            0,
          );
        },
        {
          status: "failed",
          gateId: "capture-completeness",
          diagnosticCode: "CAPTURE_LINEAR_DEPTH_INVALID",
        },
      ),
      runCaseV1(
        temporaryDirectory,
        "mixed-take",
        async (bundleDirectory) => {
          await rewriteControlCaptureTakeHashV1(
            bundleDirectory,
            `sha256:${"d".repeat(64)}`,
          );
        },
        {
          status: "failed",
          gateId: "capture-ownership",
          diagnosticCode: "CAPTURE_TAKE_MISMATCH",
        },
      ),
      runCaseV1(
        temporaryDirectory,
        "damaged-file-hash",
        async (bundleDirectory) => {
          await writeFile(
            path.join(
              bundleDirectory,
              "frames/000001/neutral-color.png",
            ),
            new Uint8Array([1, 2, 3, 4, 5]),
          );
        },
        {
          status: "failed",
          gateId: "capture-bundle-integrity",
          diagnosticCode: "CAPTURE_FILE_HASH_MISMATCH",
        },
      ),
    ]);
    return { ok: true, caseResults };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const entryPath =
  process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  process.stdout.write(
    `${stringifyCanonicalJson(await verifyValidationCaptureV1())}\n`,
  );
}
