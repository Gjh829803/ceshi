import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import {
  babylonNativeBlockLiveVisualHandleMeshV1,
  type BabylonNativeBlockLiveVisualHandleV1,
} from "@whitebox-world/native-babylon-block-profile/host";
import type {
  BabylonNativeBlockMaterializerVisualGroupV1,
  FormalArtifactViewRequestV1,
  FormalSemanticCaptureTargetBindingV1,
} from "@whitebox-world/runtime-contracts";
import { afterEach, describe, expect, it } from "vitest";

function liveBlockHandle(
  blockId: string,
  mesh: Mesh,
): BabylonNativeBlockLiveVisualHandleV1 {
  return Object.freeze({
    kind: "independent-mesh" as const,
    blockId,
    runtimeEntityId: `native-block:${blockId}`,
    semanticCaptureClassId: `worldkit.native-block.group.${blockId}`,
    mesh,
  });
}

import {
  fitOrthographicBoundsToWorldExtentsV1,
  orientCameraAtExactPose,
} from "./formal-world-camera.js";
import {
  measureFormalWorldCaptureViewV1,
  type FormalWorldCaptureMeasurementInputV1,
} from "./formal-world-capture-measurement.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;

const alphaGroup = Object.freeze({
  frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "alpha-group",
  acceptanceTargetRef: "worldkit://acceptance-target/alpha@1",
  semanticClassId: "worldkit.native-block.group.alpha-group",
  identityColorHex: "#112233",
  blockIds: Object.freeze(["alpha-block"]),
  paletteRoles: Object.freeze(["route"]),
  minimumMetersXYZ: Object.freeze([-2, -2, 2]),
  maximumMetersXYZ: Object.freeze([0, 2, 4]),
} satisfies BabylonNativeBlockMaterializerVisualGroupV1);

const zetaGroup = Object.freeze({
  frontDirectionWorldXZ: [0, -1] as const, visualGroupId: "zeta-group",
  acceptanceTargetRef: "worldkit://acceptance-target/zeta@1",
  semanticClassId: "worldkit.native-block.group.zeta-group",
  identityColorHex: "#445566",
  blockIds: Object.freeze(["zeta-block"]),
  paletteRoles: Object.freeze(["structure"]),
  minimumMetersXYZ: Object.freeze([2, -1, -4]),
  maximumMetersXYZ: Object.freeze([4, 1, -2]),
} satisfies BabylonNativeBlockMaterializerVisualGroupV1);

const bindings = Object.freeze([
  Object.freeze({
    acceptanceTargetRef: alphaGroup.acceptanceTargetRef,
    compositionTargetRef: "worldkit://composition-target/alpha@1",
    topologyNodeId: "alpha-node",
    semanticLayerId: "route-layer",
    blockVisualGroupId: alphaGroup.visualGroupId,
    semanticClassId: alphaGroup.semanticClassId,
    identityColor: alphaGroup.identityColorHex,
    projectedBoundsSource: "checked-layout-visual-group",
    viewRequirements: Object.freeze([
      { viewId: "opening", mode: "reference-projection-required" },
      { viewId: "world-side", mode: "presence-required" },
      { viewId: "world-top-down", mode: "presence-required" },
    ] as const),
    authoringManifestHash: HASH_A,
    layoutInventoryHash: HASH_B,
    contributionHash: HASH_C,
  }),
  Object.freeze({
    acceptanceTargetRef: zetaGroup.acceptanceTargetRef,
    compositionTargetRef: "worldkit://composition-target/zeta@1",
    topologyNodeId: "zeta-node",
    semanticLayerId: "structure-layer",
    blockVisualGroupId: zetaGroup.visualGroupId,
    semanticClassId: zetaGroup.semanticClassId,
    identityColor: zetaGroup.identityColorHex,
    projectedBoundsSource: "checked-layout-visual-group",
    viewRequirements: Object.freeze([
      { viewId: "opening", mode: "reference-projection-required" },
      { viewId: "world-side", mode: "presence-required" },
      { viewId: "world-top-down", mode: "presence-required" },
    ] as const),
    authoringManifestHash: HASH_A,
    layoutInventoryHash: HASH_B,
    contributionHash: HASH_C,
  }),
] satisfies readonly FormalSemanticCaptureTargetBindingV1[]);

const orthographicView = Object.freeze({
  kind: "formal-artifact-view-request",
  schemaVersion: 1,
  viewId: "world-top-down",
  projection: "orthographic",
  widthPixels: 1_024,
  heightPixels: 1_024,
  devicePixelRatio: 1,
  worldBoundsMeters: {
    minimumMetersXYZ: [-8, -8, -8],
    maximumMetersXYZ: [8, 8, 8],
  },
  cameraPositionMetersXYZ: [0, 0, -16],
  targetMetersXYZ: [0, 0, 0],
} satisfies FormalArtifactViewRequestV1);

