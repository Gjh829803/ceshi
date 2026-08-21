import {
  CONTROL_FEEL_PARAMETER_NAMES_V1,
  isCameraRigParameterOverrideSupportedV1,
  isCameraTuningParameterNameV1,
  resolveControlFeelParametersV1,
  validateCameraTuningV1,
  type NumericProfileOverrideV1,
} from "@whitebox-world/runtime-contracts";
import {
  builtInSubjectResourceRegistry,
  resolveSubjectPresetClosureV1,
  selectableControlFeelProfileRefsV1,
  type CameraRigProfileV1,
  type ControlFeelProfileV1,
  type ControlProfileV1,
  type MotionProfileV1,
  type RegistrySubjectDefinitionV3,
  type SubjectPresetClosureV1,
  type SubjectPresetResourceLockEntryV1,
  type SubjectResourceRegistryV3,
} from "@whitebox-world/subject-registry";
import { isNil } from "lodash-es";

import { sha256CanonicalJson } from "./canonical-json";

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const FORGED_ZERO_SOURCE_COMMIT = "0".repeat(40);
const CANDIDATE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const RUNTIME_BUILD_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._+@:/-]{0,255}$/;
const HARNESS_CHECK_PATTERN = /^H0[1-9]$/;

export type SubjectPresetPublicationDispositionV1 = "derive" | "preserve";

export interface MotionPublicationRoleV1 {
  sourceProfileRef: string;
  sourceContentHash: string;
  disposition: SubjectPresetPublicationDispositionV1;
}

export interface CameraPublicationDecisionV1 {
  sourceContentHash: string;
  disposition: SubjectPresetPublicationDispositionV1;
}

export interface SubjectPresetSemanticContentV1 {
  candidateId: string;
  subjectDefinitionId: string;
  base: {
    subjectDefinitionRef: string;
    subjectDefinitionContentHash: string;
    registryLock: readonly SubjectPresetResourceLockEntryV1[];
    registryLockHash: string;
  };
  selections: {
    motionRoles: {
      default: MotionPublicationRoleV1;
      optional: MotionPublicationRoleV1[];
      fallback: MotionPublicationRoleV1;
    };
    selectedMotionProfileRef: string;
    selectedMotionContentHash: string;
    controlFeel: {
      profileRef: string;
      contentHash: string;
      disposition: SubjectPresetPublicationDispositionV1;
    };
    control: {
      profileRef: string;
      contentHash: string;
      disposition: SubjectPresetPublicationDispositionV1;
    };
    cameraContextProfileRef: string;
    defaultCameraRigProfileRef: string;
  };
  overrides: {
    controlFeelByProfileRef: Record<string, NumericProfileOverrideV1>;
    controlByProfileRef: Record<string, NumericProfileOverrideV1>;
    cameraByProfileRef: Record<string, NumericProfileOverrideV1>;
    cameraPublicationBySourceProfileRef: Record<
      string,
      CameraPublicationDecisionV1
    >;
  };
  publication: {
    mode: "subject-scoped-derivatives";
    publicDefaultEnabled: true;
  };
}

export interface SubjectPresetCandidateV1 {
  kind: "worldkit-subject-preset-candidate";
  schemaVersion: 1;
  semanticContent: SubjectPresetSemanticContentV1;
  provenance: {
    displayName: string;
    notes: string;
    createdAtIso: string;
    sourceCommit: string;
  };
  evidence: {
    harnessProfileRef: string;
    passedCheckIds: string[];
    runtimeBuild: string;
  };
  semanticContentHash: string;
}

export type SubjectPresetCandidateInputV1 = Omit<
  SubjectPresetCandidateV1,
  "semanticContentHash"
>;

export interface LegacyAuthoringSnapshotV4ImportOptionsV1 {
  candidateId: string;
  displayName: string;
  notes: string;
  createdAtIso: string;
  sourceCommit: string;
  runtimeBuild: string;
  passedCheckIds?: readonly string[];
  registry?: SubjectResourceRegistryV3;
}

function fail(code: string, message: string): never {
  throw new TypeError(`${code}: ${message}`);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    return fail("SUBJECT_PRESET_CANDIDATE_INVALID_SHAPE", `${path} must be a plain object.`);
  }
  return value;
}

function exactKeys(
  source: Record<string, unknown>,
  required: readonly string[],
  path: string,
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(source).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_UNKNOWN_FIELD",
      `${path}.${unknown} is not part of schema V1.`,
    );
  }
  const missing = required.find((key) => !Object.prototype.hasOwnProperty.call(source, key));
  if (missing !== undefined) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_INVALID_SHAPE",
      `${path}.${missing} is required.`,
    );
  }
}

function stringValue(
  value: unknown,
  path: string,
  options: { allowEmpty?: boolean; maximumLength?: number } = {},
): string {
  if (
    typeof value !== "string" ||
    (!options.allowEmpty && value.length === 0) ||
    (options.maximumLength !== undefined && value.length > options.maximumLength) ||
    (typeof value === "string" && !isWellFormedUnicode(value))
  ) {
    fail("SUBJECT_PRESET_CANDIDATE_INVALID_STRING", `${path} is invalid.`);
  }
  return value;
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function exactHash(value: unknown, path: string): string {
  const hash = stringValue(value, path);
  if (!SHA256_PATTERN.test(hash)) {
    fail("SUBJECT_PRESET_CANDIDATE_INVALID_HASH", `${path} must be an exact SHA-256 hash.`);
  }
  return hash;
}

function disposition(value: unknown, path: string): SubjectPresetPublicationDispositionV1 {
  if (value !== "derive" && value !== "preserve") {
    fail("SUBJECT_PRESET_CANDIDATE_INVALID_DISPOSITION", `${path} is invalid.`);
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function candidateSubject(
  registry: SubjectResourceRegistryV3,
  subjectDefinitionRef: string,
): { definition: RegistrySubjectDefinitionV3; closure: SubjectPresetClosureV1 } {
  if (subjectDefinitionRef.includes("/playground-preview.")) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_PREVIEW_CLONE",
      "Playground relationship-preview Subject Definitions are not publishable.",
    );
  }
  const definition = registry.resolveSubjectDefinition(subjectDefinitionRef);
  if (
    definition === undefined ||
    !("schemaVersion" in definition) ||
    definition.schemaVersion !== 3
  ) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_SOURCE_DRIFT",
      `Subject Definition '${subjectDefinitionRef}' is not an exact Registry V3 resource.`,
    );
  }
  try {
    return {
      definition,
      closure: resolveSubjectPresetClosureV1(registry, subjectDefinitionRef),
    };
  } catch (error) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_SOURCE_DRIFT",
      error instanceof Error ? error.message : "Registry closure could not be resolved.",
    );
  }
}

function parseLockEntry(value: unknown, index: number): SubjectPresetResourceLockEntryV1 {
  const source = record(value, `semanticContent.base.registryLock[${index}]`);
  exactKeys(
    source,
    ["resourceRef", "resourceKind", "version", "contentHash"],
    `semanticContent.base.registryLock[${index}]`,
  );
  const resourceRef = stringValue(source.resourceRef, `registryLock[${index}].resourceRef`);
  const resourceKind = stringValue(source.resourceKind, `registryLock[${index}].resourceKind`);
  if (!Number.isSafeInteger(source.version) || (source.version as number) < 1) {
    fail("SUBJECT_PRESET_CANDIDATE_INVALID_LOCK", `registryLock[${index}].version is invalid.`);
  }
  return {
    resourceRef,
    resourceKind: resourceKind as SubjectPresetResourceLockEntryV1["resourceKind"],
    version: source.version as number,
    contentHash: exactHash(source.contentHash, `registryLock[${index}].contentHash`),
  };
}

