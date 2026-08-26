import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import canonicalAuthoringSchema from "@whitebox-world/authoring/schema";

import {
  applyCanonicalPathMappingsV1,
  hashCapabilitySetV1,
  hashRegistryLockEntriesV1,
  parseAiSchemaProjectionProfileSourceV1,
  parseAiSchemaProjectionV1,
  parseRegistrySearchReceiptV1,
  projectAiSchemaV1,
  searchRegistryV1,
  type RegistrySearchResultV1,
  type Sha256HashV1,
  type WorldChangeOperationTypeV1,
} from "../index.js";

const PROFILE_REF = "worldkit://ai-schema-projection-profile/constrained-json@1";
const SUBJECT_A = "worldkit://subject-definition/humanoid.g-bot@2";
const SUBJECT_B = "worldkit://subject-definition/humanoid.rigged-golden@2";
const SUBJECT_C = "worldkit://subject-definition/animal.quadruped.forward-steer@2";
const SUBJECT_EXPERIMENTAL = "worldkit://subject-definition/glider.paraglider.unpowered@1";
const CAPABILITY_GROUND = "worldkit://capability/locomotion.ground@1";

const OPERATIONS = ["node-upsert", "resource-upsert"] as const satisfies readonly WorldChangeOperationTypeV1[];

function contentHash(label: string): Sha256HashV1 {
  return sha256CanonicalJson({ label }) as Sha256HashV1;
}

function profileSource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "ai-schema-projection-profile",
    schemaVersion: 1,
    id: "constrained-json",
    version: 1,
    resourceRef: PROFILE_REF,
    authoringAvailability: "recommended",
    maximumPropertyCount: 512,
    maximumNestingDepth: 8,
    maximumEnumValueCount: 32,
    maximumSchemaBytes: 65_536,
    maximumRegistrySearchResultCount: 32,
    optionalFieldMode: "native-optional",
    aiMetadata: {
      displayName: "Constrained JSON Schema Projection",
      description: "Provider-neutral JSON Schema projection.",
      semanticTags: ["ai-schema", "constrained-json"],
    },
    ...overrides,
  };
}

function projectionRequest(): Record<string, unknown> {
  return {
    kind: "worldkit-ai-schema-projection-request",
    schemaVersion: 1,
    id: "request.project.001",
    authoringEditSessionId: "session.edit.001",
    projectionProfileRef: PROFILE_REF,
    authoringSchemaVersion: 4,
  };
}

function lockEntry(overrides: {
  readonly resourceRef: string;
  readonly resourceKind?: RegistrySearchResultV1["resourceKind"];
  readonly authoringAvailability?: RegistrySearchResultV1["authoringAvailability"];
  readonly requiredCapabilityRefs?: readonly string[];
  readonly semanticTags?: readonly string[];
}): RegistrySearchResultV1 {
  return {
    resourceRef: overrides.resourceRef,
    resourceKind: overrides.resourceKind ?? "subject-definition",
    version: 1,
    contentHash: contentHash(overrides.resourceRef),
    authoringAvailability: overrides.authoringAvailability ?? "recommended",
    requiredCapabilityRefs: [...(overrides.requiredCapabilityRefs ?? [])],
    aiMetadata: {
      displayName: overrides.resourceRef,
      description: "Locked Registry resource.",
      semanticTags: [...(overrides.semanticTags ?? ["subject"])],
    },
  };
}

function fixtureSchema(options: {
  readonly optionalNote?: boolean;
  readonly nullableOptionalNote?: boolean;
} = {}): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    kind: { const: "worldkit-authoring-spec" },
    subjectDefinitionRef: {
      type: "string",
      format: "subject-definition-ref",
    },
  };
  if (options.nullableOptionalNote === true) {
    properties.note = { type: ["string", "null"] };
  } else if (options.optionalNote === true) {
    properties.note = { type: "string" };
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "worldkit://schema/authoring-spec@4",
    type: "object",
    additionalProperties: false,
    required: ["kind", "subjectDefinitionRef"],
    properties,
  };
}

