import { describe, expect, it } from "vitest";

import { validateAuthoringFragmentV4 } from "./index.js";

describe("validateAuthoringFragmentV4", () => {
  it("accepts a Canonical prototype $def and rejects unknown keys and negative zero", () => {
    const prototype = {
      id: "house-blockout",
      version: 1,
      kind: "primitive",
      primitive: "box",
      sizeMetersXYZ: [8, 5, 10],
      collisionEnabled: true,
      semantic: { classId: "structure.house" },
    };
    const accepted = validateAuthoringFragmentV4("prototype", prototype);
    expect(accepted.ok).toBe(true);
    expect(validateAuthoringFragmentV4("prototype", {
      ...prototype,
      extra: true,
    }).ok).toBe(false);
    expect(validateAuthoringFragmentV4("prototype", {
      ...prototype,
      sizeMetersXYZ: [-0, 5, 10],
    }).ok).toBe(false);
  });
});
