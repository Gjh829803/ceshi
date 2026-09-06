import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Scene } from "@babylonjs/core/scene.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { describe, expect, it, vi } from "vitest";
import {
  NativeBlockSubjectOcclusionFadeV1,
  nativeBlockOcclusionBatchesFromLiveHandlesV1,
  selectSubjectOccludingBlockInstancesV1,
} from "./native-block-subject-occlusion.js";

const subject = {
  cameraPosition: new Vector3(0, 1, 5),
  subjectOriginPositionMetersXYZ: [0, 0, 0] as const,
  colliderCenterOffsetMetersXYZ: [0, 0.9, 0] as const,
  colliderHeightMeters: 1.8,
  colliderRadiusMeters: 0.3,
};

function fixture() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const mesh = MeshBuilder.CreateBox("unrelated-mesh-name", {}, scene);
  const material = new StandardMaterial("original", scene);
  mesh.material = material;
  const transforms = [
    { positionMetersXYZ: [0, 1, 2.5] as const, scaleXYZ: [4, 4, 0.5] as const },
    { positionMetersXYZ: [10, 1, 2.5] as const, scaleXYZ: [1, 1, 1] as const },
  ];
  mesh.thinInstanceSetBuffer("matrix", new Float32Array(transforms.flatMap((row) =>
    Array.from(Matrix.Compose(new Vector3(...row.scaleXYZ), Quaternion.Identity(),
      new Vector3(...row.positionMetersXYZ)).asArray()))), 16, true);
  return { engine, scene, mesh, material, batches: [{ id: "batch-a", mesh, transforms }] };
}

