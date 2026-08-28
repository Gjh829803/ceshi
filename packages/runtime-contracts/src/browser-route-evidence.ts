import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  assertRouteRuntimeProbeReceiptContextV2,
  canonicalRouteOverlayV2,
  canonicalRoutePathReceiptV2,
  canonicalRouteRuntimeProbeReceiptV2,
  hashRouteOverlayV2,
  hashRoutePathReceiptV2,
  hashRouteRuntimeProbeReceiptV2,
  resolveTraversalDriverProfileV1,
  type RouteOverlayV2,
  type RoutePathReceiptV2,
  type RouteRuntimeProbeReceiptV2,
} from "@whitebox-world/traversal";
import { isEqual, isNil, isPlainObject } from "lodash-es";

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;

const PUBLICATION_FIELDS = [
  "kind",
  "schemaVersion",
  "worldPackageRootHash",
  "authoringSpecHash",
  "normalizedWorldIrHash",
  "executionPlanHash",
  "resourceLockHash",
  "layoutSolveReportHash",
  "validationReportHash",
  "routeValidationSetReceiptHash",
  "validationProfileRef",
  "validationProfileResolvedVersion",
  "validationProfileHash",
  "routes",
] as const;

const PROJECTION_FIELDS = [
  "selector",
  "summary",
  "routePathReceipt",
  "routePathReceiptHash",
  "routeRuntimeProbeReceipt",
  "routeRuntimeProbeReceiptHash",
  "routeOverlay",
  "routeOverlayHash",
] as const;

const SUMMARY_FIELDS = [
  "kind",
  "schemaVersion",
  "constraintId",
  "routeId",
  "traversingEntityId",
  "startAnchorEntityId",
  "destinationAnchorEntityId",
  "connectivityStatus",
  "routePathStatus",
  "routeRuntimeProbeStatus",
  "routeOverlayStatus",
] as const;

const SELECTOR_FIELDS = ["constraintId", "routeId"] as const;

export interface RouteEvidenceSelectorV1 {
  readonly constraintId: string;
  readonly routeId: string;
}

export interface RouteEvidenceSummaryV1 extends RouteEvidenceSelectorV1 {
  readonly kind: "route-evidence-summary";
  readonly schemaVersion: 1;
  readonly traversingEntityId: string;
  readonly startAnchorEntityId: string;
  readonly destinationAnchorEntityId: string;
  readonly connectivityStatus: "complete" | "unreachable" | "incomplete";
  readonly routePathStatus: "complete" | "unavailable";
  readonly routeRuntimeProbeStatus: "complete" | "failed" | "unavailable";
  readonly routeOverlayStatus: "available" | "unavailable";
}

export type RouteEvidenceUnavailableReasonV1 =
  | "route-evidence-not-loaded"
  | "route-not-found"
  | "evidence-not-published";

export interface RouteEvidenceUnavailableResultV1 {
  readonly kind: "worldkit-route-evidence-query-result";
  readonly schemaVersion: 1;
  readonly availability: "unavailable";
  readonly selector: RouteEvidenceSelectorV1;
  readonly reason: RouteEvidenceUnavailableReasonV1;
}

interface RouteEvidenceAvailableResultBaseV1 {
  readonly kind: "worldkit-route-evidence-query-result";
  readonly schemaVersion: 1;
  readonly availability: "available";
  readonly selector: RouteEvidenceSelectorV1;
}

export interface RouteSummaryAvailableResultV1
  extends RouteEvidenceAvailableResultBaseV1 {
  readonly summary: RouteEvidenceSummaryV1;
}

export type RouteSummaryQueryResultV1 =
  | RouteSummaryAvailableResultV1
  | RouteEvidenceUnavailableResultV1;
export interface RoutePathReceiptAvailableResultV2
  extends RouteEvidenceAvailableResultBaseV1 {
  readonly routePathReceipt: RoutePathReceiptV2;
}

export interface RouteRuntimeProbeReceiptAvailableResultV2
  extends RouteEvidenceAvailableResultBaseV1 {
  readonly routeRuntimeProbeReceipt: RouteRuntimeProbeReceiptV2;
}

export interface RouteOverlayAvailableResultV2
  extends RouteEvidenceAvailableResultBaseV1 {
  readonly routeOverlay: RouteOverlayV2;
}

export type RoutePathReceiptQueryResultV2 =
  | RoutePathReceiptAvailableResultV2
  | RouteEvidenceUnavailableResultV1;
export type RouteRuntimeProbeReceiptQueryResultV2 =
  | RouteRuntimeProbeReceiptAvailableResultV2
  | RouteEvidenceUnavailableResultV1;
export type RouteOverlayQueryResultV2 =
  | RouteOverlayAvailableResultV2
  | RouteEvidenceUnavailableResultV1;

