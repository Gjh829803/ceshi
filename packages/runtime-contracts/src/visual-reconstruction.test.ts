import { expect, it } from "vitest";

import {
  validateVideoPromptFieldsV1,
  validateVisualAlignmentReportV1,
  type VideoPromptFieldsV1,
  type VisualAlignmentReportV1,
} from "./visual-reconstruction";

it("accepts bounded prompt fields without letting the agent rewrite the authority template", () => {
  const value: VideoPromptFieldsV1 = {
    kind: "worldkit-video-prompt-fields",
    schemaVersion: 1,
    sceneId: "paper-moon-palace",
    finalScene: {
      location: "月下山谷宫殿",
      timeOfDay: "夜晚",
      weather: "晴朗薄雾",
      groundAndWallMaterials: "白玉石桥与雕花宫墙",
      keyLightDirection: "月光从画面后上方照入",
      colorTemperature: "冷白月光配暖色灯笼",
      visualStyle: "写实东方奇幻电影",
    },
    action: "主角沿白膜录像规定的路线前进。",
    cinematography: { lens: "35mm", movement: "跟随镜头", notes: "严格复现参考录像。" },
    additionalRestrictions: ["宫殿轮廓不得变化"],
  };
  expect(validateVideoPromptFieldsV1(value)).toEqual([]);
});

it("requires every structural alignment gate before prompt synthesis", () => {
  const value: VisualAlignmentReportV1 = {
    kind: "worldkit-visual-alignment-report",
    schemaVersion: 1,
    sceneId: "paper-moon-palace",
    status: "passed",
    gates: {
      terrainAndArchitectureSilhouette: true,
      cameraProjectionAndHorizon: true,
      subjectAndObjectPlacement: true,
      scaleAndVisibleCounts: true,
      depthOrderAndOcclusion: true,
      routeAndSupportGeometry: true,
      noWhiteboxOrViewportResidue: true,
    },
    issues: [],
  };
  expect(validateVisualAlignmentReportV1(value)).toEqual([]);
  value.gates.cameraProjectionAndHorizon = false;
  value.status = "failed";
  value.issues = ["Horizon moved upward."];
  expect(validateVisualAlignmentReportV1(value)).toContain(
    "Styled opening frame does not strictly preserve the whitebox projection.",
  );
});
