import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = new URL("../", import.meta.url);
const SOURCE_ROOT = new URL("./", import.meta.url);

const ALLOWED_BABYLON_IMPORTS = new Set([
  "@babylonjs/core/Meshes/mesh.js",
  "@babylonjs/core/scene.js",
]);

async function productionSources(): Promise<readonly Readonly<{
  path: string;
  source: string;
}>[]> {
  const names = (await readdir(SOURCE_ROOT))
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .sort();
  return Promise.all(names.map(async (name) => Object.freeze({
    path: fileURLToPath(new URL(name, SOURCE_ROOT)),
    source: await readFile(new URL(name, SOURCE_ROOT), "utf8"),
  })));
}

function importSpecifiers(source: string): readonly string[] {
  return [...source.matchAll(
    /(?:from\s+|import\s*\()\s*["']([^"']+)["']/g,
  )].map((match) => match[1]!).sort();
}

describe("@whitebox-world/native-babylon package boundary", () => {
  it("declares only its direct root dependencies and one AI-facing export", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("package.json", PACKAGE_ROOT), "utf8"),
    ) as Record<string, unknown>;

    expect(manifest.name).toBe("@whitebox-world/native-babylon");
    expect(manifest.exports).toEqual({ ".": "./src/index.ts" });
    expect(manifest.dependencies).toEqual({
      "@babylonjs/core": "9.23.0",
      "@whitebox-world/runtime-contracts": "workspace:*",
    });
  });

  it("uses only the frozen Deep ESM profile and imports no Runtime owner", async () => {
    const sources = await productionSources();
    expect(sources.map(({ path }) => path)).not.toHaveLength(0);

    for (const { path, source } of sources) {
      const specifiers = importSpecifiers(source);
      expect(specifiers, path).not.toContain("@babylonjs/core");
      expect(source, path).not.toMatch(/import\s+\*\s+as/);
      for (const specifier of specifiers) {
        if (specifier.startsWith("@babylonjs/core/")) {
          expect(ALLOWED_BABYLON_IMPORTS.has(specifier), path).toBe(true);
        }
        expect(specifier, path).not.toMatch(
          /runtime-babylon|@babylonjs\/havok|@whitebox-world\/(?:authoring|camera|character-movement|compiler|terrain-compiler|world)(?:\/|$)|^babylonjs$|^node:|^(?:fs|path|http|https|net|tls|dgram|dns)$/,
        );
      }
      expect(source, path).not.toMatch(
        /\b(?:window|document|fetch|WebSocket|setTimeout|setInterval)\b|Date\.now\s*\(|performance\.now\s*\(|Math\.random\s*\(/,
      );
    }
  });
});
