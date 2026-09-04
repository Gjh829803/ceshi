import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { deflateSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  babylonNativeBlockCenterAlignsToGridV1,
  babylonNativeBlockOccupiedMicroCellKeysV1,
} from "@whitebox-world/native-babylon-block-profile/testing";
import {
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";

import packageJson from "../../package.json";
import {
  createNativeBlockSubjectVisualReviewProxyV1,
} from "../reconstruction/native-block-subject-visual-review-proxy.js";

const execFileAsync = promisify(execFile);
const CHECKER = path.resolve(
  ".codex/skills/worldkit-native-block-builder/scripts/self-check.mjs",
);
const VISUAL_REVIEW_RENDERER = path.resolve(
  ".codex/skills/worldkit-native-block-builder/scripts/render-visual-review.mjs",
);
const VISUAL_REVIEW_BUILD = path.resolve(
  ".codex/skills/worldkit-native-block-builder/scripts/build-visual-review.mjs",
);
const temporaryDirectories: string[] = [];

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  Buffer.from(data).copy(output, 8);
  output.writeUInt32BE(
    crc32(Buffer.concat([typeBytes, Buffer.from(data)])),
    8 + data.length,
  );
  return output;
}

function inflatedPlanningPngBomb(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.alloc(1_024 * 1_024))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "worldkit-native-block-builder-"));
  temporaryDirectories.push(workspace);
  await Promise.all([
    mkdir(path.join(workspace, "context"), { recursive: true }),
    mkdir(path.join(workspace, "inputs"), { recursive: true }),
  ]);
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
        identityColorHex: "#123456",
      }, {
        visualGroupId: "upper-platform",
        acceptanceTargetRef: "worldkit://acceptance-target/upper-platform@1",
        semanticClassId: "worldkit.native-block.group.upper-platform",
        identityColorHex: "#ABCDEF",
      }],
    }, null, 2)}\n`),
    writeFile(path.join(workspace, "native-resources.json"), `${JSON.stringify({
      kind: "native-visual-resource-list",
      schemaVersion: 1,
      resourceRefs: [],
    }, null, 2)}\n`),
    writeFile(path.join(workspace, "context", "case.json"), JSON.stringify({
      id: "valid-native-block-world",
      sceneBriefHash: `sha256:${"a".repeat(64)}`,
      expected: {
        semanticSilhouetteTargets: [{
          acceptanceTargetRef:
            "worldkit://acceptance-target/central-gate@1",
          visualGroupId: "central-gate",
        }, {
          acceptanceTargetRef:
            "worldkit://acceptance-target/upper-platform@1",
          visualGroupId: "upper-platform",
        }],
      },
    })),
    writeFile(
      path.join(workspace, "inputs", "visual-identity-palette.json"),
      JSON.stringify({
        kind: "worldkit-visual-identity-palette",
        schemaVersion: 1,
        sceneId: "valid-native-block-world",
        sceneBriefHash: `sha256:${"a".repeat(64)}`,
        movementMode: "ground-walk",
        movementModeLabel: "Ground walk",
        targets: [{
          id: "visual-target-1",
          visualTargetId: "visual-target-1",
          targetKind: "subject",
          name: "Explorer",
          description: "controlled Subject",
          role: "primary-subject",
          semanticClassId: "visual.subject",
          identityColor: "#E85D5D",
        }],
      }),
    ),
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
    const canonicalWorkspace = await realpath(workspace);
    const result = await execFileAsync(process.execPath, [
      CHECKER,
      "--workspace",
      canonicalWorkspace,
      "--case",
      path.join(canonicalWorkspace, "context", "case.json"),
      "--visual-identity-palette",
      path.join(
        canonicalWorkspace,
        "inputs",
        "visual-identity-palette.json",
      ),
    ]);
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

async function createVisualReviewWorkspace(): Promise<string> {
  const workspace = await createWorkspace();
  await mkdir(path.join(workspace, "inputs"), { recursive: true });
  await Promise.all([
    writeFile(path.join(workspace, "scene.ts"), `
import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
import { createBabylonNativeBlockProfileSessionV1 } from "@whitebox-world/native-babylon-block-profile";

