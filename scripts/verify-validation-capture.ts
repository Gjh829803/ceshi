import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import type { Sha256HashV1 } from "@whitebox-world/validation";

import { createControlCaptureValidationReportV1 } from "./lib/control-capture-validation";
import {
  createControlCaptureValidationFixtureV1,
  rewriteControlCaptureFrameAndManifestHashesV1,
  rewriteControlCaptureTakeHashV1,
} from "./lib/control-capture-validation-fixture";

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
  await createControlCaptureValidationFixtureV1(bundleDirectory);
  await mutate(bundleDirectory);
  const { report, reportHash } =
    await createControlCaptureValidationReportV1(bundleDirectory);
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
