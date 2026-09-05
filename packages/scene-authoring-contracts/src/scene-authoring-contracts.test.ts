import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { describe, expect, it, vi } from "vitest";

import {
  assertNativeBlockGenerationReceiptMatchesRequestV1,
  assertNativeBlockGenerationRequestMatchesAttemptV1,
  decideSceneAuthoringRouteV1,
  hashNativeBlockGenerationReceiptV1,
  hashNativeBlockGenerationRequestV1,
  nativeBlockGenerationReceiptCanonicalBytesV1,
  nativeBlockGenerationRequestCanonicalBytesV1,
  parseNativeBlockGenerationReceiptV1,
  parseNativeBlockGenerationRequestV1,
  firstInvalidatedSceneAuthoringGateV1,
  hashSceneAuthoringAttemptResultV1,
  hashSceneAuthoringAttemptV1,
  hashSceneAuthoringRouteDecisionV1,
  parseSceneAuthoringAttemptResultV1,
  parseSceneAuthoringAttemptV1,
  parseSceneAuthoringRouteDecisionV1,
  parseWorldGenerationSceneSourceKindV1,
  sceneAuthoringAttemptCanonicalBytesV1,
  sceneAuthoringAttemptResultCanonicalBytesV1,
  sceneAuthoringRouteDecisionCanonicalBytesV1,
  type SceneAuthoringAttemptResultV1,
  type SceneAuthoringAttemptV1,
  type DecideSceneAuthoringRouteV1Input,
  type SceneAuthoringInvalidatedGateV1,
  type SceneAuthoringRouteDecisionV1,
  type NativeBlockGenerationReceiptV1,
  type NativeBlockGenerationRequestV1,
} from "./scene-authoring-contracts.js";

const HASH_A = `sha256:${"1".repeat(64)}` as Sha256HashV1;
const HASH_B = `sha256:${"2".repeat(64)}` as Sha256HashV1;
const HASH_C = `sha256:${"3".repeat(64)}` as Sha256HashV1;
const HASH_D = `sha256:${"4".repeat(64)}` as Sha256HashV1;
const HASH_E = `sha256:${"5".repeat(64)}` as Sha256HashV1;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;

describe("world generation Scene Source selection", () => {
  it("defaults an omitted Source to Babylon Native and accepts only the two current Sources", () => {
    expect(parseWorldGenerationSceneSourceKindV1(undefined))
      .toBe("babylon-native");
    expect(parseWorldGenerationSceneSourceKindV1("babylon-native"))
      .toBe("babylon-native");
    expect(parseWorldGenerationSceneSourceKindV1("canonical"))
      .toBe("canonical");
    for (const invalid of [null, "native", "canonical-default", "", 1]) {
      expect(() => parseWorldGenerationSceneSourceKindV1(invalid)).toThrow(
        "WORLD_GENERATION_SCENE_SOURCE_INVALID",
      );
    }
  });

  it("records Canonical as an explicit selection rather than a default", () => {
    const decision = decideSceneAuthoringRouteV1({
      id: "explicit-canonical",
      sceneBriefRef: "worldkit://scene-brief/explicit-canonical@1",
      sceneBriefHash: HASH_A,
      trustProfileRef: "worldkit://trust-profile/trusted-local@1",
      trustProfileHash: HASH_B,
      requiredCapabilityRefs: [],
      requestedSourceKind: "canonical",
      nativeTrustAdmitted: true,
      referenceDrivenDistinctiveSilhouette: false,
    });
    expect(decision.decision).toMatchObject({
      kind: "canonical",
      reasonCodes: ["user-selected-canonical"],
    });
  });
});

function canonicalRoute(): SceneAuthoringRouteDecisionV1 {
  return {
    kind: "scene-authoring-route-decision",
    schemaVersion: 1,
    id: "route-cloud-ridge",
    sceneBriefRef: "worldkit://scene-brief/cloud-ridge@1",
    sceneBriefHash: HASH_A,
    trustProfileRef: "worldkit://trust-profile/trusted-local@1",
    trustProfileHash: HASH_B,
    requiredCapabilityRefs: [
      "worldkit://capability/deterministic-layout@1",
      "worldkit://capability/route.r1@1",
    ],
    decision: {
      kind: "canonical",
      authoringProfileRef: "worldkit://authoring-profile/canonical-outdoor@1",
      reasonCodes: ["requires-canonical-route", "user-selected-canonical"],
    },
  };
}

function nativeRoute(): SceneAuthoringRouteDecisionV1 {
  return {
    ...canonicalRoute(),
    id: "route-native-ridge",
    requiredCapabilityRefs: ["worldkit://capability/static-collider@1"],
    decision: {
      kind: "babylon-native",
      authoringProfileRef: "worldkit://authoring-profile/native-local@1",
      compositionStrategy: "ground-first-with-locked-assets",
      reasonCodes: [
        "reference-driven-distinctive-silhouette",
        "user-selected-supported-lane",
      ],
    },
  };
}

function capabilityGapRoute(): SceneAuthoringRouteDecisionV1 {
  return {
    ...canonicalRoute(),
    id: "route-gap",
    decision: {
      kind: "capability-gap",
      unsupportedCapabilityRefs: [
        "worldkit://capability/dynamic-multilayer-surface@1",
      ],
      reasonCodes: ["unsupported-dynamic-multilayer-surface"],
    },
  };
}

