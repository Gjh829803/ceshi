import { describe, expect, it } from "vitest";
import { budgetWorkloadDimensions, NATIVE_BLOCK_BUDGET_SAMPLE_COUNTS } from "./workload.js";
import { NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1 } from "../../reconstruction/native-block-production-budget.js";
import { BNA2_WHITEBOX_ADMISSION_BUDGET_V1 } from "../../native-scene/admission-budget.js";

describe("bounded Native representation measurement", () => {
  it.each(NATIVE_BLOCK_BUDGET_SAMPLE_COUNTS)("accounts for every Block in the %i workload", (count) => {
    const dimensions = budgetWorkloadDimensions(count);
    expect(dimensions.floorBlockCount + dimensions.landmarkBlockCount).toBe(count);
    expect(dimensions.floorBlockCount).toBe(count * 0.8);
    expect(dimensions.width % 4).toBe(0);
    expect(dimensions.depth % 4).toBe(0);
  });
  it.each([0, 2_001, 8_001, 100_000, NaN])("rejects an unmeasured workload size %s", (count) => {
    expect(() => budgetWorkloadDimensions(count)).toThrow(RangeError);
  });
  it("selects the measured 8k candidate without relaxing Collider or physics topology budgets", () => {
    expect(NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1).toMatchObject({
      ...BNA2_WHITEBOX_ADMISSION_BUDGET_V1,
      maximumBlockCount: 8_000, maximumOutputBytes: 4_000_000, timeoutSeconds: 1_800,
    });
  });
});
