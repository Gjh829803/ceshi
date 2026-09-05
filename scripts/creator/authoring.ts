/** Thin browser-side registration helper; geometry/materials remain ordinary Babylon meshes. */
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { BabylonNativeSceneBuildContextV1 } from "@whitebox-world/native-babylon";

export interface CreatorEntityRegistrationV1 {
  readonly id: string;
  readonly physics: "solid" | "none";
  readonly traversable?: boolean;
}
const registrations = new WeakMap<BabylonNativeSceneBuildContextV1, Set<string>>();

/** Register the exact visible mesh as its static collider; no proxy or hidden substitute. */
export function registerEntity(context: BabylonNativeSceneBuildContextV1, mesh: Mesh, options: CreatorEntityRegistrationV1): Mesh {
  if (options === null || typeof options !== "object" ||
      Object.keys(options).some((key) => !["id", "physics", "traversable"].includes(key)) ||
      typeof options.id !== "string" || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(options.id) || options.id.length > 64 ||
      !["solid", "none"].includes(options.physics) ||
      (options.traversable !== undefined && typeof options.traversable !== "boolean") ||
      (options.physics === "none" && options.traversable === true)) {
    throw new TypeError("CREATOR_ENTITY_INVALID: use a stable id, physics solid|none, and optional traversable boolean (solid only)");
  }
  if (mesh.getScene() !== context.scene || mesh.isDisposed()) throw new Error("CREATOR_ENTITY_SCENE_MISMATCH");
  const ids = registrations.get(context) ?? new Set<string>();
  if (ids.has(options.id) || mesh.metadata?.worldkitEntityId !== undefined) throw new Error(`CREATOR_ENTITY_ALREADY_REGISTERED: ${options.id}`);
  if (options.physics === "solid") {
    if (!mesh.isVisible || !mesh.isEnabled() || mesh.visibility <= 0) throw new Error("CREATOR_SOLID_MESH_MUST_BE_VISIBLE");
    context.registration.registerStaticCollider({
      id: options.id, mesh,
      traversalBinding: options.traversable === false ? { kind: "not-traversable" } : {
        kind: "static-surface", surfaceEntityId: options.id, logicalSubshapeId: "primary",
        traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1",
      },
    });
  }
  mesh.metadata = { ...mesh.metadata, worldkitEntityId: options.id };
  ids.add(options.id);
  registrations.set(context, ids);
  return mesh;
}
