import {
  type GameplayDiagnosticV1,
  type Sha256HashV1,
} from "@whitebox-world/gameplay-contracts";
import { isNil } from "lodash-es";

export type RuntimeActivityKindV1 =
  | "runtime-run"
  | "simulation-take"
  | "control-capture";

export interface RuntimeActivityRequestV1 {
  readonly kind: RuntimeActivityKindV1;
  readonly requestId: string;
  readonly payloadHash: Sha256HashV1;
}

export type RuntimeActivityStatusV1 =
  | "active"
  | "released"
  | "terminated-by-host";

export interface RuntimeActivityRecordV1 extends RuntimeActivityRequestV1 {
  readonly boundWorldSessionId: string;
  readonly runtimeActivityEpoch: number;
  readonly status: RuntimeActivityStatusV1;
}

export interface RuntimeActivityLeaseV1 extends RuntimeActivityRequestV1 {
  readonly boundWorldSessionId: string;
  readonly runtimeActivityEpoch: number;
  release(): RuntimeActivityRecordV1;
}

export type RuntimeActivityAcquireResultV1 =
  | Readonly<{
      status: "active";
      lease: RuntimeActivityLeaseV1;
    }>
  | Readonly<{
      status: "rejected";
      diagnostic: GameplayDiagnosticV1;
    }>;

export interface RuntimeActivityCoordinatorSnapshotV1 {
  readonly runtimeActivityEpoch: number;
  readonly activeRuntimeActivityCount: number;
  readonly retainedRuntimeActivityRecordCount: number;
}

interface RetainedRuntimeActivityV1 {
  readonly request: RuntimeActivityRequestV1;
  readonly boundWorldSessionId: string;
  readonly acquiredEpoch: number;
  readonly lease: RuntimeActivityLeaseV1;
  readonly acquisition: Extract<
    RuntimeActivityAcquireResultV1,
    { status: "active" }
  >;
  status: RuntimeActivityStatusV1;
}

const RUNTIME_ACTIVITY_KINDS = new Set<RuntimeActivityKindV1>([
  "runtime-run",
  "simulation-take",
  "control-capture",
]);

function diagnostic(
  code: GameplayDiagnosticV1["code"],
  message: string,
): GameplayDiagnosticV1 {
  return Object.freeze({ code, message });
}

function rejected(
  code: GameplayDiagnosticV1["code"],
  message: string,
): RuntimeActivityAcquireResultV1 {
  return Object.freeze({
    status: "rejected",
    diagnostic: diagnostic(code, message),
  });
}

