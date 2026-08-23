import type {
  TraversalEdgeV1,
  TraversalGraphV1,
  TraversalNodeV1,
} from "@whitebox-world/traversal";
import { isNil } from "lodash-es";

const ROUTE_PATH_COST_QUANTUM_RATIO = 0.000001;

type CompletePathSelectionV1 = Readonly<{
  status: "complete";
  orderedTraversalNodeIds: readonly string[];
  orderedTraversalEdgeIds: readonly string[];
  routePathCostUnits: number;
  settledCount: number;
}>;

type UnreachablePathSelectionV1 = Readonly<{
  status: "unreachable";
  settledCount: number;
}>;

type IncompletePathSelectionV1 = Readonly<{
  status: "incomplete";
  maximumAllowedCount: number;
  minimumRequiredCount: number;
  settledCount: number;
}>;

export type CanonicalTraversalPathSelectionV1 =
  | CompletePathSelectionV1
  | UnreachablePathSelectionV1
  | IncompletePathSelectionV1;

export interface SelectCanonicalTraversalPathInputV1 {
  readonly traversalGraph: Pick<
    TraversalGraphV1,
    "traversalNodesById" | "traversalEdgesById"
  >;
  readonly startTraversalNodeId: string;
  readonly destinationTraversalNodeId: string;
  readonly maximumEdgeLengthMeters: number;
  readonly positionQuantizationMeters: number;
  readonly maximumSearchSteps: number;
}

interface OpenEntryV1 {
  readonly traversalNodeId: string;
  readonly gCostUnits: number;
  readonly fCostUnits: number;
}

interface CostedEdgeV1 {
  readonly edge: TraversalEdgeV1;
  readonly costUnits: number;
}

function fail(message: string): never {
  throw new Error(`TRAVERSAL_RECAST_PATH_SELECTION_INVALID: ${message}`);
}

function compareCanonicalId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareOpenEntry(left: OpenEntryV1, right: OpenEntryV1): number {
  if (left.fCostUnits !== right.fCostUnits) {
    return left.fCostUnits - right.fCostUnits;
  }
  if (left.gCostUnits !== right.gCostUnits) {
    return left.gCostUnits - right.gCostUnits;
  }
  return compareCanonicalId(left.traversalNodeId, right.traversalNodeId);
}

class OpenEntryHeapV1 {
  readonly #values: OpenEntryV1[] = [];

  public get size(): number {
    return this.#values.length;
  }

  public peek(): OpenEntryV1 | undefined {
    return this.#values[0];
  }

