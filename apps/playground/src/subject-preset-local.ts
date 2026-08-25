import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type { NumericProfileOverrideV1 } from "@whitebox-world/subject-contracts";

export const SUBJECT_PRESET_LOCAL_STORAGE_KEY = "worldkit.subject-preset-local.v1";

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export interface SubjectPresetStorageV1 {
  readonly length: number;
  clear(): void;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface SubjectPresetSemanticContentV1 {
  subjectDefinitionId: string;
  baseSubjectDefinitionRef: string;
  baseSubjectDefinitionContentHash: string;
  selectedMotionProfileRef: string;
  selectedControlFeelProfileRef: string;
  selectedControlProfileRef: string;
  selectedCameraPreferenceRef: string | null;
  controlFeelOverridesByProfileRef: Readonly<Record<string, NumericProfileOverrideV1>>;
  controlOverridesByProfileRef: Readonly<Record<string, NumericProfileOverrideV1>>;
  cameraOverridesByProfileRef: Readonly<Record<string, NumericProfileOverrideV1>>;
}

export interface SubjectPresetWorkingDraftV1 extends SubjectPresetSemanticContentV1 {
  kind: "worldkit-subject-preset-working-draft";
  schemaVersion: 1;
  draftId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SubjectPresetLocalVersionV1 {
  kind: "worldkit-subject-preset-local-version";
  schemaVersion: 1;
  localVersionId: string;
  displayName: string;
  notes: string;
  sourceDraftId: string;
  contentHash: string;
  content: SubjectPresetSemanticContentV1;
  createdAtIso: string;
}

export interface SubjectPresetLocalDefaultPointerV1 {
  schemaVersion: 1;
  subjectDefinitionId: string;
  baseSubjectDefinitionRef: string;
  baseSubjectDefinitionContentHash: string;
  localVersionId: string;
}

export interface SubjectPresetProfileLockV1 {
  resourceRef: string;
  contentHash: string;
}

export interface SubjectPresetLocalBaselineV1 {
  subjectDefinitionId: string;
  subjectDefinitionRef: string;
  subjectDefinitionContentHash: string;
  defaultMotionProfile: SubjectPresetProfileLockV1;
  availableMotionProfiles?: readonly SubjectPresetProfileLockV1[];
  controlFeelProfile: SubjectPresetProfileLockV1;
  availableControlFeelProfiles?: readonly SubjectPresetProfileLockV1[];
  controlProfile: SubjectPresetProfileLockV1;
  cameraProfiles: readonly SubjectPresetProfileLockV1[];
  defaultCameraProfileRef: string;
}

export interface SubjectPresetLocalDiagnosticV1 {
  code: string;
  message: string;
  storageKey?: string;
}

export interface SubjectPresetWriteReceiptV1<T> {
  value: T;
  status: "persisted" | "memory-only";
  diagnostic?: SubjectPresetLocalDiagnosticV1;
}

export interface SubjectPresetLocalRepositoryOptionsV1 {
  createId?: (prefix: string) => string;
  nowIso?: () => string;
}

export interface SaveSubjectPresetLocalVersionOptionsV1 {
  displayName: string;
  notes: string;
}

export interface SubjectPresetCompareOptionsV1 {
  runtimeParameterNamesByProfileRef?: Readonly<Record<string, readonly string[]>>;
}

export interface SubjectPresetSelectionChangeV1 {
  field:
    | "selectedMotionProfileRef"
    | "selectedControlFeelProfileRef"
    | "selectedControlProfileRef"
    | "selectedCameraPreferenceRef";
  before: string | null;
  after: string | null;
}

export interface SubjectPresetParameterValueV1 {
  source: "inherited" | "override";
  value?: number;
}

export interface SubjectPresetParameterChangeV1 {
  profileKind: "control-feel" | "control" | "camera";
  profileRef: string;
  parameterName: string;
  before: SubjectPresetParameterValueV1;
  after: SubjectPresetParameterValueV1;
  runtimeSupport: "supported" | "draft-only" | "unknown";
}

export interface SubjectPresetSemanticComparisonV1 {
  baselineStatus: "same" | "different";
  isEqual: boolean;
  selectionChanges: readonly SubjectPresetSelectionChangeV1[];
  parameterChanges: readonly SubjectPresetParameterChangeV1[];
}

export interface DeleteSubjectPresetLocalVersionResultV1 {
  deletedLocalVersionId: string;
  clearedLocalDefault: boolean;
}

interface SubjectPresetLocalRepositoryStateV1 {
  kind: "worldkit-subject-preset-local-repository";
  schemaVersion: 1;
  drafts: SubjectPresetWorkingDraftV1[];
  versions: SubjectPresetLocalVersionV1[];
  localDefaults: SubjectPresetLocalDefaultPointerV1[];
}

export interface SubjectPresetLocalRepositoryV1 {
  saveWorkingDraft(
    draft: SubjectPresetWorkingDraftV1,
  ): SubjectPresetWriteReceiptV1<SubjectPresetWorkingDraftV1>;
  getWorkingDraft(
    baseline: SubjectPresetLocalBaselineV1,
  ): SubjectPresetWorkingDraftV1 | undefined;
  saveVersion(
    draft: SubjectPresetWorkingDraftV1,
    options: SaveSubjectPresetLocalVersionOptionsV1,
  ): SubjectPresetWriteReceiptV1<SubjectPresetLocalVersionV1>;
  getVersion(localVersionId: string): SubjectPresetLocalVersionV1 | undefined;
  listVersions(subjectDefinitionId: string): readonly SubjectPresetLocalVersionV1[];
  renameVersion(
    localVersionId: string,
    options: SaveSubjectPresetLocalVersionOptionsV1,
  ): SubjectPresetWriteReceiptV1<SubjectPresetLocalVersionV1>;
  duplicateVersion(
    localVersionId: string,
    options: SaveSubjectPresetLocalVersionOptionsV1,
  ): SubjectPresetWriteReceiptV1<SubjectPresetLocalVersionV1>;
  restoreVersion(
    localVersionId: string,
  ): SubjectPresetWriteReceiptV1<SubjectPresetWorkingDraftV1>;
  deleteVersion(
    localVersionId: string,
  ): SubjectPresetWriteReceiptV1<DeleteSubjectPresetLocalVersionResultV1>;
  setLocalDefault(
    pointer: SubjectPresetLocalDefaultPointerV1,
  ): SubjectPresetWriteReceiptV1<SubjectPresetLocalDefaultPointerV1>;
  getLocalDefault(subjectDefinitionId: string): SubjectPresetLocalDefaultPointerV1 | undefined;
  resolveLocalDefault(baseline: SubjectPresetLocalBaselineV1): SubjectPresetLocalDefaultResolutionV1;
  getDiagnostics(): readonly SubjectPresetLocalDiagnosticV1[];
}

export type SubjectPresetLocalDefaultResolutionV1 =
  | { status: "missing" }
  | {
      status: "baseline-mismatch" | "version-missing";
      pointer: SubjectPresetLocalDefaultPointerV1;
    }
  | {
      status: "applicable";
      pointer: SubjectPresetLocalDefaultPointerV1;
      version: SubjectPresetLocalVersionV1;
    };

function emptyState(): SubjectPresetLocalRepositoryStateV1 {
  return {
    kind: "worldkit-subject-preset-local-repository",
    schemaVersion: 1,
    drafts: [],
    versions: [],
    localDefaults: [],
  };
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`SUBJECT_PRESET_LOCAL_INVALID: ${field} must be a non-empty string.`);
  }
}

