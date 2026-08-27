import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import {
  parseRegistrySearchReceiptV1,
  parseRegistrySearchRequestV1,
  parseWorldChangeDiagnosticV1,
} from "../authoring-edit.js";
import type { Sha256HashV1 } from "../parse-kernel.js";
import type {
  RegistrySearchReceiptV1,
  RegistrySearchRequestV1,
  RegistrySearchResultV1,
  WorldChangeDiagnosticV1,
} from "../types.js";
import {
  canonicalizeRegistryLockEntriesV1,
  hashRegistryLockEntriesV1,
} from "./hashes.js";
import { parseAiSchemaProjectionProfileSourceV1 } from "./project.js";

export interface SearchRegistryInputV1 {
  readonly receiptId: string;
  readonly request: unknown;
  readonly projectionProfile: unknown;
  readonly registryLockEntries: readonly unknown[];
  readonly allowedCapabilityRefs: readonly string[];
  readonly includeExperimental: boolean;
}

export type SearchRegistryResultV1 =
  | { readonly status: "accepted"; readonly receipt: RegistrySearchReceiptV1 }
  | {
      readonly status: "rejected";
      readonly diagnostics: readonly WorldChangeDiagnosticV1[];
    };

function diagnostic(
  code: WorldChangeDiagnosticV1["code"],
  instancePath: string,
  message: string,
  details?: WorldChangeDiagnosticV1["details"],
): WorldChangeDiagnosticV1 {
  return parseWorldChangeDiagnosticV1({
    severity: "error",
    code,
    instancePath,
    message,
    ...(isNil(details) ? {} : { details }),
  });
}

function hasAllSemanticTags(
  entry: RegistrySearchResultV1,
  tags: readonly string[] | undefined,
): boolean {
  if (isNil(tags) || tags.length === 0) return true;
  const present = new Set(entry.aiMetadata.semanticTags);
  return tags.every((tag) => present.has(tag));
}

export function searchRegistryV1(input: SearchRegistryInputV1): SearchRegistryResultV1 {
  const request = parseRegistrySearchRequestV1(input.request) as RegistrySearchRequestV1;
  const projectionProfile = parseAiSchemaProjectionProfileSourceV1(input.projectionProfile);
  let lockEntries: readonly RegistrySearchResultV1[];
  let registryLockHash: Sha256HashV1;
  try {
    lockEntries = canonicalizeRegistryLockEntriesV1(input.registryLockEntries);
    registryLockHash = hashRegistryLockEntriesV1(lockEntries);
  } catch {
    return {
      status: "rejected",
      diagnostics: [
        diagnostic(
          "REGISTRY_SEARCH_LOCK_MISMATCH",
          "/registryLockHash",
          "Registry Lock entries are not a closed unique resource set.",
        ),
      ],
    };
  }
  if (request.registryLockHash !== registryLockHash) {
    return {
      status: "rejected",
      diagnostics: [
        diagnostic(
          "REGISTRY_SEARCH_LOCK_MISMATCH",
          "/registryLockHash",
          "Registry Search request is not bound to the current Registry Lock.",
          {
            kind: "hash-mismatch",
            expectedHash: registryLockHash,
            actualHash: request.registryLockHash,
          },
        ),
      ],
    };
  }

  const allowedCapabilities = new Set(input.allowedCapabilityRefs);
  const matched = lockEntries.filter((entry) => {
    if (entry.resourceKind !== request.resourceKind) return false;
    if (entry.authoringAvailability === "experimental" && input.includeExperimental !== true) {
      return false;
    }
    if (!entry.requiredCapabilityRefs.every((capabilityRef) => allowedCapabilities.has(capabilityRef))) {
      return false;
    }
    return hasAllSemanticTags(entry, request.semanticTagsAll);
  });

  const afterResourceRef = request.afterResourceRef;
  const afterIndex = isNil(afterResourceRef)
    ? -1
    : matched.findIndex((entry) => entry.resourceRef === afterResourceRef);
  if (!isNil(afterResourceRef) && afterIndex < 0) {
    return {
      status: "rejected",
      diagnostics: [
        diagnostic(
          "REGISTRY_SEARCH_LOCK_MISMATCH",
          "/afterResourceRef",
          "Registry Search cursor is not a resource in the current Lock page.",
        ),
      ],
    };
  }
  const remaining = matched.slice(afterIndex + 1);
  const pageSize = Math.min(
    request.maximumResultCount,
    projectionProfile.maximumRegistrySearchResultCount,
  );
  const results = remaining.slice(0, pageSize);
  const hasMore = remaining.length > results.length;
  const parsedBody = {
    kind: "worldkit-registry-search-receipt" as const,
    schemaVersion: 1 as const,
    id: input.receiptId,
    requestId: request.id,
    registryLockHash,
    results,
    ...(hasMore && !isNil(results[results.length - 1])
      ? { nextAfterResourceRef: results[results.length - 1]!.resourceRef }
      : {}),
  };
  const receipt = parseRegistrySearchReceiptV1({
    ...parsedBody,
    registrySearchResultHash: sha256CanonicalJson(parsedBody),
  });
  return { status: "accepted", receipt };
}
