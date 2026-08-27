import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const PACKAGE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRECTORY = join(PACKAGE_DIRECTORY, "src");
const PRODUCTION_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"] as const;
const temporaryDirectories: string[] = [];
const FORBIDDEN_DEPENDENCIES = [
  "three",
  "@dimforge/rapier3d",
  "@dimforge/rapier3d-compat",
  "@babylonjs/core",
  "@babylonjs/havok",
  "@whitebox-world/subject-registry",
  "@whitebox-world/gameplay",
  "@whitebox-world/runtime-babylon",
  "@whitebox-world/runtime-contracts",
  "@whitebox-world/runtime-host",
] as const;

function productionSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return productionSourceFiles(entryPath);
    return entry.isFile() && PRODUCTION_EXTENSIONS.some((extension) => entry.name.endsWith(extension)) &&
      !entry.name.includes(".test.") && !entry.name.includes(".spec.") &&
      !entry.name.endsWith(".d.ts") && !entry.name.endsWith(".d.mts")
      ? [entryPath]
      : [];
  });
}

function forbiddenImportPattern(dependency: string): RegExp {
  return new RegExp(
    `(?:from\\s+|import\\s*(?:\\(\\s*)?)["']${dependency.replaceAll("/", "\\/")}(?:/[^"']+)?["']`,
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("@whitebox-world/camera package boundary", () => {
  it("depends only on gameplay-contracts as its authoritative state source", () => {
    const manifest = JSON.parse(
      readFileSync(join(PACKAGE_DIRECTORY, "package.json"), "utf8"),
    ) as { dependencies?: Readonly<Record<string, string>> };
    expect(Object.keys(manifest.dependencies ?? {})).toEqual([
      "@whitebox-world/gameplay-contracts",
    ]);
  });
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
    const productionSources = productionSourceFiles(SOURCE_DIRECTORY)
      .map((filePath) => readFileSync(filePath, "utf8"));

    for (const dependency of FORBIDDEN_DEPENDENCIES) {
      expect(productionSources.join("\n")).not.toMatch(
        forbiddenImportPattern(dependency),
      );
    }
  });

  it("matches forbidden provider roots and every provider subpath", () => {
    const pattern = forbiddenImportPattern("@babylonjs/core");
    expect('import "@babylonjs/core"').toMatch(pattern);
    expect('import { PhysicsCharacterController } from "@babylonjs/core/Physics/v2/physicsCharacterController"')
      .toMatch(pattern);
  });

  it("scans TSX and MTS production modules", () => {
    const directory = mkdtempSync(join(tmpdir(), "camera-boundary-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, "provider.tsx"), "export const provider = true;\n", "utf8");
    writeFileSync(join(directory, "adapter.mts"), "export const adapter = true;\n", "utf8");
    expect(productionSourceFiles(directory).map((file) => file.slice(directory.length + 1)).sort())
      .toEqual(["adapter.mts", "provider.tsx"]);
  });
});
