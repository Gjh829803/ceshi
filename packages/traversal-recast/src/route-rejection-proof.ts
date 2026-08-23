import { isNil } from "lodash-es";

type Vec3 = readonly [number, number, number];

const REJECTION_KIND_ORDER = [
  "slope",
  "step",
  "width",
  "overhead",
  "gap",
] as const;

export type RouteRejectionKindV1 = (typeof REJECTION_KIND_ORDER)[number];

export type RouteRejectionReasonV1 =
  | Readonly<{
      kind: "slope";
      terrainEntityId: string;
      maximumObservedSlopeDegrees: number;
      maximumAllowedSlopeDegrees: number;
    }>
  | Readonly<{
      kind: "step";
      terrainEntityId: string;
      maximumObservedStepHeightMeters: number;
      maximumAllowedStepHeightMeters: number;
    }>
  | Readonly<{
      kind: "width";
      terrainEntityId: string;
      relevantColliderSubshapeIds: readonly string[];
      minimumObservedClearanceWidthMeters: number;
      minimumRequiredClearanceWidthMeters: number;
    }>
  | Readonly<{
      kind: "overhead";
      terrainEntityId: string;
      relevantColliderSubshapeIds: readonly string[];
      minimumObservedClearanceHeightMeters: number;
      minimumRequiredClearanceHeightMeters: number;
    }>
  | Readonly<{
      kind: "gap";
      terrainEntityId: string;
      maximumObservedSurfaceGapMeters: number;
      maximumAllowedSurfaceGapMeters: 0;
    }>;

export interface RouteRejectionCandidateV1 {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly failurePositionMetersXYZ: Vec3;
  readonly rejectionReasons: readonly RouteRejectionReasonV1[];
}

export interface EvaluateRouteRejectionProofInputV1 {
  readonly nodeIds: readonly string[];
  readonly candidates: readonly RouteRejectionCandidateV1[];
  readonly startNodeId: string;
  readonly destinationNodeId: string;
  readonly isSourceProjectionConsistent: boolean;
  readonly isProofBudgetExhausted: boolean;
  readonly maximumNodes: number;
  readonly maximumEdges: number;
  readonly maximumSearchSteps: number;
  readonly admitWhenRelaxedKindPresent?: boolean;
}

export type RouteRejectionProofGenericReasonV1 =
  | "ambiguous-or-mixed-cut"
  | "proof-budget-exhausted"
  | "source-projection-inconsistent";

export type RouteRejectionProofEvaluationV1 =
  | Readonly<{
      status: "generic";
      reason: RouteRejectionProofGenericReasonV1;
    }>
  | Readonly<{
      status: "specialized";
      rejectionKind: RouteRejectionKindV1;
      proofKind: "unique-single-reason-cut";
      proofCandidateIds: readonly string[];
      failurePositionMetersXYZ: Vec3;
      rejectionReason: RouteRejectionReasonV1;
    }>;

interface RestoringPathV1 {
  readonly rejectionKind: RouteRejectionKindV1;
  readonly candidateIds: readonly string[];
}

interface SearchBudgetV1 {
  consumedSteps: number;
  isExhausted: boolean;
}

