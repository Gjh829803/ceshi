import { describe, expect, it } from "vitest";

import {
  hashWorldReconstructionCaseV1,
  parseWorldReconstructionCaseV1,
} from "@whitebox-world/validation";

import {
  bindNativeBlockAuthoringManifestToCheckedLayoutV1,
  hashBabylonNativeBlockCheckedLayoutInventoryV1,
  hashNativeBlockAuthoringManifestV1,
  hashNativeBlockVisualResourceListV1,
  parseNativeBlockAuthoringManifestV1,
  parseNativeBlockVisualResourceListV1,
} from "./authoring-manifest.js";

const H = (digit: string) => `sha256:${digit.repeat(64)}` as const;

function manifestValue() {
  return {
    kind: "native-block-authoring",
    schemaVersion: 1,
    entryModulePath: "scene.ts",
    blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
    visualGroups: [{
      visualGroupId: "central-ascent-group",
      acceptanceTargetRef: "worldkit://acceptance-target/central-ascent@1",
      semanticClassId: "worldkit.native-block.group.central-ascent",
      identityColorHex: "#AEB8C4",
    }, {
      visualGroupId: "upper-t-junction-group",
      acceptanceTargetRef: "worldkit://acceptance-target/upper-t-junction@1",
      semanticClassId: "worldkit.native-block.group.upper-t-junction",
      identityColorHex: "#C9A96B",
    }],
  };
}

function reconstructionCaseValue() {
  return {
    kind: "world-reconstruction-case",
    schemaVersion: 1,
    id: "cloud-temple.case",
    sceneBriefRef: "artifact://case/cloud-temple/scene-brief.json",
    sceneBriefHash: H("a"),
    referenceInputs: [{
      inputRef: "artifact://case/cloud-temple/reference.png",
      contentHash: H("b"),
      mediaType: "image/png",
    }],
    evaluationProfileRef:
      "worldkit://reconstruction-evaluation-profile/cloud-temple@1",
    evaluationProfileHash: H("c"),
    formalCaptureIntentRef: "inputs/formal-world-capture-intent.json",
    formalCaptureIntentHash: H("d"),
    acceptanceTargetRefs: [
      "worldkit://acceptance-target/central-ascent@1",
      "worldkit://acceptance-target/upper-t-junction@1",
    ],
    requiredEvidenceProfileRefs: [
      "worldkit://evidence-profile/native-block-formal-capture@1",
    ],
    expected: {
      topology: {
        acceptanceTargetRef:
          "worldkit://acceptance-target/upper-t-junction@1",
        nodeIds: ["central-ascent", "upper-t-junction"],
        relations: [{
          fromNodeId: "central-ascent",
          relation: "connects-to",
          toNodeId: "upper-t-junction",
        }],
        layerIds: ["ground", "upper"],
      },
      semanticSilhouetteTargets: [{
        acceptanceTargetRef:
          "worldkit://acceptance-target/central-ascent@1",
        visualGroupId: "central-ascent-group",
        normalizedBounds: {
          minXBasisPoints: 100,
          minYBasisPoints: 200,
          maxXBasisPoints: 500,
          maxYBasisPoints: 800,
        },
        normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 },
        coverageBasisPoints: 2_400,
      }, {
        acceptanceTargetRef:
          "worldkit://acceptance-target/upper-t-junction@1",
        visualGroupId: "upper-t-junction-group",
        normalizedBounds: {
          minXBasisPoints: 600,
          minYBasisPoints: 100,
          maxXBasisPoints: 900,
          maxYBasisPoints: 400,
        },
        normalizedCenter: { xBasisPoints: 750, yBasisPoints: 250 },
        coverageBasisPoints: 900,
      }],
      openingComposition: {
        acceptanceTargetRef:
          "worldkit://acceptance-target/central-ascent@1",
        targetRefs: ["worldkit://composition-target/opening@1"],
        regions: [{
          targetRef: "worldkit://composition-target/opening@1",
          normalizedBounds: {
            minXBasisPoints: 100,
            minYBasisPoints: 200,
            maxXBasisPoints: 500,
            maxYBasisPoints: 800,
          },
        }],
        anchors: [{
          targetRef: "worldkit://composition-target/opening@1",
          normalizedCenter: { xBasisPoints: 300, yBasisPoints: 500 },
        }],
        orderedTargetRefs: ["worldkit://composition-target/opening@1"],
      },
      spawnSupport: {
        acceptanceTargetRef:
          "worldkit://acceptance-target/central-ascent@1",
        spawnMarkerId: "player-spawn",
        supportColliderId: "spawn-ground",
        expectedMedium: "ground",
        expectedPositionXYZMeters: { xMeters: 0, yMeters: 1, zMeters: 0 },
      },
      colliders: [{
        acceptanceTargetRef:
          "worldkit://acceptance-target/central-ascent@1",
        contributionId: "spawn-ground-contribution",
        colliderId: "spawn-ground",
        role: "ground",
        requiresOverlay: true,
      }],
      criticalTraversalChecks: [{
        acceptanceTargetRef:
          "worldkit://acceptance-target/upper-t-junction@1",
        id: "reach-junction",
        evidenceKind: "scripted-fixed-input",
        expectation: "pass",
        checkpointIds: ["junction", "spawn"],
        fixedInputSequence: [{
          actions: ["move-forward"],
          axes: { moveYRatio: 1 },
          ticks: 12,
        }],
      }],
      deterministicBuild: {
        acceptanceTargetRef:
          "worldkit://acceptance-target/central-ascent@1",
        requiresCandidateReplay: true,
        requiresWorldPackageIdentityAgreement: true,
        requiresBuildIdentityAgreement: true,
        requiresCaptureIdentityAgreement: true,
      },
    },
  } as const;
}

