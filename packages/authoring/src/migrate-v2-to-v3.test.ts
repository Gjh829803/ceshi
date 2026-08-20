import { describe, expect, it } from "vitest";

import { stringifyCanonicalJson } from "@whitebox-world/protocol";

import basicWorldV3 from "../../../examples/authoring/basic-world.json";

import { BUILT_IN_LAYOUT_SOLVER_PROFILE_REF } from "@whitebox-world/layout-solver";
import { migrateAuthoringSpecV2ToV3 } from "./migrate-v2-to-v3.js";
import type { AuthoringSpecV3 } from "./types-v3.js";
import { validateAuthoringSpecV3 } from "./validate-v3.js";

function legacyFixture(): Parameters<typeof migrateAuthoringSpecV2ToV3>[0] {
  const source = structuredClone(basicWorldV3) as unknown as AuthoringSpecV3;
  const {
    schemaVersion: _schemaVersion,
    layout: _layout,
    spatial: _spatial,
    constraints: _constraints,
    nodes,
    ...common
  } = source;
  return {
    ...common,
    schemaVersion: 2,
    nodes: nodes.map((node) => {
      if (node.kind === "camera") {
        const { aspectRatio: _aspectRatio, ...thirdPerson } =
          node.components.cameraRig.thirdPerson;
        return {
          ...node,
          components: {
            cameraRig: { ...node.components.cameraRig, thirdPerson },
          },
        };
      }
      if (node.kind !== "object" && node.kind !== "anchor") return node;
      if (node.placement.kind !== "fixed") {
        throw new Error("Legacy fixture requires fixed placements.");
      }
      const { placement, ...nodeWithoutPlacement } = node;
      return { ...nodeWithoutPlacement, transform: placement.transform };
    }),
    constraints: {},
  };
}

describe("Authoring V2 to V3 one-time migration", () => {
  it("moves Object and Anchor transforms into fixed placements without dual truth", () => {
    const input = legacyFixture();
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
      legacyFixture(),
    );
    const second = migrateAuthoringSpecV2ToV3(
      legacyFixture(),
    );

    expect(stringifyCanonicalJson(first)).toBe(stringifyCanonicalJson(second));
    expect(() => migrateAuthoringSpecV2ToV3(first as never)).toThrow(
      "AUTHORING_V2_MIGRATION_INPUT_INVALID",
    );
  });
});
