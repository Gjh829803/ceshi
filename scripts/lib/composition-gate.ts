import { createHash } from "node:crypto";

export interface CompositionPlanIdentity {
  sceneId: string;
  specHash: string;
  frozenPlanSpecSha256: string;
  planLockSha256: string;
}

export interface CompositionRegionMetric {
  id: string;
  iou: number;
  minimumIou: number;
  pass: boolean;
}

export interface CompositionAnchorMetric {
  id: string;
  expectedCenter: readonly [number, number];
  observedCenter: readonly [number, number] | null;
  expectedSize?: readonly [number, number];
  observedSize: readonly [number, number] | null;
  error: number;
  tolerance: number;
  pass: boolean;
}

export interface CompositionReport {
  score: number;
  minimumScore: number;
  pass: boolean;
  regions: readonly CompositionRegionMetric[];
  anchors: readonly CompositionAnchorMetric[];
  planIdentity?: CompositionPlanIdentity;
}

export interface TrustedCompositionReport extends CompositionReport {
  pass: true;
  planIdentity: CompositionPlanIdentity;
}

export interface PlanningManifest {
  artifactVersion: number;
  workflowStage: string;
  sceneId: string;
  specHash: string;
  frozenPlanSpecSha256: string;
  planLockSha256: string;
  [key: string]: unknown;
}

interface CompositionGuide {
  minimumScore: number;
  regions: readonly { id: string; minimumIou: number }[];
  anchors: readonly {
    id: string;
    center: readonly [number, number];
    size?: readonly [number, number];
    tolerance: number;
  }[];
}

interface CompositionWorldSpec {
  id: string;
  source?: { referenceImages?: readonly string[] };
  entry: { composition: { guide?: CompositionGuide } };
}

export function requiresCompositionPromotion(
  worldSpec: CompositionWorldSpec,
): boolean {
  return (worldSpec.source?.referenceImages?.length ?? 0) > 0 ||
    worldSpec.entry.composition.guide !== undefined;
}

export function planningWorkflowStage(
  worldSpec: CompositionWorldSpec,
): "whitebox-built" | "verified" {
  return requiresCompositionPromotion(worldSpec) ? "whitebox-built" : "verified";
}

interface FrozenPlan {
  workflowVersion: number;
  sceneId: string;
  stage: string;
  specSha256: string;
}

interface CompositionGateInput {
  sceneId: string;
  worldSpec: CompositionWorldSpec;
  frozenPlan: FrozenPlan;
  planLockSha256: string;
  planningManifest: PlanningManifest;
  report: unknown;
}

export type CompositionGateErrorCode =
  | "COMPOSITION_PLAN_STALE"
  | "COMPOSITION_REPORT_FAILED"
  | "COMPOSITION_REPORT_INVALID"
  | "COMPOSITION_REPORT_MISSING"
  | "COMPOSITION_REPORT_STALE";

export type CompositionGateResult =
  | { ok: true; trustedReport: TrustedCompositionReport }
  | { ok: false; code: CompositionGateErrorCode; message: string };

