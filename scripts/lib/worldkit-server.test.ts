import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  normalizeAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { compileCanonicalWorldV1 } from "@whitebox-world/compiler";
import {
  createGameplayBootstrapResourceLockEntryV1,
  createGameplayBootstrapV1,
  createGameplayFeatureManifestV1,
} from "@whitebox-world/gameplay-contracts";
import { canonicalJsonBytes } from "@whitebox-world/protocol";
import {
  canonicalWorldkitBrowserRouteEvidencePublicationV2,
  type WorldkitBrowserRouteEvidencePublicationV2,
} from "@whitebox-world/runtime-contracts";
import type { Browser } from "playwright";
import { isNil, uniq } from "lodash-es";
import { afterEach, describe, expect, it } from "vitest";

import { createValidAuthoringSpec } from "../../packages/authoring/src/test-fixture";

import { launchChromiumWithSystemFallback } from "./playwright-browser-launch";
import { startWorldkitServer, type WorldkitServerHandle } from "./worldkit-server";

const INPUT_PATH = fileURLToPath(
  new URL("../../examples/authoring/rigged-subject-world.json", import.meta.url),
);
const handles: WorldkitServerHandle[] = [];

const HASH = `sha256:${"1".repeat(64)}` as const;
const CONTROL_TRANSITION_CAPABILITY_REF =
  "worldkit://runtime-capability/control-transition@1" as const;

const coreControlManifest = createGameplayFeatureManifestV1({
  kind: "gameplay-feature",
  id: "core-control",
  version: 1,
  resourceRef: "worldkit://gameplay-feature/core-control@1",
  dependencyFeatureRefs: [],
  requiredCapabilityRefs: [CONTROL_TRANSITION_CAPABILITY_REF],
  commandTypes: ["control.bind", "control.release"],
  resourceBudget: { stateSliceCount: 1, commandHandlerCount: 2 },
});

function gameplayBootstrap(
  normalizedWorldIr: NormalizedWorldIRV4,
) {
  const entityDescriptors = normalizedWorldIr.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => {
      const definition = normalizedWorldIr.resources.subjectDefinitions.find(
        (candidate) =>
          candidate.subjectDefinitionRef === node.subjectDefinitionRef,
      );
      if (isNil(definition)) {
        throw new Error(`Missing Subject Definition '${node.subjectDefinitionRef}'.`);
      }
      return {
        id: node.id,
        entityDefinitionRef: node.subjectDefinitionRef,
        capabilityRefs: definition.capabilityRefs,
      };
    });
  return createGameplayBootstrapV1({
      kind: "gameplay-bootstrap",
      id: `${normalizedWorldIr.id}.gameplay`,
      version: 1,
      resourceRef:
        `worldkit://gameplay-bootstrap/${normalizedWorldIr.id}.${normalizedWorldIr.seed}@1`,
      entityDescriptors,
      featureResourceLocks: [{
        resourceRef: coreControlManifest.resourceRef,
        contentHash: coreControlManifest.contentHash,
      }],
      semanticActionDefinitions: [],
      availableCapabilityRefs: uniq([
        ...entityDescriptors.flatMap((descriptor) => descriptor.capabilityRefs),
        CONTROL_TRANSITION_CAPABILITY_REF,
      ]),
      initialRelationshipStates: normalizedWorldIr.relationships.map(
        (relationship) => ({ ...relationship, establishedSimulationTick: 0 }),
      ),
    });
}

function routeEvidencePublication(
  overrides: Partial<WorldkitBrowserRouteEvidencePublicationV2> = {},
): WorldkitBrowserRouteEvidencePublicationV2 {
  return canonicalWorldkitBrowserRouteEvidencePublicationV2({
    kind: "worldkit-browser-route-evidence-publication",
    schemaVersion: 2,
    worldPackageRootHash: HASH,
    authoringSpecHash: HASH,
    normalizedWorldIrHash: HASH,
    executionPlanHash: HASH,
    resourceLockHash: HASH,
    layoutSolveReportHash: HASH,
    validationReportHash: HASH,
    routeValidationSetReceiptHash: HASH,
    validationProfileRef:
      "worldkit://validation-profile/outdoor-world-package-dev@2",
    validationProfileResolvedVersion: "2.0.0",
    validationProfileHash: HASH,
    routes: [],
    ...overrides,
  });
}

