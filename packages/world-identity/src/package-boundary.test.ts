import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const WORKSPACE_PACKAGES_ROOT = path.resolve(PACKAGE_ROOT, "..");
const FORBIDDEN_WORLD_PACKAGE_HASH_ALIAS = [
  "WorldPackage",
  "Sha256HashV1",
].join("");

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(root).sort()) {
    const target = path.join(root, name);
    if (statSync(target).isDirectory()) {
      files.push(...sourceFiles(target));
    } else if (/\.(?:ts|tsx)$/.test(name)) {
      files.push(target);
    }
  }
  return files;
}

describe("World Identity package boundary", () => {
  it("has only Protocol and lodash-es as production dependencies", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      "@whitebox-world/protocol",
      "lodash-es",
    ]);
  });

  it("keeps Protocol as the sole Sha256HashV1 owner with direct package imports", () => {
    const packageSourceFiles = readdirSync(WORKSPACE_PACKAGES_ROOT)
      .sort()
      .flatMap((packageName) => {
        const sourceRoot = path.join(
          WORKSPACE_PACKAGES_ROOT,
          packageName,
          "src",
        );
        try {
          return sourceFiles(sourceRoot);
        } catch {
          return [];
        }
      });
    const declarations: string[] = [];
    const invalidConsumers: string[] = [];
    const forbiddenAliases: string[] = [];

    for (const file of packageSourceFiles) {
      const source = readFileSync(file, "utf8");
      const relative = path.relative(path.resolve(PACKAGE_ROOT, "../.."), file);
      if (/^(?:export\s+)?type\s+Sha256HashV1\s*=/m.test(source)) {
        declarations.push(relative);
      }
      if (source.includes(FORBIDDEN_WORLD_PACKAGE_HASH_ALIAS)) {
        forbiddenAliases.push(relative);
      }
      if (
        /\bSha256HashV1\b/.test(source) &&
        !relative.startsWith("packages/protocol/src/") &&
        !/from\s+["']@whitebox-world\/protocol["']/.test(source)
      ) {
        invalidConsumers.push(relative);
      }
    }

    expect(declarations).toEqual(["packages/protocol/src/hash.ts"]);
    expect(forbiddenAliases).toEqual([]);
    expect(invalidConsumers).toEqual([]);
  });

  it("does not import WorldPackage, Runtime, Gameplay, Babylon, Havok, DOM, Node fs, or network modules", () => {
    const productionSource = sourceFiles(path.join(PACKAGE_ROOT, "src"))
      .filter((file) => !file.endsWith(".test.ts"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    for (const forbidden of [
      "@whitebox-world/world-package",
      "@whitebox-world/runtime-contracts",
      "@whitebox-world/runtime-host",
      "@whitebox-world/gameplay",
      "@whitebox-world/gameplay-contracts",
      "@babylonjs/core",
      "@babylonjs/havok",
      "node:fs",
      "node:http",
      "node:https",
      "node:net",
    ]) {
      expect(productionSource).not.toContain(forbidden);
    }
  });
});
