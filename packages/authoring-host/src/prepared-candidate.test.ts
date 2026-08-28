import { worldPackageRefFromRootHashV1 } from "@whitebox-world/world-identity";

import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  hashAuthoringDocumentV4,
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import {
  hashAuthoringEditPolicyProjectionV1,
  parseAuthoringEditPolicyProjectionV1,
  parsePreparedCandidatePinV1,
  parseWorldChangeDiagnosticV1,
  WORLD_CHANGE_OPERATION_TYPES_V1,
  type AuthoringEditPolicyProjectionV1,
  type WorldChangeDiagnosticV1,
} from "@whitebox-world/authoring-edit";
import { compileCanonicalWorldV1 } from "@whitebox-world/compiler";
import { createCoreGameplayBootstrapV1 } from "@whitebox-world/gameplay";
import {
  createGameplayBootstrapResourceLockEntryV1,
} from "@whitebox-world/gameplay-contracts";
import { canonicalJsonBytes } from "@whitebox-world/protocol";
import {
  createWorldPackageV1,
} from "@whitebox-world/world-package";
import {
  createInMemoryWorldPackageStoreV1,
  createWorldPackageBuildContextFixtureV1,
} from "@whitebox-world/world-package/testing";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import {
  createPreparedCandidateLeaseStoreV1,
  lookupPreparedCandidateV1,
  pinPreparedCandidateV1,
  prepareTrustedCandidateV1,
  preparedCandidateLeaseUsageV1,
  releasePreparedCandidatePinV1,
  sweepExpiredPreparedCandidatesV1,
} from "./index.js";

const NOW = 1_700_000_000_000;
const HASH_REQUEST = `sha256:${"2".repeat(64)}` as Sha256HashV1;
const HASH_LOCK = `sha256:${"a".repeat(64)}` as Sha256HashV1;
const HASH_CAPS = `sha256:${"b".repeat(64)}` as Sha256HashV1;
const HASH_OTHER_POLICY = `sha256:${"c".repeat(64)}` as Sha256HashV1;
const HASH_CHANGE_SET = `sha256:${"e".repeat(64)}` as Sha256HashV1;
const HASH_BASE = `sha256:${"f".repeat(64)}` as Sha256HashV1;
const SESSION_ID = "edit-session-17";
const REQUEST_ID = "request.apply.add-house.001";
const OTHER_REQUEST_ID = "request.apply.add-house.002";
const REQUIRED_GATE_REF = "worldkit://validation-profile/outdoor-world-package-dev@1";
const VALIDATION_REPORT = {
  validationReportRef: "artifact://validation/report.001",
  validationReportHash: `sha256:${"9".repeat(64)}` as Sha256HashV1,
  status: "passed",
} as const;
const VALIDATION_REPORT_B = {
  validationReportRef: "artifact://validation/report.002",
  validationReportHash: `sha256:${"8".repeat(64)}` as Sha256HashV1,
  status: "passed",
} as const;
const CANDIDATE_BINDING = {
  authoringEditSessionId: SESSION_ID,
  changeSetHash: HASH_CHANGE_SET,
  baseAuthoringSpecHash: HASH_BASE,
} as const;

function generousBudget(overrides: {
  readonly maximumPreparedCandidateCount?: number;
  readonly maximumPreparedCandidateBytes?: number;
  readonly maximumPreparedCandidateRetentionMilliseconds?: number;
} = {}) {
  return {
    maximumChangeSetBytes: 1_000_000,
    maximumPreconditionCount: 64,
    maximumOperationCount: 64,
    maximumConcurrentNonTerminalRequestCount: 8,
    maximumPreparedCandidateCount: overrides.maximumPreparedCandidateCount ?? 8,
    maximumPreparedCandidateBytes: overrides.maximumPreparedCandidateBytes ?? 2_000_000,
    maximumPreparedCandidateRetentionMilliseconds:
      overrides.maximumPreparedCandidateRetentionMilliseconds ?? 3_600_000,
  };
}

