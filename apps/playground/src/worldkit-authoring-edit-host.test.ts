import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import {
  createInMemoryWorldPackageStoreV1,
  createCanonicalWorldPackageBuildContextFixtureV1,
} from "@whitebox-world/world-package/testing";
import { describe, expect, it } from "vitest";

import {
  PLAYGROUND_AUTHORING_EDIT_PROFILE_REF,
  createPlaygroundAuthoringEditHostV1,
  playgroundRegistryLockEntriesV1,
} from "./worldkit-authoring-edit-host";

describe("Playground Authoring/Edit Host", () => {
  it("rejects a WorldPackage context for a different Host profile", () => {
    const spec = createValidAuthoringSpec();
    const context = createCanonicalWorldPackageBuildContextFixtureV1();
    expect(() => createPlaygroundAuthoringEditHostV1({
      authoringSpec: spec,
      worldPackageStore: createInMemoryWorldPackageStoreV1(),
      worldPackageBuildContext: {
        ...context,
        hostCompatibility: {
          ...context.hostCompatibility,
          profileHash: `sha256:${"f".repeat(64)}`,
        },
      },
      resourceArtifacts: [],
    })).toThrow("WORLD_PACKAGE_HOST_INCOMPATIBLE");
  });

  it("seeds a trusted Edit Session from the loaded AuthoringSpec", async () => {
    const spec = createValidAuthoringSpec();
    const host = createPlaygroundAuthoringEditHostV1({
      authoringSpec: spec,
      worldPackageStore: createInMemoryWorldPackageStoreV1(),
      worldPackageBuildContext: createCanonicalWorldPackageBuildContextFixtureV1(),
      resourceArtifacts: [],
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
