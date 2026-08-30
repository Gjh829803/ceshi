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
import { deflateSync } from "node:zlib";
import path from "node:path";

import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import { describe, expect, it } from "vitest";

import { runPlannerSelfCheck } from "./agent-planner-self-check.js";

const PLANNER_VERSION = "worldkit-planner-self-check-v4";

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) === 0 ? 0 : 0xedb88320);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function plannerPng(
  width = 160,
  height = 90,
  palette = true,
  includeGroundSupport = true,
): Buffer {
  const pixels = Buffer.alloc(width * height * 3, 255);
  const fill = (
    left: number,
    top: number,
    right: number,
    bottom: number,
    color: string,
  ) => {
    const rgb = [0, 2, 4].map((index) => Number.parseInt(color.slice(index + 1, index + 3), 16));
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const offset = (y * width + x) * 3;
        pixels[offset] = rgb[0]!;
        pixels[offset + 1] = rgb[1]!;
        pixels[offset + 2] = rgb[2]!;
      }
    }
  };
  if (palette) {
    if (includeGroundSupport) {
      fill(0, Math.round(height * 2 / 3), width - 1, height - 1, "#B7E4C7");
    }
    fill(0, 40, 19, 59, "#5F6368");
    fill(40, 40, 49, 59, "#00B8A9");
    fill(20, 40, 29, 59, "#F28E2B");
    fill(120, 40, 129, 59, "#D9A514");
  }
  const subjectLeft = Math.floor(width / 2) - 5;
  fill(subjectLeft, 30, subjectLeft + 9, Math.min(height - 1, 69), "#E85D5D");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const scanlines = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const outputOffset = y * (width * 3 + 1);
    scanlines[outputOffset] = 0;
    pixels.copy(scanlines, outputOffset + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const FIXED_PNG = plannerPng();
const FIXED_PNG_HASH = hash(FIXED_PNG);

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

function expectedReceipt(scenario: PlannerScenario): string {
  return `${JSON.stringify({
    kind: "worldkit-planner-self-check",
    schemaVersion: 1,
    validatorVersion: PLANNER_VERSION,
    sceneId: "planner-parity-scene",
    status: scenario.expectedStatus,
    inputs: {
      sceneBriefHash: hash(scenario.brief),
      worldPlanHash: FIXED_PNG_HASH,
      entryWhiteboxTargetHash: FIXED_PNG_HASH,
    },
    imageMeasurements: {
      worldPlan: {
        widthPixels: 160,
        heightPixels: 90,
        aspectRatio: 16 / 9,
        matchedBlockPixelCount: 5700,
        blockPaletteCoverageRatio: 5700 / 14400,
        traversablePixelCount: 4700,
        interactivePixelCount: 200,
        blockPixelCountsBySemantic: {
          walkable: 4700,
          obstacle: 400,
          "interactive-solid": 200,
          "interactive-trigger": 0,
          water: 0,
          "cloud-walkable": 0,
          "cloud-passable": 0,
          "visual-only": 0,
          "landmark-red": 0,
          "visual-target-2": 200,
          "visual-target-3": 200,
          "visual-target-4": 0,
          "visual-target-5": 0,
          "landmark-pink": 0,
          "visual-target-1-subject": 400,
        },
        visualTargetPixelCounts: [400, 200, 200, 0, 0],
      },
      entryWhiteboxTarget: {
        widthPixels: 160,
        heightPixels: 90,
        aspectRatio: 16 / 9,
        matchedBlockPixelCount: 5700,
        blockPaletteCoverageRatio: 5700 / 14400,
        traversablePixelCount: 4700,
        interactivePixelCount: 200,
        blockPixelCountsBySemantic: {
          walkable: 4700,
          obstacle: 400,
          "interactive-solid": 200,
          "interactive-trigger": 0,
          water: 0,
          "cloud-walkable": 0,
          "cloud-passable": 0,
          "visual-only": 0,
          "landmark-red": 0,
          "visual-target-2": 200,
          "visual-target-3": 200,
          "visual-target-4": 0,
          "visual-target-5": 0,
          "landmark-pink": 0,
          "visual-target-1-subject": 400,
        },
        visualTargetPixelCounts: [400, 200, 200, 0, 0],
        composition: {
          widthPixels: 160,
          heightPixels: 90,
          subjectMaskPixelCount: 400,
          subjectCenterXRatio: 0.5,
          subjectCenterErrorRatio: 0,
          maximumCenterErrorRatio: 0.015,
        },
      },
    },
    diagnostics: scenario.expectedDiagnostics,
  })}\n`;
}

async function writePlannerInputs(root: string, brief: string) {
  const briefPath = path.join(root, "scene-brief.md");
  const worldPlanPath = path.join(root, "world-plan.png");
  const entryPath = path.join(root, "entry-whitebox-target.png");
  await Promise.all([
    writeFile(briefPath, brief),
    writeFile(worldPlanPath, FIXED_PNG),
    writeFile(entryPath, FIXED_PNG),
  ]);
  return { briefPath, worldPlanPath, entryPath };
}

function plannerArguments(
  inputs: Awaited<ReturnType<typeof writePlannerInputs>>,
  reportPath: string,
): readonly string[] {
  return [
    "--scene-id", "planner-parity-scene",
    "--brief", inputs.briefPath,
    "--world-plan", inputs.worldPlanPath,
    "--entry", inputs.entryPath,
    "--report", reportPath,
  ];
}

describe("source-generated Planner self-check parity", () => {
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
        const exactReceipt = expectedReceipt(scenario);
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

  for (const mutatedBundle of ["planner"] as const) {
    it(`fails read-only check for a mutated ${mutatedBundle} tracked copy`, async () => {
      const root = await mkdtemp(path.join(tmpdir(), "worldkit-self-check-copy-"));
      const trackedSkillsRoot = path.join(root, "skills");
      const relativePaths = {
        planner: "worldkit-spatial-planner/scripts/self-check.mjs",
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

  it("rejects a palette-free world plan and a non-16:9 entry target", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-planner-image-contract-"));
    try {
      const briefPath = path.join(root, "scene-brief.md");
      const worldPlanPath = path.join(root, "world-plan.png");
      const entryPath = path.join(root, "entry.png");
      await Promise.all([
        writeFile(briefPath, VALID_BRIEF),
        writeFile(worldPlanPath, plannerPng(160, 90, false)),
        writeFile(entryPath, plannerPng(100, 100, true)),
      ]);
      const result = await runPlannerSelfCheck({
        sceneId: "planner-image-contract",
        briefPath,
        worldPlanPath,
        entryPath,
        reportPath: path.join(root, "report.json"),
      });
      expect(result.status).toBe("failed");
      expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
        "WORLD_PLAN_BLOCK_PALETTE_COVERAGE_LOW",
        "WORLD_PLAN_TRAVERSABLE_COLOR_MISSING",
        "WORLD_PLAN_VISUAL_TARGET_COLOR_MISSING",
        "ENTRY_WHITEBOX_TARGET_ASPECT_RATIO_INVALID",
      ]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not require a ground-traversable region for a flight-only Brief", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worldkit-planner-flight-colors-"));
    const brief = VALID_BRIEF.replace(
      "- 陆地滑行：主体依靠滑板连续滑行，具有惯性和较大的转弯空间。",
      "- 空中飞行：主体在空中自由升降和转向。",
    );
    const image = plannerPng(160, 90, true, false);
    const briefPath = path.join(root, "scene-brief.md");
    const worldPlanPath = path.join(root, "world-plan.png");
    const entryPath = path.join(root, "entry.png");
    await Promise.all([
      writeFile(briefPath, brief),
      writeFile(worldPlanPath, image),
      writeFile(entryPath, image),
    ]);
    const result = await runPlannerSelfCheck({
      sceneId: "planner-flight-colors",
      briefPath,
      worldPlanPath,
      entryPath,
      reportPath: path.join(root, "report.json"),
    });
    expect(result.status).toBe("passed");
    expect(result.diagnostics.map(({ code }) => code)).not.toContain(
      "WORLD_PLAN_TRAVERSABLE_COLOR_MISSING",
    );
  });
});
