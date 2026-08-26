import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import { hashAuthoringDocumentV4 } from "@whitebox-world/authoring";
import {
  AUTHORING_EDIT_SCOPES_V1,
  parseAuthoringEditPolicyProjectionV1,
  parseWorldChangeRequestV1,
  parseWorldChangeSetV1,
  WORLD_CHANGE_OPERATION_TYPES_V1,
  type Sha256HashV1,
  type WorldChangeOperationV1,
  type WorldChangeSetV1,
} from "@whitebox-world/authoring-edit";
import {
  createPreparedCandidateLeaseStoreV1,
  createWorldChangeJournalV1,
  seedAuthoringRevisionHeadV1,
} from "@whitebox-world/authoring-host";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { afterEach, describe, expect, it } from "vitest";

import { parseWorldkitArgs, WorldkitUsageError } from "../worldkit";
import {
  AUTHORING_EDIT_CONNECTION_PROFILE_KIND,
  CONSTRAINED_JSON_PROFILE_REF,
  createInProcessAuthoringEditLivePortV1,
  FILE_MODE_VALIDATE_WORLD_ID,
  parseAuthoringEditConnectionProfileV1,
  redactAuthoringEditJsonV1,
  runChangeApplyV1,
  runChangeDiffV1,
  runChangeDryRunV1,
  runChangeExplainV1,
  runChangeReceiptV1,
  runChangeValidateV1,
  runRegistrySearchV1,
  runSchemaProjectV1,
  submitLiveWorldChangeV1,
} from "./authoring-edit-cli";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "authoring-edit-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

const HOUSE_PROTOTYPE = {
  id: "house-blockout",
  version: 1,
  kind: "primitive",
  primitive: "box",
  sizeMetersXYZ: [8, 5, 10],
  collisionEnabled: true,
  semantic: { classId: "structure.house" },
} as const;

const HOUSE_NODE = {
  id: "house-north",
  kind: "object",
  prototypeRef: "package://prototype/house-blockout@1",
  placement: {
    kind: "fixed",
    transform: { positionMetersXYZ: [18, 2.5, -24] },
  },
} as const;

const ADD_HOUSE_OPERATIONS: readonly WorldChangeOperationV1[] = [
  {
    id: "operation.add-house-prototype",
    type: "resource-upsert",
    resourceKind: "prototype",
    prototype: HOUSE_PROTOTYPE,
  },
  {
    id: "operation.add-house-node",
    type: "node-upsert",
    node: HOUSE_NODE,
  },
];

function addHouseChangeSet(specHash: Sha256HashV1): WorldChangeSetV1 {
  return parseWorldChangeSetV1({
    kind: "worldkit-world-change-set",
    schemaVersion: 1,
    id: "change.add-house.001",
    baseAuthoringSpecHash: specHash,
    preconditions: [
      {
        id: "precondition.house-prototype-absent",
        type: "target-absent",
        target: {
          kind: "resource",
          resourceKind: "prototype",
          resourceId: "house-blockout",
        },
      },
      {
        id: "precondition.house-node-absent",
        type: "target-absent",
        target: { kind: "node", nodeEntityId: "house-north" },
      },
    ],
    operations: ADD_HOUSE_OPERATIONS,
  });
}

function lockEntry(resourceRef: string, tags: readonly string[] = ["subject"]) {
  return {
    resourceRef,
    resourceKind: "subject-definition" as const,
    version: 1,
    contentHash: `sha256:${"a".repeat(64)}` as Sha256HashV1,
    authoringAvailability: "recommended" as const,
    requiredCapabilityRefs: [] as const,
    aiMetadata: {
      displayName: resourceRef,
      description: "Locked Registry resource.",
      semanticTags: [...tags],
    },
  };
}

