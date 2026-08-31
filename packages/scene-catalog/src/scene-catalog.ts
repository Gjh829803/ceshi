const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SCENE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AUTHORING_PATH_PATTERN =
  /^presets\/[a-z0-9]+(?:-[a-z0-9]+)*\/world\.json$/;

export type ScenePurposeV1 = "feel" | "traversal" | "action";

export type SceneCatalogEntryV1 = Readonly<{
  id: string;
  title: string;
  purpose: ScenePurposeV1;
  source: Readonly<{
    kind: "canonical-authoring";
    authoringSpecPath: string;
  }>;
}>;

export interface SceneCatalogV1 {
  readonly schemaVersion: 1;
  readonly kind: "scene-catalog";
  readonly id: string;
  readonly defaultSceneId: string;
  readonly entries: readonly SceneCatalogEntryV1[];
}

function invalidCatalog(): never {
  throw new TypeError(
    "SCENE_CATALOG_INVALID: value must match the closed SceneCatalogV1 contract",
  );
}

function exactRecord(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalidCatalog();
  }
  try {
    if (Reflect.getPrototypeOf(input) !== Object.prototype) {
      return invalidCatalog();
    }
    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== fields.length ||
      keys.some((key) => typeof key !== "string" || !fields.includes(key)) ||
      fields.some((field) => !Object.hasOwn(input, field))
    ) {
      return invalidCatalog();
    }
    const output: Record<string, unknown> = {};
    for (const field of fields) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, field);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return invalidCatalog();
      }
      output[field] = descriptor.value;
    }
    return output;
  } catch {
    return invalidCatalog();
  }
}

function canonicalString(input: unknown, pattern?: RegExp): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input ||
    input.normalize("NFC") !== input ||
    (pattern !== undefined && !pattern.test(input))
  ) {
    return invalidCatalog();
  }
  return input;
}

function purpose(input: unknown): ScenePurposeV1 {
  if (input !== "feel" && input !== "traversal" && input !== "action") {
    return invalidCatalog();
  }
  return input;
}

function parseCatalogSource(input: unknown): SceneCatalogEntryV1["source"] {
  const record = exactRecord(input, ["kind", "authoringSpecPath"]);
  if (record.kind !== "canonical-authoring") return invalidCatalog();
  return Object.freeze({
    kind: "canonical-authoring" as const,
    authoringSpecPath: canonicalString(
      record.authoringSpecPath,
      AUTHORING_PATH_PATTERN,
    ),
  });
}

function parseCatalogEntry(input: unknown): SceneCatalogEntryV1 {
  const record = exactRecord(input, ["id", "title", "purpose", "source"]);
  return Object.freeze({
    id: canonicalString(record.id, SCENE_ID_PATTERN),
    title: canonicalString(record.title),
    purpose: purpose(record.purpose),
    source: parseCatalogSource(record.source),
  });
}

export function parseSceneCatalogV1(input: unknown): SceneCatalogV1 {
  const record = exactRecord(input, [
    "schemaVersion",
    "kind",
    "id",
    "defaultSceneId",
    "entries",
  ]);
  if (
    record.schemaVersion !== 1 ||
    record.kind !== "scene-catalog" ||
    !Array.isArray(record.entries) ||
    record.entries.length === 0
  ) {
    return invalidCatalog();
  }
  const entries = Object.freeze(record.entries.map(parseCatalogEntry));
  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) return invalidCatalog();
  const defaultSceneId = canonicalString(
    record.defaultSceneId,
    SCENE_ID_PATTERN,
  );
  if (!ids.includes(defaultSceneId)) return invalidCatalog();
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: "scene-catalog" as const,
    id: canonicalString(record.id, ID_PATTERN),
    defaultSceneId,
    entries,
  });
}
