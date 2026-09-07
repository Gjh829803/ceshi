import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
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

import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { parseSceneBriefV1 } from "@whitebox-world/authoring";

import {
  babylonNativeBlockCenterAlignsToGridV1,
  babylonNativeBlockOccupiedMicroCellKeysV1,
} from "@whitebox-world/native-babylon-block-profile/testing";
import {
  sha256CanonicalJson,
  sha256Bytes,
} from "@whitebox-world/protocol";

import packageJson from "../../package.json";
import { createNativeSubjectHostContextV1 } from "../reconstruction/native-subject-host-context.js";
import { runBuilderSelfCheckV1 } from "../reconstruction/production-run-ports.js";
import { createBabylonNativeBlockVisualClustersV1 } from "@whitebox-world/native-babylon-block-profile";

describe("CF-20 legacy advisory volume projection", () => {
  const block = (id: string, centerMetersXYZ: readonly [number, number, number]) => ({
    id, centerMetersXYZ, shape: "full" as const,
    rotationQuarterTurnsY: 0 as const, paletteRole: "structure" as const,
  });
  it("keeps the old X then Z then Y greedy volumes and source coverage", () => {
    const rows = [block("a", [0, 0, 0]), block("b", [1, 0, 0]),
      block("c", [0, 0, 1]), block("d", [0, 1, 0]), block("e", [1, 1, 0])];
    const clusters = createBabylonNativeBlockVisualClustersV1(rows);
    expect(clusters.map(({ sourceBlockIds, minimumMetersXYZ, maximumMetersXYZ }) =>
      ({ sourceBlockIds, minimumMetersXYZ, maximumMetersXYZ }))).toEqual([
      { sourceBlockIds: ["a", "b", "d", "e"], minimumMetersXYZ: [-0.5, -0.5, -0.5], maximumMetersXYZ: [1.5, 1.5, 0.5] },
      { sourceBlockIds: ["c"], minimumMetersXYZ: [-0.5, -0.5, 0.5], maximumMetersXYZ: [0.5, 0.5, 1.5] },
    ]);
    expect(createBabylonNativeBlockVisualClustersV1([...rows].reverse())).toEqual(clusters);
  });
  it("partitions at old center-owned 32m boundaries including negative coordinates", () => {
    const rows = [-1, 0, 31, 32].map((x) => block(`x-${x}`, [x, 0, 0]));
    expect(createBabylonNativeBlockVisualClustersV1(rows)).toHaveLength(4);
    expect(createBabylonNativeBlockVisualClustersV1([block("a", [30, 0, 0]), block("b", [31, 0, 0])]))
      .toHaveLength(1);
  });
  it("never merges distinct visual roles, identities or effective shapes", () => {
    const rows = [block("a", [0, 0, 0]), { ...block("b", [1, 0, 0]), paletteRole: "ground" as const },
      { ...block("c", [2, 0, 0]), visualGroupId: "target-a" },
      { ...block("d", [3, 0, 0]), visualGroupId: "target-b" },
      { ...block("e", [4.25, 0, 0]), shape: "quarter" as const },
      { ...block("f", [5, 0, 0.25]), shape: "quarter" as const, rotationQuarterTurnsY: 1 as const }];
    expect(createBabylonNativeBlockVisualClustersV1(rows)).toHaveLength(rows.length);
  });
  it("extends the same volume rule to legacy half-meter treads without aliasing centers", () => {
    const rows = [0.25, 0.75].map((y, index) => ({ ...block(`step-${index}`, [0, y, 0]), shape: "half" as const }));
    expect(createBabylonNativeBlockVisualClustersV1(rows)).toMatchObject([{
      sourceBlockIds: ["step-0", "step-1"], minimumMetersXYZ: [-0.5, 0, -0.5], maximumMetersXYZ: [0.5, 1, 0.5],
    }]);
  });
});

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