function project(options: {
  readonly schema?: Record<string, unknown>;
  readonly profile?: Record<string, unknown>;
  readonly lockEntries?: readonly RegistrySearchResultV1[];
  readonly allowedCapabilityRefs?: readonly string[];
  readonly includeExperimental?: boolean;
  readonly operations?: readonly WorldChangeOperationTypeV1[];
  readonly request?: Record<string, unknown>;
}) {
  return projectAiSchemaV1({
    projectionId: "projection.fixture.001",
    request: options.request ?? projectionRequest(),
    projectionProfile: options.profile ?? profileSource(),
    canonicalAuthoringSchema: options.schema ?? fixtureSchema({ optionalNote: true }),
    registryLockEntries: options.lockEntries ?? [
      lockEntry({ resourceRef: SUBJECT_A }),
      lockEntry({ resourceRef: SUBJECT_B }),
    ],
    allowedCapabilityRefs: options.allowedCapabilityRefs ?? [],
    allowedWorldChangeOperationTypes: options.operations ?? OPERATIONS,
    includeExperimental: options.includeExperimental === true,
  });
}

describe("P16-S1 AI Schema Profile source", () => {
  it("accepts Registry catalog extras and rejects provider keys", () => {
    const parsed = parseAiSchemaProjectionProfileSourceV1(profileSource());
    expect(parsed.resourceRef).toBe(PROFILE_REF);
    expect(parsed.contentHash).toBe(sha256CanonicalJson({
      kind: "ai-schema-projection-profile",
      schemaVersion: 1,
      id: "constrained-json",
      version: 1,
      resourceRef: PROFILE_REF,
      maximumPropertyCount: 512,
      maximumNestingDepth: 8,
      maximumEnumValueCount: 32,
      maximumSchemaBytes: 65_536,
      maximumRegistrySearchResultCount: 32,
      optionalFieldMode: "native-optional",
    }));
    const catalogWithoutHash = profileSource();
    expect(parsed.contentHash).not.toBe(sha256CanonicalJson(catalogWithoutHash));
    expect(() => parseAiSchemaProjectionProfileSourceV1(profileSource({
      provider: "openai",
    }))).toThrow(/AiSchemaProjectionProfileV1/);
  });
});

describe("P16-S1 Registry Lock and Capability Set hashes", () => {
  it("ignores entry order and changes when the admitted set changes", () => {
    const first = lockEntry({ resourceRef: SUBJECT_A });
    const second = lockEntry({ resourceRef: SUBJECT_B });
    expect(hashRegistryLockEntriesV1([first, second])).toBe(
      hashRegistryLockEntriesV1([second, first]),
    );
    expect(hashRegistryLockEntriesV1([first, second])).not.toBe(
      hashRegistryLockEntriesV1([first]),
    );
    expect(hashCapabilitySetV1([CAPABILITY_GROUND, "worldkit://capability/locomotion.wheeled@1"]))
      .toBe(hashCapabilitySetV1(["worldkit://capability/locomotion.wheeled@1", CAPABILITY_GROUND]));
    expect(hashCapabilitySetV1([CAPABILITY_GROUND])).not.toBe(hashCapabilitySetV1([]));
  });
});

