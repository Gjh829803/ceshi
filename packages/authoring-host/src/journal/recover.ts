import { isNil } from "lodash-es";

import {
  deletePreparedCandidateLeaseV1,
  listPreparedCandidateLeasesV1,
  sweepExpiredPreparedCandidatesV1,
} from "../lease-store.js";
import type { PreparedCandidateLeaseStoreV1 } from "../types.js";
import {
  isTerminalStateV1,
  listDurableRequestRecordsV1,
  setRecoveryFencingTokenV1,
} from "./store.js";
import { resumeWorldChangeRequestV1 } from "./submit.js";
import type {
  SubmitWorldChangeRequestInputV1,
  SubmitWorldChangeRequestResultV1,
  WorldChangeJournalV1,
} from "./types.js";

export function sweepUnreferencedPreparedCandidatesV1(input: {
  readonly journal: WorldChangeJournalV1;
  readonly leaseStore: PreparedCandidateLeaseStoreV1;
  readonly nowUnixMilliseconds: number;
  readonly fencingToken: string;
}): void {
  setRecoveryFencingTokenV1(input.journal, input.fencingToken);
  sweepExpiredPreparedCandidatesV1(input.leaseStore, input.nowUnixMilliseconds);
  const referenced = new Set(
    listDurableRequestRecordsV1(input.journal).flatMap((record) =>
      isNil(record.preparedCandidateRef) ? [] : [record.preparedCandidateRef],
    ),
  );
  const protectedPins = new Set(
    listDurableRequestRecordsV1(input.journal).flatMap((record) =>
      !isNil(record.pin) && !isTerminalStateV1(record.state)
        ? [record.pin.preparedCandidateRef]
        : [],
    ),
  );
  for (const lease of listPreparedCandidateLeasesV1(input.leaseStore)) {
    if (protectedPins.has(lease.preparedCandidateRef)) continue;
    if (referenced.has(lease.preparedCandidateRef)) continue;
    if (!isNil(lease.pin)) continue;
    deletePreparedCandidateLeaseV1(input.leaseStore, lease.preparedCandidateRef);
  }
}

export function recoverWorldChangeRequestV1(
  input: SubmitWorldChangeRequestInputV1,
): SubmitWorldChangeRequestResultV1 {
  sweepUnreferencedPreparedCandidatesV1({
    journal: input.journal,
    leaseStore: input.leaseStore,
    nowUnixMilliseconds: input.nowUnixMilliseconds,
    fencingToken: `recover.${input.request.id}`,
  });
  const { crashAfterState: _crashAfterState, ...resumeInput } = input;
  return resumeWorldChangeRequestV1(resumeInput);
}
