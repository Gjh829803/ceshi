import { sha256CanonicalJson } from "@whitebox-world/protocol";

import { generateLayoutCandidatesV1 } from "./candidates.js";
import { evaluatePlacementConstraintV1 } from "./evaluators.js";
import { quantizeFinite } from "./geometry.js";
import { hashLayoutSolveReportV1 } from "./report.js";
import type {
  ConstraintEvaluationV1,
  LayoutCandidateV1,
  LayoutConstraintEvaluationContextV1,
  LayoutDiagnosticV1,
  LayoutPlacementResultV1,
  LayoutSolveReportV1,
  LayoutSolveResultV1,
  LayoutSolverProfileV1,
  ResolvedLayoutEntityV1,
  ResolvedLayoutInputV1,
  ResolvedPlacementConstraintV1,
} from "./types.js";

type Assignment = Readonly<Record<string, LayoutCandidateV1>>;

interface SearchOutcome {
  readonly bestAssignment?: Assignment;
  readonly bestEvaluations?: readonly ConstraintEvaluationV1[];
  readonly bestPreferenceCostRatio?: number;
  readonly budgetExceeded: boolean;
  readonly searchNodeCount: number;
}

function duplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

function validateInput(
  input: ResolvedLayoutInputV1,
  profile: LayoutSolverProfileV1,
): readonly LayoutDiagnosticV1[] {
  const diagnostics: LayoutDiagnosticV1[] = [];
  const add = (instancePath: string, entityId?: string) => {
    diagnostics.push({
      severity: "error",
      code: "PLACEMENT_INPUT_INVALID",
      instancePath,
      ...(entityId === undefined ? {} : { entityId }),
    });
  };
  if (
    input.kind !== "worldkit-resolved-layout-input" ||
    input.schemaVersion !== 1 ||
    !Number.isInteger(input.seed) ||
    input.seed < 0
  ) add("");
  const hashPattern = /^sha256:[a-f0-9]{64}$/;
  if (!hashPattern.test(input.authoringSpecHash)) add("/authoringSpecHash");
  if (!hashPattern.test(input.layoutInputHash)) add("/layoutInputHash");
  if (!hashPattern.test(input.registryLockHash)) add("/registryLockHash");
  if (
    input.solverProfile.contentHash !== sha256CanonicalJson(profile) ||
    !hashPattern.test(input.solverProfile.contentHash)
  ) add("/solverProfile/contentHash");
  if (!/^worldkit:\/\/layout-solver-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
    input.solverProfile.solverProfileRef,
  )) add("/solverProfile/solverProfileRef");
  if (!/^[1-9][0-9]*$/.test(input.solverProfile.resolvedVersion)) {
    add("/solverProfile/resolvedVersion");
  }
  const worldBoundsValues = [
    ...input.worldBounds.minimumMetersXYZ,
    ...input.worldBounds.maximumMetersXYZ,
  ];
  if (
    worldBoundsValues.some((value) => !Number.isFinite(value)) ||
    [0, 1, 2].some((axis) =>
      input.worldBounds.minimumMetersXYZ[axis]! > input.worldBounds.maximumMetersXYZ[axis]!
    )
  ) add("/worldBounds");
  if (input.constraints.length > profile.budgets.maximumConstraints) add("/constraints");
  const duplicateEntityId = duplicate(input.entities.map((entity) => entity.id));
  if (duplicateEntityId !== undefined) add("/entities", duplicateEntityId);
  if (duplicate(input.constraints.map((constraint) => constraint.id)) !== undefined) add("/constraints");
  if (duplicate(input.regions.map((region) => region.id)) !== undefined) add("/regions");
  if (duplicate(input.routes.map((route) => route.id)) !== undefined) add("/routes");
  if (duplicate(input.screenRegions.map((region) => region.id)) !== undefined) add("/screenRegions");
  if (
    !Number.isInteger(profile.budgets.maximumSearchNodes) ||
    profile.budgets.maximumSearchNodes < 1 ||
    !Number.isInteger(profile.budgets.maximumConflictChecks) ||
    profile.budgets.maximumConflictChecks < 0 ||
    !Number.isInteger(profile.budgets.maximumDiagnostics) ||
    profile.budgets.maximumDiagnostics < 1
  ) add("/solverProfile/budgets");
  return diagnostics.slice(0, Math.max(1, profile.budgets.maximumDiagnostics));
}