  public push(value: OpenEntryV1): void {
    this.#values.push(value);
    let index = this.#values.length - 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (compareOpenEntry(this.#values[parentIndex]!, value) <= 0) break;
      this.#values[index] = this.#values[parentIndex]!;
      index = parentIndex;
    }
    this.#values[index] = value;
  }

  public pop(): OpenEntryV1 | undefined {
    const first = this.#values[0];
    const last = this.#values.pop();
    if (isNil(first) || isNil(last) || this.#values.length === 0) {
      return first;
    }

    let index = 0;
    while (true) {
      const leftIndex = index * 2 + 1;
      if (leftIndex >= this.#values.length) break;
      const rightIndex = leftIndex + 1;
      let childIndex = leftIndex;
      if (
        rightIndex < this.#values.length &&
        compareOpenEntry(
          this.#values[rightIndex]!,
          this.#values[leftIndex]!,
        ) < 0
      ) {
        childIndex = rightIndex;
      }
      if (compareOpenEntry(last, this.#values[childIndex]!) <= 0) break;
      this.#values[index] = this.#values[childIndex]!;
      index = childIndex;
    }
    this.#values[index] = last;
    return first;
  }
}

function toPositiveCostUnits(edge: TraversalEdgeV1): number {
  if (!Number.isFinite(edge.routePathCost) || !(edge.routePathCost > 0)) {
    fail(`edge '${edge.id}' must have a positive finite routePathCost.`);
  }
  const units = Math.round(edge.routePathCost / ROUTE_PATH_COST_QUANTUM_RATIO);
  if (!Number.isSafeInteger(units) || !(units > 0)) {
    fail(`edge '${edge.id}' routePathCost exceeds safe integer units.`);
  }
  return units;
}

function addSafeCost(left: number, right: number, context: string): number {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) {
    fail(`${context} exceeds safe integer cost units.`);
  }
  return sum;
}

function heuristicCostUnits(
  from: TraversalNodeV1,
  destination: TraversalNodeV1,
  maximumEdgeLengthMeters: number,
  positionQuantizationMeters: number,
): number {
  const deltaX = destination.positionMetersXYZ[0] - from.positionMetersXYZ[0];
  const deltaZ = destination.positionMetersXYZ[2] - from.positionMetersXYZ[2];
  const distanceUnits = Math.floor(
    Math.hypot(deltaX, deltaZ) / positionQuantizationMeters,
  );
  if (!Number.isSafeInteger(distanceUnits) || distanceUnits < 0) {
    fail("heuristic distance exceeds safe integer position units.");
  }
  const ratio = distanceUnits * positionQuantizationMeters /
    maximumEdgeLengthMeters;
  const units = Math.floor(ratio / ROUTE_PATH_COST_QUANTUM_RATIO);
  if (!Number.isSafeInteger(units) || units < 0) {
    fail("heuristic exceeds safe integer cost units.");
  }
  return units;
}

function assertInput(
  input: SelectCanonicalTraversalPathInputV1,
): Readonly<{
  start: TraversalNodeV1;
  destination: TraversalNodeV1;
  outgoingByNodeId: ReadonlyMap<string, readonly CostedEdgeV1[]>;
  incomingByNodeId: ReadonlyMap<string, readonly CostedEdgeV1[]>;
}> {
  if (
    !Number.isFinite(input.maximumEdgeLengthMeters) ||
    !(input.maximumEdgeLengthMeters > 0)
  ) {
    fail("maximumEdgeLengthMeters must be positive and finite.");
  }
  if (
    !Number.isFinite(input.positionQuantizationMeters) ||
    !(input.positionQuantizationMeters > 0)
  ) {
    fail("positionQuantizationMeters must be positive and finite.");
  }
  if (
    !Number.isSafeInteger(input.maximumSearchSteps) ||
    !(input.maximumSearchSteps > 0)
  ) {
    fail("maximumSearchSteps must be a positive safe integer.");
  }
  const start = input.traversalGraph.traversalNodesById[
    input.startTraversalNodeId
  ];
  const destination = input.traversalGraph.traversalNodesById[
    input.destinationTraversalNodeId
  ];
  if (isNil(start) || isNil(destination)) {
    fail("start and destination Traversal Nodes must exist in the Graph.");
  }

  const outgoing = new Map<string, CostedEdgeV1[]>();
  const incoming = new Map<string, CostedEdgeV1[]>();
  for (const edge of Object.values(input.traversalGraph.traversalEdgesById)) {
    if (
      isNil(input.traversalGraph.traversalNodesById[edge.fromTraversalNodeId]) ||
      isNil(input.traversalGraph.traversalNodesById[edge.toTraversalNodeId])
    ) {
      fail(`edge '${edge.id}' references an unknown Node.`);
    }
    const costed = { edge, costUnits: toPositiveCostUnits(edge) };
    const outgoingEdges = outgoing.get(edge.fromTraversalNodeId) ?? [];
    outgoingEdges.push(costed);
    outgoing.set(edge.fromTraversalNodeId, outgoingEdges);
    const incomingEdges = incoming.get(edge.toTraversalNodeId) ?? [];
    incomingEdges.push(costed);
    incoming.set(edge.toTraversalNodeId, incomingEdges);
  }
  for (const edges of [...outgoing.values(), ...incoming.values()]) {
    edges.sort((left, right) =>
      compareCanonicalId(left.edge.id, right.edge.id));
  }

  return {
    start,
    destination,
    outgoingByNodeId: outgoing,
    incomingByNodeId: incoming,
  };
}

function reconstructCanonicalPath(
  startTraversalNodeId: string,
  destinationTraversalNodeId: string,
  destinationCostUnits: number,
  bestCostByNodeId: ReadonlyMap<string, number>,
  outgoingByNodeId: ReadonlyMap<string, readonly CostedEdgeV1[]>,
  incomingByNodeId: ReadonlyMap<string, readonly CostedEdgeV1[]>,
  settledCount: number,
): CompletePathSelectionV1 {
  const reachesDestination = new Set<string>([destinationTraversalNodeId]);
  const stack = [destinationTraversalNodeId];
  while (stack.length > 0) {
    const toTraversalNodeId = stack.pop()!;
    const toCost = bestCostByNodeId.get(toTraversalNodeId);
    if (isNil(toCost)) fail("shortest-path DAG is missing a Node cost.");
    for (const costed of incomingByNodeId.get(toTraversalNodeId) ?? []) {
      const fromCost = bestCostByNodeId.get(costed.edge.fromTraversalNodeId);
      if (
        !isNil(fromCost) &&
        addSafeCost(fromCost, costed.costUnits, "shortest-path DAG") === toCost &&
        !reachesDestination.has(costed.edge.fromTraversalNodeId)
      ) {
        reachesDestination.add(costed.edge.fromTraversalNodeId);
        stack.push(costed.edge.fromTraversalNodeId);
      }
    }
  }
  if (!reachesDestination.has(startTraversalNodeId)) {
    fail("shortest-path DAG does not connect the selected endpoints.");
  }

  const orderedTraversalNodeIds = [startTraversalNodeId];
  const orderedTraversalEdgeIds: string[] = [];
  let currentTraversalNodeId = startTraversalNodeId;
  while (currentTraversalNodeId !== destinationTraversalNodeId) {
    const currentCost = bestCostByNodeId.get(currentTraversalNodeId);
    if (isNil(currentCost)) fail("canonical path is missing a Node cost.");
    const selected = (outgoingByNodeId.get(currentTraversalNodeId) ?? []).find(
      (costed) => {
        const targetCost = bestCostByNodeId.get(costed.edge.toTraversalNodeId);
        return (
          !isNil(targetCost) &&
          addSafeCost(currentCost, costed.costUnits, "canonical path") === targetCost &&
          targetCost <= destinationCostUnits &&
          reachesDestination.has(costed.edge.toTraversalNodeId)
        );
      },
    );
    if (isNil(selected)) {
      fail("canonical path reconstruction reached a dead end.");
    }
    orderedTraversalEdgeIds.push(selected.edge.id);
    currentTraversalNodeId = selected.edge.toTraversalNodeId;
    orderedTraversalNodeIds.push(currentTraversalNodeId);
  }

  return {
    status: "complete",
    orderedTraversalNodeIds,
    orderedTraversalEdgeIds,
    routePathCostUnits: destinationCostUnits,
    settledCount,
  };
}

export function selectCanonicalTraversalPathV1(
  input: SelectCanonicalTraversalPathInputV1,
): CanonicalTraversalPathSelectionV1 {
  const {
    start,
    destination,
    outgoingByNodeId,
    incomingByNodeId,
  } = assertInput(input);
  if (start.id === destination.id) {
    return {
      status: "complete",
      orderedTraversalNodeIds: [start.id],
      orderedTraversalEdgeIds: [],
      routePathCostUnits: 0,
      settledCount: 0,
    };
  }

  const bestCostByNodeId = new Map<string, number>([[start.id, 0]]);
  const open = new OpenEntryHeapV1();
  open.push({
    traversalNodeId: start.id,
    gCostUnits: 0,
    fCostUnits: heuristicCostUnits(
      start,
      destination,
      input.maximumEdgeLengthMeters,
      input.positionQuantizationMeters,
    ),
  });
  let settledCount = 0;
  let destinationCostUnits: number | undefined;

  while (true) {
    while (open.size > 0) {
      const candidate = open.peek()!;
      if (bestCostByNodeId.get(candidate.traversalNodeId) === candidate.gCostUnits) {
        break;
      }
      open.pop();
    }

    const next = open.peek();
    if (isNil(next)) {
      if (isNil(destinationCostUnits)) {
        return { status: "unreachable", settledCount };
      }
      return reconstructCanonicalPath(
        start.id,
        destination.id,
        destinationCostUnits,
        bestCostByNodeId,
        outgoingByNodeId,
        incomingByNodeId,
        settledCount,
      );
    }
    if (
      !isNil(destinationCostUnits) &&
      next.fCostUnits > destinationCostUnits
    ) {
      return reconstructCanonicalPath(
        start.id,
        destination.id,
        destinationCostUnits,
        bestCostByNodeId,
        outgoingByNodeId,
        incomingByNodeId,
        settledCount,
      );
    }
    if (settledCount === input.maximumSearchSteps) {
      return {
        status: "incomplete",
        maximumAllowedCount: input.maximumSearchSteps,
        minimumRequiredCount: input.maximumSearchSteps + 1,
        settledCount,
      };
    }

    const current = open.pop()!;
    settledCount += 1;
    if (current.traversalNodeId === destination.id) {
      destinationCostUnits = current.gCostUnits;
      continue;
    }

    for (const costed of outgoingByNodeId.get(current.traversalNodeId) ?? []) {
      const nextCost = addSafeCost(
        current.gCostUnits,
        costed.costUnits,
        `path through edge '${costed.edge.id}'`,
      );
      const previousCost = bestCostByNodeId.get(costed.edge.toTraversalNodeId);
      if (!isNil(previousCost) && previousCost <= nextCost) continue;
      bestCostByNodeId.set(costed.edge.toTraversalNodeId, nextCost);
      const target = input.traversalGraph.traversalNodesById[
        costed.edge.toTraversalNodeId
      ]!;
      open.push({
        traversalNodeId: target.id,
        gCostUnits: nextCost,
        fCostUnits: addSafeCost(
          nextCost,
          heuristicCostUnits(
            target,
            destination,
            input.maximumEdgeLengthMeters,
            input.positionQuantizationMeters,
          ),
          `heuristic for Node '${target.id}'`,
        ),
      });
    }
  }
}
