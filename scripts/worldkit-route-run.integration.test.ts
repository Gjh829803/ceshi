import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { isNil } from "lodash-es";
import { chromium, type Browser } from "playwright";
import { describe, expect, it } from "vitest";

import { loadWorldkitRoutePipeline } from "./lib/worldkit-pipeline";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);
const ROUTE_SELECTOR = {
  constraintId: "player-can-reach-watchtower",
  routeId: "spawn-to-watchtower",
} as const;

interface WorldkitRunReadyV1 {
  readonly ok: true;
  readonly url: string;
  readonly port: number;
}

async function allocateAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (isNil(address) || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate a local integration-test port."));
        return;
      }
      server.close((error) => {
        if (isNil(error)) resolve(address.port);
        else reject(error);
      });
    });
  });
}

function waitForWorldkitRunReady(
  child: ChildProcessWithoutNullStreams,
  timeoutMilliseconds: number,
): Promise<WorldkitRunReadyV1> {
  return new Promise((resolve, reject) => {
    let stdoutBuffer = "";
    let stdoutTranscript = "";
    let stderr = "";
    let settled = false;
    const finish = (
      callback: () => void,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off("exit", onExit);
      child.stdout.off("data", onStdout);
      callback();
    };
    const tryResolveLine = (line: string): void => {
      try {
        const value = JSON.parse(line) as Partial<WorldkitRunReadyV1>;
        if (
          value.ok === true &&
          typeof value.url === "string" &&
          Number.isSafeInteger(value.port)
        ) {
          finish(() => resolve(value as WorldkitRunReadyV1));
        }
      } catch {
        // Babylon may log its version before the CLI emits canonical JSON.
      }
    };
    const onStdout = (chunk: Buffer | string): void => {
      stdoutTranscript += String(chunk);
      stdoutBuffer += String(chunk);
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) tryResolveLine(line.trim());
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      finish(() => reject(new Error(
        `worldkit run exited before readiness (code=${String(code)}, signal=${String(signal)}).\n${stdoutTranscript}\n${stderr}`,
      )));
    };
    const timeout = setTimeout(() => {
      finish(() => reject(new Error(
        `worldkit run did not become ready within ${timeoutMilliseconds}ms.\n${stdoutTranscript}\n${stderr}`,
      )));
    }, timeoutMilliseconds);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", onStdout);
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("exit", onExit);
  });
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMilliseconds: number,
): Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }> {
  if (!isNil(child.exitCode) || !isNil(child.signalCode)) {
    return { code: child.exitCode, signal: child.signalCode };
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      reject(new Error("worldkit run did not stop after SIGTERM."));
    }, timeoutMilliseconds);
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      clearTimeout(timeout);
      resolve({ code, signal });
    };
    child.once("exit", onExit);
  });
}

async function ownedRouteEvidenceDirectories(
  ownerProcessId: number,
): Promise<readonly string[]> {
  const prefix = `worldkit-route-evidence-${ownerProcessId}-`;
  return (await readdir(tmpdir()))
    .filter((entry) => entry.startsWith(prefix))
    .sort();
}

async function stopWorldkitRun(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (!isNil(child.exitCode) || !isNil(child.signalCode)) return;
  child.kill("SIGTERM");
  try {
    await waitForExit(child, 10_000);
  } catch (error) {
    child.kill("SIGKILL");
    await waitForExit(child, 5_000).catch(() => undefined);
    throw error;
  }
}

