import { describe, expect, it } from "vitest";

import { calculateFeatureListWindowV1 } from "./feature-list-window";

describe("Feature list window", () => {
  it("keeps a 5,738-feature inspector bounded to the visible rows plus overscan", () => {
    const window = calculateFeatureListWindowV1({
      itemCount: 5_738,
      overscanRowCount: 5,
      rowHeightPixels: 48,
      scrollTopPixels: 48 * 2_000,
      viewportHeightPixels: 432,
    });

    expect(window).toEqual({
      endIndexExclusive: 2_014,
      startIndex: 1_995,
      totalHeightPixels: 275_424,
    });
    expect(window.endIndexExclusive - window.startIndex).toBeLessThanOrEqual(20);
  });

  it("clamps invalid and end-of-list scroll positions without inventing rows", () => {
    expect(calculateFeatureListWindowV1({
      itemCount: 3,
      overscanRowCount: 4,
      rowHeightPixels: 48,
      scrollTopPixels: Number.POSITIVE_INFINITY,
      viewportHeightPixels: -1,
    })).toEqual({
      endIndexExclusive: 3,
      startIndex: 0,
      totalHeightPixels: 144,
    });

    expect(calculateFeatureListWindowV1({
      itemCount: 5_738,
      overscanRowCount: 5,
      rowHeightPixels: 48,
      scrollTopPixels: 999_999,
      viewportHeightPixels: 432,
    })).toEqual({
      endIndexExclusive: 5_738,
      startIndex: 5_724,
      totalHeightPixels: 275_424,
    });
  });
});
