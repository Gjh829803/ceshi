import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { canonicalJsonBytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
  createRouteValidationReportV2,
  type ValidationReportV2,
} from "@whitebox-world/validation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TrustedRouteValidationResultV1 } from "./route-validation-runner";

vi.mock("./route-validation-runner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./route-validation-runner")>();
  return {
    ...actual,
    runTrustedRouteValidationV1: vi.fn(),
  };
});

import { verifyRouteFileV1 } from "./route-validation-cli";
import {
  RouteValidationRunnerInfrastructureErrorV1,
  runTrustedRouteValidationV1,
} from "./route-validation-runner";

const temporaryDirectories: string[] = [];
const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const HASH_D = `sha256:${"d".repeat(64)}` as const;
const HASH_E = `sha256:${"e".repeat(64)}` as const;
const HASH_F = `sha256:${"f".repeat(64)}` as const;
const PROFILE_REF =
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.resourceRef;

function reportWithStatus(status: ValidationReportV2["status"]): ValidationReportV2 {
  const report = createRouteValidationReportV2({
    reportId: `route-report-${status}`,
    subject: {
      kind: "world-package",
      worldPackageRootHash: HASH_A,
      authoringSpecHash: HASH_B,
      normalizedWorldIrHash: HASH_C,
      executionPlanHash: HASH_D,
      resourceLockHash: HASH_E,
      layoutSolveReportHash: HASH_F,
    },
    validationProfile: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
    rows: [],
  });
  return Object.freeze({ ...report, status });
}

function runnerResult(status: ValidationReportV2["status"]): TrustedRouteValidationResultV1 {
  const report = reportWithStatus(status);
  return {
    worldPackageBuildReceipt: {} as TrustedRouteValidationResultV1["worldPackageBuildReceipt"],
    subject: report.subject,
    report,
    validationReportHash:
      sha256CanonicalJson(report) as `sha256:${string}`,
    evidenceFiles: [{
      kind: "route-validation-set-receipt",
      artifactRef: "artifact://world/route-validation-set-receipt.json",
      relativePath: "route-validation-set-receipt.json",
      bytes: new TextEncoder().encode(`evidence-${status}`),
    }],
    routeEvidencePublication: {} as TrustedRouteValidationResultV1["routeEvidencePublication"],
  };
}

async function fixture(): Promise<{
  readonly directory: string;
  readonly inputPath: string;
  readonly outputPath: string;
}> {
  const directory = await mkdtemp(path.join(tmpdir(), "worldkit-route-cli-"));
  temporaryDirectories.push(directory);
  const inputPath = path.join(directory, "world.json");
  const outputPath = path.join(directory, "reports", "route-report.json");
  await writeFile(inputPath, "input-world-bytes", "utf8");
  return { directory, inputPath, outputPath };
}

async function expectMissing(targetPath: string): Promise<void> {
  await expect(access(targetPath)).rejects.toThrow();
}

