import { describe, expect, it, vi } from "vitest";
import {
  parseNativeSceneCheckResultV1,
  parseNativeSceneDiagnosticV1,
} from "@whitebox-world/runtime-contracts";

import type {
  BabylonNativeLockedAssetRequestV1,
  BabylonNativeLockedAssetResolverV1,
  BabylonNativeSceneBuildContextV1,
} from "./index.js";
import {
  createBabylonNativeHostRandomV1,
  defineBabylonNativeScene,
} from "./index.js";
import * as nativeRoot from "./index.js";
import * as nativeHost from "./host.js";

const VALID_DIAGNOSTIC = {
  kind: "native-scene-diagnostic",
  schemaVersion: 1,
  id: "native-warning-1",
  severity: "warning",
  stage: "build",
  code: "NATIVE_SCENE_VISUAL_ONLY_MESH",
  location: {
    kind: "source",
    sourcePath: "src/cloud-ridge.ts",
    lineNumber: 18,
    columnNumber: 3,
  },
  measurement: {
    kind: "count",
    actualCount: 4,
    maximumCount: 8,
  },
  message: "Four visual meshes are not registered as colliders.",
  repairHint: "Register only the intended low-detail collision proxies.",
} as const;

const TOOLING_ERROR = {
  ...VALID_DIAGNOSTIC,
  id: "native-tooling-error-1",
  severity: "error",
  stage: "tooling",
  code: "NATIVE_SCENE_TOOL_UNAVAILABLE",
  location: { kind: "none" },
  measurement: { kind: "none" },
} as const;