const openingView = Object.freeze({
  kind: "formal-artifact-view-request",
  schemaVersion: 1,
  viewId: "opening",
  projection: "perspective",
  widthPixels: 1_024,
  heightPixels: 1_024,
  devicePixelRatio: 1,
} satisfies FormalArtifactViewRequestV1);

const worldSideView = Object.freeze({
  kind: "formal-artifact-view-request",
  schemaVersion: 1,
  viewId: "world-side",
  projection: "orthographic",
  widthPixels: 1_024,
  heightPixels: 1_024,
  devicePixelRatio: 1,
  worldBoundsMeters: {
    minimumMetersXYZ: [-8, -8, -8],
    maximumMetersXYZ: [8, 8, 8],
  },
  cameraPositionMetersXYZ: [16, 0, 0],
  targetMetersXYZ: [0, 0, 0],
} satisfies FormalArtifactViewRequestV1);

function isWorldArtifactView(
  view: FormalArtifactViewRequestV1,
): view is Extract<FormalArtifactViewRequestV1, { viewId: "world-side" | "world-top-down" }> {
  return view.viewId === "world-side" || view.viewId === "world-top-down";
}

function applyFittedWorldOrtho(
  camera: FreeCamera,
  view: Extract<FormalArtifactViewRequestV1, { viewId: "world-side" | "world-top-down" }>,
): void {
  const fitted = fitOrthographicBoundsToWorldExtentsV1(
    view.worldBoundsMeters,
    camera.getViewMatrix(true),
    view.widthPixels / view.heightPixels,
  );
  camera.orthoLeft = fitted.orthoLeft;
  camera.orthoRight = fitted.orthoRight;
  camera.orthoBottom = fitted.orthoBottom;
  camera.orthoTop = fitted.orthoTop;
}

function createFixture(options: Readonly<{
  groups?: readonly BabylonNativeBlockMaterializerVisualGroupV1[];
  view?: FormalArtifactViewRequestV1;
  worldCamera?: "default" | "exact-pose" | "set-target-only";
  worldOrtho?: "default" | "aspect-fit";
}> = {}) {
  const view = options.view ?? orthographicView;
  const engine = new NullEngine({
    renderWidth: view.widthPixels,
    renderHeight: view.heightPixels,
    textureSize: 512,
    deterministicLockstep: true,
    lockstepMaxSteps: 4,
  });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera(
    "sdk-camera",
    new Vector3(0, 0, -16),
    scene,
  );
  camera.minZ = 0.125;
  camera.maxZ = 128;
  camera.setTarget(Vector3.Zero());
  camera.mode = FreeCamera.ORTHOGRAPHIC_CAMERA;
  camera.orthoLeft = -8;
  camera.orthoRight = 8;
  camera.orthoTop = 8;
  camera.orthoBottom = -8;
  if (isWorldArtifactView(view) && options.worldCamera === "exact-pose") {
    orientCameraAtExactPose(
      camera,
      new Vector3(...view.cameraPositionMetersXYZ),
      new Vector3(...view.targetMetersXYZ),
      scene.useRightHandedSystem,
    );
  } else if (isWorldArtifactView(view) && options.worldCamera === "set-target-only") {
    camera.position.copyFromFloats(...view.cameraPositionMetersXYZ);
    camera.setTarget(new Vector3(...view.targetMetersXYZ));
  }
  if (isWorldArtifactView(view) && options.worldOrtho === "aspect-fit") {
    applyFittedWorldOrtho(camera, view);
  }
  scene.activeCamera = camera;

  const alphaMesh = MeshBuilder.CreateBox("untrusted-alpha-name", {}, scene);
  const zetaMesh = MeshBuilder.CreateBox("untrusted-zeta-name", {}, scene);
  alphaMesh.metadata = new Proxy({}, {
    get() {
      throw new Error("mesh metadata must not be read");
    },
  });
  zetaMesh.metadata = new Proxy({}, {
    get() {
      throw new Error("mesh metadata must not be read");
    },
  });
  MeshBuilder.CreateBox("alpha-group", {}, scene);

  const input: FormalWorldCaptureMeasurementInputV1 = {
    view,
    camera,
    materializerMetadata: {
      authoringManifestHash: HASH_A,
      checkedLayoutInventoryHash: HASH_B,
      contributionHash: HASH_C,
      visualGroups: options.groups ?? [alphaGroup, zetaGroup],
    },
    semanticCaptureMap: { bindings },
    liveHandleRegistry: {
      visualGroups: [
        {
          visualGroupId: "zeta-group",
          blockHandles: [liveBlockHandle("zeta-block", zetaMesh)],
        },
        {
          visualGroupId: "alpha-group",
          blockHandles: [liveBlockHandle("alpha-block", alphaMesh)],
        },
      ],
    },
  };
  return { camera, engine, input, scene };
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
});

