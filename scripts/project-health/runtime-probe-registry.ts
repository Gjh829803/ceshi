import { isEmpty, isNil, sortBy, uniq } from "lodash-es";

export const RUNTIME_PROBE_KINDS_V1 = Object.freeze([
  "lifecycle",
  "owner-count",
  "cadence",
  "candidate-determinism",
] as const);

export type RuntimeProbeKindV1 = typeof RUNTIME_PROBE_KINDS_V1[number];
export type RuntimeProbeRequirednessV1 = "required" | "advisory";
export type RuntimeProbeConstructionStatusV1 = "passed" | "partial-throw";
export type RuntimeProbeCleanupStatusV1 = "passed" | "threw";

export interface RuntimeProbeRegistrationV1 {
  readonly id: string;
  readonly kind: RuntimeProbeKindV1;
  readonly requiredness: RuntimeProbeRequirednessV1;
  readonly gateId: string;
  readonly ownerCommandId: string;
}

export interface RuntimeOwnerSnapshotV1 {
  readonly observableCount: number;
  readonly timerCount: number;
  readonly nodeCount: number;
  readonly listenerCount: number;
  readonly workerCount: number;
  readonly physicsOwnerCount: number;
  readonly temporaryFileCount: number;
}

export interface RuntimeProbeCycleEvidenceV1 {
  readonly beforeOwners: RuntimeOwnerSnapshotV1;
  readonly afterOwners: RuntimeOwnerSnapshotV1;
  readonly constructionStatus: RuntimeProbeConstructionStatusV1;
  readonly cleanupStatus: RuntimeProbeCleanupStatusV1;
  readonly cleanupError: string | null;
  readonly heapDeltaBytes: number;
}

export interface RuntimeProbeEvidenceV1 {
  readonly probeId: string;
  readonly kind: RuntimeProbeKindV1;
  readonly requiredness: RuntimeProbeRequirednessV1;
  readonly gateId: string;
  readonly cycles: readonly RuntimeProbeCycleEvidenceV1[];
  readonly snapshotHashes: readonly string[];
  readonly candidateHashes: readonly string[];
}

export interface RuntimeProbeCycleScriptV1 {
  readonly beforeOwners: RuntimeOwnerSnapshotV1;
  readonly afterOwners: RuntimeOwnerSnapshotV1;
  readonly heapDeltaBytes: number;
  readonly construct: () => void;
  readonly cleanup: () => void;
  readonly snapshotHash?: string;
  readonly candidateHashes?: readonly string[];
}

const PROBE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ZERO_RUNTIME_OWNER_SNAPSHOT_V1: RuntimeOwnerSnapshotV1 = Object.freeze({
  observableCount: 0,
  timerCount: 0,
  nodeCount: 0,
  listenerCount: 0,
  workerCount: 0,
  physicsOwnerCount: 0,
  temporaryFileCount: 0,
});

export const RUNTIME_PROBE_REGISTRY_V1: readonly RuntimeProbeRegistrationV1[] = Object.freeze([
  {
    id: "runtime-host-lifecycle",
    kind: "lifecycle",
    requiredness: "required",
    gateId: "canonical",
    ownerCommandId: "verify-canonical-world",
  },
  {
    id: "browser-ready-reset",
    kind: "lifecycle",
    requiredness: "required",
    gateId: "control-capture",
    ownerCommandId: "verify-control-capture",
  },
  {
    id: "fixed-cadence",
    kind: "cadence",
    requiredness: "required",
    gateId: "route-r1-heightfield",
    ownerCommandId: "verify-route-r1-heightfield",
  },
  {
    id: "bna-candidate-determinism",
    kind: "candidate-determinism",
    requiredness: "advisory",
    gateId: "bna1-clean-break",
    ownerCommandId: "verify-bna1-clean-break",
  },
]);

function invalid(detail: string): never {
  throw new TypeError(detail);
}

export function parseRuntimeProbeRegistrationV1(input: unknown): RuntimeProbeRegistrationV1 {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return invalid("Runtime probe registration must be an object.");
  }
  const source = input as Record<string, unknown>;
  if (
    typeof source.id !== "string" ||
    !PROBE_ID.test(source.id) ||
    typeof source.kind !== "string" ||
    !RUNTIME_PROBE_KINDS_V1.includes(source.kind as RuntimeProbeKindV1) ||
    (source.requiredness !== "required" && source.requiredness !== "advisory") ||
    typeof source.gateId !== "string" ||
    !PROBE_ID.test(source.gateId) ||
    typeof source.ownerCommandId !== "string" ||
    !PROBE_ID.test(source.ownerCommandId)
  ) return invalid("Runtime probe registration must match the closed identity contract.");
  if (source.kind === "candidate-determinism" && source.requiredness !== "advisory") {
    return invalid("Candidate determinism probes remain advisory until BNA production GO.");
  }
  if (source.kind !== "candidate-determinism" && source.requiredness !== "required") {
    return invalid("Non-candidate runtime probes in the first slice must be required.");
  }
  return {
    id: source.id,
    kind: source.kind as RuntimeProbeKindV1,
    requiredness: source.requiredness,
    gateId: source.gateId,
    ownerCommandId: source.ownerCommandId,
  };
}