function checkedLayoutValue() {
  const centralBlock = {
    id: "central-ascent-block",
    shape: "full",
    paletteRole: "route",
    visualGroupId: "central-ascent-group",
    centerMetersXYZ: [0, 0.5, -1],
    rotationQuarterTurnsY: 0,
    sizeMetersXYZ: [1, 1, 1],
    minimumMetersXYZ: [-0.5, 0, -1.5],
    maximumMetersXYZ: [0.5, 1, -0.5],
    occupiedMicroCellKeys: ["0,0,-3"],
  } as const;
  const upperBlock = {
    id: "upper-t-junction-block",
    shape: "full",
    paletteRole: "structure",
    visualGroupId: "upper-t-junction-group",
    centerMetersXYZ: [0, 1.5, -2],
    rotationQuarterTurnsY: 0,
    sizeMetersXYZ: [1, 1, 1],
    minimumMetersXYZ: [-0.5, 1, -2.5],
    maximumMetersXYZ: [0.5, 2, -1.5],
    occupiedMicroCellKeys: ["0,2,-5"],
  } as const;
  return {
    kind: "babylon-native-block-checked-layout",
    schemaVersion: 1,
    layout: {
      blocks: [centralBlock, upperBlock],
      issues: [],
      exposedTopSurfaceCellKeys: ["0,1,-3", "0,3,-5"],
      boundarySegmentKeys: ["central", "upper"],
      structuralStepTransitionKeys: ["central>upper"],
      unsupportedBlockIds: [],
    },
    checkResult: {
      kind: "babylon-native-block-profile-check-result",
      schemaVersion: 1,
      id: "cloud-temple-check",
      outcome: "passed",
      diagnostics: [],
      metrics: {
        blockCount: 2,
        blockCountByShape: { full: 2, half: 0, quarter: 0, small: 0, step: 0 },
        blockCountByPaletteRole: {
          ground: 0,
          route: 1,
          structure: 1,
          hazard: 0,
          "water-like-visual": 0,
          "background-mass": 0,
        },
        occupiedMicroCellCount: 2,
        exposedTopSurfaceCellCount: 2,
        boundarySegmentCount: 2,
        structuralStepTransitionCount: 1,
        unsupportedBlockCount: 0,
        structuralRouteComponentCount: 1,
        visualGroupCount: 2,
      },
      visualGroups: [{
        id: "central-ascent-group",
        blockIds: ["central-ascent-block"],
        paletteRoles: ["route"],
        minimumMetersXYZ: [-0.5, 0, -1.5],
        maximumMetersXYZ: [0.5, 1, -0.5],
      }, {
        id: "upper-t-junction-group",
        blockIds: ["upper-t-junction-block"],
        paletteRoles: ["structure"],
        minimumMetersXYZ: [-0.5, 1, -2.5],
        maximumMetersXYZ: [0.5, 2, -1.5],
      }],
    },
    records: [],
  } as const;
}

