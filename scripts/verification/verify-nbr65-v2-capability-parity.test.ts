import path from "node:path";

import { describe, expect, it } from "vitest";

import { verifyNbr65V2CapabilityParityV1 } from
  "./verify-nbr65-v2-capability-parity.js";

describe("NBR-65 v2 capability parity verifier", () => {
  it("reports every capability independently without an aggregate score", async () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "../..");
    const report = await verifyNbr65V2CapabilityParityV1(repositoryRoot, {
      runGate: async (_root, gate) => ({
        gateId: gate.gateId,
        command: gate.command,
        exitCode: 0,
      }),
    });

    expect(report.outcome).toBe("passed");
    expect(report.rows.length).toBeGreaterThan(20);
    expect(new Set(report.rows.map(({ capabilityId }) => capabilityId)).size)
      .toBe(report.rows.length);
    expect(report.rows.some(({ status }) => status === "not-applicable"))
      .toBe(true);
    expect(report.rows.every(({ status }) =>
      status === "passed" || status === "not-applicable")).toBe(true);
    expect(report.rows.filter(({ status, capabilityId }) =>
      status === "passed" && capabilityId !== "current-only-clean-break")
      .every(({ verificationGate }) => verificationGate?.exitCode === 0))
      .toBe(true);
    expect("score" in report).toBe(false);
    expect("percentage" in report).toBe(false);
  });

  it("fails the affected capability rows when an executable gate is red", async () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "../..");
    const report = await verifyNbr65V2CapabilityParityV1(repositoryRoot, {
      runGate: async (_root, gate) => ({
        gateId: gate.gateId,
        command: gate.command,
        exitCode: gate.gateId === "ground-analysis-production" ? 1 : 0,
      }),
    });

    expect(report.outcome).toBe("failed");
    expect(report.rows.filter(({ verificationGate }) =>
      verificationGate?.gateId === "ground-analysis-production")
      .every(({ status, diagnostics }) =>
        status === "failed" && diagnostics.includes(
          "verification gate 'ground-analysis-production' exited 1",
        )))
      .toBe(true);
  });
});
