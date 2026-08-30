import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Page } from "playwright";
import type { SemanticInputActionV1 } from "@whitebox-world/runtime-contracts";

import { launchChromiumWithSystemFallback } from "../lib/playwright-browser-launch";

interface Options {
  sceneId: string;
  origin: string;
  playPath: string;
  output: string;
}

function parseOptions(argv: string[]): Options {
  const value = (name: string): string => {
    const index = argv.indexOf(name);
    if (index < 0 || !argv[index + 1]) throw new Error(`Missing ${name}.`);
    return argv[index + 1]!;
  };
  const sceneId = value("--scene-id");
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(sceneId)) throw new Error("Invalid --scene-id.");
  return {
    sceneId,
    origin: value("--origin"),
    playPath: argv.includes("--play-path") ? value("--play-path") : "/",
    output: path.resolve(value("--output")),
  };
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

async function ready(page: Page) {
  await page.waitForFunction(
    () => window.__WORLDKIT__ !== undefined || document.documentElement.dataset.worldkitStatus === "error",
    undefined,
    { timeout: 120_000 },
  );
  return page.evaluate(async () => {
    if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
    try {
      return await window.__WORLDKIT__.ready();
    } catch (error) {
      const diagnostics = window.__WORLDKIT__.getDiagnostics();
      await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 100));
      const startupEvidence = document.querySelector("#inspection")?.textContent?.trim() ?? "";
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n` +
        `${JSON.stringify(diagnostics)}\n${startupEvidence}`,
      );
    }
  });
}

async function fixed(page: Page, actions: string[], ticks: number) {
  return page.evaluate(async ({ actions, ticks }) => {
    if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
    return window.__WORLDKIT__.runFixedInput([{ actions, ticks }]);
  }, { actions: actions as SemanticInputActionV1[], ticks });
}

async function camera(page: Page, yawDeltaRadians: number, pitchDeltaRadians: number) {
  return page.evaluate(({ yawDeltaRadians, pitchDeltaRadians }) => {
    if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
    return window.__WORLDKIT__.adjustCameraView({
      yawDeltaRadians,
      pitchDeltaRadians,
      zoomDeltaMeters: 0,
    });
  }, { yawDeltaRadians, pitchDeltaRadians });
}

function subjectSummary(snapshot: any) {
  const states = snapshot?.world?.subjectStatesByEntityId ?? {};
  return Object.fromEntries(Object.entries(states).map(([id, state]: [string, any]) => {
    const entityState = state?.entityState ?? {};
    const locomotionState = Object.values(state?.capabilityStatesById ?? {})
      .find((candidate: any) => candidate?.kind === "locomotion-capability-state") as any;
    return [id, {
      positionMetersXYZ: entityState.positionMetersXYZ ?? null,
      velocityMetersPerSecondXYZ: entityState.linearVelocityMetersPerSecondXYZ ?? null,
      rotationQuaternionXYZW: entityState.rotationQuaternionXYZW ?? null,
      facingYawRadians: locomotionState?.facingYawRadians ?? null,
      speedMetersPerSecond: locomotionState?.speedMetersPerSecond ?? null,
      movementMode: locomotionState?.mode ?? null,
      movementMedium: locomotionState?.movementMedium ?? null,
      support: state?.support ?? state?.supportState ?? null,
    }];
  }));
}

function movementEvidence(before: any, after: any) {
  const result: Record<string, unknown> = {};
  for (const [id, afterState] of Object.entries(after ?? {}) as [string, any][]) {
    const beforePosition = before?.[id]?.positionMetersXYZ;
    const afterPosition = afterState?.positionMetersXYZ;
    if (!Array.isArray(beforePosition) || !Array.isArray(afterPosition) ||
        beforePosition.length !== 3 || afterPosition.length !== 3) {
      result[id] = { displacementMeters: null, blockedOrStalled: null };
      continue;
    }
    const displacementMeters = Math.hypot(
      afterPosition[0] - beforePosition[0],
      afterPosition[1] - beforePosition[1],
      afterPosition[2] - beforePosition[2],
    );
    result[id] = {
      displacementMeters: Math.round(displacementMeters * 1000) / 1000,
      blockedOrStalled: displacementMeters < 0.25,
    };
  }
  return result;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  await mkdir(options.output, { recursive: true });
  const browser = await launchChromiumWithSystemFallback();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 1000));
  });
  try {
    const url = new URL(options.origin);
    url.pathname = options.playPath;
    url.searchParams.set("authoring", "1");
    url.searchParams.set("world", options.sceneId);
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    const initial = await ready(page);
    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state: "visible", timeout: 60_000 });
    const screenshots: string[] = [];
    const takeScreenshot = async (name: string): Promise<void> => {
      const target = path.join(options.output, name);
      const dataUrl = await canvas.evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("WORLDKIT_CANVAS_MISSING");
        return element.toDataURL("image/png");
      });
      const prefix = "data:image/png;base64,";
      if (!dataUrl.startsWith(prefix)) throw new Error("WORLDKIT_CANVAS_PNG_INVALID");
      await writeFile(target, Buffer.from(dataUrl.slice(prefix.length), "base64"));
      screenshots.push(name);
    };
    await takeScreenshot("recon-00-initial.png");

    const probes = [];
    let previousSubjects = subjectSummary(initial);
    for (const probe of [
      { id: "forward", actions: ["move-forward"], ticks: 120 },
      { id: "forward-left", actions: ["move-forward", "move-left"], ticks: 90 },
      { id: "backward", actions: ["move-backward"], ticks: 60 },
      { id: "run-forward", actions: ["move-forward", "run"], ticks: 120 },
      { id: "space", actions: ["jump"], ticks: 30 },
    ]) {
      const snapshot = await fixed(page, probe.actions, probe.ticks);
      const subjects = subjectSummary(snapshot);
      probes.push({
        ...probe,
        simulationTick: snapshot.world.simulationTick,
        subjects,
        movementEvidence: movementEvidence(previousSubjects, subjects),
        camera: snapshot.view.camera,
      });
      previousSubjects = subjects;
      await takeScreenshot(`recon-${String(probes.length).padStart(2, "0")}-${probe.id}.png`);
    }
    const leftUp = await camera(page, -0.35, 0.16);
    await takeScreenshot("recon-06-camera-left-up.png");
    const rightDown = await camera(page, 0.7, -0.3);
    await takeScreenshot("recon-07-camera-right-down.png");
    const reset = await page.evaluate(async () => {
      if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      return window.__WORLDKIT__.reset();
    });
    const subjectIds = Object.keys(initial.world.subjectStatesByEntityId ?? {});
    await writeJsonAtomic(path.join(options.output, "reconnaissance-report.json"), {
      kind: "worldkit-playthrough-reconnaissance",
      schemaVersion: 1,
      sceneId: options.sceneId,
      generatedAt: new Date().toISOString(),
      sourceUrl: url.toString(),
      browserProtocolVersion: 5,
      subjectIds,
      controlledEntityId:
        ("targetEntityId" in initial.view.camera ? initial.view.camera.targetEntityId : undefined) ??
        subjectIds[0] ?? null,
      initial: {
        runtimeSessionId: initial.runtimeSessionId,
        worldSessionId: initial.worldSessionId,
        simulationTick: initial.world.simulationTick,
        worldStateHash: initial.world.worldStateHash,
        subjects: subjectSummary(initial),
        camera: initial.view.camera,
        gameplayInspection: initial.world.gameplayInspection,
      },
      probes,
      cameraProbes: [
        { id: "left-up", camera: leftUp.view.camera },
        { id: "right-down", camera: rightDown.view.camera },
      ],
      reset: {
        worldSessionId: reset.worldSessionId,
        subjects: subjectSummary(reset),
        camera: reset.view.camera,
      },
      screenshots,
      consoleErrors,
    });
    process.stdout.write(`WORLDKIT_PLAYTHROUGH_RECON_OK ${options.sceneId} probes=${probes.length} screenshots=${screenshots.length}\n`);
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