function parseRole(value: unknown, path: string): MotionPublicationRoleV1 {
  const source = record(value, path);
  exactKeys(source, ["sourceProfileRef", "sourceContentHash", "disposition"], path);
  return {
    sourceProfileRef: stringValue(source.sourceProfileRef, `${path}.sourceProfileRef`),
    sourceContentHash: exactHash(source.sourceContentHash, `${path}.sourceContentHash`),
    disposition: disposition(source.disposition, `${path}.disposition`),
  };
}

function parseNumericValues(value: unknown, path: string): Record<string, number> {
  const source = record(value, path);
  return Object.fromEntries(Object.entries(source).sort(([left], [right]) =>
    left.localeCompare(right)
  ).map(([name, parameterValue]) => {
    if (typeof parameterValue !== "number" || !Number.isFinite(parameterValue)) {
      fail(
        "SUBJECT_PRESET_CANDIDATE_NON_FINITE_PARAMETER",
        `${path}.${name} must be a finite number.`,
      );
    }
    return [name, Object.is(parameterValue, -0) ? 0 : parameterValue];
  }));
}

function parseOverrideMap(
  value: unknown,
  path: string,
): Record<string, NumericProfileOverrideV1> {
  const source = record(value, path);
  return Object.fromEntries(Object.entries(source).sort(([left], [right]) =>
    left.localeCompare(right)
  ).map(([profileRef, rawOverride]) => {
    const override = record(rawOverride, `${path}.${profileRef}`);
    exactKeys(
      override,
      ["baseResourceRef", "baseContentHash", "values"],
      `${path}.${profileRef}`,
    );
    const baseResourceRef = stringValue(
      override.baseResourceRef,
      `${path}.${profileRef}.baseResourceRef`,
    );
    if (baseResourceRef !== profileRef) {
      fail(
        "SUBJECT_PRESET_CANDIDATE_OVERRIDE_REF_MISMATCH",
        `${path}.${profileRef} must target its exact map key.`,
      );
    }
    return [profileRef, {
      baseResourceRef,
      baseContentHash: exactHash(
        override.baseContentHash,
        `${path}.${profileRef}.baseContentHash`,
      ),
      values: parseNumericValues(override.values, `${path}.${profileRef}.values`),
    } satisfies NumericProfileOverrideV1];
  }));
}

function parseCameraPublicationMap(
  value: unknown,
): Record<string, CameraPublicationDecisionV1> {
  const source = record(
    value,
    "semanticContent.overrides.cameraPublicationBySourceProfileRef",
  );
  return Object.fromEntries(Object.entries(source).sort(([left], [right]) =>
    left.localeCompare(right)
  ).map(([profileRef, rawDecision]) => {
    const path = `cameraPublicationBySourceProfileRef.${profileRef}`;
    const decision = record(rawDecision, path);
    exactKeys(decision, ["sourceContentHash", "disposition"], path);
    return [profileRef, {
      sourceContentHash: exactHash(decision.sourceContentHash, `${path}.sourceContentHash`),
      disposition: disposition(decision.disposition, `${path}.disposition`),
    }];
  }));
}

function parseSemanticContent(value: unknown): SubjectPresetSemanticContentV1 {
  const source = record(value, "semanticContent");
  exactKeys(
    source,
    ["candidateId", "subjectDefinitionId", "base", "selections", "overrides", "publication"],
    "semanticContent",
  );
  const candidateId = stringValue(source.candidateId, "semanticContent.candidateId");
  if (!CANDIDATE_ID_PATTERN.test(candidateId)) {
    fail("SUBJECT_PRESET_CANDIDATE_INVALID_ID", "candidateId is not a stable slug.");
  }

  const baseSource = record(source.base, "semanticContent.base");
  exactKeys(
    baseSource,
    [
      "subjectDefinitionRef",
      "subjectDefinitionContentHash",
      "registryLock",
      "registryLockHash",
    ],
    "semanticContent.base",
  );
  if (!Array.isArray(baseSource.registryLock)) {
    fail("SUBJECT_PRESET_CANDIDATE_INVALID_SHAPE", "registryLock must be an array.");
  }
  const base = {
    subjectDefinitionRef: stringValue(
      baseSource.subjectDefinitionRef,
      "semanticContent.base.subjectDefinitionRef",
    ),
    subjectDefinitionContentHash: exactHash(
      baseSource.subjectDefinitionContentHash,
      "semanticContent.base.subjectDefinitionContentHash",
    ),
    registryLock: baseSource.registryLock.map(parseLockEntry),
    registryLockHash: exactHash(
      baseSource.registryLockHash,
      "semanticContent.base.registryLockHash",
    ),
  };

  const selectionsSource = record(source.selections, "semanticContent.selections");
  exactKeys(
    selectionsSource,
    ["motionRoles", "selectedMotionProfileRef", "selectedMotionContentHash", "controlFeel", "control", "cameraContextProfileRef", "defaultCameraRigProfileRef"],
    "semanticContent.selections",
  );
  const motionRolesSource = record(
    selectionsSource.motionRoles,
    "semanticContent.selections.motionRoles",
  );
  exactKeys(
    motionRolesSource,
    ["default", "optional", "fallback"],
    "semanticContent.selections.motionRoles",
  );
  if (!Array.isArray(motionRolesSource.optional)) {
    fail("SUBJECT_PRESET_CANDIDATE_INVALID_SHAPE", "motionRoles.optional must be an array.");
  }
  const controlSource = record(
    selectionsSource.control,
    "semanticContent.selections.control",
  );
  exactKeys(controlSource, ["profileRef", "contentHash", "disposition"], "selections.control");
  const controlFeelSource = record(
    selectionsSource.controlFeel,
    "semanticContent.selections.controlFeel",
  );
  exactKeys(
    controlFeelSource,
    ["profileRef", "contentHash", "disposition"],
    "selections.controlFeel",
  );

  const overridesSource = record(source.overrides, "semanticContent.overrides");
  exactKeys(
    overridesSource,
    [
      "controlFeelByProfileRef",
      "controlByProfileRef",
      "cameraByProfileRef",
      "cameraPublicationBySourceProfileRef",
    ],
    "semanticContent.overrides",
  );

  const publicationSource = record(source.publication, "semanticContent.publication");
  exactKeys(publicationSource, ["mode", "publicDefaultEnabled"], "semanticContent.publication");
  if (
    publicationSource.mode !== "subject-scoped-derivatives" ||
    publicationSource.publicDefaultEnabled !== true
  ) {
    fail("SUBJECT_PRESET_CANDIDATE_INVALID_PUBLICATION", "publication policy is invalid.");
  }

  return {
    candidateId,
    subjectDefinitionId: stringValue(
      source.subjectDefinitionId,
      "semanticContent.subjectDefinitionId",
    ),
    base,
    selections: {
      motionRoles: {
        default: parseRole(motionRolesSource.default, "motionRoles.default"),
        optional: motionRolesSource.optional.map((role, index) =>
          parseRole(role, `motionRoles.optional[${index}]`)
        ),
        fallback: parseRole(motionRolesSource.fallback, "motionRoles.fallback"),
      },
      selectedMotionProfileRef: stringValue(
        selectionsSource.selectedMotionProfileRef,
        "selections.selectedMotionProfileRef",
      ),
      selectedMotionContentHash: exactHash(
        selectionsSource.selectedMotionContentHash,
        "selections.selectedMotionContentHash",
      ),
      controlFeel: {
        profileRef: stringValue(
          controlFeelSource.profileRef,
          "selections.controlFeel.profileRef",
        ),
        contentHash: exactHash(
          controlFeelSource.contentHash,
          "selections.controlFeel.contentHash",
        ),
        disposition: disposition(
          controlFeelSource.disposition,
          "selections.controlFeel.disposition",
        ),
      },
      control: {
        profileRef: stringValue(controlSource.profileRef, "selections.control.profileRef"),
        contentHash: exactHash(controlSource.contentHash, "selections.control.contentHash"),
        disposition: disposition(controlSource.disposition, "selections.control.disposition"),
      },
      cameraContextProfileRef: stringValue(
        selectionsSource.cameraContextProfileRef,
        "selections.cameraContextProfileRef",
      ),
      defaultCameraRigProfileRef: stringValue(
        selectionsSource.defaultCameraRigProfileRef,
        "selections.defaultCameraRigProfileRef",
      ),
    },
    overrides: {
      controlFeelByProfileRef: parseOverrideMap(
        overridesSource.controlFeelByProfileRef,
        "controlFeelByProfileRef",
      ),
      controlByProfileRef: parseOverrideMap(
        overridesSource.controlByProfileRef,
        "controlByProfileRef",
      ),
      cameraByProfileRef: parseOverrideMap(
        overridesSource.cameraByProfileRef,
        "cameraByProfileRef",
      ),
      cameraPublicationBySourceProfileRef: parseCameraPublicationMap(
        overridesSource.cameraPublicationBySourceProfileRef,
      ),
    },
    publication: {
      mode: "subject-scoped-derivatives",
      publicDefaultEnabled: true,
    },
  };
}

