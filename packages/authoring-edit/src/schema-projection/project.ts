import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil, omit } from "lodash-es";

import {
  parseAiSchemaProjectionProfileV1,
  parseAiSchemaProjectionRequestV1,
  parseAiSchemaProjectionV1,
  parseWorldChangeDiagnosticV1,
} from "../authoring-edit.js";
import {
  hasRequiredAndOptionalKeys,
  invalid,
  snapshotDataRecord,
  type Sha256HashV1,
} from "../parse-kernel.js";
import {
  REGISTRY_RESOURCE_KINDS_V1,
  WORLD_CHANGE_OPERATION_TYPES_V1,
  type AiSchemaCanonicalPathMappingV1,
  type AiSchemaProjectionDegradationV1,
  type AiSchemaProjectionProfileV1,
  type AiSchemaProjectionRequestV1,
  type AiSchemaProjectionV1,
  type RegistryResourceKindV1,
  type RegistrySearchResultV1,
  type WorldChangeDiagnosticV1,
  type WorldChangeOperationTypeV1,
} from "../types.js";
import {
  canonicalizeRegistryLockEntriesV1,
  hashCapabilitySetV1,
  hashCanonicalAuthoringSchemaV1,
  hashRegistryLockEntriesV1,
  projectedSchemaByteLengthV1,
} from "./hashes.js";

const PROFILE_BODY_KEYS = [
  "kind",
  "schemaVersion",
  "id",
  "version",
  "resourceRef",
  "maximumPropertyCount",
  "maximumNestingDepth",
  "maximumEnumValueCount",
  "maximumSchemaBytes",
  "maximumRegistrySearchResultCount",
  "optionalFieldMode",
] as const;

const PROFILE_SOURCE_OPTIONAL_KEYS = [
  "contentHash",
  "authoringAvailability",
  "aiMetadata",
] as const;

const REGISTRY_FORMAT_CONSTRAINTS = {
  "subject-definition-ref": {
    resourceKind: "subject-definition",
    pattern:
      "^(?:worldkit|package)://subject-definition/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$",
  },
  "capability-ref": {
    resourceKind: "capability",
    pattern: "^worldkit://capability/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$",
  },
  "physics-body-profile-ref": {
    resourceKind: "physics-body-profile",
    pattern:
      "^worldkit://physics-body-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$",
  },
  "locomotion-profile-ref": {
    resourceKind: "locomotion-profile",
    pattern:
      "^worldkit://locomotion-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$",
  },
  "collider-derivation-profile-ref": {
    resourceKind: "collider-derivation-profile",
    pattern:
      "^worldkit://collider-derivation-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$",
  },
  "traversal-surface-profile-ref": {
    resourceKind: "traversal-surface-profile",
    pattern:
      "^worldkit://traversal-surface-profile/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$",
  },
} as const satisfies Record<
  string,
  { readonly resourceKind: RegistryResourceKindV1; readonly pattern: string }
>;

type RegistryFormatNameV1 = keyof typeof REGISTRY_FORMAT_CONSTRAINTS;

const OPERATION_TYPES = new Set<WorldChangeOperationTypeV1>(
  WORLD_CHANGE_OPERATION_TYPES_V1,
);
const REGISTRY_KINDS = new Set<RegistryResourceKindV1>(REGISTRY_RESOURCE_KINDS_V1);

export interface ProjectAiSchemaInputV1 {
  readonly projectionId: string;
  readonly request: unknown;
  readonly projectionProfile: unknown;
  readonly canonicalAuthoringSchema: unknown;
  readonly registryLockEntries: readonly unknown[];
  readonly allowedCapabilityRefs: readonly string[];
  readonly allowedWorldChangeOperationTypes: readonly WorldChangeOperationTypeV1[];
  readonly includeExperimental: boolean;
}

export type ProjectAiSchemaResultV1 =
  | { readonly status: "accepted"; readonly projection: AiSchemaProjectionV1 }
  | {
      readonly status: "rejected";
      readonly diagnostics: readonly WorldChangeDiagnosticV1[];
    };