function assertHash(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`SUBJECT_PRESET_LOCAL_INVALID: ${field} must be an exact SHA-256 hash.`);
  }
}

function assertRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`SUBJECT_PRESET_LOCAL_INVALID: ${field} must be a plain object.`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  field: string,
): void {
  const expected = new Set(expectedKeys);
  const actualKeys = Object.keys(value);
  const unexpected = actualKeys.find((key) => !expected.has(key));
  if (unexpected !== undefined) {
    throw new TypeError(
      `SUBJECT_PRESET_LOCAL_INVALID: ${field} contains unexpected field ${unexpected}.`,
    );
  }
  const missing = expectedKeys.find((key) => !Object.hasOwn(value, key));
  if (missing !== undefined) {
    throw new TypeError(
      `SUBJECT_PRESET_LOCAL_INVALID: ${field} is missing required field ${missing}.`,
    );
  }
}

function assertIsoTimestamp(value: unknown, field: string): asserts value is string {
  assertString(value, field);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError(`SUBJECT_PRESET_LOCAL_INVALID: ${field} must be an ISO timestamp.`);
  }
}

function normalizeOverride(
  mapKey: string,
  source: unknown,
  field: string,
): NumericProfileOverrideV1 {
  assertRecord(source, `${field}.${mapKey}`);
  assertExactKeys(
    source,
    ["baseResourceRef", "baseContentHash", "values"],
    `${field}.${mapKey}`,
  );
  assertString(source.baseResourceRef, `${field}.${mapKey}.baseResourceRef`);
  if (source.baseResourceRef !== mapKey) {
    throw new TypeError(
      `SUBJECT_PRESET_LOCAL_INVALID: ${field}.${mapKey} must target its exact map key.`,
    );
  }
  assertHash(source.baseContentHash, `${field}.${mapKey}.baseContentHash`);
  assertRecord(source.values, `${field}.${mapKey}.values`);
  const values = Object.fromEntries(
    Object.entries(source.values)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([parameterName, value]) => {
        assertString(parameterName, `${field}.${mapKey}.values parameter name`);
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new TypeError(
            `SUBJECT_PRESET_LOCAL_INVALID: ${field}.${mapKey}.values.${parameterName} must be finite.`,
          );
        }
        return [parameterName, value] as const;
      }),
  );
  return {
    baseResourceRef: source.baseResourceRef,
    baseContentHash: source.baseContentHash,
    values,
  };
}

