import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  canonicalJsonBytes,
  sha256CanonicalJson,
} from "@whitebox-world/protocol";
import { isPlainObject } from "lodash-es";

export const WORLD_RECONSTRUCTION_DIMENSION_IDS_V1 = Object.freeze([
  "collider",
  "critical-traversal",
  "deterministic-build",
  "opening-composition",
  "semantic-silhouette",
  "spawn-support",
  "topology",
] as const);

export type WorldReconstructionDimensionIdV1 =
  (typeof WORLD_RECONSTRUCTION_DIMENSION_IDS_V1)[number];
export type WorldReconstructionOutcomeV1 = "passed" | "failed" | "incomplete";

export type WorldReconstructionMetricV1 =
  | Readonly<{ kind: "ratio-basis-points"; valueBasisPoints: number }>
  | Readonly<{
      kind: "normalized-distance-basis-points";
      valueBasisPoints: number;
    }>
  | Readonly<{ kind: "distance-millimeters"; valueMillimeters: number }>
  | Readonly<{ kind: "boolean-presence"; isPresent: boolean }>
  | Readonly<{ kind: "identity-match"; isMatch: boolean }>
  | Readonly<{
      kind: "receipt-outcome";
      outcome: "completed" | "failed" | "incomplete";
    }>;

export interface WorldReconstructionCaseV1 {
  readonly kind: "world-reconstruction-case";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sceneBriefRef: string;
  readonly sceneBriefHash: Sha256HashV1;
  readonly referenceInputs: readonly Readonly<{
    inputRef: string;
    contentHash: Sha256HashV1;
    mediaType: "image/png" | "image/jpeg" | "application/json";
  }>[];
  readonly evaluationProfileRef: string;
  readonly evaluationProfileHash: Sha256HashV1;
  readonly acceptanceTargetRefs: readonly string[];
  readonly requiredEvidenceProfileRefs: readonly string[];
  readonly topology: Readonly<{
    nodeIds: readonly string[];
    relations: readonly Readonly<{
      fromNodeId: string;
      relation: "connects-to" | "contains" | "above" | "blocks";
      toNodeId: string;
    }>[];
    layerIds: readonly string[];
  }>;
  readonly compositionTargetRefs: readonly string[];
  readonly spawnSupport: Readonly<{
    spawnMarkerId: string;
    supportColliderId: string;
  }>;
  readonly requiredColliders: readonly Readonly<{
    colliderId: string;
    role: "ground" | "blocker" | "step";
  }>[];
  readonly scriptedTraversalChecks: readonly Readonly<{
    id: string;
    evidenceKind: "scripted-fixed-input";
    expectation: "pass" | "block";
    checkpointIds: readonly string[];
  }>[];
}

export interface WorldReconstructionEvaluationProfileV1 {
  readonly kind: "world-reconstruction-evaluation-profile";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly dimensionIds: readonly WorldReconstructionDimensionIdV1[];
  readonly maximumRepairAttemptCount: 1;
  readonly builderSelfRepairAttemptCount: 0;
  readonly requiredEvidenceByDimension: readonly Readonly<{
    dimensionId: WorldReconstructionDimensionIdV1;
    evidenceProfileRefs: readonly string[];
  }>[];
}

export interface WorldReconstructionEvidenceSetV1 {
  readonly kind: "world-reconstruction-evidence-set";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly caseRef: string;
  readonly caseHash: Sha256HashV1;
  readonly evaluationProfileRef: string;
  readonly evaluationProfileHash: Sha256HashV1;
  readonly attemptRef: string;
  readonly attemptHash: Sha256HashV1;
  readonly sceneAuthoringAttemptResultRef: string;
  readonly sceneAuthoringAttemptResultHash: Sha256HashV1;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly worldPackageBuildReceiptRef: string;
  readonly worldPackageBuildReceiptHash: Sha256HashV1;
  readonly captureReceiptRef: string;
  readonly captureReceiptHash: Sha256HashV1;
  readonly identityEvidence: readonly Readonly<{
    role:
      | "scene-authoring-attempt"
      | "scene-authoring-attempt-result"
      | "world-package"
      | "world-package-build-receipt"
      | "capture";
    artifactRef: string;
    contentHash: Sha256HashV1;
  }>[];
  readonly dimensionEvidence: readonly Readonly<{
    dimensionId: WorldReconstructionDimensionIdV1;
    evidenceRefs: readonly string[];
  }>[];
  readonly advisoryPixelMetrics: readonly WorldReconstructionMetricV1[];
}

export interface WorldReconstructionEvaluationResultV1 {
  readonly kind: "world-reconstruction-evaluation-result";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly caseRef: string;
  readonly caseHash: Sha256HashV1;
  readonly evaluationProfileRef: string;
  readonly evaluationProfileHash: Sha256HashV1;
  readonly evidenceSetRef: string;
  readonly evidenceSetHash: Sha256HashV1;
  readonly attemptRef: string;
  readonly attemptHash: Sha256HashV1;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly captureReceiptRef: string;
  readonly captureReceiptHash: Sha256HashV1;
  readonly outcome: WorldReconstructionOutcomeV1;
  readonly diagnostics: readonly WorldReconstructionDiagnosticV1[];
  readonly dimensions: readonly WorldReconstructionDimensionResultV1[];
}

export interface WorldReconstructionDimensionResultV1 {
  readonly dimensionId: WorldReconstructionDimensionIdV1;
  readonly status: WorldReconstructionOutcomeV1;
  readonly metrics: readonly WorldReconstructionMetricV1[];
  readonly evidenceRefs: readonly string[];
  readonly diagnosticIds: readonly string[];
  readonly identity: Readonly<{
    attemptHash: Sha256HashV1;
    worldPackageRootHash: Sha256HashV1;
    captureReceiptHash: Sha256HashV1;
  }>;
}