export function parseAiSchemaProjectionProfileSourceV1(
  input: unknown,
): AiSchemaProjectionProfileV1 {
  const record = snapshotDataRecord(input) ?? invalid("AiSchemaProjectionProfileV1");
  if (
    !hasRequiredAndOptionalKeys(
      record,
      PROFILE_BODY_KEYS,
      PROFILE_SOURCE_OPTIONAL_KEYS,
    )
  ) {
    invalid("AiSchemaProjectionProfileV1");
  }
  const body = {
    kind: record.kind,
    schemaVersion: record.schemaVersion,
    id: record.id,
    version: record.version,
    resourceRef: record.resourceRef,
    maximumPropertyCount: record.maximumPropertyCount,
    maximumNestingDepth: record.maximumNestingDepth,
    maximumEnumValueCount: record.maximumEnumValueCount,
    maximumSchemaBytes: record.maximumSchemaBytes,
    maximumRegistrySearchResultCount: record.maximumRegistrySearchResultCount,
    optionalFieldMode: record.optionalFieldMode,
  };
  return parseAiSchemaProjectionProfileV1({
    ...body,
    contentHash: sha256CanonicalJson(body),
  });
}

function diagnostic(
  code: WorldChangeDiagnosticV1["code"],
  instancePath: string,
  message: string,
  details?: WorldChangeDiagnosticV1["details"],
): WorldChangeDiagnosticV1 {
  return parseWorldChangeDiagnosticV1({
    severity: "error",
    code,
    instancePath,
    message,
    ...(isNil(details) ? {} : { details }),
  });
}

function rejected(
  diagnostics: readonly WorldChangeDiagnosticV1[],
): ProjectAiSchemaResultV1 {
  return { status: "rejected", diagnostics };
}

function parseOperationTypes(
  values: readonly WorldChangeOperationTypeV1[],
): readonly WorldChangeOperationTypeV1[] | undefined {
  if (!values.every((value) => OPERATION_TYPES.has(value))) return undefined;
  if (new Set(values).size !== values.length) return undefined;
  return values;
}

function schemaTypeList(node: Record<string, unknown>): readonly string[] {
  if (typeof node.type === "string") return [node.type];
  if (Array.isArray(node.type) && node.type.every((value) => typeof value === "string")) {
    return node.type as string[];
  }
  return [];
}

function schemaAllowsNull(node: unknown): boolean {
  if (isNil(node) || typeof node !== "object" || Array.isArray(node)) return false;
  const record = node as Record<string, unknown>;
  if (schemaTypeList(record).includes("null")) return true;
  const unions = [record.anyOf, record.oneOf];
  return unions.some((branch) =>
    Array.isArray(branch) && branch.some((child) => schemaAllowsNull(child))
  );
}

function makePropertyNullable(node: Record<string, unknown>): void {
  const types = schemaTypeList(node);
  if (types.length > 0) {
    if (!types.includes("null")) node.type = [...types, "null"];
    return;
  }
  if (typeof node.$ref === "string") {
    const ref = node.$ref;
    delete node.$ref;
    node.anyOf = [{ $ref: ref }, { type: "null" }];
  }
}

function requiredPropertyNames(node: Record<string, unknown>): string[] {
  if (!Array.isArray(node.required)) return [];
  return node.required.filter((value): value is string => typeof value === "string");
}

interface SchemaBudgetV1 {
  propertyCount: number;
  maxDepth: number;
}

function measureSchema(node: unknown, depth: number, acc: SchemaBudgetV1): void {
  if (isNil(node) || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) measureSchema(child, depth, acc);
    return;
  }
  const record = node as Record<string, unknown>;
  if (
    !isNil(record.properties) &&
    typeof record.properties === "object" &&
    !Array.isArray(record.properties)
  ) {
    const properties = record.properties as Record<string, unknown>;
    acc.propertyCount += Object.keys(properties).length;
    acc.maxDepth = Math.max(acc.maxDepth, depth + 1);
    for (const child of Object.values(properties)) {
      measureSchema(child, depth + 1, acc);
    }
  }
  if (!isNil(record.items)) measureSchema(record.items, depth + 1, acc);
  if (
    !isNil(record.additionalProperties) &&
    typeof record.additionalProperties === "object"
  ) {
    measureSchema(record.additionalProperties, depth + 1, acc);
  }
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    const branches = record[key];
    if (Array.isArray(branches)) {
      for (const child of branches) measureSchema(child, depth, acc);
    }
  }
  for (const key of ["if", "then", "else", "not"] as const) {
    if (!isNil(record[key])) measureSchema(record[key], depth, acc);
  }
  if (!isNil(record.$defs) && typeof record.$defs === "object" && !Array.isArray(record.$defs)) {
    for (const child of Object.values(record.$defs as Record<string, unknown>)) {
      measureSchema(child, depth, acc);
    }
  }
}

