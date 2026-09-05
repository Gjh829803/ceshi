import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  createBabylonNativeHostRandomV1,
  type BabylonNativeSceneBuildContextV1,
} from "@whitebox-world/native-babylon";
import { createBabylonNativeBlockProfileSessionV1 } from "@whitebox-world/native-babylon-block-profile";
import { describe, expect, it } from "vitest";

import { createBabylonNativeBlockProfileCheckResultV1 } from "../../packages/native-babylon-block-profile/src/check.js";
import { deriveBabylonNativeBlockLayoutV1 } from "../../packages/native-babylon-block-profile/src/layout.js";
import type { BabylonNativeBlockSessionRecordV1 } from "../../packages/native-babylon-block-profile/src/session.js";
import { babylonNativeBlockBoundsFromCenterV1 } from "../../packages/native-babylon-block-profile/src/shapes.js";
import { SCENE_SOURCE } from "./native-package.test-support.js";
import {
  NATIVE_SEMANTIC_GEOMETRY_FIXTURES_V1,
  NATIVE_SEMANTIC_GEOMETRY_PIXEL_CLAIMS_V1,
  NATIVE_SEMANTIC_GEOMETRY_TARGET_REF_V1,
} from "./native-semantic-geometry.test-support.js";

const fixtures = NATIVE_SEMANTIC_GEOMETRY_FIXTURES_V1;
const targetBlocks = (id: keyof typeof fixtures) => fixtures[id].blocks.filter(
  (block) => block.visualGroupId === "gate-mass-group",
);

function createContext(scene: Scene): BabylonNativeSceneBuildContextV1 {
  return {
    scene,
    bootstrap: {
      kind: "babylon-native-scene-bootstrap", schemaVersion: 1,
      id: "semantic-geometry-test",
      sceneModuleRef: "worldkit://native-scene/semantic-geometry-test@1",
      nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
      nativeSceneProfileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
      gameplayBootstrapRef: "worldkit://gameplay-bootstrap/semantic-geometry-test@1",
      initialControlledEntityId: "player",
      gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
      initialCamera: {
        mode: "third-person", pitchRadians: 0.18, distanceMeters: 5,
        fovDegrees: 56, targetHeightMeters: 1.2,
      },
      seed: 81, spawnMarkerId: "player-spawn",
    },
    random: createBabylonNativeHostRandomV1(81),
    assets: { async resolve(): Promise<never> { throw new Error("No assets in this fixture test"); } },
    registration: { registerSpawnMarker() {}, registerStaticCollider() {} },
  };
}

