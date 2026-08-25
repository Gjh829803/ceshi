import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRECTORY = join(PACKAGE_DIRECTORY, "src");
const FORBIDDEN_DEPENDENCIES = [
  "three",
  "@dimforge/rapier3d",
  "@dimforge/rapier3d-compat",
  "@babylonjs/core",
  "@babylonjs/havok",
  "@whitebox-world/subject-registry",
  "@whitebox-world/gameplay",
  "@whitebox-world/gameplay-contracts",
  "@whitebox-world/runtime-babylon",
  "@whitebox-world/runtime-contracts",
  "@whitebox-world/runtime-host",
] as const;

function productionTypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [entryPath]
      : [];
  });
}

describe("@whitebox-world/camera package boundary", () => {
  it("has no renderer, physics, Registry, Gameplay, or Runtime dependency", () => {
    const manifest = JSON.parse(
      readFileSync(join(PACKAGE_DIRECTORY, "package.json"), "utf8"),
    ) as {
      dependencies?: Readonly<Record<string, string>>;
      devDependencies?: Readonly<Record<string, string>>;
    };
    const declaredDependencies = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]);

    expect(
      FORBIDDEN_DEPENDENCIES.filter((dependency) =>
        declaredDependencies.has(dependency)
      ),
    ).toEqual([]);
  });

  it("has no production import from a forbidden provider or consumer", () => {
    const productionSources = productionTypeScriptFiles(SOURCE_DIRECTORY)
      .map((filePath) => readFileSync(filePath, "utf8"));

    for (const dependency of FORBIDDEN_DEPENDENCIES) {
      expect(productionSources.join("\n")).not.toMatch(
        new RegExp(`(?:from\\s+|import\\s*\\()?["']${dependency.replaceAll("/", "\\/")}`),
      );
    }
  });
});