function visitSchemaNodes(
  node: unknown,
  instancePath: string,
  visit: (record: Record<string, unknown>, instancePath: string) => void,
): void {
  if (isNil(node) || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => visitSchemaNodes(child, `${instancePath}/${index}`, visit));
    return;
  }
  const record = node as Record<string, unknown>;
  visit(record, instancePath);
  if (
    !isNil(record.properties) &&
    typeof record.properties === "object" &&
    !Array.isArray(record.properties)
  ) {
    for (const [key, child] of Object.entries(record.properties as Record<string, unknown>)) {
      visitSchemaNodes(child, `${instancePath}/${key}`, visit);
    }
  }
  if (!isNil(record.items)) visitSchemaNodes(record.items, `${instancePath}/0`, visit);
  if (
    !isNil(record.additionalProperties) &&
    typeof record.additionalProperties === "object"
  ) {
    visitSchemaNodes(record.additionalProperties, instancePath, visit);
  }
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    const branches = record[key];
    if (Array.isArray(branches)) {
      for (const child of branches) visitSchemaNodes(child, instancePath, visit);
    }
  }
  for (const key of ["if", "then", "else", "not"] as const) {
    if (!isNil(record[key])) visitSchemaNodes(record[key], instancePath, visit);
  }
  if (!isNil(record.$defs) && typeof record.$defs === "object" && !Array.isArray(record.$defs)) {
    for (const [key, child] of Object.entries(record.$defs as Record<string, unknown>)) {
      visitSchemaNodes(child, `${instancePath}/$defs/${key}`, visit);
    }
  }
}

function isAdmittedLockEntry(
  entry: RegistrySearchResultV1,
  allowedCapabilities: ReadonlySet<string>,
  includeExperimental: boolean,
): boolean {
  if (entry.authoringAvailability === "experimental" && includeExperimental !== true) {
    return false;
  }
  return entry.requiredCapabilityRefs.every((capabilityRef) =>
    allowedCapabilities.has(capabilityRef)
  );
}

function admittedRefsForKind(
  lockEntries: readonly RegistrySearchResultV1[],
  resourceKind: RegistryResourceKindV1,
  allowedCapabilities: ReadonlySet<string>,
  includeExperimental: boolean,
): readonly string[] {
  return lockEntries
    .filter((entry) =>
      entry.resourceKind === resourceKind &&
      isAdmittedLockEntry(entry, allowedCapabilities, includeExperimental)
    )
    .map((entry) => entry.resourceRef)
    .sort((left, right) => left.localeCompare(right));
}

function paddedId(prefix: string, index: number): string {
  return `${prefix}.${String(index + 1).padStart(3, "0")}`;
}

function collectUnrepresentable(
  schema: Record<string, unknown>,
): WorldChangeDiagnosticV1 | undefined {
  let found: WorldChangeDiagnosticV1 | undefined;
  visitSchemaNodes(schema, "", (record, instancePath) => {
    if (!isNil(found)) return;
    if (
      isNil(record.properties) ||
      typeof record.properties !== "object" ||
      Array.isArray(record.properties)
    ) return;
    const required = new Set(requiredPropertyNames(record));
    for (const [key, child] of Object.entries(record.properties as Record<string, unknown>)) {
      if (required.has(key)) continue;
      if (!schemaAllowsNull(child)) continue;
      found = diagnostic(
        "AI_SCHEMA_PROFILE_UNREPRESENTABLE",
        `${instancePath}/${key}`,
        "Canonical field allows both omitted and explicit null.",
      );
    }
  });
  return found;
}

function applyOptionalFieldMode(
  schema: Record<string, unknown>,
  mode: AiSchemaProjectionProfileV1["optionalFieldMode"],
): readonly AiSchemaCanonicalPathMappingV1[] {
  if (mode !== "required-nullable-with-round-trip-map") return [];
  const mappings: AiSchemaCanonicalPathMappingV1[] = [];
  visitSchemaNodes(schema, "", (record, instancePath) => {
    if (
      isNil(record.properties) ||
      typeof record.properties !== "object" ||
      Array.isArray(record.properties)
    ) return;
    const properties = record.properties as Record<string, unknown>;
    const required = new Set(requiredPropertyNames(record));
    for (const [key, child] of Object.entries(properties)) {
      if (required.has(key)) continue;
      if (isNil(child) || typeof child !== "object" || Array.isArray(child)) continue;
      const property = child as Record<string, unknown>;
      required.add(key);
      makePropertyNullable(property);
      mappings.push({
        id: paddedId("map.null-omitted", mappings.length),
        mode: "null-to-omitted",
        projectionInstancePath: `${instancePath}/${key}`,
        canonicalInstancePath: `${instancePath}/${key}`,
      });
    }
    record.required = [...required].sort((left, right) => left.localeCompare(right));
  });
  return mappings;
}