export default defineBabylonNativeScene({
  kind: "babylon-native-scene-module",
  id: "visual-review-world",
  build(context) {
    const session = createBabylonNativeBlockProfileSessionV1(context, {
      maximumBlockCount: 8,
    });
    session.createBlockGrid({
      idPrefix: "ground",
      shape: "full",
      paletteRole: "ground",
      visualGroupId: "upper-platform",
      minimumCenterMetersXYZ: [-0.5, -0.5, 0],
      repeatCountXYZ: [2, 1, 1],
    });
    session.createBlock({
      id: "gate",
      shape: "full",
      paletteRole: "structure",
      visualGroupId: "central-gate",
      centerMetersXYZ: [0, 0.5, -2],
    });
    session.createBlock({
      id: "ungrouped-water-like",
      shape: "small",
      paletteRole: "water-like-visual",
      centerMetersXYZ: [2.25, 0.25, -2.25],
    });
    session.finalize({ displayGapMeters: 0.04, staticColliders: [] });
    context.registration.registerSpawnMarker({
      id: context.bootstrap.spawnMarkerId,
      positionMetersXYZ: [0, 0, 0],
      facingRadians: 0,
    });
  },
});
`.trimStart()),
    writeFile(path.join(workspace, "inputs", "native-scene.bootstrap.json"), JSON.stringify({
      seed: 17,
      spawnMarkerId: "spawn",
      initialControlledEntityId: "subject",
      initialCamera: {
        mode: "third-person",
        distanceMeters: 5,
        targetHeightMeters: 1.2,
        pitchRadians: 0.18,
        fovDegrees: 56,
      },
    })),
    writeFile(
      path.join(workspace, "inputs", "subject-visual-review-proxy.json"),
      JSON.stringify(createNativeBlockSubjectVisualReviewProxyV1({
        initialControlledEntityId: "subject",
        subjectDefinitionRef: "worldkit://subject-definition/test@1",
        subjectDefinitionHash:
          sha256CanonicalJson({ subjectDefinition: "test" }) as Sha256HashV1,
        subjectRuntimeDescriptorHash:
          sha256CanonicalJson({
            subjectRuntimeDescriptor: "test",
          }) as Sha256HashV1,
        worldRuntimeBootstrapRef:
          "worldkit://world-runtime-bootstrap/test@1",
        worldRuntimeBootstrapContentHash:
          sha256CanonicalJson({
            worldRuntimeBootstrap: "test",
          }) as Sha256HashV1,
        worldRuntimeBootstrapBytesHash:
          sha256CanonicalJson({
            worldRuntimeBootstrapBytes: "test",
          }) as Sha256HashV1,
        cuboids: [{
          id: "body.asset",
          minimumMetersXYZ: [-0.9, 0, -0.15],
          maximumMetersXYZ: [0.9, 1.8, 0.17],
        }],
      })),
    ),
    writeFile(path.join(workspace, "inputs", "world-plan.png"), ONE_PIXEL_PNG),
    writeFile(path.join(workspace, "inputs", "entry-whitebox-target.png"), ONE_PIXEL_PNG),
  ]);
  return workspace;
}

async function runVisualReview(
  workspace: string,
  additionalArguments: readonly string[] = [],
): Promise<Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>> {
  try {
    const result = await execFileAsync(process.execPath, [
      VISUAL_REVIEW_RENDERER,
      "--workspace",
      workspace,
      ...additionalArguments,
    ]);
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
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
    };
  }
}

async function subjectPixelBounds(
  filePath: string,
): Promise<Readonly<{ width: number; height: number }>> {
  const decoded = await sharp(await readFile(filePath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < decoded.info.height; y += 1) {
    for (let x = 968; x < decoded.info.width; x += 1) {
      const offset = (y * decoded.info.width + x) * 4;
      if (
        decoded.data[offset]! >= 150 &&
        decoded.data[offset + 1]! < 130 &&
        decoded.data[offset + 2]! < 130 &&
        decoded.data[offset + 3] === 255
      ) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length === 0 || ys.length === 0) {
    throw new Error("Subject proxy pixels are missing from the entry review.");
  }
  return Object.freeze({
    width: Math.max(...xs) - Math.min(...xs) + 1,
    height: Math.max(...ys) - Math.min(...ys) + 1,
  });
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

    expect(skill).toContain("write exactly these three Native Source outputs");
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
    expect(skill).toContain("at most three combined self-repair cycles");
    expect(skill).toContain("Mandatory visual feedback");
    expect(skill).toContain(
      "`WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED` is advisory only",
    );
    expect(skill).toContain(
      "Do not spend repair budget solely to eliminate that warning",
    );
    expect(skill).toContain("actually open and inspect both PNGs");
    expect(skill).toContain("Structural and visual feedback share this one counter");
    expect(skill).toContain("never author a parallel block list or review manifest");
    expect(skill).toContain("Host may replay the same renderer after Native Check");
    expect(skill).toContain("neither the renderer nor the Host may score semantic similarity");
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
      "every non-Subject semantic target represented with `paletteRole: \"structure\"` is a solid world landmark",
    );
    expect(skill).toContain(
      "This rule produces an explicit Frozen Contribution",
    );
    expect(outputContract).toContain(
      "declaring one required `role: \"blocker\"` Collider for every non-Subject semantic landmark",
    );
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
      "exactly two static imports: `@whitebox-world/native-babylon` and `@whitebox-world/native-babylon-block-profile`",
    );
    expect(skill).toContain("Direct Babylon subpaths");
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
    expect(outputContract).toContain(
      "`#E85D5D`, `#F28E2B`, `#D9A514`, `#4E79A7`, `#9C6ADE`",
    );
    expect(skill).toContain(
      "Host admission independently repeats the identity join",
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
      "scripts/render-visual-review.mjs",
    ]) {
      const [live, frozen] = await Promise.all([
        readFile(path.join(liveRoot, relativePath), "utf8"),
        readFile(path.join(frozenRoot, relativePath), "utf8"),
      ]);
      expect(frozen, relativePath).toBe(live);
    }
  });

  it("rebuilds the renderer in a temporary directory with exact bundle bytes", async () => {
    const outputDirectoryPath = await mkdtemp(path.join(
      os.tmpdir(),
      "worldkit-native-block-renderer-build-",
    ));
    temporaryDirectories.push(outputDirectoryPath);

    await execFileAsync(process.execPath, [
      VISUAL_REVIEW_BUILD,
      "--out-dir",
      outputDirectoryPath,
    ]);

    await expect(readFile(path.join(
      outputDirectoryPath,
      "render-visual-review.mjs",
    ))).resolves.toEqual(await readFile(VISUAL_REVIEW_RENDERER));
  }, 30_000);

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
    expect(outputContract).toContain(
      "More than one component is an advisory warning, not Native Check rejection",
    );
    expect(outputContract).toContain(
      "Case-declared Ground Analysis and traversal evidence exclusively decide",
    );
    expect(outputContract).not.toContain(
      "All `route` blocks must form one edge-adjacent component.",
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

  it("renders byte-stable source-derived top-down and entry comparisons without Babylon", async () => {
    const workspace = await createVisualReviewWorkspace();
    const first = await runVisualReview(workspace);
    expect(first).toMatchObject({ exitCode: 0, stderr: "" });
    const report = JSON.parse(first.stdout);
    expect(report).toMatchObject({
      kind: "native-block-builder-visual-review",
      schemaVersion: 1,
      status: "passed",
      blockCount: 4,
    });
    const topPath = path.join(
      workspace,
      "attempts/advisory/builder-top-down-comparison.png",
    );
    const entryPath = path.join(
      workspace,
      "attempts/advisory/builder-entry-comparison.png",
    );
    const [firstTop, firstEntry] = await Promise.all([
      readFile(topPath),
      readFile(entryPath),
    ]);
    expect([firstTop.readUInt32BE(16), firstTop.readUInt32BE(20)]).toEqual([
      1_544,
      768,
    ]);
    expect([firstEntry.readUInt32BE(16), firstEntry.readUInt32BE(20)]).toEqual([
      1_928,
      540,
    ]);
    const topRgba = await sharp(firstTop).ensureAlpha().raw().toBuffer();
    const hasColor = (expected: readonly [number, number, number]): boolean => {
      for (let offset = 0; offset < topRgba.byteLength; offset += 4) {
        if (
          topRgba[offset] === expected[0] &&
          topRgba[offset + 1] === expected[1] &&
          topRgba[offset + 2] === expected[2]
        ) return true;
      }
      return false;
    };
    expect(hasColor([0x12, 0x34, 0x56])).toBe(true);
    expect(hasColor([0xab, 0xcd, 0xef])).toBe(true);
    expect(hasColor([0x4e, 0x91, 0xb5])).toBe(true);

    const second = await runVisualReview(workspace);
    const [secondTop, secondEntry] = await Promise.all([
      readFile(topPath),
      readFile(entryPath),
    ]);
    expect(second.stdout).toBe(first.stdout);
    expect(secondTop).toEqual(firstTop);
    expect(secondEntry).toEqual(firstEntry);

    const rendererSource = await readFile(path.resolve(
      ".codex/skills/worldkit-native-block-builder/scripts/render-visual-review.source.ts",
    ), "utf8");
    expect(rendererSource).not.toContain("@babylonjs/");
    expect(rendererSource).not.toContain("runtimeBootstrap");
    expect(rendererSource).not.toContain("new Engine(");
    expect(rendererSource).not.toContain("new Scene(");
    expect(rendererSource).not.toContain("Havok");
    expect(rendererSource).not.toContain("localeCompare");
  });

  it("emits a Host-only canonical captured layout identity without adding a task output", async () => {
    const workspace = await createVisualReviewWorkspace();
    const reportPath = path.join(workspace, "host-captured-layout.json");
    const result = await runVisualReview(workspace, [
      "--captured-layout-output",
      reportPath,
    ]);

    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    expect(report).toMatchObject({
      kind: "native-block-builder-captured-layout-report",
      schemaVersion: 1,
      identity: {
        kind: "native-block-builder-captured-layout-identity",
        schemaVersion: 1,
        displayGapMeters: 0.04,
        spawn: {
          id: "spawn",
          positionMetersXYZ: [0, 0, 0],
          facingRadians: 0,
        },
      },
      identityHash: sha256CanonicalJson(report.identity),
    });
    expect(report.identity.blocks.map(({ id }: { id: string }) => id)).toEqual([
      "gate",
      "ground-x0-y0-z0",
      "ground-x1-y0-z0",
      "ungrouped-water-like",
    ]);
    expect((await readdir(path.join(workspace, "attempts/advisory"))).sort())
      .toEqual([
        "builder-entry-comparison.png",
        "builder-top-down-comparison.png",
      ]);
  });

  it("rejects a planning PNG whose IHDR exceeds the admitted dimension cap", async () => {
    const workspace = await createVisualReviewWorkspace();
    const oversizedIhdr = Buffer.from(ONE_PIXEL_PNG);
    oversizedIhdr.writeUInt32BE(8_193, 16);
    await writeFile(path.join(workspace, "inputs/world-plan.png"), oversizedIhdr);

    const result = await runVisualReview(workspace);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("NATIVE_BLOCK_VISUAL_REVIEW_PNG_INVALID");
  });

  it("rejects a planning PNG whose inflater exceeds the exact scanline budget", async () => {
    const workspace = await createVisualReviewWorkspace();
    await writeFile(
      path.join(workspace, "inputs/entry-whitebox-target.png"),
      inflatedPlanningPngBomb(),
    );

    const result = await runVisualReview(workspace);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("NATIVE_BLOCK_VISUAL_REVIEW_PNG_INVALID");
    expect(result.stderr).toContain("scanline budget");
  });

  it("rejects source that reaches Candidate Scene authority before advisory capture", async () => {
    const workspace = await createVisualReviewWorkspace();
    const scenePath = path.join(workspace, "scene.ts");
    const source = await readFile(scenePath, "utf8");
    await writeFile(
      scenePath,
      source.replace(
        "const session = createBabylonNativeBlockProfileSessionV1",
        "void context.scene;\n    const session = createBabylonNativeBlockProfileSessionV1",
      ),
    );

    const result = await runVisualReview(workspace);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED");
    expect(result.stderr).toContain("context.scene");
  });

  it("renders the Host-owned Subject shape in Spawn-facing space", async () => {
    const workspace = await createVisualReviewWorkspace();
    const scenePath = path.join(workspace, "scene.ts");
    const entryPath = path.join(
      workspace,
      "attempts/advisory/builder-entry-comparison.png",
    );
    expect(await runVisualReview(workspace)).toMatchObject({
      exitCode: 0,
      stderr: "",
    });
    const forwardBounds = await subjectPixelBounds(entryPath);
    const source = await readFile(scenePath, "utf8");
    await writeFile(
      scenePath,
      source.replace(
        "facingRadians: 0",
        "facingRadians: 1.5707963267948966",
      ),
    );
    expect(await runVisualReview(workspace)).toMatchObject({
      exitCode: 0,
      stderr: "",
    });
    const quarterTurnBounds = await subjectPixelBounds(entryPath);

    expect(forwardBounds.width).toBeGreaterThan(80);
    expect(quarterTurnBounds.width).toBeGreaterThan(80);
    expect(Math.abs(forwardBounds.width - quarterTurnBounds.width))
      .toBeLessThanOrEqual(3);
    expect(Math.abs(forwardBounds.height - quarterTurnBounds.height))
      .toBeLessThanOrEqual(3);
  });

  it("rejects imports outside the source-only Block advisory allowlist", async () => {
    const workspace = await createVisualReviewWorkspace();
    const scenePath = path.join(workspace, "scene.ts");
    const source = await readFile(scenePath, "utf8");
    await writeFile(
      scenePath,
      `import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";\n${source}\nvoid Vector3;\n`,
    );

    const result = await runVisualReview(workspace);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("NATIVE_BLOCK_VISUAL_REVIEW_SOURCE_REJECTED");
    expect(result.stderr).toContain("outside the Native Block advisory allowlist");
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

  it("repairs a Native target color drift inside the same Builder task", async () => {
    const workspace = await createWorkspace();
    const caseValue = {
      id: "valid-native-block-world",
      sceneBriefHash: `sha256:${"a".repeat(64)}`,
      expected: { semanticSilhouetteTargets: [{
        acceptanceTargetRef:
          "worldkit://acceptance-target/visual-target-3@1",
        visualGroupId: "moon-group",
      }] },
    };
    const palette = {
      kind: "worldkit-visual-identity-palette",
      schemaVersion: 1,
      sceneId: "valid-native-block-world",
      sceneBriefHash: `sha256:${"a".repeat(64)}`,
      movementMode: "ground-walk",
      movementModeLabel: "Ground walk",
      targets: [
        { id: "visual-target-1", visualTargetId: "visual-target-1", targetKind: "subject", name: "Explorer", description: "controlled Subject", role: "primary-subject", semanticClassId: "visual.subject", identityColor: "#E85D5D" },
        { id: "visual-target-2", visualTargetId: "visual-target-2", targetKind: "landmark", name: "Gate", description: "primary gate", role: "primary-landmark", semanticClassId: "visual.gate", identityColor: "#F28E2B" },
        { id: "visual-target-3", visualTargetId: "visual-target-3", targetKind: "landmark", name: "Moon", description: "remote moon", role: "secondary-landmark", semanticClassId: "visual.moon", identityColor: "#D9A514" },
      ],
    };
    const authoring = (identityColorHex: string) => ({
      kind: "native-block-authoring",
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [{
        visualGroupId: "moon-group",
        acceptanceTargetRef:
          "worldkit://acceptance-target/visual-target-3@1",
        semanticClassId: "visual.moon",
        identityColorHex,
      }],
    });
    await Promise.all([
      writeFile(
        path.join(workspace, "context", "case.json"),
        JSON.stringify(caseValue),
      ),
      writeFile(
        path.join(workspace, "inputs", "visual-identity-palette.json"),
        JSON.stringify(palette),
      ),
      writeFile(
        path.join(workspace, "native-block-authoring.json"),
        JSON.stringify(authoring("#D9A514")),
      ),
    ]);
    expect((await runSelfCheck(workspace)).report).toMatchObject({
      ok: true,
      diagnosticCodes: [],
    });

    await writeFile(
      path.join(workspace, "native-block-authoring.json"),
      JSON.stringify(authoring("#123456")),
    );
    const rejected = await runSelfCheck(workspace);
    expect(rejected.exitCode).toBe(2);
    expect(rejected.report.diagnosticCodes).toContain(
      "NATIVE_BLOCK_BUILDER_VISUAL_IDENTITY_BINDING_INVALID",
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