function parseProvenance(value: unknown): SubjectPresetCandidateV1["provenance"] {
  const source = record(value, "provenance");
  exactKeys(source, ["displayName", "notes", "createdAtIso", "sourceCommit"], "provenance");
  const displayName = stringValue(source.displayName, "provenance.displayName", {
    maximumLength: 128,
  });
  const notes = stringValue(source.notes, "provenance.notes", {
    allowEmpty: true,
    maximumLength: 4096,
  });
  const createdAtIso = stringValue(source.createdAtIso, "provenance.createdAtIso");
  const parsedTimestamp = Date.parse(createdAtIso);
  const normalizedTimestamp = Number.isFinite(parsedTimestamp)
    ? new Date(parsedTimestamp).toISOString()
    : "";
  if (
    !ISO_TIMESTAMP_PATTERN.test(createdAtIso) ||
    !Number.isFinite(parsedTimestamp) ||
    (createdAtIso !== normalizedTimestamp &&
      createdAtIso !== normalizedTimestamp.replace(".000Z", "Z"))
  ) {
    fail("SUBJECT_PRESET_CANDIDATE_INVALID_TIMESTAMP", "createdAtIso must be UTC ISO-8601.");
  }
  const sourceCommit = stringValue(source.sourceCommit, "provenance.sourceCommit");
  if (!COMMIT_PATTERN.test(sourceCommit) || sourceCommit === FORGED_ZERO_SOURCE_COMMIT) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_INVALID_SOURCE_COMMIT",
      "sourceCommit must be a full 40-character hexadecimal commit id injected by the trusted host.",
    );
  }
  return { displayName, notes, createdAtIso, sourceCommit };
}

function parseEvidence(value: unknown): SubjectPresetCandidateV1["evidence"] {
  const source = record(value, "evidence");
  exactKeys(source, ["harnessProfileRef", "passedCheckIds", "runtimeBuild"], "evidence");
  if (!Array.isArray(source.passedCheckIds)) {
    fail("SUBJECT_PRESET_CANDIDATE_INVALID_EVIDENCE", "passedCheckIds must be an array.");
  }
  const passedCheckIds = source.passedCheckIds.map((value, index) => {
    const checkId = stringValue(value, `evidence.passedCheckIds[${index}]`);
    if (!HARNESS_CHECK_PATTERN.test(checkId)) {
      fail("SUBJECT_PRESET_CANDIDATE_INVALID_EVIDENCE", `Invalid harness check '${checkId}'.`);
    }
    return checkId;
  });
  if (new Set(passedCheckIds).size !== passedCheckIds.length) {
    fail("SUBJECT_PRESET_CANDIDATE_INVALID_EVIDENCE", "Harness checks must be unique.");
  }
  const runtimeBuild = stringValue(source.runtimeBuild, "evidence.runtimeBuild");
  if (!RUNTIME_BUILD_PATTERN.test(runtimeBuild)) {
    fail("SUBJECT_PRESET_CANDIDATE_INVALID_EVIDENCE", "runtimeBuild is malformed.");
  }
  return {
    harnessProfileRef: stringValue(source.harnessProfileRef, "evidence.harnessProfileRef"),
    passedCheckIds,
    runtimeBuild,
  };
}

function reachableCameraProfileRefs(
  registry: SubjectResourceRegistryV3,
  cameraContextProfileRef: string,
): readonly string[] {
  const context = registry.resolveCameraContextProfile(cameraContextProfileRef);
  if (context === undefined) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_SOURCE_DRIFT",
      `Camera Context '${cameraContextProfileRef}' is missing.`,
    );
  }
  return [...new Set([
    context.defaultCameraRigProfileRef,
    ...(context.firstPersonCameraRigProfileRef === undefined
      ? []
      : [context.firstPersonCameraRigProfileRef]),
    ...context.rules.flatMap((rule) =>
      rule.cameraRigProfileRef === undefined ? [] : [rule.cameraRigProfileRef]
    ),
  ])].sort();
}

function assertOverrideHash(
  profileRef: string,
  override: NumericProfileOverrideV1,
  expectedHash: string,
): void {
  if (override.baseResourceRef !== profileRef || override.baseContentHash !== expectedHash) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_SOURCE_DRIFT",
      `Override '${profileRef}' does not target the exact Registry profile.`,
    );
  }
  if (Object.keys(override.values).length === 0) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_EMPTY_OVERRIDE",
      `Derived profile '${profileRef}' must change at least one Runtime parameter.`,
    );
  }
}

function assertControlFeelOverride(
  profile: ControlFeelProfileV1,
  profileRef: string,
  override: NumericProfileOverrideV1,
): void {
  assertOverrideHash(profileRef, override, profile.contentHash);
  try {
    if (resolveControlFeelParametersV1(profile, override.values) === undefined) {
      fail(
        "SUBJECT_PRESET_CANDIDATE_INVALID_CONTROL_FEEL_OVERRIDE",
        `Control Feel override '${profileRef}' contains an unknown or out-of-range parameter.`,
      );
    }
  } catch (error) {
    if (
      error instanceof TypeError &&
      error.message.startsWith("SUBJECT_PRESET_CANDIDATE_INVALID_CONTROL_FEEL_OVERRIDE")
    ) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    fail("SUBJECT_PRESET_CANDIDATE_INVALID_CONTROL_FEEL_OVERRIDE", message);
  }
}