describe("P16-S1 AI Schema Projector", () => {
  it("injects admitted Registry enums and round-trips the projection artifact", () => {
    const result = project({});
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    const field = (result.projection.jsonSchema.properties as Record<string, unknown>)
      .subjectDefinitionRef as Record<string, unknown>;
    expect(field.enum).toEqual([SUBJECT_A, SUBJECT_B]);
    expect(field.format).toBe("subject-definition-ref");
    expect(result.projection.degradations).toEqual([]);
    expect(result.projection.canonicalPathMappings).toEqual([]);
    expect(result.projection.projectionProfileHash).toBe(
      parseAiSchemaProjectionProfileSourceV1(profileSource()).contentHash,
    );
    expect(parseAiSchemaProjectionV1(result.projection)).toEqual(result.projection);
  });

  it("keeps native optional fields omitted and maps required-nullable null back to omitted", () => {
    const native = project({ schema: fixtureSchema({ optionalNote: true }) });
    expect(native.status).toBe("accepted");
    if (native.status !== "accepted") return;
    const nativeRequired = native.projection.jsonSchema.required as string[];
    expect(nativeRequired).toEqual(["kind", "subjectDefinitionRef"]);
    expect(native.projection.canonicalPathMappings).toEqual([]);

    const nullable = project({
      schema: fixtureSchema({ optionalNote: true }),
      profile: profileSource({ optionalFieldMode: "required-nullable-with-round-trip-map" }),
    });
    expect(nullable.status).toBe("accepted");
    if (nullable.status !== "accepted") return;
    const required = nullable.projection.jsonSchema.required as string[];
    expect(required).toEqual(["kind", "note", "subjectDefinitionRef"]);
    const note = (nullable.projection.jsonSchema.properties as Record<string, unknown>)
      .note as Record<string, unknown>;
    expect(note.type).toEqual(["string", "null"]);
    expect(nullable.projection.canonicalPathMappings).toEqual([
      expect.objectContaining({
        mode: "null-to-omitted",
        projectionInstancePath: "/note",
        canonicalInstancePath: "/note",
      }),
    ]);
    const restored = applyCanonicalPathMappingsV1(
      { kind: "worldkit-authoring-spec", subjectDefinitionRef: SUBJECT_A, note: null },
      nullable.projection.canonicalPathMappings,
    ) as Record<string, unknown>;
    expect(restored.note).toBeUndefined();
    expect(Object.hasOwn(restored, "note")).toBe(false);
  });

  it("rejects Canonical fields that allow both omitted and explicit null", () => {
    const result = project({ schema: fixtureSchema({ nullableOptionalNote: true }) });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.diagnostics[0]?.code).toBe("AI_SCHEMA_PROFILE_UNREPRESENTABLE");
  });

  it("degrades oversized Registry enums to the Canonical resource-ref format", () => {
    const result = project({
      profile: profileSource({ maximumEnumValueCount: 2 }),
      lockEntries: [
        lockEntry({ resourceRef: SUBJECT_A }),
        lockEntry({ resourceRef: SUBJECT_B }),
        lockEntry({ resourceRef: SUBJECT_C }),
      ],
    });
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    const field = (result.projection.jsonSchema.properties as Record<string, unknown>)
      .subjectDefinitionRef as Record<string, unknown>;
    expect(field.enum).toBeUndefined();
    expect(field.format).toBe("subject-definition-ref");
    expect(typeof field.pattern).toBe("string");
    expect(result.projection.degradations).toEqual([
      expect.objectContaining({
        type: "registry-enum-to-resource-ref",
        resourceKind: "subject-definition",
        reason: "enum-value-count-budget",
        canonicalInstancePath: "/subjectDefinitionRef",
      }),
    ]);
  });

  it("excludes experimental and capability-gated resources from the enum", () => {
    const result = project({
      lockEntries: [
        lockEntry({ resourceRef: SUBJECT_A }),
        lockEntry({
          resourceRef: SUBJECT_B,
          requiredCapabilityRefs: [CAPABILITY_GROUND],
        }),
        lockEntry({
          resourceRef: SUBJECT_EXPERIMENTAL,
          authoringAvailability: "experimental",
        }),
      ],
      allowedCapabilityRefs: [],
      includeExperimental: false,
    });
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    const field = (result.projection.jsonSchema.properties as Record<string, unknown>)
      .subjectDefinitionRef as Record<string, unknown>;
    expect(field.enum).toEqual([SUBJECT_A]);
  });

  it("rejects a Profile that is not Host-selected", () => {
    const result = project({
      request: {
        ...projectionRequest(),
        projectionProfileRef: "worldkit://ai-schema-projection-profile/other@1",
      },
    });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.diagnostics[0]?.code).toBe("AI_SCHEMA_PROFILE_NOT_ALLOWED");
  });

  it("rejects a schema that still exceeds property-count budget after enum degradation", () => {
    const result = project({
      profile: profileSource({ maximumPropertyCount: 1 }),
    });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.diagnostics[0]?.code).toBe("AI_SCHEMA_PROJECTION_BUDGET_EXCEEDED");
  });

  it("projects the published Authoring V4 schema under the constrained-json budget", () => {
    const result = project({
      schema: canonicalAuthoringSchema as Record<string, unknown>,
    });
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.projection.jsonSchema.$id).toBe("worldkit://schema/authoring-spec@4");
    expect(result.projection.jsonSchemaDraft).toBe("2020-12");
  });
});

