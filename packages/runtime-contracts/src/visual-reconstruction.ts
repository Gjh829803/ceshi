export interface VisualReferenceManifestV1 {
  kind: "worldkit-visual-reference-manifest";
  schemaVersion: 1;
  sceneId: string;
  motionReference: {
    token: "@视频1";
    path: string;
    contentHash: `sha256:${string}`;
    mediaType: "video/mp4" | "video/webm" | "video/quicktime";
    durationSeconds: number;
    width: number;
    height: number;
  };
  subjectAppearanceReference: {
    token: "@图片1";
    path: string;
    contentHash: `sha256:${string}`;
  };
  environmentAppearanceReference: {
    token: "@图片2";
    path: "styled-opening-frame.png";
    contentHash: `sha256:${string}`;
  };
  whiteboxOpeningFrame: {
    path: "opening-frame.png";
    contentHash: `sha256:${string}`;
  };
  motionContactSheet: {
    path: "whitebox-motion-contact-sheet.png";
    contentHash: `sha256:${string}`;
  };
  supplementalTriviews: readonly {
    token: `@图片${number}`;
    targetId: string;
    path: string;
    contentHash: `sha256:${string}`;
  }[];
}

export interface VideoPromptFieldsV1 {
  kind: "worldkit-video-prompt-fields";
  schemaVersion: 1;
  sceneId: string;
  finalScene: {
    location: string;
    timeOfDay: string;
    weather: string;
    groundAndWallMaterials: string;
    keyLightDirection: string;
    colorTemperature: string;
    visualStyle: string;
  };
  action: string;
  cinematography: {
    lens: "35mm" | "50mm";
    movement: "手持跟拍" | "轨道推进" | "弧形环绕" | "跟随镜头" | "固定机位";
    notes: string;
  };
  additionalRestrictions: readonly string[];
}

export interface VideoGenerationPromptV1 {
  kind: "worldkit-video-generation-prompt";
  schemaVersion: 1;
  sceneId: string;
  templateVersion: 1;
  visualReferenceManifestHash: `sha256:${string}`;
  fieldsHash: `sha256:${string}`;
  prompt: string;
}

export interface VisualAlignmentReportV1 {
  kind: "worldkit-visual-alignment-report";
  schemaVersion: 1;
  sceneId: string;
  status: "passed" | "failed";
  gates: {
    terrainAndArchitectureSilhouette: boolean;
    cameraProjectionAndHorizon: boolean;
    subjectAndObjectPlacement: boolean;
    scaleAndVisibleCounts: boolean;
    depthOrderAndOcclusion: boolean;
    routeAndSupportGeometry: boolean;
    noWhiteboxOrViewportResidue: boolean;
  };
  issues: readonly string[];
}

const ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;

function text(value: unknown, maximum = 1_000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

export function validateVideoPromptFieldsV1(value: VideoPromptFieldsV1): readonly string[] {
  const errors: string[] = [];
  if (value.kind !== "worldkit-video-prompt-fields" || value.schemaVersion !== 1 || !ID.test(value.sceneId)) {
    errors.push("Video prompt field identity is invalid.");
  }
  if (value.finalScene === undefined || !Object.values(value.finalScene).every((item) => text(item)) || !text(value.action, 2_000) ||
      !["35mm", "50mm"].includes(value.cinematography?.lens) ||
      !["手持跟拍", "轨道推进", "弧形环绕", "跟随镜头", "固定机位"].includes(value.cinematography?.movement) ||
      !text(value.cinematography?.notes, 1_000)) {
    errors.push("Video prompt scene, action, or cinematography fields are invalid.");
  }
  if (!Array.isArray(value.additionalRestrictions) || value.additionalRestrictions.length > 20 ||
      value.additionalRestrictions.some((item) => !text(item, 300))) {
    errors.push("Video prompt additional restrictions are invalid.");
  }
  return errors;
}

export function validateVisualReferenceManifestV1(value: VisualReferenceManifestV1): readonly string[] {
  const errors: string[] = [];
  if (value.kind !== "worldkit-visual-reference-manifest" || value.schemaVersion !== 1 || !ID.test(value.sceneId)) {
    errors.push("Visual reference manifest identity is invalid.");
  }
  const fixed = [
    value.motionReference,
    value.subjectAppearanceReference,
    value.environmentAppearanceReference,
    value.whiteboxOpeningFrame,
    value.motionContactSheet,
  ];
  if (fixed.some((item) => !text(item?.path) || !HASH.test(item?.contentHash ?? "")) ||
      value.motionReference?.token !== "@视频1" || value.subjectAppearanceReference?.token !== "@图片1" ||
      value.environmentAppearanceReference?.token !== "@图片2") {
    errors.push("Visual reference fixed bindings are invalid.");
  }
  if (!Number.isFinite(value.motionReference?.durationSeconds) || value.motionReference.durationSeconds <= 0 ||
      !Number.isSafeInteger(value.motionReference?.width) || value.motionReference.width <= 0 ||
      !Number.isSafeInteger(value.motionReference?.height) || value.motionReference.height <= 0) {
    errors.push("Visual motion reference metadata is invalid.");
  }
  const triViews = Array.isArray(value.supplementalTriviews) ? value.supplementalTriviews : [];
  const expectedTokens = triViews.map((_, index) => `@图片${index + 3}`);
  if (!Array.isArray(value.supplementalTriviews) || triViews.some((item, index) =>
    item.token !== expectedTokens[index] || !ID.test(item.targetId) || !text(item.path) || !HASH.test(item.contentHash))) {
    errors.push("Visual tri-view bindings must be ordered from @图片3.");
  }
  return errors;
}

export function validateVisualAlignmentReportV1(value: VisualAlignmentReportV1): readonly string[] {
  const errors: string[] = [];
  if (value.kind !== "worldkit-visual-alignment-report" || value.schemaVersion !== 1 || !ID.test(value.sceneId)) {
    errors.push("Visual alignment report identity is invalid.");
  }
  const gates = value.gates === undefined ? [] : Object.values(value.gates);
  if (gates.length !== 7 || gates.some((gate) => typeof gate !== "boolean")) {
    errors.push("Visual alignment report must contain all seven boolean gates.");
  }
  if (!Array.isArray(value.issues) || value.issues.length > 20 || value.issues.some((issue) => !text(issue, 500))) {
    errors.push("Visual alignment issues are invalid.");
  }
  if (value.status !== "passed" || gates.some((gate) => gate !== true) || value.issues.length > 0) {
    errors.push("Styled opening frame does not strictly preserve the whitebox projection.");
  }
  return errors;
}