function assertControlOverride(
  profile: ControlProfileV1,
  override: NumericProfileOverrideV1,
): void {
  assertOverrideHash(profile.resourceRef, override, profile.contentHash);
  for (const [name, value] of Object.entries(override.values)) {
    if (name !== "moveDeadzoneRatio") {
      fail(
        "SUBJECT_PRESET_CANDIDATE_UNKNOWN_PARAMETER",
        `'${name}' is not supported by Control Profile '${profile.resourceRef}'.`,
      );
    }
    if (value < 0 || value > 0.4) {
      fail(
        "SUBJECT_PRESET_CANDIDATE_PARAMETER_OUT_OF_RANGE",
        `'${name}' is outside the safety limits of '${profile.resourceRef}'.`,
      );
    }
  }
}

function assertCameraOverride(
  profile: CameraRigProfileV1,
  override: NumericProfileOverrideV1,
): void {
  assertOverrideHash(profile.resourceRef, override, profile.contentHash);
  for (const name of Object.keys(override.values)) {
    if (!Object.prototype.hasOwnProperty.call(profile.parameters, name)) {
      fail(
        "SUBJECT_PRESET_CANDIDATE_UNKNOWN_PARAMETER",
        `'${name}' is not supported by Camera Profile '${profile.resourceRef}'.`,
      );
    }
  }
  const result = validateCameraTuningV1(
    {
      algorithmRef: profile.algorithmRef,
      parameters: profile.parameters,
    },
    override.values,
  );
  if (!result.ok) {
    const code = result.code === "CAMERA_TUNING_UNKNOWN_PARAMETER" ||
        result.code === "CAMERA_TUNING_UNSUPPORTED_PARAMETER"
      ? "SUBJECT_PRESET_CANDIDATE_UNKNOWN_PARAMETER"
      : result.code === "CAMERA_TUNING_OUT_OF_RANGE"
        ? "SUBJECT_PRESET_CANDIDATE_PARAMETER_OUT_OF_RANGE"
        : "SUBJECT_PRESET_CANDIDATE_CAMERA_INVARIANT";
    fail(code, `Camera override '${profile.resourceRef}': ${result.message}`);
  }
}

function validateCandidateAgainstRegistry(
  candidate: SubjectPresetCandidateV1,
  registry: SubjectResourceRegistryV3,
): void {
  const semantic = candidate.semanticContent;
  const { definition, closure } = candidateSubject(
    registry,
    semantic.base.subjectDefinitionRef,
  );
  if (
    semantic.subjectDefinitionId !== definition.id ||
    semantic.base.subjectDefinitionContentHash !== definition.contentHash ||
    semantic.base.registryLockHash !== closure.contentHash
  ) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_SOURCE_DRIFT",
      "The candidate base no longer matches its exact Subject Definition closure.",
    );
  }
  if (!sameJson(semantic.base.registryLock, closure.entries)) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_REGISTRY_LOCK_MISMATCH",
      "registryLock must be the complete, sorted, exact Registry closure.",
    );
  }

  const expectedMotionRefs = {
    default: definition.profiles.motion.defaultMotionProfileRef,
    optional: [...definition.profiles.motion.optionalMotionProfileRefs],
    fallback: definition.profiles.motion.fallbackMotionProfileRef,
  };
  const roles = semantic.selections.motionRoles;
  if (
    roles.default.sourceProfileRef !== expectedMotionRefs.default ||
    roles.fallback.sourceProfileRef !== expectedMotionRefs.fallback ||
    !sameJson(
      roles.optional.map((role) => role.sourceProfileRef),
      expectedMotionRefs.optional,
    )
  ) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_MOTION_ROLE_MISMATCH",
      "Motion publication roles must exactly mirror the locked Subject Definition.",
    );
  }
  const allRoles = [roles.default, ...roles.optional, roles.fallback];
  const dispositionsByMotionRef = new Map<string, SubjectPresetPublicationDispositionV1>();
  for (const role of allRoles) {
    const profile = registry.resolveMotionProfile(role.sourceProfileRef);
    if (profile === undefined || role.sourceContentHash !== profile.contentHash) {
      fail(
        "SUBJECT_PRESET_CANDIDATE_SOURCE_DRIFT",
        `Motion role '${role.sourceProfileRef}' has drifted.`,
      );
    }
    const earlier = dispositionsByMotionRef.get(role.sourceProfileRef);
    if (earlier !== undefined && earlier !== role.disposition) {
      fail(
        "SUBJECT_PRESET_CANDIDATE_MOTION_ROLE_MISMATCH",
        `Repeated Motion Profile '${role.sourceProfileRef}' has conflicting dispositions.`,
      );
    }
    dispositionsByMotionRef.set(role.sourceProfileRef, role.disposition);
  }
  if ([...dispositionsByMotionRef.values()].some((value) => value !== "preserve")) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_MOTION_DERIVATION_UNSUPPORTED",
      "Motion Profiles select algorithms only; numeric feel derivation belongs to Control Feel.",
    );
  }

  const selectableMotionRefs = [
    expectedMotionRefs.default,
    ...expectedMotionRefs.optional,
    expectedMotionRefs.fallback,
  ];
  const selectedMotionProfile = registry.resolveMotionProfile(
    semantic.selections.selectedMotionProfileRef,
  );
  if (
    isNil(selectedMotionProfile) ||
    !selectableMotionRefs.includes(semantic.selections.selectedMotionProfileRef) ||
    semantic.selections.selectedMotionContentHash !== selectedMotionProfile.contentHash
  ) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_MOTION_SELECTION_UNREACHABLE",
      "The selected Motion Profile must be a locked default, optional, or fallback with an exact hash.",
    );
  }

  const controlFeel = registry.resolveControlFeelProfile(
    semantic.selections.controlFeel.profileRef,
  );
  const selectableControlFeelRefs = selectableControlFeelProfileRefsV1(definition.profiles);
  if (
    controlFeel === undefined ||
    !selectableControlFeelRefs.includes(controlFeel.resourceRef) ||
    semantic.selections.controlFeel.contentHash !== controlFeel.contentHash
  ) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_CONTROL_FEEL_UNREACHABLE",
      "The selected Control Feel Profile must be in the Definition allowed set with an exact hash.",
    );
  }
  const expectedControlFeelOverrideRefs =
    semantic.selections.controlFeel.disposition === "derive"
      ? [controlFeel.resourceRef]
      : [];
  const controlFeelOverrideRefs = Object.keys(
    semantic.overrides.controlFeelByProfileRef,
  ).sort();
  if (!sameJson(controlFeelOverrideRefs, expectedControlFeelOverrideRefs)) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_CONTROL_FEEL_OVERRIDE_SET_MISMATCH",
      "Control Feel V1 permits only the selected profile and only when marked derive.",
    );
  }
  if (controlFeelOverrideRefs.length === 1) {
    assertControlFeelOverride(
      controlFeel,
      controlFeel.resourceRef,
      semantic.overrides.controlFeelByProfileRef[controlFeel.resourceRef]!,
    );
  }

  const control = registry.resolveControlProfile(definition.profiles.controlProfileRef);
  if (
    control === undefined ||
    semantic.selections.control.profileRef !== control.resourceRef ||
    semantic.selections.control.contentHash !== control.contentHash
  ) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_SOURCE_DRIFT",
      "The selected Control Profile is not the exact locked profile.",
    );
  }
  const expectedControlOverrideRefs =
    semantic.selections.control.disposition === "derive" ? [control.resourceRef] : [];
  const controlOverrideRefs = Object.keys(semantic.overrides.controlByProfileRef).sort();
  if (!sameJson(controlOverrideRefs, expectedControlOverrideRefs)) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_CONTROL_OVERRIDE_SET_MISMATCH",
      "Control V1 permits only the selected profile and only when marked derive.",
    );
  }
  if (controlOverrideRefs.length === 1) {
    assertControlOverride(control, semantic.overrides.controlByProfileRef[control.resourceRef]!);
  }

  const defaultMotionProfile = registry.resolveMotionProfile(roles.default.sourceProfileRef)!;
  const defaultMotionKernel = registry.resolveMotionKernel(defaultMotionProfile.motionKernelRef);
  for (const role of allRoles) {
    const profile = registry.resolveMotionProfile(role.sourceProfileRef)!;
    const kernel = registry.resolveMotionKernel(profile.motionKernelRef);
    const isDeclaredSafeFallback =
      defaultMotionKernel?.fallbackMotionProfileRef === profile.resourceRef &&
      role.sourceProfileRef !== roles.default.sourceProfileRef;
    if (
      kernel === undefined ||
      kernel.runtimeStatus === "reserved" ||
      (!isDeclaredSafeFallback &&
        kernel.commandKind !== "none" &&
        kernel.commandKind !== control.commandKind)
    ) {
      fail(
        "SUBJECT_PRESET_CANDIDATE_COMMAND_KIND_MISMATCH",
        `Motion Profile '${profile.resourceRef}' is incompatible with Control '${control.resourceRef}'.`,
      );
    }
  }

  if (semantic.selections.cameraContextProfileRef !== definition.profiles.cameraContextProfileRef) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_SOURCE_DRIFT",
      "The Camera Context does not match the locked Subject Definition.",
    );
  }
  const cameraRefs = reachableCameraProfileRefs(
    registry,
    semantic.selections.cameraContextProfileRef,
  );
  if (!cameraRefs.includes(semantic.selections.defaultCameraRigProfileRef)) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_CAMERA_DEFAULT_UNREACHABLE",
      "The selected default Camera Profile is not reachable from the locked Context.",
    );
  }
  const publicationRefs = Object.keys(
    semantic.overrides.cameraPublicationBySourceProfileRef,
  ).sort();
  if (!sameJson(publicationRefs, cameraRefs)) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_CAMERA_PUBLICATION_SET_MISMATCH",
      "Every reachable Camera Profile needs one exact publication decision.",
    );
  }
  const derivedCameraRefs: string[] = [];
  for (const profileRef of publicationRefs) {
    const profile = registry.resolveCameraRigProfile(profileRef);
    const decision = semantic.overrides.cameraPublicationBySourceProfileRef[profileRef]!;
    if (profile === undefined || decision.sourceContentHash !== profile.contentHash) {
      fail(
        "SUBJECT_PRESET_CANDIDATE_SOURCE_DRIFT",
        `Camera Profile '${profileRef}' has drifted.`,
      );
    }
    const algorithm = registry.resolveCameraRigAlgorithm(profile.algorithmRef);
    if (algorithm === undefined || algorithm.runtimeStatus !== "implemented") {
      fail(
        "SUBJECT_PRESET_CANDIDATE_RESERVED_IMPLEMENTATION",
        `Camera Profile '${profileRef}' has no implemented algorithm.`,
      );
    }
    if (decision.disposition === "derive") derivedCameraRefs.push(profileRef);
  }
  const cameraOverrideRefs = Object.keys(semantic.overrides.cameraByProfileRef).sort();
  if (!sameJson(cameraOverrideRefs, derivedCameraRefs.sort())) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_CAMERA_OVERRIDE_SET_MISMATCH",
      "Camera overrides must exactly match reachable profiles marked derive.",
    );
  }
  for (const profileRef of cameraOverrideRefs) {
    assertCameraOverride(
      registry.resolveCameraRigProfile(profileRef)!,
      semantic.overrides.cameraByProfileRef[profileRef]!,
    );
  }

  if (candidate.evidence.harnessProfileRef !== definition.profiles.harnessProfileRef) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_INVALID_EVIDENCE",
      "Evidence must name the locked Subject Definition Harness Profile.",
    );
  }
  const harness = registry.resolveHarnessProfile(candidate.evidence.harnessProfileRef);
  if (isNil(harness)) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_INVALID_EVIDENCE",
      "Evidence must name the locked Subject Definition Harness Profile.",
    );
  }
  const unknownCheckId = candidate.evidence.passedCheckIds.find(
    (checkId) => !harness.requiredCheckIds.includes(
      checkId as (typeof harness.requiredCheckIds)[number],
    ),
  );
  if (unknownCheckId !== undefined) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_INVALID_EVIDENCE",
      "Evidence contains a check not declared by the locked Harness Profile.",
    );
  }
}

