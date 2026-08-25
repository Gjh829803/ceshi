import { canonicalJsonBytes, sha256Bytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  canonicalWorldkitBrowserRouteEvidencePublicationV2,
  type WorldkitBrowserRouteEvidenceProjectionV2,
  type WorldkitBrowserRouteEvidencePublicationV2,
} from "@whitebox-world/runtime-contracts";
import {
  assertRouteOverlayContextV2,
  canonicalRouteOverlayV2,
  canonicalRoutePathReceiptV2,
  canonicalRouteRuntimeProbeReceiptV2,
  hashRouteOverlayV2,
  hashRoutePathReceiptV2,
  hashRouteRuntimeProbeReceiptV2,
  type RouteOverlayV2,
  type RouteRuntimeProbeReceiptV2,
} from "@whitebox-world/traversal";
import { isEqual, isNil, isPlainObject } from "lodash-es";

import {
  createRouteValidationReportV2,
  type RouteValidationRowInputV2,
} from "./route-evaluator.js";
import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2,
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
} from "./profile-v2.js";
import {
  canonicalRouteValidationSetReceiptV1,
  hashRouteValidationSetReceiptV1,
} from "./route-validation-set.js";
import type {
  EvidenceArtifactKindV2,
  EvidenceArtifactV2,
  RouteValidationSetRowV1,
  ValidationReportV2,
  WorldPackageValidationSubjectV1,
} from "./types-v2.js";
import type { Sha256HashV1 } from "./types.js";

type UnknownRecord = Record<string, unknown>;

const INPUT_FIELDS = ["subject", "validationReport", "rows"] as const;
const PUBLICATION_ROW_FIELDS = ["validationRow", "routeOverlay"] as const;
const VALIDATION_ROW_FIELDS = [
  "routeBuildInputReceipt",
  "routeConnectivityResult",
  "routeRuntimeProbeReceipt",
  "resolvedTraversalLockReceipt",
  "evidenceBytes",
] as const;
const EVIDENCE_BYTES_FIELDS = [
  "traversalGraph",
  "routePathReceipt",
  "routeConnectivityFailure",
  "routeRuntimeProbeReceipt",
  "routeOverlay",
] as const;
const SUBJECT_FIELDS = [
  "kind",
  "worldPackageRootHash",
  "authoringSpecHash",
  "normalizedWorldIrHash",
  "executionPlanHash",
  "resourceLockHash",
  "layoutSolveReportHash",
] as const;

export interface RouteEvidencePublicationRowInputV2 {
  readonly validationRow: RouteValidationRowInputV2;
  readonly routeOverlay?: RouteOverlayV2;
}

export interface CreateWorldkitBrowserRouteEvidencePublicationInputV2 {
  readonly subject: WorldPackageValidationSubjectV1;
  readonly validationReport: ValidationReportV2;
  readonly rows: readonly RouteEvidencePublicationRowInputV2[];
}

function fail(): never {
  throw new Error("WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID");
}

function exactFields(
  value: unknown,
  allowedFields: readonly string[],
  requiredFields: readonly string[],
): UnknownRecord {
  if (!isPlainObject(value)) fail();
  const record = value as UnknownRecord;
  const allowed = new Set(allowedFields);
  const ownKeys = Reflect.ownKeys(record);
  if (
    ownKeys.some((field) => typeof field !== "string" || !allowed.has(field)) ||
    requiredFields.some((field) => !Object.hasOwn(record, field))
  ) {
    fail();
  }
  return record;
}

function typedArrayBuffer(value: Uint8Array): ArrayBufferLike {
  const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
  const getter = Object.getOwnPropertyDescriptor(
    typedArrayPrototype,
    "buffer",
  )?.get;
  if (isNil(getter)) fail();
  try {
    return getter.call(value) as ArrayBufferLike;
  } catch {
    fail();
  }
}