describe("defineBabylonNativeScene", () => {
  it("keeps Profile settlement Host-only", () => {
    expect("commitBabylonNativeProfileSettlementV1" in nativeRoot).toBe(false);
    expect("commitBabylonNativeProfileSettlementV1" in nativeHost).toBe(true);
  });

  it("returns an immutable detached definition with one build epoch", async () => {
    const build = vi.fn((_context: BabylonNativeSceneBuildContextV1) => undefined);
    const input = {
      kind: "babylon-native-scene-module",
      id: "cloud-ridge-native",
      build,
    } as const;

    const definition = defineBabylonNativeScene(input);

    expect(definition).not.toBe(input);
    expect(definition).toEqual(input);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(definition.build).toBe(build);
  });

  it.each([
    ["extra key", { kind: "babylon-native-scene-module", id: "scene", build() {}, legacy: true }],
    ["wrong kind", { kind: "scene", id: "scene", build() {} }],
    ["empty id", { kind: "babylon-native-scene-module", id: "", build() {} }],
    ["non-canonical id", { kind: "babylon-native-scene-module", id: " scene ", build() {} }],
    ["non-callable build", { kind: "babylon-native-scene-module", id: "scene", build: null }],
    ["custom prototype", Object.assign(Object.create({ legacy: true }), {
      kind: "babylon-native-scene-module",
      id: "scene",
      build() {},
    })],
  ])("rejects %s", (_label, input) => {
    expect(() => defineBabylonNativeScene(input as never)).toThrow(
      /BabylonNativeSceneModuleV1/,
    );
  });

  it("rejects accessors and symbol fields without invoking them", () => {
    const getter = vi.fn(() => "scene");
    const input = {
      kind: "babylon-native-scene-module",
      build() {},
    } as Record<PropertyKey, unknown>;
    Object.defineProperty(input, "id", { enumerable: true, get: getter });
    input[Symbol("legacy")] = true;

    expect(() => defineBabylonNativeScene(input as never)).toThrow(
      /BabylonNativeSceneModuleV1/,
    );
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("BabylonNativeHostRandomV1", () => {
  it("derives stable sequences from the Bootstrap seed", () => {
    const sequence = (seed: number) => {
      const random = createBabylonNativeHostRandomV1(seed);
      return [
        random.nextRatio(),
        random.range(-5, 5),
        random.pick(["north", "south", "east", "west"]),
        random.nextRatio(),
      ];
    };

    expect(sequence(7301)).toEqual(sequence(7301));
    expect(sequence(7301)).not.toEqual(sequence(7302));
  });

  it("preserves the LCG sequence used by existing Native visual modules", () => {
    const random = createBabylonNativeHostRandomV1(0x5eed_c10d);
    expect([
      random.nextRatio(),
      random.nextRatio(),
      random.nextRatio(),
    ]).toEqual([
      0.639433803036809,
      0.7870678172912449,
      0.2946446822024882,
    ]);
  });

  it("does not consult Math.random", () => {
    const spy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("ambient randomness used");
    });
    try {
      const random = createBabylonNativeHostRandomV1(11);
      expect(random.nextRatio()).toBeGreaterThanOrEqual(0);
      expect(random.nextRatio()).toBeLessThan(1);
      expect(random.range(2, 3)).toBeGreaterThanOrEqual(2);
      expect(random.pick(["a"])).toBe("a");
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects invalid seeds, ranges, and empty picks", () => {
    expect(() => createBabylonNativeHostRandomV1(0xffff_ffff)).not.toThrow();
    for (const seed of [0x1_0000_0000, -1, -0, 1.5]) {
      expect(() => createBabylonNativeHostRandomV1(seed)).toThrow(/seed/);
    }
    const random = createBabylonNativeHostRandomV1(1);
    expect(() => random.range(2, 2)).toThrow(/range/);
    expect(() => random.range(-0, 2)).toThrow(/range/);
    expect(() => random.range(0, Number.NaN)).toThrow(/range/);
    expect(() => random.pick([])).toThrow(/pick/);
  });
});

describe("Babylon Native locked assets", () => {
  it("exposes one exact-ref resolver boundary without location or provider inputs", () => {
    const resolver: BabylonNativeLockedAssetResolverV1 = Object.freeze({
      resolve: async ({ assetResourceRef }: BabylonNativeLockedAssetRequestV1) => Object.freeze({
        kind: "babylon-native-locked-asset",
        schemaVersion: 1,
        assetResourceRef,
        assetAdmissionReceiptRef: "worldkit://asset-admission-receipt/gate@1",
        assetAdmissionReceiptHash: `sha256:${"1".repeat(64)}`,
        assetPublicationReceiptRef: "worldkit://asset-publication-receipt/gate@1",
        assetPublicationReceiptHash: `sha256:${"2".repeat(64)}`,
        classBuildRecordRef: "worldkit://static-geometry-build-record/ridge@1",
        classBuildRecordHash: `sha256:${"3".repeat(64)}`,
        resourceManifestHash: `sha256:${"4".repeat(64)}`,
        artifactContentHash: `sha256:${"5".repeat(64)}`,
        bytes: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
        importMetadata: Object.freeze({
          kind: "static-geometry-glb",
          mediaType: "model/gltf-binary",
          format: "glb",
          gltfVersion: "2.0",
          localForwardAxis: "-Z",
          localUpAxis: "+Y",
          metersPerUnit: 1,
          pivot: "support-center",
        }),
      }),
    });

    expect(Object.keys(resolver)).toEqual(["resolve"]);
  });
});

describe("Babylon Native diagnostics", () => {
  it("parses detached, deeply frozen diagnostics and passed results", () => {
    const diagnostic = parseNativeSceneDiagnosticV1(VALID_DIAGNOSTIC);
    const result = parseNativeSceneCheckResultV1({
      kind: "native-scene-check-result",
      schemaVersion: 1,
      id: "cloud-ridge-check",
      checkedInput: {
        kind: "native-scene-module",
        sceneModuleRef: "worldkit://native-scene/cloud-ridge@1",
      },
      outcome: "passed",
      diagnostics: [VALID_DIAGNOSTIC],
    });

    expect(diagnostic).not.toBe(VALID_DIAGNOSTIC);
    expect(Object.isFrozen(diagnostic)).toBe(true);
    expect(Object.isFrozen(diagnostic.location)).toBe(true);
    expect(Object.isFrozen(diagnostic.measurement)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.checkedInput)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
    expect(Object.isFrozen(result.diagnostics[0])).toBe(true);
  });

  it.each([
    ["unknown stage", { ...VALID_DIAGNOSTIC, stage: "compile" }],
    ["unknown location", { ...VALID_DIAGNOSTIC, location: { kind: "mesh", id: "route" } }],
    ["absolute source path", { ...VALID_DIAGNOSTIC, location: { ...VALID_DIAGNOSTIC.location, sourcePath: "/tmp/module.ts" } }],
    ["Windows source path", { ...VALID_DIAGNOSTIC, location: { ...VALID_DIAGNOSTIC.location, sourcePath: "src\\module.ts" } }],
    ["dot source segment", { ...VALID_DIAGNOSTIC, location: { ...VALID_DIAGNOSTIC.location, sourcePath: "src/../module.ts" } }],
    ["unqualified measurement", { ...VALID_DIAGNOSTIC, measurement: { kind: "count", actual: 4, maximum: 8 } }],
    ["unknown field", { ...VALID_DIAGNOSTIC, details: {} }],
  ])("rejects a diagnostic with %s", (_label, input) => {
    expect(() => parseNativeSceneDiagnosticV1(input)).toThrow(
      /NativeSceneDiagnosticV1/,
    );
  });

  it.each([
    ["passed with error", "passed", [TOOLING_ERROR]],
    ["rejected with warnings only", "rejected", [VALID_DIAGNOSTIC]],
    ["tool-error without tooling error", "tool-error", [{ ...TOOLING_ERROR, stage: "build" }]],
  ])("rejects %s", (_label, outcome, diagnostics) => {
    expect(() => parseNativeSceneCheckResultV1({
      kind: "native-scene-check-result",
      schemaVersion: 1,
      id: "invalid-check",
      checkedInput: { kind: "unresolved-world" },
      outcome,
      diagnostics,
    })).toThrow(/NativeSceneCheckResultV1/);
  });

  it("rejects asset identity as the checked input", () => {
    expect(() => parseNativeSceneCheckResultV1({
      kind: "native-scene-check-result",
      schemaVersion: 1,
      id: "asset-check",
      checkedInput: {
        kind: "asset-resource",
        assetResourceRef: "worldkit://asset/static-ridge@1",
      },
      outcome: "passed",
      diagnostics: [],
    })).toThrow(/NativeSceneCheckResultV1/);
  });
});
