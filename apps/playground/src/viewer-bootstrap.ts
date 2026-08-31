import {
  parseAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import type {
  SceneCatalogV1,
  ScenePurposeV1,
} from "@whitebox-world/scene-catalog";

const G_BOT_SUBJECT_DEFINITION_REF =
  "worldkit://subject-definition/humanoid.g-bot@2";

export type ViewerSceneEntryV1 = Readonly<{
  id: string;
  title: string;
  purpose: ScenePurposeV1;
}>;

export type ViewerSelectionV1 =
  | Readonly<{
      kind: "curated-preset";
      selectedSceneId: string;
      entries: readonly ViewerSceneEntryV1[];
    }>
  | Readonly<{
      kind: "fixed-host";
      selectedSceneId: string;
    }>;

export type ViewerBootstrapV1 = Readonly<{
  kind: "scene-viewer-bootstrap";
  schemaVersion: 1;
  selection: ViewerSelectionV1;
  authoringSpec: AuthoringSpecV4;
}>;

type CuratedViewerBootstrapInputV1 = Readonly<{
  catalog: SceneCatalogV1;
  selectedSceneId?: string;
  loadAuthoringSpec: (relativePath: string) => Promise<string>;
}>;

function fail(code: string): never {
  throw new TypeError(code);
}

function exactRecord(
  input: unknown,
  fields: readonly string[],
  errorCode = "VIEWER_BOOTSTRAP_INVALID",
): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return fail(errorCode);
  }
  try {
    if (Reflect.getPrototypeOf(input) !== Object.prototype) {
      return fail(errorCode);
    }
    const keys = Reflect.ownKeys(input);
    if (
      keys.length !== fields.length ||
      keys.some((key) => typeof key !== "string" || !fields.includes(key)) ||
      fields.some((field) => !Object.hasOwn(input, field))
    ) {
      return fail(errorCode);
    }
    const record: Record<string, unknown> = {};
    for (const field of fields) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, field);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        return fail(errorCode);
      }
      record[field] = descriptor.value;
    }
    return record;
  } catch {
    return fail(errorCode);
  }
}

function canonicalString(
  input: unknown,
  errorCode = "VIEWER_BOOTSTRAP_INVALID",
): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.trim() !== input ||
    input.normalize("NFC") !== input
  ) {
    return fail(errorCode);
  }
  return input;
}

function deepFreeze<T>(value: T, visited = new Set<object>()): T {
  if (typeof value !== "object" || value === null || visited.has(value)) {
    return value;
  }
  visited.add(value);
  for (const child of Object.values(value)) deepFreeze(child, visited);
  return Object.freeze(value);
}

function parseAuthoringSpec(sourceText: string): AuthoringSpecV4 {
  const result = parseAuthoringSpecV4(sourceText);
  if (!result.ok || result.value === undefined) {
    return fail("VIEWER_BOOTSTRAP_AUTHORING_INVALID");
  }
  return deepFreeze(result.value);
}

function assertControlledGbot(authoringSpec: AuthoringSpecV4): void {
  const controlled = authoringSpec.nodes.find(
    (node) => node.id === authoringSpec.startup.controlledEntityId,
  );
  if (
    controlled?.kind !== "subject" ||
    controlled.subjectDefinitionRef !== G_BOT_SUBJECT_DEFINITION_REF
  ) {
    fail("VIEWER_PRESET_CONTROLLED_SUBJECT_NOT_G_BOT");
  }
}

function parsePurpose(input: unknown): ScenePurposeV1 {
  if (input !== "feel" && input !== "traversal" && input !== "action") {
    return fail("VIEWER_BOOTSTRAP_INVALID");
  }
  return input;
}

function parseSceneEntry(input: unknown): ViewerSceneEntryV1 {
  const record = exactRecord(input, ["id", "title", "purpose"]);
  return Object.freeze({
    id: canonicalString(record.id),
    title: canonicalString(record.title),
    purpose: parsePurpose(record.purpose),
  });
}