const SUBJECT_HOST_CONTEXT = createNativeSubjectHostContextV1("builder-test", "camera-main");
const NATIVE_BOOTSTRAP = {
  kind: "babylon-native-scene-bootstrap", schemaVersion: 1, id: "builder-test-native",
  sceneModuleRef: "worldkit://native-scene/builder-test@1",
  nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
  nativeSceneProfileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
  gameplayBootstrapRef: "worldkit://gameplay-bootstrap/builder-test.17@1",
  seed: 17, spawnMarkerId: "spawn", initialControlledEntityId: "subject",
  gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
  initialCamera: { mode: "third-person", distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
};

it("keeps legacy bounded visual review completion without an extra similarity veto", async () => {
  const skill = await readFile(path.resolve(".codex/skills/worldkit-native-block-builder/SKILL.md"), "utf8");
  expect(skill).toContain("both latest comparison PNGs have been actually opened and visually reviewed");
  expect(skill).toContain("Do not withhold otherwise valid declared outputs solely because visual differences remain");
  expect(skill).not.toContain("opened and judged aligned");
});

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
    writeFile(path.join(workspace, "inputs/subject-host-context.json"), JSON.stringify(SUBJECT_HOST_CONTEXT)),
    writeFile(path.join(workspace, "inputs/native-scene.bootstrap.json"), JSON.stringify(NATIVE_BOOTSTRAP)),
    writeFile(path.join(workspace, "scene.ts"), `
import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
import { createBabylonNativeBlockProfileSessionV1 } from "@whitebox-world/native-babylon-block-profile";

export default defineBabylonNativeScene({
  kind: "babylon-native-scene-module",
  id: "valid-native-block-world",
  build(context) {
    const blocks = createBabylonNativeBlockProfileSessionV1(context);
    void blocks;
  },
});
`.trimStart()),
    writeFile(path.join(workspace, "native-block-authoring.json"), `${JSON.stringify({
      kind: "native-block-authoring",
      controlledSubject: { visualTargetId: "visual-target-1", design: { kind: "registered" as const, subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2" } },
      groundExploration: { mode: "case-defined" as const },
      openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [{
        frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "central-gate",
        acceptanceTargetRef: "worldkit://acceptance-target/central-gate@1",
        semanticClassId: "worldkit.native-block.group.central-gate",
        identityColorHex: "#123456",
      }, {
        frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "upper-platform",
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
        groundConnectivity: { mode: "case-defined", requireSingleReachableComponent: true },
        spawnSupport: { expectedPositionXYZMeters: { xMeters: 0, yMeters: 0, zMeters: 0 } },
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
        movementModes: ["ground-walk"],
        movementModeLabels: ["Ground walk"],
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
  const brief = await readFile(path.resolve(
    "artifacts/scenes/cloud-temple-t-gate-native-block/inputs/scene-brief.md",
  ), "utf8");
  const parsedBrief = parseSceneBriefV1(brief);
  if (!parsedBrief.ok) throw new Error("fixture Brief must parse");
  const casePath = path.join(workspace, "context/case.json");
  const palettePath = path.join(workspace, "inputs/visual-identity-palette.json");
  const caseValue = JSON.parse(await readFile(casePath, "utf8"));
  const palette = JSON.parse(await readFile(palettePath, "utf8"));
  caseValue.sceneBriefHash = sha256Bytes(Buffer.from(brief));
  palette.sceneBriefHash = parsedBrief.sceneBriefHash;
  await Promise.all([
    writeFile(path.join(workspace, "inputs/scene-brief.md"), brief),
    writeFile(casePath, JSON.stringify(caseValue)),
    writeFile(palettePath, JSON.stringify(palette)),
  ]);
  return workspace;
}

async function runSelfCheck(workspace: string, checkerPath = CHECKER, inputWorkspace = workspace): Promise<Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
  report: Record<string, unknown>;
}>> {
  try {
    const canonicalWorkspace = await realpath(workspace);
    const canonicalInputWorkspace = await realpath(inputWorkspace);
    const result = await execFileAsync(process.execPath, [
      checkerPath,
      "--workspace",
      canonicalWorkspace,
      "--case",
      path.join(canonicalInputWorkspace, "context", "case.json"),
      "--scene-brief",
      path.join(canonicalInputWorkspace, "inputs", "scene-brief.md"),
      "--visual-identity-palette",
      path.join(
        canonicalInputWorkspace,
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

it("replays source-only delivery against the same frozen Subject inputs as the isolated task", async () => {
  const inputs = await createWorkspace();
  const task = await runSelfCheck(inputs);
  expect(task.exitCode).toBe(0);
  const source = path.join(inputs, "source-only");
  await mkdir(source);
  for (const name of ["scene.ts", "native-block-authoring.json", "native-resources.json"]) {
    await copyFile(path.join(inputs, name), path.join(source, name));
  }
  const host = await runSelfCheck(source, CHECKER, inputs);
  expect(host.exitCode).toBe(0);
  expect(host.report).toEqual(task.report);
  // Candidate-local files are not a second source of trusted Subject context.
  await mkdir(path.join(source, "inputs"));
  await writeFile(path.join(source, "inputs/subject-host-context.json"), "{}");
  await writeFile(path.join(source, "inputs/native-scene.bootstrap.json"), "{}");
  expect((await runSelfCheck(source, CHECKER, inputs)).report).toEqual(task.report);
  // Exercise the actual production subprocess adapter and its split layout.
  await mkdir(path.join(inputs, ".task/context"), { recursive: true });
  await copyFile(path.join(inputs, "context/case.json"), path.join(inputs, ".task/context/case.json"));
  expect(await runBuilderSelfCheckV1(CHECKER, await realpath(source),
    path.join(await realpath(inputs), "inputs/scene-brief.md")))
    .toEqual({ ok: true, diagnosticCodes: [] });
}, 30_000);

it.each(["subject-host-context.json", "native-scene.bootstrap.json"])(
  "does not fall back to candidate inputs when frozen %s is invalid", async (name) => {
    const source = await createWorkspace();
    const inputs = await createWorkspace();
    await writeFile(path.join(inputs, "inputs", name), "{}");
    const result = await runSelfCheck(source, CHECKER, inputs);
    expect(result.exitCode).toBe(2);
    expect(result.report.diagnosticCodes).toContain("NATIVE_BLOCK_BUILDER_AUTHORING_INVALID");
  },
);

async function createVisualReviewWorkspace(): Promise<string> {
  const workspace = await createWorkspace();
  const authoringPath = path.join(workspace, "native-block-authoring.json");
  const authoring = JSON.parse(await readFile(authoringPath, "utf8"));
  // Preserve the former proxy fixture's exact cuboid, now supplied through the
  // real design compiler. This keeps the pre-migration pixel goldens meaningful.
  authoring.controlledSubject = { visualTargetId: "visual-target-1", design: {
    kind: "composed", definition: {
      id: "review-body", category: "human", bodyTopology: "biped",
      semanticClassId: "subject.review", displayName: "Review body", description: "Fixed pixel regression body.",
      visualParts: [{ id: "body-asset", kind: "primitive", shape: { kind: "box", sizeMetersXYZ: [1.8, 1.8, 0.32] },
        localTransform: { positionMetersXYZ: [0, 0.9, 0.01] }, colliderContribution: "include", semanticTags: ["body"] }],
      visualBinding: { mode: "static" },
    },
  } };
  await writeFile(authoringPath, JSON.stringify(authoring));
  await mkdir(path.join(workspace, "inputs"), { recursive: true });
  await Promise.all([
    writeFile(path.join(workspace, "scene.ts"), `
import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
import { createBabylonNativeBlockProfileSessionV1 } from "@whitebox-world/native-babylon-block-profile";

export default defineBabylonNativeScene({
  kind: "babylon-native-scene-module",
  id: "visual-review-world",
  build(context) {
    const session = createBabylonNativeBlockProfileSessionV1(context);
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
    session.finalize({ staticColliders: [] });
    context.registration.registerSpawnMarker({
      id: context.bootstrap.spawnMarkerId,
      positionMetersXYZ: [0, 0, 0],
      facingRadians: 0,
    });
  },
});
`.trimStart()),
    writeFile(path.join(workspace, "inputs", "native-scene.bootstrap.json"), JSON.stringify(NATIVE_BOOTSTRAP)),
    writeFile(path.join(workspace, "inputs", "subject-host-context.json"), JSON.stringify(SUBJECT_HOST_CONTEXT)),
    writeFile(path.join(workspace, "inputs", "world-plan.png"), ONE_PIXEL_PNG),
    writeFile(path.join(workspace, "inputs", "entry-whitebox-target.png"), ONE_PIXEL_PNG),
  ]);
  return workspace;
}

async function runVisualReview(
  workspace: string,
  additionalArguments: readonly string[] = [],
  executionRole: "host-replay" | "builder-feedback" = "host-replay",
): Promise<Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>> {
  try {
    const result = await execFileAsync(process.execPath, [
      VISUAL_REVIEW_RENDERER,
      "--execution-role", executionRole,
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

// This suite now runs a real semantic compiler (often twice per repair fixture).
describe("Native Block Builder Skill", { timeout: 20_000 }, () => {
  it("copies each comparison raster only once while preserving exact PNG bytes", async () => {
    const workspace = await createVisualReviewWorkspace();
    const { main } = await import("../../.codex/skills/worldkit-native-block-builder/scripts/render-visual-review.source.js");
    const from = vi.spyOn(Buffer, "from");
    let rasterCopies: number;
    try {
      await main(["--execution-role", "host-replay", "--workspace", workspace]);
      rasterCopies = from.mock.calls.filter(args => args[0] instanceof Uint8Array &&
        [1544 * 768 * 4, 1928 * 540 * 4].includes(args[0].byteLength)).length;
    } finally {
      from.mockRestore();
    }
    const hashes = await Promise.all(["builder-top-down-comparison.png", "builder-entry-comparison.png"].map(async file =>
      createHash("sha256").update(await readFile(path.join(workspace, "attempts/advisory", file))).digest("hex")));
    // Hashes captured from the original encoder on the same real render fixture.
    expect(hashes).toEqual([
      "368cbc619cf121f685ad66b1e8024719db60769d2b0323d090b55f10ceeb3671",
      "e406b9b36c03699e01b9066e412146367dacdba85d53647f81305d14c6f90eb1",
    ]);
    expect(rasterCopies).toBeLessThanOrEqual(2);
  });

  it("keeps the old registered ordinary-human proxy exclusion local to Hosted selection", async () => {
    const workspace = await createWorkspace();
    const manifestPath = path.join(workspace, "native-block-authoring.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.controlledSubject.design.subjectDefinitionRef = "worldkit://subject-definition/humanoid.third-person@1";
    await writeFile(manifestPath, JSON.stringify(manifest));
    const result = await runSelfCheck(workspace);
    expect(result.report).toMatchObject({ ok: false,
      diagnosticCodes: ["NATIVE_BLOCK_BUILDER_SUBJECT_NOT_HOSTED_AUTHORING_ADMITTED"],
    });
    expect(result.exitCode).toBe(2);
    manifest.controlledSubject.design.subjectDefinitionRef = "worldkit://subject-definition/humanoid.g-bot@2";
    await writeFile(manifestPath, JSON.stringify(manifest));
    expect((await runSelfCheck(workspace)).report).toMatchObject({ ok: true, diagnosticCodes: [] });
  });

  it.each(["registered", "composed"])("rejects all unavailable Brief modes for a compiled %s Subject inside the same task", async (kind) => {
    const workspace = kind === "composed" ? await createVisualReviewWorkspace() : await createWorkspace();
    const briefPath = path.join(workspace, "inputs/scene-brief.md");
    const brief = (await readFile(briefPath, "utf8")).replace(
      /## 运动模式\n[^]*?\n## 空间/,
      "## 运动模式\n- 空中飞行（滑翔翼）：飞越峡谷。\n- 陆地步行：沿路行走。\n- 磁力墙面行走：沿墙面行走。\n\n## 空间",
    );
    const parsed = parseSceneBriefV1(brief);
    if (!parsed.ok) throw new Error("movement fixture must parse");
    const casePath = path.join(workspace, "context/case.json");
    const palettePath = path.join(workspace, "inputs/visual-identity-palette.json");
    const caseValue = JSON.parse(await readFile(casePath, "utf8"));
    const palette = JSON.parse(await readFile(palettePath, "utf8"));
    caseValue.sceneBriefHash = sha256Bytes(Buffer.from(brief));
    palette.sceneBriefHash = parsed.sceneBriefHash;
    palette.movementModes = parsed.value.movementModes.map(({ mode }) => mode);
    palette.movementModeLabels = parsed.value.movementModes.map(({ label }) => label);
    await Promise.all([
      writeFile(briefPath, brief), writeFile(casePath, JSON.stringify(caseValue)),
      writeFile(palettePath, JSON.stringify(palette)),
    ]);
    const result = await runSelfCheck(workspace);
    expect(result.report).toMatchObject({ ok: false,
      diagnosticCodes: ["NATIVE_BLOCK_BUILDER_SUBJECT_MOVEMENT_UNSATISFIED"],
      subjectSelectionDiagnostics: [{ details: {
        subjectKind: kind, requestedMovementModes: ["flight", "ground-walk", "custom"],
        executableMovementModes: ["ground-walk"], missingMovementModes: ["flight", "custom"],
      } }],
    });
    expect(result.exitCode).toBe(2);
  });

  it("rejects Runtime-field injection inside the same-task Subject design", async () => {
    const workspace = await createWorkspace();
    const manifestPath = path.join(workspace, "native-block-authoring.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.controlledSubject.design.activeMotionKernelRef = "worldkit://motion-kernel/free-ground@1";
    await writeFile(manifestPath, JSON.stringify(manifest));
    const result = await runSelfCheck(workspace);
    expect(result.exitCode).toBe(2);
    expect(result.report.diagnosticCodes).toContain("NATIVE_BLOCK_BUILDER_AUTHORING_INVALID");
  });

  it("checks source-authored exploration with the same Host parser and no fixed corridor", async () => {
    const workspace = await createWorkspace();
    const casePath = path.join(workspace, "context/case.json");
    const sourceCase = JSON.parse(await readFile(casePath, "utf8"));
    sourceCase.expected.groundConnectivity = {
      mode: "source-authored", requireSingleReachableComponent: true, requiredTraversalBands: [],
    };
    await writeFile(casePath, JSON.stringify(sourceCase));
    const manifestPath = path.join(workspace, "native-block-authoring.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    // The old frozen-case declaration cannot bypass new source-authored intent.
    expect((await runSelfCheck(workspace)).report).toMatchObject({ ok: false,
      diagnosticCodes: expect.arrayContaining(["NATIVE_BLOCK_BUILDER_AUTHORING_INVALID"]) });
    manifest.groundExploration = {
      mode: "source-authored",
      requiredTargets: [
        { id: "remote-garden", region: "remote", standPositionMetersXYZ: [8, 0, -5] },
        { id: "middle-court", region: "middle", standPositionMetersXYZ: [4, 0, -3] },
      ],
      requiredTraversalBands: [{ id: "middle-garden", halfWidthMeters: 1, isBidirectional: true,
        centerlineStandPositionsMetersXYZ: [[4, 0, -3], [8, 0, -5]] },
      { id: "entry-court", halfWidthMeters: 1, isBidirectional: false,
        centerlineStandPositionsMetersXYZ: [[0, 0, 0], [4, 0, 0], [4, 0, -3]] }],
    };
    await writeFile(manifestPath, JSON.stringify(manifest));
    expect((await runSelfCheck(workspace)).report).toMatchObject({ ok: true, diagnosticCodes: [] });
    manifest.groundExploration.requiredTargets.pop();
    await writeFile(manifestPath, JSON.stringify(manifest));
    expect((await runSelfCheck(workspace)).report).toMatchObject({ ok: false,
      diagnosticCodes: expect.arrayContaining(["NATIVE_BLOCK_BUILDER_AUTHORING_INVALID"]) });
  });

  it("uses the frozen optional-ground policy without bypassing declared-row validation", async () => {
    const workspace = await createWorkspace();
    const casePath = path.join(workspace, "context/case.json");
    const sourceCase = JSON.parse(await readFile(casePath, "utf8"));
    sourceCase.expected.groundConnectivity = {
      mode: "source-authored", requireSingleReachableComponent: false, requiredTraversalBands: [],
    };
    await writeFile(casePath, JSON.stringify(sourceCase));
    const manifestPath = path.join(workspace, "native-block-authoring.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.groundExploration = { mode: "source-authored", requiredTargets: [], requiredTraversalBands: [] };
    await writeFile(manifestPath, JSON.stringify(manifest));
    expect((await runSelfCheck(workspace)).report).toMatchObject({ ok: true, diagnosticCodes: [] });
    sourceCase.expected.groundConnectivity.requireSingleReachableComponent = true;
    await writeFile(casePath, JSON.stringify(sourceCase));
    expect((await runSelfCheck(workspace)).report).toMatchObject({ ok: false,
      diagnosticCodes: expect.arrayContaining(["NATIVE_BLOCK_BUILDER_AUTHORING_INVALID"]) });
    sourceCase.expected.groundConnectivity.requireSingleReachableComponent = false;
    await writeFile(casePath, JSON.stringify(sourceCase));
    manifest.groundExploration.requiredTargets = [
      { id: "at-spawn", region: "middle", standPositionMetersXYZ: [0, 0, 0] },
    ];
    await writeFile(manifestPath, JSON.stringify(manifest));
    expect((await runSelfCheck(workspace)).report).toMatchObject({ ok: false,
      diagnosticCodes: expect.arrayContaining(["NATIVE_BLOCK_BUILDER_AUTHORING_INVALID"]) });
  });

  it("preserves the old exploration anchor count through the portable checker", async () => {
    const workspace = await createWorkspace();
    const casePath = path.join(workspace, "context/case.json");
    const sourceCase = JSON.parse(await readFile(casePath, "utf8"));
    sourceCase.expected.groundConnectivity = {
      mode: "source-authored", requireSingleReachableComponent: true, requiredTraversalBands: [],
    };
    const manifestPath = path.join(workspace, "native-block-authoring.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.groundExploration = {
      mode: "source-authored",
      requiredTargets: Array.from({ length: 257 }, (_, index) => ({
        id: `target-${String(index).padStart(3, "0")}`,
        region: index === 0 ? "middle" : "remote",
        standPositionMetersXYZ: [index + 1, 0, 0],
      })),
      requiredTraversalBands: [{ id: "entry", halfWidthMeters: 1, isBidirectional: true,
        centerlineStandPositionsMetersXYZ: [[0, 0, 0], [1, 0, 0]] }],
    };
    await Promise.all([
      writeFile(casePath, JSON.stringify(sourceCase)),
      writeFile(manifestPath, JSON.stringify(manifest)),
    ]);
    expect((await runSelfCheck(workspace)).report).toMatchObject({ ok: true, diagnosticCodes: [] });
  });

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
    expect(skill).toContain("construction inventory against both images");
    expect(skill).toContain("including important scenery that has no visual-target");
    expect(skill).toContain("never erase a major region or flatten a required rise to free budget");
    expect(skill).toContain("Mere target presence is");
    for (const instructions of [skill, outputContract]) {
      expect(instructions).toContain("the ground evidence arrays may be empty");
      expect(instructions).toContain("Optional ground evidence does not grant unsupported movement");
    }
    expect(skill).toContain(
      "`WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED` is advisory only",
    );
    expect(skill).toContain(
      "Do not spend repair budget solely to eliminate that warning",
    );
    expect(skill).toContain("actually open and inspect both PNGs");
    expect(skill).toContain("Type, structural and visual feedback share this one counter");
    expect(skill).toContain("never author a parallel block list or review manifest");
    expect(skill).toContain("Host may replay the same renderer after Native Check");
    expect(skill).toContain("neither the renderer nor the Host may score semantic similarity");
    expect(skill).toContain("do not replace the separate Host-owned bounded external repair Attempts");
    expect(skill).toContain(
      "A Host-owned external repair is never another self-repair cycle",
    );
    expect(skill).toContain("fresh identity-bearing Native generation Attempt");
    expect(skill).toContain("new request and task ID");
    expect(skill).toContain("Ordinary Scene production has no external diagnostic-repair Attempts");
    expect(skill).toContain("Provider-task retry accounting is separate");
    expect(skill).toContain("available only to explicit strict-acceptance runs");
    expect(skill).toContain("A stricter Profile alone is not authorization for external repair");
    expect(agentsRules).toContain(
      "Automatic Planner and Canonical Builder work has one logical Codex task per stage",
    );
    expect(agentsRules).toContain(
      "Each Native Attempt has one logical Codex task and may perform only its own bounded checker-driven self-repair inside that task",
    );
    expect(agentsRules).toContain("Local execution remains one physical task");
    expect(agentsRules).toContain("Provider Task Attempts do not allocate Native source-repair Attempts or extra in-task repair cycles");
    // The portable task consumes the frozen Registry, not a bundled default
    // catalog or Runtime state owner. Keep failures bounded for minified bundles.
    expect(await readFile(path.resolve("scripts/agents/agent-native-block-builder-self-check.mjs"), "utf8"))
      .not.toContain("activeMotionKernelRef");
    expect((await readFile(CHECKER, "utf8")).includes("activeMotionKernelRef")).toBe(false);
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
    expect(skill).toContain("trusted smoothed support surface");
    expect(skill).toContain("does not require equality between the raw top Y and the final triangle Y");
    expect(skill).toContain("old one-meter shared-corner smoothing threshold");
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
    expect(outputContract).toContain("Add visual membership only for actual Case-declared semantic targets");
    expect(outputContract).not.toContain('visualGroupId: "entry-ground-group"');
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
      "prefer `for (const [xMeters, zMeters] of cells)`",
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
      "A pass check's `acceptanceTargetRef` binds at least one required `ground` Collider",
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
      "center lattice is `[0.25, 0.25, 0.25]` meters",
    );
    expect(outputContract).toContain(
      "occupancy grid is `[0.5, 0.5, 0.5]` meters",
    );
    for (const shapeContract of [
      "`full`: `[1, 1, 1]`",
      "`half`: `[1, 0.5, 1]`",
      "`quarter`: `[0.5, 0.5, 1]`",
      "`small`: `[0.5, 0.5, 0.5]`",
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
      "Preserve source-top stand positions with full Capsule-footprint support",
    );
    expect(outputContract).not.toContain(
      "The representative Case needs a readable central ascent, T-shaped upper platform",
    );
    expect(outputContract).not.toContain(
      "every non-root structural or playable block needs a face-contact support chain to the lowest occupied stratum",
    );
    expect(skill).not.toContain("Every floor needs visible support depth down to the shared root stratum");
    for (const instructions of [skill, outputContract]) {
      expect(instructions).toContain("`WORLDKIT_NATIVE_BLOCK_STRUCTURAL_SUPPORT_MISSING` is advisory only");
      expect(instructions).toContain("Do not extend all floors to the global lowest Block");
      expect(instructions).toContain("no floating-intent approval or support-disposition output");
    }
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
      expect(frozen === live, `${relativePath} must be byte-identical`).toBe(true);
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
  }, 120_000);

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
      "centerMetersXYZ: [0, 0.25 + stepIndex * 0.5, -1 - stepIndex]",
    );
    expect(outputContract).toContain(
      "stack `n` `half` blocks at the same XZ center with Y centers `0.25 + 0.5 * j`",
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
        0.25 + stepIndex * 0.5,
        -1 - stepIndex,
      ] as const;
      stairColumns.push(centerMetersXYZ);
      expect(babylonNativeBlockCenterAlignsToGridV1({
        shape: "half",
        centerMetersXYZ,
        rotationQuarterTurnsY: 0,
      })).toBe(true);
    }
    for (let columnIndex = 1; columnIndex < stairColumns.length; columnIndex += 1) {
      const previous = new Set(babylonNativeBlockOccupiedMicroCellKeysV1({
        shape: "half",
        centerMetersXYZ: stairColumns[columnIndex - 1]!,
        rotationQuarterTurnsY: 0,
      }));
      const current = babylonNativeBlockOccupiedMicroCellKeysV1({
        shape: "half",
        centerMetersXYZ: stairColumns[columnIndex]!,
        rotationQuarterTurnsY: 0,
      });
      expect(current.some((key) => previous.has(key))).toBe(false);
    }
    const stackedKeys = new Set<string>();
    for (let treadIndex = 0; treadIndex < 4; treadIndex += 1) {
      const centerMetersXYZ = [0, 0.25 + 0.5 * treadIndex, 0] as const;
      expect(babylonNativeBlockCenterAlignsToGridV1({
        shape: "half",
        centerMetersXYZ,
        rotationQuarterTurnsY: 0,
      })).toBe(true);
      const keys = babylonNativeBlockOccupiedMicroCellKeysV1({
        shape: "half",
        centerMetersXYZ,
        rotationQuarterTurnsY: 0,
      });
      expect(keys.some((key) => stackedKeys.has(key))).toBe(false);
      for (const key of keys) stackedKeys.add(key);
    }
    expect(babylonNativeBlockCenterAlignsToGridV1({
      shape: "half",
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
      shape: "half",
      centerMetersXYZ: [0, 0.25, -1],
      rotationQuarterTurnsY: 0,
    }).some((key) => entryGroundKeys.has(key))).toBe(false);
  });

  it("registers the focused root command", () => {
    expect(packageJson.scripts["check:native-block-builder-skill"]).toBe(
      "vitest run scripts/agents/native-block-builder-skill.test.ts",
    );
  });

  it("rejects a corner-only ground band inside the Builder task and accepts a real connecting Block", async () => {
    const workspace = await createVisualReviewWorkspace();
    const casePath = path.join(workspace, "context/case.json");
    const caseValue = JSON.parse(await readFile(casePath, "utf8"));
    caseValue.expected.groundConnectivity = { mode: "source-authored", requireSingleReachableComponent: true, requiredTraversalBands: [] };
    caseValue.expected.topology = { acceptanceTargetRef: "worldkit://acceptance-target/ground@1" };
    caseValue.expected.spawnSupport.expectedMedium = "ground";
    caseValue.expected.spawnSupport.spawnMarkerId = "player-spawn";
    caseValue.expected.spawnSupport.acceptanceTargetRef = "worldkit://acceptance-target/ground@1";
    caseValue.expected.spawnSupport.expectedPositionXYZMeters = { xMeters: 14, yMeters: 8, zMeters: -60 };
    const authoringPath = path.join(workspace, "native-block-authoring.json");
    const authoring = JSON.parse(await readFile(authoringPath, "utf8"));
    authoring.controlledSubject.design = { kind: "registered", subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2" };
    authoring.groundExploration = {
      mode: "source-authored",
      requiredTargets: [
        { id: "middle", region: "middle", standPositionMetersXYZ: [14, 8, -59] },
        { id: "remote", region: "remote", standPositionMetersXYZ: [17, 8, -62] },
      ],
      requiredTraversalBands: [
        { id: "entry-middle", halfWidthMeters: 2, isBidirectional: true,
          centerlineStandPositionsMetersXYZ: [[14, 8, -60], [14, 8, -59]] },
        { id: "corner-band", halfWidthMeters: 2, isBidirectional: true,
          centerlineStandPositionsMetersXYZ: [[14, 8, -60], [17, 8, -62]] },
      ],
    };
    const source = `import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
import { createBabylonNativeBlockProfileSessionV1 } from "@whitebox-world/native-babylon-block-profile";
export default defineBabylonNativeScene({ kind: "babylon-native-scene-module", id: "corner-band-world", build(context) {
  const session = createBabylonNativeBlockProfileSessionV1(context);
  session.createBlockGrid({ idPrefix: "forecourt", shape: "full", paletteRole: "route", visualGroupId: "central-gate", colliderGroupId: "ground-group", minimumCenterMetersXYZ: [13,7.5,-61], repeatCountXYZ: [3,1,4] });
  session.createBlockGrid({ idPrefix: "bypass", shape: "full", paletteRole: "route", visualGroupId: "upper-platform", colliderGroupId: "ground-group", minimumCenterMetersXYZ: [16,7.5,-65], repeatCountXYZ: [4,1,4] });
  const hasBridge = false;
  if (hasBridge) session.createBlock({ id: "real-connector", shape: "full", paletteRole: "route", colliderGroupId: "ground-group", centerMetersXYZ: [16,7.5,-61] });
  session.finalize({ staticColliders: [{ id: "ground-collider", colliderGeometrySource: { kind: "block-group", colliderGroupId: "ground-group" }, traversalBinding: { kind: "static-surface", surfaceEntityId: "ground-surface", logicalSubshapeId: "ground-top", traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1" }, exposedEdgePolicy: "none" }] });
  context.registration.registerSpawnMarker({ id: context.bootstrap.spawnMarkerId, positionMetersXYZ: [14,8,-60], facingRadians: 0 });
} });`;
    await Promise.all([
      writeFile(casePath, JSON.stringify(caseValue)),
      writeFile(authoringPath, JSON.stringify(authoring)),
      writeFile(path.join(workspace, "scene.ts"), source),
    ]);
    expect((await runSelfCheck(workspace)).exitCode).toBe(0);
    const rejected = await runVisualReview(workspace, [], "builder-feedback");
    expect(rejected.stderr).toContain("NATIVE_BLOCK_BUILDER_GROUND_INVALID");
    expect(rejected.exitCode).toBe(2);
    expect(rejected.stderr).toContain("ground-traversal-band-reachability");
    expect(rejected.stderr).toContain("corner-band");
    const disconnectedFeedback = JSON.parse(rejected.stderr.split("NATIVE_BLOCK_BUILDER_GROUND_INVALID: ")[1]!.trim());
    expect(disconnectedFeedback).toMatchObject({
      disconnectedComponentCount: 1,
      disconnectedComponentSummaries: [{
        minimumMetersXYZ: [16, 8, -65],
        maximumMetersXYZ: [19, 8, -62],
      }],
    });
    expect(disconnectedFeedback.disconnectedComponentSummaries[0].standPositionCount)
      .toBe(disconnectedFeedback.metrics.disconnectedStandablePositionCount);
    expect(disconnectedFeedback.disconnectedComponentSummaries[0].sampleStandPositionMetersXYZ)
      .toHaveLength(3);
    const islands = Array.from({ length: 17 }, (_, index) =>
      `session.createBlock({ id: "island-${index}", shape: "full", paletteRole: "route", colliderGroupId: "ground-group", centerMetersXYZ: [${100 + index * 10},7.5,0] });`);
    const summariesByOrder = [];
    for (const rows of [islands, [...islands].reverse()]) {
      await writeFile(path.join(workspace, "scene.ts"), source.replace("const hasBridge = false;", `${rows.join("\n")}\nconst hasBridge = false;`));
      const manyIslands = await runVisualReview(workspace, [], "builder-feedback");
      expect(manyIslands.exitCode).toBe(2);
      const feedback = JSON.parse(manyIslands.stderr.split("NATIVE_BLOCK_BUILDER_GROUND_INVALID: ")[1]!.trim());
      expect(feedback.disconnectedComponentCount).toBe(18);
      expect(feedback.disconnectedComponentSummaries).toHaveLength(16);
      // The 52-position bypass comes first; equal-size islands have stable position ordering.
      expect(feedback.disconnectedComponentSummaries.map((row: { minimumMetersXYZ: number[] }) => row.minimumMetersXYZ[0]))
        .toEqual([16, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240]);
      summariesByOrder.push(feedback.disconnectedComponentSummaries);
    }
    expect(summariesByOrder[0]).toEqual(summariesByOrder[1]);
    await writeFile(path.join(workspace, "scene.ts"), source.replace("hasBridge = false", "hasBridge = true"));
    const accepted = await runVisualReview(workspace, [], "builder-feedback");
    expect(accepted.exitCode, accepted.stderr).toBe(0);
    expect(JSON.parse(accepted.stdout)).toMatchObject({ groundFeedback: {
      outcome: "passed", failureFacts: [],
      disconnectedComponentCount: 0, disconnectedComponentSummaries: [],
    } });
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

  it("rejects the removed step shape in both portable tools and accepts the legacy half shape", async () => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    const removedCall = 'session.createBlock({ id: "shape-probe", shape: "step", paletteRole: "ground", centerMetersXYZ: [10, 0.125, 0] });';
    await writeFile(sourcePath, source.replace("session.finalize(", `${removedCall}\nsession.finalize(`));
    const rejected = await runSelfCheck(workspace);
    expect(rejected.exitCode).toBe(2);
    expect(rejected.report.diagnosticCodes).toContain("WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED");
    expect(rejected.report.typecheckDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ typescriptCode: 2322, sourcePath: "scene.ts" }),
    ]));
    const rejectedReview = await runVisualReview(workspace);
    expect(rejectedReview.exitCode).toBe(2);
    expect(rejectedReview.stderr).toContain("WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID");
    for (const file of ["builder-top-down-comparison.png", "builder-entry-comparison.png"]) {
      await expect(readFile(path.join(workspace, "attempts/advisory", file)))
        .rejects.toMatchObject({ code: "ENOENT" });
    }
    const admittedCall = removedCall.replace('shape: "step"', 'shape: "half"').replace("0.125", "0.25");
    await writeFile(sourcePath, source.replace("session.finalize(", `${admittedCall}\nsession.finalize(`));
    expect((await runSelfCheck(workspace)).report).toMatchObject({ ok: true, typecheckDiagnostics: [] });
    expect((await runVisualReview(workspace)).exitCode).toBe(0);
  });

  it("accepts actual ungrouped Blocks when the Case declares no semantic targets", async () => {
    const workspace = await createVisualReviewWorkspace();
    const casePath = path.join(workspace, "context/case.json");
    const manifestPath = path.join(workspace, "native-block-authoring.json");
    const sourcePath = path.join(workspace, "scene.ts");
    const caseValue = JSON.parse(await readFile(casePath, "utf8"));
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    caseValue.expected.semanticSilhouetteTargets = [];
    manifest.visualGroups = [];
    await Promise.all([
      writeFile(casePath, JSON.stringify(caseValue)),
      writeFile(manifestPath, JSON.stringify(manifest)),
      writeFile(sourcePath, (await readFile(sourcePath, "utf8"))
        .replace(/^\s*visualGroupId: "(?:upper-platform|central-gate)",\n/gm, "\n")),
    ]);

    const result = await runSelfCheck(workspace);
    expect(result).toMatchObject({ exitCode: 0, stderr: "", report: { ok: true, diagnosticCodes: [] } });
  });

  it("checks the legacy declared cardinal front and binds its source bytes without inferring a default", async () => {
    const workspace = await createWorkspace();
    const manifestPath = path.join(workspace, "native-block-authoring.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.visualGroups[0].frontDirectionWorldXZ = [1, 0];
    await writeFile(manifestPath, JSON.stringify(manifest));
    const accepted = await runSelfCheck(workspace);
    expect(accepted.exitCode).toBe(0);
    delete manifest.visualGroups[0].frontDirectionWorldXZ;
    await writeFile(manifestPath, JSON.stringify(manifest));
    const missing = await runSelfCheck(workspace);
    expect(missing.report.diagnosticCodes).toContain("NATIVE_BLOCK_BUILDER_AUTHORING_INVALID");
    manifest.visualGroups[0].frontDirectionWorldXZ = [1, 1];
    await writeFile(manifestPath, JSON.stringify(manifest));
    expect((await runSelfCheck(workspace)).report.diagnosticCodes).toContain("NATIVE_BLOCK_BUILDER_AUTHORING_INVALID");
  });

  it("reports strict indexed tuple errors before delivery and rechecks repaired source", async () => {
    const workspace = await createWorkspace();
    const original = await readFile(path.join(workspace, "scene.ts"), "utf8");
    const loop = `for (const [xOffset, zOffset] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const id = String(xOffset + 1) + String(zOffset + 1);
      const x = 10 + xOffset;
      const z = 10 + zOffset;
      void id; void x; void z;
    }`;
    await writeFile(path.join(workspace, "scene.ts"), original.replace("void blocks;", loop));
    const rejected = await runSelfCheck(workspace);
    expect(rejected.exitCode).toBe(2);
    expect(rejected.report.diagnosticCodes).toContain("WORLDKIT_NATIVE_SCENE_TYPECHECK_FAILED");
    expect(rejected.report.typecheckDiagnostics).toHaveLength(4);
    expect(rejected.report.typecheckDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ typescriptCode: 18048, sourcePath: "scene.ts", message: expect.stringContaining("possibly 'undefined'") }),
    ]));
    await writeFile(path.join(workspace, "scene.ts"), original.replace("void blocks;", loop.replace("]]) {", "]] as const) {")));
    expect((await runSelfCheck(workspace)).report).toMatchObject({ ok: true, typecheckDiagnostics: [] });
  }, 20_000);

  it.each([
    ['createBabylonNativeBlockProfileSessionV1(context, { maximumBlockCount: 8 });', 2554],
    ['blocks.createBlock({ id: "bad", shape: "cube", paletteRole: "ground", centerMetersXYZ: [0, 0, 0] });', 2322],
    ['blocks.createBlock({ id: "bad", shape: "full", paletteRole: "ground" });', 2345],
    ['const count: number = "bad"; void count;', 2322],
    ['const value: { x?: number } = { x: undefined }; void value;', 2375],
  ])("checks actual SDK types and strict options: %s", async (statement, code) => {
    const workspace = await createWorkspace();
    const source = await readFile(path.join(workspace, "scene.ts"), "utf8");
    await writeFile(path.join(workspace, "scene.ts"), source.replace("void blocks;", statement));
    const report = (await runSelfCheck(workspace)).report;
    expect(report.ok).toBe(false);
    expect(report.typecheckDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ typescriptCode: code }),
    ]));
  }, 20_000);

  it("renders an 8,100-Block complete slab without the retired source cap", async () => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    await writeFile(sourcePath, source.replace("session.finalize(", `
      session.createBlockGrid({ idPrefix: "complete-world", shape: "full", paletteRole: "ground",
        minimumCenterMetersXYZ: [1000, -0.5, 1000], repeatCountXYZ: [81, 1, 100] });
      session.finalize(`));
    const result = await runVisualReview(workspace);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(JSON.parse(result.stdout)).toMatchObject({ blockCount: 8_104 });
    const metadata = await sharp(path.join(workspace, "attempts/advisory/builder-top-down-comparison.png")).metadata();
    expect(metadata).toMatchObject({ width: 1544, height: 768 });
  });

  it("typechecks with a relocated standalone checker and no repository dependency access", async () => {
    const workspace = await createWorkspace();
    const toolsRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "native-checker-only-")));
    temporaryDirectories.push(toolsRoot);
    const checker = path.join(toolsRoot, "self-check.mjs");
    await writeFile(checker, await readFile(CHECKER));
    const result = await runSelfCheck(workspace, checker);
    expect(result.stderr).toBe("");
    expect(result.report).toMatchObject({ ok: true, typecheckDiagnostics: [] });
  }, 20_000);

  it.each([
    { extent: 100, shape: "full", rotation: 0, center: [10, 0.5, -10], sizeXZ: [1, 1], outlined: false },
    { extent: 60, shape: "full", rotation: 0, center: [10, 0.5, -10], sizeXZ: [1, 1], outlined: true },
    { extent: 60, shape: "quarter", rotation: 0, center: [10.25, 0.25, -10], sizeXZ: [0.5, 1], outlined: false },
    { extent: 60, shape: "quarter", rotation: 1, center: [10, 0.25, -10.25], sizeXZ: [1, 0.5], outlined: false },
  ] as const)("keeps old top-down outline pixels for $shape rotation=$rotation extent=$extent", async ({ extent, shape, rotation, center, sizeXZ, outlined }) => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    const calls = [-extent, extent].map(x =>
      `session.createBlock({ id: "extent-${x}", shape: "full", paletteRole: "ground", centerMetersXYZ: [${x}, -0.5, 0] });`,
    ).join("\n") + `\nsession.createBlock({ id: "outline-probe", shape: "${shape}", rotationQuarterTurnsY: ${rotation}, paletteRole: "structure", visualGroupId: "central-gate", centerMetersXYZ: ${JSON.stringify(center)} });\n`;
    await writeFile(sourcePath, source.replace("session.finalize(", `${calls}session.finalize(`));
    expect(await runVisualReview(workspace)).toMatchObject({ exitCode: 0, stderr: "" });

    // Pinned 9e35ab53 drawTopDown: 768px panel, 40px padding, outline only
    // when BOTH dimensions are at least 4px; edge RGB is round(base * .72).
    // The isolated far extents control scale; the probe is the minimum Z face.
    const scale = 688 / (extent * 2 + 1);
    expect(sizeXZ.every(size => size * scale >= 4)).toBe(outlined);
    const minimumZ = center[2] - sizeXZ[1] / 2;
    const left = 40 + (center[0] - sizeXZ[0] / 2 + extent + 0.5) * scale;
    const top = (768 - (1 - minimumZ) * scale) / 2;
    const { data, info } = await sharp(path.join(workspace, "attempts/advisory/builder-top-down-comparison.png"))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const offset = (Math.round(top) * info.width + 776 + Math.round(left)) * 4;
    expect([...data.subarray(offset, offset + 4)]).toEqual(
      outlined ? [13, 37, 62, 255] : [18, 52, 86, 255],
    );
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
    const entryRgba = await sharp(firstEntry).ensureAlpha().raw().toBuffer();
    expect({ top: sha256Bytes(topRgba), entry: sha256Bytes(entryRgba) }).toEqual({
      top: "sha256:3dd59ad6c9b2476597d91bae9775ad5be6f67dacbcfb67f6b0fce9432fbd33dd",
      entry: "sha256:d35c729bc3a7c38f9a1eb8bb9e5483b8e539b57e84c4f5d6d7b40d6e5e767c09",
    });
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
    const originalBootstrapBytes = await readFile(path.join(workspace, "inputs/native-scene.bootstrap.json"));
    const authoringPath = path.join(workspace, "native-block-authoring.json");
    const authoring = JSON.parse(await readFile(authoringPath, "utf8"));
    await writeFile(authoringPath, JSON.stringify({ ...authoring,
      openingCamera: { ...authoring.openingCamera, fovDegrees: 44, distanceMeters: 5.5 } }));
    const retuned = await runVisualReview(workspace);
    expect(retuned.exitCode).toBe(0);
    expect(await readFile(topPath)).toEqual(firstTop);
    expect(await readFile(entryPath)).not.toEqual(firstEntry);
    expect(await readFile(path.join(workspace, "inputs/native-scene.bootstrap.json"))).toEqual(originalBootstrapBytes);

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

  it.each(["id", "visualGroupId", "colliderGroupId"] as const)(
    "rejects decimal-coordinate %s with the Host Profile rule before advisory completion", async (field) => {
      const workspace = await createVisualReviewWorkspace();
      const sourcePath = path.join(workspace, "scene.ts");
      const source = await readFile(sourcePath, "utf8");
      const row = { id: "tower-probe", shape: "full", paletteRole: "structure",
        centerMetersXYZ: [10, 9.5, 0], [field]: "tower-lower-p9.5" };
      await writeFile(sourcePath, source.replace("session.finalize(",
        `session.createBlock(${JSON.stringify(row)});\nsession.finalize(`));
      const result = await runVisualReview(workspace);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID");
      expect(result.stderr).toContain(field);
      expect(result.stderr).toContain("tower-lower-p9.5");
    },
  );

  it.each([
    ["extra create field", 'id: "gate",', 'id: "gate", unexpected: true,', "CREATE_INPUT_INVALID"],
    ["null create rotation", 'id: "gate",', 'id: "gate", rotationQuarterTurnsY: null,', "CREATE_INPUT_INVALID"],
    ["explicit undefined rotation", 'id: "gate",', 'id: "gate", rotationQuarterTurnsY: undefined,', "CREATE_INPUT_INVALID"],
    ["extra grid field", 'idPrefix: "ground",', 'idPrefix: "ground", unexpected: true,', "GRID_CREATE_INPUT_INVALID"],
    ["short grid prefix", 'idPrefix: "ground",', 'idPrefix: "ab",', "GRID_CREATE_INPUT_INVALID"],
    ["null grid rotation", 'idPrefix: "ground",', 'idPrefix: "ground", rotationQuarterTurnsY: null,', "GRID_CREATE_INPUT_INVALID"],
    ["empty Collider row", 'staticColliders: []', 'staticColliders: [{}]', "COLLIDER_SELECTION_INVALID"],
    ["unknown finalize field", 'staticColliders: []', 'staticColliders: [], unexpected: true', "FINALIZE_INPUT_INVALID"],
    ["invalid Collider ratio", 'staticColliders: []', 'staticColliders: [{ id: "gate-solid", colliderGeometrySource: { kind: "block", blockId: "gate" }, traversalBinding: { kind: "not-traversable" }, exposedEdgePolicy: "none", frictionRatio: 2 }]', "COLLIDER_SELECTION_INVALID"],
    ["invalid edge policy join", 'staticColliders: []', 'staticColliders: [{ id: "gate-solid", colliderGeometrySource: { kind: "block", blockId: "gate" }, traversalBinding: { kind: "not-traversable" }, exposedEdgePolicy: "protect-ground-subject" }]', "COLLIDER_SELECTION_INVALID"],
    ["mixed Collider source branches", 'staticColliders: []', 'staticColliders: [{ id: "gate-solid", colliderGeometrySource: { kind: "block", blockId: "gate", colliderGroupId: "another-group" }, traversalBinding: { kind: "not-traversable" }, exposedEdgePolicy: "none" }]', "COLLIDER_SELECTION_INVALID"],
  ] as const)("matches Host input rejection for %s", async (_name, search, replacement, suffix) => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    expect(source).toContain(search);
    await writeFile(sourcePath, source.replace(search, replacement));
    const result = await runVisualReview(workspace);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(`WORLDKIT_NATIVE_BLOCK_${suffix}`);
  });


  it("preflights a whole grid before a caught duplicate-ID failure can leave Blocks", async () => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    const calls = [
      'session.createBlock({ id: "batch-x1-y0-z0", shape: "full", paletteRole: "structure", centerMetersXYZ: [10, 0.5, 0] });',
      'try { session.createBlockGrid({ idPrefix: "batch", shape: "full", paletteRole: "structure", minimumCenterMetersXYZ: [20, 0.5, 0], repeatCountXYZ: [2, 1, 1] }); } catch {}',
      'session.createBlock({ id: "batch-x0-y0-z0", shape: "full", paletteRole: "structure", centerMetersXYZ: [20, 0.5, 0] });',
    ].join("\n");
    await writeFile(sourcePath, source
      .replace("session.finalize(", calls + "\nsession.finalize("));
    const result = await runVisualReview(workspace);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it.each([
    ['session.createBlock({ id: "late-block", shape: "full", paletteRole: "structure", centerMetersXYZ: [10, 0.5, 0] });', "SESSION_CLOSED"],
    ['session.createBlockGrid({ idPrefix: "late-grid", shape: "full", paletteRole: "structure", minimumCenterMetersXYZ: [10, 0.5, 0], repeatCountXYZ: [1, 1, 1] });', "SESSION_CLOSED"],
    ['session.finalize({ staticColliders: [{ id: "gate-solid", colliderGeometrySource: { kind: "block", blockId: "gate" }, traversalBinding: { kind: "not-traversable" }, exposedEdgePolicy: "none" }] });', "FINALIZE_INPUT_MISMATCH"],
  ] as const)("matches Host post-finalize rejection for %s", async (call, code) => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    await writeFile(sourcePath, source.replace('session.finalize({ staticColliders: [] });',
      'session.finalize({ staticColliders: [] });\n' + call));
    const result = await runVisualReview(workspace);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("WORLDKIT_NATIVE_BLOCK_" + code);
  });
  it("matches Host idempotent finalization without another captured output", async () => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    await writeFile(sourcePath, source.replace('session.finalize({ staticColliders: [] });',
      'session.finalize({ staticColliders: [] });\nsession.finalize({ staticColliders: [] });'));
    expect((await runVisualReview(workspace)).exitCode).toBe(0);
  });

  it.each([
    ["overlap", [0.5, -0.5, 0], "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP"],
    ["off-grid", [0.1, 0.5, -2], "WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID"],
  ] as const)("feeds %s back before advisory images can claim completion", async (_kind, center, code) => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    await writeFile(sourcePath, source.replace("centerMetersXYZ: [0, 0.5, -2]", `centerMetersXYZ: ${JSON.stringify(center)}`));
    const result = await runVisualReview(workspace);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain(code);
  });

  it.each([2, 32, 40])("reports up to 32 distinct occupancy pairs from %i independent overlaps before writing PNGs", async (pairCount) => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    const calls = Array.from({ length: pairCount }, (_, index) => ["base", "overlap"].map((role) =>
      `session.createBlock({ id: "${role}-${index}", shape: "full", paletteRole: "ground", centerMetersXYZ: [${10 + index * 2}, -0.5, 0] });`,
    ).join("\n")).join("\n");
    await writeFile(sourcePath, source
      .replace("session.finalize(", `${calls}\nsession.finalize(`));
    const result = await runVisualReview(workspace);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP");
    const pairs = [...result.stderr.matchAll(/block '([^']+)' overlaps '([^']+)' at cell ([^;\n]+)/g)];
    expect(pairs.map(([, id, otherId, cell]) => [id, otherId, cell])).toEqual(
      Array.from({ length: Math.min(pairCount, 32) }, (_, index) => [
        `overlap-${index}`, `base-${index}`, `${19 + index * 4},-2,-1`,
      ]),
    );
    expect(result.stderr.includes("additional overlapping Block pairs omitted (limit 32)")).toBe(pairCount > 32);
    expect(result.stderr.length).toBeLessThan(5_000);
    expect(await runVisualReview(workspace)).toEqual(result);
    for (const file of ["builder-top-down-comparison.png", "builder-entry-comparison.png"]) {
      await expect(readFile(path.join(workspace, "attempts/advisory", file))).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("reports later conflict families even after the first 32 overlap witnesses", async () => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    const early = Array.from({ length: 40 }, (_, index) => ["base", "overlap"].map(role =>
      `session.createBlock({ id: "${role}-${index}", shape: "full", paletteRole: "ground", centerMetersXYZ: [${10 + index * 2}, -0.5, 0] });`,
    ).join("\n")).join("\n");
    const late = [
      'session.createBlock({ id: "late-cliff", shape: "full", paletteRole: "background-mass", centerMetersXYZ: [400, 0.5, 0] });',
      'session.createBlock({ id: "late-waterfall", shape: "full", paletteRole: "water-like-visual", centerMetersXYZ: [400, 0.5, 0] });',
    ].join("\n");
    await writeFile(sourcePath, source.replace("session.finalize(", `${early}\n${late}\nsession.finalize(`));
    const result = await runVisualReview(workspace);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("late-waterfall");
    expect(result.stderr).toContain("late-cliff");
    expect(result.stderr).toContain('"isComplete":true');
    expect(result.stderr).toContain('"conflictingBlockCount":41');
    expect(result.stderr.match(/ at cell /g)).toHaveLength(32);
    expect(result.stderr.length).toBeLessThan(8_000);
    expect(await runVisualReview(workspace)).toEqual(result);
  });

  it("keeps complete dense-overlap feedback bounded without stopping at pair 33", async () => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    const calls = `for (let index = 0; index < 20000; index += 1) {
      session.createBlock({ id: "dense-" + index, shape: "full", paletteRole: "ground", centerMetersXYZ: [400, 0.5, 0] });
    }`;
    await writeFile(sourcePath, source.replace("session.finalize(", `${calls}\nsession.finalize(`));
    const result = await runVisualReview(workspace);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('"isComplete":true');
    expect(result.stderr).toContain('"conflictingBlockCount":19999');
    expect(result.stderr).toContain('"lastWitnessBlockIds":["dense-19999","dense-0"]');
    expect(result.stderr.length).toBeLessThan(8_000);
  });

  it("uses the old first-occupant witness for three coincident Blocks", async () => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    const calls = ["a", "b", "c"].map((id) =>
      `session.createBlock({ id: "coincident-${id}", shape: "full", paletteRole: "ground", centerMetersXYZ: [10, -0.5, 0] });`,
    ).join("\n");
    await writeFile(sourcePath, source.replace("session.finalize(", `${calls}\nsession.finalize(`));
    const result = await runVisualReview(workspace);
    expect(result.exitCode).toBe(2);
    expect([...result.stderr.matchAll(/block '([^']+)' overlaps '([^']+)' at cell ([^;\n]+)/g)]
      .map(([, id, otherId, cell]) => [id, otherId, cell])).toEqual([
      ["coincident-b", "coincident-a", "19,-2,-1"],
      ["coincident-c", "coincident-a", "19,-2,-1"],
    ]);
  });

  it("rejects invalid long IDs with bounded escaped Profile feedback before occupancy", async () => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    const prefix = "\u0000'\n\u001b\u0085\u2028".repeat(30);
    const calls = Array.from({ length: 32 }, (_, index) => ["base", "overlap"].map((role) =>
      `session.createBlock({ id: ${JSON.stringify(`${prefix}${role}-${index}`)}, shape: "full", paletteRole: "ground", centerMetersXYZ: [${10 + index * 2}, -0.5, 0] });`,
    ).join("\n")).join("\n");
    await writeFile(sourcePath, source
      .replace("session.finalize(", `${calls}\nsession.finalize(`));
    const result = await runVisualReview(workspace);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID");
    expect(result.stderr).not.toContain(" at cell ");
    expect(result.stderr).toContain(sha256Bytes(Buffer.from(`${prefix}base-0`)));
    expect(Buffer.byteLength(result.stderr)).toBeLessThan(40_000);
    expect(result.stderr.trimEnd()).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
    expect(result.stderr).toContain("\\u0027");
    expect(result.stderr).toContain("\\n");
  });

  it.each(["later-off-grid", "caught-overflow"])("retains occupancy rejection and no PNGs despite %s", async (mode) => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    const pairCount = mode === "caught-overflow" ? 40 : 2;
    const calls = Array.from({ length: pairCount }, (_, index) => ["base", "overlap"].map((role) =>
      `try { session.createBlock({ id: "${role}-${index}", shape: "full", paletteRole: "ground", centerMetersXYZ: [${10 + index * 2}, -0.5, 0] }); } catch {}`,
    ).join("\n")).join("\n");
    const laterFailure = mode === "later-off-grid"
      ? 'session.createBlock({ id: "off-grid", shape: "full", paletteRole: "ground", centerMetersXYZ: [0.1, 0.5, -2] });'
      : "";
    await writeFile(sourcePath, source
      .replace("session.finalize(", `${calls}\n${laterFailure}\nsession.finalize(`));
    const result = await runVisualReview(workspace);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP");
    expect(result.stderr.match(/ at cell /g)).toHaveLength(Math.min(pairCount, 32));
    expect(result.stderr.includes("additional overlapping Block pairs omitted (limit 32)")).toBe(mode === "caught-overflow");
    expect(result.stderr).toContain(`"isComplete":${mode === "caught-overflow"}`);
    for (const file of ["builder-top-down-comparison.png", "builder-entry-comparison.png"]) {
      await expect(readFile(path.join(workspace, "attempts/advisory", file))).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it.each(["structure", "hazard", "water-like-visual", "background-mass"])(
    "keeps ordinary ungrouped %s in same-task feedback without inventing a target (CF-19/22)", async (role) => {
      const workspace = await createVisualReviewWorkspace();
      const sourcePath = path.join(workspace, "scene.ts");
      const source = await readFile(sourcePath, "utf8");
      await writeFile(sourcePath, source.replace('paletteRole: "water-like-visual"', `paletteRole: "${role}"`));
      expect(await runVisualReview(workspace)).toMatchObject({ exitCode: 0, stderr: "" });
    },
  );

  it.each(["undeclared", "empty"])("rejects %s identity groups before Builder returns (CF-19/22)", async (kind) => {
    const workspace = await createVisualReviewWorkspace();
    const sourcePath = path.join(workspace, "scene.ts");
    const source = await readFile(sourcePath, "utf8");
    await writeFile(sourcePath, source.replace('visualGroupId: "central-gate",', kind === "empty" ? "" : 'visualGroupId: "unknown-gate",'));
    const result = await runVisualReview(workspace);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(kind === "empty" ? "has no captured Blocks" : "undeclared visualGroupId");
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
        displayScaleRatio: 0.985,
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

  it("renders the registered G Bot with the old advisory cuboid pixels", async () => {
    const workspace = await createVisualReviewWorkspace();
    const authoringPath = path.join(workspace, "native-block-authoring.json");
    const authoring = JSON.parse(await readFile(authoringPath, "utf8"));
    const legacyDesign = structuredClone(authoring.controlledSubject.design);
    // Literal 9e35ab53 registered G Bot software-review proxy. Keep this
    // independent of the Host's current derived proxy, so both cannot drift.
    legacyDesign.definition.visualParts[0].shape.sizeMetersXYZ = [1.8051320314407349, 1.8092343450989574, 0.32069878280162833];
    legacyDesign.definition.visualParts[0].localTransform.positionMetersXYZ = [-1.7881393432617188e-7, 0.9042660176055506, 0.011392287909984589];
    authoring.controlledSubject.design = { kind: "registered", subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2" };
    await writeFile(authoringPath, JSON.stringify(authoring));
    expect(await runVisualReview(workspace)).toMatchObject({ exitCode: 0, stderr: "" });
    const entryPath = path.join(workspace, "attempts/advisory/builder-entry-comparison.png");
    const registeredPixels = await sharp(await readFile(entryPath)).ensureAlpha().raw().toBuffer();
    authoring.controlledSubject.design = legacyDesign;
    await writeFile(authoringPath, JSON.stringify(authoring));
    expect(await runVisualReview(workspace)).toMatchObject({ exitCode: 0, stderr: "" });
    const legacyPixels = await sharp(await readFile(entryPath)).ensureAlpha().raw().toBuffer();
    expect(registeredPixels.equals(legacyPixels)).toBe(true);
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
      controlledSubject: { visualTargetId: "visual-target-1", design: { kind: "registered" as const, subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2" } },
      groundExploration: { mode: "case-defined" as const },
      openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
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
      controlledSubject: { visualTargetId: "visual-target-1", design: { kind: "registered" as const, subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2" } },
      groundExploration: { mode: "case-defined" as const },
      openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [{
        frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "central-gate",
        acceptanceTargetRef: "worldkit://acceptance-target/central-gate@1",
        semanticClassId: "worldkit.native-block.group.central-gate",
        identityColorHex: "#AEB8C4",
        physicsBodyId: "forbidden",
      }],
    }, "NATIVE_BLOCK_BUILDER_AUTHORING_INVALID"],
    ["controlled Subject semantic class", "native-block-authoring.json", {
      kind: "native-block-authoring",
      controlledSubject: { visualTargetId: "visual-target-1", design: { kind: "registered" as const, subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2" } },
      groundExploration: { mode: "case-defined" as const },
      openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [{
        frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "rider-mount-group",
        acceptanceTargetRef: "worldkit://acceptance-target/rider-mount@1",
        semanticClassId: "subject.rider-mount",
        identityColorHex: "#AEB8C4",
      }],
    }, "NATIVE_BLOCK_BUILDER_SUBJECT_VISUAL_GROUP_FORBIDDEN"],
    ["unsorted visual-group IDs", "native-block-authoring.json", {
      kind: "native-block-authoring",
      controlledSubject: { visualTargetId: "visual-target-1", design: { kind: "registered" as const, subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2" } },
      groundExploration: { mode: "case-defined" as const },
      openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [{
        frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "z-group",
        acceptanceTargetRef: "worldkit://acceptance-target/z@1",
        semanticClassId: "worldkit.native-block.group.z",
        identityColorHex: "#AEB8C4",
      }, {
        frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "a-group",
        acceptanceTargetRef: "worldkit://acceptance-target/a@1",
        semanticClassId: "worldkit.native-block.group.a",
        identityColorHex: "#C9A96B",
      }],
    }, "NATIVE_BLOCK_BUILDER_VISUAL_GROUPS_UNSORTED"],
    ["duplicate visual-group IDs", "native-block-authoring.json", {
      kind: "native-block-authoring",
      controlledSubject: { visualTargetId: "visual-target-1", design: { kind: "registered" as const, subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2" } },
      groundExploration: { mode: "case-defined" as const },
      openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [{
        frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "same-group",
        acceptanceTargetRef: "worldkit://acceptance-target/a@1",
        semanticClassId: "worldkit.native-block.group.a",
        identityColorHex: "#AEB8C4",
      }, {
        frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "same-group",
        acceptanceTargetRef: "worldkit://acceptance-target/b@1",
        semanticClassId: "worldkit.native-block.group.b",
        identityColorHex: "#C9A96B",
      }],
    }, "NATIVE_BLOCK_BUILDER_VISUAL_GROUPS_DUPLICATE"],
    ["forbidden nested gameplay field", "native-block-authoring.json", {
      kind: "native-block-authoring",
      controlledSubject: { visualTargetId: "visual-target-1", design: { kind: "registered" as const, subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2" } },
      groundExploration: { mode: "case-defined" as const },
      openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
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
      controlledSubject: { visualTargetId: "visual-target-1", design: { kind: "registered" as const, subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2" } },
      groundExploration: { mode: "case-defined" as const },
      openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [{
        frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "central-gate",
        acceptanceTargetRef: "worldkit://acceptance-target/central-gate@1",
        semanticClassId: "worldkit.native-block.group.central-gate",
        identityColorHex: "#AEB8C4",
      }, {
        frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "upper-platform",
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
    const brief = await readFile(path.join(workspace, "inputs/scene-brief.md"), "utf8");
    const parsed = parseSceneBriefV1(brief);
    if (!parsed.ok) throw new Error("fixture Brief must parse");
    const caseValue = {
      id: "valid-native-block-world",
      sceneBriefHash: sha256Bytes(Buffer.from(brief)),
      expected: {
        groundConnectivity: { mode: "case-defined", requireSingleReachableComponent: true },
        spawnSupport: { expectedPositionXYZMeters: { xMeters: 0, yMeters: 0, zMeters: 0 } },
        semanticSilhouetteTargets: [{
        acceptanceTargetRef:
          "worldkit://acceptance-target/visual-target-3@1",
        visualGroupId: "moon-group",
      }] },
    };
    const palette = {
      kind: "worldkit-visual-identity-palette",
      schemaVersion: 1,
      sceneId: "valid-native-block-world",
      sceneBriefHash: parsed.sceneBriefHash,
      movementModes: ["ground-walk"],
      movementModeLabels: ["Ground walk"],
      targets: [
        { id: "visual-target-1", visualTargetId: "visual-target-1", targetKind: "subject", name: "Explorer", description: "controlled Subject", role: "primary-subject", semanticClassId: "visual.subject", identityColor: "#E85D5D" },
        { id: "visual-target-2", visualTargetId: "visual-target-2", targetKind: "landmark", name: "Gate", description: "primary gate", role: "primary-landmark", semanticClassId: "visual.gate", identityColor: "#F28E2B" },
        { id: "visual-target-3", visualTargetId: "visual-target-3", targetKind: "landmark", name: "Moon", description: "remote moon", role: "secondary-landmark", semanticClassId: "visual.moon", identityColor: "#D9A514" },
      ],
    };
    const authoring = (identityColorHex: string) => ({
      kind: "native-block-authoring",
      controlledSubject: { visualTargetId: "visual-target-1", design: { kind: "registered" as const, subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2" } },
      groundExploration: { mode: "case-defined" as const },
      openingCamera: { mode: "third-person" as const, distanceMeters: 5, targetHeightMeters: 1.2, pitchRadians: 0.18, fovDegrees: 56 },
      schemaVersion: 1,
      entryModulePath: "scene.ts",
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: [{
        frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "moon-group",
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

  it.each(["brief-bytes", "palette-semantic-hash", "brief-symlink"])(
    "rejects a stale or unsafe frozen identity input: %s",
    async (mutation) => {
      const workspace = await createWorkspace();
      const briefPath = path.join(workspace, "inputs/scene-brief.md");
      if (mutation === "brief-bytes") {
        await writeFile(briefPath, `${await readFile(briefPath, "utf8")}\n`);
      } else if (mutation === "brief-symlink") {
        await rm(briefPath);
        await symlink(path.resolve(
          "artifacts/scenes/cloud-temple-t-gate-native-block/inputs/scene-brief.md",
        ), briefPath);
      } else {
        const palettePath = path.join(workspace, "inputs/visual-identity-palette.json");
        const palette = JSON.parse(await readFile(palettePath, "utf8"));
        const caseValue = JSON.parse(await readFile(path.join(workspace, "context/case.json"), "utf8"));
        palette.sceneBriefHash = caseValue.sceneBriefHash;
        await writeFile(palettePath, JSON.stringify(palette));
      }
      const result = await runSelfCheck(workspace);
      expect(result.exitCode).toBe(2);
      expect(result.report.diagnosticCodes).toContain(mutation === "brief-symlink"
        ? "NATIVE_BLOCK_BUILDER_VISUAL_IDENTITY_INPUT_INVALID"
        : "NATIVE_BLOCK_BUILDER_VISUAL_IDENTITY_BINDING_INVALID");
    },
  );

  it.each([
    '{ kind: "not-traversable" }',
    '{ kind: "not-traversable", }',
    '{ kind: "not-traversable", /* formatter comment */ }',
    '{ kind: "not-traversable", // formatter comment\n }',
  ])("accepts a closed not-traversable binding with legal syntax: %s", async (binding) => {
    const workspace = await createWorkspace();
    await writeFile(path.join(workspace, "scene.ts"), `const binding = ${binding};\n`);
    expect((await runSelfCheck(workspace)).report).toMatchObject({
      ok: true,
      diagnosticCodes: [],
    });
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
