import { describe, expect, it } from "vitest";

import { sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";

import { createHostedCanonicalWorldGenerationRouteDecisionV1 } from
  "./world-generation-route.js";

const HASH = sha256CanonicalJson({ fixture: true }) as Sha256HashV1;

describe("the trusted Host world-generation Route owner", () => {
  it("creates Canonical only after the public dispatcher selected it explicitly", () => {
    const route = createHostedCanonicalWorldGenerationRouteDecisionV1({
      sceneId: "canonical-world",
      runId: "run-002",
      sceneBriefHash: HASH,
    });
    expect(route.decision).toEqual({
      kind: "canonical",
      authoringProfileRef: "worldkit://authoring-profile/canonical-outdoor@1",
      reasonCodes: ["user-selected-canonical"],
    });
  });
});