function normalizeOverrideMap(
  source: unknown,
  field: string,
): Readonly<Record<string, NumericProfileOverrideV1>> {
  assertRecord(source, field);
  return Object.fromEntries(
    Object.entries(source)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([resourceRef, profileOverride]) => [
        resourceRef,
        normalizeOverride(resourceRef, profileOverride, field),
      ]),
  );
}

export function parseSubjectPresetSemanticContentV1(
  input: unknown,
): SubjectPresetSemanticContentV1 {
  assertRecord(input, "semantic content");
  assertExactKeys(
    input,
    [
      "subjectDefinitionId",
      "baseSubjectDefinitionRef",
      "baseSubjectDefinitionContentHash",
      "selectedMotionProfileRef",
      "selectedControlFeelProfileRef",
      "selectedControlProfileRef",
      "selectedCameraPreferenceRef",
      "controlFeelOverridesByProfileRef",
      "controlOverridesByProfileRef",
      "cameraOverridesByProfileRef",
    ],
    "semantic content",
  );
  assertString(input.subjectDefinitionId, "subjectDefinitionId");
  assertString(input.baseSubjectDefinitionRef, "baseSubjectDefinitionRef");
  assertHash(input.baseSubjectDefinitionContentHash, "baseSubjectDefinitionContentHash");
  assertString(input.selectedMotionProfileRef, "selectedMotionProfileRef");
  assertString(input.selectedControlFeelProfileRef, "selectedControlFeelProfileRef");
  assertString(input.selectedControlProfileRef, "selectedControlProfileRef");
  if (input.selectedCameraPreferenceRef !== null) {
    assertString(input.selectedCameraPreferenceRef, "selectedCameraPreferenceRef");
  }
  return {
    subjectDefinitionId: input.subjectDefinitionId,
    baseSubjectDefinitionRef: input.baseSubjectDefinitionRef,
    baseSubjectDefinitionContentHash: input.baseSubjectDefinitionContentHash,
    selectedMotionProfileRef: input.selectedMotionProfileRef,
    selectedControlFeelProfileRef: input.selectedControlFeelProfileRef,
    selectedControlProfileRef: input.selectedControlProfileRef,
    selectedCameraPreferenceRef: input.selectedCameraPreferenceRef,
    controlFeelOverridesByProfileRef: normalizeOverrideMap(
      input.controlFeelOverridesByProfileRef,
      "controlFeelOverridesByProfileRef",
    ),
    controlOverridesByProfileRef: normalizeOverrideMap(
      input.controlOverridesByProfileRef,
      "controlOverridesByProfileRef",
    ),
    cameraOverridesByProfileRef: normalizeOverrideMap(
      input.cameraOverridesByProfileRef,
      "cameraOverridesByProfileRef",
    ),
  };
}

