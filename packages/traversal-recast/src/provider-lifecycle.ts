import {
  freeCompactHeightfield,
  freeContourSet,
  freeHeightfield,
  freePolyMesh,
  freePolyMeshDetail,
  init,
  type NavMeshQuery,
  Raw,
} from "recast-navigation";
import {
  generateTiledNavMesh,
  type GenerateTiledNavMeshResult,
  type TiledNavMeshGeneratorIntermediates,
} from "recast-navigation/generators";

import type { RecastTiledConfigV1 } from "./recast-config.js";

export class RecastProviderLifecycleV1 {
  private initializationPromise: Promise<void> | undefined;
  private queueTail: Promise<void> = Promise.resolve();

  public constructor(
    private readonly initializeProvider: () => Promise<void>,
  ) {}

  private initializeOnce(): Promise<void> {
    this.initializationPromise ??= Promise.resolve().then(
      this.initializeProvider,
    );
    return this.initializationPromise;
  }

  public async runExclusive<T>(operation: () => Promise<T> | T): Promise<T> {
    const previous = this.queueTail;
    let release!: () => void;
    this.queueTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      await this.initializeOnce();
      return await operation();
    } finally {
      release();
    }
  }
}

const PROCESS_RECAST_PROVIDER_LIFECYCLE_V1 = new RecastProviderLifecycleV1(init);

export function runRecastProviderOperationV1<T>(
  operation: () => Promise<T> | T,
): Promise<T> {
  return PROCESS_RECAST_PROVIDER_LIFECYCLE_V1.runExclusive(operation);
}

export function generateRetainedTiledNavMeshV1(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  config: RecastTiledConfigV1,
): GenerateTiledNavMeshResult {
  return generateTiledNavMesh(positions, indices, config, true);
}

export function destroyRecastTiledOperationResourcesV1(
  query: NavMeshQuery | undefined,
  result: GenerateTiledNavMeshResult,
): void {
  const errors: unknown[] = [];
  const destroy = (operation: () => void) => {
    try {
      operation();
    } catch (error) {
      errors.push(error);
    }
  };

  if (query !== undefined) {
    destroy(() => query.destroy());
  }

  const intermediates: TiledNavMeshGeneratorIntermediates =
    result.intermediates;
  for (const tile of [...intermediates.tileIntermediates].reverse()) {
    const polyMeshDetail = tile.polyMeshDetail;
    if (polyMeshDetail !== undefined) {
      destroy(() => freePolyMeshDetail(polyMeshDetail));
    }
    const polyMesh = tile.polyMesh;
    if (polyMesh !== undefined) {
      destroy(() => freePolyMesh(polyMesh));
    }
    const contourSet = tile.contourSet;
    if (contourSet !== undefined) {
      destroy(() => freeContourSet(contourSet));
    }
    const compactHeightfield = tile.compactHeightfield;
    if (compactHeightfield !== undefined) {
      destroy(() => freeCompactHeightfield(compactHeightfield));
    }
    const heightfield = tile.heightfield;
    if (heightfield !== undefined) {
      destroy(() => freeHeightfield(heightfield));
    }
  }
  const chunkyTriMesh = intermediates.chunkyTriMesh;
  if (chunkyTriMesh !== undefined) {
    destroy(() => Raw.destroy(chunkyTriMesh.raw));
  }
  if (result.success) {
    destroy(() => result.navMesh.destroy());
  }
  destroy(() => Raw.destroy(intermediates.buildContext.raw));

  if (errors.length > 0) {
    throw new AggregateError(errors, "TRAVERSAL_RECAST_RESOURCE_CLEANUP_FAILED");
  }
}
