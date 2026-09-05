import { sha256CanonicalJson } from "@whitebox-world/protocol";

export const SCENE_BRIEF_MOVEMENT_MODES_V1 = [
  "ground-walk",
  "ground-slide",
  "ground-ride",
  "ground-drive",
  "water-surface",
  "underwater",
  "flight",
  "custom",
] as const;

export type SceneBriefMovementModeV1 =
  (typeof SCENE_BRIEF_MOVEMENT_MODES_V1)[number];

export type SceneBriefVisualTargetKindV1 =
  | "subject"
  | "landmark"
  | "repeated-landmark";

export interface SceneBriefVisualTargetV1 {
  readonly id: string;
  readonly kind: SceneBriefVisualTargetKindV1;
  readonly name: string;
  readonly description: string;
  readonly role: "primary-subject" | "primary-landmark" | "secondary-landmark";
  readonly semanticClassId: string;
}
export interface SceneBriefV1 {
  readonly kind: "worldkit-scene-brief";
  readonly schemaVersion: 1;
  readonly scene: string;
  readonly subject: string;
  readonly userFacts: string;
  readonly visibleReferenceEvidence: string;
  readonly inferredContinuation: string;
  readonly renderLayerIdeas: string;
  readonly movementModes: readonly {
    readonly mode: SceneBriefMovementModeV1;
    readonly label: string;
    readonly description: string;
  }[];
  readonly space: string;
  readonly navigation: string;
  readonly openingShot: string;
  readonly visualTargets: readonly SceneBriefVisualTargetV1[];
}

export interface SceneBriefValidationSuccessV1 {
  readonly ok: true;
  readonly value: SceneBriefV1;
  readonly sceneBriefHash: `sha256:${string}`;
  readonly diagnostics: readonly [];
}

export interface SceneBriefValidationFailureV1 {
  readonly ok: false;
  readonly diagnostics: readonly string[];
}

export type SceneBriefValidationResultV1 =
  | SceneBriefValidationSuccessV1
  | SceneBriefValidationFailureV1;

const REQUIRED_SECTIONS = [
  "场景",
  "主体",
  "用户事实",
  "可见参考证据",
  "推断的世界延伸",
  "仅视觉层设想",
  "运动模式",
  "空间",
  "通行",
  "首帧",
  "视觉目标",
] as const;

const MOVEMENT_LABELS = new Map<string, SceneBriefMovementModeV1>([
  ["陆地步行", "ground-walk"],
  ["陆地滑行", "ground-slide"],
  ["陆地骑乘", "ground-ride"],
  ["陆地驾驶", "ground-drive"],
  ["水面航行", "water-surface"],
  ["水下游动", "underwater"],
  ["空中飞行", "flight"],
]);

function movementModeForLabel(label: string): SceneBriefMovementModeV1 {
  const exact = MOVEMENT_LABELS.get(label);
  if (exact !== undefined) return exact;
  for (const [standardLabel, mode] of MOVEMENT_LABELS) {
    const suffix = label.slice(standardLabel.length).trimStart();
    if (
      label.startsWith(standardLabel) &&
      ((suffix.startsWith("（") && suffix.endsWith("）")) ||
        (suffix.startsWith("(") && suffix.endsWith(")"))) &&
      suffix.length >= 3 && suffix.length <= 26
    ) return mode;
  }
  return "custom";
}

const TARGET_KIND_LABELS = new Map<string, SceneBriefVisualTargetKindV1>([
  ["主体", "subject"],
  ["标志物", "landmark"],
  ["重复标志物", "repeated-landmark"],
]);

function fail(...diagnostics: string[]): SceneBriefValidationFailureV1 {
  return { ok: false, diagnostics };
}

function splitSections(source: string):
  | ReadonlyMap<string, string>
  | SceneBriefValidationFailureV1 {
  const normalized = source.replaceAll("\r\n", "\n").trim();
  if (new TextEncoder().encode(normalized).byteLength > 12 * 1024) {
    return fail("SCENE_BRIEF_TOO_LARGE: Scene Brief must be at most 12 KiB.");
  }
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "# WorldKit Scene Brief") {
    return fail("SCENE_BRIEF_HEADER_INVALID: first line must be '# WorldKit Scene Brief'.");
  }

  const sections = new Map<string, string[]>();
  let current: string | undefined;
  for (const line of lines.slice(1)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)?.[1];
    if (heading !== undefined) {
      if (!REQUIRED_SECTIONS.includes(heading as (typeof REQUIRED_SECTIONS)[number])) {
        return fail(`SCENE_BRIEF_SECTION_UNKNOWN: '${heading}'.`);
      }
      if (sections.has(heading)) {
        return fail(`SCENE_BRIEF_SECTION_DUPLICATE: '${heading}'.`);
      }
      current = heading;
      sections.set(heading, []);
      continue;
    }
    if (current !== undefined) sections.get(current)!.push(line);
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!sections.has(section)) return fail(`SCENE_BRIEF_SECTION_MISSING: '${section}'.`);
    const value = sections.get(section)!.join("\n").trim();
    if (!value) return fail(`SCENE_BRIEF_SECTION_EMPTY: '${section}'.`);
    sections.set(section, [value]);
  }
  return new Map([...sections].map(([key, value]) => [key, value[0]!]));
}

