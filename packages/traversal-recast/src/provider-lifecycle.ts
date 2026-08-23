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
import { isNil } from "lodash-es";

import type { RecastTiledConfigV1 } from "./recast-config.js";
import {
  destroyRecastQueryProviderV1,
  type RecastQueryProviderReceiptV1,
} from "./query-provider.js";

export interface RecastTiledGenerationOptionsV1 {
  readonly bounds?: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
  ];
  readonly sourceAreaMode?: Readonly<{
    kind: "terrain-with-static-blockers-r1";
    terrainVertexCount: number;
    blockerAreaId: 1;
  }>;
}

export class RecastProviderLifecycleV1 {
  private initializationPromise: Promise<void> | undefined;
  private queueTail: Promise<void> = Promise.resolve();

  public constructor(
    private readonly initializeProvider: () => Promise<void>,
  ) {}

  private initializeOnce(): Promise<void> {
    if (isNil(this.initializationPromise)) {
      const initializationPromise = Promise.resolve().then(
        this.initializeProvider,
      );
      this.initializationPromise = initializationPromise;
      void initializationPromise.catch(() => {
        if (this.initializationPromise === initializationPromise) {
          this.initializationPromise = undefined;
        }
      });
    }
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
const CONSUMED_RECAST_TILED_OPERATION_RECEIPTS_V1 = new WeakSet<object>();
const CONSUMED_RECAST_PROVIDER_OPERATION_RECEIPTS_V1 = new WeakSet<object>();

export interface RecastProviderOperationResourceReceiptV1 {
  readonly queryProviderReceipt: RecastQueryProviderReceiptV1;
  readonly tiledResult: GenerateTiledNavMeshResult;
}

export function runRecastProviderOperationV1<T>(
  operation: () => Promise<T> | T,
): Promise<T> {
  return PROCESS_RECAST_PROVIDER_LIFECYCLE_V1.runExclusive(operation);
}

export function generateRetainedTiledNavMeshV1(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  config: RecastTiledConfigV1,
  sourceOptions: RecastTiledGenerationOptionsV1 = {},
): GenerateTiledNavMeshResult {
  const generatorOptions = {
    ...(isNil(sourceOptions.sourceAreaMode)
      ? {}
      : { sourceAreaMode: sourceOptions.sourceAreaMode }),
    ...(isNil(sourceOptions.bounds)
      ? {}
      : {
          bounds: [
            [...sourceOptions.bounds[0]],
            [...sourceOptions.bounds[1]],
          ] as [
            [number, number, number],
            [number, number, number],
          ],
        }),
  };
  return generateTiledNavMesh(positions, indices, {
    ...config,
    ...generatorOptions,
  }, true);
}

export function destroyRecastTiledOperationResourcesV1(
  query: NavMeshQuery | undefined,
  result: GenerateTiledNavMeshResult,
): void {
  if (CONSUMED_RECAST_TILED_OPERATION_RECEIPTS_V1.has(result)) return;
  // Consume before the first release attempt. A native release may throw before
  // JavaScript can prove whether ownership was freed, so retrying is less safe
  // than preserving exactly-once release semantics while continuing this pass.
  CONSUMED_RECAST_TILED_OPERATION_RECEIPTS_V1.add(result);

  const errors: unknown[] = [];
  const destroy = (operation: () => void) => {
    try {
      operation();
    } catch (error) {
      errors.push(error);
    }
  };

  if (!isNil(query)) {
    destroy(() => query.destroy());
  }

  const intermediates: TiledNavMeshGeneratorIntermediates =
    result.intermediates;
  for (const tile of [...intermediates.tileIntermediates].reverse()) {
    const polyMeshDetail = tile.polyMeshDetail;
    if (!isNil(polyMeshDetail)) {
      destroy(() => freePolyMeshDetail(polyMeshDetail));
    }
    const polyMesh = tile.polyMesh;
    if (!isNil(polyMesh)) {
      destroy(() => freePolyMesh(polyMesh));
    }
    const contourSet = tile.contourSet;
    if (!isNil(contourSet)) {
      destroy(() => freeContourSet(contourSet));
    }
    const compactHeightfield = tile.compactHeightfield;
    if (!isNil(compactHeightfield)) {
      destroy(() => freeCompactHeightfield(compactHeightfield));
    }
    const heightfield = tile.heightfield;
    if (!isNil(heightfield)) {
      destroy(() => freeHeightfield(heightfield));
    }
  }
  const chunkyTriMesh = intermediates.chunkyTriMesh;
  if (!isNil(chunkyTriMesh)) {
    destroy(() => Raw.destroy(chunkyTriMesh.raw));
  }
  if (result.success) {
    destroy(() => result.navMesh.destroy());
  }
  destroy(() => intermediates.buildContext.destroy());

  if (errors.length > 0) {
    throw new AggregateError(errors, "TRAVERSAL_RECAST_RESOURCE_CLEANUP_FAILED");
  }
}

export function destroyRecastProviderOperationResourcesV1(
  receipt: RecastProviderOperationResourceReceiptV1,
): void {
  if (CONSUMED_RECAST_PROVIDER_OPERATION_RECEIPTS_V1.has(receipt)) return;
  CONSUMED_RECAST_PROVIDER_OPERATION_RECEIPTS_V1.add(receipt);
  const errors: unknown[] = [];
  try {
    destroyRecastQueryProviderV1(receipt.queryProviderReceipt);
  } catch (error) {
    errors.push(error);
  }
  try {
    destroyRecastTiledOperationResourcesV1(undefined, receipt.tiledResult);
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      "TRAVERSAL_RECAST_PROVIDER_OPERATION_CLEANUP_FAILED",
    );
  }
}
