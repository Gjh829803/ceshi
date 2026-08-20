import { BUILT_IN_LAYOUT_SOLVER_PROFILE_REF } from "@whitebox-world/layout-solver";

import type { AuthoringSpecV2 } from "./types.js";
import type { AuthoringSpecV3, WorldNodeSpecV3 } from "./types-v3.js";

export function migrateAuthoringSpecV2ToV3(input: AuthoringSpecV2): AuthoringSpecV3 {
  if (
    input === null ||
    typeof input !== "object" ||
    input.kind !== "worldkit-authoring-spec" ||
    input.schemaVersion !== 2
  ) {
    throw new Error("AUTHORING_V2_MIGRATION_INPUT_INVALID");
  }

  const source = structuredClone(input);
  const nodes = source.nodes.map((node): WorldNodeSpecV3 => {
    if (node.kind === "camera") {
      return {
        ...node,
        components: {
          cameraRig: {
            ...node.components.cameraRig,
            thirdPerson: {
              ...node.components.cameraRig.thirdPerson,
              aspectRatio: 16 / 9,
            },
          },
        },
      };
    }
    if (node.kind !== "object" && node.kind !== "anchor") return node;
    const { transform, ...nodeWithoutTransform } = node;
    return {
      ...nodeWithoutTransform,
      placement: {
        kind: "fixed",
        transform,
      },
    };
  });
  const { schemaVersion: _schemaVersion, constraints: _constraints, ...sourceRest } = source;

  return {
    ...sourceRest,
    schemaVersion: 3,
    layout: { solverProfileRef: BUILT_IN_LAYOUT_SOLVER_PROFILE_REF },
    spatial: { regions: [], routes: [], screenRegions: [] },
    nodes,
    constraints: { placements: [] },
  };
}