function routeEvidenceInput(
  publication = routeEvidencePublication(),
) {
  return {
    publication,
    canonicalBytes: canonicalJsonBytes(publication),
  };
}

function routeAuthoringWorld(): AuthoringSpecV4 {
  const source = createValidAuthoringSpec();
  return {
    ...source,
    schemaVersion: 4,
    spatial: {
      ...source.spatial,
      traversalAreas: [],
      routes: [{
        id: "main-route",
        kind: "polyline-xz",
        pointsMetersXZ: [[0, 30], [0, -20]],
        widthMeters: 4,
        locomotionProfileRef:
          "worldkit://locomotion-profile/ground.standard@1",
      }],
    },
    nodes: [
      ...source.nodes,
      {
        id: "goal",
        kind: "anchor",
        placement: {
          kind: "fixed",
          transform: { positionMetersXYZ: [0, 0, -20] },
        },
        semantic: { classId: "route.destination" },
      },
    ],
    constraints: {
      placements: source.constraints.placements,
      connectivity: [{
        id: "player-to-goal",
        kind: "connected-by-route",
        requirement: "required",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn-main",
        destinationAnchorEntityId: "goal",
        routeId: "main-route",
      }],
    },
  };
}

function sameWorldRouteEvidencePublication(
  source: AuthoringSpecV4,
): WorldkitBrowserRouteEvidencePublicationV2 {
  const normalized = normalizeAuthoringSpecV4(source);
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined ||
    normalized.layoutSolveReportHash === undefined
  ) {
    throw new Error("Route server fixture did not normalize.");
  }
  const compiled = compileCanonicalWorldV1({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrap: gameplayBootstrap(normalized.value),
    worldRuntimeBootstrapRef:
      `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
  });
  if (
    !compiled.ok ||
    compiled.canonicalSceneExecutionPlan === undefined ||
    compiled.executionPlanHash === undefined
  ) {
    throw new Error("Route server fixture did not compile.");
  }
  return routeEvidencePublication({
    authoringSpecHash: normalized.value.authoringSpecHash,
    normalizedWorldIrHash:
      normalized.normalizedWorldIrHash as `sha256:${string}`,
    executionPlanHash: compiled.executionPlanHash as `sha256:${string}`,
    resourceLockHash:
      normalized.value.resources.resourceLockHash as `sha256:${string}`,
    layoutSolveReportHash:
      normalized.layoutSolveReportHash as `sha256:${string}`,
  });
}

async function ownedRouteEvidenceDirectories(): Promise<readonly string[]> {
  const prefix = `worldkit-route-evidence-${process.pid}-`;
  return (await readdir(tmpdir()))
    .filter((entry) => entry.startsWith(prefix))
    .sort();
}

afterEach(async () => {
  await Promise.all(handles.splice(0).reverse().map((handle) => handle.stop()));
});

describe("startWorldkitServer", () => {
  it("serves exact canonical Route evidence bytes through read-only GET and HEAD", async () => {
    const routeEvidence = routeEvidenceInput();
    const handle = await startWorldkitServer({
      inputPath: INPUT_PATH,
      routeEvidence,
    });
    handles.push(handle);
    const endpoint = new URL("/__worldkit/route-evidence", handle.url);

    const getResponse = await fetch(endpoint, { cache: "no-store" });
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(getResponse.headers.get("cache-control")).toBe("no-store");
    expect(getResponse.headers.get("x-worldkit-server-nonce")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
    );
    expect(new Uint8Array(await getResponse.arrayBuffer())).toEqual(
      routeEvidence.canonicalBytes,
    );

    const headResponse = await fetch(endpoint, {
      method: "HEAD",
      cache: "no-store",
    });
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get("content-length")).toBe(
      String(routeEvidence.canonicalBytes.byteLength),
    );
    expect(headResponse.headers.get("cache-control")).toBe("no-store");
    expect(headResponse.headers.get("x-worldkit-server-nonce")).toBe(
      getResponse.headers.get("x-worldkit-server-nonce"),
    );
    expect(await headResponse.text()).toBe("");
  }, 30_000);

  it("injects same-world Route evidence into the Browser V5 API without page-side production", async () => {
    const source = routeAuthoringWorld();
    const publication = sameWorldRouteEvidencePublication(source);
    const inputDirectory = await mkdtemp(
      path.join(tmpdir(), `worldkit-route-browser-${process.pid}-`),
    );
    const inputPath = path.join(inputDirectory, "world.json");
    await writeFile(inputPath, JSON.stringify(source), "utf8");
    let browser: Browser | undefined;
    try {
      const handle = await startWorldkitServer({
        inputPath,
        routeEvidence: routeEvidenceInput(publication),
      });
      handles.push(handle);
      browser = await launchChromiumWithSystemFallback();
      const page = await browser.newPage();
      await page.goto(handle.url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForFunction(
        () => document.documentElement.dataset.worldkitStatus === "ready",
        undefined,
        { timeout: 30_000 },
      );
      const result = await page.evaluate(async () => {
        const api = window.__WORLDKIT__!;
        const ready = await api.ready();
        const possession = Object.values(
          ready.world.gameplayInspection.relationshipStatesById,
        ).find(
          (relationship) =>
            relationship.type === "possessedBy" &&
            relationship.controllerEntityId === "controller-primary",
        );
        const selector = {
          constraintId: "not-published",
          routeId: "not-published",
        };
        return {
          version: api.version,
          executionWorldId: possession?.type === "possessedBy"
            ? possession.controlledEntityId
            : undefined,
          rootControlledEntityIdPresent: "controlledEntityId" in ready,
          routeResult: api.getRouteSummary(selector),
        };
      });
      expect(result).toMatchObject({
        version: 5,
        executionWorldId: "player",
        rootControlledEntityIdPresent: false,
        routeResult: {
          availability: "unavailable",
          reason: "route-not-found",
        },
      });
    } finally {
      await browser?.close();
      await rm(inputDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  it("preserves a Route evidence world mismatch through Browser ready and the inspector", async () => {
    const source = routeAuthoringWorld();
    const publication = sameWorldRouteEvidencePublication(source);
    const mismatchedPublication = routeEvidencePublication({
      ...publication,
      authoringSpecHash: `sha256:${"8".repeat(64)}`,
    });
    const inputDirectory = await mkdtemp(
      path.join(tmpdir(), `worldkit-route-mismatch-${process.pid}-`),
    );
    const inputPath = path.join(inputDirectory, "world.json");
    await writeFile(inputPath, JSON.stringify(source), "utf8");
    let browser: Browser | undefined;
    try {
      const handle = await startWorldkitServer({
        inputPath,
        routeEvidence: routeEvidenceInput(mismatchedPublication),
      });
      handles.push(handle);
      browser = await launchChromiumWithSystemFallback();
      const page = await browser.newPage();
      await page.goto(handle.url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForFunction(
        () => window.__WORLDKIT__ !== undefined,
        undefined,
        { timeout: 30_000 },
      );
      const result = await page.evaluate(async () => {
        const api = window.__WORLDKIT__!;
        const readyError = await api.ready().catch((error: unknown) => error) as {
          code?: string;
        };
        return {
          readyCode: readyError.code,
          diagnostics: api.getDiagnostics(),
          inspectorText: document.querySelector("#inspection")?.textContent ?? "",
        };
      });
      expect(result.readyCode).toBe(
        "WORLDKIT_ROUTE_EVIDENCE_WORLD_MISMATCH",
      );
      expect(result.diagnostics).toMatchObject([{
        code: "WORLDKIT_ROUTE_EVIDENCE_WORLD_MISMATCH",
        instancePath: "/authoringSpecHash",
      }]);
      expect(result.inspectorText).toContain(
        "WORLDKIT_ROUTE_EVIDENCE_WORLD_MISMATCH",
      );
      expect(result.inspectorText).not.toContain(
        "WORLDKIT_RUNTIME_INITIALIZATION_FAILED",
      );
    } finally {
      await browser?.close();
      await rm(inputDirectory, { recursive: true, force: true });
    }
  }, 30_000);

  it("returns stable 404 and 405 Route evidence endpoint responses", async () => {
    const handle = await startWorldkitServer({ inputPath: INPUT_PATH });
    handles.push(handle);
    const endpoint = new URL("/__worldkit/route-evidence", handle.url);

    const unconfigured = await fetch(endpoint, { cache: "no-store" });
    expect(unconfigured.status).toBe(404);
    await expect(unconfigured.json()).resolves.toMatchObject({
      diagnostics: [{ code: "WORLDKIT_ROUTE_EVIDENCE_NOT_CONFIGURED" }],
    });
    const rejected = await fetch(endpoint, { method: "POST" });
    expect(rejected.status).toBe(405);
    expect(rejected.headers.get("cache-control")).toBe("no-store");
    await expect(rejected.json()).resolves.toMatchObject({
      diagnostics: [{ code: "WORLDKIT_ROUTE_EVIDENCE_METHOD_NOT_ALLOWED" }],
    });
  }, 30_000);

  it("does not trust an ambient Route evidence path outside its owned transport", async () => {
    const previousPath = process.env.WORLDKIT_ROUTE_EVIDENCE_PATH;
    process.env.WORLDKIT_ROUTE_EVIDENCE_PATH = INPUT_PATH;
    try {
      const handle = await startWorldkitServer({ inputPath: INPUT_PATH });
      handles.push(handle);
      const response = await fetch(
        new URL("/__worldkit/route-evidence", handle.url),
        { cache: "no-store" },
      );
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        diagnostics: [{ code: "WORLDKIT_ROUTE_EVIDENCE_NOT_CONFIGURED" }],
      });
    } finally {
      if (previousPath === undefined) delete process.env.WORLDKIT_ROUTE_EVIDENCE_PATH;
      else process.env.WORLDKIT_ROUTE_EVIDENCE_PATH = previousPath;
    }
  }, 30_000);

  it("rejects oversized Route evidence before creating private state or spawning", async () => {
    const publication = routeEvidencePublication({
      validationProfileRef: `worldkit://validation-profile/${"x".repeat(
        8 * 1024 * 1024,
      )}`,
    });
    const before = await ownedRouteEvidenceDirectories();
    const realExecutablePath = process.execPath;
    try {
      process.execPath = path.join(
        fileURLToPath(new URL("../../", import.meta.url)),
        ".missing-node-executable",
      );
      await expect(startWorldkitServer({
        inputPath: INPUT_PATH,
        routeEvidence: routeEvidenceInput(publication),
      })).rejects.toMatchObject({
        code: "WORLDKIT_ROUTE_EVIDENCE_TOO_LARGE",
      });
      expect(await ownedRouteEvidenceDirectories()).toEqual(before);
    } finally {
      process.execPath = realExecutablePath;
    }
  }, 30_000);

  it("removes its private Route evidence directory after stop", async () => {
    const before = await ownedRouteEvidenceDirectories();
    const handle = await startWorldkitServer({
      inputPath: INPUT_PATH,
      routeEvidence: routeEvidenceInput(),
    });
    const during = await ownedRouteEvidenceDirectories();
    expect(during).toHaveLength(before.length + 1);
    await handle.stop();
    expect(await ownedRouteEvidenceDirectories()).toEqual(before);
  }, 30_000);

  it("forwards an explicit dependency refresh to the owned Vite server", async () => {
    const source = `
      import { startWorldkitServer } from ${JSON.stringify(
        new URL("./worldkit-server.ts", import.meta.url).href,
      )};
      const handle = await startWorldkitServer({
        inputPath: ${JSON.stringify(INPUT_PATH)},
        refreshDependencies: true,
        forwardOutput: true,
        startupTimeoutMilliseconds: 30000,
      });
      await handle.stop();
    `;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--eval", source],
      {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.resume();
    const exitCode = await new Promise<number | null>((resolve) => {
      child.once("exit", resolve);
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Forced re-optimization of dependencies");
  }, 30_000);

  it("proves readiness belongs to its nonce and reuses stop/exit promises", async () => {
    const handle = await startWorldkitServer({ inputPath: INPUT_PATH });
    handles.push(handle);
    const response = await fetch(
      new URL("/__worldkit/authoring-spec", handle.url),
      { method: "HEAD", cache: "no-store" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-worldkit-server-nonce")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
    );
    expect(handle.waitForExit()).toBe(handle.waitForExit());
    const firstStop = handle.stop();
    expect(handle.stop()).toBe(firstStop);
    await firstStop;
    await expect(handle.waitForExit()).resolves.toSatisfy(
      (code) => code === null || code === 143,
    );
  }, 30_000);

  it("rejects an explicitly occupied port without stopping its owner", async () => {
    const owner = createServer();
    await new Promise<void>((resolve) => owner.listen(0, "127.0.0.1", resolve));
    try {
      const address = owner.address();
      if (address === null || typeof address === "string") {
        throw new Error("Test server did not receive a TCP port.");
      }
      await expect(startWorldkitServer({
        inputPath: INPUT_PATH,
        port: address.port,
        startupTimeoutMilliseconds: 1_000,
      })).rejects.toMatchObject({ code: "WORLDKIT_SERVER_PORT_UNAVAILABLE" });
      expect(owner.listening).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => owner.close((error) => {
        if (error === undefined) resolve();
        else reject(error);
      }));
    }
  });

  it("lets a successful start and stop subprocess exit promptly", async () => {
    const source = `
      import { startWorldkitServer } from ${JSON.stringify(
        new URL("./worldkit-server.ts", import.meta.url).href,
      )};
      const handle = await startWorldkitServer({
        inputPath: ${JSON.stringify(INPUT_PATH)},
        startupTimeoutMilliseconds: 30000,
      });
      await handle.stop();
    `;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--eval", source],
      { cwd: fileURLToPath(new URL("../../", import.meta.url)), stdio: "ignore" },
    );
    const outcome = await new Promise<
      | { kind: "exit"; code: number | null }
      | { kind: "timeout" }
    >((resolve) => {
      // The assertion distinguishes prompt cleanup from the historical 30-second
      // leaked timer; it is not a cold-start benchmark for Vite under suite load.
      const timer = setTimeout(() => resolve({ kind: "timeout" }), 8_000);
      child.once("exit", (code) => {
        clearTimeout(timer);
        resolve({ kind: "exit", code });
      });
    });
    if (outcome.kind === "timeout") {
      child.kill("SIGKILL");
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    }
    expect(outcome).toEqual({ kind: "exit", code: 0 });
  }, 15_000);

  it("settles cleanup when spawning the owned process emits error without exit", async () => {
    const realExecutablePath = process.execPath;
    const before = await ownedRouteEvidenceDirectories();
    try {
      process.execPath = path.join(
        fileURLToPath(new URL("../../", import.meta.url)),
        ".missing-node-executable",
      );
      const outcome = await Promise.race([
        startWorldkitServer({
          inputPath: INPUT_PATH,
          routeEvidence: routeEvidenceInput(),
          startupTimeoutMilliseconds: 1_000,
        }).then(
          () => ({ kind: "resolved" as const }),
          (error: unknown) => ({
            kind: "rejected" as const,
            code: (error as { code?: string }).code,
          }),
        ),
        new Promise<{ kind: "timeout" }>((resolve) =>
          setTimeout(() => resolve({ kind: "timeout" }), 1_500),
        ),
      ]);
      expect(outcome).toEqual({
        kind: "rejected",
        code: "WORLDKIT_SERVER_PROCESS_ERROR",
      });
      expect(await ownedRouteEvidenceDirectories()).toEqual(before);
    } finally {
      process.execPath = realExecutablePath;
    }
  }, 5_000);
});