function publicationInvalid(): never {
  throw new Error("WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID");
}

function selectorInvalid(): never {
  throw new Error("WORLDKIT_ROUTE_EVIDENCE_SELECTOR_INVALID");
}

function assertPureDataGraph(
  value: unknown,
  visited = new Set<object>(),
  active = new Set<object>(),
): void {
  if (typeof value === "string") {
    if (value === ZERO_HASH) publicationInvalid();
    return;
  }
  if (isNil(value) || typeof value !== "object") return;
  if (active.has(value)) publicationInvalid();
  if (visited.has(value)) return;
  if (!Array.isArray(value) && !isPlainObject(value)) publicationInvalid();
  if (Object.getOwnPropertySymbols(value).length !== 0) publicationInvalid();
  visited.add(value);
  active.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!isNil(descriptor.get) || !isNil(descriptor.set)) publicationInvalid();
    assertPureDataGraph(descriptor.value, visited, active);
  }
  active.delete(value);
}

function requireRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (!isPlainObject(value)) publicationInvalid();
  return value as Readonly<Record<string, unknown>>;
}

function requireExactFields(
  record: Readonly<Record<string, unknown>>,
  requiredFields: readonly string[],
  optionalFields: readonly string[] = [],
): void {
  const allowed = new Set([...requiredFields, ...optionalFields]);
  if (Object.keys(record).some((field) => !allowed.has(field))) {
    publicationInvalid();
  }
  if (requiredFields.some((field) => !Object.hasOwn(record, field))) {
    publicationInvalid();
  }
}

function requireString(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.normalize("NFC") !== value
  ) {
    publicationInvalid();
  }
  return value;
}

function requireHash(value: unknown): Sha256HashV1 {
  const candidate = requireString(value);
  if (!SHA256_PATTERN.test(candidate) || candidate === ZERO_HASH) {
    publicationInvalid();
  }
  return candidate as Sha256HashV1;
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    publicationInvalid();
  }
  return value as T;
}

function deepFreeze<T>(value: T, visited = new Set<object>()): T {
  if (isNil(value) || typeof value !== "object") return value;
  const object = value as unknown as object;
  if (visited.has(object)) return value;
  visited.add(object);
  for (const child of Object.values(object as Record<string, unknown>)) {
    deepFreeze(child, visited);
  }
  return Object.freeze(object) as T;
}

function requireEqual(actual: unknown, expected: unknown): void {
  if (!isEqual(actual, expected)) publicationInvalid();
}

function selectorOrder(
  left: RouteEvidenceSelectorV1,
  right: RouteEvidenceSelectorV1,
): number {
  if (left.constraintId < right.constraintId) return -1;
  if (left.constraintId > right.constraintId) return 1;
  if (left.routeId < right.routeId) return -1;
  if (left.routeId > right.routeId) return 1;
  return 0;
}

function canonicalSelector(value: unknown): RouteEvidenceSelectorV1 {
  const record = requireRecord(value);
  requireExactFields(record, SELECTOR_FIELDS);
  return {
    constraintId: requireString(record.constraintId),
    routeId: requireString(record.routeId),
  };
}

export function canonicalRouteEvidenceSelectorV1(
  value: unknown,
): RouteEvidenceSelectorV1 {
  try {
    assertPureDataGraph(value);
    return deepFreeze(canonicalSelector(structuredClone(value)));
  } catch {
    selectorInvalid();
  }
}

function canonicalSummary(value: unknown): RouteEvidenceSummaryV1 {
  const record = requireRecord(value);
  requireExactFields(record, SUMMARY_FIELDS);
  if (record.kind !== "route-evidence-summary" || record.schemaVersion !== 1) {
    publicationInvalid();
  }
  return {
    kind: "route-evidence-summary",
    schemaVersion: 1,
    constraintId: requireString(record.constraintId),
    routeId: requireString(record.routeId),
    traversingEntityId: requireString(record.traversingEntityId),
    startAnchorEntityId: requireString(record.startAnchorEntityId),
    destinationAnchorEntityId: requireString(record.destinationAnchorEntityId),
    connectivityStatus: requireEnum(
      record.connectivityStatus,
      ["complete", "unreachable", "incomplete"],
    ),
    routePathStatus: requireEnum(
      record.routePathStatus,
      ["complete", "unavailable"],
    ),
    routeRuntimeProbeStatus: requireEnum(
      record.routeRuntimeProbeStatus,
      ["complete", "failed", "unavailable"],
    ),
    routeOverlayStatus: requireEnum(
      record.routeOverlayStatus,
      ["available", "unavailable"],
    ),
  };
}

