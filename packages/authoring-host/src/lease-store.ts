import { parsePreparedCandidatePinV1 } from "@whitebox-world/authoring-edit";
import { isNil } from "lodash-es";

import { worldChangeDiagnostic } from "./diagnostics.js";
import type {
  LookupPreparedCandidateResultV1,
  PinPreparedCandidateInputV1,
  PinPreparedCandidateResultV1,
  PreparedCandidateLeaseStoreV1,
  PreparedCandidateLeaseUsageV1,
  PreparedCandidateLeaseV1,
  ReleasePreparedCandidatePinInputV1,
} from "./types.js";

class PreparedCandidateLeaseStore implements PreparedCandidateLeaseStoreV1 {
  public readonly brand = "PreparedCandidateLeaseStoreV1" as const;
  public readonly leases = new Map<string, PreparedCandidateLeaseV1>();
  public nonce = 0;
}

function asStore(store: PreparedCandidateLeaseStoreV1): PreparedCandidateLeaseStore {
  if (!(store instanceof PreparedCandidateLeaseStore)) {
    throw new TypeError("PreparedCandidateLeaseStoreV1 is required");
  }
  return store;
}

function isExpired(lease: PreparedCandidateLeaseV1, nowUnixMilliseconds: number): boolean {
  return nowUnixMilliseconds >= lease.expiresAtUnixMilliseconds;
}

export function createPreparedCandidateLeaseStoreV1(): PreparedCandidateLeaseStoreV1 {
  return new PreparedCandidateLeaseStore();
}

export function nextPreparedCandidateNonceV1(
  store: PreparedCandidateLeaseStoreV1,
): number {
  const internals = asStore(store);
  internals.nonce += 1;
  return internals.nonce;
}

export function preparedCandidateLeaseUsageV1(
  store: PreparedCandidateLeaseStoreV1,
): PreparedCandidateLeaseUsageV1 {
  const internals = asStore(store);
  let bytes = 0;
  for (const lease of internals.leases.values()) {
    bytes += lease.sizeBytes;
  }
  return {
    count: internals.leases.size,
    bytes,
  };
}

export function putPreparedCandidateLeaseV1(
  store: PreparedCandidateLeaseStoreV1,
  lease: PreparedCandidateLeaseV1,
): void {
  asStore(store).leases.set(lease.preparedCandidateRef, lease);
}

export function lookupPreparedCandidateV1(
  store: PreparedCandidateLeaseStoreV1,
  preparedCandidateRef: string,
  nowUnixMilliseconds: number,
): LookupPreparedCandidateResultV1 {
  const lease = asStore(store).leases.get(preparedCandidateRef);
  if (isNil(lease)) return { status: "missing" };
  if (isExpired(lease, nowUnixMilliseconds) && isNil(lease.pin)) {
    return { status: "missing" };
  }
  return { status: "found", lease };
}

export function sweepExpiredPreparedCandidatesV1(
  store: PreparedCandidateLeaseStoreV1,
  nowUnixMilliseconds: number,
): void {
  const internals = asStore(store);
  for (const [ref, lease] of internals.leases) {
    if (isExpired(lease, nowUnixMilliseconds) && isNil(lease.pin)) {
      internals.leases.delete(ref);
    }
  }
}

export function pinPreparedCandidateV1(
  input: PinPreparedCandidateInputV1,
): PinPreparedCandidateResultV1 {
  const internals = asStore(input.store);
  const lease = internals.leases.get(input.preparedCandidateRef);
  if (isNil(lease) || (isExpired(lease, input.nowUnixMilliseconds) && isNil(lease.pin))) {
    return {
      status: "rejected",
      failurePhase: "admission",
      diagnostics: [
        worldChangeDiagnostic(
          "WORLD_CHANGE_PREPARED_CANDIDATE_EXPIRED",
          "/preparedCandidateRef",
          "Prepared Candidate does not exist or its lease expired.",
        ),
      ],
    };
  }
  if (lease.authoringEditPolicyHash !== input.authoringEditPolicyHash) {
    return {
      status: "rejected",
      failurePhase: "admission",
      diagnostics: [
        worldChangeDiagnostic(
          "WORLD_CHANGE_PREPARED_CANDIDATE_STALE",
          "/authoringEditPolicyHash",
          "Prepared Candidate policy binding no longer matches the host policy.",
        ),
      ],
    };
  }
  if (!isNil(lease.pin)) {
    if (lease.pin.requestId === input.requestId) {
      if (
        lease.pin.requestHash === input.requestHash &&
        lease.pin.authoringEditSessionId === input.authoringEditSessionId &&
        lease.pin.authoringEditPolicyHash === input.authoringEditPolicyHash
      ) {
        return { status: "pinned", pin: lease.pin };
      }
      return {
        status: "rejected",
        failurePhase: "idempotency",
        diagnostics: [
          worldChangeDiagnostic(
            "WORLD_CHANGE_REQUEST_ID_CONFLICT",
            "/requestId",
            "Prepared Candidate pin already belongs to this Request ID with a different identity.",
          ),
        ],
      };
    }
    return {
      status: "rejected",
      failurePhase: "admission",
      diagnostics: [
        worldChangeDiagnostic(
          "WORLD_CHANGE_PREPARED_CANDIDATE_STALE",
          "/preparedCandidateRef",
          "Prepared Candidate is pinned by a different non-terminal request.",
        ),
      ],
    };
  }
  if (isExpired(lease, input.nowUnixMilliseconds)) {
    return {
      status: "rejected",
      failurePhase: "admission",
      diagnostics: [
        worldChangeDiagnostic(
          "WORLD_CHANGE_PREPARED_CANDIDATE_EXPIRED",
          "/preparedCandidateRef",
          "Prepared Candidate does not exist or its lease expired.",
        ),
      ],
    };
  }
  const pin = parsePreparedCandidatePinV1({
    preparedCandidateRef: input.preparedCandidateRef,
    authoringEditSessionId: input.authoringEditSessionId,
    requestId: input.requestId,
    requestHash: input.requestHash,
    authoringEditPolicyHash: input.authoringEditPolicyHash,
    pinnedAtUnixMilliseconds: input.nowUnixMilliseconds,
  });
  internals.leases.set(input.preparedCandidateRef, { ...lease, pin });
  return { status: "pinned", pin };
}

export function releasePreparedCandidatePinV1(
  input: ReleasePreparedCandidatePinInputV1,
): void {
  const internals = asStore(input.store);
  const lease = internals.leases.get(input.preparedCandidateRef);
  if (isNil(lease) || isNil(lease.pin) || lease.pin.requestId !== input.requestId) {
    return;
  }
  const { pin: _pin, ...unpinned } = lease;
  internals.leases.set(input.preparedCandidateRef, unpinned);
  if (isExpired(unpinned, input.nowUnixMilliseconds)) {
    internals.leases.delete(input.preparedCandidateRef);
  }
}
