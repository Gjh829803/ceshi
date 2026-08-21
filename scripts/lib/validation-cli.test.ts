import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateValidationReportV1 } from "@whitebox-world/validation";

import { createControlCaptureValidationFixtureV1 } from "./control-capture-validation-fixture";
import {
  explainValidationReportFileV1,
  validationStatusExitCodeV1,
  verifyControlCaptureFileV1,
} from "./validation-cli";
import { main } from "../worldkit";

const temporaryDirectories: string[] = [];

async function createFixture(): Promise<{
  readonly parentDirectory: string;
  readonly bundleDirectory: string;
}> {
  const parentDirectory = await mkdtemp(
    path.join(tmpdir(), "worldkit-validation-cli-"),
  );
  temporaryDirectories.push(parentDirectory);
  const bundleDirectory = path.join(parentDirectory, "capture-bundle");
  await createControlCaptureValidationFixtureV1(bundleDirectory);
  return { parentDirectory, bundleDirectory };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("Validation CLI", () => {
  it("atomically writes a strict passed report outside the Bundle", async () => {
    const { parentDirectory, bundleDirectory } = await createFixture();
    const outputPath = path.join(parentDirectory, "reports", "capture.json");

    const result = await verifyControlCaptureFileV1(
      bundleDirectory,
      outputPath,
    );

    expect(result).toMatchObject({
      ok: true,
      exitCode: 0,
      kind: "worldkit-validation-command-result",
      validationStatus: "passed",
      outputPath: path.resolve(outputPath),
      validationReportHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    const report: unknown = JSON.parse(await readFile(outputPath, "utf8"));
    expect(validateValidationReportV1(report)).toMatchObject({ ok: true });
    expect(await readdir(path.dirname(outputPath))).toEqual(["capture.json"]);
  });

  it("writes a failed report and returns the failed exit code", async () => {
    const { parentDirectory, bundleDirectory } = await createFixture();
    await unlink(path.join(
      bundleDirectory,
      "frames/000000/world-normal.bin",
    ));
    const outputPath = path.join(parentDirectory, "failed-report.json");

    const result = await verifyControlCaptureFileV1(
      bundleDirectory,
      outputPath,
    );

    expect(result).toMatchObject({
      ok: false,
      exitCode: 2,
      validationStatus: "failed",
      outputPath: path.resolve(outputPath),
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "CAPTURE_REQUIRED_PASS_MISSING" }),
      ]),
    });
    expect(validateValidationReportV1(
      JSON.parse(await readFile(outputPath, "utf8")) as unknown,
    )).toMatchObject({ ok: true });
  });

  it("never writes a Validation Report inside the immutable Bundle", async () => {
    const { bundleDirectory } = await createFixture();
    const outputPath = path.join(bundleDirectory, "authoritative-report.json");

    const result = await verifyControlCaptureFileV1(
      bundleDirectory,
      outputPath,
    );

    expect(result).toMatchObject({
      ok: false,
      exitCode: 1,
      diagnostics: [
        expect.objectContaining({
          code: "VALIDATION_OUTPUT_INSIDE_SUBJECT",
        }),
      ],
    });
    await expect(readFile(outputPath)).rejects.toThrow();
  });

  it("uses stable exit codes for all report statuses", () => {
    expect(validationStatusExitCodeV1("passed")).toBe(0);
    expect(validationStatusExitCodeV1("failed")).toBe(2);
    expect(validationStatusExitCodeV1("incomplete")).toBe(3);
  });

  it("explains one exact Gate with Metrics, Evidence, and fixes", async () => {
    const { parentDirectory, bundleDirectory } = await createFixture();
    await unlink(path.join(
      bundleDirectory,
      "frames/000000/world-normal.bin",
    ));
    const outputPath = path.join(parentDirectory, "failed-report.json");
    await verifyControlCaptureFileV1(bundleDirectory, outputPath);

    const explanation = await explainValidationReportFileV1(
      outputPath,
      "capture-completeness",
    );

    expect(explanation).toMatchObject({
      ok: true,
      exitCode: 0,
      kind: "worldkit-validation-gate-explanation",
      validationStatus: "failed",
      gate: {
        id: "capture-completeness",
        status: "failed",
      },
      validationDiagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "CAPTURE_REQUIRED_PASS_MISSING",
          suggestedFix: expect.stringContaining("five required passes"),
        }),
      ]),
      evidenceArtifacts: [
        expect.objectContaining({ kind: "control-capture-bundle" }),
      ],
      humanReadableText: expect.stringContaining(
        "capture-required-passes-valid",
      ),
    });
  });

  it("rejects an unknown Gate ID without guessing", async () => {
    const { parentDirectory, bundleDirectory } = await createFixture();
    const outputPath = path.join(parentDirectory, "report.json");
    await verifyControlCaptureFileV1(bundleDirectory, outputPath);

    const explanation = await explainValidationReportFileV1(
      outputPath,
      "physics-stability",
    );

    expect(explanation).toMatchObject({
      ok: false,
      exitCode: 1,
      diagnostics: [
        expect.objectContaining({ code: "VALIDATION_GATE_NOT_FOUND" }),
      ],
    });
  });

  it("dispatches both commands through worldkit with canonical JSON output", async () => {
    const { parentDirectory, bundleDirectory } = await createFixture();
    const outputPath = path.join(parentDirectory, "report.json");
    const stdout = { text: "" };
    const write = process.stdout.write.bind(process.stdout);
    const writeSpy = (value: string | Uint8Array): boolean => {
      stdout.text += typeof value === "string" ? value : value.toString();
      return true;
    };
    process.stdout.write = writeSpy as typeof process.stdout.write;
    try {
      await expect(main([
        "verify",
        "capture",
        bundleDirectory,
        "--output",
        outputPath,
        "--json",
      ])).resolves.toBe(0);
      const verificationResult = JSON.parse(stdout.text) as Record<
        string,
        unknown
      >;
      expect(verificationResult).toMatchObject({
        kind: "worldkit-validation-command-result",
        validationStatus: "passed",
      });
      expect(verificationResult).not.toHaveProperty("humanReadableText");

      stdout.text = "";
      await expect(main([
        "verify",
        "explain",
        outputPath,
        "--gate-id",
        "capture-completeness",
        "--json",
      ])).resolves.toBe(0);
      const explanation = JSON.parse(stdout.text) as Record<string, unknown>;
      expect(explanation).toMatchObject({
        kind: "worldkit-validation-gate-explanation",
        gate: { id: "capture-completeness", status: "passed" },
      });
      expect(explanation).not.toHaveProperty("humanReadableText");
    } finally {
      process.stdout.write = write;
    }
  });
});
