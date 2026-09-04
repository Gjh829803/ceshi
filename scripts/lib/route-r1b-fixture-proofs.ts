import type { RouteBuildInputReceiptV2 } from "@whitebox-world/traversal";

import {
  buildTraversalGraphFromSnapshotV2,
  type RecastNavMeshAuditSnapshotV1,
  type TraversalGraphProjectionV2,
} from "@whitebox-world/traversal-recast/audit";

type SurfaceCorrelationProjectionV2 = Extract<
  TraversalGraphProjectionV2,
  {
    readonly status: "incomplete";
    readonly reason: string;
  }
>;
type SurfaceCorrelationMissingProjectionV2 = Omit<
  SurfaceCorrelationProjectionV2,
  "reason"
> & Readonly<{ reason: "surface-correlation-missing" }>;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * Creates a trusted-host-only provider projection fault around the admitted
 * start anchor. X/Z remains inside the real hard ribbon, while the injected
 * polygon's height is deliberately outside every canonical source. The
 * production Graph projector must therefore fail closed against the exact
 * fixture Build Input rather than a synthetic replacement receipt.
 */
export function createRouteSurfaceCorrelationMissingProjectionV2(
  receipt: RouteBuildInputReceiptV2,
): SurfaceCorrelationMissingProjectionV2 {
  const [startX, startY, startZ] = receipt.input.startAnchor.positionMetersXYZ;
  const halfWidthMeters = Math.max(
    receipt.input.capabilityEnvelope.positionQuantizationMeters,
    0.01,
  );
  const injectedHeightMeters =
    startY + receipt.input.capabilityEnvelope.capsuleHeightMeters + 10;
  const snapshot: RecastNavMeshAuditSnapshotV1 = deepFreeze({
    kind: "recast-navmesh-audit-snapshot",
    schemaVersion: 1,
    nullLinkIndex: 0xffff_ffff,
    tiles: [{
      tileX: 0,
      tileZ: 0,
      tileLayer: 0,
      maximumLinkCount: 0,
      offMeshConnectionCount: 0,
      verticesMetersXYZ: [
        [startX - halfWidthMeters, injectedHeightMeters, startZ - halfWidthMeters],
        [startX + halfWidthMeters, injectedHeightMeters, startZ - halfWidthMeters],
        [startX + halfWidthMeters, injectedHeightMeters, startZ + halfWidthMeters],
        [startX - halfWidthMeters, injectedHeightMeters, startZ + halfWidthMeters],
      ],
      polygons: [{
        providerPolygonRef: 1,
        providerType: 0,
        areaId: 2,
        flags: 1,
        vertexIndices: [0, 1, 2, 3],
        firstLinkIndex: 0xffff_ffff,
        detailTrianglesMetersXYZ: [
          [
            [startX - halfWidthMeters, injectedHeightMeters, startZ - halfWidthMeters],
            [startX + halfWidthMeters, injectedHeightMeters, startZ + halfWidthMeters],
            [startX + halfWidthMeters, injectedHeightMeters, startZ - halfWidthMeters],
          ],
          [
            [startX - halfWidthMeters, injectedHeightMeters, startZ - halfWidthMeters],
            [startX - halfWidthMeters, injectedHeightMeters, startZ + halfWidthMeters],
            [startX + halfWidthMeters, injectedHeightMeters, startZ + halfWidthMeters],
          ],
        ],
      }],
      links: [],
    }],
  });
  const projection = buildTraversalGraphFromSnapshotV2(snapshot, receipt);
  if (
    projection.status !== "incomplete" ||
    !("reason" in projection) ||
    projection.reason !== "surface-correlation-missing"
  ) {
    throw new Error(
      "WORLDKIT_ROUTE_CORRELATION_ADVERSARIAL_PROOF_DID_NOT_FAIL_CLOSED",
    );
  }
  return deepFreeze({
    status: "incomplete" as const,
    reason: "surface-correlation-missing" as const,
    relatedTraversalSurfaceIdentities:
      projection.relatedTraversalSurfaceIdentities,
    failurePositionMetersXYZ: projection.failurePositionMetersXYZ,
  });
}
