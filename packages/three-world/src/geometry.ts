import * as THREE from 'three';

export type WorldPose = Readonly<{ position: THREE.Vector3; rotation: THREE.Quaternion; scale: THREE.Vector3 }>;
export type TriangleGeometry = Readonly<{ vertices: Float32Array; indices: Uint32Array; triangleCount: number }>;
export type CollisionTriangleGeometry = TriangleGeometry & Readonly<{sourceObject:THREE.Mesh}>;
export type GeometrySnapshot = Readonly<{ geometries: readonly CollisionTriangleGeometry[]; signature: string; pose: WorldPose }>;
const MAXIMUM_PHYSICS_EDGE_METERS = 4;
const entityBoundaries = new WeakSet<THREE.Object3D>();
/** Registry-owned extraction boundary; never derive collision ownership from author userData. */
export function setEntityBoundary(object: THREE.Object3D, enabled: boolean): void {
  if (!(object instanceof THREE.Object3D) || typeof enabled !== 'boolean') geometryError('PHYSICS_ENTITY_BOUNDARY_INVALID', 'An entity boundary needs a Three Object3D and boolean enabled flag.');
  if (enabled) entityBoundaries.add(object); else entityBoundaries.delete(object);
}
const attributeIdentities = new WeakMap<object, number>();
let nextAttributeIdentity = 1;
function attributeIdentity(attribute: object | null | undefined): number {
  if (!attribute) return 0;
  let identity = attributeIdentities.get(attribute);
  if (identity === undefined) { identity = nextAttributeIdentity++; attributeIdentities.set(attribute, identity); }
  return identity;
}

export function geometryError(code: string, message: string): never { throw new Error(`${code}: ${message}`); }
export function finiteVector(values: readonly number[], count = 3): boolean {
  return values.length === count && values.every(value => typeof value === 'number' && Number.isFinite(value) && Number.isFinite(Math.fround(value)));
}
export function worldPose(object: THREE.Object3D): WorldPose {
  // Three r185 no longer recomputes an unflagged manual matrix unless forced.
  // Refresh ancestors explicitly too: updateParents does not pass its force flag upward.
  const ancestors: THREE.Object3D[] = [];
  for (let parent = object.parent; parent; parent = parent.parent) ancestors.push(parent);
  for (let i = ancestors.length - 1; i >= 0; i--) ancestors[i]!.updateWorldMatrix(false, false, true);
  object.updateWorldMatrix(false, true, true);
  if (!object.matrixWorld.elements.every(Number.isFinite) || Math.abs(object.matrixWorld.determinant()) < 1e-12) geometryError('PHYSICS_TRANSFORM_INVALID', 'The world transform must be finite and invertible.');
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  object.matrixWorld.decompose(position, rotation, scale);
  if (!finiteVector(position.toArray()) || !finiteVector(scale.toArray()) || !finiteVector(rotation.toArray(), 4)) geometryError('PHYSICS_TRANSFORM_INVALID', 'The world transform is outside finite physics coordinates.');
  rotation.normalize();
  return { position, rotation, scale };
}
export function isWorldVisible(object: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}
export function geometryAttributeVersion(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): number {
  if (!attribute) return 0;
  return attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.version : attribute.version;
}
function visibleMeshes(root: THREE.Object3D, visit: (mesh: THREE.Mesh) => void): void {
  function walk(object: THREE.Object3D, isRoot: boolean): void {
    // Keep a hidden root's shape so showing it restores collision immediately.
    if (!isRoot && entityBoundaries.has(object)) return;
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) geometryError('PHYSICS_SKINNED_MESH_UNSUPPORTED', 'Use addCharacter for a skinned actor; rigid collision cannot silently use its unskinned bind pose.');
    if ((object as THREE.Mesh).isMesh) visit(object as THREE.Mesh);
    for (const child of object.children) walk(child, false);
  }
  walk(root, true);
}

