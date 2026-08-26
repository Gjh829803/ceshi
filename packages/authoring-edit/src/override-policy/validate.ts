import { intersection, isNil, sortBy } from "lodash-es";

import { parseDefinitionResourceRefOverrideV1, parseWorldChangeDiagnosticV1 } from "../authoring-edit.js";
import {
  hasRequiredAndOptionalKeys,
  isNonEmptyString,
  isOverridePath,
  isSha256,
  snapshotDataArray,
  snapshotDataRecord,
  type Sha256HashV1,
} from "../parse-kernel.js";
import {
  FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1,
  REGISTRY_RESOURCE_KINDS_V1,
  type DefinitionResourceRefOverrideV1,
  type RegistryResourceKindV1,
  type WorldChangeDiagnosticV1,
} from "../types.js";

export const FIRST_BATCH_OVERRIDE_RESOURCE_KIND_BY_PATH_V1 = {
  "profiles.controlFeelProfileRef": "control-feel-profile",
  "profiles.controlProfileRef": "control-profile",
  "profiles.motion.defaultMotionProfileRef": "motion-profile",
} as const satisfies Record<
  (typeof FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1)[number],
  RegistryResourceKindV1
>;

export interface DefinitionOverrideOwnerV1 {
  readonly definitionKind: string;
  readonly definitionRef: string;
  readonly allowedOverridePaths: readonly string[];
  readonly compatibleResourceRefsByPath?: Readonly<
    Record<string, readonly string[]>
  >;
  readonly bodyTopology?: string;
  readonly mediumProfileRef?: string;
}

export interface DefinitionOverrideLockEntryV1 {
  readonly resourceRef: string;
  readonly resourceKind: RegistryResourceKindV1;
  readonly contentHash: Sha256HashV1;
  readonly requiredCapabilityRefs: readonly string[];
  readonly runtimeStatus: "implemented" | "reserved";
  readonly supportedBodyTopologies?: readonly string[];
  readonly mediumProfileRef?: string;
}

export interface ValidateDefinitionResourceRefOverrideInputV1 {
  readonly definition: unknown;
  readonly projectionAllowedOverridePaths: readonly unknown[];
  readonly hostPolicyAllowedOverridePaths: readonly unknown[];
  readonly override: unknown;
  readonly registryLockEntries: readonly unknown[];
  readonly allowedCapabilityRefs: readonly string[];
}

export type ValidateDefinitionResourceRefOverrideResultV1 =
  | {
      readonly status: "accepted";
      readonly override: DefinitionResourceRefOverrideV1;
      readonly effectiveAllowedOverridePaths: readonly string[];
    }
  | {
      readonly status: "rejected";
      readonly diagnostics: readonly WorldChangeDiagnosticV1[];
    };

function diagnostic(
  code: WorldChangeDiagnosticV1["code"],
  instancePath: string,
  message: string,
): WorldChangeDiagnosticV1 {
  return parseWorldChangeDiagnosticV1({
    severity: "error",
    code,
    instancePath,
    message,
  });
}

function rejected(
  diagnostics: readonly WorldChangeDiagnosticV1[],
): ValidateDefinitionResourceRefOverrideResultV1 {
  return { status: "rejected", diagnostics };
}

function isDiagnostic(
  value: unknown,
): value is WorldChangeDiagnosticV1 {
  return typeof value === "object" && !isNil(value) && "code" in value;
}

function isFirstBatchPath(
  path: string,
): path is (typeof FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1)[number] {
  return FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1.some(
    (allowedPath) => allowedPath === path,
  );
}

function isSortedUniqueOverridePaths(paths: readonly string[]): boolean {
  const seen = new Set<string>();
  let previous: string | undefined;
  for (const path of paths) {
    if (!isOverridePath(path) || !isFirstBatchPath(path) || seen.has(path)) {
      return false;
    }
    if (!isNil(previous) && previous.localeCompare(path) >= 0) {
      return false;
    }
    seen.add(path);
    previous = path;
  }
  return true;
}

function parseOverridePaths(
  value: unknown,
  instancePath: string,
): readonly string[] | WorldChangeDiagnosticV1 {
  if (!Array.isArray(value)) {
    return diagnostic(
      "DEFINITION_OVERRIDE_PATH_FORBIDDEN",
      instancePath,
      "Override path set must be a unique lexicographically sorted Canonical field path list.",
    );
  }
  const paths = value.filter((path): path is string => typeof path === "string");
  if (paths.length !== value.length || !isSortedUniqueOverridePaths(paths)) {
    return diagnostic(
      "DEFINITION_OVERRIDE_PATH_FORBIDDEN",
      instancePath,
      "Override path set must stay inside the first-batch ceiling and remain unique and sorted.",
    );
  }
  return paths;
}

