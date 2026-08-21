import type { RouteSpecV1 } from "@whitebox-world/authoring";

import type { PlannedRoute } from "./world-spec";

export function projectPlannedRouteToCanonicalRouteV1(
  route: PlannedRoute,
): RouteSpecV1 {
  return {
    id: route.id,
    kind: "polyline-xz",
    pointsMetersXZ: route.pointsMetersXZ.map((point) => [point[0], point[1]]),
    widthMeters: route.widthMeters,
    locomotionProfileRef: route.locomotionProfileRef,
  };
}