function bindingInput() {
  const authoringManifest = parseNativeBlockAuthoringManifestV1(manifestValue());
  const checkedLayout = checkedLayoutValue();
  return {
    reconstructionCase: parseWorldReconstructionCaseV1(
      reconstructionCaseValue(),
    ),
    authoringManifest,
    authoringManifestHash: hashNativeBlockAuthoringManifestV1(authoringManifest),
    checkedLayout,
    checkedLayoutInventoryHash:
      hashBabylonNativeBlockCheckedLayoutInventoryV1(checkedLayout),
    contributionHash: H("a"),
    frozenContributionHash: H("a"),
  } as const;
}

function ordinaryCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type MutableCheckedLayout = {
  checkResult: {
    outcome: "passed" | "rejected";
    visualGroups: Array<{ id: string; blockIds: string[] }>;
  };
  layout: { blocks: Array<{ visualGroupId?: string }> };
};

describe("Native Block authoring manifest", () => {
  it("parses and freezes the one current authoring contract", () => {
    const parsed = parseNativeBlockAuthoringManifestV1(manifestValue());

    expect(parsed).toEqual(manifestValue());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.visualGroups)).toBe(true);
    expect(Object.isFrozen(parsed.visualGroups[0])).toBe(true);
    expect(hashNativeBlockAuthoringManifestV1(parsed)).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
  });

  it("parses, freezes and hashes the closed sorted visual resource list", () => {
    const parsed = parseNativeBlockVisualResourceListV1({
      kind: "native-visual-resource-list",
      schemaVersion: 1,
      resourceRefs: [
        "worldkit://static-geometry-asset/ancient-stone@1",
        "worldkit://static-geometry-asset/mist-card@1",
      ],
    });

    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.resourceRefs)).toBe(true);
    expect(hashNativeBlockVisualResourceListV1(parsed)).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
  });

  it("allows separate visual groups to share one semantic class", () => {
    const value = manifestValue();
    const parsed = parseNativeBlockAuthoringManifestV1({
      ...value,
      visualGroups: [
        value.visualGroups[0],
        {
          ...value.visualGroups[1],
          semanticClassId: value.visualGroups[0]!.semanticClassId,
        },
      ],
    });

    expect(parsed.visualGroups.map(({ semanticClassId }) => semanticClassId))
      .toEqual([
        "worldkit.native-block.group.central-ascent",
        "worldkit.native-block.group.central-ascent",
      ]);
  });

  it.each([
    ["extra top-level field", { ...manifestValue(), camera: { mode: "third-person" } }],
    ["missing entry module", {
      kind: "native-block-authoring",
      schemaVersion: 1,
      blockProfileRef: "worldkit://native-block-profile/whitebox.blocks@1",
      visualGroups: manifestValue().visualGroups,
    }],
    ["wrong Block Profile", { ...manifestValue(), blockProfileRef: "worldkit://native-scene-profile/whitebox.blocks@1" }],
    ["unsorted visual-group IDs", { ...manifestValue(), visualGroups: [...manifestValue().visualGroups].reverse() }],
    ["duplicate visual-group ID", { ...manifestValue(), visualGroups: [manifestValue().visualGroups[0], { ...manifestValue().visualGroups[1], visualGroupId: "central-ascent-group" }] }],
    ["duplicate acceptance target ref", { ...manifestValue(), visualGroups: [manifestValue().visualGroups[0], { ...manifestValue().visualGroups[1], acceptanceTargetRef: manifestValue().visualGroups[0]!.acceptanceTargetRef }] }],
    ["duplicate identity color", { ...manifestValue(), visualGroups: [manifestValue().visualGroups[0], { ...manifestValue().visualGroups[1], identityColorHex: manifestValue().visualGroups[0]!.identityColorHex }] }],
    ["lowercase identity color", { ...manifestValue(), visualGroups: [{ ...manifestValue().visualGroups[0], identityColorHex: "#aeb8c4" }, manifestValue().visualGroups[1]] }],
    ["controlled Subject semantic class", { ...manifestValue(), visualGroups: [{ ...manifestValue().visualGroups[0], semanticClassId: "subject.rider-mount" }, manifestValue().visualGroups[1]] }],
    ["nested Physics authority", { ...manifestValue(), visualGroups: [{ ...manifestValue().visualGroups[0], physicsBodyId: "forbidden" }, manifestValue().visualGroups[1]] }],
    ["nested Subject authority", { ...manifestValue(), visualGroups: [{ ...manifestValue().visualGroups[0], subjectDefinitionRef: "worldkit://subject/forbidden@1" }, manifestValue().visualGroups[1]] }],
  ])("rejects %s", (_label, value) => {
    expect(() => parseNativeBlockAuthoringManifestV1(value)).toThrowError(
      /WORLDKIT_NATIVE_BLOCK_AUTHORING_MANIFEST_INVALID/,
    );
  });

  it.each([
    ["extra field", { kind: "native-visual-resource-list", schemaVersion: 1, resourceRefs: [], runtimeRef: "forbidden" }],
    ["missing resource refs", { kind: "native-visual-resource-list", schemaVersion: 1 }],
    ["unsorted refs", { kind: "native-visual-resource-list", schemaVersion: 1, resourceRefs: ["worldkit://static-geometry-asset/z@1", "worldkit://static-geometry-asset/a@1"] }],
    ["duplicate refs", { kind: "native-visual-resource-list", schemaVersion: 1, resourceRefs: ["worldkit://static-geometry-asset/a@1", "worldkit://static-geometry-asset/a@1"] }],
    ["Subject authority ref", { kind: "native-visual-resource-list", schemaVersion: 1, resourceRefs: ["worldkit://subject-definition/humanoid.g-bot@2"] }],
    ["Camera authority ref", { kind: "native-visual-resource-list", schemaVersion: 1, resourceRefs: ["worldkit://camera-rig-profile/stable-follow@1"] }],
    ["Gameplay authority ref", { kind: "native-visual-resource-list", schemaVersion: 1, resourceRefs: ["worldkit://gameplay-bootstrap/cloud-temple@1"] }],
  ])("rejects visual resources with %s", (_label, value) => {
    expect(() => parseNativeBlockVisualResourceListV1(value)).toThrowError(
      /WORLDKIT_NATIVE_BLOCK_VISUAL_RESOURCES_INVALID/,
    );
  });

  it("rejects accessor, null-prototype and forged Array inputs without invoking them", () => {
    let accessorInvocationCount = 0;
    const accessor = manifestValue() as Record<string, unknown>;
    Object.defineProperty(accessor, "entryModulePath", {
      enumerable: true,
      get() {
        accessorInvocationCount += 1;
        return "scene.ts";
      },
    });
    const nullPrototype = Object.assign(Object.create(null), manifestValue());
    const forgedArray = Object.setPrototypeOf(
      ordinaryCopy(manifestValue().visualGroups),
      Object.create(Array.prototype),
    );

    expect(() => parseNativeBlockAuthoringManifestV1(accessor)).toThrowError();
    expect(accessorInvocationCount).toBe(0);
    expect(() => parseNativeBlockAuthoringManifestV1(nullPrototype)).toThrowError();
    expect(() => parseNativeBlockAuthoringManifestV1({
      ...manifestValue(),
      visualGroups: forgedArray,
    })).toThrowError();
  });
});