function assertPureDataGraph(
  value: unknown,
  visited = new Set<object>(),
  active = new Set<object>(),
): void {
  if (typeof value === "symbol") fail();
  if (isNil(value) || typeof value !== "object") return;
  if (active.has(value)) fail();
  if (visited.has(value)) return;
  if (Object.getOwnPropertySymbols(value).length !== 0) fail();

  if (value instanceof Uint8Array) {
    for (const [field, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(value),
    )) {
      if (
        !/^(0|[1-9][0-9]*)$/.test(field) ||
        !isNil(descriptor.get) ||
        !isNil(descriptor.set)
      ) {
        fail();
      }
    }
    const buffer = typedArrayBuffer(value);
    if (
      typeof SharedArrayBuffer !== "undefined" &&
      buffer instanceof SharedArrayBuffer
    ) {
      fail();
    }
    try {
      value.slice();
    } catch {
      fail();
    }
    return;
  }
  if (value instanceof ArrayBuffer) {
    try {
      value.slice(0);
    } catch {
      fail();
    }
    return;
  }
  if (!Array.isArray(value) && !isPlainObject(value)) fail();

  visited.add(value);
  active.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    const expectedKeys = [
      ...Array.from({ length: value.length }, (_, index) => String(index)),
      "length",
    ];
    const actualKeys = Reflect.ownKeys(descriptors);
    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((field) =>
        typeof field !== "string" || !expectedKeys.includes(field)
      )
    ) {
      fail();
    }
  }
  for (const [field, descriptor] of Object.entries(descriptors)) {
    if (!isNil(descriptor.get) || !isNil(descriptor.set)) fail();
    if (
      (!Array.isArray(value) || field !== "length") &&
      descriptor.enumerable !== true
    ) {
      fail();
    }
    if (Object.hasOwn(descriptor, "value")) {
      assertPureDataGraph(descriptor.value, visited, active);
    }
  }
  active.delete(value);
}

function snapshotInput(
  input: CreateWorldkitBrowserRouteEvidencePublicationInputV2,
): CreateWorldkitBrowserRouteEvidencePublicationInputV2 {
  assertPureDataGraph(input);
  exactFields(input, INPUT_FIELDS, INPUT_FIELDS);
  exactFields(input.subject, SUBJECT_FIELDS, SUBJECT_FIELDS);
  if (!Array.isArray(input.rows)) fail();
  for (const row of input.rows) {
    const wrapper = exactFields(
      row,
      PUBLICATION_ROW_FIELDS,
      ["validationRow"],
    );
    if (Object.hasOwn(wrapper, "routeOverlay") && isNil(wrapper.routeOverlay)) {
      fail();
    }
    const validationRow = exactFields(
      wrapper.validationRow,
      VALIDATION_ROW_FIELDS,
      [
        "routeBuildInputReceipt",
        "routeConnectivityResult",
        "resolvedTraversalLockReceipt",
        "evidenceBytes",
      ],
    );
    if (
      Object.hasOwn(validationRow, "routeRuntimeProbeReceipt") &&
      isNil(validationRow.routeRuntimeProbeReceipt)
    ) {
      fail();
    }
    const evidenceBytes = exactFields(
      validationRow.evidenceBytes,
      EVIDENCE_BYTES_FIELDS,
      [],
    );
    for (const field of EVIDENCE_BYTES_FIELDS) {
      if (Object.hasOwn(evidenceBytes, field) && isNil(evidenceBytes[field])) {
        fail();
      }
    }
  }
  try {
    return deepFreezeSnapshot(structuredClone(input));
  } catch {
    fail();
  }
}

function deepFreezeSnapshot<T>(
  value: T,
  visited = new Set<object>(),
): T {
  if (isNil(value) || typeof value !== "object") return value;
  const object = value as object;
  if (visited.has(object)) return value;
  visited.add(object);
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeSnapshot(child, visited);
  }
  return Object.freeze(object) as T;
}

function compareSelector(
  left: Readonly<{ constraintId: string; routeId: string }>,
  right: Readonly<{ constraintId: string; routeId: string }>,
): number {
  if (left.constraintId < right.constraintId) return -1;
  if (left.constraintId > right.constraintId) return 1;
  if (left.routeId < right.routeId) return -1;
  if (left.routeId > right.routeId) return 1;
  return 0;
}

