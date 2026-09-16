import * as THREE from 'three';

type XYZ = [number, number, number];

export interface SurfaceOverlapOptions {
  roots?: readonly THREE.Object3D[];
  excludeRoots?: readonly THREE.Object3D[];
  ownerIds?: ReadonlyMap<THREE.Object3D, string>;
  maxObjects?: number;
  maxTriangles?: number;
  maxPairTests?: number;
  maxFindings?: number;
  toleranceMeters?: number;
}

export interface SurfaceOverlapObjectReference {
  uuid: string;
  name: string;
  entityId: string | null;
  triangleIndex: number;
  materialIndex: number;
  /** Overlap projected onto this surface, in mesh-local metres; null if its transform is singular. */
  overlapBoundsLocalMeters: {min: XYZ; max: XYZ} | null;
}

export interface SurfaceOverlapFinding {
  id: string;
  code: 'COPLANAR_SURFACE_OVERLAP' | 'NEAR_COPLANAR_SURFACE_OVERLAP';
  objects: [SurfaceOverlapObjectReference, SurfaceOverlapObjectReference];
  boundsWorldMeters: {min: XYZ; max: XYZ};
  polygonWorldMetersXYZ: XYZ[];
  normalWorldXYZ: XYZ;
  separationMeters: number;
  overlapAreaSquareMeters: number;
  suggestedRepair: string;
}

export interface SurfaceOverlapDiagnostics {
  advisory: true;
  status: 'complete' | 'partial' | 'unavailable';
  reason?: string;
  scope: string;
  coverage: {
    objectsVisited: number;
    meshesVisited: number;
    trianglesVisited: number;
    trianglesCollected: number;
    pairTests: number;
    narrowPhaseTests: number;
    collectionSteps: number;
    skipped: Record<string, number>;
    truncated: string[];
    limits: {
      maxObjects: number;
      maxTriangles: number;
      maxPairTests: number;
      maxFindings: number;
      maxCollectionSteps: number;
      toleranceMeters: number;
    };
  };
  findings: SurfaceOverlapFinding[];
}

interface TriangleSurface {
  points: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  normal: THREE.Vector3;
  bounds: THREE.Box3;
  object: Omit<SurfaceOverlapObjectReference, 'overlapBoundsLocalMeters'>;
  localFromWorld: THREE.Matrix4 | null;
  offsetFactor: number;
  offsetUnits: number;
  facingSign: number;
  order: number;
}

const exactPlaneEpsilon = 1e-7;
const parallelNormalSquaredEpsilon = 1e-16;

function bounded(value: number | undefined, fallback: number, maximum: number): number {
  return value === undefined || Number.isNaN(value) ? fallback : Math.min(maximum, Math.max(1, Math.floor(value)));
}

/** Read local transforms without calling updateMatrix/updateMatrixWorld on authored objects. */
function worldMatrix(object: THREE.Object3D, parent: THREE.Matrix4): THREE.Matrix4 {
  if (!object.matrixWorldAutoUpdate) return object.matrixWorld.clone();
  const local = object.matrixAutoUpdate
    ? new THREE.Matrix4().compose(object.position, object.quaternion, object.scale)
    : object.matrix;
  return new THREE.Matrix4().multiplyMatrices(parent, local);
}