export function parseSubjectPresetWorkingDraftV1(
  source: unknown,
): SubjectPresetWorkingDraftV1 {
  assertRecord(source, "working draft");
  assertExactKeys(
    source,
    [
      "kind",
      "schemaVersion",
      "draftId",
      "subjectDefinitionId",
      "baseSubjectDefinitionRef",
      "baseSubjectDefinitionContentHash",
      "selectedMotionProfileRef",
      "selectedControlFeelProfileRef",
      "selectedControlProfileRef",
      "selectedCameraPreferenceRef",
      "controlFeelOverridesByProfileRef",
      "controlOverridesByProfileRef",
      "cameraOverridesByProfileRef",
      "createdAtIso",
      "updatedAtIso",
    ],
    "working draft",
  );
  if (
    source.kind !== "worldkit-subject-preset-working-draft" ||
    source.schemaVersion !== 1
  ) {
    throw new TypeError("SUBJECT_PRESET_LOCAL_INVALID: working draft kind or schema is invalid.");
  }
  assertString(source.draftId, "draftId");
  assertIsoTimestamp(source.createdAtIso, "createdAtIso");
  assertIsoTimestamp(source.updatedAtIso, "updatedAtIso");
  const content = parseSubjectPresetSemanticContentV1({
    subjectDefinitionId: source.subjectDefinitionId,
    baseSubjectDefinitionRef: source.baseSubjectDefinitionRef,
    baseSubjectDefinitionContentHash: source.baseSubjectDefinitionContentHash,
    selectedMotionProfileRef: source.selectedMotionProfileRef,
    selectedControlFeelProfileRef: source.selectedControlFeelProfileRef,
    selectedControlProfileRef: source.selectedControlProfileRef,
    selectedCameraPreferenceRef: source.selectedCameraPreferenceRef,
    controlFeelOverridesByProfileRef: source.controlFeelOverridesByProfileRef,
    controlOverridesByProfileRef: source.controlOverridesByProfileRef,
    cameraOverridesByProfileRef: source.cameraOverridesByProfileRef,
  });
  return {
    kind: source.kind,
    schemaVersion: source.schemaVersion,
    draftId: source.draftId,
    ...content,
    createdAtIso: source.createdAtIso,
    updatedAtIso: source.updatedAtIso,
  };
}

function semanticContentFromWorkingDraft(
  draft: SubjectPresetWorkingDraftV1,
): SubjectPresetSemanticContentV1 {
  return parseSubjectPresetSemanticContentV1({
    subjectDefinitionId: draft.subjectDefinitionId,
    baseSubjectDefinitionRef: draft.baseSubjectDefinitionRef,
    baseSubjectDefinitionContentHash: draft.baseSubjectDefinitionContentHash,
    selectedMotionProfileRef: draft.selectedMotionProfileRef,
    selectedControlFeelProfileRef: draft.selectedControlFeelProfileRef,
    selectedControlProfileRef: draft.selectedControlProfileRef,
    selectedCameraPreferenceRef: draft.selectedCameraPreferenceRef,
    controlFeelOverridesByProfileRef: draft.controlFeelOverridesByProfileRef,
    controlOverridesByProfileRef: draft.controlOverridesByProfileRef,
    cameraOverridesByProfileRef: draft.cameraOverridesByProfileRef,
  });
}

export function hashSubjectPresetSemanticContentV1(
  content: SubjectPresetSemanticContentV1,
): string {
  return sha256CanonicalJson(parseSubjectPresetSemanticContentV1(content));
}

function flattenedOverrideValues(
  profileKind: SubjectPresetParameterChangeV1["profileKind"],
  overridesByProfileRef: Readonly<Record<string, NumericProfileOverrideV1>>,
): Map<string, { profileKind: SubjectPresetParameterChangeV1["profileKind"]; profileRef: string; parameterName: string; value: number }> {
  const values = new Map<
    string,
    {
      profileKind: SubjectPresetParameterChangeV1["profileKind"];
      profileRef: string;
      parameterName: string;
      value: number;
    }
  >();
  for (const [profileRef, profileOverride] of Object.entries(overridesByProfileRef)) {
    for (const [parameterName, value] of Object.entries(profileOverride.values)) {
      values.set(`${profileKind}\u0000${profileRef}\u0000${parameterName}`, {
        profileKind,
        profileRef,
        parameterName,
        value,
      });
    }
  }
  return values;
}

