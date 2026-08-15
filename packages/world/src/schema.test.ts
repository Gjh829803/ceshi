import { describe, expect, it } from "vitest";

import { validateParameters } from "./schema";

describe("feature parameter schema", () => {
  it("applies defaults and reports unknown values", () => {
    const result = validateParameters(
      {
        size: "positiveNumber",
        count: { type: "integer", default: 4, minimum: 1 },
      },
      { size: 10, extra: true },
    );
    expect(result.value).toEqual({ size: 10, count: 4, extra: true });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "FEATURE_PARAMETER_UNKNOWN", severity: "warning" }),
    ]);
  });

  it("returns structured diagnostics for invalid values", () => {
    const result = validateParameters(
      {
        required: "string",
        scale: { type: "number", minimum: 1, maximum: 5 },
        mode: { type: "string", values: ["low", "high"] },
      },
      { scale: 9, mode: "other" },
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "FEATURE_PARAMETER_REQUIRED",
      "FEATURE_PARAMETER_MAXIMUM",
      "FEATURE_PARAMETER_VALUE",
    ]);
  });
});
