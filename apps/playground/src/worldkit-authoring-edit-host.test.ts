import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import { describe, expect, it } from "vitest";

import {
  PLAYGROUND_AUTHORING_EDIT_PROFILE_REF,
  createPlaygroundAuthoringEditHostV1,
  playgroundRegistryLockEntriesV1,
} from "./worldkit-authoring-edit-host";

describe("Playground Authoring/Edit Host", () => {
  it("seeds a trusted Edit Session from the loaded AuthoringSpec", async () => {
    const spec = createValidAuthoringSpec();
    const host = createPlaygroundAuthoringEditHostV1({
      authoringSpec: spec,
      nowUnixMilliseconds: () => 1_700_000_000_000,
    });
    expect(host.version).toBe(1);
    expect(host.currentSession().policy.allowedWorldIds).toEqual([spec.id]);
    expect(host.currentSession().hasActiveRuntimeBinding).toBe(true);
    const projection = await host.projectAiSchema({
      kind: "worldkit-ai-schema-projection-request",
      schemaVersion: 1,
      id: "request.project.playground",
      authoringEditSessionId: host.currentSession().authoringEditSessionId,
      projectionProfileRef: PLAYGROUND_AUTHORING_EDIT_PROFILE_REF,
      authoringSchemaVersion: 4,
    });
    expect(projection.projectionProfileRef).toBe(PLAYGROUND_AUTHORING_EDIT_PROFILE_REF);
    expect(playgroundRegistryLockEntriesV1().some((entry) => entry.resourceKind === "capability"))
      .toBe(true);
  });
});
