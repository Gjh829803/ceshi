import { describe, expect, it } from "vitest";

import { projectPlannedRouteToCanonicalRouteV1 } from "./canonical-route-projection";
import type { PlannedRoute } from "./world-spec";

describe("projectPlannedRouteToCanonicalRouteV1", () => {
  it("copies only canonical Route fields and leaves Planner provenance behind", () => {
    const route: PlannedRoute = {
      id: "spawn-to-lookout",
      pointsMetersXZ: [[0, 0], [8, -12]],
      widthMeters: 2.4,
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      priority: "primary",
      maximumDesignSlopeDegrees: 35,
      evidence: "user-explicit",
    };

    expect(projectPlannedRouteToCanonicalRouteV1(route)).toEqual({
      id: "spawn-to-lookout",
      kind: "polyline-xz",
      pointsMetersXZ: [[0, 0], [8, -12]],
      widthMeters: 2.4,
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    });
  });
});