describe("P16-CLI1 argument parse", () => {
  it("parses Schema, Registry Search, and Change commands", () => {
    expect(parseWorldkitArgs([
      "schema",
      "project",
      "world.json",
      "--profile",
      CONSTRAINED_JSON_PROFILE_REF,
      "--output",
      "projection.json",
      "--json",
    ])).toEqual({
      command: "schema-project",
      inputPath: "world.json",
      profileRef: CONSTRAINED_JSON_PROFILE_REF,
      outputPath: "projection.json",
      json: true,
    });
    expect(parseWorldkitArgs([
      "registry",
      "search",
      "--lock",
      "lock.json",
      "--kind",
      "subject-definition",
      "--tag",
      "humanoid",
      "--tag",
      "subject",
      "--after-resource-ref",
      "worldkit://subject-definition/humanoid.g-bot@2",
      "--limit",
      "8",
      "--json",
    ])).toEqual({
      command: "registry-search",
      lockPath: "lock.json",
      resourceKind: "subject-definition",
      semanticTags: ["humanoid", "subject"],
      afterResourceRef: "worldkit://subject-definition/humanoid.g-bot@2",
      limit: 8,
      json: true,
    });
    expect(parseWorldkitArgs([
      "change",
      "validate",
      "change-set.json",
      "--json",
    ])).toEqual({
      command: "change-validate",
      inputPath: "change-set.json",
      json: true,
    });
    expect(parseWorldkitArgs([
      "change",
      "dry-run",
      "world.json",
      "--change-set",
      "change-set.json",
      "--output",
      "candidate",
      "--json",
    ])).toEqual({
      command: "change-dry-run",
      inputPath: "world.json",
      changeSetPath: "change-set.json",
      outputPath: "candidate",
      json: true,
    });
    expect(parseWorldkitArgs([
      "change",
      "apply",
      "world.json",
      "--change-set",
      "change-set.json",
      "--output",
      "new-world.json",
      "--receipt",
      "receipt.json",
      "--write",
      "--json",
    ])).toEqual({
      command: "change-apply",
      inputPath: "world.json",
      changeSetPath: "change-set.json",
      outputPath: "new-world.json",
      receiptPath: "receipt.json",
      write: true,
      json: true,
    });
    expect(parseWorldkitArgs([
      "change",
      "receipt",
      "--request-id",
      "request.apply.abc",
      "--json",
    ])).toEqual({
      command: "change-receipt",
      requestId: "request.apply.abc",
      json: true,
    });
  });

  it("rejects missing --write, in-place options, and unknown flags", () => {
    expect(() => parseWorldkitArgs([
      "change",
      "apply",
      "world.json",
      "--change-set",
      "change-set.json",
      "--output",
      "new-world.json",
      "--receipt",
      "receipt.json",
    ])).toThrow(WorldkitUsageError);
    expect(() => parseWorldkitArgs([
      "change",
      "dry-run",
      "world.json",
      "--change-set",
      "change-set.json",
      "--output",
      "candidate",
      "--unknown",
    ])).toThrow("Unknown change dry-run option '--unknown'.");
    expect(() => parseWorldkitArgs([
      "schema",
      "project",
      "world.json",
      "--output",
      "projection.json",
    ])).toThrow("schema project requires --profile <resource-ref>.");
  });
});