/** Lightweight change key; attributes edited in place must use needsUpdate or explicit refresh(). */
export function geometrySignature(root: THREE.Object3D, pose = worldPose(root)): string {
  const inverseFrame = new THREE.Matrix4().compose(pose.position, pose.rotation, new THREE.Vector3(1, 1, 1)).invert();
  const parts: string[] = [];
  visibleMeshes(root, mesh => {
    const geometry = mesh.geometry, position = geometry.getAttribute('position'), index = geometry.getIndex();
    const relative = new THREE.Matrix4().multiplyMatrices(inverseFrame, mesh.matrixWorld);
    parts.push(mesh.uuid, geometry.uuid, String(attributeIdentity(position)), String(attributeIdentity(index)), String(position?.count), String(geometryAttributeVersion(position)), String(index?.count), String(geometryAttributeVersion(index ?? undefined)), String(geometry.drawRange.start), String(geometry.drawRange.count),
      relative.elements.map(value => Math.round(value * 1e8) / 1e8).join(','), String(mesh.morphTargetInfluences?.join(',')));
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      const instances = mesh as THREE.InstancedMesh;
      parts.push(String(instances.count), String(attributeIdentity(instances.instanceMatrix)), String(instances.instanceMatrix.version));
    }
  });
  return parts.join('|');
}

/** Longest-edge bisection only adds coplanar vertices; it never substitutes a floor or changes the surface. */
export function subdivideTriangles(vertices: Float32Array, indices: Uint32Array, maximumTriangles: number, maximumEdgeMeters = MAXIMUM_PHYSICS_EDGE_METERS): TriangleGeometry {
  if (!(Number.isFinite(maximumEdgeMeters) && maximumEdgeMeters > 0)) geometryError('PHYSICS_SUBDIVISION_INVALID', 'Maximum edge length must be positive.');
  const output: number[] = [], outputIndices: number[] = [];
  const limitSquared = maximumEdgeMeters * maximumEdgeMeters;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  type Triangle = [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  for (let i = 0; i < indices.length; i += 3) {
    a.fromArray(vertices, indices[i]! * 3); b.fromArray(vertices, indices[i + 1]! * 3); c.fromArray(vertices, indices[i + 2]! * 3);
    if (new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).lengthSq() < 1e-20) geometryError('PHYSICS_TRIANGLE_DEGENERATE', 'Collision triangles must have nonzero area.');
    const pending: Triangle[] = [[a.clone(), b.clone(), c.clone()]];
    while (pending.length) {
      if (outputIndices.length / 3 + pending.length > maximumTriangles) geometryError('PHYSICS_TRIANGLE_BUDGET_EXCEEDED', 'Exact surface subdivision exceeds the triangle budget.');
      const [p, q, r] = pending.pop()!;
      const lengths = [p.distanceToSquared(q), q.distanceToSquared(r), r.distanceToSquared(p)];
      const longest = Math.max(...lengths);
      if (longest > limitSquared) {
        if (longest === lengths[0]) { const mid = p.clone().add(q).multiplyScalar(.5); pending.push([p, mid, r], [mid, q, r]); }
        else if (longest === lengths[1]) { const mid = q.clone().add(r).multiplyScalar(.5); pending.push([p, q, mid], [p, mid, r]); }
        else { const mid = r.clone().add(p).multiplyScalar(.5); pending.push([p, q, mid], [mid, q, r]); }
      } else {
        const first = output.length / 3;
        output.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
        outputIndices.push(first, first + 1, first + 2);
      }
    }
  }
  return { vertices: Float32Array.from(output), indices: Uint32Array.from(outputIndices), triangleCount: outputIndices.length / 3 };
}

