import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { canonicalJsonBytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import type { RegistrySearchResultV1 } from "../types.js";
import {
  invalid,
  parseStringArray,
} from "../parse-kernel.js";
import { parseRegistrySearchResultV1 } from "../authoring-edit.js";

export function canonicalizeRegistryLockEntriesV1(
  entries: readonly unknown[],
): readonly RegistrySearchResultV1[] {
  const parsed = entries.map((entry) => parseRegistrySearchResultV1(entry));
  const refs = parsed.map((entry) => entry.resourceRef);
  if (new Set(refs).size !== refs.length) invalid("RegistryLockEntryV1");
  return [...parsed].sort((left, right) => left.resourceRef.localeCompare(right.resourceRef));
}

export function hashRegistryLockEntriesV1(entries: readonly unknown[]): Sha256HashV1 {
  const canonical = canonicalizeRegistryLockEntriesV1(entries).map((entry) => ({
    resourceRef: entry.resourceRef,
    resourceKind: entry.resourceKind,
    version: entry.version,
    contentHash: entry.contentHash,
    authoringAvailability: entry.authoringAvailability,
    requiredCapabilityRefs: [...entry.requiredCapabilityRefs].sort((left, right) =>
      left.localeCompare(right)
    ),
  }));
  return sha256CanonicalJson(canonical) as Sha256HashV1;
}

export function hashCapabilitySetV1(capabilityRefs: readonly unknown[]): Sha256HashV1 {
  const parsed = parseStringArray(capabilityRefs, { unique: true });
  if (isNil(parsed)) invalid("CapabilitySetV1");
  return sha256CanonicalJson(
    [...parsed].sort((left, right) => left.localeCompare(right)),
  ) as Sha256HashV1;
}

export function hashCanonicalAuthoringSchemaV1(schema: unknown): Sha256HashV1 {
  return sha256CanonicalJson(schema) as Sha256HashV1;
}

export function projectedSchemaByteLengthV1(schema: unknown): number {
  return canonicalJsonBytes(schema).byteLength;
}
