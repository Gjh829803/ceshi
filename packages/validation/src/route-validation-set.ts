import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isPlainObject } from "lodash-es";

import { assertAccessorFreeDataGraph } from "./accessor-free-data.js";
import type {
  RouteValidationSetReceiptV1,
  RouteValidationSetRowV1,
} from "./types-v2.js";
import type { Sha256HashV1 } from "./types.js";

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;
const RECEIPT_FIELDS = [
  "kind",
  "schemaVersion",
  "authoringSpecHash",
  "normalizedWorldIrHash",
  "executionPlanHash",
  "resourceLockHash",
  "layoutSolveReportHash",
  "rows",
] as const;
const ROW_FIELDS = [
  "constraintId",
  "routeId",
  "traversingEntityId",
  "startAnchorEntityId",
  "destinationAnchorEntityId",
  "resolvedTraversalLockHash",
  "connectivityStatus",
  "runtimeStatus",
  "evidenceArtifactRefs",
] as const;

function fail(path: string, message: string): never {
  throw new Error(
    `ROUTE_VALIDATION_SET_RECEIPT_INVALID:${path.length === 0 ? "" : ` ${path}:`}` +
      ` ${message}`,
  );
}

function record(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (!isPlainObject(value)) fail(path, "expected a plain object");
  return value as Readonly<Record<string, unknown>>;
}

function exactFields(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((field) => !allowedSet.has(field));
  if (unknown !== undefined) fail(`${path}/${unknown}`, "unknown field");
  const missing = allowed.find((field) => !Object.hasOwn(value, field));
  if (missing !== undefined) fail(`${path}/${missing}`, "required field is missing");
}

function string(value: unknown, path: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.normalize("NFC") !== value
  ) {
    fail(path, "expected a non-empty, trimmed NFC string");
  }
  return value;
}

function hash(value: unknown, path: string): Sha256HashV1 {
  const candidate = string(value, path);
  if (!SHA256_PATTERN.test(candidate)) fail(path, "expected a SHA-256 hash");
  if (candidate === ZERO_HASH) fail(path, "all-zero SHA-256 is forbidden");
  return candidate as Sha256HashV1;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(path, `expected one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function canonicalRow(value: unknown, index: number): RouteValidationSetRowV1 {
  const path = `rows/${index}`;
  const source = record(value, path);
  exactFields(source, ROW_FIELDS, path);
  if (!Array.isArray(source.evidenceArtifactRefs)) {
    fail(`${path}/evidenceArtifactRefs`, "expected an array");
  }
  const evidenceArtifactRefs = source.evidenceArtifactRefs.map((entry, refIndex) =>
    string(entry, `${path}/evidenceArtifactRefs/${refIndex}`)
  );
  if (
    new Set(evidenceArtifactRefs).size !== evidenceArtifactRefs.length ||
    evidenceArtifactRefs.some((entry, refIndex) =>
      refIndex > 0 && evidenceArtifactRefs[refIndex - 1]! >= entry
    )
  ) {
    fail(`${path}/evidenceArtifactRefs`, "must be unique and strictly sorted");
  }
  return Object.freeze({
    constraintId: string(source.constraintId, `${path}/constraintId`),
    routeId: string(source.routeId, `${path}/routeId`),
    traversingEntityId: string(
      source.traversingEntityId,
      `${path}/traversingEntityId`,
    ),
    startAnchorEntityId: string(
      source.startAnchorEntityId,
      `${path}/startAnchorEntityId`,
    ),
    destinationAnchorEntityId: string(
      source.destinationAnchorEntityId,
      `${path}/destinationAnchorEntityId`,
    ),
    resolvedTraversalLockHash: hash(
      source.resolvedTraversalLockHash,
      `${path}/resolvedTraversalLockHash`,
    ),
    connectivityStatus: enumValue(
      source.connectivityStatus,
      ["complete", "unreachable", "incomplete"],
      `${path}/connectivityStatus`,
    ),
    runtimeStatus: enumValue(
      source.runtimeStatus,
      ["complete", "failed", "not-run"],
      `${path}/runtimeStatus`,
    ),
    evidenceArtifactRefs: Object.freeze(evidenceArtifactRefs),
  });
}

export function canonicalRouteValidationSetReceiptV1(
  value: unknown,
): RouteValidationSetReceiptV1 {
  try {
    assertAccessorFreeDataGraph(
      value,
      "ROUTE_VALIDATION_SET_RECEIPT_ACCESSOR_FORBIDDEN",
    );
  } catch {
    fail("", "accessor-bearing input is forbidden");
  }
  const source = record(value, "");
  exactFields(source, RECEIPT_FIELDS, "");
  if (source.kind !== "route-validation-set-receipt") {
    fail("kind", "must be route-validation-set-receipt");
  }
  if (source.schemaVersion !== 1) fail("schemaVersion", "must be 1");
  if (!Array.isArray(source.rows)) fail("rows", "expected an array");
  const rows = source.rows.map(canonicalRow);
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]!;
    const current = rows[index]!;
    if (
      previous.constraintId > current.constraintId ||
      (previous.constraintId === current.constraintId &&
        previous.routeId >= current.routeId)
    ) {
      fail("rows", "must be unique and sorted by constraintId then routeId");
    }
  }
  return Object.freeze({
    kind: "route-validation-set-receipt",
    schemaVersion: 1,
    authoringSpecHash: hash(source.authoringSpecHash, "authoringSpecHash"),
    normalizedWorldIrHash: hash(
      source.normalizedWorldIrHash,
      "normalizedWorldIrHash",
    ),
    executionPlanHash: hash(source.executionPlanHash, "executionPlanHash"),
    resourceLockHash: hash(source.resourceLockHash, "resourceLockHash"),
    layoutSolveReportHash: hash(
      source.layoutSolveReportHash,
      "layoutSolveReportHash",
    ),
    rows: Object.freeze(rows),
  });
}

export function hashRouteValidationSetReceiptV1(
  value: RouteValidationSetReceiptV1,
): Sha256HashV1 {
  return sha256CanonicalJson(canonicalRouteValidationSetReceiptV1(value)) as Sha256HashV1;
}