function canonicalAttempt(): SceneAuthoringAttemptV1 {
  return {
    kind: "scene-authoring-attempt",
    schemaVersion: 1,
    id: "attempt-cloud-ridge-001",
    sceneAuthoringRouteDecisionRef:
      "worldkit://scene-authoring-route-decision/cloud-ridge@1",
    sceneAuthoringRouteDecisionHash: HASH_A,
    sceneBriefRef: "worldkit://scene-brief/cloud-ridge@1",
    sceneBriefHash: HASH_B,
    sourceInput: {
      kind: "canonical",
      authoringInputRef: "worldkit://authoring-input/cloud-ridge@1",
      authoringInputHash: HASH_C,
    },
    selectedAssetResources: [
      {
        assetResourceRef: "worldkit://asset/cliff-a@1",
        assetPublicationReceiptRef:
          "worldkit://asset-publication-receipt/cliff-a@1",
        assetPublicationReceiptHash: HASH_D,
      },
      {
        assetResourceRef: "worldkit://asset/tree-b@1",
        assetPublicationReceiptRef:
          "worldkit://asset-publication-receipt/tree-b@1",
        assetPublicationReceiptHash: HASH_E,
      },
    ],
    seed: 4_294_967_295,
    authoringProfileRef: "worldkit://authoring-profile/canonical-outdoor@1",
    acceptanceTargetRefs: [
      "worldkit://acceptance-target/opening-frame@1",
      "worldkit://acceptance-target/playable-route@1",
    ],
    requiredEvidenceProfileRefs: [
      "worldkit://evidence-profile/route-r1@1",
      "worldkit://evidence-profile/whitebox-triview@1",
    ],
  };
}

function nativeAttempt(): SceneAuthoringAttemptV1 {
  return {
    ...canonicalAttempt(),
    id: "attempt-native-ridge-001",
    sourceInput: {
      kind: "babylon-native",
      bootstrapInputRef: "worldkit://native-bootstrap-input/ridge@1",
      bootstrapInputHash: HASH_C,
      generationRequestRef:
        "worldkit://native-generation-request/ridge.initial@1",
      generationRequestHash: HASH_D,
    },
    authoringProfileRef: "worldkit://authoring-profile/native-local@1",
  };
}

type CompletedResultV1 = Extract<
  SceneAuthoringAttemptResultV1,
  { readonly outcome: "completed" }
>;
type FailedResultV1 = Extract<
  SceneAuthoringAttemptResultV1,
  { readonly outcome: "rejected" | "tool-error" }
>;

function completedResult(): CompletedResultV1 {
  return {
    kind: "scene-authoring-attempt-result",
    schemaVersion: 1,
    id: "attempt-result-cloud-ridge-001",
    sceneAuthoringAttemptRef:
      "worldkit://scene-authoring-attempt/cloud-ridge-001@1",
    sceneAuthoringAttemptHash: HASH_A,
    outcome: "completed",
    authoredSourceRef: "worldkit://canonical-authoring-source/cloud-ridge@1",
    authoredSourceHash: HASH_B,
    evidenceRefs: [
      "worldkit://evidence/opening-frame@1",
      "worldkit://evidence/route@1",
    ],
  };
}

function rejectedResult(
  outcome: "rejected" | "tool-error" = "rejected",
): FailedResultV1 {
  return {
    kind: "scene-authoring-attempt-result",
    schemaVersion: 1,
    id: `attempt-result-${outcome}`,
    sceneAuthoringAttemptRef:
      "worldkit://scene-authoring-attempt/cloud-ridge-001@1",
    sceneAuthoringAttemptHash: HASH_A,
    outcome,
    diagnosticRefs: ["worldkit://diagnostic/scene-authoring-failure@1"],
  };
}

function expectRouteInvalid(input: unknown): void {
  expect(() => parseSceneAuthoringRouteDecisionV1(input)).toThrow(
    /SCENE_AUTHORING_ROUTE_DECISION_INVALID/,
  );
}

function expectAttemptInvalid(input: unknown): void {
  expect(() => parseSceneAuthoringAttemptV1(input)).toThrow(
    /SCENE_AUTHORING_ATTEMPT_INVALID/,
  );
}

function expectResultInvalid(input: unknown): void {
  expect(() => parseSceneAuthoringAttemptResultV1(input)).toThrow(
    /SCENE_AUTHORING_ATTEMPT_RESULT_INVALID/,
  );
}