export function compareSubjectPresetSemanticContentV1(
  beforeInput: SubjectPresetSemanticContentV1,
  afterInput: SubjectPresetSemanticContentV1,
  options: SubjectPresetCompareOptionsV1 = {},
): SubjectPresetSemanticComparisonV1 {
  const before = parseSubjectPresetSemanticContentV1(beforeInput);
  const after = parseSubjectPresetSemanticContentV1(afterInput);
  const baselineStatus =
    before.subjectDefinitionId === after.subjectDefinitionId &&
    before.baseSubjectDefinitionRef === after.baseSubjectDefinitionRef &&
    before.baseSubjectDefinitionContentHash === after.baseSubjectDefinitionContentHash
      ? "same"
      : "different";
  const selectionFields = [
    "selectedMotionProfileRef",
    "selectedControlFeelProfileRef",
    "selectedControlProfileRef",
    "selectedCameraPreferenceRef",
  ] as const;
  const selectionChanges: SubjectPresetSelectionChangeV1[] = selectionFields.flatMap((field) =>
    before[field] === after[field]
      ? []
      : [{ field, before: before[field], after: after[field] }],
  );
  const beforeValues = new Map([
    ...flattenedOverrideValues("control-feel", before.controlFeelOverridesByProfileRef),
    ...flattenedOverrideValues("control", before.controlOverridesByProfileRef),
    ...flattenedOverrideValues("camera", before.cameraOverridesByProfileRef),
  ]);
  const afterValues = new Map([
    ...flattenedOverrideValues("control-feel", after.controlFeelOverridesByProfileRef),
    ...flattenedOverrideValues("control", after.controlOverridesByProfileRef),
    ...flattenedOverrideValues("camera", after.cameraOverridesByProfileRef),
  ]);
  const parameterChanges = [...new Set([...beforeValues.keys(), ...afterValues.keys()])]
    .sort((left, right) => left.localeCompare(right))
    .flatMap<SubjectPresetParameterChangeV1>((key) => {
      const beforeValue = beforeValues.get(key);
      const afterValue = afterValues.get(key);
      if (beforeValue?.value === afterValue?.value) return [];
      const identity = beforeValue ?? afterValue!;
      const supportedNames = options.runtimeParameterNamesByProfileRef?.[identity.profileRef];
      return [{
        profileKind: identity.profileKind,
        profileRef: identity.profileRef,
        parameterName: identity.parameterName,
        before:
          beforeValue === undefined
            ? { source: "inherited" }
            : { source: "override", value: beforeValue.value },
        after:
          afterValue === undefined
            ? { source: "inherited" }
            : { source: "override", value: afterValue.value },
        runtimeSupport:
          supportedNames === undefined
            ? "unknown"
            : supportedNames.includes(identity.parameterName)
              ? "supported"
              : "draft-only",
      }];
    });
  return {
    baselineStatus,
    isEqual:
      baselineStatus === "same" &&
      selectionChanges.length === 0 &&
      parameterChanges.length === 0,
    selectionChanges,
    parameterChanges,
  };
}

export function parseSubjectPresetLocalVersionV1(
  source: unknown,
): SubjectPresetLocalVersionV1 {
  assertRecord(source, "local version");
  assertExactKeys(
    source,
    [
      "kind",
      "schemaVersion",
      "localVersionId",
      "displayName",
      "notes",
      "sourceDraftId",
      "contentHash",
      "content",
      "createdAtIso",
    ],
    "local version",
  );
  if (
    source.kind !== "worldkit-subject-preset-local-version" ||
    source.schemaVersion !== 1
  ) {
    throw new TypeError("SUBJECT_PRESET_LOCAL_INVALID: local version kind or schema is invalid.");
  }
  assertString(source.localVersionId, "localVersionId");
  assertString(source.displayName, "displayName");
  if (typeof source.notes !== "string") {
    throw new TypeError("SUBJECT_PRESET_LOCAL_INVALID: notes must be a string.");
  }
  assertString(source.sourceDraftId, "sourceDraftId");
  assertHash(source.contentHash, "contentHash");
  assertIsoTimestamp(source.createdAtIso, "createdAtIso");
  const content = parseSubjectPresetSemanticContentV1(source.content);
  if (source.contentHash !== hashSubjectPresetSemanticContentV1(content)) {
    throw new TypeError(
      `SUBJECT_PRESET_LOCAL_INVALID: local version ${source.localVersionId} has a forged content hash.`,
    );
  }
  return {
    kind: source.kind,
    schemaVersion: source.schemaVersion,
    localVersionId: source.localVersionId,
    displayName: source.displayName,
    notes: source.notes,
    sourceDraftId: source.sourceDraftId,
    contentHash: source.contentHash,
    content,
    createdAtIso: source.createdAtIso,
  };
}