interface RegistryFieldSiteV1 {
  readonly record: Record<string, unknown>;
  readonly instancePath: string;
  readonly resourceKind: RegistryResourceKindV1;
  readonly format: RegistryFormatNameV1;
  readonly pattern: string;
  refs: readonly string[];
}

function collectRegistryFieldSites(
  schema: Record<string, unknown>,
  lockEntries: readonly RegistrySearchResultV1[],
  allowedCapabilities: ReadonlySet<string>,
  includeExperimental: boolean,
): RegistryFieldSiteV1[] {
  const sites: RegistryFieldSiteV1[] = [];
  visitSchemaNodes(schema, "", (record, instancePath) => {
    if (typeof record.format !== "string") return;
    if (!(record.format in REGISTRY_FORMAT_CONSTRAINTS)) return;
    const format = record.format as RegistryFormatNameV1;
    const constraint = REGISTRY_FORMAT_CONSTRAINTS[format];
    sites.push({
      record,
      instancePath,
      resourceKind: constraint.resourceKind,
      format,
      pattern: constraint.pattern,
      refs: admittedRefsForKind(
        lockEntries,
        constraint.resourceKind,
        allowedCapabilities,
        includeExperimental,
      ),
    });
  });
  return sites;
}

function applyRegistryEnums(
  schema: Record<string, unknown>,
  sites: readonly RegistryFieldSiteV1[],
  profile: AiSchemaProjectionProfileV1,
): readonly AiSchemaProjectionDegradationV1[] {
  const degradations: AiSchemaProjectionDegradationV1[] = [];
  for (const site of sites) {
    if (isEmpty(site.refs)) {
      if (isNil(site.record.pattern)) site.record.pattern = site.pattern;
      continue;
    }
    if (site.refs.length > profile.maximumEnumValueCount) {
      delete site.record.enum;
      if (isNil(site.record.pattern)) site.record.pattern = site.pattern;
      degradations.push({
        id: paddedId("degrade.enum-to-ref", degradations.length),
        type: "registry-enum-to-resource-ref",
        canonicalInstancePath: site.instancePath,
        resourceKind: site.resourceKind,
        reason: "enum-value-count-budget",
      });
      continue;
    }
    site.record.enum = [...site.refs];
    if (isNil(site.record.pattern)) site.record.pattern = site.pattern;
  }

  const oversized = [...sites]
    .filter((site) => Array.isArray(site.record.enum))
    .sort((left, right) => right.refs.length - left.refs.length);
  for (const site of oversized) {
    if (projectedSchemaByteLengthV1(schema) <= profile.maximumSchemaBytes) break;
    delete site.record.enum;
    if (isNil(site.record.pattern)) site.record.pattern = site.pattern;
    degradations.push({
      id: paddedId("degrade.enum-to-ref", degradations.length),
      type: "registry-enum-to-resource-ref",
      canonicalInstancePath: site.instancePath,
      resourceKind: site.resourceKind,
      reason: "schema-bytes-budget",
    });
  }
  return degradations;
}

