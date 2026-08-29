import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { launchChromiumWithSystemFallback } from "../../../scripts/lib/playwright-browser-launch";
import { startWorldkitServer } from "../../../scripts/lib/worldkit-server";

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PLACEMENT_WORLD_PATH = resolve(
  WORKSPACE_ROOT,
  "examples/authoring/placement-coastal-world.json",
);
const PACKAGE_SUBJECT_WORLD_PATH = resolve(
  WORKSPACE_ROOT,
  "examples/authoring/package-subject-world.json",
);
const PACKAGE_SUBJECT_ENTITY_IDS = [
  "pack-animal-a",
  "pack-animal-b",
  "player",
] as const;
const ORIGIN_DRIFT_TOLERANCE_METERS = 1e-9;

describe("WorldKit Browser readiness", () => {
  it("keeps page setup alive when reset starts immediately after ready", async () => {
    const server = await startWorldkitServer({
      inputPath: PLACEMENT_WORLD_PATH,
      startupTimeoutMilliseconds: 90_000,
    });
    const browser = await launchChromiumWithSystemFallback();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForFunction(() => window.__WORLDKIT__?.version === 5, undefined, {
        timeout: 90_000,
      });

      const identities = await page.evaluate(async () => {
        const runtime = window.__WORLDKIT__!;
        const ready = await runtime.ready();
        await new Promise<void>((resolveFrame) =>
          requestAnimationFrame(() => resolveFrame())
        );
        runtime.setPaused(true);
        const reset = await runtime.reset();
        return {
          readyWorldSessionId: ready.worldSessionId,
          resetWorldSessionId: reset.worldSessionId,
          simulationTick: reset.world.simulationTick,
        };
      });

      await page.waitForFunction(
        () => window.__WHITEBOX_PLAYGROUND__ !== undefined,
        undefined,
        { timeout: 30_000 },
      );
      const pageState = await page.evaluate(() => ({
        status: document.documentElement.dataset.worldkitStatus,
        canvasCount: document.querySelectorAll("canvas.world-canvas").length,
      }));

      expect(identities.resetWorldSessionId).not.toBe(
        identities.readyWorldSessionId,
      );
      expect(identities.simulationTick).toBe(0);
      expect(pageState).toEqual({ status: "ready", canvasCount: 1 });
    } finally {
      await browser.close();
      await server.stop();
    }
  }, 120_000);

  it("restores package-subject Origins to the ready snapshot after reset", async () => {
    const server = await startWorldkitServer({
      inputPath: PACKAGE_SUBJECT_WORLD_PATH,
      startupTimeoutMilliseconds: 90_000,
    });
    const browser = await launchChromiumWithSystemFallback();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForFunction(() => window.__WORLDKIT__?.version === 5, undefined, {
        timeout: 90_000,
      });

      const comparison = await page.evaluate(async (entityIds) => {
        const runtime = window.__WORLDKIT__!;
        const ready = await runtime.ready();
        const reset = await runtime.reset();
        return entityIds.map((entityId) => {
          const readyPosition =
            ready.world.subjectStatesByEntityId[entityId]!.entityState
              .positionMetersXYZ;
          const resetPosition =
            reset.world.subjectStatesByEntityId[entityId]!.entityState
              .positionMetersXYZ;
          return {
            entityId,
            readyPositionMetersXYZ: readyPosition,
            resetPositionMetersXYZ: resetPosition,
            maximumDriftMeters: Math.max(
              ...readyPosition.map((coordinate, index) =>
                Math.abs(coordinate - resetPosition[index]!),
              ),
            ),
          };
        });
      }, PACKAGE_SUBJECT_ENTITY_IDS);

      for (const subject of comparison) {
        expect(
          subject.maximumDriftMeters,
          `${subject.entityId} ready=${JSON.stringify(subject.readyPositionMetersXYZ)} reset=${JSON.stringify(subject.resetPositionMetersXYZ)}`,
        ).toBeLessThanOrEqual(ORIGIN_DRIFT_TOLERANCE_METERS);
      }
    } finally {
      await browser.close();
      await server.stop();
    }
  }, 120_000);
});