describe("P16-CLI1 schema project and registry search", () => {
  it("projects a world or returns a structured projection budget failure", async () => {
    const directory = await createTemporaryDirectory();
    const worldPath = path.join(directory, "world.json");
    const outputPath = path.join(directory, "projection.json");
    await writeFile(worldPath, `${stringifyCanonicalJson(createValidAuthoringSpec())}\n`);
    const result = await runSchemaProjectV1({
      worldJsonPath: worldPath,
      profileRef: CONSTRAINED_JSON_PROFILE_REF,
      outputPath,
    });
    if (result.ok) {
      expect(result.projection?.kind).toBe("worldkit-ai-schema-projection");
      const written = JSON.parse(await readFile(outputPath, "utf8")) as {
        kind: string;
      };
      expect(written.kind).toBe("worldkit-ai-schema-projection");
      return;
    }
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "AI_SCHEMA_PROJECTION_BUDGET_EXCEEDED",
    );
  });

  it("rejects an unknown projection profile", async () => {
    const directory = await createTemporaryDirectory();
    const worldPath = path.join(directory, "world.json");
    await writeFile(worldPath, `${stringifyCanonicalJson(createValidAuthoringSpec())}\n`);
    const result = await runSchemaProjectV1({
      worldJsonPath: worldPath,
      profileRef: "worldkit://ai-schema-projection-profile/missing@1",
      outputPath: path.join(directory, "projection.json"),
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("CLI_AI_SCHEMA_PROJECTION_PROFILE_UNKNOWN");
  });

  it("searches a closed Registry Lock file", async () => {
    const directory = await createTemporaryDirectory();
    const lockPath = path.join(directory, "lock.json");
    const subjectA = "worldkit://subject-definition/humanoid.g-bot@2";
    const subjectB = "worldkit://subject-definition/humanoid.rigged-golden@2";
    await writeFile(lockPath, `${stringifyCanonicalJson({
      kind: "worldkit-registry-lock",
      schemaVersion: 1,
      entries: [
        lockEntry(subjectB, ["humanoid", "subject"]),
        lockEntry(subjectA, ["humanoid", "subject"]),
      ],
    })}\n`);
    const result = await runRegistrySearchV1({
      lockPath,
      resourceKind: "subject-definition",
      semanticTags: ["humanoid"],
      limit: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.searchReceipt?.results.map((row) => row.resourceRef)).toEqual([
      subjectA,
    ]);
    expect(result.searchReceipt?.nextAfterResourceRef).toBe(subjectA);
  });
});

describe("P16-CLI1 change validate", () => {
  it("validates a closed ChangeSet against the offline world id", async () => {
    const directory = await createTemporaryDirectory();
    const changeSetPath = path.join(directory, "change-set.json");
    const spec = createValidAuthoringSpec();
    await writeFile(
      changeSetPath,
      `${stringifyCanonicalJson(addHouseChangeSet(hashAuthoringDocumentV4(spec) as Sha256HashV1))}\n`,
    );
    const result = await runChangeValidateV1({ changeSetPath });
    expect(result.ok).toBe(true);
    expect(result.receipt?.status).toBe("validated");
    expect(result.receipt?.worldId).toBe(FILE_MODE_VALIDATE_WORLD_ID);
    expect(result.receipt?.publicationMode).toBe("none");
  });

  it("rejects a schema-invalid ChangeSet without inventing a Receipt", async () => {
    const directory = await createTemporaryDirectory();
    const changeSetPath = path.join(directory, "change-set.json");
    await writeFile(changeSetPath, `${stringifyCanonicalJson({ kind: "nope" })}\n`);
    const result = await runChangeValidateV1({ changeSetPath });
    expect(result.ok).toBe(false);
    expect(result.receipt).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe("WORLD_CHANGE_SET_SCHEMA_INVALID");
  });

  it("rejects static target conflicts", async () => {
    const directory = await createTemporaryDirectory();
    const changeSetPath = path.join(directory, "change-set.json");
    const spec = createValidAuthoringSpec();
    const changeSet = parseWorldChangeSetV1({
      kind: "worldkit-world-change-set",
      schemaVersion: 1,
      id: "change.conflict.001",
      baseAuthoringSpecHash: hashAuthoringDocumentV4(spec),
      preconditions: [],
      operations: [
        {
          id: "operation.remove-wall",
          type: "resource-remove",
          resourceKind: "prototype",
          resourceId: "wall",
        },
        {
          id: "operation.upsert-wall",
          type: "resource-upsert",
          resourceKind: "prototype",
          prototype: { ...HOUSE_PROTOTYPE, id: "wall" },
        },
      ],
    });
    await writeFile(changeSetPath, `${stringifyCanonicalJson(changeSet)}\n`);
    const result = await runChangeValidateV1({ changeSetPath });
    expect(result.ok).toBe(false);
    expect(result.receipt?.status).toBe("rejected");
    if (result.receipt?.status === "rejected") {
      expect(result.receipt.failurePhase).toBe("candidate-apply");
    }
    expect(result.diagnostics[0]?.code).toBe("WORLD_CHANGE_TARGET_CONFLICT");
  });
});

describe("P16-CLI1 change dry-run and apply", () => {
  it("dry-runs into a candidate directory without rewriting the world", async () => {
    const directory = await createTemporaryDirectory();
    const spec = createValidAuthoringSpec();
    const worldPath = path.join(directory, "world.json");
    const changeSetPath = path.join(directory, "change-set.json");
    const outputPath = path.join(directory, "candidate");
    const worldBytes = `${stringifyCanonicalJson(spec)}\n`;
    await writeFile(worldPath, worldBytes);
    await writeFile(
      changeSetPath,
      `${stringifyCanonicalJson(addHouseChangeSet(hashAuthoringDocumentV4(spec) as Sha256HashV1))}\n`,
    );
    const result = await runChangeDryRunV1({
      worldJsonPath: worldPath,
      changeSetPath,
      outputPath,
    });
    expect(result.ok).toBe(true);
    expect(result.receipt?.status).toBe("succeeded");
    expect(result.receipt?.mode).toBe("dry-run");
    expect(result.receipt?.publicationMode).toBe("none");
    expect(await readFile(worldPath, "utf8")).toBe(worldBytes);
    const candidate = JSON.parse(
      await readFile(path.join(outputPath, "candidate-authoring.json"), "utf8"),
    ) as { nodes: ReadonlyArray<{ id: string }> };
    expect(candidate.nodes.some((node) => node.id === "house-north")).toBe(true);
  });

  it("requires a distinct output path and writes authoring-only Apply artifacts", async () => {
    const directory = await createTemporaryDirectory();
    const spec = createValidAuthoringSpec();
    const worldPath = path.join(directory, "world.json");
    const changeSetPath = path.join(directory, "change-set.json");
    const outputPath = path.join(directory, "new-world.json");
    const receiptPath = path.join(directory, "receipt.json");
    const changeSet = addHouseChangeSet(hashAuthoringDocumentV4(spec) as Sha256HashV1);
    await writeFile(worldPath, `${stringifyCanonicalJson(spec)}\n`);
    await writeFile(changeSetPath, `${stringifyCanonicalJson(changeSet)}\n`);

    const overwrite = await runChangeApplyV1({
      worldJsonPath: worldPath,
      changeSetPath,
      outputPath: worldPath,
      receiptPath,
    });
    expect(overwrite.ok).toBe(false);
    expect(overwrite.diagnostics[0]?.code).toBe("CLI_OUTPUT_OVERWRITES_INPUT");

    const dryRun = await runChangeDryRunV1({
      worldJsonPath: worldPath,
      changeSetPath,
      outputPath: path.join(directory, "candidate"),
    });
    const apply = await runChangeApplyV1({
      worldJsonPath: worldPath,
      changeSetPath,
      outputPath,
      receiptPath,
    });
    expect(apply.ok).toBe(true);
    expect(apply.receipt?.status).toBe("committed");
    expect(apply.receipt?.publicationMode).toBe("none");
    if (apply.receipt?.status === "committed") {
      expect(apply.receipt.requestedOutcome).toBe("authoring-only");
    }
    expect(apply.requestId).not.toBe(dryRun.requestId);
    const writtenWorld = JSON.parse(await readFile(outputPath, "utf8")) as {
      nodes: ReadonlyArray<{ id: string }>;
    };
    expect(writtenWorld.nodes.some((node) => node.id === "house-north")).toBe(true);
    const writtenReceipt = JSON.parse(await readFile(receiptPath, "utf8")) as {
      publicationMode: string;
      requestId: string;
    };
    expect(writtenReceipt.publicationMode).toBe("none");
    expect(JSON.stringify(writtenReceipt)).not.toMatch(/"token"/);
  });
});

describe("P16-CLI1 change diff and explain", () => {
  it("explains and diffs a succeeded Dry Run Receipt from disk", async () => {
    const directory = await createTemporaryDirectory();
    const spec = createValidAuthoringSpec();
    const worldPath = path.join(directory, "world.json");
    const changeSetPath = path.join(directory, "change-set.json");
    const candidatePath = path.join(directory, "candidate");
    await writeFile(worldPath, `${stringifyCanonicalJson(spec)}\n`);
    await writeFile(
      changeSetPath,
      `${stringifyCanonicalJson(addHouseChangeSet(hashAuthoringDocumentV4(spec) as Sha256HashV1))}\n`,
    );
    const dryRun = await runChangeDryRunV1({
      worldJsonPath: worldPath,
      changeSetPath,
      outputPath: candidatePath,
    });
    expect(dryRun.ok).toBe(true);
    const receiptPath = path.join(candidatePath, "world-change-receipt.json");
    const diff = await runChangeDiffV1({ receiptPath });
    expect(diff.ok).toBe(true);
    expect(diff.diff?.changes.some((change) => change.type === "added")).toBe(true);
    const explain = await runChangeExplainV1({ receiptPath });
    expect(explain.ok).toBe(true);
    expect(explain.explain?.explanations.some((item) => item.type === "operation-effect"))
      .toBe(true);
    expect(explain.explain?.explanations.some((item) => item.type === "publication-selection"))
      .toBe(true);
  });
});

describe("P16-CLI1 live transport and credential redaction", () => {
  it("rejects a connection profile that carries credentials", () => {
    expect(() => parseAuthoringEditConnectionProfileV1({
      kind: AUTHORING_EDIT_CONNECTION_PROFILE_KIND,
      schemaVersion: 1,
      authoringEditSessionId: "session.cli.1",
      token: "super-secret",
    })).toThrow(/must not carry credentials/);
    expect(redactAuthoringEditJsonV1({
      ok: true,
      token: "super-secret",
      nested: { accessToken: "also-secret" },
    })).toEqual({
      ok: true,
      token: "[redacted]",
      nested: { accessToken: "[redacted]" },
    });
  });

  it("does not cancel an accepted live request after transport disconnect", async () => {
    const spec = createValidAuthoringSpec();
    const nowUnixMilliseconds = 1_700_000_000_000;
    const journal = createWorldChangeJournalV1();
    const leaseStore = createPreparedCandidateLeaseStoreV1();
    seedAuthoringRevisionHeadV1(journal, {
      worldId: spec.id,
      revisionRef: `revision://${spec.id}/1`,
      authoringSpec: spec,
      authoringSpecHash: hashAuthoringDocumentV4(spec) as Sha256HashV1,
    });
    const session = {
      authoringEditSessionId: "session.cli.live1",
      authorizationEpoch: 1,
      isActive: true,
      expiresAtUnixMilliseconds: nowUnixMilliseconds + 3_600_000,
      scopes: [...AUTHORING_EDIT_SCOPES_V1],
      policy: parseAuthoringEditPolicyProjectionV1({
        allowedWorldIds: [spec.id],
        registryLockHash: `sha256:${"a".repeat(64)}`,
        capabilitySetHash: `sha256:${"b".repeat(64)}`,
        projectionProfileRef: CONSTRAINED_JSON_PROFILE_REF,
        allowedWorldChangeOperationTypes: [...WORLD_CHANGE_OPERATION_TYPES_V1],
        allowedOverridePaths: [],
        requiredGateProfileRefs: [],
        workloadBudget: {
          maximumChangeSetBytes: 1_048_576,
          maximumPreconditionCount: 64,
          maximumOperationCount: 64,
          maximumConcurrentNonTerminalRequestCount: 8,
          maximumPreparedCandidateCount: 8,
          maximumPreparedCandidateBytes: 2_000_000,
          maximumPreparedCandidateRetentionMilliseconds: 3_600_000,
        },
      }),
      hasActiveRuntimeBinding: false,
    };
    const inner = createInProcessAuthoringEditLivePortV1({
      journal,
      leaseStore,
      session,
      nowUnixMilliseconds,
    });
    const delayed = {
      async submit(request: Parameters<typeof inner.submit>[0]) {
        const submitted = inner.submit(request);
        await new Promise((resolve) => {
          setTimeout(resolve, 40);
        });
        return submitted;
      },
      queryReceipt: inner.queryReceipt.bind(inner),
      queryCleanup: inner.queryCleanup.bind(inner),
    };
    const request = parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.validate.live001",
      authoringEditSessionId: session.authoringEditSessionId,
      worldId: spec.id,
      changeSet: addHouseChangeSet(hashAuthoringDocumentV4(spec) as Sha256HashV1),
      mode: "validate",
    });
    const abort = new AbortController();
    const pending = submitLiveWorldChangeV1({
      livePort: delayed,
      request,
      abortSignal: abort.signal,
    });
    abort.abort();
    const disconnected = await pending;
    expect(disconnected.ok).toBe(false);
    expect(disconnected.diagnostics[0]?.code).toBe(
      "CLI_AUTHORING_EDIT_TRANSPORT_DISCONNECTED",
    );
    expect(disconnected.requestId).toBe(request.id);
    const queried = await runChangeReceiptV1({
      requestId: request.id,
      livePort: inner,
    });
    expect(queried.ok).toBe(true);
    expect(queried.receipt?.requestId).toBe(request.id);
    expect(queried.receipt?.status).toBe("validated");
  });

  it("fails closed when the default CLI has no live host", async () => {
    const result = await runChangeReceiptV1({
      requestId: "request.apply.missing",
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe(
      "CLI_AUTHORING_EDIT_LIVE_HOST_UNAVAILABLE",
    );
  });
});
