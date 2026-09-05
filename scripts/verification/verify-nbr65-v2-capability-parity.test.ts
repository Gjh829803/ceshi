import { access } from "node:fs/promises";
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
    expect(report.sourceEvidenceRefs).toEqual([
      "origin/codex/block-world-sdk-v2@3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05",
      "origin/codex/block-world-main-integration@8c250b5fc2181b48947d95b12fac03333bf11e5f",
      "origin/codex/block-world-main-integration@d69d7f821f10328bc02dac3a83218f924e754780",
    ]);
    expect(report.rows.map(({ capabilityId }) => capabilityId)).toEqual([
      "block-compiler-and-hidden-foundation",
      "block-source-subject-and-camera",
      "block-specific-subject-occlusion-fade",
      "block-specific-support-cache-and-mesh-inference",
      "bounded-builder-repair",
      "bounded-four-plane-contact-correction",
      "chunk-addressing-batching-and-residency",
      "clear-day-whitebox-display",
      "continuous-native-runtime-traversal",
      "continuous-walkable-and-solid-topology",
      "current-only-clean-break",
      "directed-space-transitions-and-interactions",
      "ergonomic-block-and-grid-authoring",
      "ground-movement-and-contact-correction",
      "ground-only-edge-protection",
      "incomplete-traversal-evidence",
      "metric-shapes-lattice-overlap",
      "named-planning-image-builder-feedback",
      "neutral-runtime-inspection-lighting",
      "package-capture-and-evaluation",
      "palette-visual-and-collider-groups",
      "planner-lineage-and-complete-world-continuation",
      "playthrough-episode-and-video",
      "production-outcome-and-strict-diagnostic-split",
      "provider-neutral-block-manifest",
      "reachable-space-metrics",
      "route-course-and-semantic-pose-guidance",
      "safe-exploration-start-and-capture-health",
      "semantic-front-oriented-target-triview",
      "source-block-center-and-shared-edge-adjacency",
      "spawn-target-standability",
      "step-adjacency-components-and-bands",
      "styled-output-generation",
      "subject-bound-topology-policy",
      "subject-footprint-and-clearance",
      "threejs-binding",
      "v2-adjacent-walkable-height-cap",
      "v2-asymmetric-step-thresholds",
      "v2-one-meter-auto-smoothing",
      "v2-smoothed-edge-count-metric",
      "walkable-whitebox-overlay",
      "water-flight-and-hybrid-reachability",
    ]);
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
    for (const capabilityId of [
      "source-block-center-and-shared-edge-adjacency",
      "subject-bound-topology-policy",
      "continuous-native-runtime-traversal",
      "bounded-four-plane-contact-correction",
      "route-course-and-semantic-pose-guidance",
      "named-planning-image-builder-feedback",
      "incomplete-traversal-evidence",
      "production-outcome-and-strict-diagnostic-split",
    ]) {
      expect(report.rows.find((row) => row.capabilityId === capabilityId))
        .toMatchObject({ status: "passed", diagnostics: [] });
    }
    for (const capabilityId of [
      "v2-one-meter-auto-smoothing",
      "v2-asymmetric-step-thresholds",
      "v2-adjacent-walkable-height-cap",
      "v2-smoothed-edge-count-metric",
      "semantic-front-oriented-target-triview",
    ]) {
      expect(report.rows.find((row) => row.capabilityId === capabilityId))
        .toMatchObject({ status: "not-applicable", diagnostics: [] });
    }

    const productionOutcomeSplit = report.rows.find((row) =>
      row.capabilityId === "production-outcome-and-strict-diagnostic-split");
    expect(productionOutcomeSplit?.evidenceRefs).toEqual(expect.arrayContaining([
      "scripts/reconstruction/run-production.test.ts",
      "scripts/verification/native-block-reconstruction-e2e.test.ts",
      "scripts/reconstruction/final-artifact-publisher.test.ts",
    ]));
    expect(productionOutcomeSplit?.verificationGate).toMatchObject({
      gateId: "production-loop-usability",
    });
    expect(productionOutcomeSplit?.verificationGate?.command).toEqual(
      expect.arrayContaining([
        "scripts/reconstruction/run-production.test.ts",
        "scripts/verification/native-block-reconstruction-e2e.test.ts",
        "scripts/reconstruction/final-artifact-publisher.test.ts",
      ]),
    );
    expect(productionOutcomeSplit?.verificationGate?.command).not.toContain(
      "scripts/reconstruction/production-outcome.test.ts",
    );
    await expect(access(path.join(
      repositoryRoot,
      "scripts/reconstruction/production-outcome.ts",
    ))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(path.join(
      repositoryRoot,
      "scripts/reconstruction/production-outcome.test.ts",
    ))).rejects.toMatchObject({ code: "ENOENT" });
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
