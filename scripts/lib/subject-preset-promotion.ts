import { createHash, randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  parseSubjectPresetCandidateV1,
  type SubjectPresetCandidateV1,
} from "@whitebox-world/authoring";
import {
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
import {
  builtInSubjectResourceRegistry,
  createSubjectDefaultRegistryV1,
  createSubjectResourceRegistry,
  type CameraContextProfileInputV1,
  type CameraRigProfileInputV1,
  type ControlFeelProfileInputV1,
  type ControlProfileInputV1,
  type RegistrySubjectDefinitionInputV3,
  type SubjectDefaultCatalogV1,
  type SubjectRegistryResourceInputV3,
  type SubjectRegistryResourceV3,
  type SubjectResourceRegistryV3,
} from "@whitebox-world/subject-registry";

import { isEmpty, isEqual, isNil } from "lodash-es";

import { parseTrustedSourceCommit } from "./worldkit-source-commit";

import {
  BUILT_IN_CAPABILITY_MANIFESTS,
  BUILT_IN_CAPABILITY_RESOURCES,
} from "../../packages/subject-registry/src/built-in-capability-resources";
import { BUILT_IN_SUBJECT_RESOURCE_MANIFESTS } from "../../packages/subject-registry/src/built-in-resource-manifests";
import { BUILT_IN_SUBJECT_DEFINITIONS } from "../../packages/subject-registry/src/built-in-subject-definitions";

const execFile = promisify(execFileCallback);

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const PROMOTION_PLAN_KIND = "worldkit-subject-preset-promotion-plan";
const PROMOTION_FIXTURE_KIND = "worldkit-subject-preset-registry-fixture";

const CATALOG_PATHS = {
  camera: "assets/registry/camera-profiles/catalog.json",
  controlFeel: "assets/registry/control-feel-profiles/catalog.json",
  control: "assets/registry/control-profiles/catalog.json",
  motion: "assets/registry/motion-profiles/catalog.json",
  defaults: "assets/registry/subject-defaults/catalog.json",
  definitions: "assets/registry/subject-definitions/catalog.json",
} as const;

const STATIC_TARGET_PATHS = new Set<string>(Object.values(CATALOG_PATHS));

export interface SubjectPresetPromotionGeneratedResourceV1 {
  resourceKind: SubjectRegistryResourceV3["kind"];
  resourceRef: string;
  contentHash: string;
}

export interface SubjectPresetPromotionTargetV1 {
  logicalPath: string;
  preimageSha256: string | null;
  postimageSha256: string;
  canonicalBytesBase64: string;
}

export interface SubjectPresetPromotionPlanV1 {
  kind: typeof PROMOTION_PLAN_KIND;
  schemaVersion: 1;
  candidateId: string;
  candidateSemanticContentHash: string;
  baseSubjectDefinitionRef: string;
  proposedSubjectDefinitionRef: string;
  proposedSubjectDefinitionContentHash: string;
  generatedResources: SubjectPresetPromotionGeneratedResourceV1[];
  targets: SubjectPresetPromotionTargetV1[];
  planHash: string;
}

export interface SubjectPresetPromotionPlanningOptionsV1 {
  repositoryRoot: string;
  registry?: SubjectResourceRegistryV3;
  candidate?: SubjectPresetCandidateV1;
}

export interface SubjectPresetPromotionFaultPointV1 {
  phase:
    | "before-temp-write"
    | "before-backup-rename"
    | "before-publish-rename";
  logicalPath: string;
}

export interface SubjectPresetPromotionOptionsV1
  extends SubjectPresetPromotionPlanningOptionsV1 {
  plan: SubjectPresetPromotionPlanV1;
  planPath?: string;
  harnessReceiptPath?: string;
  harnessReceipt?: unknown;
  write: boolean;
  injectFailure?: (
    point: SubjectPresetPromotionFaultPointV1,
  ) => void | Promise<void>;
}

export interface SubjectPresetPromotionResultV1 {
  planHash: string;
  writtenLogicalPaths: string[];
}

export interface SubjectPresetHarnessReceiptV1 {
  kind: "worldkit-subject-preset-harness-receipt";
  schemaVersion: 1;
  candidateSemanticContentHash: string;
  planHash: string;
  harnessProfileRef: string;
  passedCheckIds: readonly string[];
  sourceCommit: string;
  runtimeBuild: string;
}

export function validateSubjectPresetHarnessReceiptV1(
  value: unknown,
  expected: {
    candidateSemanticContentHash: string;
    planHash: string;
    harnessProfileRef: string;
    requiredPassedCheckIds: readonly string[];
    sourceCommit: string;
    runtimeBuild: string;
  },
): SubjectPresetHarnessReceiptV1 {
  if (!isPlainRecord(value)) {
    fail(
      "SUBJECT_PRESET_HARNESS_RECEIPT_INVALID_SHAPE",
      "Harness receipt must be a plain object.",
    );
  }
  const unknown = Object.keys(value).find((key) =>
    ![
      "kind",
      "schemaVersion",
      "candidateSemanticContentHash",
      "planHash",
      "harnessProfileRef",
      "passedCheckIds",
      "sourceCommit",
      "runtimeBuild",
    ].includes(key)
  );
  if (unknown !== undefined) {
    fail(
      "SUBJECT_PRESET_HARNESS_RECEIPT_UNKNOWN_FIELD",
      `Unexpected field '${unknown}'.`,
    );
  }
  if (value.kind !== "worldkit-subject-preset-harness-receipt") {
    fail("SUBJECT_PRESET_HARNESS_RECEIPT_KIND_MISMATCH", "Unexpected receipt kind.");
  }
  if (value.schemaVersion !== 1) {
    fail(
      "SUBJECT_PRESET_HARNESS_RECEIPT_SCHEMA_VERSION_MISMATCH",
      "schemaVersion must be 1.",
    );
  }
  if (value.candidateSemanticContentHash !== expected.candidateSemanticContentHash) {
    fail(
      "SUBJECT_PRESET_HARNESS_RECEIPT_CANDIDATE_MISMATCH",
      "Receipt candidate hash does not match the Candidate.",
    );
  }
  if (value.planHash !== expected.planHash) {
    fail(
      "SUBJECT_PRESET_HARNESS_RECEIPT_PLAN_MISMATCH",
      "Receipt plan hash does not match the promotion plan.",
    );
  }
  if (value.harnessProfileRef !== expected.harnessProfileRef) {
    fail(
      "SUBJECT_PRESET_HARNESS_RECEIPT_HARNESS_MISMATCH",
      "Receipt Harness Profile does not match the locked profile.",
    );
  }
  if (!Array.isArray(value.passedCheckIds)) {
    fail(
      "SUBJECT_PRESET_HARNESS_RECEIPT_INCOMPLETE",
      "passedCheckIds must be an array.",
    );
  }
  const passedCheckIds = value.passedCheckIds.map((checkId, index) => {
    if (typeof checkId !== "string") {
      fail(
        "SUBJECT_PRESET_HARNESS_RECEIPT_INCOMPLETE",
        `passedCheckIds[${index}] must be a string.`,
      );
    }
    return checkId;
  });
  if (
    isEmpty(expected.requiredPassedCheckIds) ||
    !isEqual([...passedCheckIds].sort(), [...expected.requiredPassedCheckIds].sort())
  ) {
    fail(
      "SUBJECT_PRESET_HARNESS_RECEIPT_INCOMPLETE",
      "Receipt must include every check declared by the locked Harness Profile.",
    );
  }
  if (typeof value.sourceCommit !== "string" || isNil(parseTrustedSourceCommit(value.sourceCommit))) {
    fail(
      "SUBJECT_PRESET_HARNESS_RECEIPT_SOURCE_COMMIT",
      "sourceCommit must be a trusted 40-character commit id.",
    );
  }
  if (value.sourceCommit !== expected.sourceCommit) {
    fail(
      "SUBJECT_PRESET_HARNESS_RECEIPT_SOURCE_COMMIT_MISMATCH",
      "Receipt sourceCommit does not match the Candidate source commit.",
    );
  }
  if (typeof value.runtimeBuild !== "string" || value.runtimeBuild.length === 0) {
    fail(
      "SUBJECT_PRESET_HARNESS_RECEIPT_RUNTIME_BUILD",
      "runtimeBuild must be a non-empty string.",
    );
  }
  if (value.runtimeBuild !== expected.runtimeBuild) {
    fail(
      "SUBJECT_PRESET_HARNESS_RECEIPT_RUNTIME_BUILD_MISMATCH",
      "Receipt runtimeBuild does not match the trusted Git build.",
    );
  }
  if (
    typeof value.candidateSemanticContentHash !== "string" ||
    !HASH_PATTERN.test(value.candidateSemanticContentHash) ||
    typeof value.planHash !== "string" ||
    !HASH_PATTERN.test(value.planHash)
  ) {
    fail(
      "SUBJECT_PRESET_HARNESS_RECEIPT_HASH_INVALID",
      "Candidate and plan hashes must be sha256 content hashes.",
    );
  }
  return {
    kind: "worldkit-subject-preset-harness-receipt",
    schemaVersion: 1,
    candidateSemanticContentHash: value.candidateSemanticContentHash,
    planHash: value.planHash,
    harnessProfileRef: value.harnessProfileRef,
    passedCheckIds,
    sourceCommit: value.sourceCommit,
    runtimeBuild: value.runtimeBuild,
  };
}

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function sha256Bytes(bytes: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(`${stringifyCanonicalJson(value)}\n`, "utf8");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function stripContentHash<T extends SubjectRegistryResourceV3>(
  resource: T,
): Omit<T, "contentHash"> {
  const { contentHash: _ignored, ...input } = structuredClone(resource);
  return input;
}

function parseJsonBytes(bytes: Uint8Array, label: string): unknown {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("SUBJECT_PRESET_PROMOTION_INVALID_UTF8", `${label} is not valid UTF-8.`);
  }
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    return fail(
      "SUBJECT_PRESET_PROMOTION_INVALID_JSON",
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function validateSubjectPresetCandidateFile(
  candidatePath: string,
  options: { registry?: SubjectResourceRegistryV3 } = {},
): Promise<SubjectPresetCandidateV1> {
  const bytes = await readFile(candidatePath);
  if (bytes.byteLength > 4 * 1024 * 1024) {
    fail(
      "SUBJECT_PRESET_PROMOTION_CANDIDATE_TOO_LARGE",
      "Candidate files may not exceed 4 MiB.",
    );
  }
  return parseSubjectPresetCandidateV1(
    parseJsonBytes(bytes, "Subject Preset candidate"),
    options.registry ?? builtInSubjectResourceRegistry,
  );
}

function exactRepositoryRoot(repositoryRoot: string): string {
  const absolute = path.resolve(repositoryRoot);
  if (path.parse(absolute).root === absolute) {
    fail(
      "SUBJECT_PRESET_PROMOTION_REPOSITORY_ROOT_INVALID",
      "A filesystem root cannot be used as the repository boundary.",
    );
  }
  return absolute;
}

function normalizedLogicalPath(logicalPath: string, candidateId?: string): string {
  const containsUriScheme = /^[a-z][a-z0-9+.-]*:/i.test(logicalPath);
  const containsDrive = /^[a-z]:[\\/]/i.test(logicalPath);
  const containsUnc = /^(?:\\\\|\/\/)/.test(logicalPath);
  const containsBackslash = logicalPath.includes("\\");
  const segments = logicalPath.split("/");
  if (
    logicalPath.length === 0 ||
    logicalPath.includes("\0") ||
    path.isAbsolute(logicalPath) ||
    path.win32.isAbsolute(logicalPath) ||
    containsUriScheme ||
    containsDrive ||
    containsUnc ||
    containsBackslash ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..") ||
    path.posix.normalize(logicalPath) !== logicalPath
  ) {
    fail(
      "SUBJECT_PRESET_PROMOTION_UNSAFE_TARGET",
      `Target '${logicalPath}' is not a normalized repository-relative path.`,
    );
  }
  const expectedFixture = candidateId === undefined
    ? undefined
    : `.codex-tmp/subject-presets/${candidateId}.registry-fixture.json`;
  if (!STATIC_TARGET_PATHS.has(logicalPath) && logicalPath !== expectedFixture) {
    fail(
      "SUBJECT_PRESET_PROMOTION_UNSAFE_TARGET",
      `Target '${logicalPath}' is outside the Subject Preset promotion allowlist.`,
    );
  }
  return logicalPath;
}

function targetAbsolutePath(repositoryRoot: string, logicalPath: string): string {
  const absolute = path.resolve(repositoryRoot, ...logicalPath.split("/"));
  const relative = path.relative(repositoryRoot, absolute);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    fail(
      "SUBJECT_PRESET_PROMOTION_UNSAFE_TARGET",
      `Target '${logicalPath}' escapes the repository boundary.`,
    );
  }
  return absolute;
}

export function assertSubjectPresetArtifactLocationV1(
  artifactPath: string,
  repositoryRoot: string,
): void {
  const absolute = path.resolve(artifactPath);
  const relative = path.relative(repositoryRoot, absolute);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    const logical = relative.split(path.sep).join("/");
    if (!logical.startsWith(".codex-tmp/subject-presets/")) {
      fail(
        "SUBJECT_PRESET_PROMOTION_INPUT_LOCATION_FORBIDDEN",
        "Subject Preset artifacts inside the repository must live under .codex-tmp/subject-presets/.",
      );
    }
  }
}

async function readArrayCatalog(
  repositoryRoot: string,
  logicalPath: string,
): Promise<Record<string, unknown>[]> {
  const source = parseJsonBytes(
    await readFile(targetAbsolutePath(repositoryRoot, logicalPath)),
    logicalPath,
  );
  if (!Array.isArray(source) || source.some((entry) => !isPlainRecord(entry))) {
    fail(
      "SUBJECT_PRESET_PROMOTION_CATALOG_INVALID",
      `'${logicalPath}' must contain an array of Registry resources.`,
    );
  }
  const resources = source as Record<string, unknown>[];
  const refs = resources.map((resource) => resource.resourceRef);
  if (
    refs.some((resourceRef) => typeof resourceRef !== "string") ||
    new Set(refs).size !== refs.length
  ) {
    fail(
      "SUBJECT_PRESET_PROMOTION_VERSION_COLLISION",
      `'${logicalPath}' contains a duplicate or malformed resourceRef.`,
    );
  }
  return structuredClone(resources);
}

async function readDefaultCatalog(
  repositoryRoot: string,
): Promise<SubjectDefaultCatalogV1> {
  const source = parseJsonBytes(
    await readFile(targetAbsolutePath(repositoryRoot, CATALOG_PATHS.defaults)),
    CATALOG_PATHS.defaults,
  );
  if (
    !isPlainRecord(source) ||
    source.schemaVersion !== 1 ||
    !Array.isArray(source.defaults)
  ) {
    fail(
      "SUBJECT_PRESET_PROMOTION_CATALOG_INVALID",
      "The Subject public-default catalog is malformed.",
    );
  }
  return structuredClone(source) as unknown as SubjectDefaultCatalogV1;
}

interface CameraCatalogV1 {
  algorithms: Record<string, unknown>[];
  profiles: Record<string, unknown>[];
  modifiers: Record<string, unknown>[];
  contexts: Record<string, unknown>[];
}

async function readCameraCatalog(
  repositoryRoot: string,
): Promise<CameraCatalogV1> {
  const source = parseJsonBytes(
    await readFile(targetAbsolutePath(repositoryRoot, CATALOG_PATHS.camera)),
    CATALOG_PATHS.camera,
  );
  if (!isPlainRecord(source)) {
    fail(
      "SUBJECT_PRESET_PROMOTION_CATALOG_INVALID",
      "The Camera catalog must be an object.",
    );
  }
  const expectedKeys = ["algorithms", "profiles", "modifiers", "contexts"];
  if (
    Object.keys(source).sort().join("\0") !== expectedKeys.sort().join("\0") ||
    expectedKeys.some((key) =>
      !Array.isArray(source[key]) ||
      (source[key] as unknown[]).some((entry) => !isPlainRecord(entry))
    )
  ) {
    fail(
      "SUBJECT_PRESET_PROMOTION_CATALOG_INVALID",
      "The Camera catalog requires algorithms, profiles, modifiers and contexts arrays.",
    );
  }
  const catalog = structuredClone(source) as unknown as CameraCatalogV1;
  const resources = [
    ...catalog.algorithms,
    ...catalog.profiles,
    ...catalog.modifiers,
    ...catalog.contexts,
  ];
  const refs = resources.map((resource) => resource.resourceRef);
  if (
    refs.some((resourceRef) => typeof resourceRef !== "string") ||
    new Set(refs).size !== refs.length
  ) {
    fail(
      "SUBJECT_PRESET_PROMOTION_VERSION_COLLISION",
      "The Camera catalog contains a duplicate or malformed resourceRef.",
    );
  }
  return catalog;
}

function nextVersion(
  catalog: readonly Record<string, unknown>[],
  id: string,
): number {
  const versions = catalog.flatMap((resource) =>
    resource.id === id && Number.isSafeInteger(resource.version)
      ? [resource.version as number]
      : []
  );
  return (versions.length === 0 ? 0 : Math.max(...versions)) + 1;
}

function resourceRef(kind: string, id: string, version: number): string {
  return `worldkit://${kind}/${id}@${version}`;
}

function subjectScopedId(subjectDefinitionId: string, role: string): string {
  return `subject.${subjectDefinitionId}.${role}`;
}

function cameraRole(profileId: string): string {
  const role = profileId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (role.length === 0) {
    fail(
      "SUBJECT_PRESET_PROMOTION_CAMERA_ID_INVALID",
      `Camera Profile id '${profileId}' cannot produce a subject-scoped role.`,
    );
  }
  return role;
}

function currentRegistryInputs(
  registry: SubjectResourceRegistryV3,
): SubjectRegistryResourceInputV3[] {
  const resources = [
    ...BUILT_IN_SUBJECT_DEFINITIONS,
    ...BUILT_IN_SUBJECT_RESOURCE_MANIFESTS,
    ...BUILT_IN_CAPABILITY_MANIFESTS,
    ...BUILT_IN_CAPABILITY_RESOURCES,
    ...registry.listCapabilitySubjectDefinitions(),
  ];
  const byRef = new Map<string, SubjectRegistryResourceInputV3>();
  for (const resource of resources) {
    byRef.set(
      resource.resourceRef,
      ("contentHash" in resource
        ? stripContentHash(resource as SubjectRegistryResourceV3)
        : structuredClone(resource)) as SubjectRegistryResourceInputV3,
    );
  }
  return [...byRef.values()];
}

function resolveResource(
  registry: SubjectResourceRegistryV3,
  resourceRefValue: string,
): SubjectRegistryResourceV3 | undefined {
  return [
    ...registry.listResources(),
    ...registry.listCapabilityResources(),
    ...registry.listCapabilitySubjectDefinitions(),
  ].find((resource) => resource.resourceRef === resourceRefValue);
}

function cloneControlFeelProfile(
  sourceRef: string,
  id: string,
  version: number,
  values: Readonly<Record<string, number>>,
  registry: SubjectResourceRegistryV3,
): ControlFeelProfileInputV1 {
  const source = registry.resolveControlFeelProfile(sourceRef);
  if (source === undefined) {
    fail("SUBJECT_PRESET_PROMOTION_SOURCE_DRIFT", `Missing Control Feel Profile '${sourceRef}'.`);
  }
  return {
    ...stripContentHash(source),
    id,
    version,
    resourceRef: resourceRef("control-feel-profile", id, version),
    ...values,
  } as ControlFeelProfileInputV1;
}

function cloneControlProfile(
  sourceRef: string,
  id: string,
  version: number,
  values: Readonly<Record<string, number>>,
  registry: SubjectResourceRegistryV3,
): ControlProfileInputV1 {
  const source = registry.resolveControlProfile(sourceRef);
  if (source === undefined) {
    fail("SUBJECT_PRESET_PROMOTION_SOURCE_DRIFT", `Missing Control Profile '${sourceRef}'.`);
  }
  return {
    ...stripContentHash(source),
    id,
    version,
    resourceRef: resourceRef("control-profile", id, version),
    ...values,
  } as ControlProfileInputV1;
}

function cloneCameraProfile(
  sourceRef: string,
  id: string,
  version: number,
  values: Readonly<Record<string, number>>,
  registry: SubjectResourceRegistryV3,
): CameraRigProfileInputV1 {
  const source = registry.resolveCameraRigProfile(sourceRef);
  if (source === undefined) {
    fail("SUBJECT_PRESET_PROMOTION_SOURCE_DRIFT", `Missing Camera Profile '${sourceRef}'.`);
  }
  return {
    ...stripContentHash(source),
    id,
    version,
    resourceRef: resourceRef("camera-profile", id, version),
    parameters: { ...source.parameters, ...values },
  } as CameraRigProfileInputV1;
}

interface MaterializedPromotion {
  generatedInputs: SubjectRegistryResourceInputV3[];
  generatedRegistry: SubjectResourceRegistryV3;
  generatedResources: SubjectPresetPromotionGeneratedResourceV1[];
  proposedDefinition: RegistrySubjectDefinitionInputV3;
  proposedDefinitionHash: string;
  changedCatalogs: Map<string, unknown>;
}

async function materializePromotion(
  candidate: SubjectPresetCandidateV1,
  repositoryRoot: string,
  registry: SubjectResourceRegistryV3,
): Promise<MaterializedPromotion> {
  const controlFeelCatalog = await readArrayCatalog(
    repositoryRoot,
    CATALOG_PATHS.controlFeel,
  );
  const controlCatalog = await readArrayCatalog(repositoryRoot, CATALOG_PATHS.control);
  const cameraCatalog = await readCameraCatalog(repositoryRoot);
  const cameraResources = [
    ...cameraCatalog.algorithms,
    ...cameraCatalog.profiles,
    ...cameraCatalog.modifiers,
    ...cameraCatalog.contexts,
  ];
  const definitionCatalog = await readArrayCatalog(repositoryRoot, CATALOG_PATHS.definitions);
  const defaultCatalog = await readDefaultCatalog(repositoryRoot);
  const baseDefinition = registry.resolveSubjectDefinition(
    candidate.semanticContent.base.subjectDefinitionRef,
  );
  if (
    baseDefinition === undefined ||
    !("schemaVersion" in baseDefinition) ||
    baseDefinition.schemaVersion !== 3
  ) {
    fail(
      "SUBJECT_PRESET_PROMOTION_SOURCE_DRIFT",
      "The candidate base Subject Definition is no longer a Registry V3 resource.",
    );
  }

  const generatedInputs: SubjectRegistryResourceInputV3[] = [];

  let controlFeelProfileRef = candidate.semanticContent.selections.controlFeel.profileRef;
  if (candidate.semanticContent.selections.controlFeel.disposition === "derive") {
    const id = subjectScopedId(candidate.semanticContent.subjectDefinitionId, "default");
    const version = nextVersion(controlFeelCatalog, id);
    const override = candidate.semanticContent.overrides.controlFeelByProfileRef[
      controlFeelProfileRef
    ];
    if (override === undefined) {
      fail(
        "SUBJECT_PRESET_PROMOTION_SOURCE_DRIFT",
        `Control Feel override '${controlFeelProfileRef}' is missing.`,
      );
    }
    const controlFeel = cloneControlFeelProfile(
      controlFeelProfileRef,
      id,
      version,
      override.values,
      registry,
    );
    generatedInputs.push(controlFeel);
    controlFeelProfileRef = controlFeel.resourceRef;
  }

  let controlProfileRef = candidate.semanticContent.selections.control.profileRef;
  if (candidate.semanticContent.selections.control.disposition === "derive") {
    const id = subjectScopedId(candidate.semanticContent.subjectDefinitionId, "default");
    const version = nextVersion(controlCatalog, id);
    const override = candidate.semanticContent.overrides.controlByProfileRef[controlProfileRef];
    if (override === undefined) {
      fail(
        "SUBJECT_PRESET_PROMOTION_SOURCE_DRIFT",
        `Control override '${controlProfileRef}' is missing.`,
      );
    }
    const control = cloneControlProfile(
      controlProfileRef,
      id,
      version,
      override.values,
      registry,
    );
    generatedInputs.push(control);
    controlProfileRef = control.resourceRef;
  }

  const cameraRefBySource = new Map<string, string>();
  const cameraIds = new Set<string>();
  for (const [sourceRef, decision] of Object.entries(
    candidate.semanticContent.overrides.cameraPublicationBySourceProfileRef,
  ).sort(([left], [right]) => left.localeCompare(right))) {
    if (decision.disposition === "preserve") {
      cameraRefBySource.set(sourceRef, sourceRef);
      continue;
    }
    const source = registry.resolveCameraRigProfile(sourceRef);
    const override = candidate.semanticContent.overrides.cameraByProfileRef[sourceRef];
    if (source === undefined || override === undefined) {
      fail(
        "SUBJECT_PRESET_PROMOTION_SOURCE_DRIFT",
        `Derived Camera Profile '${sourceRef}' is missing.`,
      );
    }
    const id = subjectScopedId(
      candidate.semanticContent.subjectDefinitionId,
      cameraRole(source.id),
    );
    if (cameraIds.has(id)) {
      fail(
        "SUBJECT_PRESET_PROMOTION_VERSION_COLLISION",
        `Camera publication id '${id}' is duplicated.`,
      );
    }
    cameraIds.add(id);
    const version = nextVersion(cameraResources, id);
    const camera = cloneCameraProfile(
      sourceRef,
      id,
      version,
      override.values,
      registry,
    );
    generatedInputs.push(camera);
    cameraRefBySource.set(sourceRef, camera.resourceRef);
  }

  const sourceContext = registry.resolveCameraContextProfile(
    candidate.semanticContent.selections.cameraContextProfileRef,
  );
  if (sourceContext === undefined) {
    fail(
      "SUBJECT_PRESET_PROMOTION_SOURCE_DRIFT",
      `Camera Context '${candidate.semanticContent.selections.cameraContextProfileRef}' is missing.`,
    );
  }
  const contextId = subjectScopedId(
    candidate.semanticContent.subjectDefinitionId,
    "default",
  );
  const contextVersion = nextVersion(cameraResources, contextId);
  const rewriteCameraRef = (sourceRef: string): string => {
    const rewritten = cameraRefBySource.get(sourceRef);
    if (rewritten === undefined) {
      fail(
        "SUBJECT_PRESET_PROMOTION_SOURCE_DRIFT",
        `Camera Profile '${sourceRef}' has no publication decision.`,
      );
    }
    return rewritten;
  };
  const cameraContext: CameraContextProfileInputV1 = {
    ...stripContentHash(sourceContext),
    id: contextId,
    version: contextVersion,
    resourceRef: resourceRef("camera-context", contextId, contextVersion),
    defaultCameraRigProfileRef: rewriteCameraRef(
      candidate.semanticContent.selections.defaultCameraRigProfileRef,
    ),
    ...(sourceContext.firstPersonCameraRigProfileRef === undefined
      ? {}
      : {
          firstPersonCameraRigProfileRef: rewriteCameraRef(
            sourceContext.firstPersonCameraRigProfileRef,
          ),
        }),
    rules: sourceContext.rules.map((rule) => ({
      ...structuredClone(rule),
      ...(rule.cameraRigProfileRef === undefined
        ? {}
        : { cameraRigProfileRef: rewriteCameraRef(rule.cameraRigProfileRef) }),
    })),
  };
  generatedInputs.push(cameraContext);

  const definitionVersion = nextVersion(
    definitionCatalog,
    candidate.semanticContent.subjectDefinitionId,
  );
  if (
    candidate.semanticContent.selections.selectedMotionProfileRef ===
      candidate.semanticContent.selections.motionRoles.fallback.sourceProfileRef
  ) {
    fail(
      "SUBJECT_PRESET_PROMOTION_FALLBACK_DEFAULT_FORBIDDEN",
      "Safe-stop fallback Motion cannot be published as the next Definition default.",
    );
  }
  const proposedDefinition: RegistrySubjectDefinitionInputV3 = {
    ...stripContentHash(baseDefinition),
    version: definitionVersion,
    resourceRef: resourceRef(
      "subject-definition",
      candidate.semanticContent.subjectDefinitionId,
      definitionVersion,
    ),
    profiles: {
      ...structuredClone(baseDefinition.profiles),
      motion: {
        defaultMotionProfileRef:
          candidate.semanticContent.selections.selectedMotionProfileRef,
        optionalMotionProfileRefs:
          candidate.semanticContent.selections.motionRoles.optional.map(
            (role) => role.sourceProfileRef,
          ),
        fallbackMotionProfileRef:
          candidate.semanticContent.selections.motionRoles.fallback.sourceProfileRef,
      },
      controlFeelProfileRef,
      allowedControlFeelProfileRefs: (() => {
        const sourceFeelRef = candidate.semanticContent.selections.controlFeel.profileRef;
        const rewritten = baseDefinition.profiles.allowedControlFeelProfileRefs.map(
          (resourceRef) => resourceRef === sourceFeelRef ? controlFeelProfileRef : resourceRef,
        );
        return rewritten.includes(controlFeelProfileRef)
          ? rewritten
          : [...rewritten, controlFeelProfileRef];
      })(),
      controlProfileRef,
      cameraContextProfileRef: cameraContext.resourceRef,
    },
  };
  generatedInputs.push(proposedDefinition);

  const generatedRegistry = createSubjectResourceRegistry([
    ...currentRegistryInputs(registry),
    ...generatedInputs,
  ]);
  const generatedResources = generatedInputs.map((input) => {
    const resource = resolveResource(generatedRegistry, input.resourceRef);
    if (resource === undefined) {
      return fail(
        "SUBJECT_PRESET_PROMOTION_REGISTRY_INVALID",
        `Generated resource '${input.resourceRef}' did not enter the Registry.`,
      );
    }
    return {
      resourceKind: resource.kind,
      resourceRef: resource.resourceRef,
      contentHash: resource.contentHash,
    };
  }).sort((left, right) => left.resourceRef.localeCompare(right.resourceRef));
  const lockedDefinition = generatedRegistry.resolveSubjectDefinition(
    proposedDefinition.resourceRef,
  );
  if (
    lockedDefinition === undefined ||
    !("schemaVersion" in lockedDefinition) ||
    lockedDefinition.schemaVersion !== 3
  ) {
    fail(
      "SUBJECT_PRESET_PROMOTION_REGISTRY_INVALID",
      "The proposed Subject Definition did not validate.",
    );
  }

  const changedCatalogs = new Map<string, unknown>();
  const generatedControlFeel = generatedInputs.filter((resource) =>
    resource.kind === "control-feel-profile"
  );
  if (generatedControlFeel.length > 0) {
    changedCatalogs.set(CATALOG_PATHS.controlFeel, [
      ...controlFeelCatalog,
      ...generatedControlFeel,
    ].sort((left, right) =>
      String(left.resourceRef).localeCompare(String(right.resourceRef))
    ));
  }
  const generatedControl = generatedInputs.filter((resource) =>
    resource.kind === "control-profile"
  );
  if (generatedControl.length > 0) {
    changedCatalogs.set(CATALOG_PATHS.control, [
      ...controlCatalog,
      ...generatedControl,
    ].sort((left, right) =>
      String(left.resourceRef).localeCompare(String(right.resourceRef))
    ));
  }
  const generatedCamera = generatedInputs.filter((resource) =>
    resource.kind === "camera-rig-profile" || resource.kind === "camera-context-profile"
  );
  changedCatalogs.set(CATALOG_PATHS.camera, {
    algorithms: cameraCatalog.algorithms,
    profiles: [
      ...cameraCatalog.profiles,
      ...generatedCamera.filter((resource) =>
        resource.kind === "camera-rig-profile"
      ) as unknown as Record<string, unknown>[],
    ].sort((left, right) =>
      String(left.resourceRef).localeCompare(String(right.resourceRef))
    ),
    modifiers: cameraCatalog.modifiers,
    contexts: [
      ...cameraCatalog.contexts,
      ...generatedCamera.filter((resource) =>
        resource.kind === "camera-context-profile"
      ) as unknown as Record<string, unknown>[],
    ].sort((left, right) =>
      String(left.resourceRef).localeCompare(String(right.resourceRef))
    ),
  } satisfies CameraCatalogV1);
  changedCatalogs.set(CATALOG_PATHS.definitions, [
    ...definitionCatalog,
    proposedDefinition,
  ].sort((left, right) =>
    String(left.resourceRef).localeCompare(String(right.resourceRef))
  ));

  const defaultEntry = {
    subjectDefinitionId: candidate.semanticContent.subjectDefinitionId,
    subjectDefinitionRef: lockedDefinition.resourceRef,
    subjectDefinitionContentHash: lockedDefinition.contentHash,
  };
  const nextDefaultCatalog: SubjectDefaultCatalogV1 = {
    schemaVersion: 1,
    defaults: [
      ...defaultCatalog.defaults.filter((entry) =>
        entry.subjectDefinitionId !== defaultEntry.subjectDefinitionId
      ),
      defaultEntry,
    ].sort((left, right) =>
      left.subjectDefinitionId.localeCompare(right.subjectDefinitionId)
    ),
  };
  createSubjectDefaultRegistryV1(nextDefaultCatalog, generatedRegistry);
  changedCatalogs.set(CATALOG_PATHS.defaults, nextDefaultCatalog);

  return {
    generatedInputs,
    generatedRegistry,
    generatedResources,
    proposedDefinition,
    proposedDefinitionHash: lockedDefinition.contentHash,
    changedCatalogs,
  };
}

async function makeTarget(
  repositoryRoot: string,
  logicalPath: string,
  value: unknown,
): Promise<SubjectPresetPromotionTargetV1> {
  const postBytes = canonicalBytes(value);
  let preimageSha256: string | null;
  try {
    preimageSha256 = sha256Bytes(
      await readFile(targetAbsolutePath(repositoryRoot, logicalPath)),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    preimageSha256 = null;
  }
  return {
    logicalPath,
    preimageSha256,
    postimageSha256: sha256Bytes(postBytes),
    canonicalBytesBase64: postBytes.toString("base64"),
  };
}

function hashPlan(
  plan: Omit<SubjectPresetPromotionPlanV1, "planHash">,
): string {
  return sha256CanonicalJson(plan);
}

export async function planSubjectPresetPromotion(
  candidatePath: string,
  options: SubjectPresetPromotionPlanningOptionsV1,
): Promise<SubjectPresetPromotionPlanV1> {
  const repositoryRoot = exactRepositoryRoot(options.repositoryRoot);
  assertSubjectPresetArtifactLocationV1(candidatePath, repositoryRoot);
  const registry = options.registry ?? builtInSubjectResourceRegistry;
  const candidate = options.candidate ??
    await validateSubjectPresetCandidateFile(candidatePath, { registry });
  const materialized = await materializePromotion(candidate, repositoryRoot, registry);
  const fixtureLogicalPath =
    `.codex-tmp/subject-presets/${candidate.semanticContent.candidateId}.registry-fixture.json`;
  const harnessProfile = registry.resolveHarnessProfile(
    candidate.evidence.harnessProfileRef,
  );
  if (isNil(harnessProfile)) {
    fail(
      "SUBJECT_PRESET_PROMOTION_HARNESS_MISSING",
      `Harness Profile '${candidate.evidence.harnessProfileRef}' is missing.`,
    );
  }
  const fixture = {
    kind: PROMOTION_FIXTURE_KIND,
    schemaVersion: 1,
    candidateId: candidate.semanticContent.candidateId,
    candidateSemanticContentHash: candidate.semanticContentHash,
    baseSubjectDefinitionRef: candidate.semanticContent.base.subjectDefinitionRef,
    subjectDefinitionRef: materialized.proposedDefinition.resourceRef,
    subjectDefinitionContentHash: materialized.proposedDefinitionHash,
    generatedResources: materialized.generatedResources,
    harness: {
      harnessProfileRef: harnessProfile.resourceRef,
      requiredPassedCheckIds: [...harnessProfile.requiredCheckIds],
    },
  };
  const targets = [
    await makeTarget(repositoryRoot, fixtureLogicalPath, fixture),
    ...await Promise.all([...materialized.changedCatalogs.entries()].map(
      ([logicalPath, value]) => makeTarget(repositoryRoot, logicalPath, value),
    )),
  ].sort((left, right) => left.logicalPath.localeCompare(right.logicalPath));
  const hashInput: Omit<SubjectPresetPromotionPlanV1, "planHash"> = {
    kind: PROMOTION_PLAN_KIND,
    schemaVersion: 1,
    candidateId: candidate.semanticContent.candidateId,
    candidateSemanticContentHash: candidate.semanticContentHash,
    baseSubjectDefinitionRef: candidate.semanticContent.base.subjectDefinitionRef,
    proposedSubjectDefinitionRef: materialized.proposedDefinition.resourceRef,
    proposedSubjectDefinitionContentHash: materialized.proposedDefinitionHash,
    generatedResources: materialized.generatedResources,
    targets,
  };
  return { ...hashInput, planHash: hashPlan(hashInput) };
}

function assertExactKeys(
  source: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const keys = Object.keys(source).sort();
  const sortedExpected = [...expected].sort();
  if (
    keys.length !== sortedExpected.length ||
    keys.some((key, index) => key !== sortedExpected[index])
  ) {
    fail(
      "SUBJECT_PRESET_PROMOTION_PLAN_INVALID",
      `${label} does not match promotion plan schema V1.`,
    );
  }
}

export function parseSubjectPresetPromotionPlanV1(
  input: unknown,
): SubjectPresetPromotionPlanV1 {
  if (!isPlainRecord(input)) {
    fail("SUBJECT_PRESET_PROMOTION_PLAN_INVALID", "Promotion plan must be an object.");
  }
  assertExactKeys(input, [
    "kind",
    "schemaVersion",
    "candidateId",
    "candidateSemanticContentHash",
    "baseSubjectDefinitionRef",
    "proposedSubjectDefinitionRef",
    "proposedSubjectDefinitionContentHash",
    "generatedResources",
    "targets",
    "planHash",
  ], "Promotion plan");
  if (
    input.kind !== PROMOTION_PLAN_KIND ||
    input.schemaVersion !== 1 ||
    typeof input.candidateId !== "string" ||
    typeof input.candidateSemanticContentHash !== "string" ||
    typeof input.baseSubjectDefinitionRef !== "string" ||
    typeof input.proposedSubjectDefinitionRef !== "string" ||
    typeof input.proposedSubjectDefinitionContentHash !== "string" ||
    !Array.isArray(input.generatedResources) ||
    !Array.isArray(input.targets) ||
    typeof input.planHash !== "string"
  ) {
    fail("SUBJECT_PRESET_PROMOTION_PLAN_INVALID", "Promotion plan fields are malformed.");
  }
  const plan = structuredClone(input) as unknown as SubjectPresetPromotionPlanV1;
  for (const hash of [
    plan.candidateSemanticContentHash,
    plan.proposedSubjectDefinitionContentHash,
    plan.planHash,
  ]) {
    if (!HASH_PATTERN.test(hash)) {
      fail("SUBJECT_PRESET_PROMOTION_PLAN_INVALID", "Promotion plan contains an invalid hash.");
    }
  }
  for (const generated of plan.generatedResources) {
    if (!isPlainRecord(generated)) {
      fail("SUBJECT_PRESET_PROMOTION_PLAN_INVALID", "Generated resource summary is invalid.");
    }
    assertExactKeys(
      generated,
      ["resourceKind", "resourceRef", "contentHash"],
      "Generated resource summary",
    );
    if (
      typeof generated.resourceKind !== "string" ||
      typeof generated.resourceRef !== "string" ||
      !HASH_PATTERN.test(generated.contentHash)
    ) {
      fail("SUBJECT_PRESET_PROMOTION_PLAN_INVALID", "Generated resource summary is malformed.");
    }
  }
  if (
    new Set(plan.generatedResources.map((resource) => resource.resourceRef)).size !==
      plan.generatedResources.length
  ) {
    fail(
      "SUBJECT_PRESET_PROMOTION_VERSION_COLLISION",
      "Promotion plan repeats a generated resource version.",
    );
  }
  for (const target of plan.targets) {
    if (!isPlainRecord(target)) {
      fail("SUBJECT_PRESET_PROMOTION_PLAN_INVALID", "Promotion target is invalid.");
    }
    assertExactKeys(
      target,
      ["logicalPath", "preimageSha256", "postimageSha256", "canonicalBytesBase64"],
      "Promotion target",
    );
    if (
      typeof target.logicalPath !== "string" ||
      (target.preimageSha256 !== null &&
        (typeof target.preimageSha256 !== "string" ||
          !HASH_PATTERN.test(target.preimageSha256))) ||
      typeof target.postimageSha256 !== "string" ||
      !HASH_PATTERN.test(target.postimageSha256) ||
      typeof target.canonicalBytesBase64 !== "string"
    ) {
      fail("SUBJECT_PRESET_PROMOTION_PLAN_INVALID", "Promotion target fields are malformed.");
    }
    normalizedLogicalPath(target.logicalPath, plan.candidateId);
    const bytes = Buffer.from(target.canonicalBytesBase64, "base64");
    if (sha256Bytes(bytes) !== target.postimageSha256) {
      fail(
        "SUBJECT_PRESET_PROMOTION_POSTIMAGE_MISMATCH",
        `Postimage bytes for '${target.logicalPath}' do not match their hash.`,
      );
    }
  }
  if (
    new Set(plan.targets.map((target) => target.logicalPath)).size !== plan.targets.length
  ) {
    fail("SUBJECT_PRESET_PROMOTION_PLAN_INVALID", "Promotion target paths must be unique.");
  }
  const { planHash, ...hashInput } = plan;
  if (hashPlan(hashInput) !== planHash) {
    fail(
      "SUBJECT_PRESET_PROMOTION_PLAN_HASH_MISMATCH",
      "Promotion plan hash does not match canonical plan content.",
    );
  }
  return plan;
}

export async function readSubjectPresetPromotionPlanFileV1(
  planPath: string,
): Promise<SubjectPresetPromotionPlanV1> {
  const bytes = await readFile(planPath);
  if (bytes.byteLength > 16 * 1024 * 1024) {
    fail(
      "SUBJECT_PRESET_PROMOTION_PLAN_TOO_LARGE",
      "Promotion plan files may not exceed 16 MiB.",
    );
  }
  return parseSubjectPresetPromotionPlanV1(
    parseJsonBytes(bytes, "Subject Preset promotion plan"),
  );
}

export async function readSubjectPresetHarnessReceiptFileV1(
  receiptPath: string,
): Promise<unknown> {
  const bytes = await readFile(receiptPath);
  if (bytes.byteLength > 1024 * 1024) {
    fail(
      "SUBJECT_PRESET_HARNESS_RECEIPT_TOO_LARGE",
      "Harness receipt files may not exceed 1 MiB.",
    );
  }
  return parseJsonBytes(bytes, "Subject Preset Harness receipt");
}

function assertNoProposedVersionCollisions(plan: SubjectPresetPromotionPlanV1): void {
  for (const target of plan.targets) {
    if (!STATIC_TARGET_PATHS.has(target.logicalPath)) continue;
    const value = parseJsonBytes(
      Buffer.from(target.canonicalBytesBase64, "base64"),
      `planned '${target.logicalPath}'`,
    );
    const resources = Array.isArray(value)
      ? value
      : target.logicalPath === CATALOG_PATHS.camera && isPlainRecord(value)
        ? ["algorithms", "profiles", "modifiers", "contexts"].flatMap((key) =>
            Array.isArray(value[key]) ? value[key] as unknown[] : []
          )
        : [];
    const refs = resources.flatMap((entry) =>
      isPlainRecord(entry) && typeof entry.resourceRef === "string"
        ? [entry.resourceRef]
        : []
    );
    if (new Set(refs).size !== refs.length) {
      fail(
        "SUBJECT_PRESET_PROMOTION_VERSION_COLLISION",
        `Planned catalog '${target.logicalPath}' repeats a resource version.`,
      );
    }
  }
}

async function assertPreimagesCurrent(
  plan: SubjectPresetPromotionPlanV1,
  repositoryRoot: string,
): Promise<void> {
  for (const target of plan.targets) {
    const targetPath = targetAbsolutePath(repositoryRoot, target.logicalPath);
    let currentHash: string | null;
    try {
      currentHash = sha256Bytes(await readFile(targetPath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      currentHash = null;
    }
    if (currentHash !== target.preimageSha256) {
      fail(
        "SUBJECT_PRESET_PROMOTION_STALE_PREIMAGE",
        `Target '${target.logicalPath}' changed after the plan was created.`,
      );
    }
  }
}

async function assertNoSymlinkComponents(
  repositoryRoot: string,
  logicalPath: string,
): Promise<void> {
  let current = repositoryRoot;
  const components = logicalPath.split("/");
  for (const component of components) {
    current = path.join(current, component);
    try {
      const status = await lstat(current);
      if (status.isSymbolicLink()) {
        fail(
          "SUBJECT_PRESET_PROMOTION_SYMLINK_TARGET",
          `Target '${logicalPath}' traverses symlink '${current}'.`,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
}

interface GitState {
  repositoryRoot: string;
  headCommit: string;
  branch: string;
}

async function inspectGitState(repositoryRoot: string): Promise<GitState> {
  let discoveredRoot: string;
  let headCommit: string;
  let branch: string;
  try {
    ({ stdout: discoveredRoot } = await execFile(
      "git",
      ["-C", repositoryRoot, "rev-parse", "--show-toplevel"],
    ));
  } catch {
    return fail(
      "SUBJECT_PRESET_PROMOTION_NOT_A_REPOSITORY",
      "Promotion requires a known Git repository.",
    );
  }
  const [normalizedDiscoveredRoot, normalizedRepositoryRoot] = await Promise.all([
    realpath(path.resolve(discoveredRoot.trim())),
    realpath(repositoryRoot),
  ]);
  if (normalizedDiscoveredRoot.toLowerCase() !== normalizedRepositoryRoot.toLowerCase()) {
    fail(
      "SUBJECT_PRESET_PROMOTION_REPOSITORY_ROOT_MISMATCH",
      "Promotion repositoryRoot must be the exact Git worktree root.",
    );
  }
  try {
    ({ stdout: headCommit } = await execFile(
      "git",
      ["-C", repositoryRoot, "rev-parse", "--verify", "HEAD"],
    ));
  } catch {
    return fail(
      "SUBJECT_PRESET_PROMOTION_UNBORN_BRANCH",
      "Promotion is forbidden on an unborn branch.",
    );
  }
  try {
    ({ stdout: branch } = await execFile(
      "git",
      ["-C", repositoryRoot, "symbolic-ref", "--quiet", "--short", "HEAD"],
    ));
  } catch {
    return fail(
      "SUBJECT_PRESET_PROMOTION_DETACHED_HEAD",
      "Promotion is forbidden from detached HEAD.",
    );
  }
  if (branch.trim() === "main") {
    fail(
      "SUBJECT_PRESET_PROMOTION_MAIN_FORBIDDEN",
      "Promotion must run on a reviewed feature branch, never main.",
    );
  }
  const { stdout: status } = await execFile(
    "git",
    ["-C", repositoryRoot, "status", "--porcelain", "--untracked-files=no"],
  );
  if (status.trim().length > 0) {
    fail(
      "SUBJECT_PRESET_PROMOTION_DIRTY_WORKTREE",
      "Tracked worktree changes must be committed or removed before promotion.",
    );
  }
  return {
    repositoryRoot: normalizedDiscoveredRoot,
    headCommit: headCommit.trim(),
    branch: branch.trim(),
  };
}

function assertSameGitState(before: GitState, after: GitState): void {
  if (
    before.repositoryRoot.toLowerCase() !== after.repositoryRoot.toLowerCase() ||
    before.headCommit !== after.headCommit ||
    before.branch !== after.branch
  ) {
    fail(
      "SUBJECT_PRESET_PROMOTION_GIT_STATE_CHANGED",
      "Git HEAD or branch changed while promotion was being prepared.",
    );
  }
}

interface TransactionEntry {
  target: SubjectPresetPromotionTargetV1;
  targetPath: string;
  tempPath: string;
  backupPath: string;
  existed: boolean;
  backupCreated: boolean;
  published: boolean;
}

async function promoteTargetsTransactionally(
  plan: SubjectPresetPromotionPlanV1,
  repositoryRoot: string,
  expectedGitState: GitState,
  options: Pick<SubjectPresetPromotionOptionsV1, "injectFailure">,
): Promise<void> {
  const transactionId = randomUUID();
  const publishOrder = [...plan.targets].sort((left, right) => {
    if (left.logicalPath === CATALOG_PATHS.defaults) return 1;
    if (right.logicalPath === CATALOG_PATHS.defaults) return -1;
    return left.logicalPath.localeCompare(right.logicalPath);
  });
  const entries: TransactionEntry[] = [];
  for (const target of publishOrder) {
    const targetPath = targetAbsolutePath(repositoryRoot, target.logicalPath);
    if (
      path.parse(targetPath).root.toLowerCase() !==
        path.parse(repositoryRoot).root.toLowerCase()
    ) {
      fail(
        "SUBJECT_PRESET_PROMOTION_VOLUME_MISMATCH",
        `Target '${target.logicalPath}' is not on the repository volume.`,
      );
    }
    await mkdir(path.dirname(targetPath), { recursive: true });
    let existed = false;
    try {
      const status = await lstat(targetPath);
      if (!status.isFile()) {
        fail(
          "SUBJECT_PRESET_PROMOTION_TARGET_NOT_FILE",
          `Target '${target.logicalPath}' is not a regular file.`,
        );
      }
      existed = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const prefix = `.${path.basename(targetPath)}.worldkit-${transactionId}`;
    entries.push({
      target,
      targetPath,
      tempPath: path.join(path.dirname(targetPath), `${prefix}.tmp`),
      backupPath: path.join(path.dirname(targetPath), `${prefix}.bak`),
      existed,
      backupCreated: false,
      published: false,
    });
  }

  const cleanup = async (): Promise<void> => {
    for (const entry of entries) {
      await rm(entry.tempPath, { force: true });
      await rm(entry.backupPath, { force: true });
    }
  };
  const rollback = async (): Promise<void> => {
    const errors: unknown[] = [];
    for (const entry of [...entries].reverse()) {
      try {
        if (entry.published) await rm(entry.targetPath, { force: true });
        if (entry.backupCreated) await rename(entry.backupPath, entry.targetPath);
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Subject Preset promotion rollback failed.");
    }
  };

  let committed = false;
  try {
    for (const entry of entries) {
      await options.injectFailure?.({
        phase: "before-temp-write",
        logicalPath: entry.target.logicalPath,
      });
      const handle = await open(entry.tempPath, "wx");
      try {
        await handle.writeFile(
          Buffer.from(entry.target.canonicalBytesBase64, "base64"),
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
    }

    assertSameGitState(expectedGitState, await inspectGitState(repositoryRoot));

    for (const entry of entries) {
      if (!entry.existed) continue;
      await options.injectFailure?.({
        phase: "before-backup-rename",
        logicalPath: entry.target.logicalPath,
      });
      await rename(entry.targetPath, entry.backupPath);
      entry.backupCreated = true;
    }
    for (const entry of entries) {
      await options.injectFailure?.({
        phase: "before-publish-rename",
        logicalPath: entry.target.logicalPath,
      });
      await rename(entry.tempPath, entry.targetPath);
      entry.published = true;
      if (entry.target.logicalPath === CATALOG_PATHS.defaults) committed = true;
    }
  } catch (error) {
    if (!committed) {
      try {
        await rollback();
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Subject Preset promotion failed and could not be rolled back.",
        );
      }
    }
    throw error;
  }
  await cleanup();
}

export async function promoteSubjectPresetTransactionally(
  candidatePath: string,
  options: SubjectPresetPromotionOptionsV1,
): Promise<SubjectPresetPromotionResultV1> {
  if (!options.write) {
    fail(
      "SUBJECT_PRESET_PROMOTION_WRITE_REQUIRED",
      "Promotion requires an explicit --write flag.",
    );
  }
  if (isNil(options.harnessReceipt)) {
    fail(
      "SUBJECT_PRESET_PROMOTION_HARNESS_RECEIPT_REQUIRED",
      "Promotion requires a trusted Candidate-specific Harness receipt.",
    );
  }
  const repositoryRoot = exactRepositoryRoot(options.repositoryRoot);
  assertSubjectPresetArtifactLocationV1(candidatePath, repositoryRoot);
  if (options.planPath !== undefined) {
    assertSubjectPresetArtifactLocationV1(options.planPath, repositoryRoot);
  }
  if (!isNil(options.harnessReceiptPath)) {
    assertSubjectPresetArtifactLocationV1(
      options.harnessReceiptPath,
      repositoryRoot,
    );
  }
  const plan = parseSubjectPresetPromotionPlanV1(options.plan);
  assertNoProposedVersionCollisions(plan);
  for (const target of plan.targets) {
    await assertNoSymlinkComponents(repositoryRoot, target.logicalPath);
  }
  const gitState = await inspectGitState(repositoryRoot);
  await assertPreimagesCurrent(plan, repositoryRoot);

  const registry = options.registry ?? builtInSubjectResourceRegistry;
  for (const generated of plan.generatedResources) {
    if (resolveResource(registry, generated.resourceRef) !== undefined) {
      fail(
        "SUBJECT_PRESET_PROMOTION_VERSION_COLLISION",
        `Generated resource version '${generated.resourceRef}' already exists.`,
      );
    }
  }
  const candidate = options.candidate ??
    await validateSubjectPresetCandidateFile(candidatePath, { registry });
  if (candidate.provenance.sourceCommit !== gitState.headCommit) {
    fail(
      "SUBJECT_PRESET_PROMOTION_SOURCE_COMMIT_MISMATCH",
      "Candidate sourceCommit must match the exact clean feature-branch HEAD.",
    );
  }
  if (
    plan.candidateId !== candidate.semanticContent.candidateId ||
    plan.candidateSemanticContentHash !== candidate.semanticContentHash
  ) {
    fail(
      "SUBJECT_PRESET_PROMOTION_PLAN_CANDIDATE_MISMATCH",
      "Promotion plan was created for a different candidate.",
    );
  }
  const freshPlan = await planSubjectPresetPromotion(candidatePath, {
    repositoryRoot,
    registry,
    candidate,
  });
  if (freshPlan.planHash !== plan.planHash) {
    fail(
      "SUBJECT_PRESET_PROMOTION_PLAN_HASH_MISMATCH",
      "Promotion plan no longer matches deterministic Registry materialization.",
    );
  }
  const harnessProfile = registry.resolveHarnessProfile(
    candidate.evidence.harnessProfileRef,
  );
  if (isNil(harnessProfile)) {
    fail(
      "SUBJECT_PRESET_PROMOTION_HARNESS_MISSING",
      `Harness Profile '${candidate.evidence.harnessProfileRef}' is missing.`,
    );
  }
  validateSubjectPresetHarnessReceiptV1(options.harnessReceipt, {
    candidateSemanticContentHash: candidate.semanticContentHash,
    planHash: plan.planHash,
    harnessProfileRef: harnessProfile.resourceRef,
    requiredPassedCheckIds: harnessProfile.requiredCheckIds,
    sourceCommit: candidate.provenance.sourceCommit,
    runtimeBuild: `git:${gitState.headCommit}`,
  });
  assertSameGitState(gitState, await inspectGitState(repositoryRoot));
  await promoteTargetsTransactionally(plan, repositoryRoot, gitState, options);
  return {
    planHash: plan.planHash,
    writtenLogicalPaths: plan.targets.map((target) => target.logicalPath),
  };
}