/** Geometry risk at the sampled pose; this does not observe temporal flicker or occlusion. */
export function inspectSurfaceOverlaps(scene: THREE.Object3D, options: SurfaceOverlapOptions = {}): SurfaceOverlapDiagnostics {
  const maxObjects = bounded(options.maxObjects, 10000, 30000);
  const maxTriangles = bounded(options.maxTriangles, 12000, 30000);
  const toleranceMeters = options.toleranceMeters === undefined || !Number.isFinite(options.toleranceMeters)
    ? .0005 : Math.min(.01, Math.max(0, options.toleranceMeters));
  const result: SurfaceOverlapDiagnostics = {
    advisory: true, status: 'complete',
    scope: 'Visible selected undeformed triangle surfaces at the sampled pose, in world metres; includes same-mesh pairs and material sidedness. Geometry risk only, without camera, occlusion, renderer-global clipping, or temporal-flicker inference. Skipped counts describe visited objects/material ranges or named pair omissions, not all descendants.',
    coverage: {
      objectsVisited: 0, meshesVisited: 0, trianglesVisited: 0, trianglesCollected: 0,
      pairTests: 0, narrowPhaseTests: 0, collectionSteps: 0, skipped: {}, truncated: [],
      limits: {maxObjects, maxTriangles, maxPairTests: bounded(options.maxPairTests, 100000, 300000),
        maxFindings: bounded(options.maxFindings, 20, 50), maxCollectionSteps: maxObjects + 4 * maxTriangles, toleranceMeters},
    }, findings: [],
  };
  const coverage = result.coverage;
  const truncate = (limit: string) => {
    result.status = 'partial';
    if (!coverage.truncated.includes(limit)) coverage.truncated.push(limit);
  };
  const skip = (reason: string, unsupported = false) => {
    coverage.skipped[reason] = (coverage.skipped[reason] ?? 0) + 1;
    if (unsupported) result.status = 'partial';
  };
  const collectionStep = () => {
    if (coverage.collectionSteps >= coverage.limits.maxCollectionSteps) {truncate('maxCollectionSteps'); return false;}
    coverage.collectionSteps++; return true;
  };
  const surfaces: TriangleSurface[] = [];
  const roots = options.roots ? new Set(options.roots.slice(0, maxObjects)) : undefined;
  const excludes = new Set(options.excludeRoots?.slice(0, maxObjects));
  if ((options.roots?.length ?? 0) > maxObjects || (options.excludeRoots?.length ?? 0) > maxObjects) {
    // Incomplete exclusions must never lead to testing a root the caller excluded.
    truncate('maxObjects'); result.reason = 'Selection exceeds the bounded object budget.'; return result;
  }
  if (roots?.size === 0) return result;

  const collectMesh = (mesh: THREE.Mesh, matrix: THREE.Matrix4, owner: string | null) => {
    coverage.meshesVisited++;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {skip('skinnedMeshes', true); return;}
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {skip('instancedMeshes', true); return;}
    if ((mesh as THREE.BatchedMesh).isBatchedMesh) {skip('batchedMeshes', true); return;}
    if (mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) {skip('renderCallbackMeshes', true); return;}
    const geometry = mesh.geometry;
    if (geometry.morphAttributes.position?.length || geometry.morphAttributes.normal?.length) {skip('morphedMeshes', true); return;}
    const position = geometry.getAttribute('position');
    if (!position || position.itemSize < 3 || (position as unknown as {isGLBufferAttribute?: boolean}).isGLBufferAttribute) {skip('unsupportedGeometry', true); return;}
    const index = geometry.index;
    const count = index?.count ?? position.count;
    const drawStart = Math.max(0, geometry.drawRange.start);
    const drawEnd = Math.min(count, drawStart + geometry.drawRange.count);
    // Three toggles frontFaceCW when matrixWorld has a negative determinant.
    // A cross product of transformed edges alone has the opposite winding then.
    const determinant = matrix.determinant();
    const frontFaceSign = determinant < 0 ? -1 : 1;
    // One immutable inverse per collected mesh, shared by its triangle records.
    const localFromWorld = determinant === 0 || !Number.isFinite(determinant) ? null : matrix.clone().invert();
    const ranges = Array.isArray(mesh.material) ? geometry.groups : [{start: 0, count, materialIndex: 0}];
    for (let groupIndex = 0; groupIndex < ranges.length; groupIndex++) {
      if (!collectionStep()) return;
      const group = ranges[groupIndex]!;
      const materialIndex = group.materialIndex ?? 0;
      const material = Array.isArray(mesh.material) ? mesh.material[materialIndex] : mesh.material;
      if (!material) {skip('missingMaterials', true); continue;}
      if (!material.visible) {skip('hiddenMaterials'); continue;}
      if (!material.depthTest || !material.colorWrite) {skip('nonDepthTestedMaterials'); continue;}
      const surfaceMaterial = material as THREE.MeshStandardMaterial;
      if (surfaceMaterial.wireframe) {skip('wireframeMaterials'); continue;}
      if ((material as THREE.ShaderMaterial).isShaderMaterial || surfaceMaterial.displacementMap
        || material.clippingPlanes?.length || material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
        || material.onBeforeRender !== THREE.Material.prototype.onBeforeRender) {
        skip('unsupportedMaterials', true); continue;
      }
      const start = Math.max(drawStart, group.start), end = Math.min(drawEnd, group.start + group.count);
      for (let offset = start; offset + 2 < end; offset += 3) {
        if (coverage.trianglesVisited >= maxTriangles) {truncate('maxTriangles'); return;}
        if (!collectionStep()) return;
        coverage.trianglesVisited++;
        const points = [0, 1, 2].map(corner => {
          const vertex = index ? index.getX(offset + corner) : offset + corner;
          return new THREE.Vector3().fromBufferAttribute(position, vertex).applyMatrix4(matrix);
        }) as TriangleSurface['points'];
        if (!points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z))) {skip('invalidTriangles', true); continue;}
        const normal = new THREE.Vector3().subVectors(points[1], points[0]).cross(new THREE.Vector3().subVectors(points[2], points[0]));
        if (normal.lengthSq() <= 1e-24) {skip('degenerateTriangles'); continue;}
        normal.normalize();
        surfaces.push({points, normal, localFromWorld, bounds: new THREE.Box3().setFromPoints(points), order: surfaces.length,
          facingSign: material.side === THREE.DoubleSide ? 0 : frontFaceSign * (material.side === THREE.BackSide ? -1 : 1),
          offsetFactor: material.polygonOffset ? material.polygonOffsetFactor : 0,
          offsetUnits: material.polygonOffset ? material.polygonOffsetUnits : 0,
          object: {uuid: mesh.uuid, name: mesh.name, entityId: owner, triangleIndex: Math.floor(offset / 3), materialIndex}});
        coverage.trianglesCollected++;
      }
    }
  };

  // A frame stores a child cursor instead of pushing every child of a wide scene.
  interface Frame {object: THREE.Object3D; matrix: THREE.Matrix4; selected: boolean; owner: string | null; child: number}
  const ancestors: THREE.Object3D[] = [];
  for (let ancestor = scene.parent; ancestor; ancestor = ancestor.parent) {
    if (ancestors.length >= maxObjects) {truncate('maxObjects'); return result;}
    ancestors.push(ancestor);
  }
  let initialMatrix = new THREE.Matrix4(), initialOwner: string | null = null;
  let initiallySelected = !roots;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i]!;
    if (!ancestor.visible || excludes.has(ancestor)) {skip('hiddenOrExcludedSubtrees'); return result;}
    initialMatrix = worldMatrix(ancestor, initialMatrix);
    initialOwner = options.ownerIds?.get(ancestor) ?? initialOwner;
    initiallySelected ||= roots?.has(ancestor) ?? false;
  }
  const stack: Frame[] = [];
  const visit = (object: THREE.Object3D, parentMatrix: THREE.Matrix4, selected: boolean, owner: string | null) => {
    if (coverage.objectsVisited >= maxObjects) {truncate('maxObjects'); return false;}
    coverage.objectsVisited++;
    if (!object.visible) {skip('hiddenSubtrees'); return true;}
    if (excludes.has(object)) {skip('excludedSubtrees'); return true;}
    const matrix = worldMatrix(object, parentMatrix);
    selected ||= roots?.has(object) ?? false;
    owner = options.ownerIds?.get(object) ?? owner;
    if (selected && (object as THREE.Mesh).isMesh) collectMesh(object as THREE.Mesh, matrix, owner);
    stack.push({object, matrix, selected, owner, child: 0});
    return true;
  };
  visit(scene, initialMatrix, initiallySelected, initialOwner);
  while (stack.length && !coverage.truncated.length) {
    const frame = stack[stack.length - 1]!;
    if (frame.child >= frame.object.children.length) {stack.pop(); continue;}
    if (!visit(frame.object.children[frame.child++]!, frame.matrix, frame.selected, frame.owner)) break;
  }

  // Pick the largest centre spread with one bounded linear pass, so a long
  // staircase does not degenerate to all pairs merely because it shares X.
  // Axis ties retain X, then Y, then Z for deterministic ordering.
  const centreBounds = new THREE.Box3(), centre = new THREE.Vector3();
  for (const surface of surfaces) centreBounds.expandByPoint(surface.bounds.getCenter(centre));
  const spread = centreBounds.getSize(new THREE.Vector3());
  let sweepAxis: 'x' | 'y' | 'z' = 'x';
  if (spread.y > spread[sweepAxis]) sweepAxis = 'y';
  if (spread.z > spread[sweepAxis]) sweepAxis = 'z';

  // Sorting is bounded by maxTriangles; every inner-loop iteration consumes a
  // pair budget, including AABB rejections. Coincident or elongated inputs cannot
  // escape the work limit through an unbounded candidate-generation pass.
  surfaces.sort((a, b) => a.bounds.min[sweepAxis] - b.bounds.min[sweepAxis] || a.order - b.order);
  pairLoop: for (let i = 0; i < surfaces.length; i++) {
    const a = surfaces[i]!;
    for (let j = i + 1; j < surfaces.length; j++) {
      if (coverage.pairTests >= coverage.limits.maxPairTests) {truncate('maxPairTests'); break pairLoop;}
      coverage.pairTests++;
      const b = surfaces[j]!;
      if (b.bounds.min[sweepAxis] > a.bounds.max[sweepAxis] + toleranceMeters) break;
      if (b.bounds.min.x > a.bounds.max.x + toleranceMeters || a.bounds.min.x > b.bounds.max.x + toleranceMeters
        || b.bounds.min.y > a.bounds.max.y + toleranceMeters || a.bounds.min.y > b.bounds.max.y + toleranceMeters
        || b.bounds.min.z > a.bounds.max.z + toleranceMeters || a.bounds.min.z > b.bounds.max.z + toleranceMeters) continue;
      if (a.offsetFactor !== b.offsetFactor || a.offsetUnits !== b.offsetUnits) {skip('depthBiasedPairs'); continue;}
      if (a.facingSign && b.facingSign && a.normal.dot(b.normal) * a.facingSign * b.facingSign < -1 + 1e-12) {
        skip('opposedSingleSidedPairs'); continue;
      }
      coverage.narrowPhaseTests++;
      const finding = intersectSurfaces(a, b, toleranceMeters);
      if (!finding) continue;
      result.findings.push({...finding, id: `surface-overlap-${result.findings.length + 1}`});
      if (result.findings.length >= coverage.limits.maxFindings) {truncate('maxFindings'); break pairLoop;}
    }
  }
  result.findings.sort((a, b) => b.overlapAreaSquareMeters - a.overlapAreaSquareMeters);
  result.findings.forEach((finding, index) => {finding.id = `surface-overlap-${index + 1}`;});
  if (result.status === 'partial') result.reason = 'Some surfaces or comparisons were omitted; inspect coverage before interpreting an empty findings list.';
  return result;
}

