import {
  AnimationClip,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
  SphereGeometry,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface HumanoidVisual {
  root: Object3D;
  clips: readonly AnimationClip[];
  rigId: string;
  status: "rigged" | "placeholder";
  limitations: readonly string[];
  dispose(): void;
}

export function prepareRiggedWhiteboxVisual(
  root: Object3D,
  clips: readonly AnimationClip[],
  rigId = "mixamo-humanoid-v1",
): HumanoidVisual {
  let skinnedMeshCount = 0;
  let hasMixamoHips = false;
  root.traverse((object) => {
    // GLTFLoader and the SDK may resolve different Three.js module instances in
    // a pnpm/Vite workspace. Three's `is*` markers are deliberately stable
    // across that boundary; `instanceof` is not.
    if (!(object as SkinnedMesh).isSkinnedMesh) return;
    const skinnedMesh = object as SkinnedMesh;
    skinnedMeshCount += 1;
    hasMixamoHips ||= skinnedMesh.skeleton.bones.some(
      (bone) =>
        bone.name.replace(/[^a-z0-9]/gi, "").toLowerCase() === "mixamorighips",
    );
  });
  if (skinnedMeshCount === 0 || !hasMixamoHips) {
    throw new Error(
      "Humanoid visual must contain a SkinnedMesh with a mixamorig:Hips bone.",
    );
  }

  const material = new MeshStandardMaterial({
    color: 0xe8e8e8,
    roughness: 0.9,
    metalness: 0,
  });
  root.traverse((object) => {
    if ((object as Mesh).isMesh) {
      const mesh = object as Mesh;
      mesh.material = material;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return {
    root,
    clips,
    rigId,
    status: "rigged",
    limitations: [],
    dispose: () => material.dispose(),
  };
}

export async function loadRiggedWhiteboxVisual(
  url: string,
  options: { loader?: GLTFLoader; rigId?: string } = {},
): Promise<HumanoidVisual> {
  const loader = options.loader ?? new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  return prepareRiggedWhiteboxVisual(
    gltf.scene,
    gltf.animations,
    options.rigId ?? "mixamo-humanoid-v1",
  );
}

/** Visible fallback for integration work. It is deliberately not presented as a rigged asset. */
export function createPlaceholderHumanoidVisual(): HumanoidVisual {
  const root = new Group();
  root.name = "humanoid-placeholder-no-skeleton";
  const material = new MeshStandardMaterial({
    color: 0xe8e8e8,
    roughness: 0.95,
    metalness: 0,
  });
  const body = new Mesh(new CapsuleGeometry(0.32, 0.75, 4, 8), material);
  body.position.y = 0.88;
  const head = new Mesh(new SphereGeometry(0.24, 12, 8), material);
  head.position.y = 1.62;
  body.castShadow = head.castShadow = true;
  body.receiveShadow = head.receiveShadow = true;
  root.add(body, head);
  return {
    root,
    clips: [],
    rigId: "placeholder-no-rig",
    status: "placeholder",
    limitations: [
      "No skeleton is bundled in the SDK yet.",
      "No animation clips can be played on this placeholder.",
    ],
    dispose: () => {
      body.geometry.dispose();
      head.geometry.dispose();
      material.dispose();
    },
  };
}
