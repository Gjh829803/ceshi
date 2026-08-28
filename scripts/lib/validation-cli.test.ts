import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
  createRouteValidationReportV2,
  validateValidationReportV1,
  validateValidationReportV2,
} from "@whitebox-world/validation";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";

import { createControlCaptureValidationReportV1 } from "./control-capture-validation";
import {
  createControlCaptureValidationFixtureV1,
  snapshotControlCaptureFileHashesV1,
} from "./control-capture-validation-fixture";
import {
  explainValidationReportFileV1,
  validationStatusExitCodeV1,
  verifyControlCaptureFileV1,
  writeValidationReportFileNoReplaceV1,
} from "./validation-cli";
import { main } from "../cli/worldkit";

const temporaryDirectories: string[] = [];

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;

async function createDirectoryAlias(
  targetDirectory: string,
  aliasPath: string,
): Promise<void> {
  await symlink(
    targetDirectory,
    aliasPath,
    process.platform === "win32" ? "junction" : "dir",
  );
}

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

async function createStrictValidationReportV2File(): Promise<{
  readonly parentDirectory: string;
  readonly reportPath: string;
  readonly report: ReturnType<typeof createRouteValidationReportV2>;
}> {
  const parentDirectory = await mkdtemp(
    path.join(tmpdir(), "worldkit-validation-cli-v2-"),
  );
  temporaryDirectories.push(parentDirectory);
  const report = createRouteValidationReportV2({
    reportId: "world-package-route-validation",
    subject: {
      kind: "world-package",
      worldPackageRootHash: HASH_A,
      authoringSpecHash: HASH_A,
      normalizedWorldIrHash: HASH_B,
      worldBuildIdentityHash: HASH_C,
      resourceLockHash: HASH_B,
      layoutSolveReportHash: HASH_C,
    },
    executionPlanHash: HASH_C,
    resourceLockHash: HASH_B,
    validationProfile: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
    requiredRoutes: [],
    rows: [],
  });
  const reportPath = path.join(parentDirectory, "route-validation-report.json");
  await writeFile(reportPath, `${stringifyCanonicalJson(report)}\n`, "utf8");
  return { parentDirectory, reportPath, report };
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

  it("allows only one concurrent publisher to claim a Report path", async () => {
    const { parentDirectory, bundleDirectory } = await createFixture();
    const outputPath = path.join(parentDirectory, "reports", "capture.json");
    const { report } = await createControlCaptureValidationReportV1(
      bundleDirectory,
    );

    const results = await Promise.allSettled([
      writeValidationReportFileNoReplaceV1(outputPath, report),
      writeValidationReportFileNoReplaceV1(outputPath, report),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(validateValidationReportV1(
      JSON.parse(await readFile(outputPath, "utf8")) as unknown,
    )).toMatchObject({ ok: true });
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

  it("resolves symlinked output parents before enforcing Bundle containment", async () => {
    const { parentDirectory, bundleDirectory } = await createFixture();
    const outputParentAlias = path.join(parentDirectory, "report-output");
    await createDirectoryAlias(bundleDirectory, outputParentAlias);
    const outputPath = path.join(outputParentAlias, "authoritative-output.json");

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
    await expect(readFile(
      path.join(bundleDirectory, "authoritative-output.json"),
    )).rejects.toThrow();
  });

  it("does not create missing output directories through a Bundle symlink", async () => {
    const { parentDirectory, bundleDirectory } = await createFixture();
    const beforeHashes = await snapshotControlCaptureFileHashesV1(
      bundleDirectory,
    );
    const outputParentAlias = path.join(parentDirectory, "nested-output");
    await createDirectoryAlias(bundleDirectory, outputParentAlias);
    const outputPath = path.join(
      outputParentAlias,
      "new",
      "reports",
      "authoritative-output.json",
    );

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
    expect(await snapshotControlCaptureFileHashesV1(bundleDirectory)).toEqual(
      beforeHashes,
    );
    await expect(access(path.join(bundleDirectory, "new"))).rejects.toThrow();
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

  it("strictly explains a V2 world-package Gate without casting its Diagnostics to V1", async () => {
    const { reportPath, report } = await createStrictValidationReportV2File();
    expect(validateValidationReportV2(report)).toMatchObject({ ok: true });

    const explanation = await explainValidationReportFileV1(
      reportPath,
      "route-connectivity",
    );

    expect(explanation).toMatchObject({
      ok: true,
      exitCode: 0,
      kind: "worldkit-validation-gate-explanation",
      schemaVersion: 2,
      validationStatus: "failed",
      gate: {
        id: "route-connectivity",
        status: "failed",
      },
      validationDiagnostics: [
        expect.objectContaining({
          scope: "world",
          code: "ROUTE_REQUIRED_ROWS_MISSING",
          evidenceArtifactRefs: expect.any(Array),
          suggestedFix: expect.any(String),
        }),
      ],
      evidenceArtifacts: [
        expect.objectContaining({
          kind: "route-validation-set-receipt",
        }),
      ],
      humanReadableText: expect.stringContaining("scope=world"),
    });
    if (explanation.ok) {
      expect(explanation.validationDiagnostics[0]).not.toHaveProperty(
        "artifactPath",
      );
    }
  });

  it("rejects an unknown V2 Gate ID without guessing", async () => {
    const { reportPath } = await createStrictValidationReportV2File();

    const explanation = await explainValidationReportFileV1(
      reportPath,
      "capture-completeness",
    );

    expect(explanation).toMatchObject({
      ok: false,
      exitCode: 1,
      diagnostics: [
        expect.objectContaining({
          code: "VALIDATION_GATE_NOT_FOUND",
          details: {
            gateId: "capture-completeness",
            availableGateIds: [
              "route-connectivity",
              "route-runtime-conformance",
            ],
          },
        }),
      ],
    });
  });

  it("rejects an unknown Report version without attempting a migration", async () => {
    const { parentDirectory, report } = await createStrictValidationReportV2File();
    const reportPath = path.join(parentDirectory, "unknown-version.json");
    await writeFile(
      reportPath,
      `${stringifyCanonicalJson({ ...report, schemaVersion: 3 })}\n`,
      "utf8",
    );

    const explanation = await explainValidationReportFileV1(
      reportPath,
      "route-connectivity",
    );

    expect(explanation).toMatchObject({
      ok: false,
      exitCode: 1,
      diagnostics: [
        expect.objectContaining({
          code: "VALIDATION_REPORT_VERSION_UNSUPPORTED",
          details: expect.objectContaining({
            kind: "worldkit-validation-report",
            schemaVersion: 3,
          }),
        }),
      ],
    });
  });

  it("rejects unknown V2 Report fields through the strict V2 validator", async () => {
    const { parentDirectory, report } = await createStrictValidationReportV2File();
    const reportPath = path.join(parentDirectory, "unknown-field.json");
    await writeFile(
      reportPath,
      `${stringifyCanonicalJson({ ...report, unexpectedField: true })}\n`,
      "utf8",
    );

    const explanation = await explainValidationReportFileV1(
      reportPath,
      "route-connectivity",
    );

    expect(explanation).toMatchObject({
      ok: false,
      exitCode: 1,
      diagnostics: [
        expect.objectContaining({
          code: "VALIDATION_REPORT_INVALID",
          message: "Validation Report does not satisfy the strict V2 contract.",
          details: expect.objectContaining({
            contractDiagnostics: expect.arrayContaining([
              expect.objectContaining({
                code: "VALIDATION_FIELD_UNKNOWN",
                path: "/unexpectedField",
              }),
            ]),
          }),
        }),
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