describe("Native Block old-branch Subject occlusion presentation", () => {
  it("derives admitted display bounds from actual merged instance matrices, not logical Block count", () => {
    const f = fixture();
    try {
      f.mesh.position.set(3, 2, -1);
      const batch = {
        batchId: "batch-a", visualChunkIndexXZ: [0, 0] as const, shape: "full" as const,
        paletteRole: "structure" as const, semanticCaptureClassId: "worldkit.native-block.group.wall",
        blockIds: ["logical-a", "logical-b", "logical-c"],
        instances: [{ sourceBlockIds: ["logical-a", "logical-b"] }, { sourceBlockIds: ["logical-c"] }],
        mesh: f.mesh,
      };
      const [actual] = nativeBlockOcclusionBatchesFromLiveHandlesV1([batch]);
      expect(actual!.transforms).toEqual([
        { positionMetersXYZ: [3, 3, 1.5], scaleXYZ: [4, 4, 0.5] },
        { positionMetersXYZ: [13, 3, 1.5], scaleXYZ: [1, 1, 1] },
      ]);
      for (const paletteRole of ["ground", "route", "water-like-visual", "hazard"] as const) {
        expect(nativeBlockOcclusionBatchesFromLiveHandlesV1([{ ...batch, paletteRole }])).toEqual([]);
      }
      expect(nativeBlockOcclusionBatchesFromLiveHandlesV1([{ ...batch, paletteRole: "background-mass" }])).toHaveLength(1);
      expect(() => nativeBlockOcclusionBatchesFromLiveHandlesV1([{ ...batch, instances: [] }])).toThrow();
    } finally { f.engine.dispose(); }
  });

  it("uses the pinned nine-ray selection and distinguishes strong, light and missed instances", () => {
    const coverage = selectSubjectOccludingBlockInstancesV1({
      cameraPositionMetersXYZ: [0, 1, 5],
      subjectOriginPositionMetersXYZ: subject.subjectOriginPositionMetersXYZ,
      colliderCenterOffsetMetersXYZ: subject.colliderCenterOffsetMetersXYZ,
      colliderHeightMeters: 1.8, colliderRadiusMeters: 0.3,
      batches: [{ id: "batch", instances: [
        { centerMetersXYZ: [0, 1, 2.5], halfExtentsMetersXYZ: [2, 2, 0.25] },
        { centerMetersXYZ: [0, 0.95, 2.5], halfExtentsMetersXYZ: [0.02, 0.02, 0.25] },
        { centerMetersXYZ: [10, 1, 2.5], halfExtentsMetersXYZ: [1, 1, 1] },
      ] }],
    });
    expect([...coverage]).toEqual([["batch:0", 1], ["batch:1", 1 / 9]]);
  });

  it("preserves 15Hz selection, Float32 fade timing and complete transaction restoration", () => {
    const f = fixture();
    const fade = new NativeBlockSubjectOcclusionFadeV1(f.batches);
    try {
      fade.update({ ...subject, deltaSeconds: 1 / 60 });
      expect(fade.snapshot().instances[0]!.opacityRatio).toBe(Math.fround(1 - (1 / 60) / 0.15));
      expect(fade.snapshot().instances[0]!.targetOpacityRatio).toBe(0.3);
      expect(fade.snapshot().selectedInstanceCount).toBe(1);
      const saved = fade.snapshot();
      const away = { ...subject, cameraPosition: new Vector3(0, 1, -5) };
      fade.update({ ...away, deltaSeconds: 1 / 60 });
      expect(fade.snapshot().selectedInstanceCount).toBe(1);
      fade.update({ ...away, deltaSeconds: 3 / 60 });
      expect(fade.snapshot().selectedInstanceCount).toBe(0);
      fade.restore(saved);
      expect(fade.snapshot()).toEqual(saved);
      fade.update({ ...subject, deltaSeconds: 0.15 });
      expect(fade.snapshot().instances[0]!.opacityRatio).toBe(Math.fround(0.3));
      fade.update({ ...away, deltaSeconds: 0.25 });
      expect(fade.snapshot().instances).toEqual([]);
      fade.restore(saved);
      fade.reset();
      expect(fade.snapshot().instances).toEqual([]);
      expect(fade.snapshot().isSelectionInitialized).toBe(false);
      expect(JSON.stringify(fade.snapshot())).not.toContain("null");
    } finally { fade.dispose(); f.engine.dispose(); }
  });

  it("restores exact prior fade state after a throwing top/triview capture", () => {
    const f = fixture();
    const fade = new NativeBlockSubjectOcclusionFadeV1(f.batches);
    try {
      fade.update({ ...subject, deltaSeconds: 0.1 });
      const saved = fade.snapshot();
      expect(() => fade.withSuspended(() => {
        expect(fade.snapshot().isEnabled).toBe(false);
        expect(fade.snapshot().fadedInstanceCount).toBe(0);
        throw new Error("capture failed");
      })).toThrow("capture failed");
      expect(fade.snapshot()).toEqual(saved);
      expect(() => fade.restore({ ...saved, instances: [{ ...saved.instances[0]!, batchId: "foreign" }] })).toThrow();
      expect(fade.snapshot()).toEqual(saved);
    } finally {
      fade.dispose();
      expect(f.mesh.material === f.material).toBe(true);
      f.engine.dispose();
    }
  });

  it("rolls back a buffer installation failure without altering prior material ownership", () => {
    const f = fixture();
    const original = f.mesh.thinInstanceSetBuffer.bind(f.mesh);
    const setter = vi.spyOn(f.mesh, "thinInstanceSetBuffer").mockImplementation((kind, buffer, ...rest) => {
      original(kind, buffer, ...rest);
      if (kind === "worldkitOcclusionOpacity" && buffer !== null) throw new Error("buffer install failed");
    });
    try {
      expect(() => new NativeBlockSubjectOcclusionFadeV1(f.batches)).toThrow("buffer install failed");
      expect(f.mesh.material).toBe(f.material);
      expect(f.scene.materials).toEqual([f.material]);
    } finally { setter.mockRestore(); f.engine.dispose(); }
  });

  it("isolates two sessions and releases all owned materials when a buffer cleanup throws", () => {
    const a = fixture();
    const b = fixture();
    const first = new NativeBlockSubjectOcclusionFadeV1(a.batches);
    const second = new NativeBlockSubjectOcclusionFadeV1(b.batches);
    const original = a.mesh.thinInstanceSetBuffer.bind(a.mesh);
    try {
      first.update({ ...subject, deltaSeconds: 0.1 });
      expect(first.snapshot().fadedInstanceCount).toBe(1);
      expect(second.snapshot().fadedInstanceCount).toBe(0);
      vi.spyOn(a.mesh, "thinInstanceSetBuffer").mockImplementation((kind, buffer, ...rest) => {
        original(kind, buffer, ...rest);
        if (buffer === null) throw new Error("cleanup failed");
      });
      expect(() => first.dispose()).toThrow("WORLDKIT_SUBJECT_OCCLUSION_CLEANUP_FAILED");
      expect(a.mesh.material === a.material).toBe(true);
      expect(a.scene.materials.map((material) => material.name)).toEqual(["original"]);
      expect(first.snapshot().instances).toEqual([]);
      expect(() => first.dispose()).not.toThrow();
      second.update({ ...subject, deltaSeconds: 0.1 });
      expect(second.snapshot().fadedInstanceCount).toBe(1);
    } finally {
      vi.restoreAllMocks(); first.dispose(); second.dispose();
      a.engine.dispose(); b.engine.dispose();
    }
  });

  it("does not acquire the same display Mesh twice under different batch IDs", () => {
    const f = fixture();
    try {
      expect(() => new NativeBlockSubjectOcclusionFadeV1([
        f.batches[0]!, { ...f.batches[0]!, id: "batch-b" },
      ])).toThrow("WORLDKIT_SUBJECT_OCCLUSION_BATCH_ID_DUPLICATE");
      expect(f.mesh.material === f.material).toBe(true);
      expect(f.scene.materials.map((material) => material.name)).toEqual(["original"]);
    } finally { f.engine.dispose(); }
  });
});
