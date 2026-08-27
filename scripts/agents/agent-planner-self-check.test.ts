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

const PLANNER_VERSION = "worldkit-planner-self-check-v3";
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
陆地滑行：主体依靠滑板连续滑行，具有惯性和较大的转弯空间。

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

function expectedReceipt(
  scenario: PlannerScenario,
  terrainIntentBytes: Buffer,
): string {
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
    "--scene-id", "planner-parity-scene",
    "--brief", inputs.briefPath,
    "--world-plan", inputs.worldPlanPath,
    "--entry", inputs.entryPath,
    "--terrain-prompt", inputs.terrainPromptPath,
    "--terrain-intent", inputs.terrainIntentPath,
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
