import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseProjectHealthProfileV1 } from "../contracts";
import {
  runIsolatedRuntimeProbeCyclesV1,
  RUNTIME_PROBE_REGISTRY_V1,
  ZERO_RUNTIME_OWNER_SNAPSHOT_V1,
  type RuntimeProbeCycleScriptV1,
  type RuntimeProbeEvidenceV1,
  type RuntimeProbeRegistrationV1,
} from "../runtime-probe-registry";
import { observeRuntimeHealthV1 } from "./runtime-health";

const REPOSITORY_ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);

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

function cycle(overrides: Partial<RuntimeProbeCycleScriptV1> = {}): RuntimeProbeCycleScriptV1 {
  return {
    beforeOwners: ZERO_RUNTIME_OWNER_SNAPSHOT_V1,
    afterOwners: ZERO_RUNTIME_OWNER_SNAPSHOT_V1,
    heapDeltaBytes: 0,
    construct() {},
    cleanup() {},
    ...overrides,
  };
}

function probeEvidence(
  registration: RuntimeProbeRegistrationV1,
  cycles: readonly RuntimeProbeCycleScriptV1[],
): RuntimeProbeEvidenceV1 {
  return runIsolatedRuntimeProbeCyclesV1({ registration, cycles });
}

function requiredRegistrations(): RuntimeProbeRegistrationV1[] {
  return RUNTIME_PROBE_REGISTRY_V1.filter((entry) => entry.requiredness === "required");
}

function cleanRequiredEvidences(
  overridesById: Partial<Record<string, RuntimeProbeEvidenceV1>> = {},
): RuntimeProbeEvidenceV1[] {
  return requiredRegistrations().map((registration) => {
    const override = overridesById[registration.id];
    if (override) return override;
    const extras = registration.kind === "cadence"
      ? { snapshotHash: "cadence-equivalent" }
      : {};
    return probeEvidence(registration, [cycle(extras), cycle(extras), cycle(extras)]);
  });
}

function observe(evidences: readonly RuntimeProbeEvidenceV1[] | null) {
  return observeRuntimeHealthV1({
    profile: parsedProfile(),
    mode: "nightly",
    evidences,
  });
}