function parseEnvelope(
  input: unknown,
  registry: SubjectResourceRegistryV3,
  requireHash: boolean,
): SubjectPresetCandidateV1 {
  const source = record(input, "candidate");
  exactKeys(
    source,
    requireHash
      ? ["kind", "schemaVersion", "semanticContent", "provenance", "evidence", "semanticContentHash"]
      : ["kind", "schemaVersion", "semanticContent", "provenance", "evidence"],
    "candidate",
  );
  if (
    source.kind !== "worldkit-subject-preset-candidate" ||
    source.schemaVersion !== 1
  ) {
    fail("SUBJECT_PRESET_CANDIDATE_SCHEMA_UNSUPPORTED", "Candidate kind/schema is invalid.");
  }
  const semanticContent = parseSemanticContent(source.semanticContent);
  const semanticContentHash = sha256CanonicalJson(semanticContent);
  if (requireHash) {
    const suppliedHash = exactHash(source.semanticContentHash, "semanticContentHash");
    if (suppliedHash !== semanticContentHash) {
      fail(
        "SUBJECT_PRESET_CANDIDATE_HASH_MISMATCH",
        "semanticContentHash does not match canonical semantic content.",
      );
    }
  }
  const candidate: SubjectPresetCandidateV1 = {
    kind: "worldkit-subject-preset-candidate",
    schemaVersion: 1,
    semanticContent,
    provenance: parseProvenance(source.provenance),
    evidence: parseEvidence(source.evidence),
    semanticContentHash,
  };
  validateCandidateAgainstRegistry(candidate, registry);
  return deepFreeze(candidate);
}

export function parseSubjectPresetCandidateV1(
  input: unknown,
  registry: SubjectResourceRegistryV3 = builtInSubjectResourceRegistry,
): SubjectPresetCandidateV1 {
  return parseEnvelope(input, registry, true);
}

export function createSubjectPresetCandidateV1(
  input: SubjectPresetCandidateInputV1,
  registry: SubjectResourceRegistryV3 = builtInSubjectResourceRegistry,
): SubjectPresetCandidateV1 {
  return parseEnvelope(input, registry, false);
}

export interface CreateSubjectPresetCandidateFromSelectionsInputV1 {
  candidateId: string;
  subjectDefinitionRef: string;
  selectedMotionProfileRef: string;
  selectedControlFeelProfileRef: string;
  selectedControlProfileRef: string;
  defaultCameraRigProfileRef: string;
  controlFeelOverridesByProfileRef: Readonly<Record<string, NumericProfileOverrideV1>>;
  controlOverridesByProfileRef: Readonly<Record<string, NumericProfileOverrideV1>>;
  cameraOverridesByProfileRef: Readonly<Record<string, NumericProfileOverrideV1>>;
  provenance: SubjectPresetCandidateV1["provenance"];
  evidence: SubjectPresetCandidateV1["evidence"];
}

