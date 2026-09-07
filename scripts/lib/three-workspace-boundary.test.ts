import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { scanWorkspaceBoundaries } from "./workspace-boundary";
import { checkThreeWorkspaceFiles, scanThreeWorkspace } from "./three-workspace-boundary";

it("rejects a dangling import after its workspace package was removed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "three-workspace-boundary-"));
  try {
    await mkdir(path.join(root, "scripts"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }));
    await writeFile(path.join(root, "scripts/main.ts"), 'import { run } from "@whitebox-world/runtime-babylon"; run();');
    expect(await scanWorkspaceBoundaries(root)).toEqual([]);
    expect(await scanThreeWorkspace(root)).toEqual(expect.arrayContaining([
      expect.objectContaining({ specifier: "@whitebox-world/runtime-babylon" }),
    ]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const retained = {
  "package.json": JSON.stringify({ name: "fixture" }),
  "packages/three-world/package.json": JSON.stringify({ name: "@worldkit/three", dependencies: { "@whitebox-world/camera-collision": "workspace:*" } }),
  "packages/camera-collision/package.json": JSON.stringify({ name: "@whitebox-world/camera-collision" }),
};

it("requires exactly the retained workspace package identities", () => {
  expect(checkThreeWorkspaceFiles(retained)).toEqual([]);
  expect(checkThreeWorkspaceFiles({ ...retained, "packages/old/package.json": '{"name":"@whitebox-world/old"}' }))
    .toContainEqual({ code: "THREE_WORKSPACE_PACKAGE", importer: "packages/old/package.json", specifier: "@whitebox-world/old" });
  expect(checkThreeWorkspaceFiles({ "package.json": "{}" })).toHaveLength(2);
});

it("checks real imports and every dependency scope while ignoring negative fixtures and history", () => {
  const source = [
    'import "@babylonjs/core";',
    'export { value } from "@whitebox-world/world";',
    'import("@whitebox-world/compiler");',
    'require("@whitebox-world/runtime-host");',
    'require.resolve("@whitebox-world/native-babylon");',
    'type Old = import("@whitebox-world/protocol").Old;',
    'const fixture = `import "@babylonjs/not-an-import";`;',
    'const negative = "@whitebox-world/test-fixture-string";',
    'import "@whitebox-world/camera-collision/testing";',
  ].join("\n");
  const manifest = { name: "fixture", dependencies: { "@babylonjs/havok": "1" }, devDependencies: { "@whitebox-world/dev-old": "*" }, peerDependencies: { "@whitebox-world/peer-old": "*" }, optionalDependencies: { "@whitebox-world/optional-old": "*" } };
  const violations = checkThreeWorkspaceFiles({ ...retained, "package.json": JSON.stringify(manifest), "scripts/use.ts": source, "docs/history.ts": 'import "@babylonjs/historical";' });
  expect(violations.map(({ specifier }) => specifier).sort()).toEqual([
    "@babylonjs/core", "@babylonjs/havok", "@whitebox-world/compiler", "@whitebox-world/dev-old",
    "@whitebox-world/native-babylon", "@whitebox-world/optional-old", "@whitebox-world/peer-old",
    "@whitebox-world/protocol", "@whitebox-world/runtime-host", "@whitebox-world/world",
  ].sort());
});
