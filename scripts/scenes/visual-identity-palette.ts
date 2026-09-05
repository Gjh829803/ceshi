import {
  SCENE_BRIEF_MOVEMENT_MODES_V1,
  type SceneBriefV1,
  type SceneBriefVisualTargetKindV1,
} from "@whitebox-world/authoring";
import type { Sha256HashV1 } from "@whitebox-world/protocol";

export type VisualIdentityPaletteSceneSourceKindV1 =
  | "canonical"
  | "babylon-native";

export const CANONICAL_VISUAL_IDENTITY_COLORS = Object.freeze([
  "#E85D5D",
  "#F28E2B",
  "#8E6CCF",
  "#D45087",
  "#D6B84C",
] as const);

export const BABYLON_NATIVE_VISUAL_IDENTITY_COLORS = Object.freeze([
  "#E85D5D",
  "#F28E2B",
  "#D9A514",
  "#4E79A7",
  "#9C6ADE",
] as const);

export interface VisualIdentityPaletteTargetV1 {
  readonly id: string;
  readonly visualTargetId: string;
  readonly targetKind: SceneBriefVisualTargetKindV1;
  readonly name: string;
  readonly description: string;
  readonly role: SceneBriefV1["visualTargets"][number]["role"];
  readonly semanticClassId: string;
  readonly identityColor: `#${string}`;
}

export interface VisualIdentityPaletteV1 {
  readonly kind: "worldkit-visual-identity-palette";
  readonly schemaVersion: 1;
  readonly sceneId: string;
  readonly sceneBriefHash: Sha256HashV1;
  readonly movementModes: readonly SceneBriefV1["movementModes"][number]["mode"][];
  readonly movementModeLabels: readonly string[];
  readonly targets: readonly VisualIdentityPaletteTargetV1[];
}

const PALETTE_FIELDS = Object.freeze([
  "kind",
  "schemaVersion",
  "sceneId",
  "sceneBriefHash",
  "movementModes",
  "movementModeLabels",
  "targets",
] as const);
const TARGET_FIELDS = Object.freeze([
  "id",
  "visualTargetId",
  "targetKind",
  "name",
  "description",
  "role",
  "semanticClassId",
  "identityColor",
] as const);
const TARGET_KINDS = Object.freeze([
  "subject",
  "landmark",
  "repeated-landmark",
] as const);
const TARGET_ROLES = Object.freeze([
  "primary-subject",
  "primary-landmark",
  "secondary-landmark",
] as const);
const SHA256_HASH = /^sha256:[a-f0-9]{64}$/;

function invalid(message: string): never {
  throw new TypeError(`WORLDKIT_VISUAL_IDENTITY_PALETTE_INVALID: ${message}`);
}

function exactRecord(
  input: unknown,
  fields: readonly string[],
  path: string,
): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Object.prototype
  ) return invalid(`${path} must be an ordinary object`);
  const keys = Reflect.ownKeys(input);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.length !== fields.length ||
    fields.some((field) => !keys.includes(field))
  ) return invalid(`${path} must use the exact closed field set`);
  return input as Record<string, unknown>;
}

function nonEmptyText(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    return invalid(`${path} must be a non-empty string`);
  }
  return value;
}

export function deriveVisualIdentityPalette(
  brief: SceneBriefV1,
  sceneSourceKind: VisualIdentityPaletteSceneSourceKindV1,
): readonly VisualIdentityPaletteTargetV1[] {
  const colors = sceneSourceKind === "canonical"
    ? CANONICAL_VISUAL_IDENTITY_COLORS
    : BABYLON_NATIVE_VISUAL_IDENTITY_COLORS;
  if (brief.visualTargets.length > colors.length) {
    return invalid("Scene Brief exceeds the frozen five-target color profile");
  }
  return Object.freeze(brief.visualTargets.map((target, index) => Object.freeze({
    id: target.id,
    visualTargetId: target.id,
    targetKind: target.kind,
    name: target.name,
    description: target.description,
    role: target.role,
    semanticClassId: target.semanticClassId,
    identityColor: colors[index]!,
  })));
}

