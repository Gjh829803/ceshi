import type { DurableRequestStateV1 } from "./types.js";

export class WorldChangeJournalCrashErrorV1 extends Error {
  public readonly name = "WorldChangeJournalCrashErrorV1" as const;

  public constructor(public readonly state: DurableRequestStateV1) {
    super(`WORLD_CHANGE_JOURNAL_CRASH: ${state}`);
  }
}