function snapshotDataRecord(input: unknown): Record<string, unknown> | undefined {
  if (typeof input !== "object" || isNil(input)) return undefined;
  try {
    if (Reflect.getPrototypeOf(input) !== Object.prototype) return undefined;
    const snapshot: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

function hasExactKeys(
  record: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(record);
  return actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(record, key));
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.length > 0;
}

function isSha256Hash(input: unknown): input is Sha256HashV1 {
  return typeof input === "string" && /^sha256:[0-9a-f]{64}$/.test(input);
}

function parseRuntimeActivityRequestV1(
  input: unknown,
): RuntimeActivityRequestV1 | undefined {
  const record = snapshotDataRecord(input);
  if (
    isNil(record) ||
    !hasExactKeys(record, ["kind", "requestId", "payloadHash"]) ||
    !RUNTIME_ACTIVITY_KINDS.has(record.kind as RuntimeActivityKindV1) ||
    !isNonEmptyString(record.requestId) ||
    !isSha256Hash(record.payloadHash)
  ) return undefined;
  return Object.freeze({
    kind: record.kind as RuntimeActivityKindV1,
    requestId: record.requestId,
    payloadHash: record.payloadHash,
  });
}

function sameRequest(
  left: RuntimeActivityRequestV1,
  right: RuntimeActivityRequestV1,
): boolean {
  return left.kind === right.kind &&
    left.requestId === right.requestId &&
    left.payloadHash === right.payloadHash;
}

function toRecord(retained: RetainedRuntimeActivityV1): RuntimeActivityRecordV1 {
  return Object.freeze({
    ...retained.request,
    boundWorldSessionId: retained.boundWorldSessionId,
    runtimeActivityEpoch: retained.acquiredEpoch,
    status: retained.status,
  });
}

function parseRuntimeActivityCoordinatorOptions(
  input: unknown,
): Readonly<{ maximumRuntimeActivityRecordCount: number }> {
  const record = snapshotDataRecord(input);
  if (
    isNil(record) ||
    !hasExactKeys(record, ["maximumRuntimeActivityRecordCount"]) ||
    !Number.isSafeInteger(record.maximumRuntimeActivityRecordCount) ||
    (record.maximumRuntimeActivityRecordCount as number) <= 0
  ) {
    throw new RangeError(
      "maximumRuntimeActivityRecordCount must be a positive safe integer in an exact data object.",
    );
  }
  return Object.freeze({
    maximumRuntimeActivityRecordCount:
      record.maximumRuntimeActivityRecordCount as number,
  });
}

export class RuntimeActivityCoordinator {
  private readonly maximumRuntimeActivityRecordCount: number;
  private readonly retainedByRequestId = new Map<string, RetainedRuntimeActivityV1>();
  private runtimeActivityEpoch = 0;
  private activeRuntimeActivityCount = 0;

  constructor(optionsInput: unknown) {
    const options = parseRuntimeActivityCoordinatorOptions(optionsInput);
    this.maximumRuntimeActivityRecordCount =
      options.maximumRuntimeActivityRecordCount;
  }

  acquire(
    input: unknown,
    boundWorldSessionId: string,
  ): RuntimeActivityAcquireResultV1 {
    const request = parseRuntimeActivityRequestV1(input);
    if (isNil(request) || !isNonEmptyString(boundWorldSessionId)) {
      return rejected("INPUT_INVALID", "The Runtime Activity request is invalid.");
    }

    const retained = this.retainedByRequestId.get(request.requestId);
    if (!isNil(retained)) {
      if (
        !sameRequest(retained.request, request) ||
        retained.boundWorldSessionId !== boundWorldSessionId
      ) {
        return rejected(
          "RUNTIME_ACTIVITY_ID_CONFLICT",
          `Runtime Activity request '${request.requestId}' conflicts with a retained request.`,
        );
      }
      if (retained.status !== "active") {
        return rejected(
          "RUNTIME_ACTIVITY_NOT_ACTIVE",
          `Runtime Activity request '${request.requestId}' is already terminal.`,
        );
      }
      return retained.acquisition;
    }

    if (
      this.retainedByRequestId.size >= this.maximumRuntimeActivityRecordCount
    ) {
      return rejected(
        "RUNTIME_HOST_CAPACITY_EXCEEDED",
        "The Runtime Host retained Activity record capacity is exhausted.",
      );
    }

    this.runtimeActivityEpoch += 1;
    this.activeRuntimeActivityCount += 1;
    let retainedActivity: RetainedRuntimeActivityV1;
    const lease = Object.freeze({
      ...request,
      boundWorldSessionId,
      runtimeActivityEpoch: this.runtimeActivityEpoch,
      release: (): RuntimeActivityRecordV1 => this.release(retainedActivity),
    });
    const acquisition = Object.freeze({
      status: "active" as const,
      lease,
    });
    retainedActivity = {
      request,
      boundWorldSessionId,
      acquiredEpoch: this.runtimeActivityEpoch,
      lease,
      acquisition,
      status: "active" as const,
    };
    this.retainedByRequestId.set(request.requestId, retainedActivity);
    return acquisition;
  }

  terminateAll(): readonly RuntimeActivityRecordV1[] {
    const active = [...this.retainedByRequestId.values()].filter(
      (retained) => retained.status === "active",
    );
    if (active.length === 0) return Object.freeze([]);
    this.runtimeActivityEpoch += 1;
    this.activeRuntimeActivityCount = 0;
    return Object.freeze(active.map((retained) => {
      retained.status = "terminated-by-host";
      return toRecord(retained);
    }));
  }

  snapshot(): RuntimeActivityCoordinatorSnapshotV1 {
    return Object.freeze({
      runtimeActivityEpoch: this.runtimeActivityEpoch,
      activeRuntimeActivityCount: this.activeRuntimeActivityCount,
      retainedRuntimeActivityRecordCount: this.retainedByRequestId.size,
    });
  }

  private release(retained: RetainedRuntimeActivityV1): RuntimeActivityRecordV1 {
    if (retained.status !== "active") return toRecord(retained);
    retained.status = "released";
    this.activeRuntimeActivityCount -= 1;
    this.runtimeActivityEpoch += 1;
    return toRecord(retained);
  }
}
