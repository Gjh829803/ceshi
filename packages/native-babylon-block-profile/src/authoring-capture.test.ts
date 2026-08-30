import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { describe, expect, it } from "vitest";

import type {
  BabylonNativeBlockProfileCheckResultV1,
  BabylonNativeBlockVisualGroupInventoryV1,
} from "./check.js";
import type { BabylonNativeBlockLayoutV1 } from "./layout.js";

interface AuthoringCaptureModule {
  createBabylonNativeBlockAuthoringCaptureV1(input: Readonly<{
    scene: Scene;
    buildEpochId: string;
    layout: BabylonNativeBlockLayoutV1;
    checkResult: BabylonNativeBlockProfileCheckResultV1;
    widthPixels: number;
    heightPixels: number;
    opening: Readonly<{
      positionMetersXYZ: readonly [number, number, number];
      targetMetersXYZ: readonly [number, number, number];
      fovDegrees: number;
    }>;
  }>): Readonly<{
    kind: "babylon-native-block-authoring-capture";
    schemaVersion: 1;
    scope: "build-epoch-local";
    buildEpochId: string;
    views: readonly Readonly<{
      id: "opening" | "top-down" | "side";
      projection: "perspective" | "orthographic";
      widthPixels: number;
      heightPixels: number;
      positionMetersXYZ: readonly [number, number, number];
      targetMetersXYZ: readonly [number, number, number];
      viewMatrix: readonly number[];
      projectionMatrix: readonly number[];
      visualGroupRegions: readonly Readonly<{
        visualGroupId: string;
        minimumNormalizedXY: readonly [number, number];
        maximumNormalizedXY: readonly [number, number];
      }>[];
    }>[];
  }>;
}

async function loadAuthoringCapture(): Promise<AuthoringCaptureModule> {
  const modulePath = ["./", "authoring-capture.js"].join("");
  return import(modulePath) as Promise<AuthoringCaptureModule>;
}

const gateGroup = Object.freeze({
  id: "ridge-gate",
  blockIds: Object.freeze(["gate-lower", "gate-upper"]),
  paletteRoles: Object.freeze(["structure"] as const),
  minimumMetersXYZ: Object.freeze([1, 0, -0.5] as const),
  maximumMetersXYZ: Object.freeze([2, 2, 0.5] as const),
} satisfies BabylonNativeBlockVisualGroupInventoryV1);

const routeGroup = Object.freeze({
  id: "route-spine",
  blockIds: Object.freeze(["route-east", "route-west"]),
  paletteRoles: Object.freeze(["route"] as const),
  minimumMetersXYZ: Object.freeze([-2, 0, -0.5] as const),
  maximumMetersXYZ: Object.freeze([0, 1, 0.5] as const),
} satisfies BabylonNativeBlockVisualGroupInventoryV1);

function layoutFixture(reverse = false): BabylonNativeBlockLayoutV1 {
  const blocks: BabylonNativeBlockLayoutV1["blocks"] = [
    Object.freeze({
      id: "gate-lower",
      shape: "full",
      paletteRole: "structure",
      visualGroupId: "ridge-gate",
      centerMetersXYZ: Object.freeze([1.5, 0.5, 0] as const),
      rotationQuarterTurnsY: 0,
      sizeMetersXYZ: Object.freeze([1, 1, 1] as const),
      minimumMetersXYZ: Object.freeze([1, 0, -0.5] as const),
      maximumMetersXYZ: Object.freeze([2, 1, 0.5] as const),
      occupiedMicroCellKeys: Object.freeze([]),
    }),
    Object.freeze({
      id: "gate-upper",
      shape: "full",
      paletteRole: "structure",
      visualGroupId: "ridge-gate",
      centerMetersXYZ: Object.freeze([1.5, 1.5, 0] as const),
      rotationQuarterTurnsY: 0,
      sizeMetersXYZ: Object.freeze([1, 1, 1] as const),
      minimumMetersXYZ: Object.freeze([1, 1, -0.5] as const),
      maximumMetersXYZ: Object.freeze([2, 2, 0.5] as const),
      occupiedMicroCellKeys: Object.freeze([]),
    }),
    Object.freeze({
      id: "route-east",
      shape: "full",
      paletteRole: "route",
      visualGroupId: "route-spine",
      centerMetersXYZ: Object.freeze([-0.5, 0.5, 0] as const),
      rotationQuarterTurnsY: 0,
      sizeMetersXYZ: Object.freeze([1, 1, 1] as const),
      minimumMetersXYZ: Object.freeze([-1, 0, -0.5] as const),
      maximumMetersXYZ: Object.freeze([0, 1, 0.5] as const),
      occupiedMicroCellKeys: Object.freeze([]),
    }),
    Object.freeze({
      id: "route-west",
      shape: "full",
      paletteRole: "route",
      visualGroupId: "route-spine",
      centerMetersXYZ: Object.freeze([-1.5, 0.5, 0] as const),
      rotationQuarterTurnsY: 0,
      sizeMetersXYZ: Object.freeze([1, 1, 1] as const),
      minimumMetersXYZ: Object.freeze([-2, 0, -0.5] as const),
      maximumMetersXYZ: Object.freeze([-1, 1, 0.5] as const),
      occupiedMicroCellKeys: Object.freeze([]),
    }),
  ];
  return Object.freeze({
    blocks: Object.freeze(reverse ? [...blocks].reverse() : blocks),
    issues: Object.freeze([]),
    exposedTopSurfaceCellKeys: Object.freeze([]),
    boundarySegmentKeys: Object.freeze([]),
    structuralHalfMeterTransitionKeys: Object.freeze([]),
    unsupportedBlockIds: Object.freeze([]),
  });
}