export function parseVisualIdentityPaletteV1(
  input: unknown,
  expected: Readonly<{
    sceneSourceKind: VisualIdentityPaletteSceneSourceKindV1;
    sceneId: string;
    sceneBriefHash: Sha256HashV1;
  }>,
): VisualIdentityPaletteV1 {
  const source = exactRecord(input, PALETTE_FIELDS, "palette");
  const sceneId = nonEmptyText(source.sceneId, "palette/sceneId");
  const sceneBriefHash = nonEmptyText(
    source.sceneBriefHash,
    "palette/sceneBriefHash",
  );
  if (!Array.isArray(source.movementModes) || source.movementModes.length < 1 || source.movementModes.length > 8 ||
      !Array.isArray(source.movementModeLabels) || source.movementModeLabels.length !== source.movementModes.length)
    return invalid("palette movement modes and labels must contain 1-8 ordered pairs");
  const movementModes = source.movementModes.map((mode, index) => nonEmptyText(mode, `palette/movementModes/${index}`));
  const movementModeLabels = source.movementModeLabels.map((label, index) => nonEmptyText(label, `palette/movementModeLabels/${index}`));
  if (
    source.kind !== "worldkit-visual-identity-palette" ||
    source.schemaVersion !== 1 ||
    sceneId !== expected.sceneId ||
    !SHA256_HASH.test(sceneBriefHash) ||
    sceneBriefHash !== expected.sceneBriefHash ||
    movementModes.some(mode => !SCENE_BRIEF_MOVEMENT_MODES_V1.includes(
      mode as SceneBriefV1["movementModes"][number]["mode"],
    )) ||
    !Array.isArray(source.targets) ||
    source.targets.length < 1 ||
    source.targets.length > BABYLON_NATIVE_VISUAL_IDENTITY_COLORS.length
  ) return invalid("palette identity, movement mode, or target count is invalid");
  const expectedColors = expected.sceneSourceKind === "canonical"
    ? CANONICAL_VISUAL_IDENTITY_COLORS
    : BABYLON_NATIVE_VISUAL_IDENTITY_COLORS;
  const targets = source.targets.map((inputTarget, index) => {
    const target = exactRecord(inputTarget, TARGET_FIELDS, `palette/targets/${index}`);
    const id = nonEmptyText(target.id, `palette/targets/${index}/id`);
    const visualTargetId = nonEmptyText(
      target.visualTargetId,
      `palette/targets/${index}/visualTargetId`,
    );
    const targetKind = nonEmptyText(
      target.targetKind,
      `palette/targets/${index}/targetKind`,
    );
    const name = nonEmptyText(target.name, `palette/targets/${index}/name`);
    const description = nonEmptyText(
      target.description,
      `palette/targets/${index}/description`,
    );
    const role = nonEmptyText(target.role, `palette/targets/${index}/role`);
    const semanticClassId = nonEmptyText(
      target.semanticClassId,
      `palette/targets/${index}/semanticClassId`,
    );
    const identityColor = nonEmptyText(
      target.identityColor,
      `palette/targets/${index}/identityColor`,
    );
    const expectedId = `visual-target-${index + 1}`;
    if (
      id !== expectedId ||
      visualTargetId !== expectedId ||
      !TARGET_KINDS.includes(targetKind as SceneBriefVisualTargetKindV1) ||
      !TARGET_ROLES.includes(
        role as SceneBriefV1["visualTargets"][number]["role"],
      ) ||
      identityColor !== expectedColors[index] ||
      !/^#[0-9A-F]{6}$/.test(identityColor) ||
      (index === 0 &&
        (targetKind !== "subject" || role !== "primary-subject")) ||
      (index > 0 &&
        (targetKind === "subject" || role === "primary-subject"))
    ) return invalid(`palette/targets/${index} is outside the selected source profile`);
    return Object.freeze({
      id,
      visualTargetId,
      targetKind: targetKind as SceneBriefVisualTargetKindV1,
      name,
      description,
      role: role as SceneBriefV1["visualTargets"][number]["role"],
      semanticClassId,
      identityColor: identityColor as `#${string}`,
    });
  });
  if (
    targets.filter(({ targetKind }) => targetKind === "subject").length !== 1 ||
    new Set(targets.map(({ id }) => id)).size !== targets.length ||
    new Set(targets.map(({ identityColor }) => identityColor)).size !== targets.length
  ) return invalid("palette targets must have unique identities and colors");
  return Object.freeze({
    kind: "worldkit-visual-identity-palette",
    schemaVersion: 1,
    sceneId,
    sceneBriefHash: sceneBriefHash as Sha256HashV1,
    movementModes: Object.freeze(movementModes as SceneBriefV1["movementModes"][number]["mode"][]),
    movementModeLabels: Object.freeze(movementModeLabels),
    targets: Object.freeze(targets),
  });
}