function failure(
  code: CompositionGateErrorCode,
  message: string,
): CompositionGateResult {
  return { ok: false, code, message };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function specHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function finiteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function finitePoint(value: unknown): value is readonly [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function samePoint(
  actual: readonly [number, number] | undefined,
  expected: readonly [number, number] | undefined,
): boolean {
  if (actual === undefined || expected === undefined) return actual === expected;
  return actual[0] === expected[0] && actual[1] === expected[1];
}

function currentPlanIdentity(
  input: CompositionGateInput,
): CompositionPlanIdentity | Extract<CompositionGateResult, { ok: false }> {
  const serializedSpec = JSON.stringify(input.worldSpec);
  const actualSpecSha256 = sha256(serializedSpec);
  const actualSpecHash = specHash(serializedSpec);
  if (
    input.worldSpec.id !== input.sceneId ||
    input.frozenPlan.workflowVersion !== 1 ||
    input.frozenPlan.stage !== "frozen" ||
    input.frozenPlan.sceneId !== input.sceneId ||
    input.frozenPlan.specSha256 !== actualSpecSha256 ||
    input.planningManifest.artifactVersion !== 1 ||
    input.planningManifest.sceneId !== input.sceneId ||
    (input.planningManifest.workflowStage !== "whitebox-built" &&
      input.planningManifest.workflowStage !== "verified") ||
    input.planningManifest.specHash !== actualSpecHash ||
    input.planningManifest.frozenPlanSpecSha256 !== input.frozenPlan.specSha256 ||
    input.planningManifest.planLockSha256 !== input.planLockSha256
  ) {
    return {
      ok: false,
      code: "COMPOSITION_PLAN_STALE",
      message: `Scene ${input.sceneId} planning identity does not match its current frozen plan.`,
    };
  }
  return {
    sceneId: input.sceneId,
    specHash: actualSpecHash,
    frozenPlanSpecSha256: input.frozenPlan.specSha256,
    planLockSha256: input.planLockSha256,
  };
}

function sameIdentity(
  actual: CompositionPlanIdentity | undefined,
  expected: CompositionPlanIdentity,
): boolean {
  return actual !== undefined &&
    actual.sceneId === expected.sceneId &&
    actual.specHash === expected.specHash &&
    actual.frozenPlanSpecSha256 === expected.frozenPlanSpecSha256 &&
    actual.planLockSha256 === expected.planLockSha256;
}

function validateCompositionReport(
  input: CompositionGateInput,
  requirePersistedIdentity: boolean,
): CompositionGateResult {
  const identity = currentPlanIdentity(input);
  if ("ok" in identity) return identity;
  if (input.report === undefined || input.report === null) {
    return failure(
      "COMPOSITION_REPORT_MISSING",
      `Scene ${input.sceneId} has no persisted opening composition report.`,
    );
  }
  const guide = input.worldSpec.entry.composition.guide;
  if (guide === undefined) {
    return failure(
      "COMPOSITION_REPORT_INVALID",
      `Scene ${input.sceneId} has no opening composition guide.`,
    );
  }
  if (typeof input.report !== "object" || Array.isArray(input.report)) {
    return failure("COMPOSITION_REPORT_INVALID", "Opening composition report must be an object.");
  }
  const report = input.report as Partial<CompositionReport>;
  if (
    !finiteNumber(report.score, 0, 1) ||
    !finiteNumber(report.minimumScore, 0, 1) ||
    typeof report.pass !== "boolean" ||
    !Array.isArray(report.regions) ||
    !Array.isArray(report.anchors)
  ) {
    return failure("COMPOSITION_REPORT_INVALID", "Opening composition report metrics are invalid.");
  }
  if (requirePersistedIdentity && !sameIdentity(report.planIdentity, identity)) {
    return failure(
      "COMPOSITION_REPORT_STALE",
      `Scene ${input.sceneId} composition report targets a different planning identity.`,
    );
  }
  if (
    report.minimumScore !== guide.minimumScore ||
    report.regions.length !== guide.regions.length ||
    report.anchors.length !== guide.anchors.length
  ) {
    return failure(
      "COMPOSITION_REPORT_STALE",
      `Scene ${input.sceneId} composition thresholds do not match the current guide.`,
    );
  }

  const regions: CompositionRegionMetric[] = [];
  for (let index = 0; index < guide.regions.length; index += 1) {
    const expected = guide.regions[index];
    const actual = report.regions[index];
    if (
      expected === undefined ||
      actual === undefined ||
      actual.id !== expected.id ||
      actual.minimumIou !== expected.minimumIou
    ) {
      return failure(
        "COMPOSITION_REPORT_STALE",
        `Scene ${input.sceneId} composition regions do not match the current guide.`,
      );
    }
    if (!finiteNumber(actual.iou, 0, 1) || typeof actual.pass !== "boolean") {
      return failure("COMPOSITION_REPORT_INVALID", `Composition region '${expected.id}' is invalid.`);
    }
    regions.push({ ...actual, pass: actual.iou >= expected.minimumIou });
  }

  const anchors: CompositionAnchorMetric[] = [];
  for (let index = 0; index < guide.anchors.length; index += 1) {
    const expected = guide.anchors[index];
    const actual = report.anchors[index];
    if (
      expected === undefined ||
      actual === undefined ||
      actual.id !== expected.id ||
      actual.tolerance !== expected.tolerance ||
      !finitePoint(actual.expectedCenter) ||
      !samePoint(actual.expectedCenter, expected.center) ||
      (actual.expectedSize !== undefined && !finitePoint(actual.expectedSize)) ||
      !samePoint(actual.expectedSize, expected.size)
    ) {
      return failure(
        "COMPOSITION_REPORT_STALE",
        `Scene ${input.sceneId} composition anchors do not match the current guide.`,
      );
    }
    if (
      (actual.observedCenter !== null && !finitePoint(actual.observedCenter)) ||
      (actual.observedSize !== null && !finitePoint(actual.observedSize)) ||
      !finiteNumber(actual.error, 0, Number.MAX_VALUE) ||
      typeof actual.pass !== "boolean"
    ) {
      return failure("COMPOSITION_REPORT_INVALID", `Composition anchor '${expected.id}' is invalid.`);
    }
    anchors.push({ ...actual, pass: actual.error <= expected.tolerance });
  }

  const pass = report.score >= guide.minimumScore &&
    regions.every((metric) => metric.pass) &&
    anchors.every((metric) => metric.pass);
  if (!pass) {
    return failure(
      "COMPOSITION_REPORT_FAILED",
      `Scene ${input.sceneId} opening composition does not satisfy the current guide.`,
    );
  }
  return {
    ok: true,
    trustedReport: {
      score: report.score,
      minimumScore: guide.minimumScore,
      pass: true,
      regions,
      anchors,
      planIdentity: identity,
    },
  };
}

export function validateSubmittedCompositionReport(
  input: CompositionGateInput,
): CompositionGateResult {
  return validateCompositionReport(input, false);
}

export function validatePersistedCompositionReport(
  input: CompositionGateInput,
): CompositionGateResult {
  return validateCompositionReport(input, true);
}

export function promotePlanningManifest(
  manifest: PlanningManifest,
  report: TrustedCompositionReport,
): PlanningManifest {
  if (
    !report.pass ||
    manifest.sceneId !== report.planIdentity.sceneId ||
    manifest.specHash !== report.planIdentity.specHash ||
    manifest.frozenPlanSpecSha256 !== report.planIdentity.frozenPlanSpecSha256 ||
    manifest.planLockSha256 !== report.planIdentity.planLockSha256
  ) {
    throw new Error("Cannot promote a planning manifest with unmatched composition evidence.");
  }
  return { ...manifest, workflowStage: "verified" };
}
