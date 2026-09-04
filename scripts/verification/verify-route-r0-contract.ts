import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseAuthoringSpecV4,
  validateAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { isEqual, isNil, isPlainObject } from "lodash-es";
import {
  assertMatchingTraversalLocksV1,
  assertTraversalSurfaceIdentityV1,
  BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF,
  canonicalTraversalGraphV2,
  hashTraversalGraphV2,
  resolveTraversalDriverProfileV1,
  resolveTraversalLockV1,
  validateTraversalDriverProfileV1,
  type TraversalGraphV2,
  type TraversalSurfaceIdentityV1,
} from "@whitebox-world/traversal";
import {
  OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1,
  ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2,
  validateValidationProfileV1,
} from "@whitebox-world/validation";
import {
  projectPlannedRouteToCanonicalRouteV1,
  type PlannedRoute,
} from "@whitebox-world/world";

export const ROUTE_R0_CONTRACT_CHECKS = [
  "authoring-v4-connectivity",
  "planner-route-projection",
  "traversal-surface-identity",
  "resolved-traversal-lock",
  "driver-profile-whitelist",
  "canonical-graph-bytes",
  "route-validation-vocabulary",
  "lock-mismatch-diagnostic",
] as const;

export type RouteR0ContractCheckId = (typeof ROUTE_R0_CONTRACT_CHECKS)[number];

export interface RouteR0ContractVerificationResult {
  readonly ok: true;
  readonly checks: readonly RouteR0ContractCheckId[];
}

interface RouteR0ContractFixture {
  readonly kind: "worldkit-route-r0-contract-fixture";
  readonly schemaVersion: 1;
  readonly authoringSpec: AuthoringSpecV4;
  readonly plannedRoute: PlannedRoute;
  readonly surfaceIdentity: TraversalSurfaceIdentityV1;
  readonly lock: unknown;
  readonly graph: TraversalGraphV2;
  readonly traversalGraphHash: `sha256:${string}`;
}

interface RouteR0LockMismatchFixture {
  readonly kind: "worldkit-route-r0-lock-mismatch-fixture";
  readonly schemaVersion: 1;
  readonly graphResolvedTraversalLockHash: string;
  readonly runtimeResolvedTraversalLockHash: string;
}

const FROZEN_NOTICE =
  "R0 contract frozen; this command does not prove R1/R1b runtime capability";

