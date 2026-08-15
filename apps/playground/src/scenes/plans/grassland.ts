import { defineOutdoorWorldSpec } from "@whitebox-world/world";

export const grasslandWorldSpec = defineOutdoorWorldSpec({
  kind: "outdoor-world-spec",
  version: 1,
  id: "grassland",
  title: "Great Lake Grassland World Plan",
  source: {
    request: "山峦起伏的草地，中间有一个大湖，天上有太阳，远处有一座高塔。",
  },
  intent:
    "A broad playable grassland organized around a central lake, with a northern watchtower as the main navigation and composition anchor.",
  bounds: {
    center: [0, 0],
    size: [640, 640],
    heightRange: [-12, 30],
  },
  terrain: {
    baseRelief: "plain",
    regions: [
      {
        id: "open-grassland-region",
        semantic: "gently_rolling_open_grassland",
        role: "ground",
        area: {
          kind: "polygon",
          points: [[-320, -320], [320, -320], [320, 320], [-320, 320]],
        },
        elevationIntent: "mostly walkable, low-amplitude rolling ground with an open horizon",
        featureId: "rolling-grassland",
        evidence: "user-explicit",
      },
      {
        id: "northwest-watchtower-ridge-region",
        semantic: "low_broad_watchtower_ridge",
        role: "ridge",
        area: { kind: "ellipse", center: [-105, -65], radius: [92, 70] },
        elevationIntent: "a broad eight-meter rise that remains walkable from the west route",
        featureId: "rolling-grassland",
        evidence: "planner-inferred",
      },
    ],
  },
  water: [
    {
      id: "central-lake-region",
      semantic: "broad_clear_central_lake",
      area: { kind: "ellipse", center: [0, 2], radius: [62, 45] },
      featureId: "central-lake",
      evidence: "user-explicit",
    },
  ],
  landmarks: [
    {
      id: "northern-watchtower-anchor",
      semantic: "monumental_watchtower",
      position: [-95, 0, -65],
      approximateSize: [16, 27, 16],
      importance: "primary",
      featureId: "northern-watchtower",
      evidence: "user-explicit",
    },
  ],
  routes: [
    {
      id: "entry-to-watchtower-west-route",
      points: [[0, 68], [-100, 70], [-110, 20], [-105, -40], [-95, -65]],
      width: 10,
      priority: "primary",
      maxSlopeDegrees: 35,
      evidence: "planner-inferred",
    },
  ],
  entry: {
    spawn: [0, 68],
    facingRadians: 0,
    camera: { pitchRadians: 0.3, distance: 4.5, fovDegrees: 56 },
    composition: {
      foreground: ["player on gently rolling grass", "open approach toward the lake"],
      middleground: ["central lake occupying the visual center"],
      background: ["northern ridge", "watchtower left of center", "wide sunlit horizon"],
      visibleLandmarkIds: ["northern-watchtower-anchor"],
    },
  },
  claims: [
    {
      id: "claim-central-lake",
      evidence: "user-explicit",
      statement: "A large lake is the central spatial organizer of the world.",
    },
    {
      id: "claim-open-grassland",
      evidence: "user-explicit",
      statement: "The playable world is a broad grassland with gentle rolling relief.",
    },
    {
      id: "claim-west-route",
      evidence: "planner-inferred",
      statement: "A walkable route continues around the west side of the lake toward the watchtower.",
    },
    {
      id: "claim-surface-detail",
      evidence: "planner-optional",
      statement: "Grass texture, small flowers, cloud detail and final water appearance belong to the world model.",
    },
  ],
  artifacts: [
    {
      kind: "world-plan",
      generator: "codex-imagegen",
      uri: "/scene-plans/grassland/world-plan.png",
      prompt: [
        "Use case: infographic-diagram",
        "Asset type: orthographic world-planning reference for a playable 3D scene",
        "Primary request: a clean top-down plan of a 640 by 640 meter open grassland organized around one large elliptical central lake",
        "Composition/framing: strict orthographic top-down view, north at the top; player entry at the south edge facing north; a monumental watchtower on the north-west ridge; one broad walkable route bends around the west side of the lake",
        "Style/medium: elegant game level-design concept map, simple large color regions, highly legible silhouettes",
        "Constraints: preserve the exact large-scale topology; no perspective; no text, labels, legend, UI, watermark, tiny props, buildings, roads through the lake, or decorative clutter",
      ].join("\n"),
    },
    {
      kind: "opening-shot",
      generator: "codex-imagegen",
      uri: "/scene-plans/grassland/opening-shot.png",
      prompt: [
        "Use case: stylized-concept",
        "Asset type: opening-shot composition target for a third-person playable world",
        "Primary request: the player has just entered a vast gently rolling grassland and looks north across a broad central lake toward a 27 meter watchtower on the left side of the distant ridge",
        "Composition/framing: third-person camera 4.5 meters behind a neutral white humanoid; grass in the foreground, lake centered in the middle ground, the tower left of center about 160 meters away and visibly landmark-sized but not a skyscraper, expansive sky and sun",
        "Style/medium: clean cinematic environment concept art with simple readable masses; spatial design matters more than surface detail",
        "Constraints: keep the player, lake, ridge and one tower at the specified relative positions; no extra cities, mountains blocking the route, text, UI, logos, or watermark",
      ].join("\n"),
    },
    {
      kind: "height-slope-plan",
      generator: "sdk-derived",
      uri: "runtime://planning/height-slope",
    },
  ],
  traceability: {
    requiredFeatureIds: ["rolling-grassland", "central-lake", "northern-watchtower"],
  },
});