function policy(
  overrides: {
    readonly allowedWorldIds?: readonly string[];
    readonly requiredGateProfileRefs?: readonly string[];
    readonly workloadBudget?: ReturnType<typeof generousBudget>;
  } = {},
): AuthoringEditPolicyProjectionV1 {
  return parseAuthoringEditPolicyProjectionV1({
    allowedWorldIds: overrides.allowedWorldIds ?? ["basic-world"],
    registryLockHash: HASH_LOCK,
    capabilitySetHash: HASH_CAPS,
    projectionProfileRef: "worldkit://ai-schema-projection-profile/constrained-json@1",
    allowedWorldChangeOperationTypes: [...WORLD_CHANGE_OPERATION_TYPES_V1],
    allowedOverridePaths: [],
    requiredGateProfileRefs: overrides.requiredGateProfileRefs ?? [],
    workloadBudget: overrides.workloadBudget ?? generousBudget(),
  });
}

function expectedHashes(spec: AuthoringSpecV4) {
  const normalized = normalizeAuthoringSpecV4(spec);
  if (
    !normalized.ok ||
    isNil(normalized.value) ||
    isNil(normalized.normalizedWorldIrHash) ||
    isNil(normalized.layoutSolveReport) ||
    isNil(normalized.layoutSolveReportHash)
  ) {
    throw new Error(`expected fixture normalize: ${JSON.stringify(normalized.diagnostics)}`);
  }
  const normalizedWorldIr = normalized.value;
  const entityDescriptors = normalizedWorldIr.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => {
      const definition = normalizedWorldIr.resources.subjectDefinitions.find(
        (candidate) => candidate.subjectDefinitionRef === node.subjectDefinitionRef,
      );
      if (isNil(definition)) {
        throw new Error(`missing fixture subject '${node.subjectDefinitionRef}'`);
      }
      return {
        id: node.id,
        entityDefinitionRef: node.subjectDefinitionRef,
        capabilityRefs: definition.capabilityRefs,
      };
    });
  const gameplayBootstrap = createCoreGameplayBootstrapV1({
    worldId: normalizedWorldIr.id,
    worldSeed: normalizedWorldIr.seed,
    entityDescriptors,
    initialRelationshipStates: normalizedWorldIr.relationships.map(
      (relationship) => ({ ...relationship, establishedSimulationTick: 0 }),
    ),
  });
  const compiled = compileCanonicalWorldV1({
    normalizedWorldIr,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrap,
    worldRuntimeBootstrapRef:
      `worldkit://world-runtime-bootstrap/${normalizedWorldIr.id}@1`,
  });
  if (!compiled.ok || isNil(compiled.canonicalSceneExecutionPlan) || isNil(compiled.executionPlanHash)) {
    throw new Error(`expected fixture compile: ${JSON.stringify(compiled.diagnostics)}`);
  }
  const directory = createWorldPackageV1({
    packageId: `${spec.id}.package`,
    ...createWorldPackageBuildContextFixtureV1(),
    authoringSpec: spec,
    normalizedWorldIr,
    layoutSolveResult: {
      status: normalized.layoutSolveReport.status,
      report: normalized.layoutSolveReport,
      layoutSolveReportHash: normalized.layoutSolveReportHash,
    },
    executionPlan: compiled.canonicalSceneExecutionPlan,
    gameplayBootstrap,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
    resourceArtifacts: [],
  });
  const receipt = directory.receipt;
  return {
    resultAuthoringSpecHash: hashAuthoringDocumentV4(spec) as Sha256HashV1,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash as Sha256HashV1,
    executionPlanHash: compiled.executionPlanHash as Sha256HashV1,
    worldPackageRootHash: receipt.worldPackageRootHash,
    registryLockHash: receipt.manifest.registryLockHash,
    worldPackageRef: worldPackageRefFromRootHashV1(receipt.worldPackageRootHash),
    sizeBytes:
      canonicalJsonBytes(receipt).byteLength +
      canonicalJsonBytes([]).byteLength,
  };
}