export function projectAiSchemaV1(
  input: ProjectAiSchemaInputV1,
): ProjectAiSchemaResultV1 {
  const request = parseAiSchemaProjectionRequestV1(input.request) as AiSchemaProjectionRequestV1;
  const projectionProfile = parseAiSchemaProjectionProfileSourceV1(input.projectionProfile);
  if (request.projectionProfileRef !== projectionProfile.resourceRef) {
    return rejected([
      diagnostic(
        "AI_SCHEMA_PROFILE_NOT_ALLOWED",
        "/projectionProfileRef",
        "Request Profile is not the Host-selected projection Profile.",
      ),
    ]);
  }
  const operationTypes = parseOperationTypes(input.allowedWorldChangeOperationTypes);
  if (isNil(operationTypes)) {
    return rejected([
      diagnostic(
        "AI_SCHEMA_PROFILE_NOT_ALLOWED",
        "/allowedWorldChangeOperationTypes",
        "Allowed WorldChange operation types are not a closed unique set.",
      ),
    ]);
  }

  let lockEntries: readonly RegistrySearchResultV1[];
  try {
    lockEntries = canonicalizeRegistryLockEntriesV1(input.registryLockEntries);
  } catch {
    return rejected([
      diagnostic(
        "REGISTRY_SEARCH_LOCK_MISMATCH",
        "/registryLockEntries",
        "Registry Lock entries are not a closed unique resource set.",
      ),
    ]);
  }
  if (lockEntries.some((entry) => !REGISTRY_KINDS.has(entry.resourceKind))) {
    return rejected([
      diagnostic(
        "REGISTRY_SEARCH_LOCK_MISMATCH",
        "/registryLockEntries",
        "Registry Lock contains an unknown resource kind.",
      ),
    ]);
  }

  let canonicalAuthoringSchema: Record<string, unknown>;
  try {
    const record = snapshotDataRecord(input.canonicalAuthoringSchema);
    if (isNil(record)) throw new RangeError("schema");
    canonicalAuthoringSchema = structuredClone(input.canonicalAuthoringSchema) as Record<
      string,
      unknown
    >;
  } catch {
    return rejected([
      diagnostic(
        "AI_SCHEMA_PROFILE_UNREPRESENTABLE",
        "/",
        "Canonical Authoring Schema is not a plain JSON object.",
      ),
    ]);
  }

  const unrepresentable = collectUnrepresentable(canonicalAuthoringSchema);
  if (!isNil(unrepresentable)) return rejected([unrepresentable]);

  const jsonSchema = structuredClone(canonicalAuthoringSchema);
  const canonicalPathMappings = applyOptionalFieldMode(
    jsonSchema,
    projectionProfile.optionalFieldMode,
  );
  const allowedCapabilities = new Set(input.allowedCapabilityRefs);
  const sites = collectRegistryFieldSites(
    jsonSchema,
    lockEntries,
    allowedCapabilities,
    input.includeExperimental,
  );
  const degradations = applyRegistryEnums(jsonSchema, sites, projectionProfile);

  const measured: SchemaBudgetV1 = { propertyCount: 0, maxDepth: 0 };
  measureSchema(jsonSchema, 0, measured);
  const schemaBytes = projectedSchemaByteLengthV1(jsonSchema);
  if (
    measured.propertyCount > projectionProfile.maximumPropertyCount ||
    measured.maxDepth > projectionProfile.maximumNestingDepth ||
    schemaBytes > projectionProfile.maximumSchemaBytes
  ) {
    return rejected([
      diagnostic(
        "AI_SCHEMA_PROJECTION_BUDGET_EXCEEDED",
        "/",
        `Projected schema exceeds Profile budgets (properties=${measured.propertyCount}, depth=${measured.maxDepth}, bytes=${schemaBytes}).`,
      ),
    ]);
  }

  let capabilitySetHash: Sha256HashV1;
  try {
    capabilitySetHash = hashCapabilitySetV1(input.allowedCapabilityRefs);
  } catch {
    return rejected([
      diagnostic(
        "AI_SCHEMA_PROFILE_NOT_ALLOWED",
        "/allowedCapabilityRefs",
        "Capability Set must be a unique Canonical resourceRef list.",
      ),
    ]);
  }
  const jsonSchemaHash = sha256CanonicalJson(jsonSchema) as Sha256HashV1;
  const body = {
    kind: "worldkit-ai-schema-projection" as const,
    schemaVersion: 1 as const,
    id: input.projectionId,
    requestId: request.id,
    projectionProfileRef: projectionProfile.resourceRef,
    projectionProfileHash: projectionProfile.contentHash,
    authoringSchemaVersion: 4 as const,
    canonicalAuthoringSchemaHash: hashCanonicalAuthoringSchemaV1(input.canonicalAuthoringSchema),
    registryLockHash: hashRegistryLockEntriesV1(lockEntries),
    capabilitySetHash,
    jsonSchemaDraft: "2020-12" as const,
    jsonSchema,
    jsonSchemaHash,
    allowedWorldChangeOperationTypes: operationTypes,
    canonicalPathMappings,
    degradations,
  };
  const projection = parseAiSchemaProjectionV1({
    ...body,
    aiSchemaProjectionHash: sha256CanonicalJson(body),
  });
  return { status: "accepted", projection };
}

export function projectionProfileBodyHashV1(profile: AiSchemaProjectionProfileV1): Sha256HashV1 {
  return sha256CanonicalJson(omit(profile, "contentHash")) as Sha256HashV1;
}