function parseCompatibleResourceRefsByPath(
  value: unknown,
): Readonly<Record<string, readonly string[]>> | undefined {
  if (isNil(value)) return undefined;
  const record = snapshotDataRecord(value);
  if (isNil(record)) return undefined;
  const parsed: Record<string, readonly string[]> = {};
  for (const [path, refs] of Object.entries(record)) {
    if (!isOverridePath(path) || !Array.isArray(refs)) return undefined;
    const resourceRefs = refs.filter((ref): ref is string => isNonEmptyString(ref));
    if (
      resourceRefs.length !== refs.length ||
      new Set(resourceRefs).size !== resourceRefs.length
    ) {
      return undefined;
    }
    parsed[path] = resourceRefs;
  }
  return parsed;
}

function parseDefinitionOwner(
  value: unknown,
): DefinitionOverrideOwnerV1 | WorldChangeDiagnosticV1 {
  const record = snapshotDataRecord(value);
  if (
    isNil(record) ||
    !hasRequiredAndOptionalKeys(
      record,
      ["definitionKind", "definitionRef", "allowedOverridePaths"],
      ["compatibleResourceRefsByPath", "bodyTopology", "mediumProfileRef"],
    ) ||
    !isNonEmptyString(record.definitionKind) ||
    !isNonEmptyString(record.definitionRef)
  ) {
    return diagnostic(
      "DEFINITION_OVERRIDE_PATH_FORBIDDEN",
      "/definition",
      "Definition override owner is not a closed generic Definition policy record.",
    );
  }
  const allowedOverridePaths = parseOverridePaths(
    record.allowedOverridePaths,
    "/definition/allowedOverridePaths",
  );
  if (isDiagnostic(allowedOverridePaths)) return allowedOverridePaths;
  const compatibleResourceRefsByPath = parseCompatibleResourceRefsByPath(
    record.compatibleResourceRefsByPath,
  );
  if (
    Object.hasOwn(record, "compatibleResourceRefsByPath") &&
    isNil(compatibleResourceRefsByPath)
  ) {
    return diagnostic(
      "DEFINITION_OVERRIDE_VALUE_INVALID",
      "/definition/compatibleResourceRefsByPath",
      "Definition-specific compatible Resource Refs are not a closed path map.",
    );
  }
  if (
    Object.hasOwn(record, "bodyTopology") &&
    !isNonEmptyString(record.bodyTopology)
  ) {
    return diagnostic(
      "DEFINITION_OVERRIDE_VALUE_INVALID",
      "/definition/bodyTopology",
      "Definition body compatibility fact must be a non-empty string.",
    );
  }
  if (
    Object.hasOwn(record, "mediumProfileRef") &&
    !isNonEmptyString(record.mediumProfileRef)
  ) {
    return diagnostic(
      "DEFINITION_OVERRIDE_VALUE_INVALID",
      "/definition/mediumProfileRef",
      "Definition Medium compatibility fact must be a non-empty Resource Ref.",
    );
  }
  return {
    definitionKind: record.definitionKind,
    definitionRef: record.definitionRef,
    allowedOverridePaths,
    ...(isNil(compatibleResourceRefsByPath)
      ? {}
      : { compatibleResourceRefsByPath }),
    ...(isNonEmptyString(record.bodyTopology)
      ? { bodyTopology: record.bodyTopology }
      : {}),
    ...(isNonEmptyString(record.mediumProfileRef)
      ? { mediumProfileRef: record.mediumProfileRef }
      : {}),
  };
}

