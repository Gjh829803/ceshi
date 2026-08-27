import {
  applyCanonicalPathMappingsV1,
  hashWorldChangeSetV1,
  parseAiSchemaProjectionV1,
  parseWorldChangeSetV1,
  type AiSchemaProjectionV1,
  type Sha256HashV1,
} from "@whitebox-world/authoring-edit";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil } from "lodash-es";

export interface StructuredOutputProviderAdapterFixtureV1 {
  readonly id: string;
  encodeProjection(projection: AiSchemaProjectionV1): unknown;
  decodeCanonicalOutput(output: unknown): unknown;
}

export interface StructuredOutputProviderRoundTripResultV1 {
  readonly adapterId: string;
  readonly changeSetHash: Sha256HashV1;
}

function assertAdapterIds(
  adapters: readonly StructuredOutputProviderAdapterFixtureV1[],
): void {
  if (
    isEmpty(adapters) ||
    adapters.some((adapter) => isNil(adapter.id) || adapter.id.trim().length === 0) ||
    new Set(adapters.map((adapter) => adapter.id)).size !== adapters.length
  ) {
    throw new TypeError("Structured-output Provider adapter IDs must be non-empty and unique.");
  }
}

/**
 * Test-only conformance boundary for Provider adapters. Provider envelopes stay
 * private to the supplied fixtures. Only the provider-neutral Projection and
 * Canonical WorldChangeSet cross this harness boundary.
 */
export function verifyStructuredOutputProviderRoundTripV1(input: {
  readonly projection: AiSchemaProjectionV1;
  readonly canonicalOutput: unknown;
  readonly adapters: readonly StructuredOutputProviderAdapterFixtureV1[];
}): readonly Readonly<StructuredOutputProviderRoundTripResultV1>[] {
  const projection = parseAiSchemaProjectionV1(input.projection);
  assertAdapterIds(input.adapters);

  const expectedChangeSet = parseWorldChangeSetV1(
    applyCanonicalPathMappingsV1(
      structuredClone(input.canonicalOutput),
      projection.canonicalPathMappings,
    ),
  );
  const expectedBytes = stringifyCanonicalJson(expectedChangeSet);
  const expectedHash = hashWorldChangeSetV1(expectedChangeSet);
  const allowedOperationTypes = new Set(
    projection.allowedWorldChangeOperationTypes,
  );
  if (
    expectedChangeSet.operations.some(
      (operation) => !allowedOperationTypes.has(operation.type),
    )
  ) {
    throw new TypeError(
      "Canonical output contains an operation excluded by the AI Schema Projection.",
    );
  }

  const projectionBytes = stringifyCanonicalJson(projection);
  const results = input.adapters.map((adapter) => {
    adapter.encodeProjection(projection);
    if (stringifyCanonicalJson(projection) !== projectionBytes) {
      throw new TypeError(
        `Structured-output Provider adapter ${adapter.id} mutated the Projection.`,
      );
    }

    const decodedOutput = adapter.decodeCanonicalOutput(
      structuredClone(input.canonicalOutput),
    );
    const decodedChangeSet = parseWorldChangeSetV1(
      applyCanonicalPathMappingsV1(
        decodedOutput,
        projection.canonicalPathMappings,
      ),
    );
    const decodedBytes = stringifyCanonicalJson(decodedChangeSet);
    if (decodedBytes !== expectedBytes) {
      throw new TypeError(
        `Structured-output Provider adapter ${adapter.id} did not preserve byte-identical WorldChangeSetV1.`,
      );
    }
    const changeSetHash = hashWorldChangeSetV1(decodedChangeSet);
    if (changeSetHash !== expectedHash) {
      throw new TypeError(
        `Structured-output Provider adapter ${adapter.id} changed the WorldChangeSetV1 hash.`,
      );
    }
    return Object.freeze({
      adapterId: adapter.id,
      changeSetHash,
    });
  });

  return Object.freeze(results);
}
