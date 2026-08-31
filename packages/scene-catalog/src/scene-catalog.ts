import {
  worldPackageRootHashFromRefV1,
  type WorldPackageRefV1,
} from "@whitebox-world/world-identity";

const G_BOT_DEFINITION_REF =
  "worldkit://subject-definition/humanoid.g-bot@2" as const;
const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SCENE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AUTHORING_PATH_PATTERN =
  /^presets\/[a-z0-9]+(?:-[a-z0-9]+)*\/world\.json$/;
const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 100_000;

export type ScenePurposeV1 = "feel" | "traversal" | "action";

export type SceneCatalogEntryV1 = Readonly<{
  id: string;
  title: string;
  purpose: ScenePurposeV1;
  source:
    | Readonly<{
        kind: "canonical-authoring";
        authoringSpecPath: string;
      }>
    | Readonly<{
        kind: "babylon-native-package";
        worldPackageRef: WorldPackageRefV1;
      }>;
  defaultSubjectDefinitionRef: typeof G_BOT_DEFINITION_REF;
}>;

export interface SceneCatalogV1 {
  readonly schemaVersion: 1;
  readonly kind: "scene-catalog";
  readonly id: string;
  readonly defaultSceneId: string;
  readonly entries: readonly SceneCatalogEntryV1[];
}

export interface ViewerBootstrapEntryV1 {
  readonly id: string;
  readonly title: string;
  readonly purpose: ScenePurposeV1;
  readonly sourceKind: SceneCatalogEntryV1["source"]["kind"];
  readonly defaultSubjectDefinitionRef: typeof G_BOT_DEFINITION_REF;
}

export type ViewerBootstrapV1 = Readonly<{
  schemaVersion: 1;
  kind: "scene-viewer-bootstrap";
  selectedSceneId: string;
  entries: readonly Readonly<ViewerBootstrapEntryV1>[];
  sceneSource:
    | Readonly<{
        kind: "canonical-authoring";
        authoringSpec: Readonly<Record<string, unknown>>;
      }>
    | Readonly<{
        kind: "babylon-native-package";
        worldPackageRef: WorldPackageRefV1;
      }>;
}>;

function invalidCatalog(): never {
  throw new TypeError(
    "SCENE_CATALOG_INVALID: value must match the closed SceneCatalogV1 contract",
  );
}

function invalidBootstrap(): never {
  throw new TypeError(
    "VIEWER_BOOTSTRAP_INVALID: value must match the closed ViewerBootstrapV1 contract",
  );
}

function exactRecord(
  input: unknown,
  fields: readonly string[],
  invalid: () => never,
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalid();
  }
  try {
    if (Reflect.getPrototypeOf(input) !== Object.prototype) return invalid();
    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== fields.length ||
      keys.some((key) => typeof key !== "string" || !fields.includes(key)) ||
      fields.some((field) => !Object.hasOwn(input, field))
    ) {
      return invalid();
    }
    const output: Record<string, unknown> = {};
    for (const field of fields) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, field);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return invalid();
      }
      output[field] = descriptor.value;
    }
    return output;
  } catch {
    return invalid();
  }
}

function canonicalString(
  input: unknown,
  pattern: RegExp | undefined,
  invalid: () => never,
): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input ||
    input.normalize("NFC") !== input ||
    (pattern !== undefined && !pattern.test(input))
  ) {
    return invalid();
  }
  return input;
}

function purpose(input: unknown, invalid: () => never): ScenePurposeV1 {
  if (input !== "feel" && input !== "traversal" && input !== "action") {
    return invalid();
  }
  return input;
}

function packageRef(input: unknown, invalid: () => never): WorldPackageRefV1 {
  if (typeof input !== "string") return invalid();
  try {
    worldPackageRootHashFromRefV1(input as WorldPackageRefV1);
    return input as WorldPackageRefV1;
  } catch {
    return invalid();
  }
}

function parseCatalogSource(
  input: unknown,
): SceneCatalogEntryV1["source"] {
  const discriminator = exactRecord(input, Reflect.ownKeys(input ?? {} as object)
    .filter((key): key is string => typeof key === "string"), invalidCatalog).kind;
  if (discriminator === "canonical-authoring") {
    const record = exactRecord(
      input,
      ["kind", "authoringSpecPath"],
      invalidCatalog,
    );
    return Object.freeze({
      kind: "canonical-authoring" as const,
      authoringSpecPath: canonicalString(
        record.authoringSpecPath,
        AUTHORING_PATH_PATTERN,
        invalidCatalog,
      ),
    });
  }
  if (discriminator === "babylon-native-package") {
    const record = exactRecord(
      input,
      ["kind", "worldPackageRef"],
      invalidCatalog,
    );
    return Object.freeze({
      kind: "babylon-native-package" as const,
      worldPackageRef: packageRef(record.worldPackageRef, invalidCatalog),
    });
  }
  return invalidCatalog();
}

function parseCatalogEntry(input: unknown): SceneCatalogEntryV1 {
  const record = exactRecord(
    input,
    ["id", "title", "purpose", "source", "defaultSubjectDefinitionRef"],
    invalidCatalog,
  );
  if (record.defaultSubjectDefinitionRef !== G_BOT_DEFINITION_REF) {
    return invalidCatalog();
  }
  return Object.freeze({
    id: canonicalString(record.id, SCENE_ID_PATTERN, invalidCatalog),
    title: canonicalString(record.title, undefined, invalidCatalog),
    purpose: purpose(record.purpose, invalidCatalog),
    source: parseCatalogSource(record.source),
    defaultSubjectDefinitionRef: G_BOT_DEFINITION_REF,
  });
}