function requireOptionalPair(
  record: Readonly<Record<string, unknown>>,
  valueField: string,
  hashField: string,
): boolean {
  const hasValue = Object.hasOwn(record, valueField);
  const hasHash = Object.hasOwn(record, hashField);
  if (hasValue !== hasHash) publicationInvalid();
  return hasValue;
}

export interface WorldkitBrowserRouteEvidenceProjectionV2 {
  readonly selector: RouteEvidenceSelectorV1;
  readonly summary: RouteEvidenceSummaryV1;
  readonly routePathReceipt?: RoutePathReceiptV2;
  readonly routePathReceiptHash?: Sha256HashV1;
  readonly routeRuntimeProbeReceipt?: RouteRuntimeProbeReceiptV2;
  readonly routeRuntimeProbeReceiptHash?: Sha256HashV1;
  readonly routeOverlay?: RouteOverlayV2;
  readonly routeOverlayHash?: Sha256HashV1;
}

export interface WorldkitBrowserRouteEvidencePublicationV2 {
  readonly kind: "worldkit-browser-route-evidence-publication";
  readonly schemaVersion: 2;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly authoringSpecHash: Sha256HashV1;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly executionPlanHash: Sha256HashV1;
  readonly resourceLockHash: Sha256HashV1;
  readonly layoutSolveReportHash: Sha256HashV1;
  readonly validationReportHash: Sha256HashV1;
  readonly routeValidationSetReceiptHash: Sha256HashV1;
  readonly validationProfileRef: string;
  readonly validationProfileResolvedVersion: string;
  readonly validationProfileHash: Sha256HashV1;
  readonly routes: readonly WorldkitBrowserRouteEvidenceProjectionV2[];
}

function canonicalProjectionV2(
  value: unknown,
  publication: Readonly<{
    authoringSpecHash: Sha256HashV1;
    executionPlanHash: Sha256HashV1;
    resourceLockHash: Sha256HashV1;
    layoutSolveReportHash: Sha256HashV1;
    validationProfileRef: string;
    validationProfileResolvedVersion: string;
    validationProfileHash: Sha256HashV1;
  }>,
): WorldkitBrowserRouteEvidenceProjectionV2 {
  const record = requireRecord(value);
  requireExactFields(record, ["selector", "summary"], PROJECTION_FIELDS.slice(2));
  const selector = canonicalSelector(record.selector);
  const summary = canonicalSummary(record.summary);
  requireEqual(
    { constraintId: summary.constraintId, routeId: summary.routeId },
    selector,
  );

  const hasPath = requireOptionalPair(
    record,
    "routePathReceipt",
    "routePathReceiptHash",
  );
  const hasProbe = requireOptionalPair(
    record,
    "routeRuntimeProbeReceipt",
    "routeRuntimeProbeReceiptHash",
  );
  const hasOverlay = requireOptionalPair(
    record,
    "routeOverlay",
    "routeOverlayHash",
  );
  if ((hasProbe || hasOverlay) && !hasPath) publicationInvalid();

  let path: RoutePathReceiptV2 | undefined;
  let pathHash: Sha256HashV1 | undefined;
  if (hasPath) {
    path = canonicalRoutePathReceiptV2(record.routePathReceipt);
    pathHash = requireHash(record.routePathReceiptHash);
    requireEqual(pathHash, hashRoutePathReceiptV2(path));
    requireEqual(
      { constraintId: path.constraintId, routeId: path.routeId },
      selector,
    );
    requireEqual(path.authoringSpecHash, publication.authoringSpecHash);
    requireEqual(path.layoutSolveReportHash, publication.layoutSolveReportHash);
    requireEqual(path.resourceLockHash, publication.resourceLockHash);
    requireEqual(summary.traversingEntityId, path.traversingEntityId);
    requireEqual(summary.startAnchorEntityId, path.startAnchorEntityId);
    requireEqual(summary.destinationAnchorEntityId, path.destinationAnchorEntityId);
  }

  let probe: RouteRuntimeProbeReceiptV2 | undefined;
  let probeHash: Sha256HashV1 | undefined;
  if (hasProbe) {
    if (isNil(path)) publicationInvalid();
    const canonicalProbe = canonicalRouteRuntimeProbeReceiptV2(
      record.routeRuntimeProbeReceipt,
    );
    probe = assertRouteRuntimeProbeReceiptContextV2({
      receipt: canonicalProbe,
      routePathReceipt: path,
      resolvedDriverProfile: resolveTraversalDriverProfileV1(
        canonicalProbe.request.driverProfileRef,
      ),
      validationProfileIdentity: {
        resourceRef: publication.validationProfileRef,
        version: publication.validationProfileResolvedVersion,
        contentHash: publication.validationProfileHash,
      },
    });
    probeHash = requireHash(record.routeRuntimeProbeReceiptHash);
    requireEqual(probeHash, hashRouteRuntimeProbeReceiptV2(probe));
    requireEqual(probe.request.executionPlanHash, publication.executionPlanHash);
  }

  let overlay: RouteOverlayV2 | undefined;
  let overlayHash: Sha256HashV1 | undefined;
  if (hasOverlay) {
    if (isNil(path)) publicationInvalid();
    overlay = canonicalRouteOverlayV2(record.routeOverlay);
    overlayHash = requireHash(record.routeOverlayHash);
    requireEqual(overlayHash, hashRouteOverlayV2(overlay));
    const expectedBindings: ReadonlyArray<readonly [unknown, unknown]> = [
      [overlay.constraintId, path.constraintId],
      [overlay.routeId, path.routeId],
      [overlay.traversingEntityId, path.traversingEntityId],
      [overlay.startAnchor.entityId, path.startAnchorEntityId],
      [overlay.destinationAnchor.entityId, path.destinationAnchorEntityId],
      [overlay.orderedTraversalSurfaceIdentities, path.orderedTraversalSurfaceIdentities],
      [overlay.resolvedTraversalLockHash, path.resolvedTraversalLockHash],
      [overlay.traversalGraphHash, path.traversalGraphHash],
      [overlay.routePathReceiptHash, pathHash],
      [overlay.orderedTraversalNodeIds, path.orderedTraversalNodeIds],
      [overlay.orderedTraversalEdgeIds, path.orderedTraversalEdgeIds],
      [
        overlay.orderedPathPositionsMetersXYZ,
        path.orderedPathPositionsMetersXYZ,
      ],
    ];
    for (const [actual, expected] of expectedBindings) {
      requireEqual(actual, expected);
    }
  }

  requireEqual(summary.routePathStatus, hasPath ? "complete" : "unavailable");
  requireEqual(
    summary.routeRuntimeProbeStatus,
    isNil(probe) ? "unavailable" : probe.status,
  );
  requireEqual(
    summary.routeOverlayStatus,
    isNil(overlay) ? "unavailable" : "available",
  );
  if ((summary.connectivityStatus === "complete") !== hasPath) {
    publicationInvalid();
  }

  return {
    selector,
    summary,
    ...(isNil(path) ? {} : {
      routePathReceipt: path,
      routePathReceiptHash: pathHash!,
    }),
    ...(isNil(probe) ? {} : {
      routeRuntimeProbeReceipt: probe,
      routeRuntimeProbeReceiptHash: probeHash!,
    }),
    ...(isNil(overlay) ? {} : {
      routeOverlay: overlay,
      routeOverlayHash: overlayHash!,
    }),
  };
}

