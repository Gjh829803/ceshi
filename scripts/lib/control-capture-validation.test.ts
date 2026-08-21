import {
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  validateValidationReportV1,
} from "@whitebox-world/validation";
import {
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";

import { validateControlCaptureBundleV1 } from "./control-capture-bundle";
import {
  createControlCaptureValidationFixtureV1,
  rewriteControlCaptureFrameAndManifestHashesV1,
  rewriteControlCaptureIntegrityV1,
  snapshotControlCaptureFileHashesV1,
} from "./control-capture-validation-fixture";
import { createControlCaptureValidationReportV1 } from "./control-capture-validation";

const temporaryDirectories: string[] = [];

async function createBundle(): Promise<string> {
  const parent = await mkdtemp(path.join(tmpdir(), "worldkit-validation-"));
  temporaryDirectories.push(parent);
  const bundleDirectory = path.join(parent, "capture-bundle");
  await createControlCaptureValidationFixtureV1(bundleDirectory);
  return bundleDirectory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("Control Capture Validation adapter", () => {
  it("emits a strict passed report without modifying the Bundle", async () => {
    const bundleDirectory = await createBundle();
    const beforeHashes = await snapshotControlCaptureFileHashesV1(bundleDirectory);

    const result = await createControlCaptureValidationReportV1(bundleDirectory);

    expect(result.report.status).toBe("passed");
    expect(result.reportHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(validateValidationReportV1(result.report)).toMatchObject({ ok: true });
    expect(Object.values(result.report.gateResultsById).map(({ status }) => status))
      .toEqual(["passed", "passed", "passed"]);
    expect(await snapshotControlCaptureFileHashesV1(bundleDirectory)).toEqual(
      beforeHashes,
    );
  });

  it("maps a missing Required Pass only to Capture Completeness", async () => {
    const bundleDirectory = await createBundle();
    await unlink(path.join(
      bundleDirectory,
      "frames/000000/world-normal.bin",
    ));

    const { report } = await createControlCaptureValidationReportV1(
      bundleDirectory,
    );

    expect(report.status).toBe("failed");
    expect(report.gateResultsById["capture-completeness"]?.status).toBe(
      "failed",
    );
    expect(report.gateResultsById["capture-bundle-integrity"]?.status).toBe(
      "passed",
    );
    expect(report.gateResultsById["capture-ownership"]?.status).toBe("passed");
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CAPTURE_REQUIRED_PASS_MISSING",
          gateId: "capture-completeness",
          metricId: "capture-required-passes-valid",
        }),
      ]),
    );
  });

  it("rejects invalid self-consistently rehashed Linear Depth values", async () => {
    const bundleDirectory = await createBundle();
    const depthPath = path.join(
      bundleDirectory,
      "frames/000000/linear-depth-meters.bin",
    );
    const bytes = new Uint8Array(await readFile(depthPath));
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setFloat32(
      0,
      -1,
      true,
    );
    await writeFile(depthPath, bytes);
    await rewriteControlCaptureFrameAndManifestHashesV1(bundleDirectory, 0);
    expect(await validateControlCaptureBundleV1(bundleDirectory)).toMatchObject({
      ok: true,
    });

    const { report } = await createControlCaptureValidationReportV1(
      bundleDirectory,
    );

    expect(report.status).toBe("failed");
    expect(report.gateResultsById["capture-completeness"]?.metricResultsById[
      "capture-linear-depth-valid"
    ]?.status).toBe("failed");
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "CAPTURE_LINEAR_DEPTH_INVALID",
      artifactPath: "frames/000000/linear-depth-meters.bin",
    }));
  });

  it("maps a self-consistent mixed Take to Capture Ownership", async () => {
    const bundleDirectory = await createBundle();
    const mixedTakeHash = `sha256:${"d".repeat(64)}`;
    const bundlePath = path.join(bundleDirectory, "bundle.json");
    const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as Record<
      string,
      unknown
    >;
    const frames = bundle.frames as Array<Record<string, unknown>>;
    for (let captureFrameIndex = 0; captureFrameIndex < frames.length; captureFrameIndex += 1) {
      const framePath = path.join(
        bundleDirectory,
        "frames",
        String(captureFrameIndex).padStart(6, "0"),
        "frame.json",
      );
      const frame = JSON.parse(await readFile(framePath, "utf8")) as Record<
        string,
        unknown
      >;
      frame.takeHash = mixedTakeHash;
      const { frameHash: _oldFrameHash, ...frameBody } = frame;
      frame.frameHash = sha256CanonicalJson(frameBody);
      frames[captureFrameIndex]!.frameHash = frame.frameHash;
      await writeFile(framePath, `${stringifyCanonicalJson(frame)}\n`, "utf8");
    }
    bundle.takeHash = mixedTakeHash;
    const { bundleManifestHash: _oldManifestHash, ...bundleBody } = bundle;
    bundle.bundleManifestHash = sha256CanonicalJson(bundleBody);
    await writeFile(bundlePath, `${stringifyCanonicalJson(bundle)}\n`, "utf8");
    await rewriteControlCaptureIntegrityV1(bundleDirectory);

    const { report } = await createControlCaptureValidationReportV1(
      bundleDirectory,
    );

    expect(report.status).toBe("failed");
    expect(report.gateResultsById["capture-ownership"]?.status).toBe("failed");
    expect(report.gateResultsById["capture-bundle-integrity"]?.status).toBe(
      "passed",
    );
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "CAPTURE_TAKE_MISMATCH",
      gateId: "capture-ownership",
      metricId: "capture-ownership-valid",
    }));
  });

  it("maps damaged bytes and a stale root to Bundle Integrity", async () => {
    const bundleDirectory = await createBundle();
    const neutralPath = path.join(
      bundleDirectory,
      "frames/000001/neutral-color.png",
    );
    await writeFile(neutralPath, new Uint8Array([1, 2, 3, 4, 5]));

    const { report } = await createControlCaptureValidationReportV1(
      bundleDirectory,
    );

    expect(report.status).toBe("failed");
    expect(report.gateResultsById["capture-bundle-integrity"]?.status).toBe(
      "failed",
    );
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "CAPTURE_FILE_HASH_MISMATCH",
      gateId: "capture-bundle-integrity",
      metricId: "capture-bundle-integrity-valid",
    }));
  });
});