describe("Native Block authoring to checked Layout binding", () => {
  it("binds every Case target to exactly one checked visual group without Mesh discovery", () => {
    const result = bindNativeBlockAuthoringManifestToCheckedLayoutV1(bindingInput());

    expect(result).toMatchObject({
      kind: "native-block-authoring-layout-binding",
      schemaVersion: 1,
      caseHash: hashWorldReconstructionCaseV1(
        bindingInput().reconstructionCase,
      ),
      authoringManifestHash: bindingInput().authoringManifestHash,
      checkedLayoutInventoryHash: bindingInput().checkedLayoutInventoryHash,
      contributionHash: H("a"),
    });
    expect(result.visualGroups.map((row) => row.acceptanceTargetRef)).toEqual(
      bindingInput().reconstructionCase.acceptanceTargetRefs,
    );
    expect(result.visualGroups.map((row) => row.visualGroupId)).toEqual([
      "central-ascent-group",
      "upper-t-junction-group",
    ]);
    expect(result.visualGroups[0]).toMatchObject({
      blockIds: ["central-ascent-block"],
      paletteRoles: ["route"],
      minimumMetersXYZ: [-0.5, 0, -1.5],
      maximumMetersXYZ: [0.5, 1, -0.5],
    });
    expect(JSON.stringify(result)).not.toMatch(/mesh|tag|name/i);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.visualGroups)).toBe(true);
  });

  it("rejects a Manifest that swaps Case-owned target-to-group mappings", () => {
    const input = bindingInput();
    const source = manifestValue();
    const authoringManifest = parseNativeBlockAuthoringManifestV1({
      ...source,
      visualGroups: [{
        ...source.visualGroups[0],
        acceptanceTargetRef:
          "worldkit://acceptance-target/upper-t-junction@1",
      }, {
        ...source.visualGroups[1],
        acceptanceTargetRef:
          "worldkit://acceptance-target/central-ascent@1",
      }],
    });

    expect(() => bindNativeBlockAuthoringManifestToCheckedLayoutV1({
      ...input,
      authoringManifest,
      authoringManifestHash:
        hashNativeBlockAuthoringManifestV1(authoringManifest),
    })).toThrowError(/WORLDKIT_NATIVE_BLOCK_AUTHORING_LAYOUT_BINDING_INVALID/);
  });

  it("binds only semantic silhouette targets, not unrelated Case acceptance targets", () => {
    const source = reconstructionCaseValue();
    const reconstructionCase = parseWorldReconstructionCaseV1({
      ...source,
      acceptanceTargetRefs: [
        source.acceptanceTargetRefs[0],
        "worldkit://acceptance-target/runtime-support@1",
        source.acceptanceTargetRefs[1],
      ],
      expected: {
        ...source.expected,
        spawnSupport: {
          ...source.expected.spawnSupport,
          acceptanceTargetRef:
            "worldkit://acceptance-target/runtime-support@1",
        },
      },
    });

    expect(bindNativeBlockAuthoringManifestToCheckedLayoutV1({
      ...bindingInput(),
      reconstructionCase,
    }).visualGroups.map(({ acceptanceTargetRef }) => acceptanceTargetRef))
      .toEqual(source.acceptanceTargetRefs);
  });

  it("binds a passed checked Layout with advisory Profile warnings", () => {
    const input = bindingInput();
    const checkedLayout = ordinaryCopy(input.checkedLayout) as unknown as {
      layout: { unsupportedBlockIds: string[] };
      checkResult: {
        diagnostics: unknown[];
        metrics: { unsupportedBlockCount: number };
      };
    };
    checkedLayout.layout.unsupportedBlockIds = ["upper-t-junction-block"];
    checkedLayout.checkResult.metrics.unsupportedBlockCount = 1;
    checkedLayout.checkResult.diagnostics = [{
      kind: "babylon-native-block-profile-diagnostic",
      schemaVersion: 1,
      id: "native-block-diagnostic-0000",
      severity: "warning",
      code: "WORLDKIT_NATIVE_BLOCK_STRUCTURAL_SUPPORT_MISSING",
      location: {
        kind: "block",
        blockId: "upper-t-junction-block",
      },
      message: "The lintel is explicit floating visual intent.",
      repairHint: "Add vertical support when the block is not an overhang.",
    }];
    const typedCheckedLayout = checkedLayout as unknown as
      typeof input.checkedLayout;

    expect(bindNativeBlockAuthoringManifestToCheckedLayoutV1({
      ...input,
      checkedLayout: typedCheckedLayout,
      checkedLayoutInventoryHash:
        hashBabylonNativeBlockCheckedLayoutInventoryV1(typedCheckedLayout),
    }).visualGroups).toHaveLength(2);
  });

  it("rejects a passed checked Layout carrying an error diagnostic", () => {
    const input = bindingInput();
    const checkedLayout = ordinaryCopy(input.checkedLayout) as unknown as {
      checkResult: { diagnostics: unknown[] };
    };
    checkedLayout.checkResult.diagnostics = [{
      kind: "babylon-native-block-profile-diagnostic",
      schemaVersion: 1,
      id: "native-block-diagnostic-0000",
      severity: "error",
      code: "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP",
      location: { kind: "block", blockId: "upper-t-junction-block" },
      message: "Blocks overlap.",
      repairHint: "Separate the occupied volumes.",
    }];

    expect(() => hashBabylonNativeBlockCheckedLayoutInventoryV1(
      checkedLayout as unknown as typeof input.checkedLayout,
    )).toThrowError(/WORLDKIT_NATIVE_BLOCK_CHECKED_LAYOUT_INVENTORY_INVALID/);
  });

  it.each([
    ["missing target", () => ({ ...bindingInput(), reconstructionCase: { ...reconstructionCaseValue(), acceptanceTargetRefs: [reconstructionCaseValue().acceptanceTargetRefs[0]] } })],
    ["extra target", () => ({ ...bindingInput(), reconstructionCase: { ...reconstructionCaseValue(), acceptanceTargetRefs: [...reconstructionCaseValue().acceptanceTargetRefs, "worldkit://acceptance-target/unused@1"] } })],
    ["undeclared Layout group", () => {
      const input = bindingInput();
      const checkedLayout = ordinaryCopy(input.checkedLayout) as unknown as
        MutableCheckedLayout;
      checkedLayout.checkResult.visualGroups[1]!.id = "undeclared-group";
      checkedLayout.layout.blocks[1]!.visualGroupId = "undeclared-group";
      const typedCheckedLayout = checkedLayout as unknown as
        typeof input.checkedLayout;
      return { ...input, checkedLayout: typedCheckedLayout, checkedLayoutInventoryHash: hashBabylonNativeBlockCheckedLayoutInventoryV1(typedCheckedLayout) };
    }],
    ["duplicate Case target", () => ({ ...bindingInput(), reconstructionCase: { ...reconstructionCaseValue(), acceptanceTargetRefs: [reconstructionCaseValue().acceptanceTargetRefs[0], reconstructionCaseValue().acceptanceTargetRefs[0]] } })],
    ["stale authoring hash", () => ({ ...bindingInput(), authoringManifestHash: H("b") })],
    ["stale Layout hash", () => ({ ...bindingInput(), checkedLayoutInventoryHash: H("b") })],
    ["stale Contribution hash", () => ({ ...bindingInput(), frozenContributionHash: H("b") })],
  ])("rejects %s", (_label, createInput) => {
    expect(() => bindNativeBlockAuthoringManifestToCheckedLayoutV1(
      createInput() as ReturnType<typeof bindingInput>,
    )).toThrowError(/WORLDKIT_NATIVE_BLOCK_AUTHORING_LAYOUT_BINDING_INVALID/);
  });

  it("rejects a rejected or internally stale checked Layout", () => {
    const input = bindingInput();
    const rejected = ordinaryCopy(input.checkedLayout) as unknown as
      MutableCheckedLayout;
    rejected.checkResult.outcome = "rejected";
    expect(() => bindNativeBlockAuthoringManifestToCheckedLayoutV1({
      ...input,
      checkedLayout: rejected as unknown as typeof input.checkedLayout,
      checkedLayoutInventoryHash: input.checkedLayoutInventoryHash,
    })).toThrowError(/WORLDKIT_NATIVE_BLOCK_AUTHORING_LAYOUT_BINDING_INVALID/);

    const mismatched = ordinaryCopy(input.checkedLayout) as unknown as
      MutableCheckedLayout;
    mismatched.checkResult.visualGroups[0]!.blockIds = ["wrong-block"];
    expect(() => bindNativeBlockAuthoringManifestToCheckedLayoutV1({
      ...input,
      checkedLayout: mismatched as unknown as typeof input.checkedLayout,
      checkedLayoutInventoryHash: input.checkedLayoutInventoryHash,
    })).toThrowError(/WORLDKIT_NATIVE_BLOCK_AUTHORING_LAYOUT_BINDING_INVALID/);
  });
});
