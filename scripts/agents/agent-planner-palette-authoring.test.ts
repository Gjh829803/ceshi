import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { authorPlannerPaletteSelectionV1, type PlannerPaletteSelectionV1 } from "./agent-planner-palette-authoring.js";
import { decodePlannerPngV1, encodePlannerPngV1 } from "./planner-png.js";
import { runPlannerSelfCheck } from "./agent-planner-self-check.js";
import { BABYLON_NATIVE_VISUAL_IDENTITY_COLORS } from "../scenes/visual-identity-palette.js";

const hash = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const selection = { visualTargetIndex: 0, minimumXPixels: 76, minimumYPixels: 50, widthPixels: 8, heightPixels: 30 };
function fixture(color = "#E15759", widthPixels = 8, heightPixels = 30) {
  const width = 160, height = 90, pixels = Buffer.alloc(width * height * 4, 255);
  const paint = (x: number, y: number, c: string) => {
    for (let i = 0; i < 3; i++) pixels[(y * width + x) * 4 + i] = parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  };
  for (let y = 0; y < 10; y++) for (let x = 0; x < width; x++) paint(x, y, "#B7E4C7");
  for (let y = 50; y < 50 + heightPixels; y++) for (let x = 76; x < 76 + widthPixels; x++) paint(x, y, color);
  // Same-hue unrelated object outside the explicit selection must stay untouched.
  paint(120, 60, "#E15759");
  return encodePlannerPngV1({ width, height, channels: 4, pixels });
}
const author = (sourcePng: Buffer, s: PlannerPaletteSelectionV1 = selection) => authorPlannerPaletteSelectionV1({ sourcePng, sourcePngHash: hash(sourcePng), selection: s });

describe("Planner explicit palette authoring (CF-27)", () => {
  it.each(BABYLON_NATIVE_VISUAL_IDENTITY_COLORS)("deterministically restores shaded %s without adding or moving pixels", (color) => {
    const index = BABYLON_NATIVE_VISUAL_IDENTITY_COLORS.indexOf(color);
    const shade = "#" + [1, 3, 5].map((start) => Math.round(parseInt(color.slice(start, start + 2), 16) * 0.7).toString(16).padStart(2, "0")).join("");
    const before = fixture(shade), result = author(before, { ...selection, visualTargetIndex: index });
    expect(result.record.changedPixelCount).toBe(240);
    const input = decodePlannerPngV1(before), output = decodePlannerPngV1(result.png);
    for (let y = 0; y < output.height; y++) for (let x = 0; x < output.width; x++) {
      const offset = (y * output.width + x) * 4;
      if (x < 76 || x >= 84 || y < 50 || y >= 80) expect(output.pixels.subarray(offset, offset + 4)).toEqual(input.pixels.subarray(offset, offset + 4));
      expect(output.pixels[offset + 3]).toBe(input.pixels[offset + 3]);
    }
    expect(author(before, { ...selection, visualTargetIndex: index }).png).toEqual(result.png);
    expect(author(result.png, { ...selection, visualTargetIndex: index }).png).toEqual(result.png);
  });

  it.each(["#FFFFFF", "#B7E4C7", "#4E79A7", "#101010"])("does not invent a red target from %s", (color) => {
    expect(() => author(fixture(color))).toThrow("EXISTING_TARGET_MISSING");
  });

  it("never recolors translucent pixels", () => {
    const decoded = decodePlannerPngV1(fixture());
    for (let offset = 3; offset < decoded.pixels.length; offset += 4) decoded.pixels[offset] = 128;
    expect(() => author(encodePlannerPngV1(decoded))).toThrow("EXISTING_TARGET_MISSING");
  });

  it("rejects stale source hashes and malformed or unbounded selections", () => {
    expect(() => authorPlannerPaletteSelectionV1({ sourcePng: fixture(), sourcePngHash: "sha256:stale", selection })).toThrow("SOURCE_CHANGED");
    for (const invalid of [{}, { ...selection, widthPixels: 0 }, { ...selection, heightPixels: NaN }, { ...selection, visualTargetIndex: 5 }, { ...selection, minimumXPixels: -1 }, { ...selection, widthPixels: 200 }, { ...selection, extra: 1 }]) {
      expect(() => author(fixture(), invalid as PlannerPaletteSelectionV1)).toThrow("SELECTION_INVALID");
    }
  });

  it("passes the unchanged real checker only for an already-present sufficiently large target", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "planner-palette-"));
    try {
      const template = await readFile(".codex/skills/worldkit-spatial-planner/references/scene-brief-template.md", "utf8");
      const brief = template.match(/```md\n([\s\S]*?)\n```/)![1]!.replace(/^- 标志物.*\n?/m, "");
      const options = { sceneSourceKind: "babylon-native" as const, sceneId: "palette-test", briefPath: path.join(root, "brief.md"), worldPlanPath: path.join(root, "world-plan.png"), entryPath: path.join(root, "entry-whitebox-target.png"), reportPath: path.join(root, "report.json") };
      await writeFile(options.briefPath, brief);
      await writeFile(options.entryPath, fixture("#E85D5D"));
      await writeFile(options.worldPlanPath, fixture());
      const red = await runPlannerSelfCheck(options);
      expect(red.diagnostics.map((d) => d.code)).toContain("WORLD_PLAN_VISUAL_TARGET_COLOR_MISSING");
      await writeFile(options.worldPlanPath, author(fixture()).png);
      expect((await runPlannerSelfCheck(options)).status).toBe("passed");
      await writeFile(options.worldPlanPath, author(fixture("#E15759", 2, 2)).png);
      expect((await runPlannerSelfCheck(options)).diagnostics.map((d) => d.code)).toContain("WORLD_PLAN_VISUAL_TARGET_COLOR_MISSING");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("runs the bundled CLI in an isolated workspace and refuses stale input on re-entry", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "planner-palette-cli-"));
    try {
      const template = await readFile(".codex/skills/worldkit-spatial-planner/references/scene-brief-template.md", "utf8");
      await writeFile(path.join(root, "scene-brief.md"), template.match(/```md\n([\s\S]*?)\n```/)![1]!);
      const png = fixture();
      await writeFile(path.join(root, "world-plan.png"), png);
      const script = path.resolve(".codex/skills/worldkit-spatial-planner/scripts/author-palette.mjs");
      expect(await readFile(script, "utf8")).not.toContain("activeMotionKernelRef");
      const args = [script, "--image", "world-plan.png", "--image-hash", hash(png), "--brief", "scene-brief.md", "--target", "visual-target-1", "--region-pixels", "76,50,8,30"];
      const first = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
      expect(first.status, first.stderr).toBe(0);
      expect(JSON.parse(first.stdout).changedPixelCount).toBe(240);
      const authored = await readFile(path.join(root, "world-plan.png"));
      expect(authored).toEqual(author(png).png);
      const stale = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
      expect(stale.status).toBe(2);
      expect(stale.stderr).toContain("SOURCE_CHANGED");
      expect(await readFile(path.join(root, "world-plan.png"))).toEqual(authored);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
