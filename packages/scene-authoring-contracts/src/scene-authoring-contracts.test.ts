import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { describe, expect, it, vi } from "vitest";

import {
  firstInvalidatedSceneAuthoringGateV1,
  hashSceneAuthoringAttemptResultV1,
  hashSceneAuthoringAttemptV1,
  hashSceneAuthoringRouteDecisionV1,
  parseSceneAuthoringAttemptResultV1,
  parseSceneAuthoringAttemptV1,
  parseSceneAuthoringRouteDecisionV1,
  sceneAuthoringAttemptCanonicalBytesV1,
  sceneAuthoringAttemptResultCanonicalBytesV1,
  sceneAuthoringRouteDecisionCanonicalBytesV1,
  type SceneAuthoringAttemptResultV1,
  type SceneAuthoringAttemptV1,
  type SceneAuthoringInvalidatedGateV1,
  type SceneAuthoringRouteDecisionV1,
} from "./scene-authoring-contracts.js";

const HASH_A = `sha256:${"1".repeat(64)}` as Sha256HashV1;
const HASH_B = `sha256:${"2".repeat(64)}` as Sha256HashV1;
const HASH_C = `sha256:${"3".repeat(64)}` as Sha256HashV1;
const HASH_D = `sha256:${"4".repeat(64)}` as Sha256HashV1;
const HASH_E = `sha256:${"5".repeat(64)}` as Sha256HashV1;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;

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
      reasonCodes: ["canonical-default", "requires-canonical-route"],
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
      moduleGenerationInputRef:
        "worldkit://native-module-generation-input/ridge@1",
      moduleGenerationInputHash: HASH_D,
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

describe("SceneAuthoringRouteDecisionV1", () => {
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
          reasonCodes: ["canonical-default", "canonical-default"],
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
          moduleGenerationInputHash: HASH_E,
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