function constraintEntityIds(
  constraint: ResolvedPlacementConstraintV1,
  input: ResolvedLayoutInputV1,
): readonly string[] {
  const domainIds = new Set(input.entities.map((entity) => entity.id));
  const onlyDomains = (ids: readonly string[]) => ids.filter((id) => domainIds.has(id));
  switch (constraint.kind) {
    case "inside-region":
    case "outside-region":
      return onlyDomains([constraint.entityId]);
    case "distance-range":
      return onlyDomains([constraint.entityId, constraint.referenceEntityId]);
    case "faces-entity":
      return onlyDomains([constraint.facingEntityId, constraint.targetEntityId]);
    case "supported-by":
      return onlyDomains([constraint.supportedEntityId, constraint.supportingEntityId]);
    case "minimum-clearance": {
      if (constraint.otherEntityIds !== undefined) {
        return onlyDomains([constraint.entityId, ...constraint.otherEntityIds]);
      }
      const semanticIds = input.entities
        .filter((entity) =>
          entity.id !== constraint.entityId &&
          constraint.semanticClassIds.includes(entity.semanticClassId ?? "")
        )
        .map((entity) => entity.id);
      return onlyDomains([constraint.entityId, ...semanticIds]);
    }
    case "within-slope-limit":
      return onlyDomains(constraint.entityId === undefined ? [] : [constraint.entityId]);
    case "visible-in-camera-region":
      return [...domainIds].sort((left, right) => left.localeCompare(right));
  }
}

function evaluationContext(
  input: ResolvedLayoutInputV1,
  profile: LayoutSolverProfileV1,
): LayoutConstraintEvaluationContextV1 {
  return {
    profile,
    entitiesById: Object.fromEntries(
      input.entities.map((entity) => [entity.id, {
        id: entity.id,
        ...(entity.semanticClassId === undefined ? {} : { semanticClassId: entity.semanticClassId }),
      }]),
    ),
    regionsById: Object.fromEntries(input.regions.map((region) => [region.id, region])),
    routesById: Object.fromEntries(input.routes.map((route) => [route.id, route])),
    screenRegionsById: Object.fromEntries(
      input.screenRegions.map((region) => [region.id, region]),
    ),
    geometry: input.geometry,
  };
}

function candidateInsideWorld(candidate: LayoutCandidateV1, input: ResolvedLayoutInputV1): boolean {
  for (let axis = 0; axis < 3; axis += 1) {
    if (
      candidate.bounds.minimumMetersXYZ[axis]! < input.worldBounds.minimumMetersXYZ[axis]! ||
      candidate.bounds.maximumMetersXYZ[axis]! > input.worldBounds.maximumMetersXYZ[axis]!
    ) return false;
  }
  return true;
}

function stableDomains(
  input: ResolvedLayoutInputV1,
  profile: LayoutSolverProfileV1,
): ReadonlyMap<string, readonly LayoutCandidateV1[]> {
  return new Map(
    input.entities.map((entity) => {
      const candidates = generateLayoutCandidatesV1(
        {
          entity,
          regions: input.regions,
          routes: input.routes,
          anchorsByEntityId: input.anchorsByEntityId,
          geometry: input.geometry,
        },
        profile,
      ).filter((candidate) => candidateInsideWorld(candidate, input));
      return [entity.id, [...candidates].sort((left, right) =>
        Number(right.isInitial) - Number(left.isInitial) ||
        left.localCostRatio - right.localCostRatio ||
        left.transform.positionMetersXYZ[0] - right.transform.positionMetersXYZ[0] ||
        left.transform.positionMetersXYZ[1] - right.transform.positionMetersXYZ[1] ||
        left.transform.positionMetersXYZ[2] - right.transform.positionMetersXYZ[2] ||
        left.transform.rotationEulerRadiansXYZ[0] - right.transform.rotationEulerRadiansXYZ[0] ||
        left.transform.rotationEulerRadiansXYZ[1] - right.transform.rotationEulerRadiansXYZ[1] ||
        left.transform.rotationEulerRadiansXYZ[2] - right.transform.rotationEulerRadiansXYZ[2] ||
        left.id.localeCompare(right.id)
      )] as const;
    }),
  );
}

