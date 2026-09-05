import { isEqual, isPlainObject } from "lodash-es";

export interface VisualGenerationPromptsV2 {
  readonly kind: "worldkit-visual-generation-prompts";
  readonly schemaVersion: 2;
  readonly sceneId: string;
  readonly openingFrame: {
    readonly referenceRoles: readonly ["actual-whitebox-opening", "user-first-frame"];
    readonly prompt: string;
  };
  readonly styledTriviews: readonly {
    readonly visualTargetId: string;
    readonly referenceRoles: readonly ["target-whitebox-triview", "styled-opening-frame", "user-first-frame"];
    readonly prompt: string;
  }[];
}

/** Host role/target closure only; this is not an independent semantic review. */
export function parseVisualGenerationPromptsV2(
  value: unknown,
  expected: { readonly sceneId: string; readonly visualTargetIds: readonly string[] },
): VisualGenerationPromptsV2 {
  if (!isPlainObject(value)) throw new Error("Visual generation prompt bundle must be an object.");
  const bundle = value as Record<string, unknown>;
  if (
    !isEqual(Object.keys(bundle).sort(), ["kind", "openingFrame", "sceneId", "schemaVersion", "styledTriviews"]) ||
    bundle.kind !== "worldkit-visual-generation-prompts" ||
    bundle.schemaVersion !== 2 || bundle.sceneId !== expected.sceneId
  ) throw new Error("Visual generation prompt bundle identity is invalid.");

  const opening = bundle.openingFrame as Record<string, unknown> | undefined;
  if (!isPlainObject(opening) ||
    !isEqual(opening?.referenceRoles, ["actual-whitebox-opening", "user-first-frame"]) ||
    typeof opening?.prompt !== "string" || opening.prompt.trim().length < 200
  ) throw new Error("Visual opening prompt must preserve its reference roles and minimum 200 characters.");

  if (!Array.isArray(bundle.styledTriviews) || bundle.styledTriviews.length !== expected.visualTargetIds.length) {
    throw new Error("Visual tri-view prompts must exactly match the whitebox target count.");
  }
  for (const [index, value] of bundle.styledTriviews.entries()) {
    const target = value as Record<string, unknown> | undefined;
    if (!isPlainObject(target) || target?.visualTargetId !== expected.visualTargetIds[index] ||
      !isEqual(target?.referenceRoles, ["target-whitebox-triview", "styled-opening-frame", "user-first-frame"]) ||
      typeof target?.prompt !== "string" || target.prompt.trim().length < 150
    ) throw new Error(`Visual tri-view prompt ${index} does not close over its whitebox target, roles, or minimum 150 characters.`);
  }
  return value as VisualGenerationPromptsV2;
}