export function parseRuntimeProbeRegistryV1(
  input: readonly unknown[] = RUNTIME_PROBE_REGISTRY_V1,
): readonly RuntimeProbeRegistrationV1[] {
  const registrations = input.map(parseRuntimeProbeRegistrationV1);
  const ids = registrations.map((entry) => entry.id);
  const gateIds = registrations.map((entry) => entry.gateId);
  if (uniq(ids).length !== ids.length) return invalid("Runtime probe ids must be unique.");
  if (uniq(gateIds).length !== gateIds.length) return invalid("Runtime probe gate ids must be unique.");
  return Object.freeze(sortBy(registrations, ["id"]));
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || Object.is(value, -0) || value < 0) {
    return invalid(`${label} must be a non-negative integer.`);
  }
  return value;
}

export function parseRuntimeOwnerSnapshotV1(input: unknown): RuntimeOwnerSnapshotV1 {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return invalid("Runtime owner snapshot must be an object.");
  }
  const source = input as Record<string, unknown>;
  return {
    observableCount: nonNegativeInteger(source.observableCount, "observableCount"),
    timerCount: nonNegativeInteger(source.timerCount, "timerCount"),
    nodeCount: nonNegativeInteger(source.nodeCount, "nodeCount"),
    listenerCount: nonNegativeInteger(source.listenerCount, "listenerCount"),
    workerCount: nonNegativeInteger(source.workerCount, "workerCount"),
    physicsOwnerCount: nonNegativeInteger(source.physicsOwnerCount, "physicsOwnerCount"),
    temporaryFileCount: nonNegativeInteger(source.temporaryFileCount, "temporaryFileCount"),
  };
}

export function ownerLeakCountV1(
  beforeOwners: RuntimeOwnerSnapshotV1,
  afterOwners: RuntimeOwnerSnapshotV1,
): number {
  return (Object.keys(beforeOwners) as Array<keyof RuntimeOwnerSnapshotV1>)
    .reduce((total, key) => total + Math.max(0, afterOwners[key] - beforeOwners[key]), 0);
}

export function runIsolatedRuntimeProbeCyclesV1(input: {
  readonly registration: RuntimeProbeRegistrationV1;
  readonly cycles: readonly RuntimeProbeCycleScriptV1[];
}): RuntimeProbeEvidenceV1 {
  const registration = parseRuntimeProbeRegistrationV1(input.registration);
  if (isEmpty(input.cycles)) return invalid("A runtime probe must execute at least one isolated cycle.");
  const cycles: RuntimeProbeCycleEvidenceV1[] = [];
  const snapshotHashes: string[] = [];
  const candidateHashes: string[] = [];
  for (const script of input.cycles) {
    let constructionStatus: RuntimeProbeConstructionStatusV1 = "passed";
    let cleanupStatus: RuntimeProbeCleanupStatusV1 = "passed";
    let cleanupError: string | null = null;
    try {
      script.construct();
    } catch {
      constructionStatus = "partial-throw";
    }
    try {
      script.cleanup();
    } catch (error) {
      cleanupStatus = "threw";
      cleanupError = error instanceof Error ? error.message : "cleanup-failed";
    }
    cycles.push({
      beforeOwners: parseRuntimeOwnerSnapshotV1(script.beforeOwners),
      afterOwners: parseRuntimeOwnerSnapshotV1(script.afterOwners),
      constructionStatus,
      cleanupStatus,
      cleanupError,
      heapDeltaBytes: nonNegativeInteger(script.heapDeltaBytes, "heapDeltaBytes"),
    });
    if (!isNil(script.snapshotHash)) snapshotHashes.push(script.snapshotHash);
    if (!isNil(script.candidateHashes)) candidateHashes.push(...script.candidateHashes);
  }
  return {
    probeId: registration.id,
    kind: registration.kind,
    requiredness: registration.requiredness,
    gateId: registration.gateId,
    cycles,
    snapshotHashes,
    candidateHashes,
  };
}
