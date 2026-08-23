import { describe, expect, it } from "vitest";

import { sha256CanonicalJson } from "@whitebox-world/protocol";

import { deriveColliderSubshapeIdV1 } from "./index.js";

describe("deriveColliderSubshapeIdV1", () => {
  it("derives a canonical ID from named Entity and logical Subshape inputs", () => {
    expect(deriveColliderSubshapeIdV1("wall-east", "primary")).toBe(
      `collider-subshape:${sha256CanonicalJson({
        entityId: "wall-east",
        logicalSubshapeId: "primary",
      })}`,
    );
  });

  it("does not allow delimiter ambiguity and never includes geometry or list order", () => {
    const first = deriveColliderSubshapeIdV1("a:b", "c");
    const second = deriveColliderSubshapeIdV1("a", "b:c");

    expect(first).not.toBe(second);
    expect(first).toBe(deriveColliderSubshapeIdV1("a:b", "c"));
    expect(first).toMatch(/^collider-subshape:sha256:[a-f0-9]{64}$/);
  });

  it("fails closed on empty identity components", () => {
    expect(() => deriveColliderSubshapeIdV1("", "primary"))
      .toThrowError("COLLIDER_SUBSHAPE_ID_INVALID");
    expect(() => deriveColliderSubshapeIdV1("wall-east", ""))
      .toThrowError("COLLIDER_SUBSHAPE_ID_INVALID");
  });
});