export type WorldReconstructionDiagnosticCodeV1 =
  | "WORLD_RECONSTRUCTION_TOPOLOGY_NODE_MISSING"
  | "WORLD_RECONSTRUCTION_TOPOLOGY_RELATION_MISSING"
  | "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT"
  | "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT"
  | "WORLD_RECONSTRUCTION_SPAWN_SUPPORT_MISSING"
  | "WORLD_RECONSTRUCTION_COLLIDER_MISSING"
  | "WORLD_RECONSTRUCTION_COLLIDER_ROLE_MISMATCH"
  | "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED"
  | "WORLD_RECONSTRUCTION_REQUIRED_BLOCKER_PASSABLE"
  | "WORLD_RECONSTRUCTION_BUILD_NONDETERMINISTIC"
  | "WORLD_RECONSTRUCTION_EVIDENCE_STALE"
  | "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING";

export interface WorldReconstructionDiagnosticV1 {
  readonly kind: "world-reconstruction-diagnostic";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly code: WorldReconstructionDiagnosticCodeV1;
  readonly dimensionId: WorldReconstructionDimensionIdV1;
  readonly acceptanceTargetRef: string;
  readonly evidenceRefs: readonly string[];
  readonly message: string;
  readonly repairAction:
    | Readonly<{ kind: "revise-native-source" }>
    | Readonly<{ kind: "select-native-resource"; resourceRef: string }>;
}

export interface WorldReconstructionRunReceiptV1 {
  readonly kind: "world-reconstruction-run-receipt";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly caseRef: string;
  readonly caseHash: Sha256HashV1;
  readonly evaluationProfileRef: string;
  readonly evaluationProfileHash: Sha256HashV1;
  readonly outcome: WorldReconstructionOutcomeV1;
  readonly attempts: readonly Readonly<{
    attemptIndex: 0 | 1;
    generationRequestRef: string;
    generationRequestHash: Sha256HashV1;
    generationReceiptRef: string;
    generationReceiptHash: Sha256HashV1;
    sceneAuthoringAttemptRef: string;
    sceneAuthoringAttemptHash: Sha256HashV1;
    sceneAuthoringAttemptResultRef: string;
    sceneAuthoringAttemptResultHash: Sha256HashV1;
    worldPackageRef: string;
    worldPackageRootHash: Sha256HashV1;
    worldPackageBuildReceiptRef: string;
    worldPackageBuildReceiptHash: Sha256HashV1;
    captureReceiptRef: string;
    captureReceiptHash: Sha256HashV1;
    evaluationResultRef: string;
    evaluationResultHash: Sha256HashV1;
    outcome: WorldReconstructionOutcomeV1;
  }>[];
  readonly finalAttemptIndex: 0 | 1;
  readonly finalEvaluationResultRef: string;
  readonly finalEvaluationResultHash: Sha256HashV1;
  readonly cleanupOutcome: "completed" | "failed";
}

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;
const CASE_FIELDS = [
  "kind", "schemaVersion", "id", "sceneBriefRef", "sceneBriefHash",
  "referenceInputs", "evaluationProfileRef", "evaluationProfileHash",
  "acceptanceTargetRefs", "requiredEvidenceProfileRefs", "topology",
  "compositionTargetRefs", "spawnSupport", "requiredColliders",
  "scriptedTraversalChecks",
] as const;
const PROFILE_FIELDS = [
  "kind", "schemaVersion", "id", "dimensionIds", "maximumRepairAttemptCount",
  "builderSelfRepairAttemptCount", "requiredEvidenceByDimension",
] as const;
const EVIDENCE_FIELDS = [
  "kind", "schemaVersion", "id", "caseRef", "caseHash", "evaluationProfileRef",
  "evaluationProfileHash", "attemptRef", "attemptHash", "worldPackageRef",
  "sceneAuthoringAttemptResultRef", "sceneAuthoringAttemptResultHash",
  "worldPackageRootHash", "worldPackageBuildReceiptRef",
  "worldPackageBuildReceiptHash", "captureReceiptRef", "captureReceiptHash",
  "identityEvidence", "dimensionEvidence", "advisoryPixelMetrics",
] as const;
const RESULT_FIELDS = [
  "kind", "schemaVersion", "id", "caseRef", "caseHash", "evaluationProfileRef",
  "evaluationProfileHash", "evidenceSetRef", "evidenceSetHash", "attemptRef",
  "attemptHash", "worldPackageRef", "worldPackageRootHash", "captureReceiptRef",
  "captureReceiptHash", "outcome", "diagnostics", "dimensions",
] as const;
const DIAGNOSTIC_FIELDS = [
  "kind", "schemaVersion", "id", "code", "dimensionId",
  "acceptanceTargetRef", "evidenceRefs", "message", "repairAction",
] as const;
const RUN_FIELDS = [
  "kind", "schemaVersion", "id", "caseRef", "caseHash", "evaluationProfileRef",
  "evaluationProfileHash", "outcome", "attempts", "finalAttemptIndex",
  "finalEvaluationResultRef", "finalEvaluationResultHash", "cleanupOutcome",
] as const;
const RUN_ATTEMPT_FIELDS = [
  "attemptIndex", "generationRequestRef", "generationRequestHash",
  "generationReceiptRef", "generationReceiptHash", "sceneAuthoringAttemptRef",
  "sceneAuthoringAttemptHash", "sceneAuthoringAttemptResultRef",
  "sceneAuthoringAttemptResultHash", "worldPackageRef", "worldPackageRootHash",
  "worldPackageBuildReceiptRef", "worldPackageBuildReceiptHash",
  "captureReceiptRef", "captureReceiptHash", "evaluationResultRef",
  "evaluationResultHash", "outcome",
] as const;

function fail(contract: string, path: string, message: string): never {
  throw new Error(`${contract}:${path.length === 0 ? "" : ` ${path}:`} ${message}`);
}