function snapshotJsonValue(
  input: unknown,
  state: { nodes: number },
  depth = 0,
): unknown {
  state.nodes += 1;
  if (depth > MAX_JSON_DEPTH || state.nodes > MAX_JSON_NODES) {
    return invalidBootstrap();
  }
  if (
    input === null ||
    typeof input === "string" ||
    typeof input === "boolean" ||
    (typeof input === "number" && Number.isFinite(input))
  ) {
    return input;
  }
  if (Array.isArray(input)) {
    return Object.freeze(input.map((value) => snapshotJsonValue(
      value,
      state,
      depth + 1,
    )));
  }
  if (typeof input !== "object") return invalidBootstrap();
  let keys: readonly PropertyKey[];
  try {
    if (Reflect.getPrototypeOf(input) !== Object.prototype) {
      return invalidBootstrap();
    }
    keys = Reflect.ownKeys(input);
  } catch {
    return invalidBootstrap();
  }
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof key !== "string") return invalidBootstrap();
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      return invalidBootstrap();
    }
    output[key] = snapshotJsonValue(descriptor.value, state, depth + 1);
  }
  return Object.freeze(output);
}

export function parseSceneCatalogV1(input: unknown): SceneCatalogV1 {
  const record = exactRecord(
    input,
    ["schemaVersion", "kind", "id", "defaultSceneId", "entries"],
    invalidCatalog,
  );
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
    invalidCatalog,
  );
  if (!ids.includes(defaultSceneId)) return invalidCatalog();
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: "scene-catalog" as const,
    id: canonicalString(record.id, ID_PATTERN, invalidCatalog),
    defaultSceneId,
    entries,
  });
}

function parseBootstrapEntry(input: unknown): Readonly<ViewerBootstrapEntryV1> {
  const record = exactRecord(
    input,
    ["id", "title", "purpose", "sourceKind", "defaultSubjectDefinitionRef"],
    invalidBootstrap,
  );
  if (
    record.defaultSubjectDefinitionRef !== G_BOT_DEFINITION_REF ||
    (record.sourceKind !== "canonical-authoring" &&
      record.sourceKind !== "babylon-native-package")
  ) {
    return invalidBootstrap();
  }
  return Object.freeze({
    id: canonicalString(record.id, SCENE_ID_PATTERN, invalidBootstrap),
    title: canonicalString(record.title, undefined, invalidBootstrap),
    purpose: purpose(record.purpose, invalidBootstrap),
    sourceKind: record.sourceKind,
    defaultSubjectDefinitionRef: G_BOT_DEFINITION_REF,
  });
}

function parseBootstrapSource(input: unknown): ViewerBootstrapV1["sceneSource"] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalidBootstrap();
  }
  const kindDescriptor = Reflect.getOwnPropertyDescriptor(input, "kind");
  if (kindDescriptor === undefined || !("value" in kindDescriptor)) {
    return invalidBootstrap();
  }
  if (kindDescriptor.value === "canonical-authoring") {
    const record = exactRecord(
      input,
      ["kind", "authoringSpec"],
      invalidBootstrap,
    );
    const authoringSpec = snapshotJsonValue(
      record.authoringSpec,
      { nodes: 0 },
    );
    if (
      typeof authoringSpec !== "object" ||
      authoringSpec === null ||
      Array.isArray(authoringSpec)
    ) {
      return invalidBootstrap();
    }
    const authoringRecord = authoringSpec as Readonly<Record<string, unknown>>;
    if (
      authoringRecord.schemaVersion !== 4 ||
      authoringRecord.kind !== "worldkit-authoring-spec" ||
      typeof authoringRecord.id !== "string"
    ) {
      return invalidBootstrap();
    }
    return Object.freeze({
      kind: "canonical-authoring" as const,
      authoringSpec: authoringRecord,
    });
  }
  if (kindDescriptor.value === "babylon-native-package") {
    const record = exactRecord(
      input,
      ["kind", "worldPackageRef"],
      invalidBootstrap,
    );
    return Object.freeze({
      kind: "babylon-native-package" as const,
      worldPackageRef: packageRef(record.worldPackageRef, invalidBootstrap),
    });
  }
  return invalidBootstrap();
}

export function parseViewerBootstrapV1(input: unknown): ViewerBootstrapV1 {
  const record = exactRecord(
    input,
    ["schemaVersion", "kind", "selectedSceneId", "entries", "sceneSource"],
    invalidBootstrap,
  );
  if (
    record.schemaVersion !== 1 ||
    record.kind !== "scene-viewer-bootstrap" ||
    !Array.isArray(record.entries) ||
    record.entries.length === 0
  ) {
    return invalidBootstrap();
  }
  const entries = Object.freeze(record.entries.map(parseBootstrapEntry));
  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) return invalidBootstrap();
  const selectedSceneId = canonicalString(
    record.selectedSceneId,
    SCENE_ID_PATTERN,
    invalidBootstrap,
  );
  const selectedEntry = entries.find((entry) => entry.id === selectedSceneId);
  if (selectedEntry === undefined) return invalidBootstrap();
  const sceneSource = parseBootstrapSource(record.sceneSource);
  if (sceneSource.kind !== selectedEntry.sourceKind) return invalidBootstrap();
  if (
    sceneSource.kind === "canonical-authoring" &&
    sceneSource.authoringSpec.id !== selectedSceneId
  ) {
    return invalidBootstrap();
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: "scene-viewer-bootstrap" as const,
    selectedSceneId,
    entries,
    sceneSource,
  });
}
