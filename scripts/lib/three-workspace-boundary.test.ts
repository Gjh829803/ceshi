import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { scanWorkspaceBoundaries } from "./workspace-boundary";
import { checkThreeWorkspaceFiles, scanThreeWorkspace, RETAINED_PACKAGES } from "./three-workspace-boundary";

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
  ...Object.fromEntries([...RETAINED_PACKAGES].map(([file, name]) => [file, JSON.stringify({name})])),
  "package.json": JSON.stringify({name: "fixture"}),
};

it("requires exactly the retained workspace package identities", () => {
  expect(checkThreeWorkspaceFiles(retained)).toEqual([]);
  expect(checkThreeWorkspaceFiles({ ...retained, "packages/old/package.json": '{"name":"@whitebox-world/old"}' }))
    .toContainEqual({ code: "THREE_WORKSPACE_PACKAGE", importer: "packages/old/package.json", specifier: "@whitebox-world/old" });
  expect(checkThreeWorkspaceFiles({ ...retained, "apps/sdk-playground/package.json": '{"name":"@worldkit/unknown"}' }))
    .toContainEqual({ code: "THREE_WORKSPACE_PACKAGE", importer: "apps/sdk-playground/package.json", specifier: "@worldkit/unknown" });
  expect(checkThreeWorkspaceFiles({ "package.json": "{}" })).toHaveLength(RETAINED_PACKAGES.size);
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
    'import "@worldkit/camera-collision/testing";',
  ].join("\n");
  const manifest = { name: "fixture", dependencies: { "@babylonjs/havok": "1" }, devDependencies: { "@whitebox-world/dev-old": "*" }, peerDependencies: { "@whitebox-world/peer-old": "*" }, optionalDependencies: { "@whitebox-world/optional-old": "*" } };
  const violations = checkThreeWorkspaceFiles({ ...retained, "package.json": JSON.stringify(manifest), "packages/preset-content/use.ts": source, "docs/history.ts": 'import "@babylonjs/historical";' });
  expect(violations.map(({ specifier }) => specifier).sort()).toEqual([
    "@babylonjs/core", "@babylonjs/havok", "@whitebox-world/compiler", "@whitebox-world/dev-old",
    "@whitebox-world/native-babylon", "@whitebox-world/optional-old", "@whitebox-world/peer-old",
    "@whitebox-world/protocol", "@whitebox-world/runtime-host", "@whitebox-world/world",
  ].sort());
});


it("detects escaped retired specifiers in every executable form, including generated files", () => {
  const source = [
    String.raw`import "\u0040babylonjs/core";`,
    String.raw`export * from "\x40whitebox-world/exported";`,
    String.raw`import legacy = require("@whitebox-\u0077orld/equal");`,
    String.raw`type Old = import("@whitebox-world\/types").Old;`,
    String.raw`require.resolve("@whitebox-worl\d/runtime");`,
    'import(`@babylonjs/template`);',
    String.raw`import("@baby\
lonjs/continued");`,
    '// import "@babylonjs/comment";',
    'const negative = "@whitebox-world/fixture";',
  ].join("\n");
  const violations = checkThreeWorkspaceFiles({...retained, "packages/three-world/src/validator.generated.ts": source});
  expect(violations.map(({specifier}) => specifier).sort()).toEqual([
    "@babylonjs/core", "@babylonjs/template", "@babylonjs/continued",
    "@whitebox-world/exported", "@whitebox-world/equal", "@whitebox-world/types", "@whitebox-world/runtime",
  ].sort());
});
