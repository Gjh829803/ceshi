import { describe, expect, it } from "vitest";

import { parseSceneBriefV1 } from "./scene-brief-v1";

const validBrief = `# WorldKit Scene Brief

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

describe("Scene Brief V1", () => {
  it("preserves ordered mixed movement and annotated standard labels from the old branch", () => {
    const first = "- 空中飞行（滑翔翼）：离开高台后滑翔。";
    const second = "- 陆地步行：落地后步行探索。";
    const source = validBrief.replace("- 陆地滑行：主体依靠滑板连续滑行，具有惯性和较大的转弯空间。", `${first}\n${second}`);
    const result = parseSceneBriefV1(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toHaveProperty("movement");
    expect(result.value.movementModes).toEqual([
      { mode: "flight", label: "空中飞行（滑翔翼）", description: "离开高台后滑翔。" },
      { mode: "ground-walk", label: "陆地步行", description: "落地后步行探索。" },
    ]);
    const reversed = parseSceneBriefV1(source.replace(`${first}\n${second}`, `${second}\n${first}`));
    expect(reversed.ok && reversed.sceneBriefHash).not.toBe(result.sceneBriefHash);
  });
  it("parses simple prose into trusted movement and visual-target metadata", () => {
    const result = parseSceneBriefV1(validBrief);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.movementModes[0]?.mode).toBe("ground-slide");
    expect(result.value.movementModes[0]?.label).toBe("陆地滑行");
    expect(result.value.visibleReferenceEvidence).toContain("瀑布");
    expect(result.value.visualTargets).toEqual([
      expect.objectContaining({ id: "visual-target-1", kind: "subject", role: "primary-subject" }),
      expect.objectContaining({ id: "visual-target-2", kind: "landmark", role: "primary-landmark" }),
      expect.objectContaining({ id: "visual-target-3", kind: "repeated-landmark", role: "secondary-landmark" }),
    ]);
    expect(result.sceneBriefHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("retains the old 1-8 row limit and rejects duplicate labels or removed single-line syntax", () => {
    const replaceModes = (rows: string) => validBrief.replace(/## 运动模式\n[\s\S]*?\n\n## 空间/, `## 运动模式\n${rows}\n\n## 空间`);
    const eight = Array.from({ length: 8 }, (_, index) => `- 自定义${index}：保留请求行为。`);
    const maximum = parseSceneBriefV1(replaceModes(eight.join("\n")));
    expect(maximum.ok && maximum.value.movementModes).toHaveLength(8);
    expect(parseSceneBriefV1(replaceModes([...eight, "- 第九项：越界。"].join("\n"))))
      .toMatchObject({ ok: false, diagnostics: [expect.stringContaining("SCENE_BRIEF_MOVEMENT_COUNT")] });
    expect(parseSceneBriefV1(replaceModes("- 陆地步行：进入。\n- 陆地步行：离开。")))
      .toMatchObject({ ok: false, diagnostics: [expect.stringContaining("SCENE_BRIEF_MOVEMENT_DUPLICATE")] });
    expect(parseSceneBriefV1(replaceModes("陆地步行：已删除的单行格式。")))
      .toMatchObject({ ok: false, diagnostics: [expect.stringContaining("SCENE_BRIEF_MOVEMENT_INVALID")] });
  });

  it("classifies both old equipment annotation forms without coercing custom labels", () => {
    const result = parseSceneBriefV1(validBrief.replace(/## 运动模式\n[\s\S]*?\n\n## 空间/,
      "## 运动模式\n- 陆地滑行（滑板）：在地面滑行。\n- 空中飞行(滑翔翼)：在空中移动。\n- 陆地步行磁力：独立的自定义行为。\n\n## 空间"));
    expect(result.ok && result.value.movementModes.map(row => row.mode)).toEqual(["ground-slide", "flight", "custom"]);
  });

  it("accepts a subject-only brief instead of padding visual targets", () => {
    const result = parseSceneBriefV1(validBrief.replace(
      /- 标志物[\s\S]*$/,
      "",
    ));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.visualTargets).toHaveLength(1);
  });

  it("preserves a custom movement mode and rejects more than five targets", () => {
    const custom = parseSceneBriefV1(validBrief.replace("陆地滑行", "磁力墙面行走"));
    expect(custom).toMatchObject({
      ok: true,
      value: { movementModes: [{ mode: "custom", label: "磁力墙面行走" }] },
    });
    const six = `${validBrief}- 标志物｜山门：完整山门\n- 标志物｜神树：完整神树\n- 标志物｜祭坛：完整祭坛\n`;
    expect(parseSceneBriefV1(six)).toMatchObject({
      ok: false,
      diagnostics: [expect.stringContaining("SCENE_BRIEF_VISUAL_TARGET_COUNT")],
    });
  });

  it("requires exactly one subject first and collapses repeated identities explicitly", () => {
    expect(parseSceneBriefV1(validBrief.replace(
      "- 主体｜黑衣滑板旅人：完整的人与滑板复合主体",
      "- 标志物｜月宫入口：完整入口",
    ))).toMatchObject({
      ok: false,
      diagnostics: [expect.stringContaining("SCENE_BRIEF_PRIMARY_SUBJECT")],
    });
    expect(parseSceneBriefV1(validBrief.replace(
      "- 重复标志物｜双塔：两座同款完整塔楼作为一个重复视觉目标",
      "- 标志物｜月宫：另一条重复名称",
    ))).toMatchObject({
      ok: false,
      diagnostics: [expect.stringContaining("SCENE_BRIEF_VISUAL_TARGET_DUPLICATE")],
    });
  });
});