async function readJsonFixture(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function requireFixtureObject(
  value: unknown,
  expectedKind: string,
): Record<string, unknown> {
  assert.equal(isPlainObject(value), true, `${expectedKind} must be an object.`);
  const record = value as Record<string, unknown>;
  assert.equal(record.kind, expectedKind, `Unexpected fixture kind '${String(record.kind)}'.`);
  assert.equal(record.schemaVersion, 1, `${expectedKind} schemaVersion must be 1.`);
  return record;
}

function checkAuthoringV4Connectivity(authoringSpec: unknown): void {
  const parsed = parseAuthoringSpecV4(stringifyCanonicalJson(authoringSpec));
  assert.equal(parsed.ok, true, "Authoring V4 fixture must parse.");
  const validated = validateAuthoringSpecV4(authoringSpec);
  assert.equal(validated.ok, true, "Authoring V4 connectivity fixture must validate.");
  if (!validated.ok || isNil(validated.value)) {
    throw new Error("Authoring V4 connectivity fixture failed validation.");
  }
  const connectivity = validated.value.constraints.connectivity;
  assert.equal(connectivity.length, 1, "R0 fixture must declare one connectivity constraint.");
  const constraint = connectivity[0];
  assert.ok(!isNil(constraint), "Connectivity constraint is missing.");
  assert.equal(constraint.kind, "connected-by-route");
  assert.equal(constraint.requirement, "required");
  assert.equal(constraint.traversingEntityId, "player");
  assert.equal(constraint.startAnchorEntityId, "spawn-main");
  assert.equal(constraint.destinationAnchorEntityId, "watchtower-entry");
  assert.equal(constraint.routeId, "spawn-to-watchtower");
  assert.equal(
    Object.hasOwn(constraint, "subjectId"),
    false,
    "connected-by-route must not expose subjectId.",
  );

  const obsoleteVersionPolluted = {
    ...(authoringSpec as Record<string, unknown>),
    schemaVersion: 3,
  };
  assert.equal(
    validateAuthoringSpecV4(obsoleteVersionPolluted).ok,
    false,
    "Current Authoring validation must reject an obsolete top-level version.",
  );
}

function checkPlannerRouteProjection(
  plannedRoute: PlannedRoute,
  authoringSpec: AuthoringSpecV4,
): void {
  assert.equal(Object.hasOwn(plannedRoute, "points"), false);
  assert.equal(Object.hasOwn(plannedRoute, "width"), false);
  assert.equal(Object.hasOwn(plannedRoute, "maxSlopeDegrees"), false);
  const projected = projectPlannedRouteToCanonicalRouteV1(plannedRoute);
  assert.deepEqual(projected, {
    id: plannedRoute.id,
    kind: "polyline-xz",
    pointsMetersXZ: plannedRoute.pointsMetersXZ,
    widthMeters: plannedRoute.widthMeters,
    locomotionProfileRef: plannedRoute.locomotionProfileRef,
  });
  assert.equal(Object.hasOwn(projected, "priority"), false);
  assert.equal(Object.hasOwn(projected, "maximumDesignSlopeDegrees"), false);
  assert.equal(Object.hasOwn(projected, "evidence"), false);
  const authoredRoute = authoringSpec.spatial.routes.find(
    (route) => route.id === plannedRoute.id,
  );
  assert.ok(!isNil(authoredRoute), "Planner Route must match an Authoring Route id.");
  assert.equal(isEqual(projected, authoredRoute), true);
}

function checkTraversalSurfaceIdentity(
  identity: TraversalSurfaceIdentityV1,
): void {
  assertTraversalSurfaceIdentityV1(identity);
}

function checkResolvedTraversalLock(lock: unknown): `sha256:${string}` {
  const receipt = resolveTraversalLockV1(lock);
  assert.equal(receipt.lock.locomotionCapabilityRef, "worldkit://capability/locomotion.ground@1");
  assert.equal(
    receipt.lock.runtimeAdapterRef,
    "worldkit://runtime-adapter/babylon-world-runtime@1",
  );
  assert.equal(Object.hasOwn(receipt.lock, "resolvedTraversalLockHash"), false);
  return receipt.resolvedTraversalLockHash;
}

function checkDriverProfileWhitelist(): void {
  const resolved = resolveTraversalDriverProfileV1(BUILT_IN_TRAVERSAL_DRIVER_PROFILE_REF);
  validateTraversalDriverProfileV1(resolved.profile);
  assert.throws(
    () =>
      validateTraversalDriverProfileV1({
        ...resolved.profile,
        walkSpeedMetersPerSecond: 3,
      }),
    (error: unknown) =>
      error instanceof Error && error.message.includes("TRAVERSAL_DRIVER_FIELD_FORBIDDEN"),
  );
  assert.throws(
    () =>
      validateTraversalDriverProfileV1({
        ...resolved.profile,
        destinationToleranceMetersXZ: 0.5,
      }),
    (error: unknown) =>
      error instanceof Error && error.message.includes("TRAVERSAL_DRIVER_FIELD_FORBIDDEN"),
  );
}

function checkCanonicalGraphBytes(
  graph: TraversalGraphV2,
  expectedHash: `sha256:${string}`,
  resolvedTraversalLockHash: `sha256:${string}`,
): void {
  const canonical = canonicalTraversalGraphV2(graph);
  assert.equal(Object.hasOwn(canonical, "traversalGraphHash"), false);
  assert.equal(canonical.resolvedTraversalLockHash, resolvedTraversalLockHash);
  for (const edge of Object.values(canonical.traversalEdgesById)) {
    assert.equal(
      Object.hasOwn(edge, "stepHeightMeters"),
      true,
      "Graph V1 Edge must carry distinct non-negative stepHeightMeters evidence.",
    );
    assert.equal(edge.stepHeightMeters >= 0, true);
    assert.equal(
      edge.type,
      edge.stepHeightMeters > 0
        ? "step"
        : edge.slopeDegrees > 0
        ? "slope"
        : "walk",
      "Graph V1 Edge type must follow step, slope, walk priority.",
    );
  }
  assert.equal(Object.isFrozen(canonical), true);
  assert.equal(Object.isFrozen(canonical.traversalNodesById), true);
  assert.deepEqual(
    Object.keys(canonical.traversalNodesById),
    Object.keys(canonical.traversalNodesById).sort(),
    "Graph V1 Node map must be emitted in canonical id order.",
  );
  assert.deepEqual(
    Object.keys(canonical.traversalEdgesById),
    Object.keys(canonical.traversalEdgesById).sort(),
    "Graph V1 Edge map must be emitted in canonical id order.",
  );
  assert.equal(hashTraversalGraphV2(graph), expectedHash);
}

function checkRouteValidationVocabulary(): void {
  assert.equal(
    new Set(ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2).size,
    ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2.length,
  );
  assert.equal(
    ROUTE_VALIDATION_DIAGNOSTIC_CODES_V2.includes("ROUTE_TRAVERSAL_LOCK_MISMATCH"),
    true,
  );
  assert.equal(
    validateValidationProfileV1(OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1).ok,
    true,
  );
  assert.ok(
    !isNil(
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1.gateDefinitionsById["route-connectivity"],
    ),
  );
  assert.ok(
    !isNil(
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1.gateDefinitionsById[
        "route-runtime-conformance"
      ],
    ),
  );
  assert.equal(
    OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.subjectKind,
    "control-capture-bundle",
  );
  assert.equal(
    validateValidationProfileV1(OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1).ok,
    true,
  );
  assert.equal(
    Object.hasOwn(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.gateDefinitionsById,
      "route-connectivity",
    ),
    false,
  );
  const connectivity =
    OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V1.gateDefinitionsById[
      "route-connectivity"
    ];
  assert.ok(!isNil(connectivity));
  for (const metricId of [
    "maximum-observed-step-height-meters",
    "maximum-observed-slope-degrees",
    "minimum-observed-clearance-width-meters",
    "minimum-observed-clearance-height-meters",
    "maximum-observed-surface-gap-meters",
  ] as const) {
    const metric = connectivity.metricDefinitionsById[metricId];
    assert.ok(!isNil(metric));
    assert.equal(Object.hasOwn(metric, "minimumAllowedMeters"), false);
    assert.equal(Object.hasOwn(metric, "maximumAllowedMeters"), false);
    assert.equal(Object.hasOwn(metric, "minimumAllowedDegrees"), false);
    assert.equal(Object.hasOwn(metric, "maximumAllowedDegrees"), false);
  }
}

function checkLockMismatchDiagnostic(mismatch: RouteR0LockMismatchFixture): void {
  assert.notEqual(
    mismatch.graphResolvedTraversalLockHash,
    mismatch.runtimeResolvedTraversalLockHash,
  );
  assert.throws(
    () =>
      assertMatchingTraversalLocksV1(
        mismatch.graphResolvedTraversalLockHash,
        mismatch.runtimeResolvedTraversalLockHash,
      ),
    (error: unknown) =>
      error instanceof Error && error.message.includes("ROUTE_TRAVERSAL_LOCK_MISMATCH"),
  );
}

export async function runRouteR0ContractVerification(options: {
  readonly repositoryRoot: string;
}): Promise<RouteR0ContractVerificationResult> {
  const contractPath = path.join(
    options.repositoryRoot,
    "examples/traversal/route-r0-contract.json",
  );
  const mismatchPath = path.join(
    options.repositoryRoot,
    "examples/traversal/route-r0-lock-mismatch.json",
  );
  const contractRecord = requireFixtureObject(
    await readJsonFixture(contractPath),
    "worldkit-route-r0-contract-fixture",
  );
  const mismatchRecord = requireFixtureObject(
    await readJsonFixture(mismatchPath),
    "worldkit-route-r0-lock-mismatch-fixture",
  );
  const contract = contractRecord as unknown as RouteR0ContractFixture;
  const mismatch = mismatchRecord as unknown as RouteR0LockMismatchFixture;

  checkAuthoringV4Connectivity(contract.authoringSpec);
  checkPlannerRouteProjection(contract.plannedRoute, contract.authoringSpec);
  checkTraversalSurfaceIdentity(contract.surfaceIdentity);
  const resolvedTraversalLockHash = checkResolvedTraversalLock(contract.lock);
  checkDriverProfileWhitelist();
  checkCanonicalGraphBytes(
    contract.graph,
    contract.traversalGraphHash,
    resolvedTraversalLockHash,
  );
  checkRouteValidationVocabulary();
  checkLockMismatchDiagnostic(mismatch);

  return {
    ok: true,
    checks: [...ROUTE_R0_CONTRACT_CHECKS],
  };
}

function formatVerificationOutput(result: RouteR0ContractVerificationResult): string {
  const lines = result.checks.map((check) => `ok ${check}`);
  lines.push(FROZEN_NOTICE);
  return `${lines.join("\n")}\n`;
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
  const result = await runRouteR0ContractVerification({ repositoryRoot });
  process.stdout.write(formatVerificationOutput(result));
}