describe("P16-S1 Registry Search", () => {
  it("binds an exact lock hash, sorts results, and pages by afterResourceRef", () => {
    const lockEntries = [
      lockEntry({ resourceRef: SUBJECT_C, semanticTags: ["animal", "subject"] }),
      lockEntry({ resourceRef: SUBJECT_A, semanticTags: ["humanoid", "subject"] }),
      lockEntry({ resourceRef: SUBJECT_B, semanticTags: ["humanoid", "subject"] }),
    ];
    const registryLockHash = hashRegistryLockEntriesV1(lockEntries);
    const firstPage = searchRegistryV1({
      receiptId: "search.receipt.001",
      request: {
        kind: "worldkit-registry-search-request",
        schemaVersion: 1,
        id: "search.request.001",
        authoringEditSessionId: "session.edit.001",
        registryLockHash,
        resourceKind: "subject-definition",
        maximumResultCount: 2,
      },
      projectionProfile: profileSource(),
      registryLockEntries: lockEntries,
      allowedCapabilityRefs: [],
      includeExperimental: false,
    });
    expect(firstPage.status).toBe("accepted");
    if (firstPage.status !== "accepted") return;
    expect(firstPage.receipt.results.map((row) => row.resourceRef)).toEqual([
      SUBJECT_C,
      SUBJECT_A,
    ]);
    expect(firstPage.receipt.nextAfterResourceRef).toBe(SUBJECT_A);
    expect(parseRegistrySearchReceiptV1(firstPage.receipt)).toEqual(firstPage.receipt);

    const secondPage = searchRegistryV1({
      receiptId: "search.receipt.002",
      request: {
        kind: "worldkit-registry-search-request",
        schemaVersion: 1,
        id: "search.request.002",
        authoringEditSessionId: "session.edit.001",
        registryLockHash,
        resourceKind: "subject-definition",
        afterResourceRef: SUBJECT_A,
        maximumResultCount: 2,
      },
      projectionProfile: profileSource(),
      registryLockEntries: lockEntries,
      allowedCapabilityRefs: [],
      includeExperimental: false,
    });
    expect(secondPage.status).toBe("accepted");
    if (secondPage.status !== "accepted") return;
    expect(secondPage.receipt.results.map((row) => row.resourceRef)).toEqual([SUBJECT_B]);
    expect(secondPage.receipt.nextAfterResourceRef).toBeUndefined();

    const tagged = searchRegistryV1({
      receiptId: "search.receipt.003",
      request: {
        kind: "worldkit-registry-search-request",
        schemaVersion: 1,
        id: "search.request.003",
        authoringEditSessionId: "session.edit.001",
        registryLockHash,
        resourceKind: "subject-definition",
        semanticTagsAll: ["humanoid"],
        maximumResultCount: 32,
      },
      projectionProfile: profileSource(),
      registryLockEntries: lockEntries,
      allowedCapabilityRefs: [],
      includeExperimental: false,
    });
    expect(tagged.status).toBe("accepted");
    if (tagged.status !== "accepted") return;
    expect(tagged.receipt.results.map((row) => row.resourceRef)).toEqual([
      SUBJECT_A,
      SUBJECT_B,
    ]);
  });

  it("rejects a search bound to a different Registry Lock hash", () => {
    const lockEntries = [lockEntry({ resourceRef: SUBJECT_A })];
    const result = searchRegistryV1({
      receiptId: "search.receipt.stale",
      request: {
        kind: "worldkit-registry-search-request",
        schemaVersion: 1,
        id: "search.request.stale",
        authoringEditSessionId: "session.edit.001",
        registryLockHash: contentHash("stale-lock"),
        resourceKind: "subject-definition",
        maximumResultCount: 8,
      },
      projectionProfile: profileSource(),
      registryLockEntries: lockEntries,
      allowedCapabilityRefs: [],
      includeExperimental: false,
    });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.diagnostics[0]?.code).toBe("REGISTRY_SEARCH_LOCK_MISMATCH");
    expect(result.diagnostics[0]?.details?.kind).toBe("hash-mismatch");
  });
});
