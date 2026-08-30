import { canonicalJsonBytes } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  assembleWorldPackageDirectoryV1,
  createCanonicalWorldPackageV1,
  verifyWorldPackageDirectoryV1,
  type WorldPackageDirectoryV1,
} from "./index.js";
import { createWorldPackageTestInputV1 } from "./test-fixture.js";

function fixture(): WorldPackageDirectoryV1 {
  return createCanonicalWorldPackageV1(createWorldPackageTestInputV1());
}

describe("WorldPackageDirectoryV1", () => {
  it("recomputes and exposes every member of the exact runtime closure", () => {
    const verified = verifyWorldPackageDirectoryV1(fixture());
    expect(verified.kind).toBe("canonical-execution-plan");
    if (verified.kind !== "canonical-execution-plan") throw new Error("unreachable");
    expect(verified.executionPlan.worldRuntimeBootstrapHash).toBe(verified.worldRuntimeBootstrap.contentHash);
    expect(verified.worldRuntimeBootstrap.gameplayBootstrapHash).toBe(verified.gameplayBootstrap.contentHash);
    expect(verified.receipt.worldBuildIdentityHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it.each(["integrity.json", "world-package-build-receipt.json", "world-build-identity.json"])("refuses transport metadata %s as a root input", (path) => {
    const directory = fixture();
    expect(() => assembleWorldPackageDirectoryV1({
      receipt: directory.receipt,
      files: directory.files.filter((file) =>
        !["integrity.json", "world-package-build-receipt.json", "world-build-identity.json"].includes(file.path)
      ).concat({ path, mediaType: "application/json", bytes: canonicalJsonBytes({}) }),
    })).toThrow("WORLD_PACKAGE_DIRECTORY_INVALID");
  });

  it("rejects modified root bytes", () => {
    const directory = fixture();
    const tampered = {
      ...directory,
      files: directory.files.map((file) => file.path === "world.normalized.json"
        ? { ...file, bytes: canonicalJsonBytes({ kind: "tampered" }) }
        : file),
    };
    expect(() => verifyWorldPackageDirectoryV1(tampered)).toThrow("WORLD_PACKAGE_DIRECTORY_INVALID");
  });

  it("rejects modified post-root identity bytes", () => {
    const directory = fixture();
    const tampered = {
      ...directory,
      files: directory.files.map((file) => file.path === "world-build-identity.json"
        ? { ...file, bytes: canonicalJsonBytes({ ...directory.receipt.worldBuildIdentity, id: "forged" }) }
        : file),
    };
    expect(() => verifyWorldPackageDirectoryV1(tampered)).toThrow("world-build-identity.json");
  });
});
