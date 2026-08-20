import { describe, expect, it } from "vitest";

import {
  promotePlanningManifest,
  validatePersistedCompositionReport,
  validateSubmittedCompositionReport,
} from "./composition-gate.js";

const SPEC_SHA256 = "8e636068f4dbb5fb8d6ab390b0f75f90ef71c5afd7944d378d58643d59c90324";
const PLAN_LOCK_SHA256 = "655cfa3b78da4b0c3321860d141ce55f959d4fd15eeb994535488dbc46bcc6e5";

const worldSpec = {
  id: "reference-scene",
  source: { referenceImages: ["/ref.png"] },
  entry: {
    composition: {
      guide: {
        minimumScore: 0.6,
        regions: [{ id: "sky", minimumIou: 0.5 }],
        anchors: [{
          id: "hero",
          center: [0.5, 0.5] as const,
          size: [0.2, 0.4] as const,
          tolerance: 0.1,
        }],
      },
    },
  },
};

const frozenPlan = {
  workflowVersion: 1 as const,
  sceneId: "reference-scene",
  stage: "frozen" as const,
  specSha256: SPEC_SHA256,
  files: [],
};

const planningManifest = {
  artifactVersion: 1 as const,
  workflowStage: "whitebox-built" as const,
  sceneId: "reference-scene",
  specHash: "31e6d369",
  frozenPlanSpecSha256: SPEC_SHA256,
  planLockSha256: PLAN_LOCK_SHA256,
  compiler: "whitebox-world-planning-v1",
  files: ["world-spec.json"],
  imageAssets: [],
};

const passingMetrics = {
  score: 0.8,
  minimumScore: 0.6,
  pass: false,
  regions: [{ id: "sky", iou: 0.7, minimumIou: 0.5, pass: false }],
  anchors: [{
    id: "hero",
    expectedCenter: [0.5, 0.5] as const,
    observedCenter: [0.51, 0.49] as const,
    expectedSize: [0.2, 0.4] as const,
    observedSize: [0.2, 0.4] as const,
    error: 0.02,
    tolerance: 0.1,
    pass: false,
  }],
};

const currentInput = {
  sceneId: "reference-scene",
  worldSpec,
  frozenPlan,
  planLockSha256: PLAN_LOCK_SHA256,
  planningManifest,
};

describe("composition gate", () => {
  it("rejects a missing persisted report", () => {
    expect(validatePersistedCompositionReport({
      ...currentInput,
      report: undefined,
    })).toMatchObject({
      ok: false,
      code: "COMPOSITION_REPORT_MISSING",
    });
  });

  it("rejects stale report thresholds and stale plan identity", () => {
    expect(validateSubmittedCompositionReport({
      ...currentInput,
      report: {
        ...passingMetrics,
        regions: [{ ...passingMetrics.regions[0]!, minimumIou: 0.4 }],
      },
    })).toMatchObject({ ok: false, code: "COMPOSITION_REPORT_STALE" });

    expect(validatePersistedCompositionReport({
      ...currentInput,
      report: {
        ...passingMetrics,
        planIdentity: {
          sceneId: "reference-scene",
          specHash: "31e6d369",
          frozenPlanSpecSha256: SPEC_SHA256,
          planLockSha256: `0${PLAN_LOCK_SHA256.slice(1)}`,
        },
      },
    })).toMatchObject({ ok: false, code: "COMPOSITION_REPORT_STALE" });
  });

  it("rejects metrics that recompute to a failing composition", () => {
    expect(validateSubmittedCompositionReport({
      ...currentInput,
      report: {
        ...passingMetrics,
        score: 0.4,
        pass: true,
        regions: [{ ...passingMetrics.regions[0]!, iou: 0.3, pass: true }],
      },
    })).toMatchObject({
      ok: false,
      code: "COMPOSITION_REPORT_FAILED",
    });
  });

  it("recomputes client booleans, binds current identity, and promotes only a trusted pass", () => {
    const result = validateSubmittedCompositionReport({
      ...currentInput,
      report: passingMetrics,
    });

    expect(result).toMatchObject({
      ok: true,
      trustedReport: {
        pass: true,
        regions: [{ id: "sky", pass: true }],
        anchors: [{ id: "hero", pass: true }],
        planIdentity: {
          sceneId: "reference-scene",
          specHash: "31e6d369",
          frozenPlanSpecSha256: SPEC_SHA256,
          planLockSha256: PLAN_LOCK_SHA256,
        },
      },
    });
    if (!result.ok) throw new Error(result.message);
    expect(promotePlanningManifest(planningManifest, result.trustedReport)).toEqual({
      ...planningManifest,
      workflowStage: "verified",
    });
    expect(validatePersistedCompositionReport({
      ...currentInput,
      planningManifest: { ...planningManifest, workflowStage: "verified" },
      report: result.trustedReport,
    })).toMatchObject({ ok: true });
  });
});