function generationRequest(): NativeBlockGenerationRequestV1 {
  return {
    kind: "native-block-generation-request",
    schemaVersion: 1,
    id: "cloud-temple.initial",
    routeDecisionRef:
      "worldkit://scene-authoring-route-decision/cloud-temple@1",
    routeDecisionHash: HASH_A,
    sceneBriefRef: "worldkit://scene-brief/cloud-temple@1",
    sceneBriefHash: HASH_B,
    referenceInputs: [{
      inputRef: "worldkit://reconstruction-input/cloud-temple-reference@1",
      contentHash: HASH_C,
      mediaType: "image/png",
    }],
    codexExecutionProfileRef:
      "worldkit://codex-execution-profile/formal@1",
    codexExecutionProfileHash: HASH_D,
    taskInstructionRef:
      "worldkit://task-instruction/native-block-reconstruction@1",
    taskInstructionHash: HASH_E,
    builderSkillRef:
      "worldkit://skill/worldkit-native-block-builder@1",
    builderSkillHash: HASH_A,
    workspaceContextManifestRef:
      "worldkit://workspace-context/native-block-builder@1",
    workspaceContextManifestHash: HASH_B,
    contextInputs: [
      { inputRef: "context/api.md", contentHash: HASH_C },
      { inputRef: "context/profile.json", contentHash: HASH_D },
    ],
    nativeSceneApiRef: "worldkit://native-scene-api/babylon-native@1",
    nativeSceneApiHash: HASH_A,
    nativeSceneProfileRef:
      "worldkit://native-scene-profile/whitebox.blocks@1",
    nativeSceneProfileHash: HASH_B,
    blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
    blockProfileHash: HASH_C,
    bootstrapInputRef: "worldkit://native-bootstrap/cloud-temple@1",
    bootstrapInputHash: HASH_D,
    seed: 202608311,
    budgets: {
      maximumBlockCount: 2_000,
      maximumStaticColliderCount: 500,
      maximumStaticColliderVertexCount: 200_000,
      maximumStaticColliderTriangleCount: 100_000,
      maximumOutputBytes: 4_000_000,
      timeoutSeconds: 1_800,
    },
    declaredOutputPaths: [
      "scene.ts",
      "native-block-authoring.json",
      "native-resources.json",
    ],
  };
}

function generationReceipt(
  request: NativeBlockGenerationRequestV1 = generationRequest(),
): NativeBlockGenerationReceiptV1 {
  return {
    kind: "native-block-generation-receipt",
    schemaVersion: 1,
    id: "cloud-temple.initial.receipt",
    generationRequestRef:
      "worldkit://native-generation-request/cloud-temple.initial@1",
    generationRequestHash: hashNativeBlockGenerationRequestV1(request),
    routerTaskPayloadHash: HASH_E,
    taskInstructionHash: request.taskInstructionHash,
    builderSkillHash: request.builderSkillHash,
    workspaceContextManifestHash: request.workspaceContextManifestHash,
    routerRequestId: "cloud-temple.initial",
    backend: "cloud",
    executionProfile: "formal",
    resolvedModel: "gpt-5.6-sol",
    resolvedReasoningEffort: "xhigh",
    outcome: "completed",
    outputs: [
      {
        path: "native-block-authoring.json",
        contentHash: HASH_A,
        sizeBytes: 200,
        mediaType: "application/json",
      },
      {
        path: "native-resources.json",
        contentHash: HASH_B,
        sizeBytes: 2,
        mediaType: "application/json",
      },
      {
        path: "scene.ts",
        contentHash: HASH_C,
        sizeBytes: 2_000,
        mediaType: "text/typescript",
      },
    ],
    diagnosticCodes: [],
    cleanupOutcome: "completed",
  };
}

