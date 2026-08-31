import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createChangeImpactDiffDescriptorV1 } from "./change-impact";
import { parseProjectHealthProfileV1 } from "./contracts";
import { DEPENDENCY_INVENTORY_EXECUTION_DESCRIPTOR_V1 } from "./dependency-inventory";
import {
  admitRegisteredProjectHealthGateV1,
  executeRegisteredProjectHealthGateV1,
  isRegisteredProjectHealthGateIdV1,
  PROJECT_HEALTH_GATE_REGISTRY_V1,
  PROJECT_HEALTH_SENSOR_REGISTRY_V1,
  PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1,
  observeRegisteredProjectHealthSensorV1,
  projectHealthGateInputFingerprintV1,
  projectHealthSensorImplementationHashV1,
  readProjectHealthCheckoutHeadV1,
  recordRegisteredProjectHealthGateV1,
  registeredProjectHealthGateArgvV1,
} from "./registry";

const REPOSITORY_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const COMMIT_SHA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPOSITORY_ROOT, encoding: "utf8" }).trim();
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

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

async function createCleanRepository(): Promise<Readonly<{ repositoryRoot: string; commitSha: string }>> {
  const repositoryRoot = await realpath(await mkdtemp(
    path.join(os.tmpdir(), "worldkit-project-health-registry-repo-"),
  ));
  roots.push(repositoryRoot);
  await writeFile(path.join(repositoryRoot, ".gitignore"), ".project-health/\n", "utf8");
  await writeFile(path.join(repositoryRoot, "tracked.txt"), "clean\n", "utf8");
  execFileSync("git", ["init", "--quiet"], { cwd: repositoryRoot });
  execFileSync("git", ["config", "user.email", "project-health@example.invalid"], { cwd: repositoryRoot });
  execFileSync("git", ["config", "user.name", "Project Health Test"], { cwd: repositoryRoot });
  execFileSync("git", ["add", ".gitignore", "tracked.txt"], { cwd: repositoryRoot });
  execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: repositoryRoot });
  return {
    repositoryRoot,
    commitSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim(),
  };
}