function checkResult(
  outcome: "passed" | "rejected" = "passed",
): BabylonNativeBlockProfileCheckResultV1 {
  return Object.freeze({
    kind: "babylon-native-block-profile-check-result",
    schemaVersion: 1,
    id: "capture-fixture.whitebox-blocks-check",
    outcome,
    diagnostics: Object.freeze([]),
    metrics: Object.freeze({
      blockCount: 4,
      blockCountByShape: Object.freeze({
        full: 4,
        half: 0,
        quarter: 0,
        small: 0,
      }),
      blockCountByPaletteRole: Object.freeze({
        ground: 0,
        route: 2,
        structure: 2,
        hazard: 0,
        "water-like-visual": 0,
        "background-mass": 0,
      }),
      occupiedMicroCellCount: 0,
      exposedTopSurfaceCellCount: 0,
      boundarySegmentCount: 0,
      structuralHalfMeterTransitionCount: 0,
      unsupportedBlockCount: 0,
      structuralRouteComponentCount: 1,
      visualGroupCount: 2,
    }),
    visualGroups: Object.freeze([gateGroup, routeGroup]),
  });
}

function withScene(run: (scene: Scene) => void): void {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    run(scene);
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

describe("Babylon Native block Build-Epoch authoring capture", () => {
  it("publishes stable Opening, top-down, and side descriptors without creating a Camera", async () => {
    const { createBabylonNativeBlockAuthoringCaptureV1 } =
      await loadAuthoringCapture();

    withScene((scene) => {
      const activeCameraBefore = scene.activeCamera;
      const input = {
        scene,
        buildEpochId: "candidate-epoch-capture",
        layout: layoutFixture(),
        checkResult: checkResult(),
        widthPixels: 800,
        heightPixels: 600,
        opening: Object.freeze({
          positionMetersXYZ: Object.freeze([4, 3, 6] as const),
          targetMetersXYZ: Object.freeze([0, 0.75, 0] as const),
          fovDegrees: 60,
        }),
      } as const;

      const first = createBabylonNativeBlockAuthoringCaptureV1(input);
      const reversed = createBabylonNativeBlockAuthoringCaptureV1({
        ...input,
        layout: layoutFixture(true),
      });

      expect(first).toEqual(reversed);
      expect(first).toMatchObject({
        kind: "babylon-native-block-authoring-capture",
        schemaVersion: 1,
        scope: "build-epoch-local",
        buildEpochId: "candidate-epoch-capture",
      });
      expect(first.views.map(({ id, projection }) => [id, projection]))
        .toEqual([
          ["opening", "perspective"],
          ["top-down", "orthographic"],
          ["side", "orthographic"],
        ]);
      const opening = first.views[0]!;
      const top = first.views[1]!;
      const side = first.views[2]!;
      expect(opening.projectionMatrix[0]).toBeCloseTo(1.299038105677, 5);
      expect(opening.projectionMatrix[5]).toBeCloseTo(1.732050807569, 5);
      expect(top.positionMetersXYZ[0]).toBe(0);
      expect(top.positionMetersXYZ[1]).toBeCloseTo(
        1 + Math.sqrt(21) * 2,
        10,
      );
      expect(top.positionMetersXYZ[2]).toBe(0);
      expect(top.targetMetersXYZ).toEqual([0, 1, 0]);
      expect(top.projectionMatrix[0]).toBeCloseTo(0.4, 5);
      expect(top.projectionMatrix[5]).toBeCloseTo(8 / 15, 5);
      expect(side.positionMetersXYZ[2]).toBeCloseTo(Math.sqrt(21) * 2, 10);
      expect(first.views.every(({ viewMatrix, projectionMatrix }) =>
        viewMatrix.length === 16 &&
        projectionMatrix.length === 16 &&
        [...viewMatrix, ...projectionMatrix].every(Number.isFinite),
      )).toBe(true);
      expect(scene.cameras).toEqual([]);
      expect(scene.activeCamera).toBe(activeCameraBefore);
      expect(JSON.stringify(first)).not.toMatch(
        /worldPackage|worldBuildIdentity|receipt|browserCapture|contributionHash/i,
      );
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first.views)).toBe(true);
    });
  });

  it("projects every reference semantic visual group into bounded normalized regions", async () => {
    const { createBabylonNativeBlockAuthoringCaptureV1 } =
      await loadAuthoringCapture();

    withScene((scene) => {
      const capture = createBabylonNativeBlockAuthoringCaptureV1({
        scene,
        buildEpochId: "candidate-epoch-regions",
        layout: layoutFixture(),
        checkResult: checkResult(),
        widthPixels: 1024,
        heightPixels: 768,
        opening: Object.freeze({
          positionMetersXYZ: Object.freeze([4, 3, 6] as const),
          targetMetersXYZ: Object.freeze([0, 0.75, 0] as const),
          fovDegrees: 55,
        }),
      });

      for (const view of capture.views) {
        expect(view.visualGroupRegions.map(({ visualGroupId }) => visualGroupId))
          .toEqual(["ridge-gate", "route-spine"]);
        for (const region of view.visualGroupRegions) {
          expect([
            ...region.minimumNormalizedXY,
            ...region.maximumNormalizedXY,
          ].every((value) => value >= 0 && value <= 1)).toBe(true);
          expect(region.minimumNormalizedXY[0])
            .toBeLessThan(region.maximumNormalizedXY[0]);
          expect(region.minimumNormalizedXY[1])
            .toBeLessThan(region.maximumNormalizedXY[1]);
        }
      }

      const top = capture.views.find(({ id }) => id === "top-down")!;
      const gate = top.visualGroupRegions.find(({ visualGroupId }) =>
        visualGroupId === "ridge-gate")!;
      const route = top.visualGroupRegions.find(({ visualGroupId }) =>
        visualGroupId === "route-spine")!;
      const gateCenterX = (gate.minimumNormalizedXY[0] +
        gate.maximumNormalizedXY[0]) / 2;
      const routeCenterX = (route.minimumNormalizedXY[0] +
        route.maximumNormalizedXY[0]) / 2;
      expect(gateCenterX).toBeGreaterThan(routeCenterX);
    });
  });

  it("fails closed for invalid capture dimensions or a visual group outside the checked layout", async () => {
    const { createBabylonNativeBlockAuthoringCaptureV1 } =
      await loadAuthoringCapture();

    withScene((scene) => {
      expect(() => createBabylonNativeBlockAuthoringCaptureV1({
        scene,
        buildEpochId: "candidate-epoch-invalid",
        layout: layoutFixture(),
        checkResult: checkResult(),
        widthPixels: 0,
        heightPixels: 600,
        opening: Object.freeze({
          positionMetersXYZ: Object.freeze([4, 3, 6] as const),
          targetMetersXYZ: Object.freeze([0, 0.75, 0] as const),
          fovDegrees: 60,
        }),
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_AUTHORING_CAPTURE_INVALID/);

      expect(() => createBabylonNativeBlockAuthoringCaptureV1({
        scene,
        buildEpochId: "candidate-epoch-missing-group",
        layout: layoutFixture(),
        checkResult: Object.freeze({
          ...checkResult(),
          visualGroups: Object.freeze([gateGroup]),
        }),
        widthPixels: 800,
        heightPixels: 600,
        opening: Object.freeze({
          positionMetersXYZ: Object.freeze([4, 3, 6] as const),
          targetMetersXYZ: Object.freeze([0, 0.75, 0] as const),
          fovDegrees: 60,
        }),
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_AUTHORING_CAPTURE_GROUP_MISMATCH/);

      expect(() => createBabylonNativeBlockAuthoringCaptureV1({
        scene,
        buildEpochId: "candidate-epoch-rejected-check",
        layout: layoutFixture(),
        checkResult: checkResult("rejected"),
        widthPixels: 800,
        heightPixels: 600,
        opening: Object.freeze({
          positionMetersXYZ: Object.freeze([4, 3, 6] as const),
          targetMetersXYZ: Object.freeze([0, 0.75, 0] as const),
          fovDegrees: 60,
        }),
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_AUTHORING_CAPTURE_INVALID/);
      expect(scene.cameras).toEqual([]);
    });
  });
});