describe("Native Block generation identity", () => {
  it("parses, freezes, canonicalizes, and hashes the closed Request and Receipt", () => {
    const request = parseNativeBlockGenerationRequestV1(generationRequest());
    const receipt = parseNativeBlockGenerationReceiptV1(generationReceipt(request));
    expect(request.declaredOutputPaths).toEqual([
      "scene.ts",
      "native-block-authoring.json",
      "native-resources.json",
    ]);
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.referenceInputs[0])).toBe(true);
    expect(Object.isFrozen(receipt.outputs[0])).toBe(true);
    expect(nativeBlockGenerationRequestCanonicalBytesV1(request)).toEqual(
      canonicalJsonBytes(request),
    );
    expect(nativeBlockGenerationReceiptCanonicalBytesV1(receipt)).toEqual(
      canonicalJsonBytes(receipt),
    );
    expect(hashNativeBlockGenerationRequestV1(request)).toBe(
      sha256CanonicalJson(request),
    );
    expect(hashNativeBlockGenerationReceiptV1(receipt)).toBe(
      sha256CanonicalJson(receipt),
    );
    expect(() =>
      assertNativeBlockGenerationReceiptMatchesRequestV1(request, receipt)
    ).not.toThrow();
  });

  it("accepts one provider-neutral definitive task-timeout diagnostic", () => {
    const request = generationRequest();
    const receipt = parseNativeBlockGenerationReceiptV1({
      ...generationReceipt(request),
      outcome: "rejected",
      outputs: [],
      diagnosticCodes: ["task-timeout"],
    });

    expect(receipt.diagnosticCodes).toEqual(["task-timeout"]);
    expect(receipt.outputs).toEqual([]);
  });

  it("binds original WebP references through the current generation request", () => {
    const request = parseNativeBlockGenerationRequestV1({
      ...generationRequest(),
      referenceInputs: [{ inputRef: "reference-0.webp", contentHash: HASH_A, mediaType: "image/webp" }],
    });
    expect(request.referenceInputs).toEqual([{ inputRef: "reference-0.webp", contentHash: HASH_A, mediaType: "image/webp" }]);
  });

  it("retains task-timeout when cleanup also fails", () => {
    const request = generationRequest();
    const receipt = parseNativeBlockGenerationReceiptV1({
      ...generationReceipt(request),
      outcome: "tool-error",
      outputs: [],
      diagnosticCodes: ["cleanup-failed", "task-timeout"],
      cleanupOutcome: "failed",
    });

    expect(receipt.diagnosticCodes).toEqual([
      "cleanup-failed",
      "task-timeout",
    ]);
    expect(receipt.cleanupOutcome).toBe("failed");
  });

  it("rejects task-timeout outside its definitive or cleanup-failed branches", () => {
    const request = generationRequest();
    const completed = generationReceipt(request);
    for (const invalid of [
      { ...completed, outcome: "unknown", outputs: [], diagnosticCodes: ["task-timeout"] },
      { ...completed, outcome: "tool-error", outputs: [], diagnosticCodes: ["task-timeout"] },
      { ...completed, outcome: "rejected", outputs: [], diagnosticCodes: ["task-rejected", "task-timeout"] },
      { ...completed, outcome: "rejected", diagnosticCodes: ["task-timeout"] },
      { ...completed, outcome: "rejected", outputs: [], diagnosticCodes: ["task-timeout"], cleanupOutcome: "failed" },
    ]) {
      expect(() => parseNativeBlockGenerationReceiptV1(invalid)).toThrow(
        /NATIVE_BLOCK_GENERATION_RECEIPT_INVALID/,
      );
    }
  });

  it("rejects self-reference, reordered inputs, wrong outputs, and non-formal execution", () => {
    const request = generationRequest();
    const receipt = generationReceipt(request);
    for (const invalid of [
      { ...request, routerTaskPayloadHash: HASH_A },
      { ...request, contextInputs: [...request.contextInputs].reverse() },
      { ...request, contextInputs: [request.contextInputs[0], request.contextInputs[0]] },
      { ...request, referenceInputs: [request.referenceInputs[0], request.referenceInputs[0]] },
      { ...request, declaredOutputPaths: [...request.declaredOutputPaths].reverse() },
      { ...request, codexExecutionProfileRef: "worldkit://codex-execution-profile/smoke@1" },
      { ...request, contextInputs: [{ inputRef: "/tmp/context/api.md", contentHash: HASH_A }] },
      { ...request, contextInputs: [{ inputRef: "context/../api.md", contentHash: HASH_A }] },
      { ...request, contextInputs: [{ inputRef: "https://example.test/context.json", contentHash: HASH_A }] },
      { ...request, contextInputs: [{ inputRef: "C:/context/api.md", contentHash: HASH_A }] },
      { ...request, contextInputs: [{ inputRef: "context//api.md", contentHash: HASH_A }] },
      { ...request, absoluteWorkspacePath: "/tmp/world" },
    ]) {
      expect(() => parseNativeBlockGenerationRequestV1(invalid)).toThrow(
        /NATIVE_BLOCK_GENERATION_REQUEST_INVALID/,
      );
    }
    for (const invalid of [
      { ...receipt, resolvedModel: "gpt-5.4" },
      { ...receipt, resolvedReasoningEffort: "high" },
      { ...receipt, executionProfile: "smoke" },
      { ...receipt, providerPayload: {} },
      { ...receipt, outputs: [...receipt.outputs].reverse() },
    ]) {
      expect(() => parseNativeBlockGenerationReceiptV1(invalid)).toThrow(
        /NATIVE_BLOCK_GENERATION_RECEIPT_INVALID/,
      );
    }
    expect(() => assertNativeBlockGenerationReceiptMatchesRequestV1(
      request,
      {
        ...receipt,
        outputs: receipt.outputs.filter(({ path }) => path !== "scene.ts"),
        outcome: "tool-error",
        diagnosticCodes: ["output-missing"],
      },
    )).toThrow(/NATIVE_BLOCK_GENERATION_RECEIPT_MISMATCH/);
    expect(parseNativeBlockGenerationRequestV1({
      ...request,
      contextInputs: [],
    }).contextInputs).toEqual([]);
  });

  it("closes one parsed Generation Request against its Native Attempt", () => {
    const request = generationRequest();
    const attempt = nativeAttempt();
    const closedAttempt = {
      ...attempt,
      sceneAuthoringRouteDecisionRef:
        "worldkit://scene-authoring-route-decision/cloud-temple@1",
      sceneAuthoringRouteDecisionHash: request.routeDecisionHash,
      sceneBriefRef: request.sceneBriefRef,
      sceneBriefHash: request.sceneBriefHash,
      sourceInput: {
        ...attempt.sourceInput,
        bootstrapInputRef: request.bootstrapInputRef,
        bootstrapInputHash: request.bootstrapInputHash,
        generationRequestRef:
          "worldkit://native-generation-request/cloud-temple.initial@1",
        generationRequestHash: hashNativeBlockGenerationRequestV1(request),
      },
      seed: request.seed,
    };
    expect(() => assertNativeBlockGenerationRequestMatchesAttemptV1(
      "worldkit://native-generation-request/cloud-temple.initial@1",
      request,
      closedAttempt,
    )).not.toThrow();
    expect(() => assertNativeBlockGenerationRequestMatchesAttemptV1(
      "worldkit://native-generation-request/cloud-temple.initial@1",
      request,
      { ...closedAttempt, seed: request.seed + 1 },
    )).toThrow(/NATIVE_BLOCK_GENERATION_REQUEST_ATTEMPT_MISMATCH/);
    expect(() => assertNativeBlockGenerationRequestMatchesAttemptV1(
      "worldkit://native-generation-request/cloud-temple.other@1",
      request,
      closedAttempt,
    )).toThrow(/NATIVE_BLOCK_GENERATION_REQUEST_ATTEMPT_MISMATCH/);
    expect(() => assertNativeBlockGenerationRequestMatchesAttemptV1(
      "worldkit://native-generation-request/cloud-temple.initial@1",
      request,
      { ...closedAttempt, sceneAuthoringRouteDecisionRef: "worldkit://route/other@1" },
    )).toThrow(/NATIVE_BLOCK_GENERATION_REQUEST_ATTEMPT_MISMATCH/);
  });
});