describe("project health registry", () => {
  it("binds every Profile Sensor to one executable source-derived implementation", () => {
    const profile = parsedProfile();
    expect(Object.keys(PROJECT_HEALTH_SENSOR_REGISTRY_V1)).toEqual([...profile.sensorIds]);
    expect(Object.keys(PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1)).toEqual([...profile.sensorIds]);
    for (const sensorId of profile.sensorIds) {
      expect(PROJECT_HEALTH_SENSOR_REGISTRY_V1[sensorId].id).toBe(sensorId);
      expect(typeof PROJECT_HEALTH_SENSOR_REGISTRY_V1[sensorId].observe).toBe("function");
      expect(PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1[sensorId]).toMatch(/^sha256:[a-f0-9]{64}$/);
    }

    const observation = observeRegisteredProjectHealthSensorV1({
      sensorId: "performance-size",
      sensorInput: { profile, measurement: null, baseline: null },
    });
    expect(observation.sensorId).toBe("performance-size");
    expect(observation.sensorImplementationHash).toBe(
      PROJECT_HEALTH_SENSOR_IMPLEMENTATION_HASHES_V1["performance-size"],
    );
  });

  it("invalidates implementation identity when one registered Sensor source byte changes", async () => {
    const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-sensor-source-"));
    roots.push(repositoryRoot);
    await cp(path.join(REPOSITORY_ROOT, "scripts"), path.join(repositoryRoot, "scripts"), { recursive: true });
    await cp(path.join(REPOSITORY_ROOT, "packages", "protocol"), path.join(repositoryRoot, "packages", "protocol"), {
      recursive: true,
    });
    await cp(path.join(REPOSITORY_ROOT, "pnpm-lock.yaml"), path.join(repositoryRoot, "pnpm-lock.yaml"));
    const before = projectHealthSensorImplementationHashV1({
      repositoryRoot,
      sensorId: "workspace-boundary",
    });
    const sourcePath = path.join(repositoryRoot, "scripts/project-health/sensors/workspace-boundary.ts");
    await writeFile(sourcePath, `${await readFile(sourcePath, "utf8")}\n// identity mutation\n`, "utf8");
    const after = projectHealthSensorImplementationHashV1({
      repositoryRoot,
      sensorId: "workspace-boundary",
    });
    expect(after).not.toBe(before);
  });

  it("registers every Profile and capability Gate plus frozen owner descriptors", () => {
    const profile = parsedProfile();
    const gateIds = new Set<string>(["change-impact-diff"]);
    for (const mode of Object.values(profile.modesById)) {
      for (const ids of Object.values(mode.requiredGateIdsBySensorId)) {
        for (const gateId of ids ?? []) gateIds.add(gateId);
      }
    }
    for (const ids of Object.values(profile.capabilityGateIdsById)) {
      for (const gateId of ids) gateIds.add(gateId);
    }
    expect([...gateIds].filter((gateId) => !isRegisteredProjectHealthGateIdV1(gateId))).toEqual([]);
    expect(PROJECT_HEALTH_GATE_REGISTRY_V1["dependency-inventory"]).toEqual(
      DEPENDENCY_INVENTORY_EXECUTION_DESCRIPTOR_V1,
    );
    expect(admitRegisteredProjectHealthGateV1({
      gateId: "change-impact-diff",
      baseSha: "a".repeat(40),
      headSha: "b".repeat(40),
    })).toEqual(createChangeImpactDiffDescriptorV1({
      baseSha: "a".repeat(40),
      headSha: "b".repeat(40),
    }));
    expect(registeredProjectHealthGateArgvV1("tracked-tree-clean")).toEqual(["git", "diff", "--exit-code"]);
    expect(registeredProjectHealthGateArgvV1("typecheck")).toEqual(["pnpm", "typecheck"]);
    expect(registeredProjectHealthGateArgvV1("workspace-boundaries")).toEqual([
      "pnpm",
      "verify:workspace-boundaries",
    ]);
  });

  it("admits only the exact registered inherit-owner-token descriptor", () => {
    const admitted = admitRegisteredProjectHealthGateV1({ gateId: "tracked-tree-clean" });
    expect(admitted.descendantOwnershipMode).toBe("inherit-owner-token");
    expect(admitted.id).toBe("tracked-tree-clean");
    expect(() => admitRegisteredProjectHealthGateV1({ gateId: "not-a-registered-gate" })).toThrow(
      /registered/i,
    );
    expect(() => admitRegisteredProjectHealthGateV1({ gateId: "change-impact-diff" })).toThrow(/base/i);
  });

  it("records a registered Gate once through the process runner", async () => {
    const source = await readFile(new URL("./registry.ts", import.meta.url), "utf8");
    expect(source).toMatch("admitRegisteredProjectHealthGateV1");
    expect(source).toMatch("runProjectHealthProcessV1");
    expect(source).not.toMatch("spawn(");
    const fixture = await createCleanRepository();
    const outputRoot = path.join(fixture.repositoryRoot, ".project-health", `registry-test-${randomUUID()}`);
    await mkdir(outputRoot, { recursive: true });
    const outputPath = path.join(outputRoot, "tracked-tree-clean.json");
    const receipt = await recordRegisteredProjectHealthGateV1({
      repositoryRoot: fixture.repositoryRoot,
      profile: parsedProfile(),
      gateId: "tracked-tree-clean",
      commitSha: fixture.commitSha,
      outputPath,
    });
    expect(receipt.kind).toBe("project-health-gate-receipt");
    expect(receipt.gateId).toBe("tracked-tree-clean");
    expect(receipt.commitSha).toBe(fixture.commitSha);
    expect(["passed", "failed", "incomplete"]).toContain(receipt.status);
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(receipt);
  });

  it("executes a registered Gate in memory before any Receipt output is selected", async () => {
    const fixture = await createCleanRepository();
    const result = await executeRegisteredProjectHealthGateV1({
      repositoryRoot: fixture.repositoryRoot,
      profile: parsedProfile(),
      gateId: "tracked-tree-clean",
      commitSha: fixture.commitSha,
    });
    expect(result.receipt).toMatchObject({
      kind: "project-health-gate-receipt",
      gateId: "tracked-tree-clean",
      commitSha: fixture.commitSha,
      status: "passed",
    });
    expect(result.evidence).toMatchObject({
      kind: "project-health-execution-evidence",
      descriptorId: "tracked-tree-clean",
      status: "passed",
      commandHash: result.receipt.commandHash,
    });
    expect(result.receipt.evidenceRef).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(await readFile(
      path.join(
        fixture.repositoryRoot,
        ".project-health",
        "evidence",
        "sha256",
        result.receipt.evidenceRef.slice("sha256:".length),
      ),
      "utf8",
    )).toContain('"kind":"project-health-execution-evidence"');
  });

  it("rejects a non-HEAD commit before publication and fingerprints canonical selected bytes", async () => {
    expect(await readProjectHealthCheckoutHeadV1(REPOSITORY_ROOT)).toBe(COMMIT_SHA);
    const outputRoot = path.join(REPOSITORY_ROOT, ".project-health", `registry-test-${randomUUID()}`);
    await mkdir(outputRoot, { recursive: true });
    roots.push(outputRoot);
    const outputPath = path.join(outputRoot, "stale.json");
    await expect(recordRegisteredProjectHealthGateV1({
      repositoryRoot: REPOSITORY_ROOT,
      profile: parsedProfile(),
      gateId: "tracked-tree-clean",
      commitSha: "c".repeat(40),
      outputPath,
    })).rejects.toThrow(/HEAD/i);
    await expect(readFile(outputPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-inputs-"));
    roots.push(repositoryRoot);
    await mkdir(path.join(repositoryRoot, "selected"));
    await writeFile(path.join(repositoryRoot, "selected", "fixture.txt"), "before", "utf8");
    const profile = parsedProfile();
    const selectedProfile = {
      ...profile,
      inputSelectorsBySensorId: {
        ...profile.inputSelectorsBySensorId,
        "contract-parity": { exactPaths: [], pathPrefixes: ["selected"], configPaths: [] },
      },
    };
    const before = await projectHealthGateInputFingerprintV1({
      repositoryRoot,
      profile: selectedProfile,
      gateId: "typecheck",
    });
    await writeFile(path.join(repositoryRoot, "selected", "fixture.txt"), "after", "utf8");
    const after = await projectHealthGateInputFingerprintV1({
      repositoryRoot,
      profile: selectedProfile,
      gateId: "typecheck",
    });
    expect(after).not.toBe(before);
  });
});