function parseMovementModes(value: string):
  | SceneBriefV1["movementModes"]
  | SceneBriefValidationFailureV1 {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 1 || lines.length > 8) {
    return fail("SCENE_BRIEF_MOVEMENT_COUNT: movement modes must contain 1-8 entries.");
  }
  const labels = new Set<string>();
  const movementModes: SceneBriefV1["movementModes"][number][] = [];
  for (const [index, line] of lines.entries()) {
    const match = /^-\s*([^：:\n]+)[：:]\s*([^\n]+)$/.exec(line);
    if (match === null) return fail(
      `SCENE_BRIEF_MOVEMENT_INVALID: entry ${index + 1} must use '- <运动模式>：<一句自然语言说明>'.`,
    );
    const label = match[1]!.trim();
    if (label.length > 48) return fail("SCENE_BRIEF_MOVEMENT_LABEL_TOO_LONG: movement label must be at most 48 characters.");
    if (labels.has(label)) return fail(`SCENE_BRIEF_MOVEMENT_DUPLICATE: '${label}'.`);
    labels.add(label);
    movementModes.push({ mode: movementModeForLabel(label), label, description: match[2]!.trim() });
  }
  return Object.freeze(movementModes);
}

function parseVisualTargets(value: string):
  | readonly SceneBriefVisualTargetV1[]
  | SceneBriefValidationFailureV1 {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 1 || lines.length > 5) {
    return fail("SCENE_BRIEF_VISUAL_TARGET_COUNT: visual targets must contain 1-5 entries.");
  }
  const targets: SceneBriefVisualTargetV1[] = [];
  const names = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const match = /^-\s*(主体|标志物|重复标志物)\s*[｜|]\s*([^：:\n｜|]{1,48})\s*[：:]\s*(.+)$/.exec(line);
    if (match === null) {
      return fail(
        `SCENE_BRIEF_VISUAL_TARGET_INVALID: entry ${index + 1} must use '- 主体｜名称：说明', '- 标志物｜名称：说明', or '- 重复标志物｜名称：说明'.`,
      );
    }
    const kind = TARGET_KIND_LABELS.get(match[1]!)!;
    const name = match[2]!.trim();
    const description = match[3]!.trim();
    if (names.has(name)) {
      return fail(`SCENE_BRIEF_VISUAL_TARGET_DUPLICATE: '${name}'.`);
    }
    names.add(name);
    targets.push({
      id: `visual-target-${index + 1}`,
      kind,
      name,
      description,
      role: kind === "subject"
        ? "primary-subject"
        : targets.some((target) => target.kind !== "subject")
          ? "secondary-landmark"
          : "primary-landmark",
      semanticClassId: kind === "subject"
        ? "visual.subject"
        : kind === "repeated-landmark"
          ? "visual.landmark.repeated"
          : "visual.landmark",
    });
  }
  if (targets[0]?.kind !== "subject" || targets.filter(({ kind }) => kind === "subject").length !== 1) {
    return fail("SCENE_BRIEF_PRIMARY_SUBJECT: the first and only Subject visual target is required.");
  }
  return targets;
}

export function parseSceneBriefV1(source: string): SceneBriefValidationResultV1 {
  const sections = splitSections(source);
  if ("ok" in sections) return sections;
  const movementModes = parseMovementModes(sections.get("运动模式")!);
  if ("ok" in movementModes) return movementModes;
  const visualTargets = parseVisualTargets(sections.get("视觉目标")!);
  if ("ok" in visualTargets) return visualTargets;
  const value: SceneBriefV1 = {
    kind: "worldkit-scene-brief",
    schemaVersion: 1,
    scene: sections.get("场景")!,
    subject: sections.get("主体")!,
    userFacts: sections.get("用户事实")!,
    visibleReferenceEvidence: sections.get("可见参考证据")!,
    inferredContinuation: sections.get("推断的世界延伸")!,
    renderLayerIdeas: sections.get("仅视觉层设想")!,
    movementModes,
    space: sections.get("空间")!,
    navigation: sections.get("通行")!,
    openingShot: sections.get("首帧")!,
    visualTargets,
  };
  return {
    ok: true,
    value,
    sceneBriefHash: sha256CanonicalJson(value) as `sha256:${string}`,
    diagnostics: [],
  };
}
