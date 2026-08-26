import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRECTORY = join(PACKAGE_DIRECTORY, "src");
const WORKSPACE_ROOT = join(PACKAGE_DIRECTORY, "..", "..");
const EXPECTED_DEPENDENCIES = [
  "@whitebox-world/authoring",
  "@whitebox-world/authoring-edit",
  "@whitebox-world/compiler",
  "@whitebox-world/gameplay",
  "@whitebox-world/gameplay-contracts",
  "@whitebox-world/protocol",
  "@whitebox-world/world-package",
  "lodash-es",
] as const;
const FORBIDDEN_DEPENDENCIES = [
  "three",
  "@dimforge/rapier3d",
  "@dimforge/rapier3d-compat",
  "@babylonjs/core",
  "@babylonjs/havok",
  "@whitebox-world/runtime-babylon",
  "@whitebox-world/runtime-host",
  "@whitebox-world/subject-registry",
  "@whitebox-world/validation",
] as const;
const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["']node:fs(?:\/promises)?["']/,
  /from\s+["']fs(?:\/promises)?["']/,
  /from\s+["']apps\//,
  /from\s+["']scripts\//,
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

describe("@whitebox-world/authoring-host package boundary", () => {
  it("depends only on Authoring, Edit, Compiler, Gameplay, Package, and protocol", () => {
    const manifest = JSON.parse(
      readFileSync(join(PACKAGE_DIRECTORY, "package.json"), "utf8"),
    ) as {
      dependencies?: Readonly<Record<string, string>>;
      devDependencies?: Readonly<Record<string, unknown>>;
    };
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      ...EXPECTED_DEPENDENCIES,
    ].sort());
    expect(manifest.devDependencies ?? {}).toEqual({});
    expect(
      FORBIDDEN_DEPENDENCIES.filter((dependency) =>
        Object.hasOwn(manifest.dependencies ?? {}, dependency),
      ),
    ).toEqual([]);
  });

  it("has no production import from Runtime, Validation, apps, scripts, or the filesystem", () => {
    const joined = productionTypeScriptFiles(SOURCE_DIRECTORY)
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");
    for (const dependency of FORBIDDEN_DEPENDENCIES) {
      expect(joined).not.toMatch(
        new RegExp(`(?:from\\s+|import\\s*\\()?["']${dependency.replaceAll("/", "\\/")}`),
      );
    }
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      expect(joined).not.toMatch(pattern);
    }
  });

  it("is not a dependency of runtime-host", () => {
    const manifest = JSON.parse(
      readFileSync(join(WORKSPACE_ROOT, "packages/runtime-host/package.json"), "utf8"),
    ) as {
      dependencies?: Readonly<Record<string, string>>;
      devDependencies?: Readonly<Record<string, string>>;
    };
    expect(manifest.dependencies?.["@whitebox-world/authoring-host"]).toBeUndefined();
    expect(manifest.devDependencies?.["@whitebox-world/authoring-host"]).toBeUndefined();
  });
});
