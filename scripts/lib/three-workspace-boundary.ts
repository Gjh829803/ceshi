import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

export const RETAINED_PACKAGES = new Map([
  ["apps/stream-web/package.json", "@worldkit/stream-web"],
  ["packages/world-ui/package.json", "@worldkit/world-ui"],
  ["packages/stream-protocol/package.json", "@worldkit/stream-protocol"],
  ["packages/stream-player/package.json", "@worldkit/stream-player"],
  ["packages/stream-host/package.json", "@worldkit/stream-host"],
  ["apps/creator-cloud/package.json", "@worldkit/creator-cloud"],
  ["apps/creator-evaluation-site/package.json", "@worldkit/creator-evaluation-site"],
  ["apps/sdk-playground/package.json", "@worldkit/sdk-playground"],
  ["packages/asset-client/package.json", "@worldkit/asset-client"],
  ["packages/asset-contracts/package.json", "@worldkit/asset-contracts"],
  ["packages/browser-capture/package.json", "@worldkit/browser-capture"],
  ["packages/camera-collision/package.json", "@worldkit/camera-collision"],
  ["packages/cloud-generation-client/package.json", "@worldkit/cloud-generation-client"],
  ["packages/creator-host/package.json", "@worldkit/creator-host"],
  ["packages/episode-pipeline/package.json", "@worldkit/episode-pipeline"],
  ["packages/preset-content/package.json", "@worldkit/preset-content"],
  ["packages/three-world/package.json", "@worldkit/three"],
]);
const SOURCE_FILE = /\.(?:c|m)?[jt]sx?$/;
// A retired scope must appear literally or use an escape. Keep every escape
// except \/ as a candidate: escaped slashes cannot create either scope name.
// Candidates still go through the AST so comments and fixture strings are ignored.
const POSSIBLE_RETIRED_SPECIFIER = /@(?:babylonjs|whitebox-world)|\\[^/]/;

export interface ThreeWorkspaceViolation {
  readonly code: "THREE_WORKSPACE_PACKAGE" | "THREE_RETIRED_DEPENDENCY";
  readonly importer: string;
  readonly specifier: string;
}

/** Inspect executable syntax and package manifests, never prose or fixture strings. */
export function checkThreeWorkspaceFiles(
  files: Readonly<Record<string, string>>,
): readonly ThreeWorkspaceViolation[] {
  const violations: ThreeWorkspaceViolation[] = [];
  const manifests = Object.entries(files).filter(([name]) =>
    name === "package.json" || /^(?:packages|apps)\/[^/]+\/package\.json$/.test(name));
  const names = new Set<string>();
  for (const [name, source] of manifests) {
    const manifest = JSON.parse(source) as { name?: string };
    if (name !== "package.json" && manifest.name) names.add(manifest.name);
    if (name !== "package.json" && RETAINED_PACKAGES.get(name) !== manifest.name) {
      violations.push({ code: "THREE_WORKSPACE_PACKAGE", importer: name, specifier: manifest.name ?? "missing package name" });
    }
  }
  for (const [name, expected] of RETAINED_PACKAGES) {
    if (!(name in files)) violations.push({ code: "THREE_WORKSPACE_PACKAGE", importer: name, specifier: expected });
  }
  const check = (importer: string, specifier: string) => {
    const packageName = specifier.split("/").slice(0, 2).join("/");
    if (specifier.startsWith("@babylonjs/") ||
      (specifier.startsWith("@whitebox-world/") && !names.has(packageName))) {
      violations.push({ code: "THREE_RETIRED_DEPENDENCY", importer, specifier });
    }
  };
  for (const [name, source] of manifests) {
    const manifest = JSON.parse(source) as Record<string, unknown>;
    for (const scope of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      const dependencies = manifest[scope];
      if (dependencies && typeof dependencies === "object" && !Array.isArray(dependencies)) {
        for (const dependency of Object.keys(dependencies)) check(name, dependency);
      }
    }
  }
  for (const [name, source] of Object.entries(files)) {
    if (!SOURCE_FILE.test(name) || !/^(?:packages|apps|shared|scripts|deploy)\//.test(name)) continue;
    if (!POSSIBLE_RETIRED_SPECIFIER.test(source)) continue;
    const syntax = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true,
      name.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const add = (node: ts.Node | undefined) => {
      if (node && ts.isStringLiteralLike(node)) check(name, node.text);
    };
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression);
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require") ||
        (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "require" && node.expression.name.text === "resolve"))) add(node.arguments[0]);
      ts.forEachChild(node, visit);
    };
    visit(syntax);
  }
  return violations.sort((a, b) => a.importer.localeCompare(b.importer) || a.specifier.localeCompare(b.specifier));
}

export async function scanThreeWorkspace(repositoryRoot: string): Promise<readonly ThreeWorkspaceViolation[]> {
  const files: Record<string, string> = { "package.json": await readFile(path.join(repositoryRoot, "package.json"), "utf8") };
  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(path.join(repositoryRoot, directory), { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      if (["node_modules", "dist", "coverage", "artifacts", ".git"].includes(entry.name)) continue;
      const name = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile() && (SOURCE_FILE.test(name) || entry.name === "package.json")) {
        files[name] = await readFile(path.join(repositoryRoot, name), "utf8");
      }
    }
  }
  for (const directory of ["packages", "apps", "shared", "scripts", "deploy"]) await visit(directory);
  return checkThreeWorkspaceFiles(files);
}
