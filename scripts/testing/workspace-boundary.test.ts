import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, expect, it } from "vitest";

import {
  reconcileWorkspaceBoundaryDebt,
  scanWorkspaceBoundaries,
  type WorkspaceBoundaryDebtV1,
} from "../lib/workspace-boundary";
import { parseWorkspaceBoundaryEvidenceV1 } from "../lib/workspace-boundary-contract";

const COMMIT_SHA = "a".repeat(40);
const roots: string[] = [];

function scan(repositoryRoot: string) {
  return scanWorkspaceBoundaries({ repositoryRoot, commitSha: COMMIT_SHA });
}

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
    writeFile(path.join(root, "packages/a/src/index.ts"), "export function exampleApi(): void {}\n"),
    writeFile(path.join(root, "packages/b/src/index.ts"), "export * from \"./public\";\n"),
    writeFile(path.join(root, "packages/b/src/public.ts"), "export const publicValue = 1;\n"),
    writeFile(path.join(root, "packages/b/src/testing.ts"), "export {};\n"),
  ]);
  const sourcePath = path.join(root, options.sourcePath ?? "packages/a/src/consumer.ts");
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, options.source ?? "export {};\n");
  return root;
}

it("detects missing direct, private sibling, production-to-dev, and invalid export edges", async () => {
  const missing = await fixture({ source: 'import "@fixture/b";\n' });
  await expect(scan(missing)).resolves.toEqual(expect.objectContaining({
    violations: [
      expect.objectContaining({ code: "WORKSPACE_DIRECT_DEPENDENCY_MISSING", specifier: "@fixture/b" }),
    ],
  }));

  const privateSibling = await fixture({ source: 'import "../../b/src/index";\n' });
  await expect(scan(privateSibling)).resolves.toEqual(expect.objectContaining({
    violations: [expect.objectContaining({ code: "WORKSPACE_PRIVATE_SIBLING_SOURCE" })],
  }));

  const productionDev = await fixture({
    aDevDependencies: { "@fixture/b": "workspace:*" },
    source: 'import "@fixture/b";\n',
  });
  await expect(scan(productionDev)).resolves.toEqual(expect.objectContaining({
    violations: [expect.objectContaining({ code: "WORKSPACE_PRODUCTION_DEPENDENCY_IN_DEV" })],
  }));

  const missingExport = await fixture({
    aDependencies: { "@fixture/b": "workspace:*" },
    bExports: { ".": "./src/index.ts", "./missing": "./src/does-not-exist.ts" },
    source: 'import "@fixture/b/missing";\n',
  });
  await expect(scan(missingExport)).resolves.toEqual(expect.objectContaining({
    violations: [expect.objectContaining({ code: "WORKSPACE_EXPORT_NOT_PUBLIC" })],
  }));
});

it("rejects production testing exports but permits an explicit testing export in tests", async () => {
  const production = await fixture({
    aDependencies: { "@fixture/b": "workspace:*" },
    source: 'import "@fixture/b/testing";\n',
  });
  await expect(scan(production)).resolves.toEqual(expect.objectContaining({
    violations: [expect.objectContaining({ code: "WORKSPACE_PRODUCTION_TEST_EXPORT" })],
  }));

  const testOnly = await fixture({
    aDevDependencies: { "@fixture/b": "workspace:*" },
    sourcePath: "packages/a/src/consumer.test.ts",
    source: 'import "@fixture/b/testing";\n',
  });
  await expect(scan(testOnly)).resolves.toEqual(expect.objectContaining({ violations: [] }));
});

it("reports production dependency cycles deterministically", async () => {
  const root = await fixture({
    aDependencies: { "@fixture/b": "workspace:*" },
    bDependencies: { "@fixture/a": "workspace:*" },
  });
  await expect(scan(root)).resolves.toEqual(expect.objectContaining({
    violations: [
      expect.objectContaining({
        code: "WORKSPACE_DEPENDENCY_CYCLE",
        message: expect.stringContaining("@fixture/a -> @fixture/b -> @fixture/a"),
      }),
    ],
  }));
});

it("projects public symbols from one TypeScript walk and Host-injected commit SHA", async () => {
  const root = await fixture({
    aDependencies: { "@fixture/b": "workspace:*" },
    source: 'import { publicValue } from "@fixture/b";\n',
  });
  const evidence = await scan(root);
  expect(evidence).toEqual(parseWorkspaceBoundaryEvidenceV1(evidence));
  expect(evidence.graph.commitSha).toBe(COMMIT_SHA);
  expect(evidence.publicSymbols).toEqual(expect.arrayContaining([
    expect.objectContaining({
      packageId: "@fixture/a",
      exportSubpath: ".",
      symbolName: "exampleApi",
      isTypeOnly: false,
      isReexport: false,
    }),
    expect.objectContaining({
      packageId: "@fixture/b",
      exportSubpath: ".",
      symbolName: "publicValue",
      isTypeOnly: false,
      isReexport: true,
    }),
  ]));
  expect(evidence.graph.edges).toEqual(expect.arrayContaining([
    expect.objectContaining({
      importerPackageId: "@fixture/a",
      specifier: "@fixture/b",
      targetPackageId: "@fixture/b",
      usage: "production",
    }),
  ]));
  expect(evidence.reconciledDebtFingerprints).toEqual([]);
});

it("rejects a tree object name instead of spawning Git", async () => {
  const root = await fixture({});
  await expect(scanWorkspaceBoundaries({
    repositoryRoot: root,
    commitSha: "HEAD",
  })).rejects.toThrow(/Host-injected 40-character commit SHA/i);
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