function parseLockEntry(
  value: unknown,
  instancePath: string,
): DefinitionOverrideLockEntryV1 | WorldChangeDiagnosticV1 {
  const record = snapshotDataRecord(value);
  if (
    isNil(record) ||
    !hasRequiredAndOptionalKeys(
      record,
      [
        "resourceRef",
        "resourceKind",
        "contentHash",
        "requiredCapabilityRefs",
        "runtimeStatus",
      ],
      ["supportedBodyTopologies", "mediumProfileRef"],
    ) ||
    !isNonEmptyString(record.resourceRef) ||
    !REGISTRY_RESOURCE_KINDS_V1.some((kind) => kind === record.resourceKind) ||
    !isSha256(record.contentHash) ||
    (
      record.runtimeStatus !== "implemented" &&
      record.runtimeStatus !== "reserved"
    )
  ) {
    return diagnostic(
      "DEFINITION_OVERRIDE_VALUE_INVALID",
      instancePath,
      "Registry Lock entry is not a closed override compatibility view.",
    );
  }
  if (!Array.isArray(record.requiredCapabilityRefs)) {
    return diagnostic(
      "DEFINITION_OVERRIDE_VALUE_INVALID",
      `${instancePath}/requiredCapabilityRefs`,
      "Registry Lock requiredCapabilityRefs must be a unique Resource Ref list.",
    );
  }
  const requiredCapabilityRefs = record.requiredCapabilityRefs.filter(
    (capabilityRef): capabilityRef is string => isNonEmptyString(capabilityRef),
  );
  if (
    requiredCapabilityRefs.length !== record.requiredCapabilityRefs.length ||
    new Set(requiredCapabilityRefs).size !== requiredCapabilityRefs.length
  ) {
    return diagnostic(
      "DEFINITION_OVERRIDE_VALUE_INVALID",
      `${instancePath}/requiredCapabilityRefs`,
      "Registry Lock requiredCapabilityRefs must be a unique Resource Ref list.",
    );
  }
  let supportedBodyTopologies: readonly string[] | undefined;
  if (Object.hasOwn(record, "supportedBodyTopologies")) {
    if (!Array.isArray(record.supportedBodyTopologies)) {
      return diagnostic(
        "DEFINITION_OVERRIDE_VALUE_INVALID",
        `${instancePath}/supportedBodyTopologies`,
        "Registry Lock supportedBodyTopologies must be a unique string list.",
      );
    }
    supportedBodyTopologies = record.supportedBodyTopologies.filter(
      (topology): topology is string => isNonEmptyString(topology),
    );
    if (
      supportedBodyTopologies.length !== record.supportedBodyTopologies.length ||
      new Set(supportedBodyTopologies).size !== supportedBodyTopologies.length
    ) {
      return diagnostic(
        "DEFINITION_OVERRIDE_VALUE_INVALID",
        `${instancePath}/supportedBodyTopologies`,
        "Registry Lock supportedBodyTopologies must be a unique string list.",
      );
    }
  }
  if (
    Object.hasOwn(record, "mediumProfileRef") &&
    !isNonEmptyString(record.mediumProfileRef)
  ) {
    return diagnostic(
      "DEFINITION_OVERRIDE_VALUE_INVALID",
      `${instancePath}/mediumProfileRef`,
      "Registry Lock Medium compatibility fact must be a non-empty Resource Ref.",
    );
  }
  return {
    resourceRef: record.resourceRef,
    resourceKind: record.resourceKind as RegistryResourceKindV1,
    contentHash: record.contentHash,
    requiredCapabilityRefs,
    runtimeStatus: record.runtimeStatus,
    ...(isNil(supportedBodyTopologies) ? {} : { supportedBodyTopologies }),
    ...(isNonEmptyString(record.mediumProfileRef)
      ? { mediumProfileRef: record.mediumProfileRef }
      : {}),
  };
}

function parseLockEntries(
  value: readonly unknown[],
): readonly DefinitionOverrideLockEntryV1[] | WorldChangeDiagnosticV1 {
  const rows = snapshotDataArray(value);
  if (isNil(rows)) {
    return diagnostic(
      "DEFINITION_OVERRIDE_VALUE_INVALID",
      "/registryLockEntries",
      "Registry Lock entries must be a closed unique resource set.",
    );
  }
  const parsed: DefinitionOverrideLockEntryV1[] = [];
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const entry = parseLockEntry(row, `/registryLockEntries/${index}`);
    if (!("resourceRef" in entry)) return entry;
    if (seen.has(entry.resourceRef)) {
      return diagnostic(
        "DEFINITION_OVERRIDE_VALUE_INVALID",
        `/registryLockEntries/${index}/resourceRef`,
        "Registry Lock entries must use unique Resource Refs.",
      );
    }
    seen.add(entry.resourceRef);
    parsed.push(entry);
  }
  return parsed;
}

function parseOverride(
  value: unknown,
): DefinitionResourceRefOverrideV1 | WorldChangeDiagnosticV1 {
  try {
    return parseDefinitionResourceRefOverrideV1(value);
  } catch {
    return diagnostic(
      "DEFINITION_OVERRIDE_PATH_FORBIDDEN",
      "/override/path",
      "Override path is not a Canonical field path inside the first-batch Resource Ref Override shape.",
    );
  }
}

export function effectiveAllowedOverridePathsV1(
  definitionAllowedOverridePaths: readonly string[],
  projectionAllowedOverridePaths: readonly string[],
  hostPolicyAllowedOverridePaths: readonly string[],
): readonly string[] {
  return sortBy(
    intersection(
      definitionAllowedOverridePaths,
      projectionAllowedOverridePaths,
      hostPolicyAllowedOverridePaths,
    ),
  );
}