function publicationRole(
  sourceProfileRef: string,
  contentHash: string,
): MotionPublicationRoleV1 {
  return {
    sourceProfileRef,
    sourceContentHash: contentHash,
    disposition: "preserve",
  };
}

function deriveOrPreserve(
  hasOverride: boolean,
): SubjectPresetPublicationDispositionV1 {
  return hasOverride ? "derive" : "preserve";
}

export function createSubjectPresetCandidateFromSelectionsV1(
  input: CreateSubjectPresetCandidateFromSelectionsInputV1,
  registry: SubjectResourceRegistryV3 = builtInSubjectResourceRegistry,
): SubjectPresetCandidateV1 {
  const { definition, closure } = candidateSubject(registry, input.subjectDefinitionRef);
  const motion = definition.profiles.motion;
  const defaultMotion = registry.resolveMotionProfile(motion.defaultMotionProfileRef);
  const fallbackMotion = registry.resolveMotionProfile(motion.fallbackMotionProfileRef);
  const selectedMotion = registry.resolveMotionProfile(input.selectedMotionProfileRef);
  const selectedFeel = registry.resolveControlFeelProfile(input.selectedControlFeelProfileRef);
  const selectedControl = registry.resolveControlProfile(input.selectedControlProfileRef);
  if (
    isNil(defaultMotion) ||
    isNil(fallbackMotion) ||
    isNil(selectedMotion) ||
    isNil(selectedFeel) ||
    isNil(selectedControl)
  ) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_SOURCE_DRIFT",
      "A selected Motion, Control Feel, or Control Profile is missing from Registry.",
    );
  }
  const cameraRefs = reachableCameraProfileRefs(
    registry,
    definition.profiles.cameraContextProfileRef,
  );
  const controlFeelDisposition = deriveOrPreserve(
    Object.prototype.hasOwnProperty.call(
      input.controlFeelOverridesByProfileRef,
      input.selectedControlFeelProfileRef,
    ),
  );
  const controlDisposition = deriveOrPreserve(
    Object.prototype.hasOwnProperty.call(
      input.controlOverridesByProfileRef,
      input.selectedControlProfileRef,
    ),
  );
  return createSubjectPresetCandidateV1({
    kind: "worldkit-subject-preset-candidate",
    schemaVersion: 1,
    semanticContent: {
      candidateId: input.candidateId,
      subjectDefinitionId: definition.id,
      base: {
        subjectDefinitionRef: input.subjectDefinitionRef,
        subjectDefinitionContentHash: definition.contentHash,
        registryLock: closure.entries,
        registryLockHash: closure.contentHash,
      },
      selections: {
        motionRoles: {
          default: publicationRole(defaultMotion.resourceRef, defaultMotion.contentHash),
          optional: motion.optionalMotionProfileRefs.map((resourceRef) => {
            const profile = registry.resolveMotionProfile(resourceRef);
            if (isNil(profile)) {
              fail(
                "SUBJECT_PRESET_CANDIDATE_SOURCE_DRIFT",
                `Optional Motion Profile '${resourceRef}' is missing.`,
              );
            }
            return publicationRole(profile.resourceRef, profile.contentHash);
          }),
          fallback: publicationRole(fallbackMotion.resourceRef, fallbackMotion.contentHash),
        },
        selectedMotionProfileRef: selectedMotion.resourceRef,
        selectedMotionContentHash: selectedMotion.contentHash,
        controlFeel: {
          profileRef: selectedFeel.resourceRef,
          contentHash: selectedFeel.contentHash,
          disposition: controlFeelDisposition,
        },
        control: {
          profileRef: selectedControl.resourceRef,
          contentHash: selectedControl.contentHash,
          disposition: controlDisposition,
        },
        cameraContextProfileRef: definition.profiles.cameraContextProfileRef,
        defaultCameraRigProfileRef: input.defaultCameraRigProfileRef,
      },
      overrides: {
        controlFeelByProfileRef: { ...input.controlFeelOverridesByProfileRef },
        controlByProfileRef: { ...input.controlOverridesByProfileRef },
        cameraByProfileRef: { ...input.cameraOverridesByProfileRef },
        cameraPublicationBySourceProfileRef: Object.fromEntries(
          cameraRefs.map((resourceRef) => {
            const profile = registry.resolveCameraRigProfile(resourceRef);
            if (isNil(profile)) {
              fail(
                "SUBJECT_PRESET_CANDIDATE_SOURCE_DRIFT",
                `Camera Profile '${resourceRef}' is missing.`,
              );
            }
            return [resourceRef, {
              sourceContentHash: profile.contentHash,
              disposition: deriveOrPreserve(
                Object.prototype.hasOwnProperty.call(
                  input.cameraOverridesByProfileRef,
                  resourceRef,
                ),
              ),
            }];
          }),
        ),
      },
      publication: {
        mode: "subject-scoped-derivatives",
        publicDefaultEnabled: true,
      },
    },
    provenance: input.provenance,
    evidence: input.evidence,
  }, registry);
}

function legacyRoot(input: unknown): Record<string, unknown> {
  const source = record(input, "legacy V4 snapshot");
  const required = [
    "schemaVersion",
    "subjectDefinition",
    "motionParameterDraft",
    "compatibleProfiles",
    "resourceLockRequired",
  ];
  const optional = [
    "selectedCameraPreference",
    "activeCameraModifiers",
    "cameraTuning",
    "cameraTuningByProfileRef",
    "controlTuning",
    "motionParameterSupport",
    "inputGuide",
    "note",
    "capabilityDemoHostOverlay",
  ];
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(source).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    fail("SUBJECT_PRESET_LEGACY_UNKNOWN_FIELD", `Legacy field '${unknown}' is unsupported.`);
  }
  if (source.schemaVersion !== 4) {
    fail("SUBJECT_PRESET_LEGACY_SCHEMA_UNSUPPORTED", "Only schemaVersion 4 is supported.");
  }
  const missing = required.find((key) => !Object.prototype.hasOwnProperty.call(source, key));
  if (missing !== undefined || source.resourceLockRequired !== true) {
    fail("SUBJECT_PRESET_LEGACY_INVALID", "The V4 export is incomplete or unlocked.");
  }
  return source;
}

function legacyCompatibleProfileHashes(
  value: unknown,
): ReadonlyMap<string, string> {
  if (!Array.isArray(value)) {
    fail("SUBJECT_PRESET_LEGACY_INVALID", "compatibleProfiles must be an array.");
  }
  const result = new Map<string, string>();
  for (const [index, rawProfile] of value.entries()) {
    const source = record(rawProfile, `compatibleProfiles[${index}]`);
    const resourceRef = stringValue(source.resourceRef, `compatibleProfiles[${index}].resourceRef`);
    const contentHash = exactHash(source.contentHash, `compatibleProfiles[${index}].contentHash`);
    if (result.has(resourceRef)) {
      fail("SUBJECT_PRESET_LEGACY_INVALID", `Duplicate compatible Profile '${resourceRef}'.`);
    }
    result.set(resourceRef, contentHash);
  }
  return result;
}

