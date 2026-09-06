import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** Capture partial synchronous construction, not the Scene's unrelated meshes. */
export function createOwnedNativeBlockBoxV1(
  scene: Scene,
  name: string,
  owned: Set<AbstractMesh>,
): Mesh {
  // Babylon's onNewMeshAddedObservable is deferred until after construction.
  // Its synchronous registration port is the only point available on a throw.
  const descriptor = Object.getOwnPropertyDescriptor(scene, "addMesh");
  const addMesh = scene.addMesh;
  Object.defineProperty(scene, "addMesh", {
    configurable: true, writable: true,
    value(mesh: AbstractMesh, recursive = false) {
      owned.add(mesh);
      return addMesh.call(scene, mesh, recursive);
    },
  });
  try {
    return MeshBuilder.CreateBox(name, { size: 1 }, scene);
  } finally {
    if (descriptor === undefined) Reflect.deleteProperty(scene, "addMesh");
    else Object.defineProperty(scene, "addMesh", descriptor);
  }
}
