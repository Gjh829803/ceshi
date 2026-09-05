import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, expect, it } from "vitest";

import {
  reconcileWorkspaceBoundaryDebt,
  scanWorkspaceBoundaries,
  type WorkspaceBoundaryDebtV1,
} from "../lib/workspace-boundary";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(options: {
  readonly aDependencies?: Record<string, string>;
  readonly aDevDependencies?: Record<string, string>;
  readonly bDependencies?: Record<string, string>;
  readonly bExports?: Record<string, string>;
  readonly source?: string;
  readonly sourcePath?: string;
}) {
  const root = await mkdtemp(path.join(tmpdir(), "workspace-boundary-"));
  roots.push(root);
  await Promise.all([
    mkdir(path.join(root, "packages/a/src"), { recursive: true }),
    mkdir(path.join(root, "packages/b/src"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture-root", private: true })),
    writeFile(path.join(root, "packages/a/package.json"), JSON.stringify({
      name: "@fixture/a",
      exports: { ".": "./src/index.ts" },
      dependencies: options.aDependencies ?? {},
      devDependencies: options.aDevDependencies ?? {},
    })),
    writeFile(path.join(root, "packages/b/package.json"), JSON.stringify({
      name: "@fixture/b",
      exports: options.bExports ?? { ".": "./src/index.ts", "./testing": "./src/testing.ts" },
      dependencies: options.bDependencies ?? {},
    })),
    writeFile(path.join(root, "packages/a/src/index.ts"), "export {};\n"),
    writeFile(path.join(root, "packages/b/src/index.ts"), "export {};\n"),
    writeFile(path.join(root, "packages/b/src/testing.ts"), "export {};\n"),
  ]);
  const sourcePath = path.join(root, options.sourcePath ?? "packages/a/src/consumer.ts");
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, options.source ?? "export {};\n");
  return root;
}

it("detects missing direct, private sibling, production-to-dev, and invalid export edges", async () => {
  const missing = await fixture({ source: 'import "@fixture/b";\n' });
  await expect(scanWorkspaceBoundaries(missing)).resolves.toEqual([
    expect.objectContaining({ code: "WORKSPACE_DIRECT_DEPENDENCY_MISSING", specifier: "@fixture/b" }),
  ]);

  const privateSibling = await fixture({ source: 'import "../../b/src/index";\n' });
  await expect(scanWorkspaceBoundaries(privateSibling)).resolves.toEqual([
    expect.objectContaining({ code: "WORKSPACE_PRIVATE_SIBLING_SOURCE" }),
  ]);

  const productionDev = await fixture({
    aDevDependencies: { "@fixture/b": "workspace:*" },
    source: 'import "@fixture/b";\n',
  });
  await expect(scanWorkspaceBoundaries(productionDev)).resolves.toEqual([
    expect.objectContaining({ code: "WORKSPACE_PRODUCTION_DEPENDENCY_IN_DEV" }),
  ]);

  const missingExport = await fixture({
    aDependencies: { "@fixture/b": "workspace:*" },
    bExports: { ".": "./src/index.ts", "./missing": "./src/does-not-exist.ts" },
    source: 'import "@fixture/b/missing";\n',
  });
  await expect(scanWorkspaceBoundaries(missingExport)).resolves.toEqual([
    expect.objectContaining({ code: "WORKSPACE_EXPORT_NOT_PUBLIC" }),
  ]);
});

it("rejects production testing exports but permits an explicit testing export in tests", async () => {
  const production = await fixture({
    aDependencies: { "@fixture/b": "workspace:*" },
    source: 'import "@fixture/b/testing";\n',
  });
  await expect(scanWorkspaceBoundaries(production)).resolves.toEqual([
    expect.objectContaining({ code: "WORKSPACE_PRODUCTION_TEST_EXPORT" }),
  ]);

  const testOnly = await fixture({
    aDevDependencies: { "@fixture/b": "workspace:*" },
    sourcePath: "packages/a/src/consumer.test.ts",
    source: 'import "@fixture/b/testing";\n',
  });
  await expect(scanWorkspaceBoundaries(testOnly)).resolves.toEqual([]);
});

it("reports production dependency cycles deterministically", async () => {
  const root = await fixture({
    aDependencies: { "@fixture/b": "workspace:*" },
    bDependencies: { "@fixture/a": "workspace:*" },
  });
  await expect(scanWorkspaceBoundaries(root)).resolves.toEqual([
    expect.objectContaining({
      code: "WORKSPACE_DEPENDENCY_CYCLE",
      message: expect.stringContaining("@fixture/a -> @fixture/b -> @fixture/a"),
    }),
  ]);
});

it("fails closed for unregistered, stale, wildcard, and incomplete debt", () => {
  const violation = {
    code: "WORKSPACE_DIRECT_DEPENDENCY_MISSING" as const,
    importer: "packages/a/src/consumer.ts",
    specifier: "@fixture/b",
    owner: "@fixture/b",
    message: "missing",
    removalGate: "Declare the direct dependency.",
  };
  expect(reconcileWorkspaceBoundaryDebt([violation], [])).toEqual([
    expect.stringContaining("WORKSPACE_DIRECT_DEPENDENCY_MISSING"),
  ]);
  const stale: WorkspaceBoundaryDebtV1 = {
    importer: "packages/a/src/stale.ts",
    specifier: "@fixture/b",
    owner: "@fixture/b",
    reason: "Historical import pending cleanup.",
    removalGate: "Delete the stale deep import.",
  };
  expect(reconcileWorkspaceBoundaryDebt([], [stale])).toEqual([
    expect.stringContaining("WORKSPACE_BOUNDARY_DEBT_STALE"),
  ]);
  expect(reconcileWorkspaceBoundaryDebt([violation], [{
    ...stale,
    importer: "packages/*",
  }])).toEqual(expect.arrayContaining([
    expect.stringContaining("WORKSPACE_BOUNDARY_DEBT_INVALID"),
  ]));
});

it("does not treat repository-root capsule scratch as root-package source", async () => {
  const root = await fixture({ source: 'import "@fixture/b";\n' });
  const copied = path.join(root, ".codex-tmp/gpt6-toolkit-capsule/export/toolkit/sdk/packages/a/src/copied.ts");
  await mkdir(path.dirname(copied), { recursive: true });
  await writeFile(copied, 'import "@fixture/b";\n');
  await expect(scanWorkspaceBoundaries(root)).resolves.toEqual([
    expect.objectContaining({
      code: "WORKSPACE_DIRECT_DEPENDENCY_MISSING",
      importer: "packages/a/src/consumer.ts",
      owner: "@fixture/b",
    }),
  ]);
});

it("still checks maintained hidden source and package-local directories named like scratch", async () => {
  const root = await fixture({});
  for (const relative of [".maintained/source.ts", "scratch/source.ts", "packages/a/.codex-tmp/consumer.ts"]) {
    const filename = path.join(root, relative);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, 'import "@fixture/b";\n');
  }
  const violations = await scanWorkspaceBoundaries(root);
  expect(violations).toHaveLength(3);
  expect(violations.map(entry => entry.importer).sort()).toEqual([
    ".maintained/source.ts", "packages/a/.codex-tmp/consumer.ts", "scratch/source.ts",
  ]);
  expect(violations.every(entry => entry.code === "WORKSPACE_DIRECT_DEPENDENCY_MISSING")).toBe(true);
});