describe("SceneAuthoringRouteDecisionV1", () => {
  const routeInput = (): DecideSceneAuthoringRouteV1Input => ({
    id: "route-native-ridge",
    sceneBriefRef: "worldkit://scene-brief/cloud-ridge@1",
    sceneBriefHash: HASH_A,
    trustProfileRef: "worldkit://trust-profile/trusted-local@1",
    trustProfileHash: HASH_B,
    requiredCapabilityRefs: ["worldkit://capability/static-collider@1"],
    requestedSourceKind: "babylon-native",
    nativeTrustAdmitted: true,
    referenceDrivenDistinctiveSilhouette: true,
  });

  it("owns the deterministic admitted Native route decision", () => {
    const input = routeInput();
    const decision = decideSceneAuthoringRouteV1({
      ...input,
      requiredCapabilityRefs: [
        "worldkit://capability/static-collider@1",
        "worldkit://capability/block-visual-groups@1",
        "worldkit://capability/static-collider@1",
      ].reverse(),
    });

    expect(decision).toEqual({
      kind: "scene-authoring-route-decision",
      schemaVersion: 1,
      id: input.id,
      sceneBriefRef: input.sceneBriefRef,
      sceneBriefHash: input.sceneBriefHash,
      trustProfileRef: input.trustProfileRef,
      trustProfileHash: input.trustProfileHash,
      requiredCapabilityRefs: [
        "worldkit://capability/block-visual-groups@1",
        "worldkit://capability/static-collider@1",
      ],
      decision: {
        kind: "babylon-native",
        authoringProfileRef:
          "worldkit://native-authoring-profile/whitebox.blocks@1",
        compositionStrategy: "ground-first",
        reasonCodes: [
          "reference-driven-distinctive-silhouette",
          "user-selected-supported-lane",
        ],
      },
    });
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.decision)).toBe(true);
  });

  it("fails closed for unsupported Native capabilities and unadmitted trust", () => {
    const unsupported = [
      ["worldkit://capability/world-change-set@1", "requires-world-change-set"],
      ["worldkit://capability/route.nav@1", "requires-canonical-route"],
      [
        "worldkit://capability/dynamic-multilayer-surface@1",
        "unsupported-dynamic-multilayer-surface",
      ],
    ] as const;
    for (const [capabilityRef, reasonCode] of unsupported) {
      const decision = decideSceneAuthoringRouteV1({
        ...routeInput(),
        requiredCapabilityRefs: [capabilityRef],
      });
      expect(decision.decision).toEqual({
        kind: "capability-gap",
        unsupportedCapabilityRefs: [capabilityRef],
        reasonCodes: [reasonCode],
      });
    }

    const unadmitted = decideSceneAuthoringRouteV1({
      ...routeInput(),
      nativeTrustAdmitted: false,
    });
    expect(unadmitted.decision).toEqual({
      kind: "capability-gap",
      unsupportedCapabilityRefs: [
        "worldkit://capability/hosted-native-admission@1",
      ],
      reasonCodes: ["hosted-native-not-admitted"],
    });
  });

  it("keeps explicit Canonical selection canonical and rejects extra input keys", () => {
    expect(decideSceneAuthoringRouteV1({
      ...routeInput(),
      requestedSourceKind: "canonical",
    }).decision).toEqual({
      kind: "canonical",
      authoringProfileRef: "worldkit://authoring-profile/canonical-outdoor@1",
      reasonCodes: ["user-selected-canonical"],
    });
    expect(() => decideSceneAuthoringRouteV1({
      ...routeInput(),
      modelAuthoredDesiredRoute: "babylon-native",
    } as DecideSceneAuthoringRouteV1Input)).toThrow(
      /SCENE_AUTHORING_ROUTE_DECISION_INVALID/,
    );
  });

  it("parses all closed decision members and deeply freezes detached data", () => {
    for (const fixture of [canonicalRoute(), nativeRoute(), capabilityGapRoute()]) {
      const mutable = structuredClone(fixture);
      const parsed = parseSceneAuthoringRouteDecisionV1(mutable);
      expect(parsed).toEqual(fixture);
      expect(parsed).not.toBe(mutable);
      expect(parsed.decision).not.toBe(mutable.decision);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.decision)).toBe(true);
      expect(Object.isFrozen(parsed.requiredCapabilityRefs)).toBe(true);
      expect(Object.isFrozen(parsed.decision.reasonCodes)).toBe(true);
    }
  });

  it("canonicalizes set-like refs and reason codes before bytes and hashing", () => {
    const unsorted = {
      ...canonicalRoute(),
      requiredCapabilityRefs: [...canonicalRoute().requiredCapabilityRefs].reverse(),
      decision: {
        ...canonicalRoute().decision,
        reasonCodes: [...canonicalRoute().decision.reasonCodes].reverse(),
      },
    };
    const parsed = parseSceneAuthoringRouteDecisionV1(unsorted);

    expect(parsed.requiredCapabilityRefs).toEqual(
      canonicalRoute().requiredCapabilityRefs,
    );
    expect(parsed.decision.reasonCodes).toEqual(
      canonicalRoute().decision.reasonCodes,
    );
    expect(sceneAuthoringRouteDecisionCanonicalBytesV1(unsorted)).toEqual(
      canonicalJsonBytes(parsed),
    );
    expect(hashSceneAuthoringRouteDecisionV1(unsorted)).toBe(
      hashSceneAuthoringRouteDecisionV1(canonicalRoute()),
    );
    expect(hashSceneAuthoringRouteDecisionV1(unsorted)).toBe(
      sha256CanonicalJson(parsed),
    );
  });

  it("rejects duplicate refs/codes, malformed hashes, and non-canonical strings", () => {
    for (const value of [
      {
        ...canonicalRoute(),
        requiredCapabilityRefs: [
          canonicalRoute().requiredCapabilityRefs[0],
          canonicalRoute().requiredCapabilityRefs[0],
        ],
      },
      {
        ...canonicalRoute(),
        decision: {
          ...canonicalRoute().decision,
          reasonCodes: ["user-selected-canonical", "user-selected-canonical"],
        },
      },
      { ...canonicalRoute(), sceneBriefHash: ZERO_HASH },
      { ...canonicalRoute(), trustProfileHash: `sha256:${"A".repeat(64)}` },
      { ...canonicalRoute(), id: " route" },
      { ...canonicalRoute(), sceneBriefRef: "e\u0301" },
    ]) {
      expectRouteInvalid(value);
    }
  });

  it("enforces closed branch semantics and exact keys", () => {
    for (const value of [
      { ...canonicalRoute(), unknown: true },
      { ...canonicalRoute(), kind: "route-decision" },
      { ...canonicalRoute(), schemaVersion: 2 },
      {
        ...canonicalRoute(),
        decision: { ...canonicalRoute().decision, compositionStrategy: "ground-first" },
      },
      {
        ...nativeRoute(),
        decision: {
          ...nativeRoute().decision,
          reasonCodes: ["native-production-not-released"],
        },
      },
      {
        ...nativeRoute(),
        decision: {
          ...nativeRoute().decision,
          reasonCodes: ["hosted-native-not-admitted"],
        },
      },
      {
        ...nativeRoute(),
        decision: {
          ...nativeRoute().decision,
          reasonCodes: ["requires-world-change-set"],
        },
      },
      {
        ...nativeRoute(),
        decision: {
          ...nativeRoute().decision,
          reasonCodes: ["requires-deterministic-layout"],
        },
      },
      {
        ...nativeRoute(),
        decision: {
          ...nativeRoute().decision,
          reasonCodes: ["requires-canonical-route"],
        },
      },
      {
        ...capabilityGapRoute(),
        decision: { ...capabilityGapRoute().decision, unsupportedCapabilityRefs: [] },
      },
      {
        ...capabilityGapRoute(),
        decision: { ...capabilityGapRoute().decision, authoringProfileRef: "x" },
      },
    ]) {
      expectRouteInvalid(value);
    }
  });
});