function assertAccessorFree(value: unknown, contract: string, path = "", seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail(contract, path, "symbol keys are forbidden");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.get !== undefined || descriptor?.set !== undefined) {
      fail(contract, `${path}/${key}`, "accessors are forbidden");
    }
    assertAccessorFree(descriptor?.value, contract, `${path}/${key}`, seen);
  }
}

function object(value: unknown, contract: string, path: string): Readonly<Record<string, unknown>> {
  if (!isPlainObject(value)) fail(contract, path, "expected a plain object");
  return value as Readonly<Record<string, unknown>>;
}

function exactFields(value: Readonly<Record<string, unknown>>, fields: readonly string[], contract: string, path: string): void {
  const allowed = new Set(fields);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) fail(contract, `${path}/${unknown}`, "unknown field");
  const missing = fields.find((key) => !Object.hasOwn(value, key));
  if (missing !== undefined) fail(contract, `${path}/${missing}`, "required field is missing");
}

function text(value: unknown, contract: string, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || value.normalize("NFC") !== value) {
    fail(contract, path, "expected a non-empty trimmed NFC string");
  }
  return value;
}

function hash(value: unknown, contract: string, path: string): Sha256HashV1 {
  const parsed = text(value, contract, path);
  if (!HASH_PATTERN.test(parsed) || parsed === ZERO_HASH) fail(contract, path, "expected a non-zero SHA-256 hash");
  return parsed as Sha256HashV1;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], contract: string, path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) fail(contract, path, `expected one of ${allowed.join(", ")}`);
  return value as T;
}

function exactInteger(value: unknown, expected: number, contract: string, path: string): number {
  if (value !== expected) fail(contract, path, `expected ${expected}`);
  return expected;
}