export function validateDefinitionResourceRefOverrideV1(
  input: ValidateDefinitionResourceRefOverrideInputV1,
): ValidateDefinitionResourceRefOverrideResultV1 {
  const definition = parseDefinitionOwner(input.definition);
  if (!("definitionKind" in definition)) return rejected([definition]);
  const projectionAllowedOverridePaths = parseOverridePaths(
    input.projectionAllowedOverridePaths,
    "/projectionAllowedOverridePaths",
  );
  if (isDiagnostic(projectionAllowedOverridePaths)) {
    return rejected([projectionAllowedOverridePaths]);
  }
  const hostPolicyAllowedOverridePaths = parseOverridePaths(
    input.hostPolicyAllowedOverridePaths,
    "/hostPolicyAllowedOverridePaths",
  );
  if (isDiagnostic(hostPolicyAllowedOverridePaths)) {
    return rejected([hostPolicyAllowedOverridePaths]);
  }
  const effectiveAllowedOverridePaths = effectiveAllowedOverridePathsV1(
    definition.allowedOverridePaths,
    projectionAllowedOverridePaths,
    hostPolicyAllowedOverridePaths,
  );
  const override = parseOverride(input.override);
  if (!("path" in override)) return rejected([override]);
  if (!effectiveAllowedOverridePaths.includes(override.path)) {
    return rejected([
      diagnostic(
        "DEFINITION_OVERRIDE_PATH_FORBIDDEN",
        "/override/path",
        `Override path '${override.path}' is outside the Definition/Projection/Host intersection.`,
      ),
    ]);
  }
  if (!isFirstBatchPath(override.path)) {
    return rejected([
      diagnostic(
        "DEFINITION_OVERRIDE_PATH_FORBIDDEN",
        "/override/path",
        `Override path '${override.path}' is outside the first-batch ceiling.`,
      ),
    ]);
  }
  const expectedKind = FIRST_BATCH_OVERRIDE_RESOURCE_KIND_BY_PATH_V1[override.path];
  const lockEntries = parseLockEntries(input.registryLockEntries);
  if (isDiagnostic(lockEntries)) return rejected([lockEntries]);
  const lockEntry = lockEntries.find(
    (entry) => entry.resourceRef === override.resourceRef,
  );
  if (isNil(lockEntry)) {
    return rejected([
      diagnostic(
        "DEFINITION_OVERRIDE_VALUE_INVALID",
        "/override/resourceRef",
        `Override Resource Ref '${override.resourceRef}' is not present in the Registry Lock.`,
      ),
    ]);
  }
  if (lockEntry.runtimeStatus === "reserved") {
    return rejected([
      diagnostic(
        "DEFINITION_OVERRIDE_VALUE_INVALID",
        "/override/resourceRef",
        `Override Resource Ref '${override.resourceRef}' is reserved.`,
      ),
    ]);
  }
  if (lockEntry.resourceKind !== expectedKind) {
    return rejected([
      diagnostic(
        "DEFINITION_OVERRIDE_VALUE_INVALID",
        "/override/resourceRef",
        `Override Resource Ref '${override.resourceRef}' is not a '${expectedKind}'.`,
      ),
    ]);
  }
  const allowedCapabilities = new Set(input.allowedCapabilityRefs);
  if (
    !lockEntry.requiredCapabilityRefs.every((capabilityRef) =>
      allowedCapabilities.has(capabilityRef),
    )
  ) {
    return rejected([
      diagnostic(
        "DEFINITION_OVERRIDE_VALUE_INVALID",
        "/override/resourceRef",
        `Override Resource Ref '${override.resourceRef}' requires a Capability outside the current set.`,
      ),
    ]);
  }
  const compatibleRefs =
    definition.compatibleResourceRefsByPath?.[override.path];
  if (
    !isNil(compatibleRefs) &&
    !compatibleRefs.includes(override.resourceRef)
  ) {
    return rejected([
      diagnostic(
        "DEFINITION_OVERRIDE_VALUE_INVALID",
        "/override/resourceRef",
        `Override Resource Ref '${override.resourceRef}' is not Definition-compatible on '${override.path}'.`,
      ),
    ]);
  }
  if (
    !isNil(definition.bodyTopology) &&
    !isNil(lockEntry.supportedBodyTopologies) &&
    !lockEntry.supportedBodyTopologies.includes(definition.bodyTopology)
  ) {
    return rejected([
      diagnostic(
        "DEFINITION_OVERRIDE_VALUE_INVALID",
        "/override/resourceRef",
        `Override Resource Ref '${override.resourceRef}' does not support body topology '${definition.bodyTopology}'.`,
      ),
    ]);
  }
  if (
    !isNil(definition.mediumProfileRef) &&
    !isNil(lockEntry.mediumProfileRef) &&
    lockEntry.mediumProfileRef !== definition.mediumProfileRef
  ) {
    return rejected([
      diagnostic(
        "DEFINITION_OVERRIDE_VALUE_INVALID",
        "/override/resourceRef",
        `Override Resource Ref '${override.resourceRef}' does not match Medium '${definition.mediumProfileRef}'.`,
      ),
    ]);
  }
  return {
    status: "accepted",
    override,
    effectiveAllowedOverridePaths,
  };
}