describe("SceneAuthoringAttemptV1", () => {
  it("parses both source members, canonicalizes all set-like collections, and hashes", () => {
    for (const fixture of [canonicalAttempt(), nativeAttempt()]) {
      const unsorted = {
        ...fixture,
        selectedAssetResources: [...fixture.selectedAssetResources].reverse(),
        acceptanceTargetRefs: [...fixture.acceptanceTargetRefs].reverse(),
        requiredEvidenceProfileRefs: [
          ...fixture.requiredEvidenceProfileRefs,
        ].reverse(),
      };
      const parsed = parseSceneAuthoringAttemptV1(unsorted);

      expect(parsed).toEqual(fixture);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.sourceInput)).toBe(true);
      expect(Object.isFrozen(parsed.selectedAssetResources)).toBe(true);
      expect(Object.isFrozen(parsed.selectedAssetResources[0])).toBe(true);
      expect(sceneAuthoringAttemptCanonicalBytesV1(unsorted)).toEqual(
        canonicalJsonBytes(parsed),
      );
      expect(hashSceneAuthoringAttemptV1(unsorted)).toBe(
        sha256CanonicalJson(parsed),
      );
      expect(hashSceneAuthoringAttemptV1(unsorted)).toBe(
        hashSceneAuthoringAttemptV1(fixture),
      );
    }
  });

  it("accepts exactly unsigned uint32 seeds and rejects signed zero", () => {
    for (const seed of [0, 1, 4_294_967_295]) {
      expect(parseSceneAuthoringAttemptV1({ ...canonicalAttempt(), seed }).seed)
        .toBe(seed);
    }
    for (const seed of [-0, -1, 1.5, 4_294_967_296, Number.NaN, Infinity]) {
      expectAttemptInvalid({ ...canonicalAttempt(), seed });
    }
  });

  it("rejects duplicate selected assets, receipts, and refs", () => {
    const firstAsset = canonicalAttempt().selectedAssetResources[0]!;
    const secondAsset = canonicalAttempt().selectedAssetResources[1]!;
    for (const value of [
      {
        ...canonicalAttempt(),
        selectedAssetResources: [firstAsset, firstAsset],
      },
      {
        ...canonicalAttempt(),
        selectedAssetResources: [
          firstAsset,
          { ...secondAsset, assetResourceRef: firstAsset.assetResourceRef },
        ],
      },
      {
        ...canonicalAttempt(),
        selectedAssetResources: [
          firstAsset,
          {
            ...secondAsset,
            assetPublicationReceiptRef: firstAsset.assetPublicationReceiptRef,
          },
        ],
      },
      {
        ...canonicalAttempt(),
        acceptanceTargetRefs: ["worldkit://target/a@1", "worldkit://target/a@1"],
      },
      {
        ...canonicalAttempt(),
        requiredEvidenceProfileRefs: [
          "worldkit://evidence-profile/a@1",
          "worldkit://evidence-profile/a@1",
        ],
      },
    ]) {
      expectAttemptInvalid(value);
    }
  });

  it("requires Native reconstruction attempts to bind acceptance and evidence profiles", () => {
    expectAttemptInvalid({ ...nativeAttempt(), acceptanceTargetRefs: [] });
    expectAttemptInvalid({ ...nativeAttempt(), requiredEvidenceProfileRefs: [] });
    expect(() => parseSceneAuthoringAttemptV1({
      ...canonicalAttempt(),
      acceptanceTargetRefs: [],
      requiredEvidenceProfileRefs: [],
    })).not.toThrow();
  });

  it("rejects missing, unknown, cross-source, and malformed fields", () => {
    const missing = { ...canonicalAttempt() } as Record<string, unknown>;
    delete missing.seed;
    for (const value of [
      missing,
      { ...canonicalAttempt(), unknown: true },
      { ...canonicalAttempt(), kind: "attempt" },
      { ...canonicalAttempt(), schemaVersion: 2 },
      { ...canonicalAttempt(), sceneAuthoringRouteDecisionHash: ZERO_HASH },
      {
        ...canonicalAttempt(),
        sourceInput: {
          ...canonicalAttempt().sourceInput,
          bootstrapInputRef: "worldkit://native-bootstrap-input/ridge@1",
        },
      },
      {
        ...nativeAttempt(),
        sourceInput: {
          ...nativeAttempt().sourceInput,
          authoringInputRef: "worldkit://authoring-input/ridge@1",
        },
      },
      {
        ...nativeAttempt(),
        sourceInput: {
          kind: "babylon-native",
          bootstrapInputRef: "worldkit://native-bootstrap-input/ridge@1",
          bootstrapInputHash: HASH_C,
          [["module", "GenerationInput", "Ref"].join("")]:
            "worldkit://native-module-generation-input/ridge@1",
          [["module", "GenerationInput", "Hash"].join("")]: HASH_D,
        },
      },
      {
        ...canonicalAttempt(),
        selectedAssetResources: [
          { ...canonicalAttempt().selectedAssetResources[0], unknown: true },
        ],
      },
    ]) {
      expectAttemptInvalid(value);
    }
  });
});

