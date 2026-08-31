import { readdir } from "node:fs/promises";
import path from "node:path";

import { parseNativeSceneCheckResultV1 } from
  "@whitebox-world/runtime-contracts";
import { afterEach, describe, expect, it } from "vitest";

import { checkBabylonNativeSceneWorldDirectoryV1 } from
  "./native-scene-check.js";
import {
  createNativeSceneWorkspaceFixtureV1,
  removeNativeSceneWorkspaceFixtureV1,
  VALID_NATIVE_SCENE_BOOTSTRAP_FIXTURE_V1,
} from "./test-support.js";

const roots: string[] = [];
const BUNDLE_PARENT = path.resolve(
  import.meta.dirname,
  "../../.codex-tmp/native-scene-check",
);

async function fixture(
  options?: Parameters<typeof createNativeSceneWorkspaceFixtureV1>[0],
): Promise<string> {
  const root = await createNativeSceneWorkspaceFixtureV1(options);
  roots.push(root);
  return root;
}

function source(body: string, imports = ""): string {
  return `
    import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
    ${imports}
    export default defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "pipeline-test",
      build(context) { ${body} },
    });
  `;
}

function validBody(): string {
  return `
    const mesh = createBlock(context.scene);
    context.registration.registerSpawnMarker({
      id: "player-spawn",
      positionMetersXYZ: [0, 1, 0],
      facingRadians: 0,
    });
    context.registration.registerStaticCollider({
      id: "ground",
      mesh,
      traversalBinding: { kind: "not-traversable" },
    });
  `;
}

async function runSource(
  sceneSource: string,
  bootstrap: unknown = VALID_NATIVE_SCENE_BOOTSTRAP_FIXTURE_V1,
) {
  const root = await fixture({
    bootstrap,
    files: { "scene.ts": sceneSource },
  });
  return {
    root,
    result: await checkBabylonNativeSceneWorldDirectoryV1(root),
  };
}

function firstCode(
  result: Awaited<ReturnType<
    typeof checkBabylonNativeSceneWorldDirectoryV1
  >>,
): string | undefined {
  return result.diagnostics[0]?.code;
}

afterEach(async () => {
  delete process.env.WORLDKIT_NATIVE_SCENE_TEST_FAILURE_MODE;
  await Promise.all(roots.splice(0).map(removeNativeSceneWorkspaceFixtureV1));
});