export function parseSubjectPresetLocalDefaultPointerV1(
  source: unknown,
): SubjectPresetLocalDefaultPointerV1 {
  assertRecord(source, "local default");
  assertExactKeys(
    source,
    [
      "schemaVersion",
      "subjectDefinitionId",
      "baseSubjectDefinitionRef",
      "baseSubjectDefinitionContentHash",
      "localVersionId",
    ],
    "local default",
  );
  if (source.schemaVersion !== 1) {
    throw new TypeError("SUBJECT_PRESET_LOCAL_INVALID: local default schema is invalid.");
  }
  assertString(source.subjectDefinitionId, "subjectDefinitionId");
  assertString(source.baseSubjectDefinitionRef, "baseSubjectDefinitionRef");
  assertHash(source.baseSubjectDefinitionContentHash, "baseSubjectDefinitionContentHash");
  assertString(source.localVersionId, "localVersionId");
  return {
    schemaVersion: source.schemaVersion,
    subjectDefinitionId: source.subjectDefinitionId,
    baseSubjectDefinitionRef: source.baseSubjectDefinitionRef,
    baseSubjectDefinitionContentHash: source.baseSubjectDefinitionContentHash,
    localVersionId: source.localVersionId,
  };
}

function parsePersistedState(raw: string): SubjectPresetLocalRepositoryStateV1 {
  const parsed: unknown = JSON.parse(raw);
  assertRecord(parsed, "stored repository");
  assertExactKeys(
    parsed,
    ["kind", "schemaVersion", "drafts", "versions", "localDefaults"],
    "stored repository",
  );
  if (
    parsed.kind !== "worldkit-subject-preset-local-repository" ||
    parsed.schemaVersion !== 1
  ) {
    throw new TypeError("SUBJECT_PRESET_LOCAL_INVALID: stored repository envelope is invalid.");
  }
  if (
    !Array.isArray(parsed.drafts) ||
    !Array.isArray(parsed.versions) ||
    !Array.isArray(parsed.localDefaults)
  ) {
    throw new TypeError("SUBJECT_PRESET_LOCAL_INVALID: repository collections must be arrays.");
  }
  const drafts = parsed.drafts.map(parseSubjectPresetWorkingDraftV1);
  const versions = parsed.versions.map(parseSubjectPresetLocalVersionV1);
  const localDefaults = parsed.localDefaults.map(parseSubjectPresetLocalDefaultPointerV1);
  const duplicateDraftId = drafts.find(
    (draft, index) => drafts.findIndex((candidate) => candidate.draftId === draft.draftId) !== index,
  );
  const duplicateVersionId = versions.find(
    (version, index) =>
      versions.findIndex((candidate) => candidate.localVersionId === version.localVersionId) !== index,
  );
  const duplicateDefault = localDefaults.find(
    (pointer, index) =>
      localDefaults.findIndex(
        (candidate) => candidate.subjectDefinitionId === pointer.subjectDefinitionId,
      ) !== index,
  );
  if (duplicateDraftId !== undefined || duplicateVersionId !== undefined || duplicateDefault !== undefined) {
    throw new TypeError("SUBJECT_PRESET_LOCAL_INVALID: stored repository contains duplicate ids.");
  }
  return {
    kind: parsed.kind,
    schemaVersion: parsed.schemaVersion,
    drafts,
    versions,
    localDefaults,
  };
}

