import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { isNil } from "lodash-es";

import {
  parseWorldChangeSetV1,
  type WorldChangeSetV1,
} from "@whitebox-world/authoring-edit";

import { launchChromiumWithSystemFallback } from "../../../scripts/lib/playwright-browser-launch";
import { startWorldkitServer } from "../../../scripts/lib/worldkit-server";

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const BASIC_WORLD_PATH = resolve(WORKSPACE_ROOT, "examples/authoring/basic-world.json");
const ADD_HOUSE_CHANGE_SET_PATH = resolve(
  WORKSPACE_ROOT,
  "examples/authoring/p16-add-house/change-set.json",
);
const STALE_AUTHORING_SPEC_HASH = `sha256:${"a".repeat(64)}` as Sha256HashV1;
const PLAYGROUND_AUTHORING_EDIT_SESSION_ID = "session.playground.authoring-edit";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const BROWSER_V5_KEYS = [
  "acquireRuntimeActivity",
  "adjustCameraView",
  "applyCameraPreview",
  "applySubjectPresetTuning",
  "captureControlFrame",
  "captureScreenshot",
  "executeCameraViewCommand",
  "executeGameplayCommand",
  "getCameraPreviewState",
  "getCameraSnapshot",
  "getControlCaptureCapabilities",
  "getDiagnostics",
  "getGameplayInspectionSnapshot",
  "getRouteOverlay",
  "getRoutePathReceipt",
  "getRouteRuntimeProbeReceipt",
  "getRouteSummary",
  "getSnapshot",
  "getSubjectPresetBaseline",
  "getSubjectSnapshot",
  "getWorldSessionEvents",
  "getWorldStateSnapshot",
  "listCompatibleProfiles",
  "listMotionKernels",
  "listSubjectDefinitions",
  "ready",
  "releaseRuntimeActivity",
  "reset",
  "resetCameraView",
  "runFixedInput",
  "runHarness",
  "setIntent",
  "setMotionProfile",
  "setPaused",
  "validateSubjectPackage",
  "version",
  "waitForRenderReady",
  "waitForSimulationTick",
] as const;

function loadAddHouseChangeSet(id: string, baseAuthoringSpecHash: Sha256HashV1): WorldChangeSetV1 {
  const raw = JSON.parse(readFileSync(ADD_HOUSE_CHANGE_SET_PATH, "utf8")) as Record<string, unknown>;
  return parseWorldChangeSetV1({
    ...raw,
    id,
    baseAuthoringSpecHash,
  });
}

interface RuntimeIdentityProbeV1 {
  readonly runtimeKeys: readonly string[];
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly simulationTick: number;
  readonly worldStateRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly playerPositionMetersXYZ: readonly number[];
}

interface WorldChangeReceiptProbeV1 {
  readonly status: string;
  readonly mode?: string;
  readonly requestedOutcome?: string;
  readonly publicationMode?: string;
  readonly failurePhase?: string;
  readonly preparedCandidateRef?: string;
  readonly currentAuthoringSpecHash?: Sha256HashV1;
  readonly affectedIds?: {
    readonly nodeEntityIds?: readonly string[];
    readonly resourceIds?: readonly string[];
  };
  readonly currentRuntimeIdentity?: {
    readonly worldSessionId: string;
    readonly simulationTick: number;
    readonly worldPackageRootHash: string;
  };
  readonly previousRuntimeIdentity?: {
    readonly worldSessionId: string;
    readonly simulationTick: number;
    readonly worldPackageRootHash: string;
  };
  readonly diagnostics?: readonly { readonly code: string }[];
}

function pngFromDataUrl(dataUrl: string): Buffer {
  if (!dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("Expected a PNG data URL.");
  }
  return Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
}