async function prepare(
  spec: AuthoringSpecV4,
  extras: {
    readonly policy?: AuthoringEditPolicyProjectionV1;
    readonly store?: ReturnType<typeof createPreparedCandidateLeaseStoreV1>;
    readonly nowUnixMilliseconds?: number;
    readonly evaluateRequiredGates?: Parameters<
      typeof prepareTrustedCandidateV1
    >[0]["evaluateRequiredGates"];
  } = {},
) {
  const store = extras.store ?? createPreparedCandidateLeaseStoreV1();
  const selectedPolicy = extras.policy ?? policy();
  const worldPackageStore = createInMemoryWorldPackageStoreV1();
  return {
    store,
    policy: selectedPolicy,
    result: await prepareTrustedCandidateV1({
      candidateAuthoringSpec: spec,
      ...CANDIDATE_BINDING,
      policy: selectedPolicy,
      store,
      worldPackageStore,
      worldPackageBuildContext: createWorldPackageBuildContextFixtureV1(),
      resourceArtifacts: [],
      nowUnixMilliseconds: extras.nowUnixMilliseconds ?? NOW,
      ...(isNil(extras.evaluateRequiredGates)
        ? {}
        : { evaluateRequiredGates: extras.evaluateRequiredGates }),
    }),
  };
}

function prepared(
  result: Awaited<ReturnType<typeof prepareTrustedCandidateV1>>,
): Extract<Awaited<ReturnType<typeof prepareTrustedCandidateV1>>, { status: "prepared" }> {
  expect(result.status).toBe("prepared");
  if (result.status !== "prepared") throw new Error("expected prepared candidate");
  return result;
}

function rejected(
  result: Awaited<ReturnType<typeof prepareTrustedCandidateV1>>,
): Extract<Awaited<ReturnType<typeof prepareTrustedCandidateV1>>, { status: "rejected" }> {
  expect(result.status).toBe("rejected");
  if (result.status !== "rejected") throw new Error("expected rejected candidate");
  return result;
}

function codes(diagnostics: readonly WorldChangeDiagnosticV1[]): readonly string[] {
  return diagnostics.map((item) => item.code);
}

