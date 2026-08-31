import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { scanWorkspaceBoundaries } from "../../lib/workspace-boundary";
import type { WorkspaceBoundaryEvidenceV1 } from "../../lib/workspace-boundary-contract";
import {
  parseProjectHealthAuthorityPolicyV1,
  parseProjectHealthProfileV1,
} from "../contracts";
import { observeSupplementalAuthorityV1 } from "./supplemental-authority";

const REPOSITORY_ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const COMMIT_SHA = "a".repeat(40);
const SENSOR_IMPLEMENTATION_HASH = `sha256:${"b".repeat(64)}`;

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8"));
}

function parsedProfile() {
  const repositoryPaths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" },
  ).trim().split("\n").filter(Boolean);
  const workspacePackageIds = ["package.json", ...[
    ...readdirSync(path.join(REPOSITORY_ROOT, "packages"), { withFileTypes: true }),
    ...readdirSync(path.join(REPOSITORY_ROOT, "apps"), { withFileTypes: true }),
  ].filter((entry) => entry.isDirectory()).map((entry) => {
    const parent = readdirSync(path.join(REPOSITORY_ROOT, "packages"), { withFileTypes: true })
      .some((candidate) => candidate.name === entry.name)
      ? "packages"
      : "apps";
    return `${parent}/${entry.name}/package.json`;
  })].flatMap((manifestPath) => {
    try {
      const manifest = readJson(manifestPath) as { readonly name?: unknown };
      return typeof manifest.name === "string" ? [manifest.name] : [];
    } catch {
      return [];
    }
  });
  return parseProjectHealthProfileV1(readJson("config/project-health/profile.json"), {
    repositoryPaths,
    workspacePackageIds,
  });
}

function parsedPolicy() {
  return parseProjectHealthAuthorityPolicyV1(
    readJson("config/project-health/authority-policy.json"),
    parsedProfile(),
  );
}

function withSymbol(
  evidence: WorkspaceBoundaryEvidenceV1,
  symbol: WorkspaceBoundaryEvidenceV1["publicSymbols"][number],
): WorkspaceBoundaryEvidenceV1 {
  return {
    ...evidence,
    publicSymbols: [...evidence.publicSymbols, symbol],
  };
}

describe("supplemental-authority sensor", { timeout: 30_000 }, () => {
  it("does not rescan source and keeps the current tree free of blocking authority Findings", async () => {
    const source = await readFileAsync(new URL("./supplemental-authority.ts", import.meta.url), "utf8");
    expect(source).not.toMatch("scanWorkspaceBoundaries");
    expect(source).not.toMatch(/\brg\b/);
    const evidence = await scanWorkspaceBoundaries({
      repositoryRoot: REPOSITORY_ROOT,
      commitSha: COMMIT_SHA,
    });
    const observation = observeSupplementalAuthorityV1({
      profile: parsedProfile(),
      sensorImplementationHash: SENSOR_IMPLEMENTATION_HASH,
      evidence,
      authorityPolicy: parsedPolicy(),
    });
    expect(observation.metricsById["supplemental-authority-valid"]).toEqual({
      id: "supplemental-authority-valid",
      kind: "boolean",
      value: true,
    });
    expect(observation.findings.every((finding) => finding.policy === "advisory-p3")).toBe(true);
    expect(observation.status).toBe("passed");
  });

  it("reports a duplicate parser owner from Evidence without a second AST", async () => {
    const evidence = withSymbol(await scanWorkspaceBoundaries({
      repositoryRoot: REPOSITORY_ROOT,
      commitSha: COMMIT_SHA,
    }), {
      packageId: "@whitebox-world/compiler",
      sourcePath: "packages/compiler/src/index.ts",
      exportSubpath: ".",
      symbolName: "parseCanonicalSceneExecutionPlanV1",
      isTypeOnly: false,
      isReexport: false,
    });
    const observation = observeSupplementalAuthorityV1({
      profile: parsedProfile(),
      sensorImplementationHash: SENSOR_IMPLEMENTATION_HASH,
      evidence,
      authorityPolicy: parsedPolicy(),
    });
    expect(observation.status).toBe("failed");
    const duplicate = observation.findings.find((finding) => finding.code === "PROJECT_HEALTH_AUTHORITY_DUPLICATE");
    expect(duplicate?.ownerId).toBe("public-contract");
    expect(duplicate?.subjectRefs).toEqual(expect.arrayContaining([
      "package:@whitebox-world/compiler",
      "path:packages/compiler/src/index.ts",
    ]));
  });

  it("reports a public compat alias and a Canonical/Native Scene Source pair", async () => {
    const base = await scanWorkspaceBoundaries({
      repositoryRoot: REPOSITORY_ROOT,
      commitSha: COMMIT_SHA,
    });
    const aliased = withSymbol(base, {
      packageId: "@whitebox-world/runtime-contracts",
      sourcePath: "packages/runtime-contracts/src/index.ts",
      exportSubpath: ".",
      symbolName: "parseAuthoringSpecV3",
      isTypeOnly: false,
      isReexport: false,
    });
    const aliasObservation = observeSupplementalAuthorityV1({
      profile: parsedProfile(),
      sensorImplementationHash: SENSOR_IMPLEMENTATION_HASH,
      evidence: aliased,
      authorityPolicy: parsedPolicy(),
    });
    expect(aliasObservation.findings.some((finding) =>
      finding.code === "PROJECT_HEALTH_PUBLIC_COMPAT_ALIAS")).toBe(true);

    const paired = withSymbol(withSymbol(base, {
      packageId: "@whitebox-world/runtime-host",
      sourcePath: "packages/runtime-host/src/index.ts",
      exportSubpath: ".",
      symbolName: "canonicalSceneSource",
      isTypeOnly: false,
      isReexport: false,
    }), {
      packageId: "@whitebox-world/native-babylon",
      sourcePath: "packages/native-babylon/src/index.ts",
      exportSubpath: ".",
      symbolName: "nativeSceneModule",
      isTypeOnly: false,
      isReexport: false,
    });
    const pairObservation = observeSupplementalAuthorityV1({
      profile: parsedProfile(),
      sensorImplementationHash: SENSOR_IMPLEMENTATION_HASH,
      evidence: paired,
      authorityPolicy: parsedPolicy(),
    });
    expect(pairObservation.findings.some((finding) =>
      finding.code === "PROJECT_HEALTH_AUTHORITY_DUPLICATE" &&
      finding.subjectRefs.includes("package:@whitebox-world/native-babylon"))).toBe(true);
  });

  it("keeps keyword matches advisory until an exact forbidden rule fires", async () => {
    const evidence = withSymbol(await scanWorkspaceBoundaries({
      repositoryRoot: REPOSITORY_ROOT,
      commitSha: COMMIT_SHA,
    }), {
      packageId: "@whitebox-world/runtime-contracts",
      sourcePath: "packages/runtime-contracts/src/index.ts",
      exportSubpath: ".",
      symbolName: "legacyParseHelper",
      isTypeOnly: false,
      isReexport: false,
    });
    const observation = observeSupplementalAuthorityV1({
      profile: parsedProfile(),
      sensorImplementationHash: SENSOR_IMPLEMENTATION_HASH,
      evidence,
      authorityPolicy: parsedPolicy(),
    });
    const keyword = observation.findings.find((finding) =>
      finding.code === "PROJECT_HEALTH_AUTHORITY_KEYWORD_CANDIDATE" &&
      finding.subjectRefs.includes("package:@whitebox-world/runtime-contracts"));
    expect(keyword?.policy).toBe("advisory-p3");
    expect(observation.status).toBe("passed");
  });
});
