import { describe, expect, it, vi } from "vitest";

vi.mock("./normalize-v3.js", () => ({
  normalizeAuthoringSpecV3: () => {
    throw new Error("V4_NORMALIZER_CALLED_SUPERSEDED_V3");
  },
}));

import { normalizeAuthoringSpecV4 } from "./normalize-v4.js";
import { createValidAuthoringSpecV4 } from "./test-fixture.js";

describe("Authoring V4 clean break", () => {
  it("normalizes a V4 document when the superseded V3 normalizer is unusable", () => {
    expect(normalizeAuthoringSpecV4(createValidAuthoringSpecV4())).toMatchObject({
      ok: true,
      value: {
        kind: "worldkit-normalized-world",
        schemaVersion: 4,
      },
    });
  });
});
