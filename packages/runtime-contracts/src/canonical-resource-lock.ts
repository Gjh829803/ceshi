import { SUBJECT_RESOURCE_KINDS_V1 } from "@whitebox-world/subject-contracts";
import { isNil } from "lodash-es";

export const CANONICAL_RESOURCE_KINDS_V1 = Object.freeze([
  ...SUBJECT_RESOURCE_KINDS_V1,
  "traversal-surface-profile",
  "gameplay-bootstrap",
] as const);

export type CanonicalResourceKindV1 =
  typeof CANONICAL_RESOURCE_KINDS_V1[number];

export interface CanonicalResourceLockEntryV1 {
  readonly resourceRef: string;
  readonly resourceKind: CanonicalResourceKindV1;
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

export function canonicalResourceLockEntriesV1<
  Entry extends Readonly<{
    resourceRef: string;
    resourceKind: string;
    resolvedVersion: string;
    contentHash: string;
  }>,
>(
  value: readonly Entry[],
): readonly (CanonicalResourceLockEntryV1 & {
  readonly resourceKind: Entry["resourceKind"];
})[];
export function canonicalResourceLockEntriesV1(
  value: unknown,
): readonly CanonicalResourceLockEntryV1[];
export function canonicalResourceLockEntriesV1(
  value: unknown,
): readonly CanonicalResourceLockEntryV1[] {
  if (!Array.isArray(value)) {
    throw new TypeError("CANONICAL_RESOURCE_LOCK_INVALID");
  }
  const seenResourceKeys = new Set<string>();
  const rows = value.map((candidate) => {
    if (isNil(candidate) || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new TypeError("CANONICAL_RESOURCE_LOCK_INVALID");
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
      !CANONICAL_RESOURCE_KINDS_V1.includes(
        record.resourceKind as CanonicalResourceKindV1,
      )
    ) {
      throw new TypeError("CANONICAL_RESOURCE_LOCK_INVALID");
    }
    const resourceKey = `${record.resourceKind as string}\u0000${record.resourceRef}`;
    if (seenResourceKeys.has(resourceKey)) {
      throw new TypeError("CANONICAL_RESOURCE_LOCK_INVALID");
    }
    seenResourceKeys.add(resourceKey);
    return Object.freeze({
      resourceRef: record.resourceRef,
      resourceKind: record.resourceKind as CanonicalResourceKindV1,
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