describe("checkBabylonNativeSceneWorldDirectoryV1", () => {
  it("checks one multi-file workspace through bundle and dual replay", async () => {
    const root = await fixture({
      files: {
        "scene.ts": source(
          validBody(),
          `import { createBlock } from "./src/geometry.js";`,
        ),
        "src/geometry.ts": `
          import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
          import type { Scene } from "@babylonjs/core/scene.js";
          export function createBlock(scene: Scene) {
            return MeshBuilder.CreateBox("ground", { size: 2 }, scene);
          }
        `,
      },
    });

    const result = await checkBabylonNativeSceneWorldDirectoryV1(root);

    expect(result.outcome).toBe("passed");
    expect(result.checkedInput).toEqual({
      kind: "native-scene-module",
      sceneModuleRef: VALID_NATIVE_SCENE_BOOTSTRAP_FIXTURE_V1.sceneModuleRef,
    });
    expect(parseNativeSceneCheckResultV1(result)).toEqual(result);
    expect(result.diagnostics).toEqual([]);
  }, 30_000);

  it.each([
    [
      "bootstrap",
      { bootstrap: { ...VALID_NATIVE_SCENE_BOOTSTRAP_FIXTURE_V1, schemaVersion: 2 } },
      "WORLDKIT_NATIVE_SCENE_BOOTSTRAP_INVALID",
      "unresolved-world",
    ],
    [
      "dependency",
      { files: { "scene.ts": `import "three"; ${source("")}` } },
      "WORLDKIT_NATIVE_SCENE_DEPENDENCY_FORBIDDEN",
      "native-scene-module",
    ],
    [
      "source",
      { files: { "scene.ts": source("setTimeout(() => {}, 1);") } },
      "WORLDKIT_NATIVE_SCENE_SOURCE_CAPABILITY_FORBIDDEN",
      "native-scene-module",
    ],
    [
      "typecheck",
      { files: { "scene.ts": source("const value: string = 1; void value;") } },
      "WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED",
      "native-scene-module",
    ],
    [
      "bundle",
      { files: { "scene.ts": `
        import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
        export default defineBabylonNativeScene({
          kind: "babylon-native-scene-module",
          id: (() => { throw new Error("private bundle detail"); })(),
          build() {},
        });
      ` } },
      "WORLDKIT_NATIVE_SCENE_BUNDLE_FAILED",
      "native-scene-module",
    ],
    [
      "profile",
      { bootstrap: {
        ...VALID_NATIVE_SCENE_BOOTSTRAP_FIXTURE_V1,
        nativeSceneProfileRef:
          "worldkit://native-scene-profile/not-registered@1",
      } },
      "WORLDKIT_NATIVE_SCENE_PROFILE_UNSUPPORTED",
      "native-scene-module",
    ],
    [
      "build",
      { files: { "scene.ts": source(`throw new Error("private build detail");`) } },
      "WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED",
      "native-scene-module",
    ],
    [
      "contribution",
      { files: { "scene.ts": source("") } },
      "WORLDKIT_NATIVE_SCENE_SPAWN_REQUIRED",
      "native-scene-module",
    ],
    [
      "authority",
      { files: { "scene.ts": source(`
        function writeRuntimeProperty(
          record: Record<string, unknown>,
          key: string,
        ): void {
          record[key] = {};
        }
        const authorityKey = ["active", "Camera"].join("");
        writeRuntimeProperty(
          context.scene as unknown as Record<string, unknown>,
          authorityKey,
        );
        context.registration.registerSpawnMarker({
          id: "player-spawn", positionMetersXYZ: [0, 1, 0], facingRadians: 0,
        });
      `) } },
      "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
      "native-scene-module",
    ],
    [
      "replay",
      { files: { "scene.ts": source(`
        context.registration.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [context.scene.getUniqueId(), 1, 0],
          facingRadians: 0,
        });
      `) } },
      "WORLDKIT_NATIVE_SCENE_RUNTIME_REPLAY_MISMATCH",
      "native-scene-module",
    ],
  ] as const)(
    "short-circuits and sanitizes a %s failure",
    async (_label, options, code, checkedKind) => {
      const root = await fixture(options);
      const result = await checkBabylonNativeSceneWorldDirectoryV1(root);

      expect(result.outcome).toBe("rejected");
      expect(firstCode(result)).toBe(code);
      expect(result.checkedInput.kind).toBe(checkedKind);
      expect(parseNativeSceneCheckResultV1(result)).toEqual(result);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(root);
      expect(serialized).not.toContain("private ");
      expect(serialized).not.toMatch(/(?:Error:|\n\s+at\s)/);
    },
    30_000,
  );

  it("keeps caught asset requests fail-closed", async () => {
    const { result } = await runSource(source(`
      context.assets.resolve({
        assetResourceRef: "worldkit://asset/not-locked@1",
      }).catch(() => undefined);
      context.registration.registerSpawnMarker({
        id: "player-spawn", positionMetersXYZ: [0, 1, 0], facingRadians: 0,
      });
    `));

    expect(result.outcome).toBe("rejected");
    expect(firstCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_ASSET_LOCK_UNAVAILABLE",
    );
  }, 30_000);

  it("maps unavailable roots to tooling results without reading test env", async () => {
    const missingRoot = path.join(await fixture(), "missing");
    const unavailable = await checkBabylonNativeSceneWorldDirectoryV1(missingRoot);
    expect(unavailable.outcome).toBe("tool-error");
    expect(unavailable.checkedInput.kind).toBe("unresolved-world");
    expect(firstCode(unavailable)).toBe(
      "WORLDKIT_NATIVE_SCENE_WORKSPACE_UNAVAILABLE",
    );

    process.env.WORLDKIT_NATIVE_SCENE_TEST_FAILURE_MODE = "candidate-cleanup";
    const { result: cleanup } = await runSource(source(`
      context.registration.registerSpawnMarker({
        id: "player-spawn", positionMetersXYZ: [0, 1, 0], facingRadians: 0,
      });
    `));
    expect(cleanup.outcome).toBe("passed");
    expect(cleanup.diagnostics).toEqual([]);
  }, 30_000);

  it("sorts diagnostics, removes temporary roots, and isolates concurrent checks", async () => {
    const rootsToCheck = await Promise.all([0, 1].map(() => fixture({
      files: { "scene.ts": source(`
        context.registration.registerSpawnMarker({
          id: "player-spawn", positionMetersXYZ: [0, 1, 0], facingRadians: 0,
        });
      `) },
    })));

    const results = await Promise.all(
      rootsToCheck.map(checkBabylonNativeSceneWorldDirectoryV1),
    );

    expect(results.map(({ outcome }) => outcome)).toEqual(["passed", "passed"]);
    expect(await readdir(BUNDLE_PARENT).catch(() => [])).toEqual([]);
  }, 30_000);
});