function selectorForRow(row: RouteValidationRowInputV2): Readonly<{
  constraintId: string;
  routeId: string;
}> {
  const requirement = row.routeBuildInputReceipt.input.connectivityRequirement;
  return {
    constraintId: requirement.constraintId,
    routeId: requirement.routeId,
  };
}

function requireEqual(actual: unknown, expected: unknown): void {
  if (!isEqual(actual, expected)) fail();
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function requireEvidenceArtifact(
  report: ValidationReportV2,
  receiptRow: RouteValidationSetRowV1,
  kind: EvidenceArtifactKindV2,
  bytes: Uint8Array,
): EvidenceArtifactV2 {
  const matches = Object.values(report.evidenceArtifactsById).filter(
    (artifact) =>
      artifact.kind === kind &&
      "constraintId" in artifact &&
      artifact.constraintId === receiptRow.constraintId &&
      artifact.routeId === receiptRow.routeId,
  );
  if (matches.length !== 1) fail();
  const artifact = matches[0]!;
  if (
    !receiptRow.evidenceArtifactRefs.includes(artifact.artifactRef) ||
    artifact.sizeBytes !== bytes.byteLength ||
    artifact.contentHash !== sha256Bytes(bytes)
  ) {
    fail();
  }
  return artifact;
}

function requireRouteSetArtifact(
  report: ValidationReportV2,
  receipt: ReturnType<typeof canonicalRouteValidationSetReceiptV1>,
): void {
  const matches = Object.values(report.evidenceArtifactsById).filter(
    ({ kind }) => kind === "route-validation-set-receipt",
  );
  if (matches.length !== 1) fail();
  const artifact = matches[0]!;
  if (artifact.kind !== "route-validation-set-receipt") fail();
  const bytes = canonicalJsonBytes(receipt);
  if (
    !isEqual(artifact.receipt, receipt) ||
    artifact.sizeBytes !== bytes.byteLength ||
    artifact.contentHash !== sha256Bytes(bytes)
  ) {
    fail();
  }
}

function hashValidationReportV2(report: ValidationReportV2): Sha256HashV1 {
  return sha256CanonicalJson(report) as Sha256HashV1;
}



export interface RouteEvidencePublicationRowInputV2 {
  readonly validationRow: RouteValidationRowInputV2;
  readonly routeOverlay?: RouteOverlayV2;
}

export interface CreateWorldkitBrowserRouteEvidencePublicationInputV2 {
  readonly subject: WorldPackageValidationSubjectV1;
  readonly validationReport: ValidationReportV2;
  readonly rows: readonly RouteEvidencePublicationRowInputV2[];
}

function expectedOverlayV2(
  row: RouteValidationRowInputV2,
  overlay: RouteOverlayV2,
): RouteOverlayV2 {
  if (row.routeConnectivityResult.status !== "complete") fail();
  const overlayRecord = overlay as unknown as Record<string, unknown>;
  if (
    Object.hasOwn(overlayRecord, "traversalSurfaceIdentity") ||
    Object.hasOwn(
      overlayRecord,
      ["blocking", "Collider", "Identities"].join(""),
    )
  ) {
    fail();
  }
  return assertRouteOverlayContextV2({
    overlay,
    routeConnectivityResult: row.routeConnectivityResult,
    buildInputReceipt: row.routeBuildInputReceipt,
  });
}

function projectionForRowV2(
  report: ValidationReportV2,
  receiptRow: RouteValidationSetRowV1,
  inputRow: RouteEvidencePublicationRowInputV2,
): WorldkitBrowserRouteEvidenceProjectionV2 {
  const row = inputRow.validationRow;
  const requirement = row.routeBuildInputReceipt.input.connectivityRequirement;
  requireEqual(selectorForRow(row), {
    constraintId: receiptRow.constraintId,
    routeId: receiptRow.routeId,
  });
  requireEqual(
    {
      traversingEntityId: requirement.traversingEntityId,
      startAnchorEntityId: requirement.startAnchorEntityId,
      destinationAnchorEntityId: requirement.destinationAnchorEntityId,
      resolvedTraversalLockHash:
        row.resolvedTraversalLockReceipt.resolvedTraversalLockHash,
      connectivityStatus: row.routeConnectivityResult.status,
      runtimeStatus: isNil(row.routeRuntimeProbeReceipt)
        ? "not-run"
        : row.routeRuntimeProbeReceipt.status,
    },
    {
      traversingEntityId: receiptRow.traversingEntityId,
      startAnchorEntityId: receiptRow.startAnchorEntityId,
      destinationAnchorEntityId: receiptRow.destinationAnchorEntityId,
      resolvedTraversalLockHash: receiptRow.resolvedTraversalLockHash,
      connectivityStatus: receiptRow.connectivityStatus,
      runtimeStatus: receiptRow.runtimeStatus,
    },
  );

  const selector = {
    constraintId: receiptRow.constraintId,
    routeId: receiptRow.routeId,
  };
  if (row.routeConnectivityResult.status !== "complete") {
    if (!isNil(inputRow.routeOverlay)) fail();
    return {
      selector,
      summary: {
        kind: "route-evidence-summary",
        schemaVersion: 1,
        ...selector,
        traversingEntityId: receiptRow.traversingEntityId,
        startAnchorEntityId: receiptRow.startAnchorEntityId,
        destinationAnchorEntityId: receiptRow.destinationAnchorEntityId,
        connectivityStatus: receiptRow.connectivityStatus,
        routePathStatus: "unavailable",
        routeRuntimeProbeStatus: "unavailable",
        routeOverlayStatus: "unavailable",
      },
    };
  }

  const path = canonicalRoutePathReceiptV2(
    row.routeConnectivityResult.routePathReceipt,
  );
  const pathBytes = row.evidenceBytes.routePathReceipt;
  if (isNil(pathBytes) || !bytesEqual(pathBytes, canonicalJsonBytes(path))) fail();
  requireEvidenceArtifact(report, receiptRow, "route-path-receipt", pathBytes);

  let probe: RouteRuntimeProbeReceiptV2 | undefined;
  let probeHash: Sha256HashV1 | undefined;
  if (!isNil(row.routeRuntimeProbeReceipt)) {
    probe = canonicalRouteRuntimeProbeReceiptV2(row.routeRuntimeProbeReceipt);
    const probeBytes = row.evidenceBytes.routeRuntimeProbeReceipt;
    if (isNil(probeBytes) || !bytesEqual(probeBytes, canonicalJsonBytes(probe))) {
      fail();
    }
    requireEvidenceArtifact(
      report,
      receiptRow,
      "route-runtime-probe-receipt",
      probeBytes,
    );
    probeHash = hashRouteRuntimeProbeReceiptV2(probe) as Sha256HashV1;
  } else if (!isNil(row.evidenceBytes.routeRuntimeProbeReceipt)) {
    fail();
  }

  const hasOverlayBytes = !isNil(row.evidenceBytes.routeOverlay);
  if (hasOverlayBytes !== !isNil(inputRow.routeOverlay)) fail();
  let overlay: RouteOverlayV2 | undefined;
  let overlayHash: Sha256HashV1 | undefined;
  if (hasOverlayBytes) {
    overlay = expectedOverlayV2(row, inputRow.routeOverlay!);
    if (!bytesEqual(row.evidenceBytes.routeOverlay!, canonicalJsonBytes(overlay))) {
      fail();
    }
    requireEvidenceArtifact(
      report,
      receiptRow,
      "route-overlay",
      row.evidenceBytes.routeOverlay!,
    );
    overlayHash = hashRouteOverlayV2(overlay) as Sha256HashV1;
  }

  return {
    selector,
    summary: {
      kind: "route-evidence-summary",
      schemaVersion: 1,
      ...selector,
      traversingEntityId: receiptRow.traversingEntityId,
      startAnchorEntityId: receiptRow.startAnchorEntityId,
      destinationAnchorEntityId: receiptRow.destinationAnchorEntityId,
      connectivityStatus: "complete",
      routePathStatus: "complete",
      routeRuntimeProbeStatus: isNil(probe) ? "unavailable" : probe.status,
      routeOverlayStatus: isNil(overlay) ? "unavailable" : "available",
    },
    routePathReceipt: path,
    routePathReceiptHash: hashRoutePathReceiptV2(path) as Sha256HashV1,
    ...(isNil(probe)
      ? {}
      : {
          routeRuntimeProbeReceipt: probe,
          routeRuntimeProbeReceiptHash: probeHash!,
        }),
    ...(isNil(overlay)
      ? {}
      : { routeOverlay: overlay, routeOverlayHash: overlayHash! }),
  };
}

export function createWorldkitBrowserRouteEvidencePublicationV2(
  input: CreateWorldkitBrowserRouteEvidencePublicationInputV2,
): WorldkitBrowserRouteEvidencePublicationV2 {
  try {
    const snapshot = snapshotInput(
      input as unknown as CreateWorldkitBrowserRouteEvidencePublicationInputV2,
    );
    const rowsWithSelectors = snapshot.rows.map((row) => ({
      row,
      selector: selectorForRow(row.validationRow),
    }));
    for (let index = 1; index < rowsWithSelectors.length; index += 1) {
      if (
        compareSelector(
          rowsWithSelectors[index - 1]!.selector,
          rowsWithSelectors[index]!.selector,
        ) >= 0
      ) {
        fail();
      }
    }

    const rebuiltReport = createRouteValidationReportV2({
      reportId: snapshot.validationReport.id,
      subject: snapshot.subject,
      dependencyReportRefs: snapshot.validationReport.dependencyReportRefs,
      validationProfile: OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
      requiredRoutes:
        snapshot.validationReport.routeValidationSetReceipt.requiredRoutes,
      rows: snapshot.rows.map(({ validationRow }) => validationRow),
    });
    requireEqual(snapshot.validationReport, rebuiltReport);
    const suppliedReportHash = hashValidationReportV2(
      snapshot.validationReport,
    );
    const rebuiltReportHash = hashValidationReportV2(rebuiltReport);
    requireEqual(suppliedReportHash, rebuiltReportHash);

    const receipt = canonicalRouteValidationSetReceiptV1(
      rebuiltReport.routeValidationSetReceipt,
    );
    requireRouteSetArtifact(rebuiltReport, receipt);
    if (receipt.rows.length !== rowsWithSelectors.length) fail();
    const projections = rowsWithSelectors.map(({ row }, index) =>
      projectionForRowV2(
        rebuiltReport,
        receipt.rows[index]!,
        row as unknown as RouteEvidencePublicationRowInputV2,
      ),
    );

    return canonicalWorldkitBrowserRouteEvidencePublicationV2({
      kind: "worldkit-browser-route-evidence-publication",
      schemaVersion: 2,
      worldPackageRootHash: snapshot.subject.worldPackageRootHash,
      authoringSpecHash: snapshot.subject.authoringSpecHash,
      normalizedWorldIrHash: snapshot.subject.normalizedWorldIrHash,
      executionPlanHash: snapshot.subject.executionPlanHash,
      resourceLockHash: snapshot.subject.resourceLockHash,
      layoutSolveReportHash: snapshot.subject.layoutSolveReportHash,
      validationReportHash: rebuiltReportHash,
      routeValidationSetReceiptHash: hashRouteValidationSetReceiptV1(receipt),
      validationProfileRef:
        OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.resourceRef,
      validationProfileResolvedVersion:
        OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.version,
      validationProfileHash:
        OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_HASH_V2,
      routes: projections,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "WORLDKIT_ROUTE_EVIDENCE_PUBLICATION_INPUT_INVALID"
    ) {
      throw error;
    }
    fail();
  }
}
