import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  babylonNativeBlockCenterAlignsToGridV1,
  babylonNativeBlockOccupiedMicroCellKeysV1,
} from "@whitebox-world/native-babylon-block-profile/testing";

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
    const [agentsRules, skill, outputContract, nativeDesign] = await Promise.all([
      readFile(path.resolve("AGENTS.md"), "utf8"),
      readFile(path.resolve(".codex/skills/worldkit-native-block-builder/SKILL.md"), "utf8"),
      readFile(path.resolve(
        ".codex/skills/worldkit-native-block-builder/references/native-block-output-contract.md",
      ), "utf8"),
      readFile(path.resolve(
        "docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md",
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
    expect(skill).toContain("at most three self-repair cycles");
    expect(skill).toContain("do not replace the separate Host-owned bounded external repair Attempts");
    expect(skill).toContain(
      "A Host-owned external repair is never another self-repair cycle",
    );
    expect(skill).toContain("fresh identity-bearing Native generation Attempt");
    expect(skill).toContain("new request and task ID");
    expect(agentsRules).toContain(
      "Automatic Planner and Canonical Builder work runs through exactly one Codex task per stage",
    );
    expect(agentsRules).toContain(
      "Each Native Attempt is itself one Codex task and may perform only its own bounded checker-driven self-repair inside that task",
    );
    expect(agentsRules).toContain(
      "Never describe or implement an external Native Attempt as same-task self-repair, a hidden retry, or a fallback",
    );
    expect(nativeDesign).toContain(
      "checker-driven source self-repair 只修改该任务声明的输出并重跑",
    );
    expect(nativeDesign).toContain(
      "Host 才用新的 generation Request、task ID 和紧邻的可信证据创建下一条",
    );
    expect(nativeDesign).not.toContain(
      "bounded self-repair 的每一轮都创建新的 `SceneAuthoringAttemptV1` identity",
    );
    expect(skill).toContain(
      "mounts the Host-selected task inputs directly at `context/` and `inputs/`",
    );
    expect(skill).toContain("`context/repair-instruction.json`");
    expect(skill).not.toContain("`.task/context/repair-instruction.json`");
    expect(skill).toContain("ground-supported Spawn");
    expect(skill).toContain("`context/case.json.expected.groundConnectivity`");
    expect(skill).toContain("every declared traversal-band waypoint");
    expect(skill).toContain("Inspect `inputs/world-plan.png` before choosing coordinates");
    expect(skill).toContain("Inspect `inputs/entry-whitebox-target.png` before composing visual groups");
    expect(outputContract).toContain(
      "A Builder that omits either named planning image has not completed reconstruction preflight.",
    );
    expect(skill).toContain("final smoothed collision triangles");
    expect(skill).toContain("place stair and slope transitions outside that landing");
    expect(skill).toContain("structural admission evidence, not a Route/Nav product claim");
    expect(skill).not.toContain(
      "then the central ascent, the T-shaped upper platform, the gate/building silhouette",
    );
    expect(skill).toContain(
      "The Formal Capture Intent remains Capture-only Host input",
    );
    expect(skill).toContain(
      "Do not predict `sourceBoundsMeters` or `planeMeters`",
    );
    expect(skill).toContain("Before returning, verify this closure:");
    expect(skill).toContain(
      "complete playable floor groups across the whole intended exploration domain",
    );
    expect(skill).toContain(
      "uploaded reference evidence, frozen entry composition, frozen top-down continuation",
    );
    expect(skill).toContain(
      "Never place an invisible or visual-only air wall",
    );
    expect(skill).toContain(
      "Never reconstruct the controlled Subject as Native Block geometry",
    );
    expect(skill).toContain(
      "Runtime owns the neutral whitebox inspection lights",
    );
    expect(skill).toContain(
      "keep its endpoints, ordered bends, junctions, switchbacks, width changes, elevation changes",
    );
    expect(skill).toContain(
      "preserve its lower and upper support elevations, total rise, tread rhythm, width, course, major landings",
    );
    expect(skill).toContain(
      "lock its footprint center, long axis, semantic front",
    );
    expect(skill).toContain(
      "Reconstruct terrain evidence at four scales",
    );
    expect(skill).toContain(
      "camera-facing mountain walls, facade-only buildings, shallow scenery strips",
    );
    expect(outputContract).toContain(
      "The opening Camera does not define the object's front",
    );
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
      "Use `colliderGeometrySource: { kind: \"block-group\", colliderGroupId }`",
    );
    expect(outputContract).toContain(
      "Use `{ kind: \"block\", blockId }` only for a genuine singleton blocker or tread",
    );
    expect(outputContract).toContain(
      "The retired top-level `blockId` shape is invalid",
    );
    expect(outputContract).toContain(
      "A blocker is exactly `{ kind: \"not-traversable\" }`",
    );
    expect(outputContract).toContain(
      "Every `case.json.expected.colliders[].colliderId` and `contributionId` is unique",
    );
    expect(outputContract).toContain(
      "A pass check's `acceptanceTargetRef` binds at least one required `ground` or `step` Collider",
    );
    expect(outputContract).toContain(
      "a block check's ref binds at least one required `blocker` Collider",
    );
    expect(outputContract).toContain(
      "Never infer group membership from palette, visual group, ID prefix, Mesh metadata, or a Scene scan",
    );
    expect(outputContract).toContain(
      "For an intended exposed edge of checked static ground where falling would violate the Case, use `protect-ground-subject`",
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
      "`context/case.json.expected.groundConnectivity` is the source-neutral, frozen Host constraint",
    );
    expect(outputContract).toContain(
      "Never move, widen, delete, replace, duplicate, or invent a band",
    );
    expect(outputContract).toContain(
      "Give each frozen point a flat landing with full Capsule-footprint support",
    );
    expect(outputContract).toContain(
      "`isBidirectional` and one-way fields are invalid",
    );
    expect(outputContract).not.toContain(
      "The representative Case needs a readable central ascent, T-shaped upper platform",
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
      "`visualGroups` must be an exact bijection with `context/case.json.expected.semanticSilhouetteTargets`",
    );
    expect(outputContract).toContain(
      "Do not create a visual group for an acceptance target that appears only in Spawn support, Collider, traversal, topology, or deterministic evidence",
    );
    expect(outputContract).toContain(
      "Every `identityColorHex` must also be unique",
    );
    expect(skill).toContain(
      "relative to this exact `SKILL.md` copy",
    );
    expect(skill).not.toContain(
      "node .codex/skills/worldkit-native-block-builder/scripts/self-check.mjs",
    );
    for (const forbidden of [
      "new Engine(", "new Scene(", "runRenderLoop", "new Havok", "new FreeCamera(",
      "addEventListener", "setInterval", "setTimeout", "fetch(", "Three.js", "Compiler",
    ]) {
      expect(skill).not.toContain(`you may use ${forbidden}`);
    }
  });

  it("keeps the representative Case builder inputs byte-identical to the live Skill", async () => {
    const frozenRoot = path.resolve(
      "artifacts/scenes/cloud-temple-t-gate-native-block/inputs/builder-skill",
    );
    const liveRoot = path.resolve(".codex/skills/worldkit-native-block-builder");

    for (const relativePath of [
      "SKILL.md",
      "references/native-block-output-contract.md",
      "scripts/self-check.mjs",
    ]) {
      const [live, frozen] = await Promise.all([
        readFile(path.join(liveRoot, relativePath), "utf8"),
        readFile(path.join(frozenRoot, relativePath), "utf8"),
      ]);
      expect(frozen, relativePath).toBe(live);
    }
  });

  it("teaches only the atomic Block drawing dialect", async () => {
    const outputContract = await readFile(path.resolve(
      ".codex/skills/worldkit-native-block-builder/references/native-block-output-contract.md",
    ), "utf8");

    expect(outputContract).toContain("`createBlock()` requires `centerMetersXYZ`");
    expect(outputContract).toContain("Placement is declared once, at creation.");
    expect(outputContract).not.toMatch(/createBlock\([\s\S]*?\}\);\s*\n\s*\w+\.position/);
    expect(outputContract).not.toMatch(/\bplaceBlock\b|\baddBlock\b|createBlocks\(/);
  });

  it("keeps the documented Grid and stair recipe on the occupancy grid", async () => {
    const outputContract = await readFile(path.resolve(
      ".codex/skills/worldkit-native-block-builder/references/native-block-output-contract.md",
    ), "utf8");

    expect(outputContract).toContain("minimumCenterMetersXYZ: [-1, -0.5, 0]");
    expect(outputContract).toContain("repeatCountXYZ: [3, 1, 1]");
    expect(outputContract).toContain(
      "centerMetersXYZ: [0, 0.125 + stepIndex * 0.25, -1 - stepIndex]",
    );
    expect(outputContract).toContain(
      "stack `n` `step` blocks at the same XZ center with Y centers `0.125 + 0.25 * j`",
    );
    expect(outputContract).toContain(
      "Put successive tread columns exactly one meter apart along X or Z",
    );

    for (const xMeters of [-1, 0, 1]) {
      expect(babylonNativeBlockCenterAlignsToGridV1({
        shape: "full",
        centerMetersXYZ: [xMeters, -0.5, 0],
        rotationQuarterTurnsY: 0,
      })).toBe(true);
    }
    const stairColumns: Array<readonly [number, number, number]> = [];
    for (let stepIndex = 0; stepIndex < 4; stepIndex += 1) {
      const centerMetersXYZ = [
        0,
        0.125 + stepIndex * 0.25,
        -1 - stepIndex,
      ] as const;
      stairColumns.push(centerMetersXYZ);
      expect(babylonNativeBlockCenterAlignsToGridV1({
        shape: "step",
        centerMetersXYZ,
        rotationQuarterTurnsY: 0,
      })).toBe(true);
    }
    for (let columnIndex = 1; columnIndex < stairColumns.length; columnIndex += 1) {
      const previous = new Set(babylonNativeBlockOccupiedMicroCellKeysV1({
        shape: "step",
        centerMetersXYZ: stairColumns[columnIndex - 1]!,
        rotationQuarterTurnsY: 0,
      }));
      const current = babylonNativeBlockOccupiedMicroCellKeysV1({
        shape: "step",
        centerMetersXYZ: stairColumns[columnIndex]!,
        rotationQuarterTurnsY: 0,
      });
      expect(current.some((key) => previous.has(key))).toBe(false);
    }
    const stackedKeys = new Set<string>();
    for (let treadIndex = 0; treadIndex < 4; treadIndex += 1) {
      const centerMetersXYZ = [0, 0.125 + 0.25 * treadIndex, 0] as const;
      expect(babylonNativeBlockCenterAlignsToGridV1({
        shape: "step",
        centerMetersXYZ,
        rotationQuarterTurnsY: 0,
      })).toBe(true);
      const keys = babylonNativeBlockOccupiedMicroCellKeysV1({
        shape: "step",
        centerMetersXYZ,
        rotationQuarterTurnsY: 0,
      });
      expect(keys.some((key) => stackedKeys.has(key))).toBe(false);
      for (const key of keys) stackedKeys.add(key);
    }
    expect(babylonNativeBlockCenterAlignsToGridV1({
      shape: "step",
      centerMetersXYZ: [0, 0.1, 0],
      rotationQuarterTurnsY: 0,
    })).toBe(false);
    expect(babylonNativeBlockCenterAlignsToGridV1({
      shape: "small",
      centerMetersXYZ: [0, 0.25, 0],
      rotationQuarterTurnsY: 0,
    })).toBe(false);
    const entryGroundKeys = new Set(babylonNativeBlockOccupiedMicroCellKeysV1({
      shape: "full",
      centerMetersXYZ: [0, -0.5, 0],
      rotationQuarterTurnsY: 0,
    }));
    expect(babylonNativeBlockOccupiedMicroCellKeysV1({
      shape: "step",
      centerMetersXYZ: [0, 0.125, -1],
      rotationQuarterTurnsY: 0,
    }).some((key) => entryGroundKeys.has(key))).toBe(false);
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

  it("ignores only Host-owned isolated-workspace infrastructure around the three outputs", async () => {
    const workspace = await createWorkspace();
    await Promise.all([
      mkdir(path.join(workspace, "inputs"), { recursive: true }),
      mkdir(path.join(workspace, "attempts", "0", ".task", "context"), {
        recursive: true,
      }),
      writeFile(path.join(workspace, ".codex-last-message.txt"), "pending\n"),
    ]);
    await Promise.all([
      writeFile(path.join(workspace, "inputs", "reference-0.png"), "input"),
      writeFile(
        path.join(workspace, "attempts", "0", ".task", "context", "case.json"),
        "{}",
      ),
    ]);

    const result = await runSelfCheck(workspace);

    expect(result.exitCode).toBe(0);
    expect(result.report).toMatchObject({ ok: true, diagnosticCodes: [] });
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
    ["controlled Subject semantic class", "native-block-authoring.json", {
      kind: "native-block-authoring",
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [{
        visualGroupId: "rider-mount-group",
        acceptanceTargetRef: "worldkit://acceptance-target/rider-mount@1",
        semanticClassId: "subject.rider-mount",
        identityColorHex: "#AEB8C4",
      }],
    }, "NATIVE_BLOCK_BUILDER_SUBJECT_VISUAL_GROUP_FORBIDDEN"],
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

  it("rejects fields from the static-surface branch on a not-traversable binding", async () => {
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace, "scene.ts"), `
const traversalBinding = {
  kind: "not-traversable",
  surfaceEntityId: "invalid-surface",
};
void traversalBinding;
`.trimStart());

    const result = await runSelfCheck(workspace);

    expect(result.exitCode).toBe(2);
    expect(result.report.diagnosticCodes).toContain(
      "NATIVE_BLOCK_BUILDER_TRAVERSAL_BINDING_UNION_INVALID",
    );
  });

});