export function createSubjectPresetLocalRepository(
  storage: SubjectPresetStorageV1,
  options: SubjectPresetLocalRepositoryOptionsV1 = {},
): SubjectPresetLocalRepositoryV1 {
  const createId = options.createId ?? ((prefix: string) => `${prefix}-${crypto.randomUUID()}`);
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  let state = emptyState();
  const diagnostics: SubjectPresetLocalDiagnosticV1[] = [];
  let stored: string | null = null;
  try {
    stored = storage.getItem(SUBJECT_PRESET_LOCAL_STORAGE_KEY);
    if (stored !== null) state = parsePersistedState(stored);
  } catch (error) {
    state = emptyState();
    diagnostics.push({
      code:
        stored === null
          ? "SUBJECT_PRESET_STORAGE_UNAVAILABLE"
          : "SUBJECT_PRESET_LOCAL_STORAGE_INVALID",
      message:
        error instanceof Error
          ? error.message
          : "Local preset storage could not be read.",
      storageKey: SUBJECT_PRESET_LOCAL_STORAGE_KEY,
    });
  }
  function persist<T>(value: T): SubjectPresetWriteReceiptV1<T> {
    try {
      storage.setItem(SUBJECT_PRESET_LOCAL_STORAGE_KEY, JSON.stringify(state));
      return { value: structuredClone(value), status: "persisted" };
    } catch {
      return {
        value: structuredClone(value),
        status: "memory-only",
        diagnostic: {
          code: "SUBJECT_PRESET_STORAGE_UNAVAILABLE",
          message: "Local preset data remains available in memory but was not persisted.",
          storageKey: SUBJECT_PRESET_LOCAL_STORAGE_KEY,
        },
      };
    }
  }

  function requiredVersion(localVersionId: string): {
    version: SubjectPresetLocalVersionV1;
    index: number;
  } {
    const index = state.versions.findIndex(
      (candidate) => candidate.localVersionId === localVersionId,
    );
    const version = state.versions[index];
    if (index < 0 || version === undefined) {
      throw new TypeError(
        `SUBJECT_PRESET_LOCAL_VERSION_NOT_FOUND: ${localVersionId} does not exist.`,
      );
    }
    return { version, index };
  }

  function assertVersionMetadata(saveOptions: SaveSubjectPresetLocalVersionOptionsV1): void {
    assertString(saveOptions.displayName, "displayName");
    if (typeof saveOptions.notes !== "string") {
      throw new TypeError("SUBJECT_PRESET_LOCAL_INVALID: notes must be a string.");
    }
  }

  function createUniqueVersionId(): string {
    const localVersionId = createId("local-version");
    assertString(localVersionId, "localVersionId");
    if (state.versions.some((candidate) => candidate.localVersionId === localVersionId)) {
      throw new TypeError(
        `SUBJECT_PRESET_LOCAL_INVALID: generated duplicate local version id ${localVersionId}.`,
      );
    }
    return localVersionId;
  }

  function storeWorkingDraft(draft: SubjectPresetWorkingDraftV1): void {
    const existingIndex = state.drafts.findIndex(
      (candidate) =>
        candidate.subjectDefinitionId === draft.subjectDefinitionId &&
        candidate.baseSubjectDefinitionRef === draft.baseSubjectDefinitionRef &&
        candidate.baseSubjectDefinitionContentHash === draft.baseSubjectDefinitionContentHash,
    );
    if (existingIndex < 0) state.drafts.push(draft);
    else state.drafts[existingIndex] = draft;
  }

  return {
    saveWorkingDraft(draft) {
      const normalized = parseSubjectPresetWorkingDraftV1(draft);
      storeWorkingDraft(normalized);
      return persist(normalized);
    },
    getWorkingDraft(baseline) {
      const draft = state.drafts.find(
        (candidate) =>
          candidate.subjectDefinitionId === baseline.subjectDefinitionId &&
          candidate.baseSubjectDefinitionRef === baseline.subjectDefinitionRef &&
          candidate.baseSubjectDefinitionContentHash ===
            baseline.subjectDefinitionContentHash,
      );
      return draft === undefined ? undefined : structuredClone(draft);
    },
    saveVersion(draft, saveOptions) {
      assertString(draft.draftId, "draftId");
      assertVersionMetadata(saveOptions);
      const content = semanticContentFromWorkingDraft(
        parseSubjectPresetWorkingDraftV1(draft),
      );
      const createdAtIso = nowIso();
      const version: SubjectPresetLocalVersionV1 = {
        kind: "worldkit-subject-preset-local-version",
        schemaVersion: 1,
        localVersionId: createUniqueVersionId(),
        displayName: saveOptions.displayName,
        notes: saveOptions.notes,
        sourceDraftId: draft.draftId,
        contentHash: hashSubjectPresetSemanticContentV1(content),
        content,
        createdAtIso,
      };
      state.versions.push(version);
      return persist(version);
    },
    getVersion(localVersionId) {
      const version = state.versions.find((candidate) => candidate.localVersionId === localVersionId);
      return version === undefined ? undefined : structuredClone(version);
    },
    listVersions(subjectDefinitionId) {
      return state.versions
        .filter((version) => version.content.subjectDefinitionId === subjectDefinitionId)
        .map((version) => structuredClone(version));
    },
    renameVersion(localVersionId, renameOptions) {
      assertVersionMetadata(renameOptions);
      const { version, index } = requiredVersion(localVersionId);
      const renamed: SubjectPresetLocalVersionV1 = {
        ...version,
        displayName: renameOptions.displayName,
        notes: renameOptions.notes,
      };
      state.versions[index] = renamed;
      return persist(renamed);
    },
    duplicateVersion(localVersionId, duplicateOptions) {
      assertVersionMetadata(duplicateOptions);
      const { version } = requiredVersion(localVersionId);
      const duplicate: SubjectPresetLocalVersionV1 = {
        ...structuredClone(version),
        localVersionId: createUniqueVersionId(),
        displayName: duplicateOptions.displayName,
        notes: duplicateOptions.notes,
        createdAtIso: nowIso(),
      };
      assertIsoTimestamp(duplicate.createdAtIso, "createdAtIso");
      state.versions.push(duplicate);
      return persist(duplicate);
    },
    restoreVersion(localVersionId) {
      const { version } = requiredVersion(localVersionId);
      const restoredAtIso = nowIso();
      assertIsoTimestamp(restoredAtIso, "restoredAtIso");
      const draft = parseSubjectPresetWorkingDraftV1({
        kind: "worldkit-subject-preset-working-draft",
        schemaVersion: 1,
        draftId: createId("draft"),
        ...structuredClone(version.content),
        createdAtIso: restoredAtIso,
        updatedAtIso: restoredAtIso,
      });
      storeWorkingDraft(draft);
      return persist(draft);
    },
    deleteVersion(localVersionId) {
      const { index } = requiredVersion(localVersionId);
      state.versions.splice(index, 1);
      const defaultsBefore = state.localDefaults.length;
      state.localDefaults = state.localDefaults.filter(
        (pointer) => pointer.localVersionId !== localVersionId,
      );
      return persist({
        deletedLocalVersionId: localVersionId,
        clearedLocalDefault: state.localDefaults.length !== defaultsBefore,
      });
    },
    setLocalDefault(pointer) {
      if (pointer.schemaVersion !== 1) {
        throw new TypeError("SUBJECT_PRESET_LOCAL_INVALID: local default schema is invalid.");
      }
      assertString(pointer.subjectDefinitionId, "subjectDefinitionId");
      assertString(pointer.baseSubjectDefinitionRef, "baseSubjectDefinitionRef");
      assertHash(pointer.baseSubjectDefinitionContentHash, "baseSubjectDefinitionContentHash");
      assertString(pointer.localVersionId, "localVersionId");
      const version = state.versions.find(
        (candidate) => candidate.localVersionId === pointer.localVersionId,
      );
      if (
        version === undefined ||
        version.content.subjectDefinitionId !== pointer.subjectDefinitionId ||
        version.content.baseSubjectDefinitionRef !== pointer.baseSubjectDefinitionRef ||
        version.content.baseSubjectDefinitionContentHash !==
          pointer.baseSubjectDefinitionContentHash
      ) {
        throw new TypeError(
          "SUBJECT_PRESET_LOCAL_DEFAULT_INVALID: local version does not match the exact subject baseline.",
        );
      }
      const normalized: SubjectPresetLocalDefaultPointerV1 = {
        schemaVersion: 1,
        subjectDefinitionId: pointer.subjectDefinitionId,
        baseSubjectDefinitionRef: pointer.baseSubjectDefinitionRef,
        baseSubjectDefinitionContentHash: pointer.baseSubjectDefinitionContentHash,
        localVersionId: pointer.localVersionId,
      };
      const existingIndex = state.localDefaults.findIndex(
        (candidate) => candidate.subjectDefinitionId === pointer.subjectDefinitionId,
      );
      if (existingIndex < 0) state.localDefaults.push(normalized);
      else state.localDefaults[existingIndex] = normalized;
      return persist(normalized);
    },
    getLocalDefault(subjectDefinitionId) {
      const pointer = state.localDefaults.find(
        (candidate) => candidate.subjectDefinitionId === subjectDefinitionId,
      );
      return pointer === undefined ? undefined : structuredClone(pointer);
    },
    resolveLocalDefault(baseline) {
      const pointer = state.localDefaults.find(
        (candidate) => candidate.subjectDefinitionId === baseline.subjectDefinitionId,
      );
      if (pointer === undefined) return { status: "missing" };
      if (
        pointer.baseSubjectDefinitionRef !== baseline.subjectDefinitionRef ||
        pointer.baseSubjectDefinitionContentHash !== baseline.subjectDefinitionContentHash
      ) {
        return { status: "baseline-mismatch", pointer: structuredClone(pointer) };
      }
      const version = state.versions.find(
        (candidate) => candidate.localVersionId === pointer.localVersionId,
      );
      if (version === undefined) {
        return { status: "version-missing", pointer: structuredClone(pointer) };
      }
      return {
        status: "applicable",
        pointer: structuredClone(pointer),
        version: structuredClone(version),
      };
    },
    getDiagnostics() {
      return structuredClone(diagnostics);
    },
  };
}
