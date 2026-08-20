import { describe, expect, it } from "vitest";

import { stringifyCanonicalJson } from "@whitebox-world/protocol";

import basicWorldV2 from "../../../examples/authoring/basic-world.json";

import {
  BUILT_IN_LAYOUT_SOLVER_PROFILE_REF,
  migrateAuthoringSpecV2ToV3,
  validateAuthoringSpecV3,
  type AuthoringSpecV2,
} from "./index.js";

describe("Authoring V2 to V3 one-time migration", () => {
  it("moves Object and Anchor transforms into fixed placements without dual truth", () => {
    const input = structuredClone(basicWorldV2) as unknown as AuthoringSpecV2;
    const originalBytes = stringifyCanonicalJson(input);
    const migrated = migrateAuthoringSpecV2ToV3(input);

    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.layout).toEqual({
      solverProfileRef: BUILT_IN_LAYOUT_SOLVER_PROFILE_REF,
    });
    expect(migrated.spatial).toEqual({ regions: [], routes: [], screenRegions: [] });
    expect(migrated.constraints).toEqual({ placements: [] });
    expect(
      migrated.nodes.find((node) => node.kind === "camera")?.components.cameraRig.thirdPerson
        .aspectRatio,
    ).toBe(16 / 9);
    for (const node of migrated.nodes) {
      if (node.kind !== "object" && node.kind !== "anchor") continue;
      expect(node).not.toHaveProperty("transform");
      expect(node.placement).toMatchObject({ kind: "fixed" });
    }
    expect(validateAuthoringSpecV3(migrated).ok).toBe(true);
    expect(stringifyCanonicalJson(input)).toBe(originalBytes);
  });

  it("is deterministic and rejects non-V2 input instead of becoming a runtime fallback", () => {
    const first = migrateAuthoringSpecV2ToV3(
      structuredClone(basicWorldV2) as unknown as AuthoringSpecV2,
    );
    const second = migrateAuthoringSpecV2ToV3(
      structuredClone(basicWorldV2) as unknown as AuthoringSpecV2,
    );

    expect(stringifyCanonicalJson(first)).toBe(stringifyCanonicalJson(second));
    expect(() => migrateAuthoringSpecV2ToV3(first as never)).toThrow(
      "AUTHORING_V2_MIGRATION_INPUT_INVALID",
    );
  });
});