describe("worldkit run trusted Route Host transport", () => {
  it("publishes same-world trusted Route evidence through Browser V5 and cleans owned state", async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), "worldkit-route-run-integration-"),
    );
    let child: ChildProcessWithoutNullStreams | undefined;
    let browser: Browser | undefined;
    try {
      const inputPath = path.join(temporaryDirectory, "world.json");
      const fixture = JSON.parse(await readFile(
        new URL("../examples/traversal/route-r0-contract.json", import.meta.url),
        "utf8",
      )) as { authoringSpec: unknown };
      const authoringSpec = structuredClone(fixture.authoringSpec) as {
        nodes: Array<{
          kind: string;
          components?: { terrain?: { source: unknown } };
        }>;
      };
      authoringSpec.nodes = authoringSpec.nodes.filter(
        ({ kind }) => kind !== "water",
      );
      const terrain = authoringSpec.nodes.find(({ kind }) => kind === "terrain");
      if (terrain?.components?.terrain === undefined) {
        throw new Error("Route integration fixture terrain is missing.");
      }
      terrain.components.terrain.source = {
        kind: "procedural",
        relief: "flat",
      };
      await writeFile(inputPath, JSON.stringify(authoringSpec), "utf8");

      const pipeline = await loadWorldkitRoutePipeline(inputPath);
      if (!pipeline.ok) {
        throw new Error(
          `Route integration fixture is invalid: ${JSON.stringify(pipeline.diagnostics)}`,
        );
      }
      const expectedWorldHashes = {
        authoringSpecHash: pipeline.normalizedWorldIr.authoringSpecHash,
        normalizedWorldIrHash: pipeline.normalizedWorldIrHash,
        executionPlanHash: pipeline.executionPlanHash,
        resourceLockHash: pipeline.executionPlan.resourceLockHash,
        layoutSolveReportHash: pipeline.layoutSolveReportHash,
      };
      const port = await allocateAvailablePort();
      child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          path.join(REPOSITORY_ROOT, "scripts/worldkit.ts"),
          "run",
          inputPath,
          "--port",
          String(port),
          "--json",
        ],
        {
          cwd: REPOSITORY_ROOT,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      child.stdin.end();
      if (isNil(child.pid)) {
        throw new Error("worldkit run did not receive a process ID.");
      }
      const childProcessId = child.pid;
      const ready = await waitForWorldkitRunReady(child, 120_000);
      expect(ready.port).toBe(port);
      expect(await ownedRouteEvidenceDirectories(childProcessId)).toHaveLength(1);

      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(ready.url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForFunction(
        () => window.__WORLDKIT__ !== undefined,
        undefined,
        { timeout: 30_000 },
      );
      const result = await page.evaluate(async (selector) => {
        const api = window.__WORLDKIT__!;
        await api.ready();
        const response = await fetch("/__worldkit/route-evidence", {
          cache: "no-store",
        });
        return {
          protocolVersion: api.version,
          routeEvidenceStatus: response.status,
          publication: await response.json(),
          summary: api.getRouteSummary(selector),
          path: api.getRoutePathReceipt(selector),
          probe: api.getRouteRuntimeProbeReceipt(selector),
          overlay: api.getRouteOverlay(selector),
        };
      }, ROUTE_SELECTOR);

      expect(result).toMatchObject({
        protocolVersion: 5,
        routeEvidenceStatus: 200,
        publication: expectedWorldHashes,
        summary: {
          availability: "available",
          selector: ROUTE_SELECTOR,
          summary: {
            connectivityStatus: "complete",
            routePathStatus: "complete",
            routeRuntimeProbeStatus: "complete",
            routeOverlayStatus: "available",
          },
        },
        path: {
          availability: "available",
          selector: ROUTE_SELECTOR,
          routePathReceipt: {
            status: "complete",
            constraintId: ROUTE_SELECTOR.constraintId,
            routeId: ROUTE_SELECTOR.routeId,
          },
        },
        probe: {
          availability: "available",
          selector: ROUTE_SELECTOR,
          routeRuntimeProbeReceipt: {
            status: "complete",
          },
        },
        overlay: {
          availability: "available",
          selector: ROUTE_SELECTOR,
          routeOverlay: {
            constraintId: ROUTE_SELECTOR.constraintId,
            routeId: ROUTE_SELECTOR.routeId,
          },
        },
      });
      expect(result.publication.routes).toHaveLength(1);

      await browser.close();
      browser = undefined;
      await stopWorldkitRun(child);
      expect(await waitForExit(child, 1_000)).toEqual({ code: 0, signal: null });
      expect(await ownedRouteEvidenceDirectories(childProcessId)).toEqual([]);
      await expect(fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(500),
      })).rejects.toThrow();
    } finally {
      await browser?.close();
      if (!isNil(child)) await stopWorldkitRun(child).catch(() => undefined);
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }, 180_000);
});
