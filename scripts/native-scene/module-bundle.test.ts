import {
  appendFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ts from "typescript";

import {
  buildBabylonNativeSceneModuleBundleV1,
  loadExactBabylonNativeSceneModuleFileV1,
  buildAndLoadBabylonNativeSceneModuleV1,
  finalizeBabylonNativeSceneModuleBundleManifestV1,
} from "./module-bundle.js";
import { admitBabylonNativeSourceGraphV1 } from "./source-admission.js";
import {
  createNativeSceneWorkspaceFixtureV1,
  removeNativeSceneWorkspaceFixtureV1,
} from "./test-support.js";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const BUNDLE_PARENT = path.join(
  REPOSITORY_ROOT,
  ".codex-tmp/native-scene-check",
);
const roots: string[] = [];
const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;

async function fixture(
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<string> {
  const root = await createNativeSceneWorkspaceFixtureV1({ files });
  roots.push(root);
  return root;
}

async function runFixture(
  files: Readonly<Record<string, string | Uint8Array>>,
) {
  const admitted = await admitBabylonNativeSourceGraphV1(await fixture(files));
  expect(admitted.outcome).toBe("passed");
  if (admitted.outcome !== "passed") throw new Error("fixture admission failed");
  return buildAndLoadBabylonNativeSceneModuleV1(admitted.sourceGraph);
}

async function bundleEntries(): Promise<readonly string[]> {
  return readdir(BUNDLE_PARENT).catch(() => []);
}

beforeEach(async () => {
  await rm(BUNDLE_PARENT, { recursive: true, force: true });
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeNativeSceneWorkspaceFixtureV1));
});