export function extractCollisionGeometry(root: THREE.Object3D, maximumColliders: number, maximumTriangles: number, subdivide = true, allowEmpty = false): GeometrySnapshot {
  const pose = worldPose(root), inverseFrame = new THREE.Matrix4().compose(pose.position, pose.rotation, new THREE.Vector3(1, 1, 1)).invert();
  const geometries: CollisionTriangleGeometry[] = [];
  let triangles = 0;
  visibleMeshes(root, mesh => {
    const geometry = mesh.geometry, position = geometry.getAttribute('position'), index = geometry.getIndex();
    if (!position || position.itemSize !== 3 || position.count < 3) geometryError('PHYSICS_GEOMETRY_INVALID', 'A visible mesh needs finite XYZ vertices.');
    if (mesh.morphTargetInfluences?.some(value => value !== 0)) geometryError('PHYSICS_MORPH_GEOMETRY_UNSUPPORTED', 'Bake a morphed rigid mesh before registering its collision.');
    const count = index?.count ?? position.count;
    const start = geometry.drawRange.start;
    const end = Math.min(count, start + geometry.drawRange.count);
    if (!Number.isSafeInteger(start) || start < 0 || start % 3 || end % 3 || end <= start) geometryError('PHYSICS_GEOMETRY_INVALID', 'The draw range must contain complete triangles.');
    const sourceIndices = new Uint32Array(end - start);
    if (sourceIndices.length / 3 > maximumTriangles - triangles) geometryError('PHYSICS_TRIANGLE_BUDGET_EXCEEDED', 'The source triangles exceed the available budget.');
    const referencedVertices: number[] = [], remap = new Map<number, number>();
    for (let i = start; i < end; i++) {
      const value = index ? index.getX(i) : i;
      if (!Number.isSafeInteger(value) || value < 0 || value >= position.count) geometryError('PHYSICS_GEOMETRY_INVALID', 'A triangle index is outside the vertex buffer.');
      if (!remap.has(value)) { remap.set(value, referencedVertices.length); referencedVertices.push(value); }
      sourceIndices[i - start] = remap.get(value)!;
    }
    const instances = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    if (!Number.isSafeInteger(instances) || instances < 0 || instances + geometries.length > maximumColliders) geometryError('PHYSICS_COLLIDER_BUDGET_EXCEEDED', 'The visible hierarchy exceeds the collider budget.');
    for (let instance = 0; instance < instances; instance++) {
      const world = mesh.matrixWorld.clone();
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) { const local = new THREE.Matrix4(); (mesh as THREE.InstancedMesh).getMatrixAt(instance, local); world.multiply(local); }
      const relative = new THREE.Matrix4().multiplyMatrices(inverseFrame, world);
      if (!relative.elements.every(Number.isFinite) || Math.abs(relative.determinant()) < 1e-12) geometryError('PHYSICS_TRANSFORM_INVALID', 'Mesh instances must have finite invertible transforms.');
      const vertices = new Float32Array(referencedVertices.length * 3), point = new THREE.Vector3();
      for (let i = 0; i < referencedVertices.length; i++) {
        point.fromBufferAttribute(position, referencedVertices[i]!).applyMatrix4(relative);
        if (!finiteVector(point.toArray())) geometryError('PHYSICS_GEOMETRY_INVALID', 'A transformed vertex is non-finite.');
        point.toArray(vertices, i * 3);
      }
      const indices = sourceIndices.slice();
      // Mirrored instances must preserve their outward winding after baking.
      if (relative.determinant() < 0) for (let i = 0; i < indices.length; i += 3) { const swap = indices[i + 1]!; indices[i + 1] = indices[i + 2]!; indices[i + 2] = swap; }
      const shape = subdivide ? subdivideTriangles(vertices, indices, maximumTriangles - triangles) : { vertices, indices, triangleCount: indices.length / 3 };
      triangles += shape.triangleCount;
      if (triangles > maximumTriangles) geometryError('PHYSICS_TRIANGLE_BUDGET_EXCEEDED', 'The visible hierarchy exceeds the triangle budget.');
      geometries.push({...shape,sourceObject:mesh});
    }
  });
  if (!geometries.length && !allowEmpty) geometryError('PHYSICS_GEOMETRY_EMPTY', 'The hierarchy contains no visible rigid mesh geometry.');
  return { geometries, signature: geometrySignature(root, pose), pose };
}

/** The exact same visible triangle source as fixed/kinematic trimesh collision, expressed in world coordinates for navigation. */
export function extractWorldTriangles(root: THREE.Object3D, options: { maximumColliders?: number; maximumTriangles?: number; subdivide?: boolean } = {}): Readonly<{ positions: Float32Array; indices: Uint32Array; triangleCount: number }> {
  const snapshot = extractCollisionGeometry(root, options.maximumColliders ?? 4096, options.maximumTriangles ?? 1_000_000, options.subdivide ?? true, true);
  const matrix = new THREE.Matrix4().compose(snapshot.pose.position, snapshot.pose.rotation, new THREE.Vector3(1, 1, 1));
  const positions = new Float32Array(snapshot.geometries.reduce((sum, geometry) => sum + geometry.vertices.length, 0));
  const indices = new Uint32Array(snapshot.geometries.reduce((sum, geometry) => sum + geometry.indices.length, 0));
  let vertexOffset = 0, indexOffset = 0;
  const point = new THREE.Vector3();
  for (const geometry of snapshot.geometries) {
    for (let i = 0; i < geometry.vertices.length; i += 3) point.fromArray(geometry.vertices, i).applyMatrix4(matrix).toArray(positions, vertexOffset * 3 + i);
    for (let i = 0; i < geometry.indices.length; i++) indices[indexOffset + i] = vertexOffset + geometry.indices[i]!;
    vertexOffset += geometry.vertices.length / 3;
    indexOffset += geometry.indices.length;
  }
  return { positions, indices, triangleCount: indices.length / 3 };
}
