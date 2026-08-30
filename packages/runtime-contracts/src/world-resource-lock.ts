import { SUBJECT_RESOURCE_KINDS_V1 } from "@whitebox-world/subject-contracts";
import { isNil } from "lodash-es";

import { snapshotContractDataV1 } from "./strict-contract-data";

export const WORLD_RESOURCE_KINDS_V1 = Object.freeze([
  ...SUBJECT_RESOURCE_KINDS_V1,
  "traversal-surface-profile",
  "gameplay-bootstrap",
  "world-runtime-bootstrap",
  "native-scene",
  "native-scene-api",
  "native-scene-profile",
  "static-geometry-asset",
] as const);

export type WorldResourceKindV1 =
  typeof WORLD_RESOURCE_KINDS_V1[number];

export interface WorldResourceLockEntryV1 {
  readonly resourceRef: string;
  readonly resourceKind: WorldResourceKindV1;
  readonly resolvedVersion: string;
  readonly contentHash: `sha256:${string}`;
}

const RESOURCE_LOCK_ENTRY_FIELDS_V1 = [
  "resourceRef",
  "resourceKind",
  "resolvedVersion",
  "contentHash",
] as const;
const RESOURCE_HASH_PATTERN_V1 = /^sha256:[a-f0-9]{64}$/;

export function worldResourceLockEntriesV1<
  Entry extends Readonly<{
    resourceRef: string;
    resourceKind: string;
    resolvedVersion: string;
    contentHash: string;
  }>,
>(
  value: readonly Entry[],
): readonly (WorldResourceLockEntryV1 & {
  readonly resourceKind: Entry["resourceKind"];
})[];
export function worldResourceLockEntriesV1(
  value: unknown,
): readonly WorldResourceLockEntryV1[];
export function worldResourceLockEntriesV1(
  value: unknown,
): readonly WorldResourceLockEntryV1[] {
  const snapshot = snapshotContractDataV1(
    value,
    "WORLD_RESOURCE_LOCK_INVALID",
  );
  if (!Array.isArray(snapshot)) {
    throw new TypeError("WORLD_RESOURCE_LOCK_INVALID");
  }
  const seenResourceKeys = new Set<string>();
  const rows = snapshot.map((candidate) => {
    if (isNil(candidate) || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new TypeError("WORLD_RESOURCE_LOCK_INVALID");
    }
    const record = candidate as Record<string, unknown>;
    const fields = Object.keys(record).sort();
    const expectedFields = [...RESOURCE_LOCK_ENTRY_FIELDS_V1].sort();
    if (
      fields.length !== expectedFields.length ||
      fields.some((field, index) => field !== expectedFields[index]) ||
      typeof record.resourceRef !== "string" ||
      record.resourceRef.length === 0 ||
      typeof record.resolvedVersion !== "string" ||
      record.resolvedVersion.length === 0 ||
      typeof record.contentHash !== "string" ||
      !RESOURCE_HASH_PATTERN_V1.test(record.contentHash) ||
      record.contentHash === `sha256:${"0".repeat(64)}` ||
      !WORLD_RESOURCE_KINDS_V1.includes(
        record.resourceKind as WorldResourceKindV1,
      )
    ) {
      throw new TypeError("WORLD_RESOURCE_LOCK_INVALID");
    }
    const resourceKey = `${record.resourceKind as string}\u0000${record.resourceRef}`;
    if (seenResourceKeys.has(resourceKey)) {
      throw new TypeError("WORLD_RESOURCE_LOCK_INVALID");
    }
    seenResourceKeys.add(resourceKey);
    return Object.freeze({
      resourceRef: record.resourceRef,
      resourceKind: record.resourceKind as WorldResourceKindV1,
      resolvedVersion: record.resolvedVersion,
      contentHash: record.contentHash as `sha256:${string}`,
    });
  });
  rows.sort((left, right) =>
    left.resourceRef < right.resourceRef
      ? -1
      : left.resourceRef > right.resourceRef
        ? 1
        : left.resourceKind < right.resourceKind
          ? -1
          : left.resourceKind > right.resourceKind
            ? 1
            : 0
  );
  return Object.freeze(rows);
}
