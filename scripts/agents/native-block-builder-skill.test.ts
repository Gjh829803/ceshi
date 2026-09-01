import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import packageJson from "../../package.json";

const execFileAsync = promisify(execFile);
const CHECKER = path.resolve(
  ".codex/skills/worldkit-native-block-builder/scripts/self-check.mjs",
);
const temporaryDirectories: string[] = [];

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "worldkit-native-block-builder-"));
  temporaryDirectories.push(workspace);
  await Promise.all([
    writeFile(path.join(workspace, "scene.ts"), `
import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
import { createBabylonNativeBlockProfileSessionV1 } from "@whitebox-world/native-babylon-block-profile";

export default defineBabylonNativeScene({
  kind: "babylon-native-scene-module",
  id: "valid-native-block-world",
  build(context) {
    const blocks = createBabylonNativeBlockProfileSessionV1(context, {
      maximumBlockCount: 32,
    });
    void blocks;
  },
});
`.trimStart()),
    writeFile(path.join(workspace, "native-block-authoring.json"), `${JSON.stringify({
      kind: "native-block-authoring",
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [{
        visualGroupId: "central-gate",
        acceptanceTargetRef: "worldkit://acceptance-target/central-gate@1",
        semanticClassId: "worldkit.native-block.group.central-gate",
        identityColorHex: "#AEB8C4",
      }, {
        visualGroupId: "upper-platform",
        acceptanceTargetRef: "worldkit://acceptance-target/upper-platform@1",
        semanticClassId: "worldkit.native-block.group.upper-platform",
        identityColorHex: "#C9A96B",
      }],
    }, null, 2)}\n`),
    writeFile(path.join(workspace, "native-resources.json"), `${JSON.stringify({
      kind: "native-visual-resource-list",
      schemaVersion: 1,
      resourceRefs: [],
    }, null, 2)}\n`),
  ]);
  return workspace;
}

