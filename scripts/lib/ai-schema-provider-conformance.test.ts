import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { sha256CanonicalJson, stringifyCanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  projectAiSchemaV1,
  type AiSchemaProjectionV1,
  type RegistrySearchResultV1,
} from "@whitebox-world/authoring-edit";

import {
  verifyStructuredOutputProviderRoundTripV1,
  type StructuredOutputProviderAdapterFixtureV1,
} from "./ai-schema-provider-conformance.js";

const PROFILE_REF = "worldkit://ai-schema-projection-profile/constrained-json@1";
const SUBJECT_A = "worldkit://subject-definition/humanoid.g-bot@2";
const SUBJECT_B = "worldkit://subject-definition/humanoid.rigged-golden@2";
const SUBJECT_OUTSIDE_LOCK = "worldkit://subject-definition/animal.quadruped.forward-steer@2";

function contentHash(label: string): Sha256HashV1 {
  return sha256CanonicalJson({ label }) as Sha256HashV1;
}

function lockEntry(resourceRef: string): RegistrySearchResultV1 {
  return {
    resourceRef,
    resourceKind: "subject-definition",
    version: 1,
    contentHash: contentHash(resourceRef),
    authoringAvailability: "recommended",
    requiredCapabilityRefs: [],
    aiMetadata: {
      displayName: resourceRef,
      description: "Locked Subject Definition.",
      semanticTags: ["subject"],
    },
  };
}

function worldChangeSetSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "worldkit://schema/world-change-set@1",
    type: "object",
    additionalProperties: false,
    required: [
      "kind",
      "schemaVersion",
      "id",
      "baseAuthoringSpecHash",
      "preconditions",
      "operations",
    ],
    properties: {
      kind: { const: "worldkit-world-change-set" },
      schemaVersion: { const: 1 },
      id: { type: "string" },
      baseAuthoringSpecHash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
      preconditions: { type: "array", maxItems: 0 },
      operations: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "type", "node"],
          properties: {
            id: { type: "string" },
            type: { const: "node-upsert" },
            node: {
              type: "object",
              additionalProperties: false,
              required: ["id", "kind", "subjectDefinitionRef", "spawnAnchorEntityId"],
              properties: {
                id: { type: "string" },
                kind: { const: "subject" },
                subjectDefinitionRef: {
                  type: "string",
                  format: "subject-definition-ref",
                },
                spawnAnchorEntityId: { type: "string" },
              },
            },
          },
        },
      },
      provenance: {
        type: "object",
        additionalProperties: false,
        required: ["sourceType"],
        properties: {
          sourceType: { enum: ["user", "agent", "validator"] },
        },
      },
    },
  };
}

function projection(optionalFieldMode: "native-optional" | "required-nullable-with-round-trip-map" = "required-nullable-with-round-trip-map"): AiSchemaProjectionV1 {
  const result = projectAiSchemaV1({
    projectionId: "projection.provider-round-trip.001",
    request: {
      kind: "worldkit-ai-schema-projection-request",
      schemaVersion: 1,
      id: "request.provider-round-trip.001",
      authoringEditSessionId: "session.provider-round-trip.001",
      projectionProfileRef: PROFILE_REF,
      authoringSchemaVersion: 4,
    },
    projectionProfile: {
      kind: "ai-schema-projection-profile",
      schemaVersion: 1,
      id: "constrained-json",
      version: 1,
      resourceRef: PROFILE_REF,
      authoringAvailability: "recommended",
      maximumPropertyCount: 64,
      maximumNestingDepth: 12,
      maximumEnumValueCount: 8,
      maximumSchemaBytes: 32_768,
      maximumRegistrySearchResultCount: 8,
      optionalFieldMode,
      aiMetadata: {
        displayName: "Constrained JSON Schema Projection",
        description: "Provider-neutral JSON Schema projection.",
        semanticTags: ["ai-schema"],
      },
    },
    canonicalAuthoringSchema: worldChangeSetSchema(),
    registryLockEntries: [lockEntry(SUBJECT_A), lockEntry(SUBJECT_B)],
    allowedCapabilityRefs: [],
    allowedWorldChangeOperationTypes: ["node-upsert"],
    includeExperimental: false,
  });
  expect(result.status).toBe("accepted");
  if (result.status !== "accepted") throw new Error("Fixture projection was rejected.");
  return result.projection;
}

function canonicalOutput(): Record<string, unknown> {
  return {
    kind: "worldkit-world-change-set",
    schemaVersion: 1,
    id: "change.provider-round-trip.001",
    baseAuthoringSpecHash: `sha256:${"1".repeat(64)}`,
    preconditions: [],
    operations: [
      {
        id: "operation.upsert-player",
        type: "node-upsert",
        node: {
          id: "player",
          kind: "subject",
          subjectDefinitionRef: SUBJECT_A,
          spawnAnchorEntityId: "spawn-main",
        },
      },
    ],
    provenance: null,
  };
}

const strictJsonSchemaAdapter: StructuredOutputProviderAdapterFixtureV1 = {
  id: "strict-json-schema-response",
  encodeProjection(value) {
    return {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "world_change_set",
          strict: true,
          schema: structuredClone(value.jsonSchema),
        },
      },
    };
  },
  decodeCanonicalOutput(output) {
    const envelope = {
      output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    };
    return JSON.parse(envelope.output[0]!.content[0]!.text) as unknown;
  },
};

