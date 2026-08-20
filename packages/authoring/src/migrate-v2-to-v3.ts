import { BUILT_IN_LAYOUT_SOLVER_PROFILE_REF } from "@whitebox-world/layout-solver";

import type { AuthoringDocumentBase, WorldNodeSpecV2 } from "./types.js";
import type { AuthoringSpecV3, WorldNodeSpecV3 } from "./types-v3.js";

interface LegacyAuthoringSpec {
  readonly kind: AuthoringDocumentBase["kind"];
  readonly schemaVersion: 2;
  readonly id: AuthoringDocumentBase["id"];
  readonly seed: AuthoringDocumentBase["seed"];
  readonly provenance?: AuthoringDocumentBase["provenance"];
  readonly world: AuthoringDocumentBase["world"];
  readonly resources: AuthoringDocumentBase["resources"];
  readonly nodes: readonly WorldNodeSpecV2[];
  readonly relationships: AuthoringDocumentBase["relationships"];
  readonly rules: AuthoringDocumentBase["rules"];
  readonly startup: AuthoringDocumentBase["startup"];
  readonly constraints: Record<string, never>;
}

export function migrateAuthoringSpecV2ToV3(input: LegacyAuthoringSpec): AuthoringSpecV3 {
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
  const {
    schemaVersion: _schemaVersion,
    constraints: _constraints,
    provenance,
    ...sourceRest
  } = source;

  return {
    ...sourceRest,
    ...(provenance === undefined ? {} : { provenance }),
    schemaVersion: 3,
    layout: { solverProfileRef: BUILT_IN_LAYOUT_SOLVER_PROFILE_REF },
    spatial: { regions: [], routes: [], screenRegions: [] },
    nodes,
    constraints: { placements: [] },
  };
}
