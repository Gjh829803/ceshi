import { describe, expect, it } from "vitest";
import {
  mergeDiagnostics,
  summarizeDiagnostics,
  validateFeatureOwnership,
  validateFiniteTransforms,
} from "./index.js";

describe("validateFiniteTransforms", () => {
  it("reports non-finite values and zero scale", () => {
    const diagnostics = validateFiniteTransforms([
      { entityId: "valid", position: [0, 1, 2] },
      { entityId: "bad", position: [0, Number.NaN, 2], scale: [1, 0, 1] },
    ]);

    expect(diagnostics.map((item) => item.code)).toEqual([
      "TRANSFORM_NOT_FINITE",
      "TRANSFORM_ZERO_SCALE",
    ]);
  });
});

describe("validateFeatureOwnership", () => {
  it("reports missing dependencies and conflicting resource owners", () => {
    const diagnostics = validateFeatureOwnership({
      features: [
        {
          id: "lake",
          type: "lake",
          version: 1,
          resources: ["water"],
          dependencies: ["terrain"],
        },
        { id: "tower", type: "tower", version: 1, resources: ["water"] },
      ],
      resources: [
        { id: "water", kind: "surface", ownerFeatureId: "tower" },
        { id: "orphan", kind: "mesh" },
      ],
      requireEveryResourceOwned: true,
    });

    expect(diagnostics.map((item) => item.code)).toEqual([
      "FEATURE_DEPENDENCY_MISSING",
      "RESOURCE_HAS_MULTIPLE_OWNERS",
      "RESOURCE_OWNER_MISMATCH",
      "RESOURCE_UNOWNED",
    ]);
  });
});

describe("summarizeDiagnostics", () => {
  it("merges and summarizes diagnostic groups", () => {
    const diagnostics = mergeDiagnostics(
      [{ severity: "info", code: "READY", message: "ready" }],
      [
        { severity: "warning", code: "BUDGET", message: "near limit" },
        { severity: "error", code: "BROKEN", message: "broken" },
      ],
    );
    const summary = summarizeDiagnostics(diagnostics);

    expect(summary.total).toBe(3);
    expect(summary.bySeverity).toEqual({ info: 1, warning: 1, error: 1 });
    expect(summary.maxSeverity).toBe("error");
    expect(summary.hasErrors).toBe(true);
  });
});