function integer(value: unknown, minimum: number, maximum: number, contract: string, path: string): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(contract, path, `expected an integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function array(value: unknown, contract: string, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(contract, path, "expected an array");
  return value;
}

function sortedStrings(value: unknown, contract: string, path: string, allowEmpty = false): readonly string[] {
  const parsed = array(value, contract, path).map((entry, index) => text(entry, contract, `${path}/${index}`));
  if (!allowEmpty && parsed.length === 0) fail(contract, path, "must not be empty");
  if (parsed.some((entry, index) => index > 0 && parsed[index - 1]! >= entry)) {
    fail(contract, path, "must be unique and strictly sorted");
  }
  return Object.freeze(parsed);
}

function uniqueStrings(value: unknown, contract: string, path: string): readonly string[] {
  const parsed = array(value, contract, path).map((entry, index) =>
    text(entry, contract, `${path}/${index}`)
  );
  if (parsed.length === 0) fail(contract, path, "must not be empty");
  if (new Set(parsed).size !== parsed.length) fail(contract, path, "must be unique");
  return Object.freeze(parsed);
}

function exactDimensions(value: unknown, contract: string, path: string): readonly WorldReconstructionDimensionIdV1[] {
  const rows = array(value, contract, path);
  if (rows.length !== WORLD_RECONSTRUCTION_DIMENSION_IDS_V1.length || rows.some((entry, index) => entry !== WORLD_RECONSTRUCTION_DIMENSION_IDS_V1[index])) {
    fail(contract, path, "must contain all seven dimension IDs in canonical order");
  }
  return WORLD_RECONSTRUCTION_DIMENSION_IDS_V1;
}

function freeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return Object.freeze(value);
}

function begin(value: unknown, contract: string, fields: readonly string[]): Readonly<Record<string, unknown>> {
  assertAccessorFree(value, contract);
  const source = object(value, contract, "");
  exactFields(source, fields, contract, "");
  return source;
}

function parseMetric(value: unknown, contract: string, path: string): WorldReconstructionMetricV1 {
  const source = object(value, contract, path);
  const kind = enumValue(source.kind, [
    "ratio-basis-points", "normalized-distance-basis-points", "distance-millimeters",
    "boolean-presence", "identity-match", "receipt-outcome",
  ] as const, contract, `${path}/kind`);
  if (kind === "ratio-basis-points" || kind === "normalized-distance-basis-points") {
    exactFields(source, ["kind", "valueBasisPoints"], contract, path);
    return Object.freeze({ kind, valueBasisPoints: integer(source.valueBasisPoints, 0, 10_000, contract, `${path}/valueBasisPoints`) });
  }
  if (kind === "distance-millimeters") {
    exactFields(source, ["kind", "valueMillimeters"], contract, path);
    return Object.freeze({ kind, valueMillimeters: integer(source.valueMillimeters, 0, Number.MAX_SAFE_INTEGER, contract, `${path}/valueMillimeters`) });
  }
  if (kind === "boolean-presence") {
    exactFields(source, ["kind", "isPresent"], contract, path);
    if (typeof source.isPresent !== "boolean") fail(contract, `${path}/isPresent`, "expected a boolean");
    return Object.freeze({ kind, isPresent: source.isPresent });
  }
  if (kind === "identity-match") {
    exactFields(source, ["kind", "isMatch"], contract, path);
    if (typeof source.isMatch !== "boolean") fail(contract, `${path}/isMatch`, "expected a boolean");
    return Object.freeze({ kind, isMatch: source.isMatch });
  }
  exactFields(source, ["kind", "outcome"], contract, path);
  return Object.freeze({ kind, outcome: enumValue(source.outcome, ["completed", "failed", "incomplete"] as const, contract, `${path}/outcome`) });
}

export function parseWorldReconstructionCaseV1(value: unknown): WorldReconstructionCaseV1 {
  const contract = "WORLD_RECONSTRUCTION_CASE_INVALID";
  const source = begin(value, contract, CASE_FIELDS);
  if (source.kind !== "world-reconstruction-case") fail(contract, "kind", "unexpected kind");
  exactInteger(source.schemaVersion, 1, contract, "schemaVersion");

  const referenceInputs = array(source.referenceInputs, contract, "referenceInputs").map((entry, index) => {
    const path = `referenceInputs/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["inputRef", "contentHash", "mediaType"], contract, path);
    return Object.freeze({
      inputRef: text(row.inputRef, contract, `${path}/inputRef`),
      contentHash: hash(row.contentHash, contract, `${path}/contentHash`),
      mediaType: enumValue(row.mediaType, ["image/png", "image/jpeg", "application/json"] as const, contract, `${path}/mediaType`),
    });
  });
  if (referenceInputs.length === 0 || referenceInputs.some((row, index) => index > 0 && referenceInputs[index - 1]!.inputRef >= row.inputRef)) {
    fail(contract, "referenceInputs", "must be non-empty, unique, and sorted by inputRef");
  }

  const topologySource = object(source.topology, contract, "topology");
  exactFields(topologySource, ["nodeIds", "relations", "layerIds"], contract, "topology");
  const nodeIds = sortedStrings(topologySource.nodeIds, contract, "topology/nodeIds");
  const relations = array(topologySource.relations, contract, "topology/relations").map((entry, index) => {
    const path = `topology/relations/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["fromNodeId", "relation", "toNodeId"], contract, path);
    const relation = Object.freeze({
      fromNodeId: text(row.fromNodeId, contract, `${path}/fromNodeId`),
      relation: enumValue(row.relation, ["connects-to", "contains", "above", "blocks"] as const, contract, `${path}/relation`),
      toNodeId: text(row.toNodeId, contract, `${path}/toNodeId`),
    });
    if (!nodeIds.includes(relation.fromNodeId) || !nodeIds.includes(relation.toNodeId)) fail(contract, path, "relation endpoints must name declared nodes");
    return relation;
  });
  const relationKeys = relations.map((row) => `${row.fromNodeId}\0${row.relation}\0${row.toNodeId}`);
  if (relations.length === 0 || relationKeys.some((key, index) => index > 0 && relationKeys[index - 1]! >= key)) fail(contract, "topology/relations", "must be non-empty, unique, and sorted");

  const spawnSource = object(source.spawnSupport, contract, "spawnSupport");
  exactFields(spawnSource, ["spawnMarkerId", "supportColliderId"], contract, "spawnSupport");
  const requiredColliders = array(source.requiredColliders, contract, "requiredColliders").map((entry, index) => {
    const path = `requiredColliders/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["colliderId", "role"], contract, path);
    return Object.freeze({ colliderId: text(row.colliderId, contract, `${path}/colliderId`), role: enumValue(row.role, ["ground", "blocker", "step"] as const, contract, `${path}/role`) });
  });
  if (requiredColliders.length === 0 || requiredColliders.some((row, index) => index > 0 && requiredColliders[index - 1]!.colliderId >= row.colliderId)) fail(contract, "requiredColliders", "must be non-empty, unique, and sorted by colliderId");
  const supportColliderId = text(spawnSource.supportColliderId, contract, "spawnSupport/supportColliderId");
  if (!requiredColliders.some(({ colliderId, role }) => colliderId === supportColliderId && (role === "ground" || role === "step"))) fail(contract, "spawnSupport/supportColliderId", "must name a required support collider");

  const scriptedTraversalChecks = array(source.scriptedTraversalChecks, contract, "scriptedTraversalChecks").map((entry, index) => {
    const path = `scriptedTraversalChecks/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["id", "evidenceKind", "expectation", "checkpointIds"], contract, path);
    if (row.evidenceKind !== "scripted-fixed-input") fail(contract, `${path}/evidenceKind`, "Route/Nav claims are forbidden; expected scripted-fixed-input");
    return Object.freeze({
      id: text(row.id, contract, `${path}/id`),
      evidenceKind: "scripted-fixed-input" as const,
      expectation: enumValue(row.expectation, ["pass", "block"] as const, contract, `${path}/expectation`),
      checkpointIds: uniqueStrings(row.checkpointIds, contract, `${path}/checkpointIds`),
    });
  });
  if (scriptedTraversalChecks.length === 0 || scriptedTraversalChecks.some((row, index) => index > 0 && scriptedTraversalChecks[index - 1]!.id >= row.id)) fail(contract, "scriptedTraversalChecks", "must be non-empty, unique, and sorted by id");

  return freeze({
    kind: "world-reconstruction-case",
    schemaVersion: 1,
    id: text(source.id, contract, "id"),
    sceneBriefRef: text(source.sceneBriefRef, contract, "sceneBriefRef"),
    sceneBriefHash: hash(source.sceneBriefHash, contract, "sceneBriefHash"),
    referenceInputs: Object.freeze(referenceInputs),
    evaluationProfileRef: text(source.evaluationProfileRef, contract, "evaluationProfileRef"),
    evaluationProfileHash: hash(source.evaluationProfileHash, contract, "evaluationProfileHash"),
    acceptanceTargetRefs: sortedStrings(source.acceptanceTargetRefs, contract, "acceptanceTargetRefs"),
    requiredEvidenceProfileRefs: sortedStrings(source.requiredEvidenceProfileRefs, contract, "requiredEvidenceProfileRefs"),
    topology: Object.freeze({ nodeIds, relations: Object.freeze(relations), layerIds: sortedStrings(topologySource.layerIds, contract, "topology/layerIds") }),
    compositionTargetRefs: sortedStrings(source.compositionTargetRefs, contract, "compositionTargetRefs"),
    spawnSupport: Object.freeze({ spawnMarkerId: text(spawnSource.spawnMarkerId, contract, "spawnSupport/spawnMarkerId"), supportColliderId }),
    requiredColliders: Object.freeze(requiredColliders),
    scriptedTraversalChecks: Object.freeze(scriptedTraversalChecks),
  });
}

export function parseWorldReconstructionEvaluationProfileV1(value: unknown): WorldReconstructionEvaluationProfileV1 {
  const contract = "WORLD_RECONSTRUCTION_EVALUATION_PROFILE_INVALID";
  const source = begin(value, contract, PROFILE_FIELDS);
  if (source.kind !== "world-reconstruction-evaluation-profile") fail(contract, "kind", "unexpected kind");
  exactInteger(source.schemaVersion, 1, contract, "schemaVersion");
  const dimensionIds = exactDimensions(source.dimensionIds, contract, "dimensionIds");
  exactInteger(source.maximumRepairAttemptCount, 1, contract, "maximumRepairAttemptCount");
  exactInteger(source.builderSelfRepairAttemptCount, 0, contract, "builderSelfRepairAttemptCount");
  const requiredEvidenceByDimension = array(source.requiredEvidenceByDimension, contract, "requiredEvidenceByDimension").map((entry, index) => {
    const path = `requiredEvidenceByDimension/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["dimensionId", "evidenceProfileRefs"], contract, path);
    const dimensionId = enumValue(row.dimensionId, WORLD_RECONSTRUCTION_DIMENSION_IDS_V1, contract, `${path}/dimensionId`);
    if (dimensionId !== WORLD_RECONSTRUCTION_DIMENSION_IDS_V1[index]) fail(contract, `${path}/dimensionId`, "must follow canonical dimension order");
    return Object.freeze({ dimensionId, evidenceProfileRefs: sortedStrings(row.evidenceProfileRefs, contract, `${path}/evidenceProfileRefs`) });
  });
  if (requiredEvidenceByDimension.length !== 7) fail(contract, "requiredEvidenceByDimension", "must cover all seven dimensions");
  return freeze({ kind: "world-reconstruction-evaluation-profile", schemaVersion: 1, id: text(source.id, contract, "id"), dimensionIds, maximumRepairAttemptCount: 1, builderSelfRepairAttemptCount: 0, requiredEvidenceByDimension: Object.freeze(requiredEvidenceByDimension) });
}

