import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { runPlannerSelfCheck } from "./agent-planner-self-check.js";

const PLANNER_VERSION = "worldkit-planner-self-check-v4";
const FIXED_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGN8ERvLgA0wYRUdtBIASu4BsuOW+LcAAAAASUVORK5CYII=",
  "base64",
);
const FIXED_PNG_HASH =
  "sha256:49e9b3d8739f929f5b65af04566247a348615ac982541c1e85cd9f1a672efe08";

const VALID_TERRAIN_PROMPT = `# Terrain Height Intent

Reference roles: Image 1 is the primary-coordinate reference.
Base terrain: broad continuous valley and hills.
Depressions: one shallow basin.
Static Landmark and Structure exclusions: omit the tower and buildings.
Entry and connectivity: preserve stable connected ground at the entry.
Orientation: bottom is entry and top is world-forward.
Encoding profile: signed-diverging-blue-gray-orange@1 using RGB(32,64,208), RGB(128,128,128), and RGB(224,96,32).
`;

async function terrainIntentPng(
  kind: "valid" | "moderate-residual" | "constant" | "off-ramp",
) {
  const pixels = new Uint8Array(8 * 8 * 3);
  for (let index = 0; index < 64; index += 1) {
    const color = kind === "constant"
      ? [128, 128, 128]
      : kind === "off-ramp"
      ? [0, 255, 0]
      : kind === "moderate-residual"
      ? index < 32 ? [120, 96, 216] : [216, 112, 120]
      : index < 32 ? [80, 96, 168] : [176, 112, 80];
    pixels[index * 3] = color[0]!;
    pixels[index * 3 + 1] = color[1]!;
    pixels[index * 3 + 2] = color[2]!;
  }
  return sharp(pixels, { raw: { width: 8, height: 8, channels: 3 } })
    .png()
    .toBuffer();
}

const IDENTITY_COLORS = [
  "#E85D5D",
  "#F28E2B",
  "#D9A514",
  "#4E79A7",
  "#9C6ADE",
] as const;