function parseSelection(input: unknown): ViewerSelectionV1 {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return fail("VIEWER_BOOTSTRAP_INVALID");
  }
  const descriptor = Reflect.getOwnPropertyDescriptor(input, "kind");
  if (descriptor === undefined || !("value" in descriptor)) {
    return fail("VIEWER_BOOTSTRAP_INVALID");
  }
  if (descriptor.value === "fixed-host") {
    const record = exactRecord(input, ["kind", "selectedSceneId"]);
    return Object.freeze({
      kind: "fixed-host" as const,
      selectedSceneId: canonicalString(record.selectedSceneId),
    });
  }
  if (descriptor.value !== "curated-preset") {
    return fail("VIEWER_BOOTSTRAP_INVALID");
  }
  const record = exactRecord(input, ["kind", "selectedSceneId", "entries"]);
  if (!Array.isArray(record.entries) || record.entries.length === 0) {
    return fail("VIEWER_BOOTSTRAP_INVALID");
  }
  const entries = Object.freeze(record.entries.map(parseSceneEntry));
  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) fail("VIEWER_BOOTSTRAP_INVALID");
  const selectedSceneId = canonicalString(record.selectedSceneId);
  if (!ids.includes(selectedSceneId)) fail("VIEWER_BOOTSTRAP_INVALID");
  return Object.freeze({
    kind: "curated-preset" as const,
    selectedSceneId,
    entries,
  });
}

export async function createCuratedViewerBootstrapV1(
  input: CuratedViewerBootstrapInputV1,
): Promise<ViewerBootstrapV1> {
  const selectedSceneId = input.selectedSceneId ?? input.catalog.defaultSceneId;
  const selectedEntry = input.catalog.entries.find(
    (entry) => entry.id === selectedSceneId,
  );
  if (selectedEntry === undefined) fail("VIEWER_PRESET_NOT_FOUND");
  const authoringSpec = parseAuthoringSpec(
    await input.loadAuthoringSpec(selectedEntry.source.authoringSpecPath),
  );
  if (authoringSpec.id !== selectedEntry.id) {
    fail("VIEWER_PRESET_AUTHORING_ID_MISMATCH");
  }
  assertControlledGbot(authoringSpec);
  return deepFreeze({
    kind: "scene-viewer-bootstrap" as const,
    schemaVersion: 1 as const,
    selection: {
      kind: "curated-preset" as const,
      selectedSceneId,
      entries: input.catalog.entries.map(({ id, title, purpose }) => ({
        id,
        title,
        purpose,
      })),
    },
    authoringSpec,
  });
}

export function createFixedViewerBootstrapV1(
  sourceText: string,
): ViewerBootstrapV1 {
  const authoringSpec = parseAuthoringSpec(sourceText);
  return deepFreeze({
    kind: "scene-viewer-bootstrap" as const,
    schemaVersion: 1 as const,
    selection: {
      kind: "fixed-host" as const,
      selectedSceneId: authoringSpec.id,
    },
    authoringSpec,
  });
}

export function parseViewerBootstrapV1(input: unknown): ViewerBootstrapV1 {
  const record = exactRecord(input, [
    "kind",
    "schemaVersion",
    "selection",
    "authoringSpec",
  ]);
  if (
    record.kind !== "scene-viewer-bootstrap" ||
    record.schemaVersion !== 1
  ) {
    return fail("VIEWER_BOOTSTRAP_INVALID");
  }
  const selection = parseSelection(record.selection);
  let sourceText: string;
  try {
    sourceText = JSON.stringify(record.authoringSpec);
  } catch {
    return fail("VIEWER_BOOTSTRAP_AUTHORING_INVALID");
  }
  const authoringSpec = parseAuthoringSpec(sourceText);
  if (selection.selectedSceneId !== authoringSpec.id) {
    return fail("VIEWER_BOOTSTRAP_SCENE_ID_MISMATCH");
  }
  if (selection.kind === "curated-preset") assertControlledGbot(authoringSpec);
  return deepFreeze({
    kind: "scene-viewer-bootstrap" as const,
    schemaVersion: 1 as const,
    selection,
    authoringSpec,
  });
}

export async function loadViewerBootstrapV1(
  fetchSource: () => Promise<Response> = () =>
    fetch("/__worldkit/viewer-bootstrap", { cache: "no-store" }),
): Promise<ViewerBootstrapV1> {
  let response: Response;
  try {
    response = await fetchSource();
  } catch {
    return fail("VIEWER_BOOTSTRAP_FETCH_FAILED");
  }
  if (!response.ok) fail(`VIEWER_BOOTSTRAP_HTTP_${response.status}`);
  let input: unknown;
  try {
    input = await response.json();
  } catch {
    return fail("VIEWER_BOOTSTRAP_JSON_INVALID");
  }
  return parseViewerBootstrapV1(input);
}

export function viewerSceneSelectionUrlV1(
  currentHref: string,
  sceneId: string,
  entries: readonly ViewerSceneEntryV1[],
): string {
  if (!entries.some((entry) => entry.id === sceneId)) {
    return fail("VIEWER_PRESET_NOT_FOUND");
  }
  const url = new URL(currentHref);
  url.search = "";
  url.hash = "";
  url.searchParams.set("scene", sceneId);
  return url.toString();
}