describe("formal world capture projection measurement", () => {
  it("projects Package-frozen AABBs through the explicit camera and target-sorts independently of registry order", () => {
    // This catches using live Mesh bounds or registry/Scene order instead of
    // the Package-frozen group bounds and deterministic formal identities.
    // Production Scene is right-handed; X is mirrored versus a left-handed
    // default NullEngine Scene.
    const fixture = createFixture();
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(measureFormalWorldCaptureViewV1(fixture.input)).toEqual({
      viewId: "world-top-down",
      targets: [{
        acceptanceTargetRef: "worldkit://acceptance-target/alpha@1",
        blockVisualGroupId: "alpha-group",
        mode: "presence-required",
        sourceBoundsMeters: {
          minimumMetersXYZ: [-2, -2, 2],
          maximumMetersXYZ: [0, 2, 4],
        },
        structuralProjection: {
          outcome: "projected",
          normalizedBounds: {
            minXBasisPoints: 4_999,
            minYBasisPoints: 3_750,
            maxXBasisPoints: 6_250,
            maxYBasisPoints: 6_250,
          },
          normalizedCenter: {
            xBasisPoints: 5_625,
            yBasisPoints: 5_000,
          },
          coverageBasisPoints: 312,
          cameraDepthMeters: 19,
          depthOrder: 1,
        },
      }, {
        acceptanceTargetRef: "worldkit://acceptance-target/zeta@1",
        blockVisualGroupId: "zeta-group",
        mode: "presence-required",
        sourceBoundsMeters: {
          minimumMetersXYZ: [2, -1, -4],
          maximumMetersXYZ: [4, 1, -2],
        },
        structuralProjection: {
          outcome: "projected",
          normalizedBounds: {
            minXBasisPoints: 2_500,
            minYBasisPoints: 4_375,
            maxXBasisPoints: 3_750,
            maxYBasisPoints: 5_625,
          },
          normalizedCenter: {
            xBasisPoints: 3_125,
            yBasisPoints: 5_000,
          },
          coverageBasisPoints: 156,
          cameraDepthMeters: 13,
          depthOrder: 0,
        },
      }],
    });
  });

  it("measures the explicit world-top-down orthographic camera without creating a replacement camera", () => {
    // This catches silently remapping a formal world view to a different
    // Camera or object-local tri-view before measurement.
    const fixture = createFixture();
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });
    const cameraCount = fixture.scene.cameras.length;

    expect(measureFormalWorldCaptureViewV1(fixture.input).viewId).toBe("world-top-down");
    expect(fixture.scene.cameras).toHaveLength(cameraCount);
    expect(fixture.scene.activeCamera).toBe(fixture.camera);
  });

  it.each([
    ["wider", 2_048, 1_024],
    ["taller", 1_024, 2_048],
  ] as const)("rejects a tight unpadded ortho on a %s formal target", (_name, widthPixels, heightPixels) => {
    // RED: production pads one axis to preserve the formal aspect. A live
    // camera that still uses the raw view-space min/max must fail closed.
    const view = {
      ...orthographicView,
      widthPixels,
      heightPixels,
    } satisfies FormalArtifactViewRequestV1;
    const fixture = createFixture({ view });
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(fixture.camera.orthoLeft).toBe(-8);
    expect(fixture.camera.orthoRight).toBe(8);
    expect(fixture.camera.orthoBottom).toBe(-8);
    expect(fixture.camera.orthoTop).toBe(8);
    expect(() => measureFormalWorldCaptureViewV1(fixture.input))
      .toThrow(/CAMERA_PROJECTION/);
  });

  it.each([
    ["wider", 2_048, 1_024, -16, 16, -8, 8],
    ["taller", 1_024, 2_048, -8, 8, -16, 16],
  ] as const)(
    "accepts the production aspect-fitted ortho for a %s formal target",
    (_name, widthPixels, heightPixels, orthoLeft, orthoRight, orthoBottom, orthoTop) => {
      // GREEN: the camera that rendered the formal target is the aspect-fitted
      // camera. Measurement must derive those same bounds from declared world
      // extents and view width/height.
      const view = {
        ...orthographicView,
        widthPixels,
        heightPixels,
      } satisfies FormalArtifactViewRequestV1;
      const fixture = createFixture({ view, worldOrtho: "aspect-fit" });
      cleanups.push(() => {
        fixture.scene.dispose();
        fixture.engine.dispose();
      });

      expect(fixture.camera.orthoLeft).toBeCloseTo(orthoLeft, 10);
      expect(fixture.camera.orthoRight).toBeCloseTo(orthoRight, 10);
      expect(fixture.camera.orthoBottom).toBeCloseTo(orthoBottom, 10);
      expect(fixture.camera.orthoTop).toBeCloseTo(orthoTop, 10);
      expect(measureFormalWorldCaptureViewV1(fixture.input).viewId)
        .toBe("world-top-down");
    },
  );

  it("rejects a world-side camera whose live pose was mutated by same-Z setTarget", () => {
    // Installed Babylon 9.23.0 TargetCamera.setTarget adds Epsilon (0.001)
    // to position.z when it equals target.z. The 1e-6 identity join must
    // keep rejecting that mutated live pose.
    const fixture = createFixture({
      view: worldSideView,
      worldCamera: "set-target-only",
      worldOrtho: "aspect-fit",
    });
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(fixture.camera.position.x).toBe(16);
    expect(fixture.camera.position.y).toBe(0);
    expect(fixture.camera.position.z).not.toBe(0);
    expect(() => measureFormalWorldCaptureViewV1(fixture.input))
      .toThrow(/CAMERA_PROJECTION/);
  });

  it("measures a genuine world-side lateral elevation using the exact orientation path", () => {
    // world-side is a lateral elevation. Reusing the top-down pose with only
    // viewId changed does not exercise the same-Z setTarget mutation or the
    // repository exact orientation path.
    const fixture = createFixture({
      view: worldSideView,
      worldCamera: "exact-pose",
      worldOrtho: "aspect-fit",
    });
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });
    const cameraCount = fixture.scene.cameras.length;

    expect(fixture.camera.position.asArray()).toEqual([16, 0, 0]);
    expect(measureFormalWorldCaptureViewV1(fixture.input)).toEqual({
      viewId: "world-side",
      targets: [{
        acceptanceTargetRef: "worldkit://acceptance-target/alpha@1",
        blockVisualGroupId: "alpha-group",
        mode: "presence-required",
        sourceBoundsMeters: {
          minimumMetersXYZ: [-2, -2, 2],
          maximumMetersXYZ: [0, 2, 4],
        },
        structuralProjection: {
          outcome: "projected",
          normalizedBounds: {
            minXBasisPoints: 2_500,
            minYBasisPoints: 3_750,
            maxXBasisPoints: 3_750,
            maxYBasisPoints: 6_250,
          },
          normalizedCenter: {
            xBasisPoints: 3_125,
            yBasisPoints: 5_000,
          },
          coverageBasisPoints: 312,
          cameraDepthMeters: 17,
          depthOrder: 1,
        },
      }, {
        acceptanceTargetRef: "worldkit://acceptance-target/zeta@1",
        blockVisualGroupId: "zeta-group",
        mode: "presence-required",
        sourceBoundsMeters: {
          minimumMetersXYZ: [2, -1, -4],
          maximumMetersXYZ: [4, 1, -2],
        },
        structuralProjection: {
          outcome: "projected",
          normalizedBounds: {
            minXBasisPoints: 6_250,
            minYBasisPoints: 4_375,
            maxXBasisPoints: 7_500,
            maxYBasisPoints: 5_625,
          },
          normalizedCenter: {
            xBasisPoints: 6_875,
            yBasisPoints: 5_000,
          },
          coverageBasisPoints: 156,
          cameraDepthMeters: 13,
          depthOrder: 0,
        },
      }],
    });
    expect(fixture.scene.cameras).toHaveLength(cameraCount);
    expect(fixture.scene.activeCamera).toBe(fixture.camera);
  });

  it("measures the SDK opening perspective camera with a right-handed numeric golden", () => {
    // Production Scene sets useRightHandedSystem. This locks the opening
    // perspective projection through that same Camera contract, not an
    // orthographic artifact pose.
    const fixture = createFixture({ view: openingView });
    fixture.camera.mode = FreeCamera.PERSPECTIVE_CAMERA;
    fixture.camera.fov = Math.PI / 2;
    fixture.camera.minZ = 0.05;
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(measureFormalWorldCaptureViewV1(fixture.input)).toEqual({
      viewId: "opening",
      targets: [{
        acceptanceTargetRef: "worldkit://acceptance-target/alpha@1",
        blockVisualGroupId: "alpha-group",
        mode: "reference-projection-required",
        sourceBoundsMeters: {
          minimumMetersXYZ: [-2, -2, 2],
          maximumMetersXYZ: [0, 2, 4],
        },
        structuralProjection: {
          outcome: "projected",
          normalizedBounds: {
            minXBasisPoints: 5_000,
            minYBasisPoints: 4_444,
            maxXBasisPoints: 5_556,
            maxYBasisPoints: 5_556,
          },
          normalizedCenter: {
            xBasisPoints: 5_278,
            yBasisPoints: 5_000,
          },
          coverageBasisPoints: 61,
          cameraDepthMeters: 19,
          depthOrder: 1,
        },
      }, {
        acceptanceTargetRef: "worldkit://acceptance-target/zeta@1",
        blockVisualGroupId: "zeta-group",
        mode: "reference-projection-required",
        sourceBoundsMeters: {
          minimumMetersXYZ: [2, -1, -4],
          maximumMetersXYZ: [4, 1, -2],
        },
        structuralProjection: {
          outcome: "projected",
          normalizedBounds: {
            minXBasisPoints: 3_333,
            minYBasisPoints: 4_583,
            maxXBasisPoints: 4_286,
            maxYBasisPoints: 5_417,
          },
          normalizedCenter: {
            xBasisPoints: 3_810,
            yBasisPoints: 5_000,
          },
          coverageBasisPoints: 79,
          cameraDepthMeters: 13,
          depthOrder: 0,
        },
      }],
    });
  });

  it("clips an opening AABB that crosses the perspective near plane", () => {
    // The foreground platform may legitimately extend behind the third-person
    // camera. Keeping only the corners beyond the near plane would understate
    // its visible footprint, so the AABB edges must be clipped at that plane.
    const foregroundGroup = {
      ...alphaGroup,
      minimumMetersXYZ: [-1, -1, -20],
      maximumMetersXYZ: [1, 1, -15.8],
    } satisfies BabylonNativeBlockMaterializerVisualGroupV1;
    const fixture = createFixture({ view: openingView, groups: [foregroundGroup] });
    fixture.camera.mode = FreeCamera.PERSPECTIVE_CAMERA;
    fixture.camera.fov = Math.PI / 2;
    fixture.camera.minZ = 0.05;
    fixture.input = {
      ...fixture.input,
      semanticCaptureMap: { bindings: [bindings[0]!] },
      liveHandleRegistry: {
        visualGroups: [fixture.input.liveHandleRegistry.visualGroups[1]!],
      },
    };
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(
      measureFormalWorldCaptureViewV1(fixture.input).targets[0]
        ?.structuralProjection,
    )
      .toMatchObject({
        outcome: "projected",
        normalizedBounds: {
          minXBasisPoints: 0,
          minYBasisPoints: 0,
          maxXBasisPoints: 10_000,
          maxYBasisPoints: 10_000,
        },
        cameraDepthMeters: 0.05,
      });
  });

  it("records a fully near-clipped opening AABB without vetoing capture", () => {
    const behindGroup = {
      ...alphaGroup,
      minimumMetersXYZ: [-1, -1, -20],
      maximumMetersXYZ: [1, 1, -18],
    } satisfies BabylonNativeBlockMaterializerVisualGroupV1;
    const fixture = createFixture({ view: openingView, groups: [behindGroup] });
    fixture.camera.mode = FreeCamera.PERSPECTIVE_CAMERA;
    fixture.camera.fov = Math.PI / 2;
    fixture.camera.minZ = 0.05;
    fixture.input = {
      ...fixture.input,
      semanticCaptureMap: { bindings: [bindings[0]!] },
      liveHandleRegistry: {
        visualGroups: [fixture.input.liveHandleRegistry.visualGroups[1]!],
      },
    };
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(
      measureFormalWorldCaptureViewV1(fixture.input).targets[0]
        ?.structuralProjection,
    ).toEqual({ outcome: "outside-depth-range" });
  });

  it("uses the camera viewport and conservative floor/ceil basis-point bounds", () => {
    // This catches normalizing as if every Camera owns the full render target
    // and catches rounding inward at measured AABB boundaries.
    const fixture = createFixture({ groups: [alphaGroup] });
    fixture.camera.viewport = new Viewport(0.25, 0.25, 0.5, 0.5);
    fixture.input = {
      ...fixture.input,
      semanticCaptureMap: { bindings: [bindings[0]!] },
      liveHandleRegistry: {
        visualGroups: [fixture.input.liveHandleRegistry.visualGroups[1]!],
      },
    };
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(
      measureFormalWorldCaptureViewV1(fixture.input).targets[0]
        ?.structuralProjection,
    )
      .toMatchObject({
        outcome: "projected",
        normalizedBounds: {
          minXBasisPoints: 5_000,
          minYBasisPoints: 4_375,
          maxXBasisPoints: 5_625,
          maxYBasisPoints: 5_625,
        },
        normalizedCenter: {
          xBasisPoints: 5_313,
          yBasisPoints: 5_000,
        },
        coverageBasisPoints: 78,
      });
  });

  it("breaks equal camera-depth ties by acceptance target ref", () => {
    // This catches depthOrder depending on Package or registry insertion order.
    const sameDepthZeta = {
      ...zetaGroup,
      minimumMetersXYZ: [2, -1, 2],
      maximumMetersXYZ: [4, 1, 4],
    } satisfies BabylonNativeBlockMaterializerVisualGroupV1;
    const fixture = createFixture({ groups: [sameDepthZeta, alphaGroup] });
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(measureFormalWorldCaptureViewV1(fixture.input).targets.map(
      ({ acceptanceTargetRef, structuralProjection }) => ({
        acceptanceTargetRef,
        depthOrder: structuralProjection.outcome === "projected"
          ? structuralProjection.depthOrder
          : undefined,
      }),
    )).toEqual([{
      acceptanceTargetRef: "worldkit://acceptance-target/alpha@1",
      depthOrder: 0,
    }, {
      acceptanceTargetRef: "worldkit://acceptance-target/zeta@1",
      depthOrder: 1,
    }]);
  });

  it.each([
    ["missing", (input: FormalWorldCaptureMeasurementInputV1) => ({
      ...input,
      liveHandleRegistry: {
        visualGroups: input.liveHandleRegistry.visualGroups.slice(1),
      },
    })],
    ["extra", (input: FormalWorldCaptureMeasurementInputV1) => ({
      ...input,
      liveHandleRegistry: {
        visualGroups: [...input.liveHandleRegistry.visualGroups, {
          visualGroupId: "extra-group",
          blockHandles: input.liveHandleRegistry.visualGroups[0]!.blockHandles,
        }],
      },
    })],
    ["empty", (input: FormalWorldCaptureMeasurementInputV1) => ({
      ...input,
      liveHandleRegistry: {
        visualGroups: input.liveHandleRegistry.visualGroups.map((group) =>
          group.visualGroupId === "alpha-group"
            ? { ...group, blockHandles: [] }
            : group),
      },
    })],
  ] as const)("rejects a %s explicit live visual-group join", (_name, mutate) => {
    // These catch falling back to Scene/name/tag/metadata scans when the
    // admitted materializer registry is incomplete or over-broad.
    const fixture = createFixture();
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(() => measureFormalWorldCaptureViewV1(mutate(fixture.input)))
      .toThrow(/LIVE_VISUAL_GROUPS/);
  });

  it("rejects a disposed explicit visual handle", () => {
    // This catches treating registry membership as proof that a Mesh remains live.
    const fixture = createFixture();
    babylonNativeBlockLiveVisualHandleMeshV1(
      fixture.input.liveHandleRegistry.visualGroups[0]!.blockHandles[0]!,
    ).dispose();
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(() => measureFormalWorldCaptureViewV1(fixture.input))
      .toThrow(/LIVE_VISUAL_GROUPS/);
  });

  it("rejects Package/semantic binding identity drift", () => {
    // This catches projecting a stale semantic map over different Package bounds.
    const fixture = createFixture();
    fixture.input = {
      ...fixture.input,
      materializerMetadata: {
        ...fixture.input.materializerMetadata,
        contributionHash: HASH_A,
      },
    };
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(() => measureFormalWorldCaptureViewV1(fixture.input))
      .toThrow(/PACKAGE_BINDING/);
  });

  it.each([
    ["near-clipped", {
      ...alphaGroup,
      minimumMetersXYZ: [-1, -1, -15],
      maximumMetersXYZ: [1, 1, -10],
    }],
    ["behind", {
      ...alphaGroup,
      minimumMetersXYZ: [-1, -1, -20],
      maximumMetersXYZ: [1, 1, -18],
    }],
    ["far-clipped", {
      ...alphaGroup,
      minimumMetersXYZ: [-1, -1, 120],
      maximumMetersXYZ: [1, 1, 130],
    }],
    ["far-crossing", {
      ...alphaGroup,
      minimumMetersXYZ: [-1, -1, 100],
      maximumMetersXYZ: [1, 1, 120],
    }],
    ["outside viewport", {
      ...alphaGroup,
      minimumMetersXYZ: [20, -1, 0],
      maximumMetersXYZ: [22, 1, 2],
    }],
  ] as const)("records the structural outside outcome when one AABB is %s", (
    name,
    group,
  ) => {
    // These catch trusting Vector3.Project alone: Babylon performs the
    // homogeneous divide even for behind/near-clipped points and returns
    // coordinates outside the viewport without rejecting them.
    const fixture = createFixture({ groups: [group] });
    fixture.camera.minZ = 2;
    fixture.input = {
      ...fixture.input,
      semanticCaptureMap: { bindings: [bindings[0]!] },
      liveHandleRegistry: {
        visualGroups: [fixture.input.liveHandleRegistry.visualGroups[1]!],
      },
    };
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(
      measureFormalWorldCaptureViewV1(fixture.input).targets[0]
        ?.structuralProjection,
    ).toEqual({
      outcome: name === "outside viewport"
        ? "outside-viewport"
        : "outside-depth-range",
    });
  });

  it("records a zero-area projected AABB as outside the viewport", () => {
    // A structurally valid but non-visible projection remains evidence, not
    // an integrity failure or an ordinary-production veto.
    const fixture = createFixture({ groups: [alphaGroup] });
    fixture.camera.freezeProjectionMatrix(Matrix.FromValues(
      0, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ));
    fixture.input = {
      ...fixture.input,
      semanticCaptureMap: { bindings: [bindings[0]!] },
      liveHandleRegistry: {
        visualGroups: [fixture.input.liveHandleRegistry.visualGroups[1]!],
      },
    };
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(
      measureFormalWorldCaptureViewV1(fixture.input).targets[0]
        ?.structuralProjection,
    ).toEqual({ outcome: "outside-viewport" });
  });

  it("rejects a camera projection mode that does not match the formal view", () => {
    // This catches measuring opening through an artifact orthographic Camera.
    const fixture = createFixture({ view: openingView });
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(() => measureFormalWorldCaptureViewV1(fixture.input))
      .toThrow(/CAMERA_PROJECTION/);
  });

  it.each([
    ["far-clipped", {
      ...alphaGroup,
      minimumMetersXYZ: [-1, -1, 120],
      maximumMetersXYZ: [1, 1, 130],
    }],
    ["outside viewport", {
      ...alphaGroup,
      minimumMetersXYZ: [20, -1, 2],
      maximumMetersXYZ: [22, 1, 4],
    }],
  ] as const)("records the opening structural outside outcome when an AABB is %s", (
    name,
    group,
  ) => {
    const fixture = createFixture({ view: openingView, groups: [group] });
    fixture.camera.mode = FreeCamera.PERSPECTIVE_CAMERA;
    fixture.camera.fov = Math.PI / 2;
    fixture.camera.minZ = 0.05;
    fixture.input = {
      ...fixture.input,
      semanticCaptureMap: { bindings: [bindings[0]!] },
      liveHandleRegistry: {
        visualGroups: [fixture.input.liveHandleRegistry.visualGroups[1]!],
      },
    };
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(
      measureFormalWorldCaptureViewV1(fixture.input).targets[0]
        ?.structuralProjection,
    ).toEqual({
      outcome: name === "outside viewport"
        ? "outside-viewport"
        : "outside-depth-range",
    });
  });

  it("clamps a partially visible opening AABB to the live viewport", () => {
    const partialGroup = {
      ...alphaGroup,
      minimumMetersXYZ: [10, -1, 2],
      maximumMetersXYZ: [20, 1, 4],
    } satisfies BabylonNativeBlockMaterializerVisualGroupV1;
    const fixture = createFixture({ view: openingView, groups: [partialGroup] });
    fixture.camera.mode = FreeCamera.PERSPECTIVE_CAMERA;
    fixture.camera.fov = Math.PI / 2;
    fixture.camera.minZ = 0.05;
    fixture.input = {
      ...fixture.input,
      semanticCaptureMap: { bindings: [bindings[0]!] },
      liveHandleRegistry: {
        visualGroups: [fixture.input.liveHandleRegistry.visualGroups[1]!],
      },
    };
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    const measured = measureFormalWorldCaptureViewV1(fixture.input).targets[0]
      ?.structuralProjection;
    expect(measured).toMatchObject({
      outcome: "projected",
      normalizedBounds: {
        minXBasisPoints: 0,
        minYBasisPoints: 4_722,
        maxXBasisPoints: 2_500,
        maxYBasisPoints: 5_278,
      },
      normalizedCenter: {
        xBasisPoints: 1_250,
        yBasisPoints: 5_000,
      },
      coverageBasisPoints: 138,
    });
    if (measured?.outcome !== "projected") {
      throw new Error("expected a projected partial opening target");
    }
    expect(measured.cameraDepthMeters).toBeCloseTo(19, 10);
  });

  it("clamps a partially visible AABB to the live viewport", () => {
    // Opening and world views must measure the visible rectangle. A group
    // that crosses the frustum edge is kept; only the on-screen bounds count.
    const partialGroup = {
      ...alphaGroup,
      minimumMetersXYZ: [6, -1, 0],
      maximumMetersXYZ: [12, 1, 2],
    } satisfies BabylonNativeBlockMaterializerVisualGroupV1;
    const fixture = createFixture({ groups: [partialGroup] });
    fixture.input = {
      ...fixture.input,
      semanticCaptureMap: { bindings: [bindings[0]!] },
      liveHandleRegistry: {
        visualGroups: [fixture.input.liveHandleRegistry.visualGroups[1]!],
      },
    };
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(
      measureFormalWorldCaptureViewV1(fixture.input).targets[0]
        ?.structuralProjection,
    )
      .toMatchObject({
        outcome: "projected",
        normalizedBounds: {
          minXBasisPoints: 0,
          minYBasisPoints: 4_375,
          maxXBasisPoints: 1_250,
          maxYBasisPoints: 5_625,
        },
        normalizedCenter: {
          xBasisPoints: 625,
          yBasisPoints: 5_000,
        },
        coverageBasisPoints: 156,
        cameraDepthMeters: 17,
      });
  });

  it("measures an exact empty semantic join without scanning ordinary world meshes", () => {
    // The scene still contains real meshes; none acquires a semantic identity by scanning.
    const fixture = createFixture();
    fixture.input = {
      ...fixture.input,
      materializerMetadata: {
        ...fixture.input.materializerMetadata,
        visualGroups: [],
      },
      semanticCaptureMap: { bindings: [] },
      liveHandleRegistry: { visualGroups: [] },
    };
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(measureFormalWorldCaptureViewV1(fixture.input).targets).toEqual([]);
  });

  it.each([
    ["camera position", (input: FormalWorldCaptureMeasurementInputV1) => {
      input.camera.position.x = 1;
      return input;
    }],
    ["camera target", (input: FormalWorldCaptureMeasurementInputV1) => ({
      ...input,
      view: {
        ...orthographicView,
        targetMetersXYZ: [1, 0, 0],
      } satisfies FormalArtifactViewRequestV1,
    })],
    ["world bounds", (input: FormalWorldCaptureMeasurementInputV1) => ({
      ...input,
      view: {
        ...orthographicView,
        worldBoundsMeters: {
          minimumMetersXYZ: [-7, -7, -7],
          maximumMetersXYZ: [7, 7, 7],
        },
      } satisfies FormalArtifactViewRequestV1,
    })],
    ["devicePixelRatio", (input: FormalWorldCaptureMeasurementInputV1) => ({
      ...input,
      view: {
        ...orthographicView,
        devicePixelRatio: 2,
      } satisfies FormalArtifactViewRequestV1,
    })],
  ] as const)("rejects a world view whose declared %s drifts from the live camera", (
    _name,
    mutate,
  ) => {
    const fixture = createFixture();
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(() => measureFormalWorldCaptureViewV1(mutate(fixture.input)))
      .toThrow(/CAMERA_PROJECTION/);
  });

  it("does not mutate gameplay camera cache flags while measuring", () => {
    // Installed Babylon 9.23.0 Camera.getViewMatrix(true) sets hasMoved and
    // getProjectionMatrix rewrites minZ when it is non-positive. Measurement
    // must use the non-mutating Matrix APIs instead of those Camera getters.
    const proof = createFixture();
    const fixture = createFixture();
    cleanups.push(() => {
      proof.scene.dispose();
      proof.engine.dispose();
      fixture.scene.dispose();
      fixture.engine.dispose();
    });
    expect(proof.camera.hasMoved).toBe(false);
    proof.camera.getViewMatrix(true);
    expect(proof.camera.hasMoved).toBe(true);
    const minZ = fixture.camera.minZ;
    const maxZ = fixture.camera.maxZ;

    expect(measureFormalWorldCaptureViewV1(fixture.input).viewId)
      .toBe("world-top-down");
    expect(fixture.camera.hasMoved).toBe(false);
    expect(fixture.camera.minZ).toBe(minZ);
    expect(fixture.camera.maxZ).toBe(maxZ);
  });

  it("rejects a non-positive near plane without rewriting the live camera", () => {
    const fixture = createFixture({ view: openingView });
    fixture.camera.mode = FreeCamera.PERSPECTIVE_CAMERA;
    fixture.camera.fov = Math.PI / 2;
    fixture.camera.minZ = 0;
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(() => measureFormalWorldCaptureViewV1(fixture.input))
      .toThrow(/CAMERA_PROJECTION/);
    expect(fixture.camera.minZ).toBe(0);
    expect(fixture.camera.hasMoved).toBe(false);
  });
});