function legacyNumericDifferences(
  value: unknown,
  profile: ControlFeelProfileV1 | CameraRigProfileV1,
  kind: "control-feel" | "camera",
): Record<string, number> {
  const source = record(value, `${kind} tuning`);
  const result: [string, number][] = [];
  if (
    (kind === "control-feel" && profile.kind !== "control-feel-profile") ||
    (kind === "camera" && profile.kind !== "camera-rig-profile")
  ) {
    fail("SUBJECT_PRESET_LEGACY_INVALID", `Legacy ${kind} Profile kind is invalid.`);
  }
  for (const [name, rawValue] of Object.entries(source).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
      fail("SUBJECT_PRESET_LEGACY_NON_FINITE_PARAMETER", `'${name}' must be finite.`);
    }
    const baseline = profile.kind === "control-feel-profile"
      ? profile[name as keyof ControlFeelProfileV1]
      : profile.parameters[name as keyof typeof profile.parameters];
    const supported = profile.kind === "control-feel-profile"
      ? kind === "control-feel" &&
        CONTROL_FEEL_PARAMETER_NAMES_V1.includes(
          name as (typeof CONTROL_FEEL_PARAMETER_NAMES_V1)[number],
        ) && typeof baseline === "number"
      : kind === "camera" &&
        isCameraTuningParameterNameV1(name) &&
        Object.prototype.hasOwnProperty.call(profile.parameters, name) &&
        isCameraRigParameterOverrideSupportedV1(profile.algorithmRef, name);
    if (!supported) {
      fail(
        "SUBJECT_PRESET_LEGACY_UNKNOWN_PARAMETER",
        `'${name}' is not supported by '${profile.resourceRef}'.`,
      );
    }
    if (rawValue !== baseline) result.push([name, Object.is(rawValue, -0) ? 0 : rawValue]);
  }
  return Object.fromEntries(result);
}

function legacyControlDifferences(
  value: unknown,
  profile: ControlProfileV1,
): Record<string, number> {
  const source = record(value, "control tuning");
  const result: [string, number][] = [];
  for (const [name, rawValue] of Object.entries(source).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    if (
      name !== "moveDeadzoneRatio" ||
      typeof rawValue !== "number" ||
      !Number.isFinite(rawValue)
    ) {
      fail(
        typeof rawValue === "number" && Number.isFinite(rawValue)
          ? "SUBJECT_PRESET_LEGACY_UNKNOWN_PARAMETER"
          : "SUBJECT_PRESET_LEGACY_NON_FINITE_PARAMETER",
        `'${name}' is not a supported finite Control parameter.`,
      );
    }
    const baseline = profile.moveDeadzoneRatio;
    if (rawValue !== baseline) result.push([name, Object.is(rawValue, -0) ? 0 : rawValue]);
  }
  return Object.fromEntries(result);
}