function search(
  input: ResolvedLayoutInputV1,
  profile: LayoutSolverProfileV1,
  constraints: readonly ResolvedPlacementConstraintV1[],
  domains: ReadonlyMap<string, readonly LayoutCandidateV1[]>,
  stopAtFirst: boolean,
): SearchOutcome {
  const context = evaluationContext(input, profile);
  const variables = [...input.entities].sort((left, right) =>
    (domains.get(left.id)?.length ?? 0) - (domains.get(right.id)?.length ?? 0) ||
    left.id.localeCompare(right.id)
  );
  let searchNodeCount = 0;
  let budgetExceeded = false;
  let bestAssignment: Assignment | undefined;
  let bestEvaluations: readonly ConstraintEvaluationV1[] | undefined;
  let bestPreferenceCostRatio: number | undefined;
  let bestLocalCostRatio: number | undefined;
  let bestSignature: string | undefined;

  const compareAndStore = (
    assignment: Record<string, LayoutCandidateV1>,
    evaluations: readonly ConstraintEvaluationV1[],
  ) => {
    if (evaluations.some((evaluation) =>
      evaluation.requirement === "required" && !evaluation.satisfied
    )) return;
    const preferenceWeight = constraints.reduce(
      (sum, constraint) => sum + (constraint.requirement === "preferred"
        ? constraint.preferenceWeightRatio
        : 0),
      0,
    );
    const preferenceCost = quantizeFinite(
      (evaluations.reduce((sum, evaluation) => {
        const constraint = constraints.find((row) => row.id === evaluation.constraintId)!;
        return sum + (constraint.requirement === "preferred"
          ? constraint.preferenceWeightRatio * evaluation.preferenceCostRatio
          : 0);
      }, 0)) / (preferenceWeight === 0 ? 1 : preferenceWeight),
      profile.quantization.scoreStep,
    );
    const localCost = quantizeFinite(
      Object.values(assignment).reduce((sum, candidate) => sum + candidate.localCostRatio, 0),
      profile.quantization.scoreStep,
    );
    const signature = JSON.stringify(
      Object.fromEntries(Object.keys(assignment).sort().map((id) => [id, assignment[id]!.id])),
    );
    if (
      bestAssignment === undefined ||
      preferenceCost < bestPreferenceCostRatio! ||
      (preferenceCost === bestPreferenceCostRatio && localCost < bestLocalCostRatio!) ||
      (preferenceCost === bestPreferenceCostRatio && localCost === bestLocalCostRatio &&
        signature.localeCompare(bestSignature!) < 0)
    ) {
      bestAssignment = { ...assignment };
      bestEvaluations = evaluations;
      bestPreferenceCostRatio = preferenceCost;
      bestLocalCostRatio = localCost;
      bestSignature = signature;
    }
  };

  if ([...domains.values()].some((candidates) => candidates.length === 0)) {
    return { budgetExceeded: false, searchNodeCount: 0 };
  }
  const assignment: Record<string, LayoutCandidateV1> = {};
  // Each depth retains its for-loop cursor while a child explores the next variable.
  const nextCandidateIndices = [0];
  while (nextCandidateIndices.length > 0 && !(stopAtFirst && bestAssignment !== undefined)) {
    const index = nextCandidateIndices.length - 1;
    const variable = variables[index]!;
    const candidates = index === variables.length ? [] : domains.get(variable.id) ?? [];
    if (index === variables.length || nextCandidateIndices[index]! >= candidates.length) {
      if (index === variables.length) {
        const evaluations = constraints.map((constraint) =>
          evaluatePlacementConstraintV1(context, constraint, assignment)
        );
        compareAndStore(assignment, evaluations);
      }
      nextCandidateIndices.pop();
      if (index > 0) delete assignment[variables[index - 1]!.id];
      continue;
    }
    const candidate = candidates[nextCandidateIndices[index]!]!;
    nextCandidateIndices[index]! += 1;
    searchNodeCount += 1;
    if (searchNodeCount > profile.budgets.maximumSearchNodes) {
      budgetExceeded = true;
      break;
    }
    assignment[variable.id] = candidate;
    const readyRequired = constraints.filter((constraint) =>
      constraint.requirement === "required" &&
      constraintEntityIds(constraint, input).every((id) => assignment[id] !== undefined)
    );
    const hasViolation = readyRequired.some((constraint) =>
      !evaluatePlacementConstraintV1(context, constraint, assignment).satisfied
    );
    if (hasViolation) delete assignment[variable.id];
    else nextCandidateIndices.push(0);
  }
  return {
    ...(bestAssignment === undefined ? {} : { bestAssignment }),
    ...(bestEvaluations === undefined ? {} : { bestEvaluations }),
    ...(bestPreferenceCostRatio === undefined ? {} : { bestPreferenceCostRatio }),
    budgetExceeded,
    searchNodeCount,
  };
}

