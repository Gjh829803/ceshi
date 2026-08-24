import { describe, expect, it } from "vitest";

import { normalizeAuthoringSpecV4 } from "./normalize-v4.js";
import { createValidAuthoringSpec } from "./test-fixture.js";

describe("Authoring V4 clean break", () => {
  it("normalizes the current canonical fixture through the V4 entrypoint", () => {
    expect(normalizeAuthoringSpecV4(createValidAuthoringSpec())).toMatchObject({
      ok: true,
      value: {
        kind: "worldkit-normalized-world",
        schemaVersion: 4,
      },
    });
  });
});