export function canonicalWorldkitBrowserRouteEvidencePublicationV2(
  value: unknown,
): WorldkitBrowserRouteEvidencePublicationV2 {
  try {
    assertPureDataGraph(value);
    const cloned = structuredClone(value);
    const record = requireRecord(cloned);
    requireExactFields(record, PUBLICATION_FIELDS);
    if (
      record.kind !== "worldkit-browser-route-evidence-publication" ||
      record.schemaVersion !== 2 ||
      !Array.isArray(record.routes)
    ) {
      publicationInvalid();
    }
    const identity = {
      worldPackageRootHash: requireHash(record.worldPackageRootHash),
      authoringSpecHash: requireHash(record.authoringSpecHash),
      normalizedWorldIrHash: requireHash(record.normalizedWorldIrHash),
      executionPlanHash: requireHash(record.executionPlanHash),
      resourceLockHash: requireHash(record.resourceLockHash),
      layoutSolveReportHash: requireHash(record.layoutSolveReportHash),
      validationReportHash: requireHash(record.validationReportHash),
      routeValidationSetReceiptHash: requireHash(
        record.routeValidationSetReceiptHash,
      ),
      validationProfileRef: requireString(record.validationProfileRef),
      validationProfileResolvedVersion: requireString(
        record.validationProfileResolvedVersion,
      ),
      validationProfileHash: requireHash(record.validationProfileHash),
    };
    const routes = record.routes.map((route) =>
      canonicalProjectionV2(route, identity)
    );
    for (let index = 1; index < routes.length; index += 1) {
      if (selectorOrder(routes[index - 1]!.selector, routes[index]!.selector) >= 0) {
        publicationInvalid();
      }
    }
    return deepFreeze({
      kind: "worldkit-browser-route-evidence-publication",
      schemaVersion: 2,
      ...identity,
      routes,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "WORLDKIT_BROWSER_ROUTE_EVIDENCE_PUBLICATION_INVALID"
    ) {
      throw error;
    }
    publicationInvalid();
  }
}