function fail(message: string): never {
  throw new Error(`ROUTE_REJECTION_PROOF_INVALID: ${message}`);
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function generic(
  reason: RouteRejectionProofGenericReasonV1,
): RouteRejectionProofEvaluationV1 {
  return Object.freeze({ status: "generic", reason });
}

function requirePositiveBudget(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${name} must be a non-negative safe integer.`);
  }
}

function requireFiniteTuple(value: Vec3, name: string): void {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((component) => !Number.isFinite(component))
  ) {
    fail(`${name} must be a finite XYZ tuple.`);
  }
}

function validateReason(reason: RouteRejectionReasonV1, candidateId: string): void {
  if (!REJECTION_KIND_ORDER.includes(reason.kind)) {
    fail(`candidate '${candidateId}' has an unknown rejection kind.`);
  }
  if (reason.terrainEntityId.length === 0) {
    fail(`candidate '${candidateId}' has an empty terrainEntityId.`);
  }
  for (const [key, value] of Object.entries(reason)) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      fail(`candidate '${candidateId}' has non-finite '${key}'.`);
    }
  }
}

function validateInput(input: EvaluateRouteRejectionProofInputV1): Readonly<{
  nodeIds: ReadonlySet<string>;
  candidatesById: ReadonlyMap<string, RouteRejectionCandidateV1>;
  outgoingByNodeId: ReadonlyMap<string, readonly RouteRejectionCandidateV1[]>;
}> {
  if (
    typeof input.isSourceProjectionConsistent !== "boolean" ||
    typeof input.isProofBudgetExhausted !== "boolean"
  ) {
    fail("source consistency and proof-budget state must be booleans.");
  }
  requirePositiveBudget(input.maximumNodes, "maximumNodes");
  requirePositiveBudget(input.maximumEdges, "maximumEdges");
  requirePositiveBudget(input.maximumSearchSteps, "maximumSearchSteps");
  const nodeIds = new Set<string>();
  for (const nodeId of input.nodeIds) {
    if (typeof nodeId !== "string" || nodeId.length === 0 || nodeIds.has(nodeId)) {
      fail("nodeIds must contain unique non-empty strings.");
    }
    nodeIds.add(nodeId);
  }
  if (!nodeIds.has(input.startNodeId) || !nodeIds.has(input.destinationNodeId)) {
    fail("startNodeId and destinationNodeId must exist in nodeIds.");
  }

  const candidatesById = new Map<string, RouteRejectionCandidateV1>();
  const outgoingByNodeId = new Map<string, RouteRejectionCandidateV1[]>();
  for (const candidate of input.candidates) {
    if (
      candidate.id.length === 0 ||
      candidatesById.has(candidate.id) ||
      !nodeIds.has(candidate.fromNodeId) ||
      !nodeIds.has(candidate.toNodeId)
    ) {
      fail("candidates must have unique IDs and known endpoint Nodes.");
    }
    requireFiniteTuple(
      candidate.failurePositionMetersXYZ,
      `candidate '${candidate.id}' failurePositionMetersXYZ`,
    );
    const rejectionKinds = new Set<RouteRejectionKindV1>();
    for (const rejectionReason of candidate.rejectionReasons) {
      validateReason(rejectionReason, candidate.id);
      if (rejectionKinds.has(rejectionReason.kind)) {
        fail(`candidate '${candidate.id}' repeats rejection kind '${rejectionReason.kind}'.`);
      }
      rejectionKinds.add(rejectionReason.kind);
    }
    candidatesById.set(candidate.id, candidate);
    const outgoing = outgoingByNodeId.get(candidate.fromNodeId) ?? [];
    outgoing.push(candidate);
    outgoingByNodeId.set(candidate.fromNodeId, outgoing);
  }
  for (const outgoing of outgoingByNodeId.values()) {
    outgoing.sort((left, right) => compareId(left.id, right.id));
  }
  return { nodeIds, candidatesById, outgoingByNodeId };
}

function isAdmitted(
  candidate: RouteRejectionCandidateV1,
  relaxedKind: RouteRejectionKindV1,
  admitWhenRelaxedKindPresent: boolean,
): boolean {
  if (candidate.rejectionReasons.length === 0) return true;
  if (admitWhenRelaxedKindPresent) {
    return candidate.rejectionReasons.some((reason) => reason.kind === relaxedKind);
  }
  return (
    candidate.rejectionReasons.length === 1 &&
    candidate.rejectionReasons[0]!.kind === relaxedKind
  );
}

function findRestoringPath(
  input: EvaluateRouteRejectionProofInputV1,
  outgoingByNodeId: ReadonlyMap<string, readonly RouteRejectionCandidateV1[]>,
  rejectionKind: RouteRejectionKindV1,
  budget: SearchBudgetV1,
): RestoringPathV1 | undefined {
  const queue = [input.startNodeId];
  let readIndex = 0;
  const visited = new Set<string>([input.startNodeId]);
  const predecessorByNodeId = new Map<string, RouteRejectionCandidateV1>();

  while (readIndex < queue.length) {
    if (budget.consumedSteps === input.maximumSearchSteps) {
      budget.isExhausted = true;
      return undefined;
    }
    const currentNodeId = queue[readIndex++]!;
    budget.consumedSteps += 1;
    if (currentNodeId === input.destinationNodeId) break;
    for (const candidate of outgoingByNodeId.get(currentNodeId) ?? []) {
      if (
        !isAdmitted(
          candidate,
          rejectionKind,
          input.admitWhenRelaxedKindPresent === true,
        ) ||
        visited.has(candidate.toNodeId)
      ) {
        continue;
      }
      visited.add(candidate.toNodeId);
      predecessorByNodeId.set(candidate.toNodeId, candidate);
      queue.push(candidate.toNodeId);
    }
  }

  if (!visited.has(input.destinationNodeId)) return undefined;
  const candidateIds: string[] = [];
  let currentNodeId = input.destinationNodeId;
  while (currentNodeId !== input.startNodeId) {
    const candidate = predecessorByNodeId.get(currentNodeId);
    if (isNil(candidate)) {
      fail("restoring path predecessor chain is incomplete.");
    }
    candidateIds.push(candidate.id);
    currentNodeId = candidate.fromNodeId;
  }
  candidateIds.reverse();
  return { rejectionKind, candidateIds };
}

function aggregateReasons(
  kind: RouteRejectionKindV1,
  candidates: readonly RouteRejectionCandidateV1[],
): RouteRejectionReasonV1 | undefined {
  const reasons = candidates.map((candidate) =>
    candidate.rejectionReasons.find((reason) => reason.kind === kind)!,
  );
  const terrainEntityId = reasons[0]!.terrainEntityId;
  if (reasons.some((reason) => reason.terrainEntityId !== terrainEntityId)) {
    return undefined;
  }
  switch (kind) {
    case "slope": {
      const typed = reasons as Extract<RouteRejectionReasonV1, { kind: "slope" }>[];
      const allowed = typed[0]!.maximumAllowedSlopeDegrees;
      if (typed.some((reason) =>
        reason.maximumAllowedSlopeDegrees !== allowed ||
        !(reason.maximumObservedSlopeDegrees > allowed)
      )) return undefined;
      return Object.freeze({
        kind,
        terrainEntityId,
        maximumObservedSlopeDegrees: Math.max(
          ...typed.map((reason) => reason.maximumObservedSlopeDegrees),
        ),
        maximumAllowedSlopeDegrees: allowed,
      });
    }
    case "step": {
      const typed = reasons as Extract<RouteRejectionReasonV1, { kind: "step" }>[];
      const allowed = typed[0]!.maximumAllowedStepHeightMeters;
      if (typed.some((reason) =>
        reason.maximumAllowedStepHeightMeters !== allowed ||
        !(reason.maximumObservedStepHeightMeters > allowed)
      )) return undefined;
      return Object.freeze({
        kind,
        terrainEntityId,
        maximumObservedStepHeightMeters: Math.max(
          ...typed.map((reason) => reason.maximumObservedStepHeightMeters),
        ),
        maximumAllowedStepHeightMeters: allowed,
      });
    }
    case "width": {
      const typed = reasons as Extract<RouteRejectionReasonV1, { kind: "width" }>[];
      const required = typed[0]!.minimumRequiredClearanceWidthMeters;
      if (typed.some((reason) =>
        reason.minimumRequiredClearanceWidthMeters !== required ||
        !(reason.minimumObservedClearanceWidthMeters < required)
      )) return undefined;
      return Object.freeze({
        kind,
        terrainEntityId,
        relevantColliderSubshapeIds: Object.freeze([
          ...new Set(typed.flatMap((reason) => reason.relevantColliderSubshapeIds)),
        ].sort(compareId)),
        minimumObservedClearanceWidthMeters: Math.min(
          ...typed.map((reason) => reason.minimumObservedClearanceWidthMeters),
        ),
        minimumRequiredClearanceWidthMeters: required,
      });
    }
    case "overhead": {
      const typed = reasons as Extract<RouteRejectionReasonV1, { kind: "overhead" }>[];
      const required = typed[0]!.minimumRequiredClearanceHeightMeters;
      if (typed.some((reason) =>
        reason.minimumRequiredClearanceHeightMeters !== required ||
        !(reason.minimumObservedClearanceHeightMeters < required)
      )) return undefined;
      return Object.freeze({
        kind,
        terrainEntityId,
        relevantColliderSubshapeIds: Object.freeze([
          ...new Set(typed.flatMap((reason) => reason.relevantColliderSubshapeIds)),
        ].sort(compareId)),
        minimumObservedClearanceHeightMeters: Math.min(
          ...typed.map((reason) => reason.minimumObservedClearanceHeightMeters),
        ),
        minimumRequiredClearanceHeightMeters: required,
      });
    }
    case "gap": {
      const typed = reasons as Extract<RouteRejectionReasonV1, { kind: "gap" }>[];
      if (typed.some((reason) =>
        reason.maximumAllowedSurfaceGapMeters !== 0 ||
        !(reason.maximumObservedSurfaceGapMeters > 0)
      )) return undefined;
      return Object.freeze({
        kind,
        terrainEntityId,
        maximumObservedSurfaceGapMeters: Math.max(
          ...typed.map((reason) => reason.maximumObservedSurfaceGapMeters),
        ),
        maximumAllowedSurfaceGapMeters: 0,
      });
    }
  }
}

export function evaluateRouteRejectionProofV1(
  input: EvaluateRouteRejectionProofInputV1,
): RouteRejectionProofEvaluationV1 {
  const { candidatesById, outgoingByNodeId } = validateInput(input);
  if (!input.isSourceProjectionConsistent) {
    return generic("source-projection-inconsistent");
  }
  if (input.isProofBudgetExhausted) {
    return generic("proof-budget-exhausted");
  }
  if (
    input.nodeIds.length > input.maximumNodes ||
    input.candidates.length > input.maximumEdges
  ) {
    return generic("proof-budget-exhausted");
  }

  const budget: SearchBudgetV1 = { consumedSteps: 0, isExhausted: false };
  const restoringPaths: RestoringPathV1[] = [];
  for (const kind of REJECTION_KIND_ORDER) {
    const path = findRestoringPath(input, outgoingByNodeId, kind, budget);
    if (budget.isExhausted) return generic("proof-budget-exhausted");
    if (!isNil(path)) restoringPaths.push(path);
  }
  if (restoringPaths.length !== 1) {
    return generic("ambiguous-or-mixed-cut");
  }

  const restoringPath = restoringPaths[0]!;
  const restoringCandidates = restoringPath.candidateIds
    .map((candidateId) => candidatesById.get(candidateId)!)
    .filter((candidate) => candidate.rejectionReasons.length === 1);
  if (restoringCandidates.length === 0) {
    return generic("ambiguous-or-mixed-cut");
  }
  restoringCandidates.sort((left, right) => compareId(left.id, right.id));
  const rejectionReason = aggregateReasons(
    restoringPath.rejectionKind,
    restoringCandidates,
  );
  if (isNil(rejectionReason)) {
    return generic("source-projection-inconsistent");
  }
  const proofCandidateIds = Object.freeze(
    restoringCandidates.map((candidate) => candidate.id),
  );
  const failurePositionMetersXYZ = Object.freeze([
    ...restoringCandidates[0]!.failurePositionMetersXYZ,
  ]) as Vec3;
  return Object.freeze({
    status: "specialized",
    rejectionKind: restoringPath.rejectionKind,
    proofKind: "unique-single-reason-cut",
    proofCandidateIds,
    failurePositionMetersXYZ,
    rejectionReason,
  });
}