export function parseWorldReconstructionEvidenceSetV1(value: unknown): WorldReconstructionEvidenceSetV1 {
  const contract = "WORLD_RECONSTRUCTION_EVIDENCE_SET_INVALID";
  const source = begin(value, contract, EVIDENCE_FIELDS);
  if (source.kind !== "world-reconstruction-evidence-set") fail(contract, "kind", "unexpected kind");
  exactInteger(source.schemaVersion, 1, contract, "schemaVersion");
  const attemptRef = text(source.attemptRef, contract, "attemptRef");
  const attemptHash = hash(source.attemptHash, contract, "attemptHash");
  const sceneAuthoringAttemptResultRef = text(source.sceneAuthoringAttemptResultRef, contract, "sceneAuthoringAttemptResultRef");
  const sceneAuthoringAttemptResultHash = hash(source.sceneAuthoringAttemptResultHash, contract, "sceneAuthoringAttemptResultHash");
  const worldPackageRef = text(source.worldPackageRef, contract, "worldPackageRef");
  const worldPackageRootHash = hash(source.worldPackageRootHash, contract, "worldPackageRootHash");
  const worldPackageBuildReceiptRef = text(source.worldPackageBuildReceiptRef, contract, "worldPackageBuildReceiptRef");
  const worldPackageBuildReceiptHash = hash(source.worldPackageBuildReceiptHash, contract, "worldPackageBuildReceiptHash");
  const captureReceiptRef = text(source.captureReceiptRef, contract, "captureReceiptRef");
  const captureReceiptHash = hash(source.captureReceiptHash, contract, "captureReceiptHash");
  const expectedIdentities = [
    { role: "scene-authoring-attempt" as const, artifactRef: attemptRef, contentHash: attemptHash },
    { role: "scene-authoring-attempt-result" as const, artifactRef: sceneAuthoringAttemptResultRef, contentHash: sceneAuthoringAttemptResultHash },
    { role: "world-package" as const, artifactRef: worldPackageRef, contentHash: worldPackageRootHash },
    { role: "world-package-build-receipt" as const, artifactRef: worldPackageBuildReceiptRef, contentHash: worldPackageBuildReceiptHash },
    { role: "capture" as const, artifactRef: captureReceiptRef, contentHash: captureReceiptHash },
  ];
  const identityEvidence = array(source.identityEvidence, contract, "identityEvidence").map((entry, index) => {
    const path = `identityEvidence/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["role", "artifactRef", "contentHash"], contract, path);
    return Object.freeze({
      role: enumValue(row.role, ["scene-authoring-attempt", "scene-authoring-attempt-result", "world-package", "world-package-build-receipt", "capture"] as const, contract, `${path}/role`),
      artifactRef: text(row.artifactRef, contract, `${path}/artifactRef`),
      contentHash: hash(row.contentHash, contract, `${path}/contentHash`),
    });
  });
  if (identityEvidence.length !== expectedIdentities.length || identityEvidence.some((row, index) => row.role !== expectedIdentities[index]!.role || row.artifactRef !== expectedIdentities[index]!.artifactRef || row.contentHash !== expectedIdentities[index]!.contentHash)) {
    fail(contract, "identityEvidence", "must exactly repeat Attempt, Attempt Result, WorldPackage, Build Receipt, and Capture identities");
  }
  const dimensionEvidence = array(source.dimensionEvidence, contract, "dimensionEvidence").map((entry, index) => {
    const path = `dimensionEvidence/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["dimensionId", "evidenceRefs"], contract, path);
    const dimensionId = enumValue(row.dimensionId, WORLD_RECONSTRUCTION_DIMENSION_IDS_V1, contract, `${path}/dimensionId`);
    if (dimensionId !== WORLD_RECONSTRUCTION_DIMENSION_IDS_V1[index]) fail(contract, `${path}/dimensionId`, "must follow canonical dimension order");
    return Object.freeze({ dimensionId, evidenceRefs: sortedStrings(row.evidenceRefs, contract, `${path}/evidenceRefs`, true) });
  });
  if (dimensionEvidence.length !== 7) fail(contract, "dimensionEvidence", "must cover all seven dimensions");
  const advisoryPixelMetrics = array(source.advisoryPixelMetrics, contract, "advisoryPixelMetrics").map((entry, index) => parseMetric(entry, contract, `advisoryPixelMetrics/${index}`));
  if (advisoryPixelMetrics.some(({ kind }) => kind !== "ratio-basis-points" && kind !== "normalized-distance-basis-points")) fail(contract, "advisoryPixelMetrics", "only advisory ratio or normalized-distance metrics are allowed");
  return freeze({
    kind: "world-reconstruction-evidence-set", schemaVersion: 1,
    id: text(source.id, contract, "id"), caseRef: text(source.caseRef, contract, "caseRef"), caseHash: hash(source.caseHash, contract, "caseHash"),
    evaluationProfileRef: text(source.evaluationProfileRef, contract, "evaluationProfileRef"), evaluationProfileHash: hash(source.evaluationProfileHash, contract, "evaluationProfileHash"),
    attemptRef, attemptHash, sceneAuthoringAttemptResultRef,
    sceneAuthoringAttemptResultHash, worldPackageRef, worldPackageRootHash,
    worldPackageBuildReceiptRef, worldPackageBuildReceiptHash,
    captureReceiptRef, captureReceiptHash,
    identityEvidence: Object.freeze(identityEvidence), dimensionEvidence: Object.freeze(dimensionEvidence), advisoryPixelMetrics: Object.freeze(advisoryPixelMetrics),
  });
}