async function runSelfCheck(workspace: string): Promise<Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
  report: Record<string, unknown>;
}>> {
  try {
    const result = await execFileAsync(process.execPath, [CHECKER, "--workspace", workspace]);
    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
      report: JSON.parse(result.stdout),
    };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      report: JSON.parse(failure.stdout ?? "{}"),
    };
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("Native Block Builder Skill", () => {
  it("states the closed outputs and keeps all product authorities with the Host", async () => {
    const [skill, outputContract] = await Promise.all([
      readFile(path.resolve(".codex/skills/worldkit-native-block-builder/SKILL.md"), "utf8"),
      readFile(path.resolve(
        ".codex/skills/worldkit-native-block-builder/references/native-block-output-contract.md",
      ), "utf8"),
    ]);

    expect(skill).toContain("write exactly these three declared outputs");
    expect(skill).toContain("`scene.ts`");
    expect(skill).toContain("`native-block-authoring.json`");
    expect(skill).toContain("`native-resources.json`");
    expect(skill).toContain("JSON/Case/Scene Brief owns identity, intent, Subject, Spawn target, budgets, and evidence requirements.");
    expect(skill).toContain("scene.ts owns Babylon Native Block visual construction and explicit registration calls only.");
    expect(skill).toContain("The Host owns Check, Package, Receipt, Runtime Candidate, Havok, Character, Input, Action, Camera, Reset, Capture, and evaluation.");
    expect(skill).toContain("gpt-5.6-sol");
    expect(skill).toContain("xhigh");
    expect(skill).toContain("builderSelfRepairAttemptCount");
    expect(skill).toContain("self-check reports only");
    expect(skill).not.toContain("at most three self-repair cycles");
    expect(skill).toContain("ground-supported Spawn");
    expect(skill).toContain("T-shaped upper platform");
    expect(skill).toContain("no Route/Nav claim");
    expect(outputContract).toContain("@whitebox-world/native-babylon");
    expect(outputContract).toContain("@whitebox-world/native-babylon-block-profile");
    expect(outputContract).toContain("deterministic seeded construction");
    expect(outputContract).toContain("explicit visual groups");
    expect(outputContract).toContain("explicit Spawn registration");
    expect(outputContract).toContain("explicit collider contribution");
    expect(outputContract).toContain(
      "Module-scope variable declarations permit only primitive literal constants or recursively `Object.freeze`d literal tables.",
    );
    expect(outputContract).toContain(
      "`Math.PI / 2` must be computed inside `build()`",
    );
    expect(outputContract).toContain(
      "The Host typechecks with strict indexed access",
    );
    expect(outputContract).toContain(
      "Prefer `for (const [xMeters, zMeters] of cells)`",
    );
    expect(outputContract).toContain(
      "check the indexed value for `undefined` before destructuring",
    );
    expect(outputContract).toContain(
      "Treat `budgets.maximumStaticColliderCount` as a hard ceiling",
    );
    expect(outputContract).toContain(
      "one `staticColliders` row selects one Block and consumes one Collider",
    );
    expect(outputContract).toContain(
      "Do not register every visible or supporting Block",
    );
    expect(outputContract).toContain(
      "center lattice is `[0.25, 0.125, 0.25]` meters",
    );
    expect(outputContract).toContain(
      "occupancy grid is `[0.5, 0.25, 0.5]` meters",
    );
    for (const shapeContract of [
      "`full`: `[1, 1, 1]`",
      "`half`: `[1, 0.5, 1]`",
      "`quarter`: `[0.5, 0.5, 1]`",
      "`small`: `[0.5, 0.5, 0.5]`",
      "`step`: `[1, 0.25, 1]`",
    ]) {
      expect(outputContract).toContain(shapeContract);
    }
    expect(outputContract).toContain(
      "Never place a support block through the occupied volume of the block it supports.",
    );
    expect(outputContract).toContain(
      "every non-root structural or playable block needs a face-contact support chain to the lowest occupied stratum.",
    );
    expect(outputContract).toContain(
      "The Host Profile reports unsupported blocks as warnings",
    );
    expect(outputContract).toContain(
      "Import only `@whitebox-world/native-babylon` and `@whitebox-world/native-babylon-block-profile`",
    );
    expect(outputContract).toContain(
      "`resourceRefs` must be exactly `[]`",
    );
    expect(outputContract).toContain(
      "Copy the Case's acceptance-target-to-visual-group mapping exactly",
    );
    expect(outputContract).toContain(
      "Every `identityColorHex` must also be unique",
    );
    for (const forbidden of [
      "new Engine(", "new Scene(", "runRenderLoop", "new Havok", "new FreeCamera(",
      "addEventListener", "setInterval", "setTimeout", "fetch(", "Three.js", "Compiler",
    ]) {
      expect(skill).not.toContain(`you may use ${forbidden}`);
    }
  });

  it("registers the focused root command", () => {
    expect(packageJson.scripts["check:native-block-builder-skill"]).toBe(
      "vitest run scripts/agents/native-block-builder-skill.test.ts",
    );
  });

  it("accepts exactly the three non-empty outputs and emits byte-stable canonical evidence", async () => {
    const workspace = await createWorkspace();
    const first = await runSelfCheck(workspace);
    const second = await runSelfCheck(workspace);

    expect(first).toMatchObject({
      exitCode: 0,
      stderr: "",
      report: {
        kind: "native-block-builder-self-check",
        schemaVersion: 1,
        ok: true,
        declaredOutputPaths: [
          "scene.ts",
          "native-block-authoring.json",
          "native-resources.json",
        ],
        diagnosticCodes: [],
      },
    });
    expect(first.report.outputHashes).toEqual([
      expect.objectContaining({ path: "native-block-authoring.json" }),
      expect.objectContaining({ path: "native-resources.json" }),
      expect.objectContaining({ path: "scene.ts" }),
    ]);
    expect(first.stdout).toBe(second.stdout);
  });

  it.each([
    ["missing output", async (workspace: string) => rm(path.join(workspace, "scene.ts")), "NATIVE_BLOCK_BUILDER_OUTPUT_MISSING"],
    ["extra output", async (workspace: string) => writeFile(path.join(workspace, "extra.txt"), "no"), "NATIVE_BLOCK_BUILDER_OUTPUT_EXTRA"],
    ["empty output", async (workspace: string) => writeFile(path.join(workspace, "scene.ts"), ""), "NATIVE_BLOCK_BUILDER_OUTPUT_EMPTY"],
    ["nested output", async (workspace: string) => mkdir(path.join(workspace, "nested")), "NATIVE_BLOCK_BUILDER_OUTPUT_EXTRA"],
  ])("rejects %s", async (_label, mutate, expectedCode) => {
    const workspace = await createWorkspace();
    await mutate(workspace);
    const result = await runSelfCheck(workspace);
    expect(result.exitCode).toBe(2);
    expect(result.report).toMatchObject({ ok: false });
    expect(result.report.diagnosticCodes).toContain(expectedCode);
  });

  it("rejects a symlink even when it resolves to a valid regular output", async () => {
    const workspace = await createWorkspace();
    const target = path.join(os.tmpdir(), `worldkit-scene-${process.pid}.ts`);
    await writeFile(target, "export const scene = {};\n");
    await rm(path.join(workspace, "scene.ts"));
    await symlink(target, path.join(workspace, "scene.ts"));
    try {
      const result = await runSelfCheck(workspace);
      expect(result.exitCode).toBe(2);
      expect(result.report.diagnosticCodes).toContain("NATIVE_BLOCK_BUILDER_OUTPUT_SYMLINK");
    } finally {
      await rm(target, { force: true });
    }
  });

  it("rejects Host-only Registry refs in the Native visual resource list", async () => {
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace, "native-resources.json"), JSON.stringify({
      kind: "native-visual-resource-list",
      schemaVersion: 1,
      resourceRefs: ["worldkit://subject-definition/humanoid.g-bot@2"],
    }));

    const result = await runSelfCheck(workspace);

    expect(result.exitCode).toBe(2);
    expect(result.report.diagnosticCodes).toContain(
      "NATIVE_BLOCK_BUILDER_RESOURCE_REFS_INVALID",
    );
  });

  it("rejects unresolved Native visual refs until production asset closure exists", async () => {
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace, "native-resources.json"), JSON.stringify({
      kind: "native-visual-resource-list",
      schemaVersion: 1,
      resourceRefs: ["worldkit://static-geometry-asset/gate@1"],
    }));

    const result = await runSelfCheck(workspace);

    expect(result.exitCode).toBe(2);
    expect(result.report.diagnosticCodes).toContain(
      "NATIVE_BLOCK_BUILDER_RESOURCE_REFS_INVALID",
    );
  });

  it.each([
    ["authoring top-level field", "native-block-authoring.json", {
      kind: "native-block-authoring",
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [],
      camera: { mode: "third-person" },
    }, "NATIVE_BLOCK_BUILDER_AUTHORING_INVALID"],
    ["resource top-level field", "native-resources.json", {
      kind: "native-visual-resource-list",
      schemaVersion: 1,
      resourceRefs: [],
      packageReceiptRef: "worldkit://receipt/forbidden@1",
    }, "NATIVE_BLOCK_BUILDER_RESOURCE_REFS_INVALID"],
    ["visual-group authority field", "native-block-authoring.json", {
      kind: "native-block-authoring",
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [{
        visualGroupId: "central-gate",
        acceptanceTargetRef: "worldkit://acceptance-target/central-gate@1",
        semanticClassId: "worldkit.native-block.group.central-gate",
        identityColorHex: "#AEB8C4",
        physicsBodyId: "forbidden",
      }],
    }, "NATIVE_BLOCK_BUILDER_AUTHORING_INVALID"],
    ["unsorted visual-group IDs", "native-block-authoring.json", {
      kind: "native-block-authoring",
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [{
        visualGroupId: "z-group",
        acceptanceTargetRef: "worldkit://acceptance-target/z@1",
        semanticClassId: "worldkit.native-block.group.z",
        identityColorHex: "#AEB8C4",
      }, {
        visualGroupId: "a-group",
        acceptanceTargetRef: "worldkit://acceptance-target/a@1",
        semanticClassId: "worldkit.native-block.group.a",
        identityColorHex: "#C9A96B",
      }],
    }, "NATIVE_BLOCK_BUILDER_VISUAL_GROUPS_UNSORTED"],
    ["duplicate visual-group IDs", "native-block-authoring.json", {
      kind: "native-block-authoring",
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [{
        visualGroupId: "same-group",
        acceptanceTargetRef: "worldkit://acceptance-target/a@1",
        semanticClassId: "worldkit.native-block.group.a",
        identityColorHex: "#AEB8C4",
      }, {
        visualGroupId: "same-group",
        acceptanceTargetRef: "worldkit://acceptance-target/b@1",
        semanticClassId: "worldkit.native-block.group.b",
        identityColorHex: "#C9A96B",
      }],
    }, "NATIVE_BLOCK_BUILDER_VISUAL_GROUPS_DUPLICATE"],
    ["forbidden nested gameplay field", "native-block-authoring.json", {
      kind: "native-block-authoring",
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [],
      metadata: { gameplayEntityId: "forbidden" },
    }, "NATIVE_BLOCK_BUILDER_JSON_AUTHORITY_FIELD_FORBIDDEN"],
  ])("rejects %s", async (_label, outputPath, value, expectedCode) => {
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace, outputPath), JSON.stringify(value));
    const result = await runSelfCheck(workspace);
    expect(result.exitCode).toBe(2);
    expect(result.report.diagnosticCodes).toContain(expectedCode);
  });

  it("rejects duplicate visual identity colors", async () => {
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace, "native-block-authoring.json"), JSON.stringify({
      kind: "native-block-authoring",
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [{
        visualGroupId: "central-gate",
        acceptanceTargetRef: "worldkit://acceptance-target/central-gate@1",
        semanticClassId: "worldkit.native-block.group.central-gate",
        identityColorHex: "#AEB8C4",
      }, {
        visualGroupId: "upper-platform",
        acceptanceTargetRef: "worldkit://acceptance-target/upper-platform@1",
        semanticClassId: "worldkit.native-block.group.upper-platform",
        identityColorHex: "#AEB8C4",
      }],
    }));

    const result = await runSelfCheck(workspace);

    expect(result.exitCode).toBe(2);
    expect(result.report.diagnosticCodes).toContain(
      "NATIVE_BLOCK_BUILDER_IDENTITY_COLORS_DUPLICATE",
    );
  });

  it.each([
    "new PhysicsAggregate(mesh, 0, {}, context.scene)",
    "new UniversalCamera('camera', position, context.scene)",
    "window.addEventListener('keydown', listener)",
  ])("rejects source that attempts to take a Host authority: %s", async (instruction) => {
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace, "scene.ts"), `export const instruction = ${JSON.stringify(instruction)};\n`);
    const result = await runSelfCheck(workspace);
    expect(result.exitCode).toBe(2);
    expect(result.report.diagnosticCodes).toContain("NATIVE_BLOCK_BUILDER_SOURCE_AUTHORITY_FORBIDDEN");
  });

});