beforeEach(() => {
  vi.mocked(runTrustedRouteValidationV1).mockReset();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("verifyRouteFileV1", () => {
  it("rejects every profile except the frozen built-in without running validation", async () => {
    const { inputPath, outputPath } = await fixture();

    const result = await verifyRouteFileV1(
      inputPath,
      "worldkit://validation-profile/outdoor-world-package-dev@2",
      outputPath,
    );

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      diagnostics: [{
        severity: "error",
        code: "WORLDKIT_ROUTE_VALIDATION_PROFILE_UNSUPPORTED",
        instancePath: "/validationProfileRef",
        message: "Route validation requires the frozen built-in Validation Profile.",
        details: {
          actualValidationProfileRef:
            "worldkit://validation-profile/outdoor-world-package-dev@2",
          expectedValidationProfileRef: PROFILE_REF,
        },
      }],
    });
    expect(runTrustedRouteValidationV1).not.toHaveBeenCalled();
    await expectMissing(outputPath);
    await expectMissing(`${outputPath}.evidence`);
  });

  it.each([
    ["passed", 0, true],
    ["failed", 2, false],
    ["incomplete", 3, false],
  ] as const)(
    "publishes a canonical %s report and returns exit code %i",
    async (status, exitCode, ok) => {
      const { inputPath, outputPath } = await fixture();
      const trustedResult = runnerResult(status);
      vi.mocked(runTrustedRouteValidationV1).mockResolvedValue(trustedResult);

      const result = await verifyRouteFileV1(
        inputPath,
        PROFILE_REF,
        outputPath,
      );

      expect(result).toMatchObject({
        ok,
        exitCode,
        kind: "worldkit-route-validation-command-result",
        schemaVersion: 1,
        validationStatus: status,
        validationReportHash: trustedResult.validationReportHash,
        outputPath: path.resolve(outputPath),
        evidenceDirectory: `${path.resolve(outputPath)}.evidence`,
      });
      expect(new Uint8Array(await readFile(outputPath))).toEqual(
        canonicalJsonBytes(trustedResult.report),
      );
      expect(await readFile(
        path.join(`${outputPath}.evidence`, "route-validation-set-receipt.json"),
        "utf8",
      )).toBe(`evidence-${status}`);
    },
  );

  it("redacts a raw provider failure from the public diagnostic", async () => {
    const { inputPath, outputPath } = await fixture();
    const privateProviderMessage =
      "Recast/Havok failed at /Users/private-user/internal/provider-state.bin";
    vi.mocked(runTrustedRouteValidationV1).mockRejectedValue(
      new Error(privateProviderMessage),
    );

    const result = await verifyRouteFileV1(inputPath, PROFILE_REF, outputPath);

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      diagnostics: [{
        severity: "error",
        code: "WORLDKIT_ROUTE_VALIDATION_RUNNER_FAILED",
        instancePath: "",
        message: "Unable to run trusted Route validation.",
      }],
    });
    expect(JSON.stringify(result)).not.toContain(privateProviderMessage);
    await expectMissing(outputPath);
    await expectMissing(`${outputPath}.evidence`);
  });

  it("publishes only a closed runner reason and redacts its details and cause", async () => {
    const { inputPath, outputPath } = await fixture();
    const privateInputPath =
      "/Users/private-user/worlds/internal-route-source.json";
    const privateProviderMessage =
      "Recast resource resolver failed through Havok native provider";
    vi.mocked(runTrustedRouteValidationV1).mockRejectedValue(
      new RouteValidationRunnerInfrastructureErrorV1(
        "WORLDKIT_ROUTE_VALIDATION_RESOURCE_RESOLUTION_FAILED",
        { inputPath: privateInputPath, providerHandle: 42 },
        new Error(privateProviderMessage),
      ),
    );

    const result = await verifyRouteFileV1(inputPath, PROFILE_REF, outputPath);

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      diagnostics: [{
        severity: "error",
        code: "WORLDKIT_ROUTE_VALIDATION_INFRASTRUCTURE_ERROR",
        instancePath: "",
        message: "Unable to run trusted Route validation.",
        details: {
          reason: "WORLDKIT_ROUTE_VALIDATION_RESOURCE_RESOLUTION_FAILED",
        },
      }],
    });
    const publicJson = JSON.stringify(result);
    expect(publicJson).not.toContain(privateInputPath);
    expect(publicJson).not.toContain(privateProviderMessage);
    expect(publicJson).not.toContain("providerHandle");
    expect(publicJson).not.toContain("cause");
    await expectMissing(outputPath);
    await expectMissing(`${outputPath}.evidence`);
  });

  it("does not publish an unrecognized runner reason", async () => {
    const { inputPath, outputPath } = await fixture();
    const privateReason =
      "RECAST_PRIVATE_FAILURE_AT_/Users/private-user/provider-cache";
    vi.mocked(runTrustedRouteValidationV1).mockRejectedValue(
      new RouteValidationRunnerInfrastructureErrorV1(
        privateReason,
        { nativeProviderMessage: "Havok internal state" },
      ),
    );

    const result = await verifyRouteFileV1(inputPath, PROFILE_REF, outputPath);

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      diagnostics: [{
        severity: "error",
        code: "WORLDKIT_ROUTE_VALIDATION_RUNNER_FAILED",
        instancePath: "",
        message: "Unable to run trusted Route validation.",
      }],
    });
    expect(JSON.stringify(result)).not.toContain(privateReason);
  });

  it("refuses an existing report without replacing either output target", async () => {
    const { inputPath, outputPath } = await fixture();
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, "existing-report", "utf8");

    const result = await verifyRouteFileV1(inputPath, PROFILE_REF, outputPath);

    expect(result).toMatchObject({
      ok: false,
      exitCode: 1,
      diagnostics: [{
        code: "WORLDKIT_ROUTE_VALIDATION_OUTPUT_EXISTS",
        instancePath: "/outputPath",
      }],
    });
    expect(await readFile(outputPath, "utf8")).toBe("existing-report");
    await expectMissing(`${outputPath}.evidence`);
    expect(runTrustedRouteValidationV1).not.toHaveBeenCalled();
  });

  it("refuses an existing evidence directory without replacing its contents", async () => {
    const { inputPath, outputPath } = await fixture();
    const evidenceDirectory = `${outputPath}.evidence`;
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(path.join(evidenceDirectory, "owned.txt"), "owned", "utf8");

    const result = await verifyRouteFileV1(inputPath, PROFILE_REF, outputPath);

    expect(result).toMatchObject({
      ok: false,
      exitCode: 1,
      diagnostics: [{
        code: "WORLDKIT_ROUTE_VALIDATION_OUTPUT_EXISTS",
        instancePath: "/outputPath",
      }],
    });
    await expectMissing(outputPath);
    expect(await readFile(path.join(evidenceDirectory, "owned.txt"), "utf8"))
      .toBe("owned");
    expect(runTrustedRouteValidationV1).not.toHaveBeenCalled();
  });

  it("never replaces the immutable input when output resolves to the same path", async () => {
    const { inputPath } = await fixture();

    const result = await verifyRouteFileV1(inputPath, PROFILE_REF, inputPath);

    expect(result).toMatchObject({
      ok: false,
      exitCode: 1,
      diagnostics: [{
        severity: "error",
        code: "WORLDKIT_ROUTE_VALIDATION_OUTPUT_EQUALS_INPUT",
        instancePath: "/outputPath",
      }],
    });
    expect(await readFile(inputPath, "utf8")).toBe("input-world-bytes");
    expect(runTrustedRouteValidationV1).not.toHaveBeenCalled();
  });

  it("reports output inspection IO errors as infrastructure failures", async () => {
    const { directory, inputPath } = await fixture();
    const fileParent = path.join(directory, "not-a-directory");
    await writeFile(fileParent, "file", "utf8");
    const outputPath = path.join(fileParent, "route-report.json");

    const result = await verifyRouteFileV1(inputPath, PROFILE_REF, outputPath);

    expect(result).toEqual({
      ok: false,
      exitCode: 1,
      diagnostics: [{
        severity: "error",
        code: "WORLDKIT_ROUTE_VALIDATION_OUTPUT_INSPECTION_FAILED",
        instancePath: "/outputPath",
        message: "Unable to inspect the Route validation output targets.",
        details: {
          outputPath: path.resolve(outputPath),
          evidenceDirectory: `${path.resolve(outputPath)}.evidence`,
        },
      }],
    });
    expect(JSON.stringify(result)).not.toContain("cause");
    expect(runTrustedRouteValidationV1).not.toHaveBeenCalled();
  });
});