const functionDeclarationAdapter: StructuredOutputProviderAdapterFixtureV1 = {
  id: "function-tool-declaration",
  encodeProjection(value) {
    return {
      tools: [{
        function_declaration: {
          name: "submit_world_change_set",
          parameters: structuredClone(value.jsonSchema),
        },
      }],
    };
  },
  decodeCanonicalOutput(output) {
    const envelope = {
      candidates: [{
        content: {
          parts: [{
            functionCall: {
              name: "submit_world_change_set",
              args: structuredClone(output),
            },
          }],
        },
      }],
    };
    return envelope.candidates[0]!.content.parts[0]!.functionCall.args;
  },
};

const ADAPTERS = [strictJsonSchemaAdapter, functionDeclarationAdapter] as const;

function mutatingAdapter(
  id: string,
  mutate: (output: Record<string, unknown>) => void,
): StructuredOutputProviderAdapterFixtureV1 {
  return {
    id,
    encodeProjection(value) {
      return { input_schema: structuredClone(value.jsonSchema) };
    },
    decodeCanonicalOutput(output) {
      const copy = structuredClone(output) as Record<string, unknown>;
      mutate(copy);
      return copy;
    },
  };
}

function firstOperation(output: Record<string, unknown>): Record<string, unknown> {
  return (output.operations as Record<string, unknown>[])[0]!;
}

function firstNode(output: Record<string, unknown>): Record<string, unknown> {
  return firstOperation(output).node as Record<string, unknown>;
}

describe("P16-S1/F1 structured-output Provider conformance", () => {
  it("round-trips one Projection through two materially different private envelopes", () => {
    const projected = projection();
    const strictEnvelope = strictJsonSchemaAdapter.encodeProjection(projected) as {
      response_format: { json_schema: { schema: unknown } };
    };
    const functionEnvelope = functionDeclarationAdapter.encodeProjection(projected) as {
      tools: readonly [{ function_declaration: { parameters: unknown } }];
    };
    expect(stringifyCanonicalJson(strictEnvelope.response_format.json_schema.schema)).toBe(
      stringifyCanonicalJson(projected.jsonSchema),
    );
    expect(stringifyCanonicalJson(functionEnvelope.tools[0].function_declaration.parameters)).toBe(
      stringifyCanonicalJson(projected.jsonSchema),
    );

    const results = verifyStructuredOutputProviderRoundTripV1({
      projection: projected,
      canonicalOutput: canonicalOutput(),
      adapters: ADAPTERS,
    });
    expect(results).toEqual([
      { adapterId: "strict-json-schema-response", changeSetHash: expect.stringMatching(/^sha256:/) },
      { adapterId: "function-tool-declaration", changeSetHash: expect.stringMatching(/^sha256:/) },
    ]);
    expect(results[0]!.changeSetHash).toBe(results[1]!.changeSetHash);
    expect(Object.isFrozen(results)).toBe(true);
  });

  it.each([
    ["renamed Canonical field", mutatingAdapter("renamed-field", (output) => {
      output.base_authoring_spec_hash = output.baseAuthoringSpecHash;
      delete output.baseAuthoringSpecHash;
    })],
    ["provider-private output keyword", mutatingAdapter("provider-keyword", (output) => {
      output.providerPayload = { nativeHandle: 7 };
    })],
    ["unknown operation", mutatingAdapter("unknown-operation", (output) => {
      firstOperation(output).type = "provider-patch";
    })],
  ])("rejects %s", (_label, adapter) => {
    expect(() => verifyStructuredOutputProviderRoundTripV1({
      projection: projection(),
      canonicalOutput: canonicalOutput(),
      adapters: [adapter],
    })).toThrow();
  });

  it.each([
    ["enum overflow bypass", SUBJECT_OUTSIDE_LOCK],
    ["Registry Ref mutation", SUBJECT_B],
  ])("rejects %s", (_label, subjectDefinitionRef) => {
    const adapter = mutatingAdapter(`mutate-ref-${subjectDefinitionRef}`, (output) => {
      firstNode(output).subjectDefinitionRef = subjectDefinitionRef;
    });
    expect(() => verifyStructuredOutputProviderRoundTripV1({
      projection: projection(),
      canonicalOutput: canonicalOutput(),
      adapters: [adapter],
    })).toThrow(/byte-identical/i);
  });

  it("rejects a missing required-null round-trip mapping", () => {
    expect(() => verifyStructuredOutputProviderRoundTripV1({
      projection: projection("native-optional"),
      canonicalOutput: canonicalOutput(),
      adapters: ADAPTERS,
    })).toThrow(/WorldChangeSetV1/);
  });

  it("rejects duplicate adapter IDs and adapter-side Projection mutation", () => {
    expect(() => verifyStructuredOutputProviderRoundTripV1({
      projection: projection(),
      canonicalOutput: canonicalOutput(),
      adapters: [strictJsonSchemaAdapter, strictJsonSchemaAdapter],
    })).toThrow(/adapter IDs/i);

    const mutatesProjection: StructuredOutputProviderAdapterFixtureV1 = {
      id: "mutates-projection",
      encodeProjection(value) {
        (value.jsonSchema as Record<string, unknown>).providerPayload = true;
        return {};
      },
      decodeCanonicalOutput(output) {
        return output;
      },
    };
    expect(() => verifyStructuredOutputProviderRoundTripV1({
      projection: projection(),
      canonicalOutput: canonicalOutput(),
      adapters: [mutatesProjection],
    })).toThrow();
  });

  it("returns the normal Canonical parser/hash identity", () => {
    const results = verifyStructuredOutputProviderRoundTripV1({
      projection: projection(),
      canonicalOutput: canonicalOutput(),
      adapters: ADAPTERS,
    });
    const expected = sha256CanonicalJson({
      ...canonicalOutput(),
      provenance: undefined,
    });
    expect(results.every((result) => result.changeSetHash === expected)).toBe(true);
  });
});