describe("SceneAuthoringAttemptResultV1", () => {
  it("parses and hashes completed, rejected, and tool-error members", () => {
    for (const fixture of [
      completedResult(),
      rejectedResult(),
      rejectedResult("tool-error"),
    ]) {
      const parsed = parseSceneAuthoringAttemptResultV1(fixture);
      expect(parsed).toEqual(fixture);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(sceneAuthoringAttemptResultCanonicalBytesV1(fixture)).toEqual(
        canonicalJsonBytes(parsed),
      );
      expect(hashSceneAuthoringAttemptResultV1(fixture)).toBe(
        sha256CanonicalJson(parsed),
      );
    }
  });

  it("canonicalizes evidence and diagnostic refs", () => {
    const completed = {
      ...completedResult(),
      evidenceRefs: [...completedResult().evidenceRefs].reverse(),
    };
    const rejected = {
      ...rejectedResult(),
      diagnosticRefs: ["worldkit://diagnostic/z@1", "worldkit://diagnostic/a@1"],
    };
    const parsedCompleted = parseSceneAuthoringAttemptResultV1(completed);
    const parsedRejected = parseSceneAuthoringAttemptResultV1(rejected);
    expect(parsedCompleted.outcome).toBe("completed");
    expect(parsedRejected.outcome).toBe("rejected");
    if (parsedCompleted.outcome !== "completed") {
      throw new Error("completed fixture must parse as completed");
    }
    if (parsedRejected.outcome === "completed") {
      throw new Error("rejected fixture must parse as rejected");
    }
    expect(parsedCompleted.evidenceRefs).toEqual(completedResult().evidenceRefs);
    expect(parsedRejected.diagnosticRefs).toEqual([
      "worldkit://diagnostic/a@1",
      "worldkit://diagnostic/z@1",
    ]);
  });

  it("keeps completed output fields exclusive from failure diagnostics", () => {
    for (const value of [
      { ...completedResult(), diagnosticRefs: [] },
      { ...rejectedResult(), authoredSourceRef: "worldkit://source/x@1" },
      { ...rejectedResult(), authoredSourceHash: HASH_B },
      { ...rejectedResult(), evidenceRefs: [] },
      { ...completedResult(), unknown: true },
      { ...completedResult(), outcome: "unknown" },
      { ...completedResult(), sceneAuthoringAttemptHash: ZERO_HASH },
      {
        ...completedResult(),
        evidenceRefs: ["worldkit://evidence/a@1", "worldkit://evidence/a@1"],
      },
      {
        ...rejectedResult(),
        diagnosticRefs: ["worldkit://diagnostic/a@1", "worldkit://diagnostic/a@1"],
      },
    ]) {
      expectResultInvalid(value);
    }
  });
});