export function importLegacyAuthoringSnapshotV4(
  input: unknown,
  options: LegacyAuthoringSnapshotV4ImportOptionsV1,
): SubjectPresetCandidateV1 {
  const registry = options.registry ?? builtInSubjectResourceRegistry;
  const source = legacyRoot(input);
  const definitionSummary = record(source.subjectDefinition, "legacy subjectDefinition");
  const subjectDefinitionRef = stringValue(
    definitionSummary.resourceRef,
    "legacy subjectDefinition.resourceRef",
  );
  const { definition, closure } = candidateSubject(registry, subjectDefinitionRef);
  const exactSummaryFields: Readonly<Record<string, string>> = {
    contentHash: definition.contentHash,
    semanticClassId: definition.semanticClassId,
    bodyTopology: definition.bodyTopology,
    authoringAvailability: definition.authoringAvailability,
    defaultMotionProfileRef: definition.profiles.motion.defaultMotionProfileRef,
    controlProfileRef: definition.profiles.controlProfileRef,
    cameraContextProfileRef: definition.profiles.cameraContextProfileRef,
  };
  const driftedSummaryField = Object.entries(exactSummaryFields).find(
    ([field, expected]) => definitionSummary[field] !== expected,
  );
  if (driftedSummaryField !== undefined) {
    fail(
      "SUBJECT_PRESET_LEGACY_SOURCE_DRIFT",
      `The legacy Subject Definition field '${driftedSummaryField[0]}' no longer matches Registry.`,
    );
  }
  if (source.activeCameraModifiers !== undefined) {
    if (!Array.isArray(source.activeCameraModifiers)) {
      fail("SUBJECT_PRESET_LEGACY_INVALID", "activeCameraModifiers must be an array.");
    }
    for (const [index, rawModifier] of source.activeCameraModifiers.entries()) {
      const modifier = record(rawModifier, `activeCameraModifiers[${index}]`);
      exactKeys(
        modifier,
        ["resourceRef", "displayName"],
        `activeCameraModifiers[${index}]`,
      );
      const resourceRef = stringValue(
        modifier.resourceRef,
        `activeCameraModifiers[${index}].resourceRef`,
      );
      stringValue(modifier.displayName, `activeCameraModifiers[${index}].displayName`, {
        maximumLength: 256,
      });
      if (
        registry.resolveCameraModifierProfile(resourceRef) === undefined ||
        !closure.entries.some((entry) =>
          entry.resourceRef === resourceRef && entry.resourceKind === "camera-modifier-profile"
        )
      ) {
        fail(
          "SUBJECT_PRESET_LEGACY_UNKNOWN_MODIFIER",
          `Active Camera modifier '${resourceRef}' is not in the locked Subject closure.`,
        );
      }
    }
  }
  if (source.capabilityDemoHostOverlay !== undefined) {
    const overlay = record(source.capabilityDemoHostOverlay, "capabilityDemoHostOverlay");
    if (
      overlay.subjectDefinitionRef !== undefined &&
      overlay.subjectDefinitionRef !== subjectDefinitionRef
    ) {
      fail(
        "SUBJECT_PRESET_CANDIDATE_PREVIEW_CLONE",
        "The legacy overlay targets a relationship-preview clone.",
      );
    }
  }

  const compatibleHashes = legacyCompatibleProfileHashes(source.compatibleProfiles);
  const lockRefs = new Set(closure.entries.map((entry) => entry.resourceRef));
  for (const [resourceRef, contentHash] of compatibleHashes) {
    const lock = closure.entries.find((entry) => entry.resourceRef === resourceRef);
    if (lock === undefined || lock.contentHash !== contentHash || !lockRefs.has(resourceRef)) {
      fail(
        "SUBJECT_PRESET_LEGACY_SOURCE_DRIFT",
        `Legacy compatible Profile '${resourceRef}' has drifted.`,
      );
    }
  }

  const motionProfileRef = definition.profiles.motion.defaultMotionProfileRef;
  const motionProfile = registry.resolveMotionProfile(motionProfileRef);
  if (
    motionProfile === undefined ||
    compatibleHashes.get(motionProfileRef) !== motionProfile.contentHash
  ) {
    fail(
      "SUBJECT_PRESET_LEGACY_SOURCE_DRIFT",
      "The exact default Motion Profile summary is required.",
    );
  }
  const cameraContext = registry.resolveCameraContextProfile(
    definition.profiles.cameraContextProfileRef,
  );
  const requestedCameraPreference = source.selectedCameraPreference === undefined
    ? "auto"
    : stringValue(source.selectedCameraPreference, "selectedCameraPreference");
  const selectedCameraRef = requestedCameraPreference === "auto"
    ? cameraContext?.defaultCameraRigProfileRef
    : requestedCameraPreference === "first-person"
      ? cameraContext?.firstPersonCameraRigProfileRef
      : requestedCameraPreference;
  if (selectedCameraRef === undefined) {
    fail("SUBJECT_PRESET_LEGACY_INVALID", "No selected Camera Profile is available.");
  }
  const cameraRefs = reachableCameraProfileRefs(
    registry,
    definition.profiles.cameraContextProfileRef,
  );
  if (!cameraRefs.includes(selectedCameraRef)) {
    fail(
      "SUBJECT_PRESET_CANDIDATE_CAMERA_DEFAULT_UNREACHABLE",
      "The legacy selected Camera Profile is not reachable from Registry.",
    );
  }
  const cameraProfile = registry.resolveCameraRigProfile(selectedCameraRef);
  if (
    cameraProfile === undefined ||
    compatibleHashes.get(selectedCameraRef) !== cameraProfile.contentHash
  ) {
    fail(
      "SUBJECT_PRESET_LEGACY_SOURCE_DRIFT",
      "The exact selected Camera Profile summary is required.",
    );
  }

  const controlFeel = registry.resolveControlFeelProfile(
    definition.profiles.controlFeelProfileRef,
  );
  if (controlFeel === undefined) {
    fail("SUBJECT_PRESET_LEGACY_SOURCE_DRIFT", "The selected Control Feel Profile is missing.");
  }
  const controlFeelValues = legacyNumericDifferences(
    source.motionParameterDraft,
    controlFeel,
    "control-feel",
  );
  const cameraTuningByProfileRef = source.cameraTuningByProfileRef === undefined
    ? {}
    : record(source.cameraTuningByProfileRef, "cameraTuningByProfileRef");
  if (
    source.cameraTuning !== undefined &&
    !Object.prototype.hasOwnProperty.call(cameraTuningByProfileRef, selectedCameraRef)
  ) {
    cameraTuningByProfileRef[selectedCameraRef] = source.cameraTuning;
  }
  const cameraOverrides: Record<string, NumericProfileOverrideV1> = {};
  const cameraDispositions = new Map<string, SubjectPresetPublicationDispositionV1>();
  for (const profileRef of cameraRefs) cameraDispositions.set(profileRef, "preserve");
  for (const [profileRef, rawTuning] of Object.entries(cameraTuningByProfileRef)) {
    if (!cameraRefs.includes(profileRef)) {
      fail(
        "SUBJECT_PRESET_CANDIDATE_CAMERA_DEFAULT_UNREACHABLE",
        `Camera tuning Profile '${profileRef}' is not reachable from Registry.`,
      );
    }
    const profile = registry.resolveCameraRigProfile(profileRef);
    if (
      profile === undefined ||
      compatibleHashes.get(profileRef) !== profile.contentHash
    ) {
      fail(
        "SUBJECT_PRESET_LEGACY_SOURCE_DRIFT",
        `The exact Camera Profile summary for '${profileRef}' is required.`,
      );
    }
    const values = legacyNumericDifferences(rawTuning, profile, "camera");
    if (Object.keys(values).length === 0) continue;
    cameraOverrides[profileRef] = {
      baseResourceRef: profileRef,
      baseContentHash: profile.contentHash,
      values,
    };
    cameraDispositions.set(profileRef, "derive");
  }
  const controlFeelDisposition = Object.keys(controlFeelValues).length === 0
    ? "preserve"
    : "derive";

  const role = (
    profileRef: string,
    roleDisposition: SubjectPresetPublicationDispositionV1,
  ): MotionPublicationRoleV1 => {
    const profile = registry.resolveMotionProfile(profileRef);
    if (profile === undefined) {
      fail("SUBJECT_PRESET_LEGACY_SOURCE_DRIFT", `Motion Profile '${profileRef}' is missing.`);
    }
    return {
      sourceProfileRef: profileRef,
      sourceContentHash: profile.contentHash,
      disposition: roleDisposition,
    };
  };
  const control = registry.resolveControlProfile(definition.profiles.controlProfileRef);
  if (control === undefined) {
    fail("SUBJECT_PRESET_LEGACY_SOURCE_DRIFT", "The selected Control Profile is missing.");
  }
  if (
    source.controlTuning !== undefined &&
    compatibleHashes.get(control.resourceRef) !== control.contentHash
  ) {
    fail(
      "SUBJECT_PRESET_LEGACY_SOURCE_DRIFT",
      "The exact selected Control Profile summary is required.",
    );
  }
  const controlValues = source.controlTuning === undefined
    ? {}
    : legacyControlDifferences(source.controlTuning, control);
  const controlDisposition = Object.keys(controlValues).length === 0
    ? "preserve"
    : "derive";
  return createSubjectPresetCandidateV1({
    kind: "worldkit-subject-preset-candidate",
    schemaVersion: 1,
    semanticContent: {
      candidateId: options.candidateId,
      subjectDefinitionId: definition.id,
      base: {
        subjectDefinitionRef,
        subjectDefinitionContentHash: definition.contentHash,
        registryLock: closure.entries,
        registryLockHash: closure.contentHash,
      },
      selections: {
        motionRoles: {
          default: role(motionProfileRef, "preserve"),
          optional: definition.profiles.motion.optionalMotionProfileRefs.map((profileRef) =>
            role(profileRef, "preserve")
          ),
          fallback: role(definition.profiles.motion.fallbackMotionProfileRef, "preserve"),
        },
        selectedMotionProfileRef: motionProfileRef,
        selectedMotionContentHash: role(motionProfileRef, "preserve").sourceContentHash,
        controlFeel: {
          profileRef: controlFeel.resourceRef,
          contentHash: controlFeel.contentHash,
          disposition: controlFeelDisposition,
        },
        control: {
          profileRef: control.resourceRef,
          contentHash: control.contentHash,
          disposition: controlDisposition,
        },
        cameraContextProfileRef: definition.profiles.cameraContextProfileRef,
        defaultCameraRigProfileRef: selectedCameraRef,
      },
      overrides: {
        controlFeelByProfileRef: controlFeelDisposition === "derive" ? {
          [controlFeel.resourceRef]: {
            baseResourceRef: controlFeel.resourceRef,
            baseContentHash: controlFeel.contentHash,
            values: controlFeelValues,
          },
        } : {},
        controlByProfileRef: controlDisposition === "derive" ? {
          [control.resourceRef]: {
            baseResourceRef: control.resourceRef,
            baseContentHash: control.contentHash,
            values: controlValues,
          },
        } : {},
        cameraByProfileRef: cameraOverrides,
        cameraPublicationBySourceProfileRef: Object.fromEntries(cameraRefs.map((profileRef) => {
          const profile = registry.resolveCameraRigProfile(profileRef);
          if (profile === undefined) {
            fail("SUBJECT_PRESET_LEGACY_SOURCE_DRIFT", `Camera Profile '${profileRef}' is missing.`);
          }
          return [profileRef, {
            sourceContentHash: profile.contentHash,
            disposition: cameraDispositions.get(profileRef) ?? "preserve",
          }];
        })),
      },
      publication: {
        mode: "subject-scoped-derivatives",
        publicDefaultEnabled: true,
      },
    },
    provenance: {
      displayName: options.displayName,
      notes: options.notes,
      createdAtIso: options.createdAtIso,
      sourceCommit: options.sourceCommit,
    },
    evidence: {
      harnessProfileRef: definition.profiles.harnessProfileRef,
      passedCheckIds: [...(options.passedCheckIds ?? [])],
      runtimeBuild: options.runtimeBuild,
    },
  }, registry);
}