export function parseWorldReconstructionEvaluationResultV1(value: unknown): WorldReconstructionEvaluationResultV1 {
  const contract = "WORLD_RECONSTRUCTION_EVALUATION_RESULT_INVALID";
  const source = begin(value, contract, RESULT_FIELDS);
  if (source.kind !== "world-reconstruction-evaluation-result") fail(contract, "kind", "unexpected kind");
  exactInteger(source.schemaVersion, 1, contract, "schemaVersion");
  const attemptHash = hash(source.attemptHash, contract, "attemptHash");
  const worldPackageRootHash = hash(source.worldPackageRootHash, contract, "worldPackageRootHash");
  const captureReceiptHash = hash(source.captureReceiptHash, contract, "captureReceiptHash");
  const dimensions = array(source.dimensions, contract, "dimensions").map((entry, index) => {
    const path = `dimensions/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, ["dimensionId", "status", "metrics", "evidenceRefs", "diagnosticIds", "identity"], contract, path);
    const dimensionId = enumValue(row.dimensionId, WORLD_RECONSTRUCTION_DIMENSION_IDS_V1, contract, `${path}/dimensionId`);
    if (dimensionId !== WORLD_RECONSTRUCTION_DIMENSION_IDS_V1[index]) fail(contract, `${path}/dimensionId`, "must follow canonical dimension order");
    const status = enumValue(row.status, ["passed", "failed", "incomplete"] as const, contract, `${path}/status`);
    const metrics = array(row.metrics, contract, `${path}/metrics`).map((metric, metricIndex) => parseMetric(metric, contract, `${path}/metrics/${metricIndex}`));
    const evidenceRefs = sortedStrings(row.evidenceRefs, contract, `${path}/evidenceRefs`, status !== "passed");
    if (status === "passed" && metrics.length === 0) fail(contract, `${path}/metrics`, "a passed dimension requires a non-advisory metric");
    const identity = object(row.identity, contract, `${path}/identity`);
    exactFields(identity, ["attemptHash", "worldPackageRootHash", "captureReceiptHash"], contract, `${path}/identity`);
    if (hash(identity.attemptHash, contract, `${path}/identity/attemptHash`) !== attemptHash || hash(identity.worldPackageRootHash, contract, `${path}/identity/worldPackageRootHash`) !== worldPackageRootHash || hash(identity.captureReceiptHash, contract, `${path}/identity/captureReceiptHash`) !== captureReceiptHash) {
      fail(contract, `${path}/identity`, "stale Attempt, WorldPackage, or Capture identity");
    }
    return freeze({ dimensionId, status, metrics: Object.freeze(metrics), evidenceRefs, diagnosticIds: sortedStrings(row.diagnosticIds, contract, `${path}/diagnosticIds`, true), identity: Object.freeze({ attemptHash, worldPackageRootHash, captureReceiptHash }) });
  });
  if (dimensions.length !== 7) fail(contract, "dimensions", "must cover all seven dimensions");
  const diagnostics = array(source.diagnostics, contract, "diagnostics").map((entry) => parseWorldReconstructionDiagnosticV1(entry));
  const diagnosticKeys = diagnostics.map(({ dimensionId, code, acceptanceTargetRef }) => `${dimensionId}\0${code}\0${acceptanceTargetRef}`);
  if (diagnosticKeys.some((key, index) => index > 0 && diagnosticKeys[index - 1]! >= key)) fail(contract, "diagnostics", "must be unique and sorted by dimension, code, and target");
  const declaredDiagnosticIds = new Set(dimensions.flatMap(({ diagnosticIds }) => diagnosticIds));
  if (diagnostics.some(({ id }) => !declaredDiagnosticIds.has(id)) || declaredDiagnosticIds.size !== diagnostics.length) fail(contract, "diagnostics", "must exactly match dimension diagnostic IDs");
  const expectedOutcome: WorldReconstructionOutcomeV1 = dimensions.some(({ status }) => status === "incomplete") ? "incomplete" : dimensions.some(({ status }) => status === "failed") ? "failed" : "passed";
  const outcome = enumValue(source.outcome, ["passed", "failed", "incomplete"] as const, contract, "outcome");
  if (outcome !== expectedOutcome) fail(contract, "outcome", "must be derived from independent dimension outcomes");
  return freeze({
    kind: "world-reconstruction-evaluation-result", schemaVersion: 1, id: text(source.id, contract, "id"),
    caseRef: text(source.caseRef, contract, "caseRef"), caseHash: hash(source.caseHash, contract, "caseHash"), evaluationProfileRef: text(source.evaluationProfileRef, contract, "evaluationProfileRef"), evaluationProfileHash: hash(source.evaluationProfileHash, contract, "evaluationProfileHash"),
    evidenceSetRef: text(source.evidenceSetRef, contract, "evidenceSetRef"), evidenceSetHash: hash(source.evidenceSetHash, contract, "evidenceSetHash"),
    attemptRef: text(source.attemptRef, contract, "attemptRef"), attemptHash, worldPackageRef: text(source.worldPackageRef, contract, "worldPackageRef"), worldPackageRootHash,
    captureReceiptRef: text(source.captureReceiptRef, contract, "captureReceiptRef"), captureReceiptHash, outcome, diagnostics: Object.freeze(diagnostics), dimensions: Object.freeze(dimensions),
  });
}

export function parseWorldReconstructionDiagnosticV1(value: unknown): WorldReconstructionDiagnosticV1 {
  const contract = "WORLD_RECONSTRUCTION_DIAGNOSTIC_INVALID";
  const source = begin(value, contract, DIAGNOSTIC_FIELDS);
  if (source.kind !== "world-reconstruction-diagnostic") fail(contract, "kind", "unexpected kind");
  exactInteger(source.schemaVersion, 1, contract, "schemaVersion");
  const repairAction = object(source.repairAction, contract, "repairAction");
  const repairKind = enumValue(repairAction.kind, ["revise-native-source", "select-native-resource"] as const, contract, "repairAction/kind");
  exactFields(repairAction, repairKind === "revise-native-source" ? ["kind"] : ["kind", "resourceRef"], contract, "repairAction");
  return freeze({
    kind: "world-reconstruction-diagnostic", schemaVersion: 1, id: text(source.id, contract, "id"),
    code: enumValue(source.code, ["WORLD_RECONSTRUCTION_TOPOLOGY_NODE_MISSING", "WORLD_RECONSTRUCTION_TOPOLOGY_RELATION_MISSING", "WORLD_RECONSTRUCTION_SEMANTIC_SILHOUETTE_DRIFT", "WORLD_RECONSTRUCTION_OPENING_COMPOSITION_DRIFT", "WORLD_RECONSTRUCTION_SPAWN_SUPPORT_MISSING", "WORLD_RECONSTRUCTION_COLLIDER_MISSING", "WORLD_RECONSTRUCTION_COLLIDER_ROLE_MISMATCH", "WORLD_RECONSTRUCTION_REQUIRED_TRAVERSAL_BLOCKED", "WORLD_RECONSTRUCTION_REQUIRED_BLOCKER_PASSABLE", "WORLD_RECONSTRUCTION_BUILD_NONDETERMINISTIC", "WORLD_RECONSTRUCTION_EVIDENCE_STALE", "WORLD_RECONSTRUCTION_REQUIRED_EVIDENCE_MISSING"] as const, contract, "code"),
    dimensionId: enumValue(source.dimensionId, WORLD_RECONSTRUCTION_DIMENSION_IDS_V1, contract, "dimensionId"),
    acceptanceTargetRef: text(source.acceptanceTargetRef, contract, "acceptanceTargetRef"), evidenceRefs: sortedStrings(source.evidenceRefs, contract, "evidenceRefs", true), message: text(source.message, contract, "message"),
    repairAction: repairKind === "revise-native-source"
      ? Object.freeze({ kind: repairKind })
      : Object.freeze({ kind: repairKind, resourceRef: text(repairAction.resourceRef, contract, "repairAction/resourceRef") }),
  });
}

export function parseWorldReconstructionRunReceiptV1(value: unknown): WorldReconstructionRunReceiptV1 {
  const contract = "WORLD_RECONSTRUCTION_RUN_RECEIPT_INVALID";
  const source = begin(value, contract, RUN_FIELDS);
  if (source.kind !== "world-reconstruction-run-receipt") fail(contract, "kind", "unexpected kind");
  exactInteger(source.schemaVersion, 1, contract, "schemaVersion");
  const attempts = array(source.attempts, contract, "attempts").map((entry, index) => {
    const path = `attempts/${index}`;
    const row = object(entry, contract, path);
    exactFields(row, RUN_ATTEMPT_FIELDS, contract, path);
    if (index > 1 || row.attemptIndex !== index) fail(contract, `${path}/attemptIndex`, "attempts must be contiguous 0 then optional 1");
    return Object.freeze({
      attemptIndex: index as 0 | 1,
      generationRequestRef: text(row.generationRequestRef, contract, `${path}/generationRequestRef`),
      generationRequestHash: hash(row.generationRequestHash, contract, `${path}/generationRequestHash`),
      generationReceiptRef: text(row.generationReceiptRef, contract, `${path}/generationReceiptRef`),
      generationReceiptHash: hash(row.generationReceiptHash, contract, `${path}/generationReceiptHash`),
      sceneAuthoringAttemptRef: text(row.sceneAuthoringAttemptRef, contract, `${path}/sceneAuthoringAttemptRef`),
      sceneAuthoringAttemptHash: hash(row.sceneAuthoringAttemptHash, contract, `${path}/sceneAuthoringAttemptHash`),
      sceneAuthoringAttemptResultRef: text(row.sceneAuthoringAttemptResultRef, contract, `${path}/sceneAuthoringAttemptResultRef`),
      sceneAuthoringAttemptResultHash: hash(row.sceneAuthoringAttemptResultHash, contract, `${path}/sceneAuthoringAttemptResultHash`),
      worldPackageRef: text(row.worldPackageRef, contract, `${path}/worldPackageRef`),
      worldPackageRootHash: hash(row.worldPackageRootHash, contract, `${path}/worldPackageRootHash`),
      worldPackageBuildReceiptRef: text(row.worldPackageBuildReceiptRef, contract, `${path}/worldPackageBuildReceiptRef`),
      worldPackageBuildReceiptHash: hash(row.worldPackageBuildReceiptHash, contract, `${path}/worldPackageBuildReceiptHash`),
      captureReceiptRef: text(row.captureReceiptRef, contract, `${path}/captureReceiptRef`),
      captureReceiptHash: hash(row.captureReceiptHash, contract, `${path}/captureReceiptHash`),
      evaluationResultRef: text(row.evaluationResultRef, contract, `${path}/evaluationResultRef`),
      evaluationResultHash: hash(row.evaluationResultHash, contract, `${path}/evaluationResultHash`),
      outcome: enumValue(row.outcome, ["passed", "failed", "incomplete"] as const, contract, `${path}/outcome`),
    });
  });
  if (attempts.length < 1 || attempts.length > 2) fail(contract, "attempts", "expected one initial and at most one repair attempt");
  if (attempts.length === 2) {
    const identityRefs = (attempt: (typeof attempts)[number]) => [
      attempt.generationRequestRef, attempt.generationReceiptRef,
      attempt.sceneAuthoringAttemptRef, attempt.sceneAuthoringAttemptResultRef,
      attempt.worldPackageRef, attempt.worldPackageBuildReceiptRef,
      attempt.captureReceiptRef, attempt.evaluationResultRef,
    ];
    const identityHashes = (attempt: (typeof attempts)[number]) => [
      attempt.generationRequestHash, attempt.generationReceiptHash,
      attempt.sceneAuthoringAttemptHash, attempt.sceneAuthoringAttemptResultHash,
      attempt.worldPackageRootHash, attempt.worldPackageBuildReceiptHash,
      attempt.captureReceiptHash, attempt.evaluationResultHash,
    ];
    const firstRefs = new Set(identityRefs(attempts[0]!));
    const firstHashes = new Set(identityHashes(attempts[0]!));
    if (identityRefs(attempts[1]!).some((identity) => firstRefs.has(identity)) ||
        identityHashes(attempts[1]!).some((identity) => firstHashes.has(identity))) {
      fail(contract, "attempts/1", "stage identities must not be reused across attempts");
    }
  }
  const final = attempts.at(-1)!;
  const finalAttemptIndex = integer(source.finalAttemptIndex, 0, 1, contract, "finalAttemptIndex") as 0 | 1;
  const finalEvaluationResultRef = text(source.finalEvaluationResultRef, contract, "finalEvaluationResultRef");
  const finalEvaluationResultHash = hash(source.finalEvaluationResultHash, contract, "finalEvaluationResultHash");
  if (final.attemptIndex !== finalAttemptIndex || final.evaluationResultRef !== finalEvaluationResultRef || final.evaluationResultHash !== finalEvaluationResultHash) fail(contract, "finalAttemptIndex", "final identity must identify the last Attempt evaluation result");
  const outcome = enumValue(source.outcome, ["passed", "failed", "incomplete"] as const, contract, "outcome");
  const cleanupOutcome = enumValue(source.cleanupOutcome, ["completed", "failed"] as const, contract, "cleanupOutcome");
  const expectedOutcome = cleanupOutcome === "failed" ? "incomplete" : final.outcome;
  if (outcome !== expectedOutcome) fail(contract, "outcome", "must match final result and fail closed on cleanup");
  return freeze({ kind: "world-reconstruction-run-receipt", schemaVersion: 1, id: text(source.id, contract, "id"), caseRef: text(source.caseRef, contract, "caseRef"), caseHash: hash(source.caseHash, contract, "caseHash"), evaluationProfileRef: text(source.evaluationProfileRef, contract, "evaluationProfileRef"), evaluationProfileHash: hash(source.evaluationProfileHash, contract, "evaluationProfileHash"), outcome, attempts: Object.freeze(attempts), finalAttemptIndex, finalEvaluationResultRef, finalEvaluationResultHash, cleanupOutcome });
}

type Parser<T> = (value: unknown) => T;
const canonicalBytes = <T>(parser: Parser<T>, value: unknown): Uint8Array => canonicalJsonBytes(parser(value));
const canonicalHash = <T>(parser: Parser<T>, value: unknown): Sha256HashV1 => sha256CanonicalJson(parser(value)) as Sha256HashV1;

export const worldReconstructionCaseCanonicalBytesV1 = (value: unknown) => canonicalBytes(parseWorldReconstructionCaseV1, value);
export const hashWorldReconstructionCaseV1 = (value: unknown) => canonicalHash(parseWorldReconstructionCaseV1, value);
export const worldReconstructionEvaluationProfileCanonicalBytesV1 = (value: unknown) => canonicalBytes(parseWorldReconstructionEvaluationProfileV1, value);
export const hashWorldReconstructionEvaluationProfileV1 = (value: unknown) => canonicalHash(parseWorldReconstructionEvaluationProfileV1, value);
export const worldReconstructionEvidenceSetCanonicalBytesV1 = (value: unknown) => canonicalBytes(parseWorldReconstructionEvidenceSetV1, value);
export const hashWorldReconstructionEvidenceSetV1 = (value: unknown) => canonicalHash(parseWorldReconstructionEvidenceSetV1, value);
export const worldReconstructionEvaluationResultCanonicalBytesV1 = (value: unknown) => canonicalBytes(parseWorldReconstructionEvaluationResultV1, value);
export const hashWorldReconstructionEvaluationResultV1 = (value: unknown) => canonicalHash(parseWorldReconstructionEvaluationResultV1, value);
export const worldReconstructionDiagnosticCanonicalBytesV1 = (value: unknown) => canonicalBytes(parseWorldReconstructionDiagnosticV1, value);
export const hashWorldReconstructionDiagnosticV1 = (value: unknown) => canonicalHash(parseWorldReconstructionDiagnosticV1, value);
export const worldReconstructionRunReceiptCanonicalBytesV1 = (value: unknown) => canonicalBytes(parseWorldReconstructionRunReceiptV1, value);
export const hashWorldReconstructionRunReceiptV1 = (value: unknown) => canonicalHash(parseWorldReconstructionRunReceiptV1, value);