describe("closed data boundary", () => {
  it("rejects accessors, symbols, and non-ordinary prototypes recursively without invoking accessors", () => {
    const getter = vi.fn(() => HASH_A);
    const accessor = canonicalAttempt() as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, "sceneBriefHash", {
      enumerable: true,
      get: getter,
    });
    const nestedAccessor = canonicalAttempt() as unknown as {
      sourceInput: Record<string, unknown>;
    };
    Object.defineProperty(nestedAccessor.sourceInput, "authoringInputHash", {
      enumerable: true,
      get: getter,
    });
    const assetAccessor = canonicalAttempt() as unknown as {
      selectedAssetResources: Record<string, unknown>[];
    };
    Object.defineProperty(
      assetAccessor.selectedAssetResources[0],
      "assetPublicationReceiptHash",
      { enumerable: true, get: getter },
    );
    const symbol = { ...canonicalRoute(), [Symbol("hidden")]: true };
    const nestedSymbol = {
      ...completedResult(),
      evidenceRefs: Object.assign([...completedResult().evidenceRefs], {
        [Symbol("hidden")]: true,
      }),
    };
    const customPrototype = Object.assign(
      Object.create({ inherited: true }),
      rejectedResult(),
    );
    const nullPrototype = Object.assign(Object.create(null), nativeRoute());

    expectAttemptInvalid(accessor);
    expectAttemptInvalid(nestedAccessor);
    expectAttemptInvalid(assetAccessor);
    expectRouteInvalid(symbol);
    expectResultInvalid(nestedSymbol);
    expectResultInvalid(customPrototype);
    expectRouteInvalid(nullPrototype);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("firstInvalidatedSceneAuthoringGateV1", () => {
  it("returns route-decision before evaluating source inputs", () => {
    for (const next of [
      { ...canonicalAttempt(), sceneAuthoringRouteDecisionRef: "worldkit://route/new@1" },
      { ...canonicalAttempt(), sceneAuthoringRouteDecisionHash: HASH_E },
    ]) {
      expect(firstInvalidatedSceneAuthoringGateV1(canonicalAttempt(), next))
        .toBe("route-decision");
    }
  });

  it("returns source-authoring for every source-level identity change", () => {
    const base = canonicalAttempt();
    const nativeBase = nativeAttempt();
    if (base.sourceInput.kind !== "canonical") {
      throw new Error("canonical fixture must use canonical source input");
    }
    if (nativeBase.sourceInput.kind !== "babylon-native") {
      throw new Error("native fixture must use Babylon Native source input");
    }
    const cases: readonly SceneAuthoringAttemptV1[] = [
      { ...base, id: "attempt-cloud-ridge-002" },
      { ...base, sceneBriefRef: "worldkit://scene-brief/new@1" },
      { ...base, sceneBriefHash: HASH_E },
      {
        ...base,
        sourceInput: { ...base.sourceInput, authoringInputHash: HASH_E },
      },
      nativeBase,
      {
        ...nativeBase,
        sourceInput: {
          ...nativeBase.sourceInput,
          bootstrapInputHash: HASH_E,
        },
      },
      {
        ...nativeBase,
        sourceInput: {
          ...nativeBase.sourceInput,
          generationRequestHash: HASH_E,
        },
      },
      { ...base, selectedAssetResources: base.selectedAssetResources.slice(0, 1) },
      { ...base, seed: 7 },
      { ...base, authoringProfileRef: "worldkit://authoring-profile/new@1" },
      { ...base, acceptanceTargetRefs: ["worldkit://acceptance-target/new@1"] },
      {
        ...base,
        requiredEvidenceProfileRefs: ["worldkit://evidence-profile/new@1"],
      },
    ];
    for (const next of cases) {
      expect(firstInvalidatedSceneAuthoringGateV1(base, next)).toBe(
        "source-authoring",
      );
    }
  });

  it("returns none only for exact parsed equality and exposes no runtime-replay gate", () => {
    const reordered = {
      ...canonicalAttempt(),
      selectedAssetResources: [
        ...canonicalAttempt().selectedAssetResources,
      ].reverse(),
      acceptanceTargetRefs: [
        ...canonicalAttempt().acceptanceTargetRefs,
      ].reverse(),
    };
    expect(firstInvalidatedSceneAuthoringGateV1(canonicalAttempt(), reordered))
      .toBe("none");

    type HasRuntimeReplay = "runtime-replay" extends SceneAuthoringInvalidatedGateV1
      ? true
      : false;
    const hasRuntimeReplay: HasRuntimeReplay = false;
    expect(hasRuntimeReplay).toBe(false);
  });
});