describe("P16-P1 trusted candidate build", () => {
  it("builds full hashes and stores an immutable lease bound to the host policy", async () => {
    const spec = createValidAuthoringSpec();
    const selectedPolicy = policy();
    const { store, result } = await prepare(spec, { policy: selectedPolicy });
    const ready = prepared(result);
    const independent = expectedHashes(spec);

    expect(ready.buildIdentity).toEqual({
      resultAuthoringSpecHash: independent.resultAuthoringSpecHash,
      registryLockHash: independent.registryLockHash,
      normalizedWorldIrHash: independent.normalizedWorldIrHash,
      executionPlanHash: independent.executionPlanHash,
      worldPackageRootHash: independent.worldPackageRootHash,
    });
    expect(ready.authoringEditPolicyHash).toBe(
      hashAuthoringEditPolicyProjectionV1(selectedPolicy),
    );
    expect(ready.preparedCandidateExpiresAtUnixMilliseconds).toBe(
      NOW + selectedPolicy.workloadBudget.maximumPreparedCandidateRetentionMilliseconds,
    );
    expect(ready.preparedCandidateRef.startsWith(`candidate://${spec.id}/`)).toBe(true);
    expect(preparedCandidateLeaseUsageV1(store)).toEqual({
      count: 1,
      bytes: ready.sizeBytes,
    });
    expect(ready.sizeBytes).toBe(independent.sizeBytes);

    const found = lookupPreparedCandidateV1(store, ready.preparedCandidateRef, NOW);
    expect(found.status).toBe("found");
    if (found.status !== "found") throw new Error("expected found lease");
    expect(found.lease.buildIdentity).toEqual(ready.buildIdentity);
    expect(Object.hasOwn(found.lease, "candidateAuthoringSpec")).toBe(false);
    expect(Object.hasOwn(found.lease, "executionPlan")).toBe(false);
    expect(Object.hasOwn(found.lease, "gameplayBootstrap")).toBe(false);
    expect(found.lease.worldPackageRef).toBe(independent.worldPackageRef);
    expect(found.lease.worldPackageBuildReceipt.worldPackageRootHash).toBe(
      independent.worldPackageRootHash,
    );
    expect(found.lease.authoringEditPolicyHash).toBe(ready.authoringEditPolicyHash);
  });

  it("fails closed without storing a lease when a required gate has no trusted runner", async () => {
    const spec = createValidAuthoringSpec();
    const { store, result } = await prepare(spec, {
      policy: policy({ requiredGateProfileRefs: [REQUIRED_GATE_REF] }),
    });
    const failed = rejected(result);
    expect(failed.failurePhase).toBe("required-gates");
    expect(codes(failed.diagnostics)).toEqual(["WORLD_CHANGE_REQUIRED_GATE_FAILED"]);
    expect(preparedCandidateLeaseUsageV1(store)).toEqual({ count: 0, bytes: 0 });
  });

  it("fails closed without storing a lease when a required gate runner reports failure", async () => {
    const spec = createValidAuthoringSpec();
    const { store, result } = await prepare(spec, {
      policy: policy({ requiredGateProfileRefs: [REQUIRED_GATE_REF] }),
      evaluateRequiredGates: () => ({
        status: "failed",
        diagnostics: [
          parseWorldChangeDiagnosticV1({
            severity: "error",
            code: "WORLD_CHANGE_REQUIRED_GATE_FAILED",
            instancePath: "/requiredGateProfileRefs/0",
            message: "Required Validation Profile failed.",
          }),
        ],
      }),
    });
    const failed = rejected(result);
    expect(failed.failurePhase).toBe("required-gates");
    expect(codes(failed.diagnostics)).toEqual(["WORLD_CHANGE_REQUIRED_GATE_FAILED"]);
    expect(preparedCandidateLeaseUsageV1(store)).toEqual({ count: 0, bytes: 0 });
  });

  it("persists a lease only after an injected required gate runner passes", async () => {
    const spec = createValidAuthoringSpec();
    const { store, result } = await prepare(spec, {
      policy: policy({ requiredGateProfileRefs: [REQUIRED_GATE_REF] }),
      evaluateRequiredGates: () => ({
        status: "passed",
        validationReports: [VALIDATION_REPORT_B, VALIDATION_REPORT],
      }),
    });
    const ready = prepared(result);
    expect(preparedCandidateLeaseUsageV1(store).count).toBe(1);
    expect(ready.buildIdentity.worldPackageRootHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    const found = lookupPreparedCandidateV1(store, ready.preparedCandidateRef, NOW);
    expect(found.status).toBe("found");
    if (found.status !== "found") throw new Error("expected found lease");
    expect(found.lease.validationReports).toEqual([
      VALIDATION_REPORT,
      VALIDATION_REPORT_B,
    ]);
  });

  it("fails closed when a required gate runner returns duplicate report refs", async () => {
    const spec = createValidAuthoringSpec();
    const { store, result } = await prepare(spec, {
      policy: policy({ requiredGateProfileRefs: [REQUIRED_GATE_REF] }),
      evaluateRequiredGates: () => ({
        status: "passed",
        validationReports: [
          VALIDATION_REPORT,
          {
            ...VALIDATION_REPORT,
            validationReportHash: `sha256:${"7".repeat(64)}` as Sha256HashV1,
          },
        ],
      }),
    });
    const failed = rejected(result);
    expect(failed.failurePhase).toBe("required-gates");
    expect(codes(failed.diagnostics)).toEqual(["WORLD_CHANGE_REQUIRED_GATE_FAILED"]);
    expect(preparedCandidateLeaseUsageV1(store)).toEqual({ count: 0, bytes: 0 });
  });

  it("rejects an invalid candidate and stores no lease", async () => {
    const valid = createValidAuthoringSpec();
    const spec = {
      ...valid,
      nodes: [...valid.nodes, valid.nodes[0]!],
    };
    const { store, result } = await prepare(spec);
    const failed = rejected(result);
    expect(failed.failurePhase).toBe("canonical-validation");
    expect(codes(failed.diagnostics)).toEqual(["WORLD_CHANGE_CANDIDATE_INVALID"]);
    expect(preparedCandidateLeaseUsageV1(store)).toEqual({ count: 0, bytes: 0 });
  });

  it("rejects a second lease when the prepared-candidate count budget is exceeded", async () => {
    const spec = createValidAuthoringSpec();
    const selectedPolicy = policy({
      workloadBudget: generousBudget({ maximumPreparedCandidateCount: 1 }),
    });
    const first = await prepare(spec, { policy: selectedPolicy });
    prepared(first.result);
    const second = await prepare(spec, { store: first.store, policy: selectedPolicy });
    const failed = rejected(second.result);
    expect(failed.failurePhase).toBe("admission");
    expect(failed.diagnostics).toEqual([
      expect.objectContaining({
        code: "WORLD_CHANGE_ADMISSION_BUDGET_EXCEEDED",
        details: {
          kind: "admission-budget",
          budgetId: "prepared-candidate-count",
          limit: 1,
          actual: 2,
        },
      }),
    ]);
    expect(preparedCandidateLeaseUsageV1(first.store).count).toBe(1);
  });

  it("rejects persist when candidate bytes would exceed the host budget", async () => {
    const spec = createValidAuthoringSpec();
    const sizeBytes = expectedHashes(spec).sizeBytes;
    const { store, result } = await prepare(spec, {
      policy: policy({
        workloadBudget: generousBudget({ maximumPreparedCandidateBytes: sizeBytes - 1 }),
      }),
    });
    const failed = rejected(result);
    expect(failed.failurePhase).toBe("admission");
    expect(failed.diagnostics).toEqual([
      expect.objectContaining({
        code: "WORLD_CHANGE_ADMISSION_BUDGET_EXCEEDED",
        details: {
          kind: "admission-budget",
          budgetId: "prepared-candidate-bytes",
          limit: sizeBytes - 1,
          actual: sizeBytes,
        },
      }),
    ]);
    expect(preparedCandidateLeaseUsageV1(store)).toEqual({ count: 0, bytes: 0 });
  });

  it("pins with compare-and-set and reuses the same request identity", async () => {
    const spec = createValidAuthoringSpec();
    const selectedPolicy = policy();
    const { store, result } = await prepare(spec, { policy: selectedPolicy });
    const ready = prepared(result);
    const policyHash = hashAuthoringEditPolicyProjectionV1(selectedPolicy);
    const first = pinPreparedCandidateV1({
      store,
      preparedCandidateRef: ready.preparedCandidateRef,
      ...CANDIDATE_BINDING,
      requestId: REQUEST_ID,
      requestHash: HASH_REQUEST,
      authoringEditPolicyHash: policyHash,
      nowUnixMilliseconds: NOW + 10,
    });
    expect(first.status).toBe("pinned");
    if (first.status !== "pinned") throw new Error("expected pin");
    expect(first.pin).toEqual(
      parsePreparedCandidatePinV1({
        preparedCandidateRef: ready.preparedCandidateRef,
        authoringEditSessionId: SESSION_ID,
        requestId: REQUEST_ID,
        requestHash: HASH_REQUEST,
        authoringEditPolicyHash: policyHash,
        pinnedAtUnixMilliseconds: NOW + 10,
      }),
    );
    const reused = pinPreparedCandidateV1({
      store,
      preparedCandidateRef: ready.preparedCandidateRef,
      ...CANDIDATE_BINDING,
      requestId: REQUEST_ID,
      requestHash: HASH_REQUEST,
      authoringEditPolicyHash: policyHash,
      nowUnixMilliseconds: NOW + 20,
    });
    expect(reused.status).toBe("pinned");
    if (reused.status !== "pinned") throw new Error("expected reused pin");
    expect(reused.pin).toEqual(first.pin);
    const conflicted = pinPreparedCandidateV1({
      store,
      preparedCandidateRef: ready.preparedCandidateRef,
      ...CANDIDATE_BINDING,
      requestId: REQUEST_ID,
      requestHash: `sha256:${"d".repeat(64)}` as Sha256HashV1,
      authoringEditPolicyHash: policyHash,
      nowUnixMilliseconds: NOW + 30,
    });
    expect(conflicted.status).toBe("rejected");
    if (conflicted.status !== "rejected") throw new Error("expected request conflict");
    expect(codes(conflicted.diagnostics)).toEqual(["WORLD_CHANGE_REQUEST_ID_CONFLICT"]);
  });

  it("does not let a different request steal an active pin", async () => {
    const spec = createValidAuthoringSpec();
    const selectedPolicy = policy();
    const { store, result } = await prepare(spec, { policy: selectedPolicy });
    const ready = prepared(result);
    const policyHash = hashAuthoringEditPolicyProjectionV1(selectedPolicy);
    const first = pinPreparedCandidateV1({
      store,
      preparedCandidateRef: ready.preparedCandidateRef,
      ...CANDIDATE_BINDING,
      requestId: REQUEST_ID,
      requestHash: HASH_REQUEST,
      authoringEditPolicyHash: policyHash,
      nowUnixMilliseconds: NOW,
    });
    expect(first.status).toBe("pinned");
    const stolen = pinPreparedCandidateV1({
      store,
      preparedCandidateRef: ready.preparedCandidateRef,
      ...CANDIDATE_BINDING,
      requestId: OTHER_REQUEST_ID,
      requestHash: HASH_REQUEST,
      authoringEditPolicyHash: policyHash,
      nowUnixMilliseconds: NOW,
    });
    expect(stolen.status).toBe("rejected");
    if (stolen.status !== "rejected") throw new Error("expected pin rejection");
    expect(codes(stolen.diagnostics)).toEqual(["WORLD_CHANGE_PREPARED_CANDIDATE_STALE"]);
  });

  it("rejects a pin when the policy hash no longer matches the lease", async () => {
    const spec = createValidAuthoringSpec();
    const { store, result } = await prepare(spec);
    const ready = prepared(result);
    const stale = pinPreparedCandidateV1({
      store,
      preparedCandidateRef: ready.preparedCandidateRef,
      ...CANDIDATE_BINDING,
      requestId: REQUEST_ID,
      requestHash: HASH_REQUEST,
      authoringEditPolicyHash: HASH_OTHER_POLICY,
      nowUnixMilliseconds: NOW,
    });
    expect(stale.status).toBe("rejected");
    if (stale.status !== "rejected") throw new Error("expected stale pin");
    expect(codes(stale.diagnostics)).toEqual(["WORLD_CHANGE_PREPARED_CANDIDATE_STALE"]);
  });

  it("expires unpinned leases and refuses a late pin after GC", async () => {
    const spec = createValidAuthoringSpec();
    const selectedPolicy = policy({
      workloadBudget: generousBudget({
        maximumPreparedCandidateRetentionMilliseconds: 100,
      }),
    });
    const { store, result } = await prepare(spec, { policy: selectedPolicy });
    const ready = prepared(result);
    sweepExpiredPreparedCandidatesV1(store, NOW + 100);
    expect(preparedCandidateLeaseUsageV1(store)).toEqual({ count: 0, bytes: 0 });
    const latePin = pinPreparedCandidateV1({
      store,
      preparedCandidateRef: ready.preparedCandidateRef,
      ...CANDIDATE_BINDING,
      requestId: REQUEST_ID,
      requestHash: HASH_REQUEST,
      authoringEditPolicyHash: hashAuthoringEditPolicyProjectionV1(selectedPolicy),
      nowUnixMilliseconds: NOW + 100,
    });
    expect(latePin.status).toBe("rejected");
    if (latePin.status !== "rejected") throw new Error("expected expired pin");
    expect(codes(latePin.diagnostics)).toEqual(["WORLD_CHANGE_PREPARED_CANDIDATE_EXPIRED"]);
  });

  it("keeps a pinned lease past expiry until the owning request releases it", async () => {
    const spec = createValidAuthoringSpec();
    const selectedPolicy = policy({
      workloadBudget: generousBudget({
        maximumPreparedCandidateRetentionMilliseconds: 100,
      }),
    });
    const { store, result } = await prepare(spec, { policy: selectedPolicy });
    const ready = prepared(result);
    const policyHash = hashAuthoringEditPolicyProjectionV1(selectedPolicy);
    const pinned = pinPreparedCandidateV1({
      store,
      preparedCandidateRef: ready.preparedCandidateRef,
      ...CANDIDATE_BINDING,
      requestId: REQUEST_ID,
      requestHash: HASH_REQUEST,
      authoringEditPolicyHash: policyHash,
      nowUnixMilliseconds: NOW,
    });
    expect(pinned.status).toBe("pinned");
    sweepExpiredPreparedCandidatesV1(store, NOW + 10_000);
    expect(preparedCandidateLeaseUsageV1(store).count).toBe(1);
    const found = lookupPreparedCandidateV1(
      store,
      ready.preparedCandidateRef,
      NOW + 10_000,
    );
    expect(found.status).toBe("found");
    releasePreparedCandidatePinV1({
      store,
      preparedCandidateRef: ready.preparedCandidateRef,
      requestId: REQUEST_ID,
      nowUnixMilliseconds: NOW + 10_000,
    });
    sweepExpiredPreparedCandidatesV1(store, NOW + 10_000);
    expect(preparedCandidateLeaseUsageV1(store)).toEqual({ count: 0, bytes: 0 });
  });
});
