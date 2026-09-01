import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import type {
  BabylonNativeBlockMaterializerVisualGroupV1,
  FormalArtifactViewRequestV1,
  FormalSemanticCaptureTargetBindingV1,
} from "@whitebox-world/runtime-contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  measureFormalWorldCaptureViewV1,
  type FormalWorldCaptureMeasurementInputV1,
} from "./formal-world-capture-measurement.js";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;

const alphaGroup = Object.freeze({
  visualGroupId: "alpha-group",
  acceptanceTargetRef: "worldkit://acceptance-target/alpha@1",
  semanticClassId: "worldkit.native-block.group.alpha-group",
  identityColorHex: "#112233",
  blockIds: Object.freeze(["alpha-block"]),
  paletteRoles: Object.freeze(["route"]),
  minimumMetersXYZ: Object.freeze([-2, -2, 2]),
  maximumMetersXYZ: Object.freeze([0, 2, 4]),
} satisfies BabylonNativeBlockMaterializerVisualGroupV1);

const zetaGroup = Object.freeze({
  visualGroupId: "zeta-group",
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
    requiredWorldViewIds: Object.freeze([
      "opening",
      "world-side",
      "world-top-down",
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
    requiredWorldViewIds: Object.freeze([
      "opening",
      "world-side",
      "world-top-down",
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

function createFixture(options: Readonly<{
  groups?: readonly BabylonNativeBlockMaterializerVisualGroupV1[];
  view?: FormalArtifactViewRequestV1;
}> = {}) {
  const engine = new NullEngine({
    renderWidth: 1_024,
    renderHeight: 1_024,
    textureSize: 512,
    deterministicLockstep: true,
    lockstepMaxSteps: 4,
  });
  const scene = new Scene(engine);
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
    view: options.view ?? orthographicView,
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
        { visualGroupId: "zeta-group", meshes: [zetaMesh] },
        { visualGroupId: "alpha-group", meshes: [alphaMesh] },
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
    const fixture = createFixture();
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(measureFormalWorldCaptureViewV1(fixture.input)).toEqual({
      viewId: "world-top-down",
      visualGroups: [{
        acceptanceTargetRef: "worldkit://acceptance-target/alpha@1",
        compositionTargetRef: "worldkit://composition-target/alpha@1",
        topologyNodeId: "alpha-node",
        semanticLayerId: "route-layer",
        blockVisualGroupId: "alpha-group",
        sourceBoundsMeters: {
          minimumMetersXYZ: [-2, -2, 2],
          maximumMetersXYZ: [0, 2, 4],
        },
        normalizedBounds: {
          minXBasisPoints: 3_750,
          minYBasisPoints: 3_750,
          maxXBasisPoints: 5_000,
          maxYBasisPoints: 6_250,
        },
        normalizedCenter: {
          xBasisPoints: 4_375,
          yBasisPoints: 5_000,
        },
        coverageBasisPoints: 312,
        cameraDepthMeters: 19,
        depthOrder: 1,
      }, {
        acceptanceTargetRef: "worldkit://acceptance-target/zeta@1",
        compositionTargetRef: "worldkit://composition-target/zeta@1",
        topologyNodeId: "zeta-node",
        semanticLayerId: "structure-layer",
        blockVisualGroupId: "zeta-group",
        sourceBoundsMeters: {
          minimumMetersXYZ: [2, -1, -4],
          maximumMetersXYZ: [4, 1, -2],
        },
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
      }],
    });
  });

  it.each(["world-side", "world-top-down"] as const)(
    "measures the explicit %s orthographic camera without creating a replacement camera",
    (viewId) => {
      // This catches silently remapping a formal world view to a different
      // Camera or object-local tri-view before measurement.
      const view = { ...orthographicView, viewId } as FormalArtifactViewRequestV1;
      const fixture = createFixture({ view });
      cleanups.push(() => {
        fixture.scene.dispose();
        fixture.engine.dispose();
      });
      const cameraCount = fixture.scene.cameras.length;

      expect(measureFormalWorldCaptureViewV1(fixture.input).viewId).toBe(viewId);
      expect(fixture.scene.cameras).toHaveLength(cameraCount);
      expect(fixture.scene.activeCamera).toBe(fixture.camera);
    },
  );

  it("measures the SDK opening perspective camera", () => {
    // This catches treating opening as an orthographic artifact view.
    const view = {
      kind: "formal-artifact-view-request",
      schemaVersion: 1,
      viewId: "opening",
      projection: "perspective",
      widthPixels: 1_024,
      heightPixels: 1_024,
      devicePixelRatio: 1,
    } satisfies FormalArtifactViewRequestV1;
    const fixture = createFixture({ view });
    fixture.camera.mode = FreeCamera.PERSPECTIVE_CAMERA;
    fixture.camera.fov = Math.PI / 2;
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    const measured = measureFormalWorldCaptureViewV1(fixture.input);

    expect(measured.viewId).toBe("opening");
    expect(measured.visualGroups.map(({ blockVisualGroupId }) =>
      blockVisualGroupId)).toEqual(["alpha-group", "zeta-group"]);
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

    expect(measureFormalWorldCaptureViewV1(fixture.input).visualGroups[0])
      .toMatchObject({
        normalizedBounds: {
          minXBasisPoints: 4_375,
          minYBasisPoints: 4_375,
          maxXBasisPoints: 5_000,
          maxYBasisPoints: 5_625,
        },
        normalizedCenter: {
          xBasisPoints: 4_688,
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

    expect(measureFormalWorldCaptureViewV1(fixture.input).visualGroups.map(
      ({ acceptanceTargetRef, depthOrder }) =>
        ({ acceptanceTargetRef, depthOrder }),
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
          meshes: input.liveHandleRegistry.visualGroups[0]!.meshes,
        }],
      },
    })],
    ["empty", (input: FormalWorldCaptureMeasurementInputV1) => ({
      ...input,
      liveHandleRegistry: {
        visualGroups: input.liveHandleRegistry.visualGroups.map((group) =>
          group.visualGroupId === "alpha-group"
            ? { ...group, meshes: [] }
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
    fixture.input.liveHandleRegistry.visualGroups[0]!.meshes[0]!.dispose();
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
    ["outside viewport", {
      ...alphaGroup,
      minimumMetersXYZ: [20, -1, 0],
      maximumMetersXYZ: [22, 1, 2],
    }],
  ] as const)("fails closed when one AABB is %s", (_name, group) => {
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

    expect(() => measureFormalWorldCaptureViewV1(fixture.input))
      .toThrow(/PROJECTION/);
  });

  it("fails closed on a zero-area projected AABB", () => {
    // This catches publishing parser-invalid normalized bounds after a
    // degenerate or stale projection matrix.
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

    expect(() => measureFormalWorldCaptureViewV1(fixture.input))
      .toThrow(/PROJECTION/);
  });

  it("rejects a camera projection mode that does not match the formal view", () => {
    // This catches measuring opening through an artifact orthographic Camera.
    const view = {
      kind: "formal-artifact-view-request",
      schemaVersion: 1,
      viewId: "opening",
      projection: "perspective",
      widthPixels: 1_024,
      heightPixels: 1_024,
      devicePixelRatio: 1,
    } satisfies FormalArtifactViewRequestV1;
    const fixture = createFixture({ view });
    cleanups.push(() => {
      fixture.scene.dispose();
      fixture.engine.dispose();
    });

    expect(() => measureFormalWorldCaptureViewV1(fixture.input))
      .toThrow(/CAMERA_PROJECTION/);
  });
});