function expectPng(buffer: Buffer): void {
  expect(buffer.byteLength).toBeGreaterThan(8);
  expect(buffer.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
}

describe("WorldKit authoring edit add-house Full Reload", () => {
  it("publishes add-house through the trusted authoring page and shows the new house", async () => {
    const staleChangeSet = loadAddHouseChangeSet(
      "change.add-house.stale",
      STALE_AUTHORING_SPEC_HASH,
    );
    const server = await startWorldkitServer({
      inputPath: BASIC_WORLD_PATH,
      startupTimeoutMilliseconds: 90_000,
    });
    const browser = await launchChromiumWithSystemFallback();
    try {
      const page = await browser.newPage();
      await page.goto(server.url, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => window.__WORLDKIT_AUTHORING_EDIT__?.version === 1 &&
          window.__WORLDKIT__?.version === 5,
        undefined,
        { timeout: 90_000 },
      );
      await page.evaluate(async () => {
        await window.__WORLDKIT__!.ready();
        window.__WORLDKIT__!.setPaused(true);
      });

      const beforeIdentity = await page.evaluate(async (): Promise<RuntimeIdentityProbeV1> => {
        const runtime = window.__WORLDKIT__!;
        const snapshot = runtime.getSnapshot();
        const worldState = runtime.getWorldStateSnapshot({
          worldStateRef: snapshot.world.worldStateRef,
        });
        return {
          runtimeKeys: Object.keys(runtime).sort(),
          runtimeSessionId: snapshot.runtimeSessionId,
          worldSessionId: snapshot.worldSessionId,
          simulationTick: snapshot.world.simulationTick,
          worldStateRef: snapshot.world.worldStateRef,
          worldPackageRootHash: worldState.worldPackageRootHash,
          playerPositionMetersXYZ:
            snapshot.world.subjectStatesByEntityId.player!.entityState.positionMetersXYZ,
        };
      });
      expect(beforeIdentity.runtimeKeys).toEqual([...BROWSER_V5_KEYS]);

      const movedBeforePrepare = await page.evaluate(async () => {
        const snapshot = await window.__WORLDKIT__!.runFixedInput([
          { actions: ["move-forward"], ticks: 30 },
        ]);
        const worldState = window.__WORLDKIT__!.getWorldStateSnapshot({
          worldStateRef: snapshot.world.worldStateRef,
        });
        return {
          worldSessionId: snapshot.worldSessionId,
          simulationTick: snapshot.world.simulationTick,
          worldPackageRootHash: worldState.worldPackageRootHash,
          playerPositionMetersXYZ:
            snapshot.world.subjectStatesByEntityId.player!.entityState.positionMetersXYZ,
        };
      });
      expect(movedBeforePrepare.worldSessionId).toBe(beforeIdentity.worldSessionId);
      expect(movedBeforePrepare.worldPackageRootHash).toBe(
        beforeIdentity.worldPackageRootHash,
      );
      expect(movedBeforePrepare.simulationTick).toBeGreaterThan(
        beforeIdentity.simulationTick,
      );
      expect(movedBeforePrepare.playerPositionMetersXYZ).not.toEqual(
        beforeIdentity.playerPositionMetersXYZ,
      );
      expect(Math.abs(
        movedBeforePrepare.playerPositionMetersXYZ[1]! -
          beforeIdentity.playerPositionMetersXYZ[1]!,
      )).toBeLessThan(0.05);

      await page.evaluate(async (tick) => {
        await window.__WORLDKIT__!.waitForRenderReady(tick);
      }, movedBeforePrepare.simulationTick);
      const beforeRuntimePng = pngFromDataUrl(
        await page.evaluate(() => window.__WORLDKIT__!.captureScreenshot()),
      );
      const beforePagePng = await page.locator("canvas.world-canvas").screenshot();
      expectPng(beforeRuntimePng);
      expectPng(beforePagePng);

      const staleDryRun = await page.evaluate(async ({
        changeSet,
        sessionId,
      }): Promise<WorldChangeReceiptProbeV1> => {
        return window.__WORLDKIT_AUTHORING_EDIT__!.dryRunWorldChange({
          kind: "worldkit-world-change-request",
          schemaVersion: 1,
          id: "request.dry-run.add-house.stale",
          authoringEditSessionId: sessionId,
          worldId: "basic-world",
          changeSet,
          mode: "dry-run",
        });
      }, {
        changeSet: staleChangeSet,
        sessionId: PLAYGROUND_AUTHORING_EDIT_SESSION_ID,
      });
      expect(staleDryRun.status).toBe("rejected");
      expect(staleDryRun.failurePhase).toBe("base-check");
      expect(staleDryRun.diagnostics?.[0]?.code).toBe(
        "WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH",
      );
      expect(staleDryRun).not.toHaveProperty("rebaseRequired");
      const currentAuthoringSpecHash = staleDryRun.currentAuthoringSpecHash;
      if (isNil(currentAuthoringSpecHash)) {
        throw new Error("stale Dry Run must return currentAuthoringSpecHash");
      }

      const browserChangeSet = loadAddHouseChangeSet(
        "change.add-house.browser",
        currentAuthoringSpecHash,
      );
      const dryRun = await page.evaluate(async ({
        changeSet,
        sessionId,
      }): Promise<WorldChangeReceiptProbeV1> => {
        return window.__WORLDKIT_AUTHORING_EDIT__!.dryRunWorldChange({
          kind: "worldkit-world-change-request",
          schemaVersion: 1,
          id: "request.dry-run.add-house.browser",
          authoringEditSessionId: sessionId,
          worldId: "basic-world",
          changeSet,
          mode: "dry-run",
        });
      }, {
        changeSet: browserChangeSet,
        sessionId: PLAYGROUND_AUTHORING_EDIT_SESSION_ID,
      });
      expect(dryRun.status).toBe("succeeded");
      expect(dryRun.publicationMode).toBe("none");
      if (isNil(dryRun.preparedCandidateRef)) {
        throw new Error("Dry Run must return preparedCandidateRef");
      }

      const publication = await page.evaluate(async ({
        changeSet,
        preparedCandidateRef,
        identity,
        sessionId,
      }) => {
        const applyPromise = window.__WORLDKIT_AUTHORING_EDIT__!.applyWorldChange({
          kind: "worldkit-world-change-request",
          schemaVersion: 1,
          id: "request.apply.add-house.browser",
          authoringEditSessionId: sessionId,
          worldId: "basic-world",
          changeSet,
          mode: "apply",
          requestedOutcome: "publish-runtime",
          preparedCandidateRef,
          runtimeExpectation: {
            runtimeSessionId: identity.runtimeSessionId,
            expectedWorldSessionId: identity.worldSessionId,
            expectedWorldPackageRootHash: identity.worldPackageRootHash,
            targetPhaseBarrier: { mode: "next-world-replacement-barrier" },
          },
        });
        let applySettled = false;
        void applyPromise.then(
          () => { applySettled = true; },
          () => { applySettled = true; },
        );
        const runtime = window.__WORLDKIT__!;
        const duringPrepareSnapshot = runtime.getSnapshot();
        const duringPrepareWorldState = runtime.getWorldStateSnapshot({
          worldStateRef: duringPrepareSnapshot.world.worldStateRef,
        });
        const applyWasPending = !applySettled;
        const afterInput = await runtime.runFixedInput([
          { actions: ["move-right"], ticks: 12 },
        ]);
        const receipt = await applyPromise;
        return {
          receipt,
          duringPrepare: {
            applyWasPending,
            worldSessionId: duringPrepareSnapshot.worldSessionId,
            worldPackageRootHash: duringPrepareWorldState.worldPackageRootHash,
            simulationTick: duringPrepareSnapshot.world.simulationTick,
            playerPositionMetersXYZ:
              duringPrepareSnapshot.world.subjectStatesByEntityId.player!.entityState
                .positionMetersXYZ,
            afterInputWorldSessionId: afterInput.worldSessionId,
            afterInputSimulationTick: afterInput.world.simulationTick,
            afterInputPlayerPositionMetersXYZ:
              afterInput.world.subjectStatesByEntityId.player!.entityState.positionMetersXYZ,
          },
        };
      }, {
        changeSet: browserChangeSet,
        preparedCandidateRef: dryRun.preparedCandidateRef,
        identity: beforeIdentity,
        sessionId: PLAYGROUND_AUTHORING_EDIT_SESSION_ID,
      });
      const applied = publication.receipt as WorldChangeReceiptProbeV1;

      if (applied.status !== "committed") {
        throw new Error(
          `expected committed publish-runtime, got ${JSON.stringify(applied)}`,
        );
      }
      expect(applied.requestedOutcome).toBe("publish-runtime");
      expect(applied.publicationMode).toBe("full-reload");
      expect(publication.duringPrepare.applyWasPending).toBe(true);
      expect(publication.duringPrepare.worldSessionId).toBe(
        beforeIdentity.worldSessionId,
      );
      expect(publication.duringPrepare.worldPackageRootHash).toBe(
        beforeIdentity.worldPackageRootHash,
      );
      expect(publication.duringPrepare.afterInputWorldSessionId).toBe(
        beforeIdentity.worldSessionId,
      );
      expect(publication.duringPrepare.afterInputSimulationTick).toBeGreaterThan(
        publication.duringPrepare.simulationTick,
      );
      expect(publication.duringPrepare.afterInputPlayerPositionMetersXYZ).not.toEqual(
        publication.duringPrepare.playerPositionMetersXYZ,
      );
      expect(applied.affectedIds?.nodeEntityIds).toContain("house-north");
      expect(applied.affectedIds?.resourceIds).toContain("house-blockout");
      expect(applied.currentRuntimeIdentity?.worldSessionId).not.toBe(
        beforeIdentity.worldSessionId,
      );
      expect(applied.currentRuntimeIdentity?.simulationTick).toBe(0);
      expect(applied.currentRuntimeIdentity?.worldPackageRootHash).not.toBe(
        beforeIdentity.worldPackageRootHash,
      );
      expect(applied.previousRuntimeIdentity).toMatchObject({
        worldSessionId: beforeIdentity.worldSessionId,
        worldPackageRootHash: beforeIdentity.worldPackageRootHash,
      });

      await page.evaluate(async () => {
        await window.__WORLDKIT__!.waitForRenderReady(0);
      });
      const afterRuntimePng = pngFromDataUrl(
        await page.evaluate(() => window.__WORLDKIT__!.captureScreenshot()),
      );
      const afterPagePng = await page.locator("canvas.world-canvas").screenshot();
      expectPng(afterRuntimePng);
      expectPng(afterPagePng);
      expect(afterRuntimePng.equals(beforeRuntimePng)).toBe(false);
      expect(afterPagePng.equals(beforePagePng)).toBe(false);

      const afterInspection = await page.evaluate(() => ({
        featureIds: window.__WHITEBOX_PLAYGROUND__.inspectFeatures().map((feature) => feature.id),
        runtimeKeys: Object.keys(window.__WORLDKIT__ ?? {}).sort(),
        worldSessionId: window.__WORLDKIT__!.getSnapshot().worldSessionId,
        simulationTick: window.__WORLDKIT__!.getSnapshot().world.simulationTick,
        worldPackageRootHash: window.__WORLDKIT__!.getWorldStateSnapshot({
          worldStateRef: window.__WORLDKIT__!.getSnapshot().world.worldStateRef,
        }).worldPackageRootHash,
        playerPositionMetersXYZ:
          window.__WORLDKIT__!.getSnapshot().world.subjectStatesByEntityId.player!
            .entityState.positionMetersXYZ,
      }));
      expect(afterInspection.featureIds).toContain("house-north");
      expect(afterInspection.runtimeKeys).toEqual([...BROWSER_V5_KEYS]);
      expect(afterInspection.worldSessionId).toBe(
        applied.currentRuntimeIdentity?.worldSessionId,
      );
      expect(afterInspection.simulationTick).toBe(0);
      expect(afterInspection.worldPackageRootHash).toBe(
        applied.currentRuntimeIdentity?.worldPackageRootHash,
      );

      const afterMovementAndReset = await page.evaluate(async () => {
        const runtime = window.__WORLDKIT__!;
        const moved = await runtime.runFixedInput([
          { actions: ["move-forward"], ticks: 24 },
        ]);
        const movedPositionMetersXYZ =
          moved.world.subjectStatesByEntityId.player!.entityState.positionMetersXYZ;
        const reset = await runtime.reset();
        await runtime.waitForRenderReady(0);
        const resetWorldState = runtime.getWorldStateSnapshot({
          worldStateRef: reset.world.worldStateRef,
        });
        return {
          movedWorldSessionId: moved.worldSessionId,
          movedSimulationTick: moved.world.simulationTick,
          movedPositionMetersXYZ,
          resetWorldSessionId: reset.worldSessionId,
          resetSimulationTick: reset.world.simulationTick,
          resetWorldPackageRootHash: resetWorldState.worldPackageRootHash,
          resetFeatureIds: window.__WHITEBOX_PLAYGROUND__
            .inspectFeatures()
            .map((feature) => feature.id),
          canvasCount: document.querySelectorAll("canvas.world-canvas").length,
        };
      });
      expect(afterMovementAndReset.movedWorldSessionId).toBe(
        applied.currentRuntimeIdentity?.worldSessionId,
      );
      expect(afterMovementAndReset.movedSimulationTick).toBeGreaterThan(0);
      expect(afterMovementAndReset.movedPositionMetersXYZ).not.toEqual(
        afterInspection.playerPositionMetersXYZ,
      );
      expect(afterMovementAndReset.resetWorldSessionId).not.toBe(
        afterMovementAndReset.movedWorldSessionId,
      );
      expect(afterMovementAndReset.resetSimulationTick).toBe(0);
      expect(afterMovementAndReset.resetWorldPackageRootHash).toBe(
        beforeIdentity.worldPackageRootHash,
      );
      expect(afterMovementAndReset.resetFeatureIds).not.toContain("house-north");
      expect(afterMovementAndReset.canvasCount).toBe(1);
    } finally {
      await browser.close();
      await server.stop();
    }
  }, 240_000);
});