describe("runtime-health sensor", () => {
  it("does not spawn or copy engine internals", async () => {
    const source = await readFileAsync(new URL("./runtime-health.ts", import.meta.url), "utf8");
    expect(source).not.toMatch("child_process");
    expect(source).not.toMatch("runProjectHealthProcessV1");
    expect(source).not.toMatch("@babylonjs");
    expect(source).not.toMatch("havok");
  });

  it("passes a clean three-cycle create/reset/dispose set", () => {
    const observation = observe(cleanRequiredEvidences());
    expect(observation.status).toBe("passed");
    expect(observation.findings).toEqual([]);
    expect(observation.metricsById["runtime-owner-leak-count"]).toEqual({
      id: "runtime-owner-leak-count",
      kind: "count",
      valueCount: 0,
    });
    expect(observation.metricsById["runtime-determinism-mismatch-count"]).toEqual({
      id: "runtime-determinism-mismatch-count",
      kind: "count",
      valueCount: 0,
    });
  });

  it("reports a leaked Observable from owner counts", () => {
    const host = RUNTIME_PROBE_REGISTRY_V1.find((entry) => entry.id === "runtime-host-lifecycle")!;
    const observation = observe(cleanRequiredEvidences({
      "runtime-host-lifecycle": probeEvidence(host, [
        cycle(),
        cycle({ afterOwners: { ...ZERO_RUNTIME_OWNER_SNAPSHOT_V1, observableCount: 1 } }),
        cycle(),
      ]),
    }));
    expect(observation.status).toBe("failed");
    expect(observation.findings[0]?.code).toBe("PROJECT_HEALTH_RUNTIME_OWNER_LEAK");
    expect(observation.metricsById["runtime-owner-leak-count"]).toEqual({
      id: "runtime-owner-leak-count",
      kind: "count",
      valueCount: 1,
    });
  });

  it("reports a leaked Timer from owner counts", () => {
    const browser = RUNTIME_PROBE_REGISTRY_V1.find((entry) => entry.id === "browser-ready-reset")!;
    const observation = observe(cleanRequiredEvidences({
      "browser-ready-reset": probeEvidence(browser, [
        cycle({ afterOwners: { ...ZERO_RUNTIME_OWNER_SNAPSHOT_V1, timerCount: 2 } }),
      ]),
    }));
    expect(observation.findings[0]?.code).toBe("PROJECT_HEALTH_RUNTIME_OWNER_LEAK");
    expect(observation.metricsById["runtime-owner-leak-count"]).toMatchObject({ valueCount: 2 });
  });

  it("keeps a partial-construction throw with complete cleanup as passed", () => {
    const host = RUNTIME_PROBE_REGISTRY_V1.find((entry) => entry.id === "runtime-host-lifecycle")!;
    const observation = observe(cleanRequiredEvidences({
      "runtime-host-lifecycle": probeEvidence(host, [
        cycle({
          construct() {
            throw new Error("provider throw");
          },
        }),
        cycle(),
        cycle(),
      ]),
    }));
    expect(observation.status).toBe("passed");
    expect(observation.findings).toEqual([]);
  });

  it("preserves cleanup throw evidence and counts remaining owners as leaks", () => {
    const host = RUNTIME_PROBE_REGISTRY_V1.find((entry) => entry.id === "runtime-host-lifecycle")!;
    const evidence = probeEvidence(host, [
      cycle({
        afterOwners: { ...ZERO_RUNTIME_OWNER_SNAPSHOT_V1, nodeCount: 1 },
        cleanup() {
          throw new Error("cleanup throw");
        },
      }),
    ]);
    expect(evidence.cycles[0]?.cleanupStatus).toBe("threw");
    const observation = observe(cleanRequiredEvidences({
      "runtime-host-lifecycle": evidence,
    }));
    expect(observation.status).toBe("failed");
    expect(observation.findings[0]?.code).toBe("PROJECT_HEALTH_RUNTIME_OWNER_LEAK");
  });

  it("accepts cadence-equivalent snapshots and fails a required mismatch", () => {
    const cadence = RUNTIME_PROBE_REGISTRY_V1.find((entry) => entry.id === "fixed-cadence")!;
    const passed = observe(cleanRequiredEvidences());
    expect(passed.status).toBe("passed");
    const failed = observe(cleanRequiredEvidences({
      "fixed-cadence": probeEvidence(cadence, [
        cycle({ snapshotHash: "30hz" }),
        cycle({ snapshotHash: "60hz" }),
        cycle({ snapshotHash: "120hz" }),
      ]),
    }));
    expect(failed.status).toBe("failed");
    expect(failed.findings[0]?.code).toBe("PROJECT_HEALTH_RUNTIME_NONDETERMINISTIC");
    expect(failed.metricsById["runtime-determinism-mismatch-count"]).toMatchObject({ valueCount: 1 });
  });

  it("does not fail Required runtime-health for an advisory BNA candidate mismatch", () => {
    const bna = RUNTIME_PROBE_REGISTRY_V1.find((entry) => entry.id === "bna-candidate-determinism")!;
    const observation = observe([
      ...cleanRequiredEvidences(),
      probeEvidence(bna, [
        cycle({ candidateHashes: ["candidate-a", "candidate-b"] }),
      ]),
    ]);
    expect(observation.status).toBe("passed");
    expect(observation.findings).toEqual([]);
    expect(observation.metricsById["runtime-determinism-mismatch-count"]).toMatchObject({ valueCount: 0 });
  });

  it("ignores heap deltas when owner counts return to baseline", () => {
    const host = RUNTIME_PROBE_REGISTRY_V1.find((entry) => entry.id === "runtime-host-lifecycle")!;
    const observation = observe(cleanRequiredEvidences({
      "runtime-host-lifecycle": probeEvidence(host, [
        cycle({ heapDeltaBytes: 8192 }),
        cycle({ heapDeltaBytes: 1024 }),
        cycle({ heapDeltaBytes: 4096 }),
      ]),
    }));
    expect(observation.status).toBe("passed");
    expect(observation.findings).toEqual([]);
  });

  it("reports incomplete when a required probe is missing", () => {
    const observation = observe(cleanRequiredEvidences().slice(0, 2));
    expect(observation.status).toBe("incomplete");
    expect(observation.metricsById["runtime-owner-leak-count"]).toMatchObject({
      status: "not-evaluated",
      reasonCode: "OWNER_COMMAND_NOT_RUN",
    });
  });
});
