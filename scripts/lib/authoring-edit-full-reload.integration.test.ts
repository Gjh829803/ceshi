import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { hashAuthoringDocumentV4 } from "@whitebox-world/authoring";
import { createValidAuthoringSpec } from "@whitebox-world/authoring/testing";
import {
  parseWorldChangeRequestV1,
  parseWorldChangeSetV1,
  type Sha256HashV1,
} from "@whitebox-world/authoring-edit";
import { getAuthoringRevisionHeadV1 } from "@whitebox-world/authoring-host";
import {
  createInMemoryWorldPackageStoreV1,
  createWorldPackageBuildContextFixtureV2,
} from "@whitebox-world/world-package/testing";
import { describe, expect, it } from "vitest";

import {
  createHost,
  createPortHarness,
} from "@whitebox-world/runtime-host/testing";
import { createAuthoringEditHostBridgeV1 } from "./authoring-edit-host-bridge";

const EXAMPLES_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../examples/authoring",
);

function addHouseChangeSet(specHash: Sha256HashV1) {
  const raw = JSON.parse(
    readFileSync(join(EXAMPLES_ROOT, "p16-add-house/change-set.json"), "utf8"),
  ) as Record<string, unknown>;
  return parseWorldChangeSetV1({
    ...raw,
    baseAuthoringSpecHash: specHash,
  });
}

describe("P16-F1 Full Reload Host and RuntimeHost integration", () => {
  it("rejects a stale expectation and then publishes a new WorldSession at tick 0", async () => {
    const spec = createValidAuthoringSpec();
    const authoringSpecHash = hashAuthoringDocumentV4(spec) as Sha256HashV1;
    const { host: runtimeHost } = await createHost([
      createPortHarness(),
      createPortHarness(),
    ]);
    const previousSessionId = runtimeHost.currentWorldSessionId;
    const previousHash = runtimeHost.snapshot().worldState.worldPackageRootHash;
    const bridge = createAuthoringEditHostBridgeV1({
      authoringSpec: spec,
      worldPackageStore: createInMemoryWorldPackageStoreV1(),
      worldPackageBuildContext: createWorldPackageBuildContextFixtureV2(),
      resourceArtifacts: [],
      runtimeHost,
      nowUnixMilliseconds: () => 1_700_000_000_000,
    });
    const sessionId = bridge.host.currentSession().authoringEditSessionId;
    const changeSet = addHouseChangeSet(authoringSpecHash);
    const dryRun = await bridge.host.dryRunWorldChange(parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.dry-run.full-reload",
      authoringEditSessionId: sessionId,
      worldId: spec.id,
      changeSet,
      mode: "dry-run",
    }) as never);
    expect(dryRun.status).toBe("succeeded");
    if (dryRun.status !== "succeeded" || dryRun.mode !== "dry-run") {
      throw new Error("expected dry-run");
    }

    const stale = await bridge.host.applyWorldChange(parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.apply.stale-expectation",
      authoringEditSessionId: sessionId,
      worldId: spec.id,
      changeSet,
      mode: "apply",
      requestedOutcome: "publish-runtime",
      preparedCandidateRef: dryRun.preparedCandidateRef,
      runtimeExpectation: {
        runtimeSessionId: runtimeHost.runtimeSessionId,
        expectedWorldSessionId: previousSessionId,
        expectedWorldPackageRootHash: `sha256:${"e".repeat(64)}`,
        targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
      },
    }) as never);
    expect(stale.status).toBe("rejected");
    if (stale.status !== "rejected") throw new Error("expected stale rejection");
    expect(stale.diagnostics[0]?.code).toBe("WORLD_CHANGE_RUNTIME_EXPECTATION_STALE");
    expect(runtimeHost.currentWorldSessionId).toBe(previousSessionId);
    expect(getAuthoringRevisionHeadV1(bridge.journal, spec.id)?.authoringSpecHash).toBe(
      authoringSpecHash,
    );

    const published = await bridge.host.applyWorldChange(parseWorldChangeRequestV1({
      kind: "worldkit-world-change-request",
      schemaVersion: 1,
      id: "request.apply.publish-full-reload",
      authoringEditSessionId: sessionId,
      worldId: spec.id,
      changeSet,
      mode: "apply",
      requestedOutcome: "publish-runtime",
      preparedCandidateRef: dryRun.preparedCandidateRef,
      runtimeExpectation: {
        runtimeSessionId: runtimeHost.runtimeSessionId,
        expectedWorldSessionId: previousSessionId,
        expectedWorldPackageRootHash: previousHash,
        targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
      },
    }) as never);
    expect(published.status).toBe("committed");
    if (
      published.status !== "committed" ||
      published.mode !== "apply" ||
      published.requestedOutcome !== "publish-runtime"
    ) {
      throw new Error("expected committed publication");
    }
    expect(published.publicationMode).toBe("full-reload");
    expect(published.currentRuntimeIdentity.simulationTick).toBe(0);
    expect(published.currentRuntimeIdentity.worldSessionId).not.toBe(previousSessionId);
    expect(runtimeHost.currentWorldSessionId).toBe(
      published.currentRuntimeIdentity.worldSessionId,
    );
    expect(runtimeHost.snapshot().worldState.simulationTick).toBe(0);
    expect(getAuthoringRevisionHeadV1(bridge.journal, spec.id)?.revisionRef).toBe(
      `revision://${spec.id}/2`,
    );
  });
});