describe("Native semantic geometry capture fixtures", () => {
  it("preserves Ground, Spawn, four other identities and the gate Collider", () => {
    const unchangedLines = SCENE_SOURCE.split("\n").filter((line) =>
      !line.includes('session.createBlock({id: "gate"') &&
      !line.includes("maximumBlockCount: 64") &&
      !line.includes("session.finalize({ staticColliders:")
    );
    for (const fixture of Object.values(fixtures)) {
      for (const line of unchangedLines) expect(fixture.options.sceneSource).toContain(line);
      expect(fixture.blocks.filter((block) => block.id === "gate")).toHaveLength(1);
      expect(fixture.options.sceneSource).toContain("displayGapMeters: 0");
      expect(fixture.options.maximumBlockCount).toBe(128);
      expect(fixture.blocks.length + 55).toBeLessThanOrEqual(128);
      expect(fixture.options).toMatchObject({
        withoutScriptedTraversal: true,
        worldBoundsPolicy: { mode: "checked-block-layout" },
        groundExploration: { mode: "source-authored" },
      });
      for (const block of fixture.blocks) {
        expect(fixture.options.sceneSource).toContain(`session.createBlock(${JSON.stringify(block)});`);
      }
    }
  });

  it("keeps identical checked world bounds without altering the Camera request", () => {
    for (const fixture of Object.values(fixtures)) {
      const bounds = fixture.blocks.map((block) => babylonNativeBlockBoundsFromCenterV1({
        ...block, rotationQuarterTurnsY: 0,
      }));
      // Include unchanged base Ground/mountain bounds, excluding the replaced gate.
      expect([0, 1, 2].map((axis) => Math.min([-4.5, -1, 0.5][axis]!, ...bounds.map((b) => b.minimumMetersXYZ[axis]!))))
        .toEqual([-4.5, -1, 0.5]);
      expect([0, 1, 2].map((axis) => Math.max([1.5, 0, 18.5][axis]!, ...bounds.map((b) => b.maximumMetersXYZ[axis]!))))
        .toEqual([8.5, 5, 18.5]);
    }
  });

  it.each(Object.keys(fixtures) as (keyof typeof fixtures)[])("passes public Session createBlock admission and the real pure Block checker: %s", (id) => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const session = createBabylonNativeBlockProfileSessionV1(createContext(scene), {
      maximumBlockCount: fixtures[id].options.maximumBlockCount,
    });
    try {
      const records: BabylonNativeBlockSessionRecordV1[] = fixtures[id].blocks.map((input) => {
        // Use the public entry point: constructing checker records directly
        // bypasses the owning input parser's id/shape/lattice/occupancy checks.
        const mesh = session.createBlock(input);
        return {
          input, mesh,
          localGeometrySnapshot: {
            positions: [...mesh.getVerticesData(VertexBuffer.PositionKind)!],
            indices: [...mesh.getIndices()!],
          },
        };
      });
      const result = createBabylonNativeBlockProfileCheckResultV1(id, records,
        deriveBabylonNativeBlockLayoutV1(scene, records));
      expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
      expect(result.outcome).toBe("passed");
    } finally {
      session.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("rejects the previous fractional-coordinate ids through the actual owning parser", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const session = createBabylonNativeBlockProfileSessionV1(createContext(scene), { maximumBlockCount: 128 });
    try {
      for (const id of ["wall-3-0.5", "bounds-column--0.5", "occluder-2--0.5", "rear-7-0.5"]) {
        expect(() => session.createBlock({ ...fixtures["solid-wall"].blocks[0]!, id }))
          .toThrow(/WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID/);
      }
      expect(scene.meshes).toHaveLength(0);
    } finally {
      session.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("removes an interior cell only, and keeps separated instances on the same identity", () => {
    const solid = targetBlocks("solid-wall");
    const hollow = targetBlocks("hollow-wall");
    expect(solid).toHaveLength(9);
    expect(hollow).toHaveLength(8);
    expect(solid.filter((block) => !hollow.some((other) => other.id === block.id))
      .map((block) => block.centerMetersXYZ)).toEqual([[4, 1.5, 10]]);
    expect(targetBlocks("separated-columns")).toHaveLength(6);
    expect(new Set(targetBlocks("separated-columns").map((block) => block.centerMetersXYZ[0])))
      .toEqual(new Set([3, 5]));
  });

  it("changes only explicit ungrouped occluders or hidden rear depth in the comparison pairs", () => {
    const solid = targetBlocks("solid-wall");
    for (const id of ["fully-occluded-wall", "partly-occluded-wall"] as const) {
      expect(targetBlocks(id)).toEqual(solid);
      const occluders = fixtures[id].blocks.filter((block) => block.id.startsWith("occluder-"));
      expect(occluders.length).toBe(id === "fully-occluded-wall" ? 25 : 10);
      expect(occluders.every((block) => block.visualGroupId === undefined && block.colliderGroupId === undefined)).toBe(true);
    }
    expect(targetBlocks("rear-depth-wall").filter((block) => !block.id.startsWith("rear-"))).toEqual(solid);
    expect(targetBlocks("rear-depth-wall").filter((block) => block.id.startsWith("rear-"))
      .map((block) => block.centerMetersXYZ)).toEqual([
        [4, 0.5, 7], [4, 1.5, 7], [4, 0.5, 8], [4, 1.5, 8], [4, 0.5, 9], [4, 1.5, 9],
      ]);
  });

  it("publishes only target-mask claims for the existing three views, pending real GPU evidence", () => {
    expect(NATIVE_SEMANTIC_GEOMETRY_TARGET_REF_V1).toBe("worldkit://acceptance-target/gate-mass@1");
    expect(NATIVE_SEMANTIC_GEOMETRY_PIXEL_CLAIMS_V1).toHaveLength(7);
    for (const claim of NATIVE_SEMANTIC_GEOMETRY_PIXEL_CLAIMS_V1) {
      expect(fixtures[claim.fixtureId]).toBeDefined();
      expect(fixtures[claim.baselineFixtureId]).toBeDefined();
      expect(["opening", "world-side", "world-top-down"]).toContain(claim.viewId);
    }
  });
});
