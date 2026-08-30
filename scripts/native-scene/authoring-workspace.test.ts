import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  readBabylonNativeAuthoringWorkspaceRootV1,
} from "./authoring-workspace.js";
import {
  createNativeSceneWorkspaceFixtureV1,
  MINIMAL_NATIVE_SCENE_SOURCE_V1,
  removeNativeSceneWorkspaceFixtureV1,
  VALID_NATIVE_SCENE_BOOTSTRAP_FIXTURE_V1,
} from "./test-support.js";

const roots: string[] = [];

async function fixture(
  options?: Parameters<typeof createNativeSceneWorkspaceFixtureV1>[0],
): Promise<string> {
  const root = await createNativeSceneWorkspaceFixtureV1(options);
  roots.push(root);
  return root;
}

function firstCode(result: Awaited<ReturnType<
  typeof readBabylonNativeAuthoringWorkspaceRootV1
>>): string | undefined {
  return result.outcome === "passed" ? undefined : result.diagnostics[0]?.code;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeNativeSceneWorkspaceFixtureV1));
});

describe("Babylon Native authoring workspace root", () => {
  it("loads only the exact Bootstrap and scene.ts entry contract", async () => {
    const root = await fixture();
    const result = await readBabylonNativeAuthoringWorkspaceRootV1(root);

    expect(result.outcome).toBe("passed");
    if (result.outcome !== "passed") return;
    expect(result.workspaceRoot.worldDirectoryPath).toBe(await import("node:fs/promises").then(
      ({ realpath }) => realpath(root),
    ));
    expect(result.workspaceRoot.entrySourcePath).toBe("scene.ts");
    expect(result.workspaceRoot.bootstrap).toEqual(
      VALID_NATIVE_SCENE_BOOTSTRAP_FIXTURE_V1,
    );
  });

  it("separates missing/invalid Bootstrap, missing entry, and unavailable root", async () => {
    const missingBootstrap = await fixture({
      omitBootstrap: true,
      files: { "scene.ts": MINIMAL_NATIVE_SCENE_SOURCE_V1 },
    });
    const invalidBootstrap = await fixture({
      bootstrap: { ...VALID_NATIVE_SCENE_BOOTSTRAP_FIXTURE_V1, schemaVersion: 2 },
    });
    const missingEntry = await fixture({ files: {} });
    const missingRoot = path.join(await fixture(), "does-not-exist");

    expect(firstCode(await readBabylonNativeAuthoringWorkspaceRootV1(
      missingBootstrap,
    ))).toBe("WORLDKIT_NATIVE_SCENE_BOOTSTRAP_MISSING");
    expect(firstCode(await readBabylonNativeAuthoringWorkspaceRootV1(
      invalidBootstrap,
    ))).toBe("WORLDKIT_NATIVE_SCENE_BOOTSTRAP_INVALID");
    expect(firstCode(await readBabylonNativeAuthoringWorkspaceRootV1(
      missingEntry,
    ))).toBe("WORLDKIT_NATIVE_SCENE_DEPENDENCY_UNRESOLVED");
    const unavailable = await readBabylonNativeAuthoringWorkspaceRootV1(missingRoot);
    expect(unavailable.outcome).toBe("tool-error");
    expect(firstCode(unavailable)).toBe("WORLDKIT_NATIVE_SCENE_WORKSPACE_UNAVAILABLE");
  });

  it("rejects symlinked entry and a directory passed as scene.ts", async () => {
    const symlinked = await fixture({ files: { "actual.ts": MINIMAL_NATIVE_SCENE_SOURCE_V1 } });
    await symlink("actual.ts", path.join(symlinked, "scene.ts"));
    const directoryEntry = await fixture({ files: {} });
    await mkdir(path.join(directoryEntry, "scene.ts"));

    expect(firstCode(await readBabylonNativeAuthoringWorkspaceRootV1(
      symlinked,
    ))).toBe("WORLDKIT_NATIVE_SCENE_SOURCE_SYMLINK_FORBIDDEN");
    expect(firstCode(await readBabylonNativeAuthoringWorkspaceRootV1(
      directoryEntry,
    ))).toBe("WORLDKIT_NATIVE_SCENE_DEPENDENCY_UNRESOLVED");
  });

  it("ignores user package, TypeScript, and Vite configuration", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "package.json"), "{ not-json", "utf8");
    await writeFile(path.join(root, "tsconfig.json"), "{ not-json", "utf8");
    await writeFile(
      path.join(root, "vite.config.ts"),
      "throw new Error('must not execute');",
      "utf8",
    );

    expect((await readBabylonNativeAuthoringWorkspaceRootV1(root)).outcome)
      .toBe("passed");
  });
});
