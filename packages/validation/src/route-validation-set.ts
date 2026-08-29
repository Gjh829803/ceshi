import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isPlainObject } from "lodash-es";

import { assertAccessorFreeDataGraph } from "./accessor-free-data.js";
import type {
  RouteValidationRequiredRouteV1,
  RouteValidationSetReceiptV1,
  RouteValidationSetRowV1,
} from "./types-v2.js";

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
  "requiredRouteCount",
  "requiredRouteSetHash",
  "requiredRoutes",
  "rows",
] as const;
const REQUIRED_ROUTE_FIELDS = [
  "constraintId",
  "routeId",
  "traversingEntityId",
  "startAnchorEntityId",
  "destinationAnchorEntityId",
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

function canonicalRequiredRoute(
  value: unknown,
  index: number,
): RouteValidationRequiredRouteV1 {
  const path = `requiredRoutes/${index}`;
  const source = record(value, path);
  exactFields(source, REQUIRED_ROUTE_FIELDS, path);
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
  });
}

function assertCanonicalRequiredRoutes(
  routes: readonly RouteValidationRequiredRouteV1[],
): void {
  for (let index = 1; index < routes.length; index += 1) {
    const previous = routes[index - 1]!;
    const current = routes[index]!;
    if (
      previous.constraintId > current.constraintId ||
      (previous.constraintId === current.constraintId &&
        previous.routeId >= current.routeId)
    ) {
      fail(
        "requiredRoutes",
        "must be unique and sorted by constraintId then routeId",
      );
    }
  }
}

export function hashRouteValidationRequiredRouteSetV1(
  executionPlanHash: Sha256HashV1,
  requiredRoutes: readonly RouteValidationRequiredRouteV1[],
): Sha256HashV1 {
  return sha256CanonicalJson({
    kind: "route-validation-required-route-set",
    schemaVersion: 1,
    executionPlanHash,
    requiredRoutes,
  }) as Sha256HashV1;
}

export function canonicalRouteValidationRequiredRoutesV1(
  value: unknown,
): readonly RouteValidationRequiredRouteV1[] {
  if (!Array.isArray(value)) {
    fail("requiredRoutes", "expected an array");
  }
  const routes = value.map(canonicalRequiredRoute);
  assertCanonicalRequiredRoutes(routes);
  return Object.freeze(routes);
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
  const executionPlanHash = hash(source.executionPlanHash, "executionPlanHash");
  const requiredRoutes = canonicalRouteValidationRequiredRoutesV1(
    source.requiredRoutes,
  );
  if (
    !Number.isSafeInteger(source.requiredRouteCount) ||
    source.requiredRouteCount !== requiredRoutes.length
  ) {
    fail("requiredRouteCount", "must equal requiredRoutes.length");
  }
  const requiredRouteSetHash = hash(
    source.requiredRouteSetHash,
    "requiredRouteSetHash",
  );
  if (
    requiredRouteSetHash !==
      hashRouteValidationRequiredRouteSetV1(executionPlanHash, requiredRoutes)
  ) {
    fail("requiredRouteSetHash", "does not match requiredRoutes");
  }
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
  if (rows.length !== requiredRoutes.length) {
    fail("rows", "must cover every required Route exactly once");
  }
  for (const [index, route] of requiredRoutes.entries()) {
    const row = rows[index]!;
    if (
      row.constraintId !== route.constraintId ||
      row.routeId !== route.routeId ||
      row.traversingEntityId !== route.traversingEntityId ||
      row.startAnchorEntityId !== route.startAnchorEntityId ||
      row.destinationAnchorEntityId !== route.destinationAnchorEntityId
    ) {
      fail(`rows/${index}`, "does not match requiredRoutes identity");
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
    executionPlanHash,
    resourceLockHash: hash(source.resourceLockHash, "resourceLockHash"),
    layoutSolveReportHash: hash(
      source.layoutSolveReportHash,
      "layoutSolveReportHash",
    ),
    requiredRouteCount: requiredRoutes.length,
    requiredRouteSetHash,
    requiredRoutes,
    rows: Object.freeze(rows),
  });
}

export function hashRouteValidationSetReceiptV1(
  value: RouteValidationSetReceiptV1,
): Sha256HashV1 {
  return sha256CanonicalJson(canonicalRouteValidationSetReceiptV1(value)) as Sha256HashV1;
}
