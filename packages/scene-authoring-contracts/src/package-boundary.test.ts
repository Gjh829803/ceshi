import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

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

describe("Scene Authoring Contracts package boundary", () => {
  it("depends only on Protocol and lodash-es in production", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      "@whitebox-world/protocol",
      "lodash-es",
    ]);
  });

  it("does not import authoring, compiler, runtime, Babylon, WorldPackage, providers, or asset production", () => {
    const productionSource = sourceFiles(path.join(PACKAGE_ROOT, "src"))
      .filter((file) => !file.endsWith(".test.ts"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    for (const forbidden of [
      "@whitebox-world/authoring",
      "@whitebox-world/compiler",
      "@whitebox-world/runtime-contracts",
      "@whitebox-world/runtime-host",
      "@whitebox-world/world-package",
      "@whitebox-world/native-babylon",
      "@babylonjs/",
      "provider",
      "asset-production",
    ]) {
      expect(productionSource).not.toContain(forbidden);
    }
  });
});
