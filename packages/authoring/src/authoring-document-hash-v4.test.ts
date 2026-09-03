import { describe, expect, it } from "vitest";

import {
  hashAuthoringDocumentV4,
  hashAuthoringLayoutInputV4,
  normalizeAuthoringSpecV4,
  parseAuthoringSpecV4,
  projectNormalizedWorldResourcesToLayoutIdentityV4,
  resolveAuthoringLayoutV4,
  type AuthoringSpecV4,
} from "./index.js";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { createValidAuthoringSpec } from "./test-fixture.js";

function reorderNodes(spec: AuthoringSpecV4): AuthoringSpecV4 {
  return {
    ...spec,
    nodes: [...spec.nodes].reverse(),
  };
}

describe("P16-H0 Authoring document hash clean break", () => {
  it("hashes validated Authoring document bytes without reordering or resolved resources", () => {
    const spec = createValidAuthoringSpec();
    const reordered = reorderNodes(spec);

    expect(hashAuthoringDocumentV4(spec)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashAuthoringDocumentV4(spec)).toBe(
      hashAuthoringDocumentV4(structuredClone(spec)),
    );
    expect(hashAuthoringDocumentV4(reordered)).not.toBe(
      hashAuthoringDocumentV4(spec),
    );
  });

  it("keeps object-key order out of the document hash and preserves array order", () => {
    const spec = createValidAuthoringSpec();
    const canonicalText = stringifyCanonicalJson(spec);
    const parsed = parseAuthoringSpecV4(canonicalText);
    const shuffledKeys = parseAuthoringSpecV4(
      JSON.stringify({
        schemaVersion: spec.schemaVersion,
        kind: spec.kind,
        seed: spec.seed,
        id: spec.id,
        world: spec.world,
        layout: spec.layout,
        resources: spec.resources,
        spatial: spec.spatial,
        nodes: spec.nodes,
        relationships: spec.relationships,
        rules: spec.rules,
        startup: spec.startup,
        constraints: spec.constraints,
      }),
    );

    expect(parsed.ok).toBe(true);
    expect(shuffledKeys.ok).toBe(true);
    expect(hashAuthoringDocumentV4(parsed.value!)).toBe(
      hashAuthoringDocumentV4(spec),
    );
    expect(hashAuthoringDocumentV4(shuffledKeys.value!)).toBe(
      hashAuthoringDocumentV4(spec),
    );
  });

  it("binds Normalized IR, layout input, and layout report to the document hash", () => {
    const spec = createValidAuthoringSpec();
    const documentHash = hashAuthoringDocumentV4(spec);
    const normalized = normalizeAuthoringSpecV4(spec);
    const layout = resolveAuthoringLayoutV4(spec);

    expect(normalized.ok).toBe(true);
    expect(layout.ok).toBe(true);
    expect(normalized.value?.authoringSpecHash).toBe(documentHash);
    expect(layout.value?.authoringSpecHash).toBe(documentHash);
    expect(normalized.layoutSolveReport?.authoringSpecHash).toBe(documentHash);
    expect(layout.value?.layoutInputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(normalized.layoutSolveReport?.layoutInputHash).toBe(
      layout.value?.layoutInputHash,
    );
    expect(normalized.layoutSolveReport?.layoutInputHash).not.toBe(documentHash);
  });

  it("keeps layoutInputHash stable when only non-layout connectivity changes", () => {
    const source = createValidAuthoringSpec();
    const withRoute: AuthoringSpecV4 = {
      ...source,
      spatial: {
        ...source.spatial,
        routes: [{
          id: "main-route",
          kind: "polyline-xz",
          pointsMetersXZ: [[0, 30], [12, -10]],
          widthMeters: 3,
          locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
        }],
      },
      nodes: [
        ...source.nodes,
        {
          id: "goal",
          kind: "anchor",
          placement: {
            kind: "fixed",
            transform: { positionMetersXYZ: [12, 0, -10] },
          },
          semantic: { classId: "route.destination" },
        },
      ],
      constraints: {
        placements: source.constraints.placements,
        connectivity: [{
          id: "hero-to-goal",
          kind: "connected-by-route",
          requirement: "required",
          traversingEntityId: "player",
          startAnchorEntityId: "spawn-main",
          destinationAnchorEntityId: "goal",
          routeId: "main-route",
        }],
      },
    };
    const renamedConnectivity: AuthoringSpecV4 = {
      ...withRoute,
      constraints: {
        ...withRoute.constraints,
        connectivity: withRoute.constraints.connectivity.map((row) => ({
          ...row,
          id: `${row.id}-changed`,
        })),
      },
    };

    const baseline = normalizeAuthoringSpecV4(withRoute);
    const changed = normalizeAuthoringSpecV4(renamedConnectivity);
    const layoutResources = projectNormalizedWorldResourcesToLayoutIdentityV4(
      baseline.value!.resources,
    );

    expect(baseline.ok).toBe(true);
    expect(changed.ok).toBe(true);
    expect(changed.value?.authoringSpecHash).not.toBe(
      baseline.value?.authoringSpecHash,
    );
    expect(changed.layoutSolveReport?.layoutInputHash).toBe(
      baseline.layoutSolveReport?.layoutInputHash,
    );
    expect(baseline.layoutSolveReport?.layoutInputHash).toBe(
      hashAuthoringLayoutInputV4(withRoute, {
        ...baseline.value!,
        resources: layoutResources,
      }),
    );
    expect(baseline.value?.authoringSpecHash).toBe(
      hashAuthoringDocumentV4(withRoute),
    );
  });

  it("lets Normalized IR canonicalize collection order while the document hash does not", () => {
    const spec = createValidAuthoringSpec();
    const reordered = reorderNodes(spec);
    const first = normalizeAuthoringSpecV4(spec);
    const reversed = normalizeAuthoringSpecV4(reordered);

    expect(first.ok).toBe(true);
    expect(reversed.ok).toBe(true);
    expect(first.value?.authoringSpecHash).not.toBe(
      reversed.value?.authoringSpecHash,
    );
    expect(first.normalizedWorldIrHash).not.toBe(reversed.normalizedWorldIrHash);
    expect(first.layoutSolveReport?.layoutInputHash).toBe(
      reversed.layoutSolveReport?.layoutInputHash,
    );
    expect(first.value?.nodes.map((node) => node.id)).toEqual(
      reversed.value?.nodes.map((node) => node.id),
    );
  });
});
