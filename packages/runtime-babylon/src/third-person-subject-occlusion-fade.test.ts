import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import { describe, expect, it } from "vitest";

import {
  ThirdPersonSubjectOcclusionFadeV1,
  registerBlockWorldOcclusionBatchV1,
  selectSubjectOccludingBlockInstancesV1,
} from "./third-person-subject-occlusion-fade.js";

const SUBJECT = Object.freeze({
  subjectOriginPositionMetersXYZ: [2, 0, 0] as const,
  colliderCenterOffsetMetersXYZ: [0, 1, 0] as const,
  colliderHeightMeters: 2,
  colliderRadiusMeters: 0.4,
});

describe("third-person Subject occlusion fade", () => {
  it("selects blocks covering the Subject, not blocks covering an unrelated reticle point", () => {
    const selected = selectSubjectOccludingBlockInstancesV1({
      cameraPositionMetersXYZ: [0, 1, 5],
      ...SUBJECT,
      batches: [
        {
          id: "reticle-pillar",
          instances: [{
            centerMetersXYZ: [0, 1, 2],
            halfExtentsMetersXYZ: [0.5, 0.5, 0.5],
          }],
        },
        {
          id: "subject-occluder",
          instances: [{
            centerMetersXYZ: [1.2, 1, 2],
            halfExtentsMetersXYZ: [0.5, 0.5, 0.5],
          }],
        },
      ],
    });

    expect(selected.has("reticle-pillar:0")).toBe(false);
    expect(selected.get("subject-occluder:0")).toBeGreaterThan(0);
  });

  it("includes a small visibility margin around the Subject silhouette", () => {
    const selected = selectSubjectOccludingBlockInstancesV1({
      cameraPositionMetersXYZ: [0, 1, 5],
      ...SUBJECT,
      batches: [{
        id: "expanded-headroom-occluder",
        instances: [{
          centerMetersXYZ: [1.2, 1.95, 2],
          halfExtentsMetersXYZ: [0.3, 0.2, 0.3],
        }],
      }],
    });

    expect(selected.get("expanded-headroom-occluder:0")).toBeGreaterThan(0);
  });

  it("fades complete thin instances and restores them when disabled", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const material = new StandardMaterial("block", scene);
    const mesh = MeshBuilder.CreateBox("subject-occluder", { size: 1 }, scene);
    mesh.material = material;
    registerBlockWorldOcclusionBatchV1(mesh, "block.obstacle.shape.small", [{
      positionMetersXYZ: [1.2, 1, 2],
      scaleXYZ: [0.985, 0.985, 0.985],
    }]);
    const fade = new ThirdPersonSubjectOcclusionFadeV1([mesh]);
    try {
      expect(
        mesh.getVertexBuffer("worldkitOcclusionOpacity")?.isUpdatable(),
      ).toBe(true);
      fade.update({
        cameraPosition: new Vector3(0, 1, 5),
        ...SUBJECT,
        deltaSeconds: 0.2,
      });
      expect(fade.snapshot()).toMatchObject({
        enabled: true,
        selectedInstanceCount: 1,
        fadedInstanceCount: 1,
      });
      expect(fade.snapshot().instances[0]).toMatchObject({
        batchId: "subject-occluder",
        instanceIndex: 0,
        targetOpacityRatio: 0.3,
      });
      expect(fade.snapshot().instances[0]!.opacityRatio).toBeLessThan(1);

      fade.setEnabled(false);
      expect(fade.snapshot()).toMatchObject({
        enabled: false,
        selectedInstanceCount: 0,
        fadedInstanceCount: 0,
      });
    } finally {
      fade.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("never enrolls walkable ground in Subject occlusion fading", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const material = new StandardMaterial("ground", scene);
    const mesh = MeshBuilder.CreateBox("walkable-ground", { size: 1 }, scene);
    mesh.material = material;
    registerBlockWorldOcclusionBatchV1(mesh, "block.walkable.shape.full", [{
      positionMetersXYZ: [1.2, 1, 2],
      scaleXYZ: [0.985, 0.985, 0.985],
    }]);
    const fade = new ThirdPersonSubjectOcclusionFadeV1([mesh]);
    try {
      fade.update({
        cameraPosition: new Vector3(0, 1, 5),
        ...SUBJECT,
        deltaSeconds: 0.2,
      });
      expect(fade.snapshot()).toMatchObject({
        selectedInstanceCount: 0,
        fadedInstanceCount: 0,
      });
      expect(mesh.material).toBe(material);
    } finally {
      fade.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