function orderedRecord<T>(
  rows: readonly [string, T][],
): Readonly<Record<string, T>> {
  return Object.fromEntries(
    [...rows].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function reportBase(
  input: ResolvedLayoutInputV1,
  status: LayoutSolveReportV1["status"],
): Omit<LayoutSolveReportV1, "placementsByEntityId" | "constraintResultsById" | "totalPreferenceCostRatio" | "diagnostics" | "searchNodeCount" | "conflictCheckCount" | "conflictConstraintIds"> {
  return {
    kind: "worldkit-layout-solve-report",
    schemaVersion: 1,
    id: `${input.id}-layout`,
    authoringSpecHash: input.authoringSpecHash,
    layoutInputHash: input.layoutInputHash,
    registryLockHash: input.registryLockHash,
    solverProfileRef: input.solverProfile.solverProfileRef,
    resolvedVersion: input.solverProfile.resolvedVersion,
    solverProfileHash: input.solverProfile.contentHash,
    seed: input.seed,
    status,
  };
}

function finish(report: LayoutSolveReportV1): LayoutSolveResultV1 {
  const output: LayoutSolveResultV1 = {
    status: report.status,
    report,
    layoutSolveReportHash: hashLayoutSolveReportV1(report),
  };
  const deepFreeze = <T>(value: T): T => {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  };
  return deepFreeze(output);
}

function constraintTouchesEntity(
  constraint: ResolvedPlacementConstraintV1,
  entityId: string,
  input: ResolvedLayoutInputV1,
): boolean {
  return constraintEntityIds(constraint, input).includes(entityId);
}

function solvedPlacements(
  input: ResolvedLayoutInputV1,
  assignment: Assignment,
  evaluations: readonly ConstraintEvaluationV1[],
  profile: LayoutSolverProfileV1,
): Readonly<Record<string, LayoutPlacementResultV1>> {
  return orderedRecord(
    Object.keys(assignment).map((entityId) => {
      const candidate = assignment[entityId]!;
      const related = evaluations.filter((evaluation) => {
        const constraint = input.constraints.find((row) => row.id === evaluation.constraintId)!;
        return constraintTouchesEntity(constraint, entityId, input);
      });
      const weight = related.reduce((sum, evaluation) => {
        const constraint = input.constraints.find((row) => row.id === evaluation.constraintId)!;
        return sum + (constraint.requirement === "preferred"
          ? constraint.preferenceWeightRatio
          : 0);
      }, 0);
      const cost = related.reduce((sum, evaluation) => {
        const constraint = input.constraints.find((row) => row.id === evaluation.constraintId)!;
        return sum + (constraint.requirement === "preferred"
          ? constraint.preferenceWeightRatio * evaluation.preferenceCostRatio
          : 0);
      }, 0) / (weight === 0 ? 1 : weight);
      return [entityId, {
        entityId,
        candidateId: candidate.id,
        candidateSource: candidate.source,
        transform: candidate.transform,
        satisfiedConstraintIds: related.filter((row) => row.satisfied).map((row) => row.constraintId).sort(),
        preferenceCostRatio: quantizeFinite(cost, profile.quantization.scoreStep),
      }] as [string, LayoutPlacementResultV1];
    }),
  );
}

export function solveLayoutV1(
  input: ResolvedLayoutInputV1,
  profile: LayoutSolverProfileV1,
): LayoutSolveResultV1 {
  const inputDiagnostics = validateInput(input, profile);
  if (inputDiagnostics.length > 0) {
    return finish({
      ...reportBase(input, "invalid-input"),
      placementsByEntityId: {},
      constraintResultsById: {},
      totalPreferenceCostRatio: 0,
      diagnostics: inputDiagnostics,
      searchNodeCount: 0,
      conflictCheckCount: 0,
      conflictConstraintIds: [],
    });
  }

  let domains: ReadonlyMap<string, readonly LayoutCandidateV1[]>;
  try {
    domains = stableDomains(input, profile);
  } catch {
    return finish({
      ...reportBase(input, "invalid-input"),
      placementsByEntityId: {},
      constraintResultsById: {},
      totalPreferenceCostRatio: 0,
      diagnostics: [{ severity: "error", code: "PLACEMENT_INPUT_INVALID", instancePath: "/entities" }],
      searchNodeCount: 0,
      conflictCheckCount: 0,
      conflictConstraintIds: [],
    });
  }

  const emptyDomainEntity = [...domains.entries()]
    .filter(([, candidates]) => candidates.length === 0)
    .map(([entityId]) => entityId)
    .sort((left, right) => left.localeCompare(right))[0];
  if (emptyDomainEntity !== undefined) {
    return finish({
      ...reportBase(input, "unsatisfied"),
      placementsByEntityId: {},
      constraintResultsById: {},
      totalPreferenceCostRatio: 0,
      diagnostics: [{
        severity: "error",
        code: "PLACEMENT_REGION_HAS_NO_CANDIDATE",
        instancePath: "/entities",
        entityId: emptyDomainEntity,
        repairOperations: ["increase-region-area", "add-explicit-anchor"],
      }],
      searchNodeCount: 0,
      conflictCheckCount: 0,
      conflictConstraintIds: [],
    });
  }

  const main = search(input, profile, input.constraints, domains, false);
  if (main.budgetExceeded) {
    return finish({
      ...reportBase(input, "budget-exceeded"),
      placementsByEntityId: {},
      constraintResultsById: {},
      totalPreferenceCostRatio: 0,
      diagnostics: [{ severity: "error", code: "PLACEMENT_SOLVER_BUDGET_EXCEEDED", instancePath: "/solverProfile/budgets/maximumSearchNodes" }],
      searchNodeCount: main.searchNodeCount,
      conflictCheckCount: 0,
      conflictConstraintIds: [],
    });
  }
  if (main.bestAssignment !== undefined && main.bestEvaluations !== undefined) {
    return finish({
      ...reportBase(input, "solved"),
      placementsByEntityId: solvedPlacements(
        input,
        main.bestAssignment,
        main.bestEvaluations,
        profile,
      ),
      constraintResultsById: orderedRecord(
        main.bestEvaluations.map((evaluation) => [evaluation.constraintId, evaluation]),
      ),
      totalPreferenceCostRatio: main.bestPreferenceCostRatio ?? 0,
      diagnostics: [],
      searchNodeCount: main.searchNodeCount,
      conflictCheckCount: 0,
      conflictConstraintIds: [],
    });
  }

  let core = input.constraints
    .filter((constraint) => constraint.requirement === "required")
    .sort((left, right) => left.id.localeCompare(right.id));
  let conflictCheckCount = 0;
  for (const constraint of [...core]) {
    conflictCheckCount += 1;
    if (conflictCheckCount > profile.budgets.maximumConflictChecks) {
      return finish({
        ...reportBase(input, "budget-exceeded"),
        placementsByEntityId: {},
        constraintResultsById: {},
        totalPreferenceCostRatio: 0,
        diagnostics: [{ severity: "error", code: "PLACEMENT_SOLVER_BUDGET_EXCEEDED", instancePath: "/solverProfile/budgets/maximumConflictChecks" }],
        searchNodeCount: main.searchNodeCount,
        conflictCheckCount,
        conflictConstraintIds: [],
      });
    }
    const without = core.filter((row) => row.id !== constraint.id);
    const check = search(input, profile, without, domains, true);
    if (check.budgetExceeded) {
      return finish({
        ...reportBase(input, "budget-exceeded"),
        placementsByEntityId: {},
        constraintResultsById: {},
        totalPreferenceCostRatio: 0,
        diagnostics: [{ severity: "error", code: "PLACEMENT_SOLVER_BUDGET_EXCEEDED", instancePath: "/solverProfile/budgets/maximumSearchNodes" }],
        searchNodeCount: main.searchNodeCount + check.searchNodeCount,
        conflictCheckCount,
        conflictConstraintIds: [],
      });
    }
    if (check.bestAssignment === undefined) core = without;
  }
  const conflictConstraintIds = core.map((constraint) => constraint.id);
  return finish({
    ...reportBase(input, "unsatisfied"),
    placementsByEntityId: {},
    constraintResultsById: {},
    totalPreferenceCostRatio: 0,
    diagnostics: [{
      severity: "error",
      code: "PLACEMENT_REQUIRED_CONSTRAINT_UNSATISFIED",
      instancePath: "/constraints",
      constraintIds: conflictConstraintIds,
      repairOperations: ["add-explicit-anchor", "split-required-constraints"],
    }],
    searchNodeCount: main.searchNodeCount,
    conflictCheckCount,
    conflictConstraintIds,
  });
}
