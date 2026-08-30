import { describe, expect, it } from "vitest";

import { createCanonicalWorldPackageV1, verifyWorldPackageDirectoryV1 } from "./index.js";
import { createWorldPackageTestInputV1 } from "./test-fixture.js";

describe("createCanonicalWorldPackageV1", () => {
  it("builds one deterministic current package with split Canonical artifacts", () => {
    const first = createCanonicalWorldPackageV1(createWorldPackageTestInputV1());
    const repeated = createCanonicalWorldPackageV1(createWorldPackageTestInputV1());
    const verified = verifyWorldPackageDirectoryV1(first);

    expect(repeated.receipt.worldPackageRootHash).toBe(first.receipt.worldPackageRootHash);
    expect(verified.receipt.manifest).toMatchObject({ schemaVersion: 1, packageFormatVersion: 1 });
    expect(verified.receipt.manifest.sceneSource.kind).toBe("canonical-execution-plan");
    expect(verified.receipt.manifest.resources).toEqual([]);
    expect(verified.receipt.manifest.resources.map((resource) => resource.packagePath))
      .not.toEqual(expect.arrayContaining([
        "gameplay/bootstrap.json",
        "runtime/world-runtime-bootstrap.json",
      ]));
    expect(verified.executionPlan.worldRuntimeBootstrapHash).toBe(verified.worldRuntimeBootstrap.contentHash);
    expect(verified.worldRuntimeBootstrap.gameplayBootstrapHash).toBe(verified.gameplayBootstrap.contentHash);
    expect(verified.receipt.worldBuildIdentity.sceneSourceIdentity).toEqual({
      kind: "canonical-execution-plan",
      executionPlanHash: verified.receipt.manifest.sceneSource.kind === "canonical-execution-plan"
        ? verified.receipt.manifest.sceneSource.executionPlanHash
        : undefined,
    });
  });

  it("keeps exactly three transport files outside the Root inventory", () => {
    const directory = createCanonicalWorldPackageV1(createWorldPackageTestInputV1());
    const transport = ["integrity.json", "world-package-build-receipt.json", "world-build-identity.json"];
    expect(transport.every((path) => directory.files.some((file) => file.path === path))).toBe(true);
    expect(directory.receipt.fileIntegrityEntries.some((entry) => transport.includes(entry.path))).toBe(false);
  });

  it("supports explicit AuthoringSpec omission without changing component identity", () => {
    const withAudit = createCanonicalWorldPackageV1(createWorldPackageTestInputV1());
    const withoutAudit = createCanonicalWorldPackageV1(createWorldPackageTestInputV1({ includeAuthoringSpec: false }));
    expect(withoutAudit.files.some((file) => file.path === "authoring-spec.json")).toBe(false);
    expect(withoutAudit.receipt.manifest.sceneSource).toEqual(withAudit.receipt.manifest.sceneSource);
    expect(withoutAudit.receipt.manifest.worldRuntimeBootstrapHash).toBe(withAudit.receipt.manifest.worldRuntimeBootstrapHash);
    expect(withoutAudit.receipt.worldPackageRootHash).not.toBe(withAudit.receipt.worldPackageRootHash);
  });

  it("rejects a split-artifact cross-hash mismatch", () => {
    const input = createWorldPackageTestInputV1();
    expect(() => createCanonicalWorldPackageV1({
      ...input,
      executionPlan: {
        ...input.executionPlan,
        worldRuntimeBootstrapHash: `sha256:${"f".repeat(64)}`,
      },
    })).toThrow("WORLD_PACKAGE_BUILD_INVALID");
  });
});