function intersectSurfaces(a: TriangleSurface, b: TriangleSurface, tolerance: number): Omit<SurfaceOverlapFinding, 'id'> | null {
  if (new THREE.Vector3().crossVectors(a.normal, b.normal).lengthSq() > parallelNormalSquaredEpsilon) return null;
  const origin = a.points[0];
  const distances = b.points.map(point => new THREE.Vector3().subVectors(point, origin).dot(a.normal));
  if (Math.max(...distances.map(Math.abs)) > tolerance + 1e-9) return null;
  const separation = Math.abs((distances[0]! + distances[1]! + distances[2]!) / 3);
  const u = new THREE.Vector3().subVectors(a.points[1], origin).normalize();
  const v = new THREE.Vector3().crossVectors(a.normal, u);
  const project = (point: THREE.Vector3) => {
    const delta = new THREE.Vector3().subVectors(point, origin);
    return new THREE.Vector2(delta.dot(u), delta.dot(v));
  };
  const clip = a.points.map(project);
  let polygon = b.points.map(project);
  // Sutherland-Hodgman clipping of two triangles has a fixed small work bound.
  for (let edge = 0; edge < 3; edge++) {
    const start = clip[edge]!, end = clip[(edge + 1) % 3]!;
    const distance = (point: THREE.Vector2) => (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
    const input = polygon; polygon = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i]!, previous = input[(i + input.length - 1) % input.length]!;
      const dc = distance(current), dp = distance(previous);
      if ((dc >= 0) !== (dp >= 0)) polygon.push(previous.clone().lerp(current, dp / (dp - dc)));
      if (dc >= 0) polygon.push(current);
    }
    if (polygon.length < 3) return null;
  }
  let twiceArea = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!, q = polygon[(i + 1) % polygon.length]!;
    twiceArea += p.x * q.y - p.y * q.x;
  }
  const area = Math.abs(twiceArea) / 2;
  // The projected arithmetic uses local lengths, so its roundoff scales with
  // triangle size squared rather than an arbitrary minimum physical overlap.
  // This removes shared-edge slivers while preserving millimetre overlaps.
  const scaleSquared = Math.max(a.bounds.getSize(new THREE.Vector3()).lengthSq(), b.bounds.getSize(new THREE.Vector3()).lengthSq());
  if (area <= Math.max(1e-12, scaleSquared * Number.EPSILON * 32)) return null;
  const worldPolygon = polygon.map(point => origin.clone().addScaledVector(u, point.x).addScaledVector(v, point.y));
  const bounds = new THREE.Box3().setFromPoints(worldPolygon);
  const reference = (surface: TriangleSurface): SurfaceOverlapObjectReference => {
    let overlapBoundsLocalMeters: SurfaceOverlapObjectReference['overlapBoundsLocalMeters'] = null;
    if (surface.localFromWorld) {
      // Near-coplanar surfaces have distinct planes. Map the overlap onto each
      // plane before converting it into that object's own authoring coordinates.
      const localPoints = worldPolygon.map(point => {
        const distance = new THREE.Vector3().subVectors(point, surface.points[0]).dot(surface.normal);
        return point.clone().addScaledVector(surface.normal, -distance).applyMatrix4(surface.localFromWorld!);
      });
      if (localPoints.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z))) {
        const localBounds = new THREE.Box3().setFromPoints(localPoints);
        overlapBoundsLocalMeters = {min: localBounds.min.toArray(), max: localBounds.max.toArray()};
      }
    }
    return {...surface.object, overlapBoundsLocalMeters};
  };
  return {
    code: separation <= exactPlaneEpsilon ? 'COPLANAR_SURFACE_OVERLAP' : 'NEAR_COPLANAR_SURFACE_OVERLAP',
    objects: [reference(a), reference(b)], boundsWorldMeters: {min: bounds.min.toArray(), max: bounds.max.toArray()},
    polygonWorldMetersXYZ: worldPolygon.map(point => point.toArray()), normalWorldXYZ: a.normal.toArray(),
    separationMeters: separation, overlapAreaSquareMeters: area,
    suggestedRepair: 'Remove duplicate covered faces or separate the intended surfaces; use distinct polygon offset only for intentional overlays.',
  };
}