async function nativeEntryPng(options: {
  readonly width?: number;
  readonly height?: number;
  readonly targetCount?: number;
  readonly boxes?: readonly (readonly [number, number, number, number])[];
  readonly microTargetIndex?: number;
  readonly scatteredTargetIndex?: number;
  readonly ambiguousPatch?: boolean;
  readonly includeTraversable?: boolean;
  readonly functionalCoverageRatio?: number;
} = {}): Promise<Buffer> {
  const width = options.width ?? 160;
  const height = options.height ?? 90;
  const targetCount = options.targetCount ?? 3;
  const pixels = new Uint8Array(width * height * 3).fill(255);
  const setPixel = (x: number, y: number, color: string) => {
    const offset = (y * width + x) * 3;
    pixels[offset] = Number.parseInt(color.slice(1, 3), 16);
    pixels[offset + 1] = Number.parseInt(color.slice(3, 5), 16);
    pixels[offset + 2] = Number.parseInt(color.slice(5, 7), 16);
  };
  const fill = (
    left: number,
    top: number,
    right: number,
    bottom: number,
    color: string,
  ) => {
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) setPixel(x, y, color);
    }
  };
  const boxes = options.boxes ?? [
    [Math.floor(width / 2) - 4, 50, Math.floor(width / 2) + 3, 79],
    [20, 20, 39, 39],
    [110, 20, 129, 39],
    [20, 48, 39, 67],
    [110, 48, 129, 67],
  ] as const;
  // Old production required at least 2% image-wide Block palette coverage and
  // a real support color for a ground movement mode. This is independent of
  // whether any non-subject visual target is visible in the opening frame.
  const functionalPixelCount = Math.ceil(
    width * height * (options.functionalCoverageRatio ?? 0.04),
  );
  const functionalColor = options.includeTraversable === false
    ? "#5F6368"
    : "#B7E4C7";
  for (let index = 0; index < functionalPixelCount; index += 1) {
    setPixel(index % width, Math.floor(index / width), functionalColor);
  }
  for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
    const color = IDENTITY_COLORS[targetIndex]!;
    const box = boxes[targetIndex]!;
    if (options.microTargetIndex === targetIndex) {
      fill(box[0], box[1], box[0] + 3, box[1] + 3, color);
    } else if (options.scatteredTargetIndex === targetIndex) {
      for (let y = 10; y < Math.min(height - 1, 40); y += 3) {
        for (let x = 100; x < Math.min(width - 1, 130); x += 3) {
          setPixel(x, y, color);
        }
      }
    } else {
      fill(box[0], box[1], box[2], box[3], color);
    }
  }
  if (options.ambiguousPatch) {
    // Near the midpoint between Native target-2 orange and target-3 yellow.
    fill(55, 15, 74, 34, "#E69A20");
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function nativeWorldPlanPng(options: {
  readonly width?: number;
  readonly height?: number;
  readonly targetCount?: number;
  readonly omitTargetIndex?: number;
  readonly includeTraversable?: boolean;
  readonly functionalCoverageRatio?: number;
} = {}): Promise<Buffer> {
  const width = options.width ?? 160;
  const height = options.height ?? 90;
  const pixels = new Uint8Array(width * height * 3).fill(255);
  const setPixel = (x: number, y: number, color: string) => {
    const offset = (y * width + x) * 3;
    pixels[offset] = Number.parseInt(color.slice(1, 3), 16);
    pixels[offset + 1] = Number.parseInt(color.slice(3, 5), 16);
    pixels[offset + 2] = Number.parseInt(color.slice(5, 7), 16);
  };
  const totalPixels = width * height;
  const functionalPixelCount = Math.ceil(
    totalPixels * (options.functionalCoverageRatio ?? 0.04),
  );
  const functionalColor = options.includeTraversable === false
    ? "#5F6368"
    : "#B7E4C7";
  for (let index = 0; index < functionalPixelCount; index += 1) {
    setPixel(index % width, Math.floor(index / width), functionalColor);
  }
  const targetCount = options.targetCount ?? 3;
  const minimumTargetPixels = Math.max(
    32,
    Math.round(totalPixels * 0.00005),
  );
  for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
    if (targetIndex === options.omitTargetIndex) continue;
    const color = IDENTITY_COLORS[targetIndex]!;
    const startX = 10 + targetIndex * 12;
    const startY = Math.floor(height / 2);
    for (let pixel = 0; pixel < minimumTargetPixels; pixel += 1) {
      setPixel(startX + pixel % 8, startY + Math.floor(pixel / 8), color);
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

const VALID_BRIEF = `# WorldKit Scene Brief

## 场景
月下东方山谷，中央是悬崖上的大型月宫。

## 主体
黑衣旅人与滑板组成一个完整受控主体。

## 用户事实
用户要求一个可操作的白模世界，并以参考图作为空间和主体依据。

## 可见参考证据
画面可见前景桥梁、中景山谷、瀑布、远景月宫和群山。

## 推断的世界延伸
单张图未展示的桥后区域延伸为连贯山谷，但不声称来自参考图。

## 仅视觉层设想
月光、衣物纹理和屋顶材质只属于后续渲染层，不进入碰撞几何。

## 运动模式
- 陆地滑行：主体依靠滑板连续滑行，具有惯性和较大的转弯空间。

## 空间
前景桥梁，中景山谷与瀑布，远景月宫和群山。

## 通行
桥梁、台阶和宫门构成明确连续路线；路线外悬崖不可通行。

## 首帧
标准第三人称背后视角，主体位于下方中央并朝向远景月宫。

## 视觉目标
- 主体｜黑衣滑板旅人：完整的人与滑板复合主体
- 标志物｜月宫：包含主殿与屋顶轮廓的完整宫殿
- 重复标志物｜双塔：两座同款完整塔楼作为一个重复视觉目标
`;

interface ExpectedDiagnostic {
  readonly code: string;
  readonly message: string;
}

interface PlannerScenario {
  readonly name: string;
  readonly brief: string;
  readonly expectedStatus: "passed" | "failed";
  readonly expectedExitCode: 0 | 2;
  readonly expectedDiagnostics: readonly ExpectedDiagnostic[];
}

const SCENARIOS: readonly PlannerScenario[] = [
  {
    name: "ordered multi-mode equipment intent",
    brief: VALID_BRIEF.replace(/## 运动模式\n[\s\S]*?\n\n## 空间/,
      "## 运动模式\n- 空中飞行（滑翔翼）：飞行。\n- 陆地步行：步行。\n- 磁力吸附：沿墙面移动。\n\n## 空间"),
    expectedStatus: "passed", expectedExitCode: 0, expectedDiagnostics: [],
  },
  {
    name: "valid Scene Brief",
    brief: VALID_BRIEF,
    expectedStatus: "passed",
    expectedExitCode: 0,
    expectedDiagnostics: [],
  },
  {
    name: "duplicate visual-target name",
    brief: VALID_BRIEF.replace(
      "- 重复标志物｜双塔：两座同款完整塔楼作为一个重复视觉目标",
      "- 标志物｜月宫：另一条重复名称",
    ),
    expectedStatus: "failed",
    expectedExitCode: 2,
    expectedDiagnostics: [{
      code: "SCENE_BRIEF_VISUAL_TARGET_DUPLICATE",
      message: "SCENE_BRIEF_VISUAL_TARGET_DUPLICATE: '月宫'.",
    }],
  },
  {
    name: "second Subject visual target",
    brief: VALID_BRIEF.replace(
      "- 重复标志物｜双塔：两座同款完整塔楼作为一个重复视觉目标",
      "- 主体｜第二旅人：不允许出现的第二个完整主体",
    ),
    expectedStatus: "failed",
    expectedExitCode: 2,
    expectedDiagnostics: [{
      code: "SCENE_BRIEF_PRIMARY_SUBJECT",
      message: "SCENE_BRIEF_PRIMARY_SUBJECT: the first and only Subject visual target is required.",
    }],
  },
  {
    name: "49-character movement label",
    brief: VALID_BRIEF.replace(
      "陆地滑行",
      "1234567890123456789012345678901234567890123456789",
    ),
    expectedStatus: "failed",
    expectedExitCode: 2,
    expectedDiagnostics: [{
      code: "SCENE_BRIEF_MOVEMENT_LABEL_TOO_LONG",
      message: "SCENE_BRIEF_MOVEMENT_LABEL_TOO_LONG: movement label must be at most 48 characters.",
    }],
  },
];

function run(command: string, arguments_: readonly string[]) {
  if (process.platform === "win32" && command === "pnpm") {
    const commandPath = execFileSync("where", ["corepack"], { encoding: "utf8" })
      .split(/\r?\n/)
      .find((line) => line.endsWith(".cmd"));
    if (commandPath === undefined) throw new Error("Corepack is unavailable.");
    const launcher = readFileSync(commandPath, "utf8");
    const relativeCliPath = launcher.match(/"%~dp0([^\"]*corepack\.js)"/i)?.[1];
    if (relativeCliPath === undefined) throw new Error("Corepack launcher is invalid.");
    return spawnSync(process.execPath, [
      path.resolve(
        path.dirname(commandPath),
        relativeCliPath.replace(/^[\\/]+/, ""),
      ),
      "pnpm",
      ...arguments_,
    ], {
      cwd: path.resolve("."),
      encoding: "utf8",
    });
  }
  return spawnSync(command, arguments_, {
    cwd: path.resolve("."),
    encoding: "utf8",
  });
}

function hash(bytes: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function expectedReceipt(
  scenario: PlannerScenario,
  terrainIntentBytes: Buffer,
): string {
  return `${JSON.stringify({
    kind: "worldkit-planner-self-check",
    schemaVersion: 1,
    validatorVersion: PLANNER_VERSION,
    sceneId: "planner-parity-scene",
    sceneSourceKind: "canonical",
    status: scenario.expectedStatus,
    inputs: {
      sceneBriefHash: hash(scenario.brief),
      worldPlanHash: FIXED_PNG_HASH,
      entryWhiteboxTargetHash: FIXED_PNG_HASH,
      terrainHeightIntentPromptHash: hash(VALID_TERRAIN_PROMPT),
      terrainHeightIntentPngHash: hash(terrainIntentBytes),
    },
    imageMeasurements: {
      widthPixels: 8,
      heightPixels: 8,
      subjectMaskPixelCount: 64,
      subjectCenterXRatio: 0.5,
      subjectCenterErrorRatio: 0,
      maximumCenterErrorRatio: 0.015,
    },
    terrainIntentMeasurements: {
      widthPixels: 8,
      heightPixels: 8,
      profileId: "signed-diverging-blue-gray-orange@1",
      minimumHeightRatio: -0.5,
      medianHeightRatio: -0.5,
      maximumHeightRatio: 0.5,
      meanRampResidualRgbUnits: 0,
      p95RampResidualRgbUnits: 0,
    },
    diagnostics: scenario.expectedDiagnostics,
  })}\n`;
}

async function writePlannerInputs(root: string, brief: string) {
  const briefPath = path.join(root, "scene-brief.md");
  const worldPlanPath = path.join(root, "world-plan.png");
  const entryPath = path.join(root, "entry-whitebox-target.png");
  const terrainPromptPath = path.join(root, "terrain-height-intent-prompt.md");
  const terrainIntentPath = path.join(root, "terrain-height-intent.png");
  const terrainIntentBytes = await terrainIntentPng("valid");
  await Promise.all([
    writeFile(briefPath, brief),
    writeFile(worldPlanPath, FIXED_PNG),
    writeFile(entryPath, FIXED_PNG),
    writeFile(terrainPromptPath, VALID_TERRAIN_PROMPT),
    writeFile(terrainIntentPath, terrainIntentBytes),
  ]);
  return {
    briefPath,
    worldPlanPath,
    entryPath,
    terrainPromptPath,
    terrainIntentPath,
    terrainIntentBytes,
  };
}

function plannerArguments(
  inputs: Awaited<ReturnType<typeof writePlannerInputs>>,
  reportPath: string,
): readonly string[] {
  return [
    "--scene-source", "canonical",
    "--scene-id", "planner-parity-scene",
    "--brief", inputs.briefPath,
    "--world-plan", inputs.worldPlanPath,
    "--entry", inputs.entryPath,
    "--terrain-prompt", inputs.terrainPromptPath,
    "--terrain-intent", inputs.terrainIntentPath,
    "--report", reportPath,
  ];
}

function nativePlannerArguments(
  inputs: Awaited<ReturnType<typeof writePlannerInputs>>,
  reportPath: string,
): readonly string[] {
  return [
    "--scene-source", "babylon-native",
    "--scene-id", "planner-parity-scene",
    "--brief", inputs.briefPath,
    "--world-plan", inputs.worldPlanPath,
    "--entry", inputs.entryPath,
    "--report", reportPath,
  ];
}

describe("source-generated Planner self-check parity", { timeout: 30_000 }, () => {
  it.each([false, true])("preserves old support-color behavior with ground-after-flight=%s", async withGround => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-mixed-movement-"));
    try {
      const brief = VALID_BRIEF.replace(/## 运动模式\n[\s\S]*?\n\n## 空间/,
        `## 运动模式\n- 空中飞行：进入空中。${withGround ? "\n- 陆地步行：落地探索。" : ""}\n\n## 空间`);
      const inputs = await writePlannerInputs(root, brief);
      await writeFile(inputs.worldPlanPath, await nativeWorldPlanPng({ includeTraversable: false }));
      await writeFile(inputs.entryPath, await nativeEntryPng());
      const result = await runPlannerSelfCheck({ sceneSourceKind: "babylon-native", sceneId: "mixed-movement",
        briefPath: inputs.briefPath, worldPlanPath: inputs.worldPlanPath, entryPath: inputs.entryPath,
        reportPath: path.join(root, "report.json") });
      expect(result.status).toBe(withGround ? "failed" : "passed");
      expect(result.diagnostics.map(row => row.code)).toEqual(withGround ? ["WORLD_PLAN_TRAVERSABLE_COLOR_MISSING"] : []);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("validates the Native closed profile without Height Intent inputs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-native-planner-parity-"));
    try {
      const inputs = await writePlannerInputs(root, VALID_BRIEF);
      const entryBytes = await nativeEntryPng();
      const worldPlanBytes = await nativeWorldPlanPng();
      await Promise.all([
        writeFile(inputs.entryPath, entryBytes),
        writeFile(inputs.worldPlanPath, worldPlanBytes),
      ]);
      await rm(inputs.terrainPromptPath);
      await rm(inputs.terrainIntentPath);
      const sourceReportPath = path.join(root, "source-report.json");
      const bundledReportPath = path.join(root, "bundled-report.json");
      const source = run("pnpm", [
        "exec", "tsx", "scripts/agents/agent-planner-self-check.ts",
        ...nativePlannerArguments(inputs, sourceReportPath),
      ]);
      const bundled = run(process.execPath, [
        ".codex/skills/worldkit-spatial-planner/scripts/self-check.mjs",
        ...nativePlannerArguments(inputs, bundledReportPath),
      ]);

      expect(source.status, source.stderr || source.stdout).toBe(0);
      expect(bundled.status, bundled.stderr || bundled.stdout).toBe(0);
      expect(await readFile(sourceReportPath)).toEqual(
        await readFile(bundledReportPath),
      );
      expect(JSON.parse(await readFile(sourceReportPath, "utf8"))).toEqual({
        kind: "worldkit-planner-self-check",
        schemaVersion: 1,
        validatorVersion: PLANNER_VERSION,
        sceneId: "planner-parity-scene",
        sceneSourceKind: "babylon-native",
        status: "passed",
        inputs: {
          sceneBriefHash: hash(VALID_BRIEF),
          worldPlanHash: hash(worldPlanBytes),
          entryWhiteboxTargetHash: hash(entryBytes),
        },
        imageMeasurements: {
          widthPixels: 160,
          heightPixels: 90,
          subjectMaskPixelCount: 240,
          subjectCenterXRatio: 0.5,
          subjectCenterErrorRatio: 0,
          maximumCenterErrorRatio: 0.015,
        },
        nativeBlockPaletteMeasurements: {
          worldPlan: {
            widthPixels: 160,
            heightPixels: 90,
            aspectRatio: 16 / 9,
            matchedBlockPixelCount: 640,
            blockPaletteCoverageRatio: 640 / 14400,
            traversablePixelCount: 576,
            interactivePixelCount: 0,
            blockPixelCountsBySemantic: {
              walkable: 576,
              obstacle: 0,
              "interactive-solid": 0,
              "interactive-trigger": 0,
              water: 0,
              "cloud-walkable": 0,
              "cloud-passable": 0,
              "visual-only": 0,
              "landmark-red": 0,
              "visual-target-2": 32,
              "visual-target-3": 32,
              "visual-target-4": 0,
              "visual-target-5": 0,
              "landmark-pink": 0,
              "visual-target-1-subject": 32,
            },
            visualTargetPixelCounts: [32, 32, 32, 0, 0],
          },
          entryWhiteboxTarget: {
            widthPixels: 160,
            heightPixels: 90,
            aspectRatio: 16 / 9,
            matchedBlockPixelCount: 1376,
            blockPaletteCoverageRatio: 1376 / 14400,
            traversablePixelCount: 576,
            interactivePixelCount: 0,
            blockPixelCountsBySemantic: {
              walkable: 576,
              obstacle: 0,
              "interactive-solid": 0,
              "interactive-trigger": 0,
              water: 0,
              "cloud-walkable": 0,
              "cloud-passable": 0,
              "visual-only": 0,
              "landmark-red": 0,
              "visual-target-2": 400,
              "visual-target-3": 400,
              "visual-target-4": 0,
              "visual-target-5": 0,
              "landmark-pink": 0,
              "visual-target-1-subject": 240,
            },
            visualTargetPixelCounts: [240, 400, 400, 0, 0],
          },
        },
        nativeEntryIdentityMeasurements: {
          widthPixels: 160,
          heightPixels: 90,
          aspectRatio: 16 / 9,
          aspectErrorRatio: 0,
          requiredAspectRatio: 16 / 9,
          maximumAspectErrorRatio: 0.02,
          maximumIdentityRgbDistance: 40,
          minimumIdentitySeparationRgbUnits: 12,
          ambiguousIdentityPixelCount: 0,
          candidateIdentityPixelCount: 1040,
          ambiguousIdentityRatio: 0,
          maximumAmbiguousIdentityRatio: 0.05,
          targets: [
            {
              visualTargetId: "visual-target-1",
              identityColorHex: "#E85D5D",
              exclusivelyAdmittedPixelCount: 240,
              imageCoverageRatio: 240 / 14400,
              componentCount: 1,
              coherentComponentCount: 1,
              coherentPixelCount: 240,
              coherentPixelRatio: 1,
              largestComponentPixelCount: 240,
              largestComponentImageCoverageRatio: 240 / 14400,
              largestComponentBoundingBoxWidthPixels: 8,
              largestComponentBoundingBoxHeightPixels: 30,
              largestComponentBoundingBoxWidthRatio: 8 / 160,
              largestComponentBoundingBoxHeightRatio: 30 / 90,
              minimumPixelCount: 64,
              minimumCoherentComponentPixelCount: 16,
              minimumCoherentPixelRatio: 0.75,
              minimumLargestComponentPixelCount: 32,
              minimumLargestComponentImageCoverageRatio: 0.001,
              minimumLargestComponentBoundingBoxWidthRatio: 0.02,
              minimumLargestComponentBoundingBoxHeightRatio: 0.04,
            },
            ...[2, 3].map((targetNumber) => ({
              visualTargetId: `visual-target-${targetNumber}`,
              identityColorHex: IDENTITY_COLORS[targetNumber - 1],
              exclusivelyAdmittedPixelCount: 400,
              imageCoverageRatio: 400 / 14400,
              componentCount: 1,
              coherentComponentCount: 1,
              coherentPixelCount: 400,
              coherentPixelRatio: 1,
              largestComponentPixelCount: 400,
              largestComponentImageCoverageRatio: 400 / 14400,
              largestComponentBoundingBoxWidthPixels: 20,
              largestComponentBoundingBoxHeightPixels: 20,
              largestComponentBoundingBoxWidthRatio: 20 / 160,
              largestComponentBoundingBoxHeightRatio: 20 / 90,
              minimumPixelCount: 64,
              minimumCoherentComponentPixelCount: 16,
              minimumCoherentPixelRatio: 0.75,
              minimumLargestComponentPixelCount: 32,
              minimumLargestComponentImageCoverageRatio: 0.001,
              minimumLargestComponentBoundingBoxWidthRatio: 0.02,
              minimumLargestComponentBoundingBoxHeightRatio: 0.04,
            })),
          ],
        },
        diagnostics: [],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("accepts an old-success distant 19x18 non-subject and retains its advisory scale measurement", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-native-planner-scale-"));
    const boundaryBoxes = [
      [753, 600, 783, 642],
      [100, 100, 130, 142],
      [1_300, 100, 1_330, 142],
    ] as const;
    try {
      const inputs = await writePlannerInputs(root, VALID_BRIEF);
      await writeFile(inputs.worldPlanPath, await nativeWorldPlanPng({
        width: 1_536,
        height: 864,
      }));
      const reportPath = path.join(root, "report.json");
      await writeFile(inputs.entryPath, await nativeEntryPng({
        width: 1_536,
        height: 864,
        boxes: [
          boundaryBoxes[0],
          boundaryBoxes[1],
          [1_300, 100, 1_318, 117],
        ],
      }));
      const distantTarget = await runPlannerSelfCheck({
        sceneSourceKind: "babylon-native",
        sceneId: "planner-native-scale-contract",
        briefPath: inputs.briefPath,
        worldPlanPath: inputs.worldPlanPath,
        entryPath: inputs.entryPath,
        reportPath,
      });
      expect(distantTarget).toEqual({ status: "passed", diagnostics: [] });
      const distantReceipt = JSON.parse(await readFile(reportPath, "utf8"));
      expect(distantReceipt.nativeEntryIdentityMeasurements.targets[2])
        .toMatchObject({
          exclusivelyAdmittedPixelCount: 342,
          minimumPixelCount: 332,
          largestComponentPixelCount: 342,
          largestComponentBoundingBoxWidthPixels: 19,
          largestComponentBoundingBoxHeightPixels: 18,
          minimumLargestComponentPixelCount: 1_328,
        });

      await writeFile(inputs.entryPath, await nativeEntryPng({
        width: 1_536,
        height: 864,
        boxes: boundaryBoxes,
      }));
      const largerTarget = await runPlannerSelfCheck({
        sceneSourceKind: "babylon-native",
        sceneId: "planner-native-scale-contract",
        briefPath: inputs.briefPath,
        worldPlanPath: inputs.worldPlanPath,
        entryPath: inputs.entryPath,
        reportPath,
      });
      expect(largerTarget).toEqual({ status: "passed", diagnostics: [] });
      const receipt = JSON.parse(await readFile(reportPath, "utf8"));
      expect(receipt.nativeEntryIdentityMeasurements.targets[2]).toMatchObject({
        largestComponentPixelCount: 1_333,
        largestComponentBoundingBoxWidthPixels: 31,
        largestComponentBoundingBoxHeightPixels: 43,
        minimumLargestComponentPixelCount: 1_328,
        minimumLargestComponentImageCoverageRatio: 0.001,
        minimumLargestComponentBoundingBoxWidthRatio: 0.02,
        minimumLargestComponentBoundingBoxHeightRatio: 0.04,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: "an old-success microscopic distant non-subject",
      image: () => nativeEntryPng({ microTargetIndex: 2 }),
    },
    {
      name: "an old-success scattered repeated non-subject",
      image: () => nativeEntryPng({ scatteredTargetIndex: 2 }),
    },
    {
      name: "an old-success entry with non-subject targets fully occluded or off-camera",
      image: () => nativeEntryPng({ targetCount: 1 }),
    },
  ])("accepts $name", async ({ image }) => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-native-planner-image-"));
    try {
      const inputs = await writePlannerInputs(root, VALID_BRIEF);
      await Promise.all([
        writeFile(inputs.entryPath, await image()),
        writeFile(inputs.worldPlanPath, await nativeWorldPlanPng()),
      ]);
      const result = await runPlannerSelfCheck({
        sceneSourceKind: "babylon-native",
        sceneId: "planner-native-image-contract",
        briefPath: inputs.briefPath,
        worldPlanPath: inputs.worldPlanPath,
        entryPath: inputs.entryPath,
        reportPath: path.join(root, "report.json"),
      });
      expect(result).toEqual({ status: "passed", diagnostics: [] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: "world-plan aggregate palette coverage below 3%",
      worldPlan: () => nativeWorldPlanPng({ functionalCoverageRatio: 0.01 }),
      entry: () => nativeEntryPng(),
      code: "WORLD_PLAN_BLOCK_PALETTE_COVERAGE_LOW",
    },
    {
      name: "world-plan ground support color is absent",
      worldPlan: () => nativeWorldPlanPng({ includeTraversable: false }),
      entry: () => nativeEntryPng(),
      code: "WORLD_PLAN_TRAVERSABLE_COLOR_MISSING",
    },
    {
      name: "world-plan selected target is below the historical 0.005% presence floor",
      worldPlan: () => nativeWorldPlanPng({ omitTargetIndex: 2 }),
      entry: () => nativeEntryPng(),
      code: "WORLD_PLAN_VISUAL_TARGET_COLOR_MISSING",
    },
    {
      name: "entry aggregate palette coverage below 2%",
      worldPlan: () => nativeWorldPlanPng(),
      entry: () => nativeEntryPng({
        targetCount: 1,
        functionalCoverageRatio: 0.005,
      }),
      code: "ENTRY_WHITEBOX_TARGET_BLOCK_PALETTE_COVERAGE_LOW",
    },
    {
      name: "entry ground support color is absent",
      worldPlan: () => nativeWorldPlanPng(),
      entry: () => nativeEntryPng({ includeTraversable: false }),
      code: "ENTRY_WHITEBOX_TARGET_TRAVERSABLE_COLOR_MISSING",
    },
  ])("retains the historical hard gate when $name", async ({
    worldPlan,
    entry,
    code,
  }) => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-native-planner-old-gate-"));
    try {
      const inputs = await writePlannerInputs(root, VALID_BRIEF);
      await Promise.all([
        writeFile(inputs.worldPlanPath, await worldPlan()),
        writeFile(inputs.entryPath, await entry()),
      ]);
      const result = await runPlannerSelfCheck({
        sceneSourceKind: "babylon-native",
        sceneId: "planner-native-old-hard-gate",
        briefPath: inputs.briefPath,
        worldPlanPath: inputs.worldPlanPath,
        entryPath: inputs.entryPath,
        reportPath: path.join(root, "report.json"),
      });
      expect(result.status).toBe("failed");
      expect(result.diagnostics.map(({ code: actual }) => actual)).toContain(code);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("retains ambiguous identity pixels as advisory measurements without vetoing old success", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-native-planner-color-"));
    try {
      const brief = `${VALID_BRIEF}- 标志物｜月门：独立完整的粉色月门\n`;
      const inputs = await writePlannerInputs(root, brief);
      await Promise.all([
        writeFile(
          inputs.entryPath,
          await nativeEntryPng({ targetCount: 4, ambiguousPatch: true }),
        ),
        writeFile(inputs.worldPlanPath, await nativeWorldPlanPng({
          targetCount: 4,
        })),
      ]);
      const result = await runPlannerSelfCheck({
        sceneSourceKind: "babylon-native",
        sceneId: "planner-native-color-contract",
        briefPath: inputs.briefPath,
        worldPlanPath: inputs.worldPlanPath,
        entryPath: inputs.entryPath,
        reportPath: path.join(root, "report.json"),
      });
      expect(result).toEqual({ status: "passed", diagnostics: [] });
      const receipt = JSON.parse(await readFile(
        path.join(root, "report.json"),
        "utf8",
      ));
      expect(receipt.nativeEntryIdentityMeasurements.ambiguousIdentityPixelCount)
        .toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("accepts the historical Native target-3 color and rejects the Canonical target-3 color in the Native lane", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-native-planner-profile-color-"));
    try {
      const inputs = await writePlannerInputs(root, VALID_BRIEF);
      await Promise.all([
        writeFile(inputs.entryPath, await nativeEntryPng()),
        writeFile(inputs.worldPlanPath, await nativeWorldPlanPng()),
      ]);
      await expect(runPlannerSelfCheck({
        sceneSourceKind: "babylon-native",
        sceneId: "planner-native-profile-color",
        briefPath: inputs.briefPath,
        worldPlanPath: inputs.worldPlanPath,
        entryPath: inputs.entryPath,
        reportPath: path.join(root, "native-report.json"),
      })).resolves.toEqual({ status: "passed", diagnostics: [] });

      const canonicalTargetThree = await nativeWorldPlanPng();
      const { data, info } = await sharp(canonicalTargetThree)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const old = [0xD9, 0xA5, 0x14] as const;
      const current = [0x8E, 0x6C, 0xCF] as const;
      for (let offset = 0; offset < data.length; offset += info.channels) {
        if (data[offset] === old[0] && data[offset + 1] === old[1] &&
          data[offset + 2] === old[2]) {
          data[offset] = current[0];
          data[offset + 1] = current[1];
          data[offset + 2] = current[2];
        }
      }
      await writeFile(inputs.worldPlanPath, await sharp(data, {
        raw: info,
      }).png().toBuffer());
      const crossed = await runPlannerSelfCheck({
        sceneSourceKind: "babylon-native",
        sceneId: "planner-native-profile-color",
        briefPath: inputs.briefPath,
        worldPlanPath: inputs.worldPlanPath,
        entryPath: inputs.entryPath,
        reportPath: path.join(root, "crossed-report.json"),
      });
      expect(crossed.status).toBe("failed");
      expect(crossed.diagnostics).toContainEqual(expect.objectContaining({
        code: "WORLD_PLAN_VISUAL_TARGET_COLOR_MISSING",
        message: expect.stringContaining("visual-target-3"),
      }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: "a microscopic primary Subject",
      image: () => nativeEntryPng({ microTargetIndex: 0 }),
      code: "PLANNER_IMAGE_INVALID",
    },
    {
      name: "a non-16:9 formal opening target",
      image: () => nativeEntryPng({ width: 100, height: 100 }),
      code: "ENTRY_WHITEBOX_TARGET_ASPECT_RATIO_INVALID",
    },
  ])("still rejects $name", async ({ image, code }) => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-native-planner-hard-gate-"));
    try {
      const inputs = await writePlannerInputs(root, VALID_BRIEF);
      await Promise.all([
        writeFile(inputs.entryPath, await image()),
        writeFile(inputs.worldPlanPath, await nativeWorldPlanPng()),
      ]);
      const result = await runPlannerSelfCheck({
        sceneSourceKind: "babylon-native",
        sceneId: "planner-native-hard-gate",
        briefPath: inputs.briefPath,
        worldPlanPath: inputs.worldPlanPath,
        entryPath: inputs.entryPath,
        reportPath: path.join(root, "report.json"),
      });
      expect(result.status).toBe("failed");
      expect(result.diagnostics.map(({ code: actual }) => actual)).toContain(code);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  for (const scenario of SCENARIOS) {
    it(`emits exact source and bundled receipts for ${scenario.name}`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "worldkit-planner-parity-"));
      try {
        const inputs = await writePlannerInputs(root, scenario.brief);
        const sourceReportPath = path.join(root, "source-report.json");
        const bundledReportPath = path.join(root, "bundled-report.json");
        const source = run("pnpm", [
          "exec",
          "tsx",
          "scripts/agents/agent-planner-self-check.ts",
          ...plannerArguments(inputs, sourceReportPath),
        ]);
        const bundled = run(process.execPath, [
          ".codex/skills/worldkit-spatial-planner/scripts/self-check.mjs",
          ...plannerArguments(inputs, bundledReportPath),
        ]);

        expect(source.status, source.stderr || source.stdout).toBe(
          scenario.expectedExitCode,
        );
        expect(bundled.status, bundled.stderr || bundled.stdout).toBe(
          scenario.expectedExitCode,
        );
        const exactResult = `${JSON.stringify({
          status: scenario.expectedStatus,
          diagnostics: scenario.expectedDiagnostics,
        })}\n`;
        expect(source.stdout).toBe(exactResult);
        expect(bundled.stdout).toBe(exactResult);
        const exactReceipt = expectedReceipt(scenario, inputs.terrainIntentBytes);
        expect(await readFile(sourceReportPath, "utf8")).toBe(exactReceipt);
        expect(await readFile(bundledReportPath, "utf8")).toBe(exactReceipt);

        if (scenario.expectedStatus === "passed") {
          const parsed = parseSceneBriefV1(scenario.brief);
          expect(parsed.ok).toBe(true);
          if (parsed.ok) {
            expect(hash(scenario.brief)).not.toBe(parsed.sceneBriefHash);
          }
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }

  it("accepts moderate Image2 ramp residual while retaining signed variation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-planner-terrain-"));
    try {
      const inputs = await writePlannerInputs(root, VALID_BRIEF);
      await writeFile(
        inputs.terrainIntentPath,
        await terrainIntentPng("moderate-residual"),
      );
      const sourceReportPath = path.join(root, "source-report.json");
      const bundledReportPath = path.join(root, "bundled-report.json");
      const source = run("pnpm", [
        "exec", "tsx", "scripts/agents/agent-planner-self-check.ts",
        ...plannerArguments(inputs, sourceReportPath),
      ]);
      const bundled = run(process.execPath, [
        ".codex/skills/worldkit-spatial-planner/scripts/self-check.mjs",
        ...plannerArguments(inputs, bundledReportPath),
      ]);

      expect(source.status, source.stderr || source.stdout).toBe(0);
      expect(bundled.status, bundled.stderr || bundled.stdout).toBe(0);
      expect(await readFile(sourceReportPath)).toEqual(
        await readFile(bundledReportPath),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  for (const invalid of [
    { kind: "constant" as const, code: "TERRAIN_INTENT_NEAR_CONSTANT" },
    { kind: "off-ramp" as const, code: "TERRAIN_INTENT_COLOR_RESIDUAL_EXCEEDED" },
  ]) {
    it(`rejects ${invalid.kind} Height Intent identically in source and bundle`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "worldkit-planner-terrain-"));
      try {
        const inputs = await writePlannerInputs(root, VALID_BRIEF);
        await writeFile(inputs.terrainIntentPath, await terrainIntentPng(invalid.kind));
        const sourceReportPath = path.join(root, "source-report.json");
        const bundledReportPath = path.join(root, "bundled-report.json");
        const source = run("pnpm", [
          "exec", "tsx", "scripts/agents/agent-planner-self-check.ts",
          ...plannerArguments(inputs, sourceReportPath),
        ]);
        const bundled = run(process.execPath, [
          ".codex/skills/worldkit-spatial-planner/scripts/self-check.mjs",
          ...plannerArguments(inputs, bundledReportPath),
        ]);

        expect(source.status).toBe(2);
        expect(bundled.status).toBe(2);
        for (const reportPath of [sourceReportPath, bundledReportPath]) {
          const report = JSON.parse(await readFile(reportPath, "utf8"));
          expect(report.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: invalid.code }),
          ]));
        }
        expect(await readFile(sourceReportPath)).toEqual(
          await readFile(bundledReportPath),
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }

  for (const mutatedBundle of ["planner", "builder"] as const) {
    it(`fails read-only check for a mutated ${mutatedBundle} tracked copy`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "worldkit-self-check-copy-"));
      const trackedSkillsRoot = path.join(root, "skills");
      const relativePaths = {
        planner: "worldkit-spatial-planner/scripts/self-check.mjs",
        builder: "worldkit-canonical-builder/scripts/self-check.mjs",
      } as const;
      try {
        for (const relativePath of Object.values(relativePaths)) {
          const destination = path.join(trackedSkillsRoot, relativePath);
          await mkdir(path.dirname(destination), { recursive: true });
          await copyFile(path.join(".codex/skills", relativePath), destination);
        }
        const mutatedPath = path.join(
          trackedSkillsRoot,
          relativePaths[mutatedBundle],
        );
        const mutatedBytes = Buffer.concat([
          await readFile(mutatedPath),
          Buffer.from("\n// intentional parity mutation\n"),
        ]);
        await writeFile(mutatedPath, mutatedBytes);

        const check = run("pnpm", [
          "exec",
          "tsx",
          "scripts/agents/check-agent-self-check.ts",
          "--tracked-skills-root",
          trackedSkillsRoot,
        ]);

        expect(check.status).not.toBe(0);
        expect(check.stderr || check.stdout).toContain(mutatedPath);
        expect(await readFile(mutatedPath)).toEqual(mutatedBytes);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }, 30_000);
  }
});
