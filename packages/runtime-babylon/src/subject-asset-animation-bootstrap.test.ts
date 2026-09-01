import { readFile } from "node:fs/promises";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import type { RuntimeSubjectAssetV1 } from "@whitebox-world/runtime-contracts";
import { expect, it } from "vitest";

import { SubjectAssetCacheV1 } from "./subject-asset-cache";

const animatedSubjectAsset = {
  subjectAssetRef: "worldkit://subject-asset/humanoid.golden@2",
  artifactContentHash:
    "sha256:6cf29a2c9c024bdc108a8a436255abbb5f370d658d78cca0afb30f4872cd25a8",
  byteLength: 48_060,
  mediaType: "model/gltf-binary",
  format: "glb",
  inventory: {
    meshCount: 1,
    vertexCount: 360,
    triangleCount: 180,
    skeletonCount: 1,
    boneCount: 18,
    animationClipNames: ["idle", "jump", "run", "walk"],
  },
} as const satisfies RuntimeSubjectAssetV1;

it("owns the Babylon direct-animation side effect needed by animated subjects", async () => {
  const source = await readFile(new URL("./subject-asset-cache.ts", import.meta.url), "utf8");

  expect(source).toContain(
    'import "@babylonjs/core/Animations/animatable.js";',
  );
});

it("boots Babylon direct animation before an animated subject GLB is loaded", async () => {
  const bytes = new Uint8Array(
    await readFile(
      new URL(
        "../../../apps/playground/public/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
        import.meta.url,
      ),
    ),
  );
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
    deterministicLockstep: true,
    lockstepMaxSteps: 4,
  });
  const scene = new Scene(engine);
  const cache = new SubjectAssetCacheV1(scene, {
    async resolveSubjectAsset() {
      return { bytes, sourceLabel: "memory" };
    },
  });

  try {
    const lease = await cache.acquire(animatedSubjectAsset);
    const instance = lease.instantiate("hero");

    expect(instance.animationGroups.map((group) => group.name).sort()).toEqual([
      "idle",
      "jump",
      "run",
      "walk",
    ]);

    instance.dispose();
    lease.release();
  } finally {
    await cache.dispose();
    scene.dispose();
    engine.dispose();
  }
});
