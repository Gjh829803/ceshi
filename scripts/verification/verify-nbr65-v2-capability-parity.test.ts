import path from "node:path";

import { describe, expect, it } from "vitest";

import { verifyNbr65V2CapabilityParityV1 } from
  "./verify-nbr65-v2-capability-parity.js";

describe("NBR-65 v2 capability parity verifier", () => {
  it("reports every capability independently without an aggregate score", async () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "../..");
    const report = await verifyNbr65V2CapabilityParityV1(repositoryRoot);

    expect(report.outcome).toBe("passed");
    expect(report.rows.length).toBeGreaterThan(20);
    expect(new Set(report.rows.map(({ capabilityId }) => capabilityId)).size)
      .toBe(report.rows.length);
    expect(report.rows.some(({ status }) => status === "not-applicable"))
      .toBe(true);
    expect(report.rows.every(({ status }) =>
      status === "passed" || status === "not-applicable")).toBe(true);
    expect("score" in report).toBe(false);
    expect("percentage" in report).toBe(false);
  });
});
