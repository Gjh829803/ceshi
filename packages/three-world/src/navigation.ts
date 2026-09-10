import type {NavigationGeometry} from './physics-navigation';
import { Detour, NavMeshQuery, Raw, init, statusDetail, type NavMesh } from '@recast-navigation/core';
import { generateTiledNavMesh } from '@recast-navigation/generators';
import { Box3, Vector3, type Object3D } from 'three';
import type { Vec3 } from './contracts';
import { extractWorldTriangles, finiteVector, isWorldVisible } from './geometry';

type NavigationOptions = {
  radiusMeters?: number;
  heightMeters?: number;
  maximumStepHeightMeters?: number;
  maximumSlopeDegrees?: number;
};
type PathResult = { status: 'success' | 'unreachable'; points: Vec3[]; reason?: string };
const MAXIMUM_TRIANGLES = 250_000;
const MAXIMUM_GRID_CELLS = 4_000_000;
const MAXIMUM_PATH_POLYGONS = 2048;
let initialization: Promise<void> | undefined;

function incomplete(status: number): boolean {
  return [Detour.DT_PARTIAL_RESULT, Detour.DT_BUFFER_TOO_SMALL, Detour.DT_OUT_OF_NODES]
    .some((flag) => statusDetail(status, flag));
}
function cleanupAll(operations: (() => void)[]): void {
  const failures: unknown[] = [];
  for (const operation of operations) {
    try { operation(); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, 'NAVIGATION_RESOURCE_CLEANUP_FAILED');
}

/** Recast ground navigation derived from the same visible triangles as rigid collision. */
export class ThreeNavigation {
  private navMesh: NavMesh | undefined;
  private query: NavMeshQuery | undefined;
  private disposed = false;
  private unavailableReason = 'NAVIGATION_NOT_BUILT';
  private verticalSearchMeters = 0.5;
  private cellSizeMeters = 0.175;

  private constructor() {}

  static async create(): Promise<ThreeNavigation> {
    if (!initialization) {
      initialization = init().catch((error: unknown) => { initialization = undefined; throw error; });
    }
    await initialization;
    return new ThreeNavigation();
  }

  rebuild(objects: readonly Object3D[] | NavigationGeometry, options: NavigationOptions = {}): void {
    if (this.disposed) throw new Error('NAVIGATION_DISPOSED');
    // Once geometry changes, the previous mesh must never authorize a stale route.
    this.clear();
    this.unavailableReason = 'NAVIGATION_BUILD_FAILED';
    const radius = options.radiusMeters ?? 0.35;
    const height = options.heightMeters ?? 1.8;
    const step = options.maximumStepHeightMeters ?? 0.35;
    const slope = options.maximumSlopeDegrees ?? 45;
    if (![radius, height, step, slope].every(Number.isFinite) || radius <= 0 || height <= 0 ||
        step < 0 || step >= height || slope < 0 || slope >= 90) {
      throw new Error('NAVIGATION_OPTIONS_INVALID');
    }
    const cellSize = Math.max(0.05, Math.min(0.2, radius / 2));
    const cellHeight = Math.min(0.1, height / 10);
    this.cellSizeMeters = cellSize;
    this.verticalSearchMeters = Math.max(0.2, step + cellHeight * 2);
    const sources: NavigationGeometry[] = [];
    let triangleCount = 0;
    if('positions' in objects){if(objects.indices.length%3||objects.positions.length%3||objects.indices.length/3>MAXIMUM_TRIANGLES||!objects.positions.every(Number.isFinite)||objects.indices.some(index=>index>=objects.positions.length/3))throw new Error('NAVIGATION_GEOMETRY_INVALID');sources.push(objects);triangleCount=objects.indices.length/3;}else{
    const seen = new Set<Object3D>();
    const visibleObjects = objects;
    // Registered entity boundaries exclude independent child subtrees from parents.
    // Keep each supplied root, including nested ones; remove only repeated identities.
    const roots = visibleObjects.filter((object) => {
      if (seen.has(object)) return false;
      seen.add(object);
      return true;
    });
    if (roots.length > 4096) throw new Error('NAVIGATION_SOURCE_BUDGET_EXCEEDED');
    for (const object of roots) {
      const source = extractWorldTriangles(object, {
        maximumColliders: 4096, maximumTriangles: MAXIMUM_TRIANGLES - triangleCount, subdivide: false,
      });
      triangleCount += source.triangleCount;
      sources.push(source);
    }
    }
    if (!triangleCount) { this.unavailableReason = 'NAVIGATION_EMPTY'; return; }
    const positions = new Float32Array(sources.reduce((sum, source) => sum + source.positions.length, 0));
    const indices = new Uint32Array(triangleCount * 3);
    const bounds = new Box3();
    const point = new Vector3();
    let positionOffset = 0, indexOffset = 0;
    for (const source of sources) {
      positions.set(source.positions, positionOffset);
      for (let i = 0; i < source.indices.length; i++) indices[indexOffset + i] = source.indices[i]! + positionOffset / 3;
      for (let i = 0; i < source.positions.length; i += 3) bounds.expandByPoint(point.fromArray(source.positions, i));
      positionOffset += source.positions.length;
      indexOffset += source.indices.length;
    }
    const width = Math.ceil((bounds.max.x - bounds.min.x) / cellSize);
    const depth = Math.ceil((bounds.max.z - bounds.min.z) / cellSize);
    if (width <= 0 || depth <= 0 || width * depth > MAXIMUM_GRID_CELLS ||
        (bounds.max.y - bounds.min.y) / cellHeight > 65_000) {
      throw new Error('NAVIGATION_GRID_BUDGET_EXCEEDED');
    }
    // An otherwise flat source still needs a nonzero vertical raster extent.
    bounds.min.y -= cellHeight;
    bounds.max.y += height + cellHeight;
    const generated = generateTiledNavMesh(positions, indices, {
      cs: cellSize, ch: cellHeight, tileSize: 64,
      walkableSlopeAngle: slope,
      walkableHeight: Math.ceil(height / cellHeight),
      walkableRadius: Math.ceil(radius / cellSize),
      walkableClimb: Math.floor(step / cellHeight),
      minRegionArea: 0, mergeRegionArea: 0,
      maxSimplificationError: 0.5,
      maxEdgeLen: Math.ceil(12 / cellSize),
      detailSampleDist: 6, detailSampleMaxError: 1,
      bounds: [bounds.min.toArray(), bounds.max.toArray()],
    }, false);
    try {
      try {
        if (!generated.success) return;
        this.navMesh = generated.navMesh;
        this.query = new NavMeshQuery(this.navMesh, { maxNodes: 8192 });
        this.unavailableReason = 'NAVIGATION_NO_WALKABLE_SURFACE';
      } finally {
        // With keepIntermediates=false the installed generator releases tile arrays;
        // the returned build context remains caller-owned on success and failure.
        generated.intermediates.buildContext.destroy();
      }
    } catch (error) {
      try { this.clear(); } catch { /* Preserve the original build failure. */ }
      throw error;
    }
  }

  findPath(from: Vec3, to: Vec3): PathResult {
    const unreachable = (reason: string): PathResult => ({ status: 'unreachable', points: [], reason });
    if (this.disposed) return unreachable('NAVIGATION_DISPOSED');
    if (!finiteVector(from) || !finiteVector(to)) return unreachable('NAVIGATION_POINT_INVALID');
    const query = this.query;
    if (!query) return unreachable(this.unavailableReason);
    const halfExtents = { x: this.cellSizeMeters * 2, y: this.verticalSearchMeters, z: this.cellSizeMeters * 2 };
    const start = query.findNearestPoly({ x: from[0], y: from[1], z: from[2] }, { halfExtents });
    const end = query.findNearestPoly({ x: to[0], y: to[1], z: to[2] }, { halfExtents });
    // Never snap a requested point sideways through a wall or onto a different floor.
    if (!start.success || !start.nearestRef || !start.isOverPoly ||
        Math.abs(start.nearestPoint.y - from[1]) > this.verticalSearchMeters) {
      return unreachable('NAVIGATION_START_OFF_MESH');
    }
    if (!end.success || !end.nearestRef || !end.isOverPoly ||
        Math.abs(end.nearestPoint.y - to[1]) > this.verticalSearchMeters) {
      return unreachable('NAVIGATION_TARGET_OFF_MESH');
    }
    const corridor = query.findPath(start.nearestRef, end.nearestRef, start.nearestPoint, end.nearestPoint, {
      maxPathPolys: MAXIMUM_PATH_POLYGONS,
    });
    try {
      // Detour can report success with a partial corridor on disconnected islands.
      if (!corridor.success || incomplete(corridor.status) || corridor.polys.size === 0 ||
          corridor.polys.get(corridor.polys.size - 1) !== end.nearestRef) {
        return unreachable('NAVIGATION_DISCONNECTED_OR_LIMITED');
      }
      const straight = query.findStraightPath(start.nearestPoint, end.nearestPoint, corridor.polys, {
        maxStraightPathPoints: MAXIMUM_PATH_POLYGONS, straightPathOptions: Detour.DT_STRAIGHTPATH_ALL_CROSSINGS,
      });
      try {
        if (!straight.success || incomplete(straight.status) || straight.straightPathCount === 0) {
          return unreachable('NAVIGATION_PATH_LIMITED');
        }
        const lastFlag = straight.straightPathFlags.get(straight.straightPathCount - 1);
        if ((lastFlag & Detour.DT_STRAIGHTPATH_END) === 0) return unreachable('NAVIGATION_PATH_INCOMPLETE');
        const points: Vec3[] = [];
        for (let i = 0; i < straight.straightPathCount; i++) {
          points.push([straight.straightPath.get(i * 3), straight.straightPath.get(i * 3 + 1), straight.straightPath.get(i * 3 + 2)]);
        }
        return { status: 'success', points };
      } finally {
        cleanupAll([
          () => straight.straightPath.destroy(), () => straight.straightPathFlags.destroy(),
          () => straight.straightPathRefs.destroy(),
        ]);
      }
    } finally { corridor.polys.destroy(); }
  }

  private clear(): void {
    const query = this.query, mesh = this.navMesh;
    this.query = undefined; this.navMesh = undefined;
    cleanupAll([
      ...(query ? [() => query.destroy(), () => Raw.destroy(query.raw), () => Raw.destroy(query.defaultFilter.raw)] : []),
      ...(mesh ? [() => mesh.destroy()] : []),
    ]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
  }
}