describe("Babylon Native deterministic Module bundle", () => {
  it("emits root-independent bytes and finalizes only lock-bound manifest identity", async () => {
    const files = {
      "scene.ts": `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { moduleId } from "./src/module-id.js";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module", id: moduleId, build() {}
        });
      `,
      "src/module-id.ts": `export const moduleId = "deterministic-module";`,
    } as const;
    const fixtureRoots = await Promise.all([fixture(files), fixture(files)]);
    const graphs = await Promise.all(fixtureRoots.map(
      async (worldDirectoryPath) => {
        const admitted = await admitBabylonNativeSourceGraphV1(worldDirectoryPath);
        if (admitted.outcome !== "passed") throw new Error("fixture admission failed");
        return admitted.sourceGraph;
      },
    ));
    const results = await Promise.all(graphs.map((graph) =>
      buildBabylonNativeSceneModuleBundleV1(graph)));
    expect(results.map((result) => result.outcome)).toEqual(["passed", "passed"]);
    if (results[0]?.outcome !== "passed" || results[1]?.outcome !== "passed") return;

    expect(results[0].bundleArtifact).toEqual(results[1].bundleArtifact);
    expect(results[0].bundleArtifact.entryPath).toBe("native/scene.mjs");
    expect(results[0].bundleArtifact.externalImportSpecifiers).toEqual([
      "@whitebox-world/native-babylon",
    ]);
    expect(results[0].bundleArtifact.files[0]?.bytes).toEqual(
      results[1].bundleArtifact.files[0]?.bytes,
    );

    const facts = {
      id: "deterministic-module-bundle",
      sceneModuleRef: "worldkit://native-scene/deterministic-module@1",
      nativeSceneApi: {
        resourceRef: "worldkit://native-scene-api/babylon-native@1",
        resolvedVersion: "1",
        contentHash: HASH_A,
      },
      nativeSceneProfile: {
        resourceRef: "worldkit://native-scene-profile/whitebox.standard@1",
        resolvedVersion: "1",
        contentHash: HASH_B,
      },
      seed: 42,
      dependencyLockHash: HASH_A,
      assetLockHash: HASH_B,
    } as const;
    const finalized = [
      finalizeBabylonNativeSceneModuleBundleManifestV1({
        ...facts,
        bundleArtifact: results[0].bundleArtifact,
      }),
      finalizeBabylonNativeSceneModuleBundleManifestV1({
        ...facts,
        bundleArtifact: results[1].bundleArtifact,
      }),
    ];
    expect(finalized[0]?.manifestBytes).toEqual(finalized[1]?.manifestBytes);
    expect(finalized[0]?.manifestHash).toBe(finalized[1]?.manifestHash);

    const changedLock = finalizeBabylonNativeSceneModuleBundleManifestV1({
      ...facts,
      bundleArtifact: results[0].bundleArtifact,
      dependencyLockHash: HASH_C,
    });
    expect(changedLock.manifestHash).not.toBe(finalized[0]?.manifestHash);
    expect(results[0].bundleArtifact.files).toEqual(results[1].bundleArtifact.files);
    expect(results[0].bundleArtifact.sourceGraphHash).toBe(
      results[1].bundleArtifact.sourceGraphHash,
    );
  }, 45_000);

  it("rejects reordered or escaping admitted source paths before bundling", async () => {
    const admitted = await admitBabylonNativeSourceGraphV1(await fixture({
      "scene.ts": `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { id } from "./src/id.js";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module", id, build() {}
        });
      `,
      "src/id.ts": `export const id = "invalid-graph";`,
    }));
    if (admitted.outcome !== "passed") throw new Error("fixture admission failed");
    for (const sourcePaths of [
      [...admitted.sourceGraph.workspace.sourcePaths].reverse(),
      ["../scene.ts"],
    ]) {
      const result = await buildBabylonNativeSceneModuleBundleV1(Object.freeze({
        ...admitted.sourceGraph,
        workspace: Object.freeze({
          ...admitted.sourceGraph.workspace,
          sourcePaths: Object.freeze(sourcePaths),
        }),
      }));
      expect(result.outcome).toBe("rejected");
      if (result.outcome !== "passed") {
        expect(result.diagnostics[0]?.code).toBe(
          "WORLDKIT_NATIVE_SCENE_BUNDLE_ARTIFACT_INVALID",
        );
      }
    }
  }, 20_000);

  it("rejects source maps, Host path leakage, and non-JavaScript output", async () => {
    const admitted = await admitBabylonNativeSourceGraphV1(await fixture({
      "scene.ts": `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module", id: "closed-output", build() {}
        });
      `,
    }));
    if (admitted.outcome !== "passed") throw new Error("fixture admission failed");
    const mutators = [
      async (outputRoot: string) => appendFile(
        path.join(outputRoot, "scene.mjs"),
        "\n//# sourceMappingURL=scene.mjs.map\n",
      ),
      async (outputRoot: string) => appendFile(
        path.join(outputRoot, "scene.mjs"),
        `\n/* ${outputRoot} */\n`,
      ),
      async (outputRoot: string) => writeFile(
        path.join(outputRoot, "unlisted.txt"),
        "not admitted",
      ),
    ];
    for (const afterBundleOutput of mutators) {
      const result = await buildBabylonNativeSceneModuleBundleV1(
        admitted.sourceGraph,
        { afterBundleOutput },
      );
      expect(result.outcome).toBe("rejected");
      if (result.outcome !== "passed") {
        expect(result.diagnostics[0]?.code).toBe(
          "WORLDKIT_NATIVE_SCENE_BUNDLE_ARTIFACT_INVALID",
        );
      }
    }
  }, 45_000);

  it("rejects Bundle byte tampering before manifest finalization", async () => {
    const admitted = await admitBabylonNativeSourceGraphV1(await fixture({
      "scene.ts": `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module", id: "tamper", build() {}
        });
      `,
    }));
    if (admitted.outcome !== "passed") throw new Error("fixture admission failed");
    const result = await buildBabylonNativeSceneModuleBundleV1(admitted.sourceGraph);
    if (result.outcome !== "passed") throw new Error("fixture bundle failed");
    const entry = result.bundleArtifact.files[0]!;
    const tampered = {
      ...result.bundleArtifact,
      files: [{ ...entry, bytes: [...entry.bytes, 0] }],
    };
    expect(() => finalizeBabylonNativeSceneModuleBundleManifestV1({
      bundleArtifact: tampered,
      id: "tampered-bundle",
      sceneModuleRef: "worldkit://native-scene/tamper@1",
      nativeSceneApi: {
        resourceRef: "worldkit://native-scene-api/babylon-native@1",
        resolvedVersion: "1",
        contentHash: HASH_A,
      },
      nativeSceneProfile: {
        resourceRef: "worldkit://native-scene-profile/whitebox.standard@1",
        resolvedVersion: "1",
        contentHash: HASH_B,
      },
      seed: 42,
      dependencyLockHash: HASH_A,
      assetLockHash: HASH_B,
    })).toThrow();
  }, 20_000);
  it("typechecks and loads sync, async, multi-file, and type-only Modules", async () => {
    const sync = await runFixture({
      "scene.ts": `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "sync-module",
          build() {},
        });
      `,
    });
    expect(sync.outcome).toBe("passed");
    if (sync.outcome === "passed") expect(sync.module.id).toBe("sync-module");

    const asyncModule = await runFixture({
      "scene.ts": `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "async-module",
          async build() { await Promise.resolve(); },
        });
      `,
    });
    expect(asyncModule.outcome).toBe("passed");
    if (asyncModule.outcome === "passed") {
      expect(asyncModule.module.id).toBe("async-module");
    }

    const multiFile = await runFixture({
      "scene.ts": `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import { buildGeometry } from "./src/geometry.js";
        import type { GeometryTag } from "./src/types.js";
        export type { GeometryTag } from "./src/types.js";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "multi-file-module",
          build() {
            const tag: GeometryTag = "geometry";
            buildGeometry(tag);
          },
        });
      `,
      "src/geometry.ts": `
        import type { GeometryTag } from "./types.js";
        export function buildGeometry(tag: GeometryTag): void { void tag; }
      `,
      "src/types.ts": `export type GeometryTag = "geometry";`,
    });
    expect(multiFile.outcome).toBe("passed");
    if (multiFile.outcome === "passed") {
      expect(multiFile.module.id).toBe("multi-file-module");
    }
    expect(await bundleEntries()).toEqual([]);
  }, 60_000);

  it("loads the admitted Block Profile workspace dependency", async () => {
    const result = await runFixture({
      "scene.ts": `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        import {
          BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
        } from "@whitebox-world/native-babylon-block-profile";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "block-profile-module",
          build() { void BABYLON_NATIVE_BLOCK_PROFILE_REF_V1; },
        });
      `,
    });
    expect(result.outcome).toBe("passed");
    if (result.outcome === "passed") {
      expect(result.module.id).toBe("block-profile-module");
    }
    expect(await bundleEntries()).toEqual([]);
  }, 20_000);

  it("maps TypeScript failures to stable relative diagnostics", async () => {
    const root = await fixture({
      "scene.ts": `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: "type-failure",
          build() { const value: string = 1; void value; },
        });
      `,
    });
    const admitted = await admitBabylonNativeSourceGraphV1(root);
    expect(admitted.outcome).toBe("passed");
    if (admitted.outcome !== "passed") return;

    const result = await buildAndLoadBabylonNativeSceneModuleV1(
      admitted.sourceGraph,
    );
    expect(result.outcome).toBe("rejected");
    if (result.outcome === "passed") return;
    expect(result.diagnostics).not.toHaveLength(0);
    expect(result.diagnostics.every((diagnostic) =>
      diagnostic.code === "WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED" &&
      diagnostic.stage === "typecheck" &&
      diagnostic.location.kind === "source" &&
      diagnostic.location.sourcePath === "scene.ts"
    )).toBe(true);
    expect(JSON.stringify(result.diagnostics)).not.toContain(root);
    expect(await bundleEntries()).toEqual([]);
  }, 20_000);

  it("rejects throwing evaluation and removes the temporary bundle", async () => {
    const result = await runFixture({
      "scene.ts": `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: (() => { throw new Error("must stay private"); })(),
          build() {},
        });
      `,
    });
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "passed") {
      expect(result.diagnostics[0]?.code).toBe(
        "WORLDKIT_NATIVE_SCENE_BUNDLE_FAILED",
      );
      expect(JSON.stringify(result.diagnostics)).not.toContain("must stay private");
    }
    expect(await bundleEntries()).toEqual([]);
  }, 20_000);

  it("preserves a bundle rejection when temporary cleanup also fails", async () => {
    const worldDirectoryPath = await fixture({
      "scene.ts": `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: (() => { throw new Error("must stay private"); })(),
          build() {},
        });
      `,
    });
    const admitted = await admitBabylonNativeSourceGraphV1(worldDirectoryPath);
    expect(admitted.outcome).toBe("passed");
    if (admitted.outcome !== "passed") return;

    const result = await buildAndLoadBabylonNativeSceneModuleV1(
      admitted.sourceGraph,
      {
        async removeTemporaryRoot(runRoot) {
          await rm(runRoot, { force: true, recursive: true });
          throw new Error("forced cleanup failure");
        },
      },
    );

    expect(result.outcome).toBe("tool-error");
    if (result.outcome === "passed") return;
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "WORLDKIT_NATIVE_SCENE_BUNDLE_FAILED",
      "WORLDKIT_NATIVE_SCENE_TOOL_INTERNAL_FAILED",
    ]);
    expect(await bundleEntries()).toEqual([]);
  }, 20_000);

  it("maps a real Vite resolution failure and removes its temporary root", async () => {
    const worldDirectoryPath = await fixture({
      "scene.ts": `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module", id: "bundle-failure", build() {}
        });
      `,
    });
    const admitted = await admitBabylonNativeSourceGraphV1(worldDirectoryPath);
    expect(admitted.outcome).toBe("passed");
    if (admitted.outcome !== "passed") return;

    const entryPath = path.join(
      admitted.sourceGraph.workspace.worldDirectoryPath,
      "scene.ts",
    );
    const brokenSource = `
      // @ts-ignore -- adversarial admitted-graph boundary fixture
      import "./src/missing.js";
      // @ts-ignore -- no dependency resolution in this boundary fixture
      import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
      export default defineBabylonNativeScene({
        kind: "babylon-native-scene-module", id: "bundle-failure", build() {}
      });
    `;
    const options: ts.CompilerOptions = {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      noResolve: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      types: [],
    };
    const host = ts.createCompilerHost(options, true);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    const originalFileExists = host.fileExists.bind(host);
    const originalReadFile = host.readFile.bind(host);
    host.getSourceFile = (fileName, languageVersion) =>
      path.normalize(fileName) === path.normalize(entryPath)
        ? ts.createSourceFile(
            entryPath,
            brokenSource,
            languageVersion,
            true,
            ts.ScriptKind.TS,
          )
        : originalGetSourceFile(fileName, languageVersion);
    host.fileExists = (fileName) =>
      path.normalize(fileName) === path.normalize(entryPath) ||
      originalFileExists(fileName);
    host.readFile = (fileName) =>
      path.normalize(fileName) === path.normalize(entryPath)
        ? brokenSource
        : originalReadFile(fileName);
    const brokenGraph = Object.freeze({
      ...admitted.sourceGraph,
      program: ts.createProgram({ rootNames: [entryPath], options, host }),
    });

    const result = await buildAndLoadBabylonNativeSceneModuleV1(
      brokenGraph,
    );
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "passed") {
      expect(result.diagnostics[0]?.code).toBe(
        "WORLDKIT_NATIVE_SCENE_BUNDLE_FAILED",
      );
    }
    expect(await bundleEntries()).toEqual([]);
  }, 20_000);

  it("treats a missing admitted snapshot as a tooling failure and cleans up", async () => {
    const worldDirectoryPath = await fixture({
      "scene.ts": `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module", id: "missing-snapshot", build() {}
        });
      `,
    });
    const admitted = await admitBabylonNativeSourceGraphV1(worldDirectoryPath);
    expect(admitted.outcome).toBe("passed");
    if (admitted.outcome !== "passed") return;
    const brokenGraph = Object.freeze({
      ...admitted.sourceGraph,
      workspace: Object.freeze({
        ...admitted.sourceGraph.workspace,
        sourcePaths: Object.freeze(["scene.ts", "src/missing.ts"]),
      }),
    });

    const result = await buildAndLoadBabylonNativeSceneModuleV1(
      brokenGraph,
    );
    expect(result.outcome).toBe("tool-error");
    if (result.outcome !== "passed") {
      expect(result.diagnostics[0]?.code).toBe(
        "WORLDKIT_NATIVE_SCENE_TOOL_INTERNAL_FAILED",
      );
      expect(result.diagnostics[0]?.stage).toBe("tooling");
    }
    expect(await bundleEntries()).toEqual([]);
  }, 20_000);

  it("uses unique temporary roots for concurrent bundles and removes both", async () => {
    const admittedGraphs = await Promise.all(["concurrent-a", "concurrent-b"].map(
      async (id) => {
        const admitted = await admitBabylonNativeSourceGraphV1(await fixture({
          "scene.ts": `
            import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
            export default defineBabylonNativeScene({
              kind: "babylon-native-scene-module",
              id: ${JSON.stringify(id)},
              build() {},
            });
          `,
        }));
        if (admitted.outcome !== "passed") throw new Error("fixture admission failed");
        return admitted.sourceGraph;
      },
    ));

    const runs = admittedGraphs.map((graph) =>
      buildAndLoadBabylonNativeSceneModuleV1(graph));
    const observedNames = new Set<string>();
    while (true) {
      for (const name of await bundleEntries()) observedNames.add(name);
      const settled = await Promise.race([
        Promise.all(runs).then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 2)),
      ]);
      if (settled) break;
    }
    const results = await Promise.all(runs);
    expect(results.map((result) => result.outcome)).toEqual(["passed", "passed"]);
    expect(observedNames.size).toBeGreaterThanOrEqual(2);
    expect(await bundleEntries()).toEqual([]);
  }, 45_000);

  it("loads only an exact default Module namespace", async () => {
    await mkdir(BUNDLE_PARENT, { recursive: true });
    const root = await mkdtemp(path.join(BUNDLE_PARENT, "loader-test-"));
    try {
      const cases = [
        ["extra.mjs", `
          import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
          export const extra = 1;
          export default defineBabylonNativeScene({
            kind: "babylon-native-scene-module", id: "extra", build() {}
          });
        `],
        ["missing.mjs", "export const value = 1;"],
        ["non-module.mjs", "export default Object.freeze({ value: 1 });"],
      ] as const;
      for (const [name, source] of cases) {
        const filePath = path.join(root, name);
        await writeFile(filePath, source, "utf8");
        const result = await loadExactBabylonNativeSceneModuleFileV1(filePath);
        expect(result.outcome).toBe("rejected");
        if (result.outcome !== "passed") {
          expect(result.diagnostics[0]?.code).toBe(
            "WORLDKIT_NATIVE_SCENE_MODULE_EXPORT_INVALID",
          );
        }
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
