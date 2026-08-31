import { describe, expect, it } from "vitest";

import {
  DEPENDENCY_INVENTORY_EXECUTION_DESCRIPTOR_V1,
  projectPnpmLicenseInventoryV1,
} from "./dependency-inventory";

const COMMIT_SHA = "a".repeat(40);
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function project(installRoot: string, licensesJson: unknown) {
  return projectPnpmLicenseInventoryV1({
    installRoot,
    commitSha: COMMIT_SHA,
    commandHash: HASH_A,
    inputFingerprint: HASH_B,
    pnpmLicensesJson: licensesJson,
  });
}

describe("dependency inventory projector", () => {
  it("registers the frozen pnpm licenses argv descriptor", () => {
    expect(DEPENDENCY_INVENTORY_EXECUTION_DESCRIPTOR_V1.id).toBe("dependency-inventory");
    expect(DEPENDENCY_INVENTORY_EXECUTION_DESCRIPTOR_V1.argv).toEqual([
      "pnpm",
      "licenses",
      "list",
      "--json",
    ]);
    expect(DEPENDENCY_INVENTORY_EXECUTION_DESCRIPTOR_V1.executionScope).toBe("in-place-checkout");
  });

  it("projects two different absolute install roots to byte-identical inventory", () => {
    const left = project("/tmp/pho-inventory-a", {
      MIT: [{
        name: "lodash-es",
        version: "4.17.21",
        paths: ["/tmp/pho-inventory-a/node_modules/lodash-es"],
        author: "Lodash",
        description: "left",
        homepage: "https://example.invalid/a",
      }],
    });
    const right = project("/tmp/pho-inventory-b", {
      MIT: [{
        name: "lodash-es",
        version: "4.17.21",
        paths: ["/tmp/pho-inventory-b/node_modules/.pnpm/lodash-es"],
        author: "Other",
        description: "right",
        homepage: "https://example.invalid/b",
      }],
    });
    expect(left).toEqual(right);
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
    expect(JSON.stringify(left)).not.toMatch("/tmp/pho-inventory");
    expect(left.entries).toEqual([{
      id: "lodash-es@4.17.21",
      packageName: "lodash-es",
      version: "4.17.21",
      licenseSpdxExpression: "MIT",
    }]);
  });

  it("rejects missing name, version, or license groups", () => {
    expect(() => project("/tmp/pho-inventory-a", {
      MIT: [{ version: "1.0.0" }],
    })).toThrow(/name and version/i);
    expect(() => project("/tmp/pho-inventory-a", {
      "": [{ name: "lodash-es", version: "4.17.21" }],
    })).toThrow(/license/i);
    expect(() => project("relative/root", { MIT: [] })).toThrow(/absolute path/i);
  });
});
