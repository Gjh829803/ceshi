import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { access, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import viteConfig from "./vite.config.mjs";

const sceneId = "reference-scene";
const pngDataUrl = "data:image/png;base64,iVBORw0KGgo=";
const worldSpec = {
  id: sceneId,
  source: { referenceImages: ["/ref.png"] },
  entry: {
    composition: {
      guide: {
        minimumScore: 0.6,
        regions: [{ id: "sky", minimumIou: 0.5 }],
        anchors: [{ id: "hero", center: [0.5, 0.5], size: [0.2, 0.4], tolerance: 0.1 }],
      },
    },
  },
};

const passingReport = {
  score: 0.8,
  minimumScore: 0.6,
  pass: false,
  regions: [{ id: "sky", iou: 0.7, minimumIou: 0.5, pass: false }],
  anchors: [{
    id: "hero",
    expectedCenter: [0.5, 0.5],
    observedCenter: [0.51, 0.49],
    expectedSize: [0.2, 0.4],
    observedSize: [0.2, 0.4],
    error: 0.02,
    tolerance: 0.1,
    pass: false,
  }],
};

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function fnvHash(contents) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < contents.length; index += 1) {
    hash ^= contents.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function createProject(root) {
  const specJson = JSON.stringify(worldSpec);
  const frozenPlan = {
    workflowVersion: 1,
    sceneId,
    stage: "frozen",
    specSha256: sha256(specJson),
    files: [],
  };
  const planLockContents = `${JSON.stringify(frozenPlan, null, 2)}\n`;
  const manifest = {
    artifactVersion: 1,
    workflowStage: "whitebox-built",
    sceneId,
    specHash: fnvHash(specJson),
    frozenPlanSpecSha256: frozenPlan.specSha256,
    planLockSha256: sha256(planLockContents),
    compiler: "whitebox-world-planning-v1",
    files: ["world-spec.json"],
    imageAssets: [],
  };
  const artifactDirectory = path.join(root, "artifacts", "scenes", sceneId);
  const playgroundDirectory = path.join(root, "apps", "playground");
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(path.join(playgroundDirectory, "public"), { recursive: true });
  await writeFile(path.join(artifactDirectory, "plan-lock.json"), planLockContents);
  await writeFile(path.join(artifactDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(artifactDirectory, "world-spec.json"), `${JSON.stringify(worldSpec, null, 2)}\n`);
  return { artifactDirectory, playgroundDirectory, manifest };
}

function openingFrameHandler() {
  const routes = new Map();
  const plugin = viteConfig.plugins.find((candidate) => candidate.name === "whitebox-artifact-writer");
  plugin.configureServer({
    middlewares: {
      use(route, handler) {
        routes.set(route, handler);
      },
    },
  });
  return routes.get("/__whitebox/write-opening-frame");
}

function invoke(handler, payload) {
  const request = new EventEmitter();
  request.method = "POST";
  request.setEncoding = () => undefined;
  request.destroy = () => undefined;
  return new Promise((resolve) => {
    const response = {
      statusCode: 200,
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(body = "") {
        resolve({ statusCode: this.statusCode, body: String(body) });
      },
    };
    handler(request, response);
    request.emit("data", JSON.stringify(payload));
    request.emit("end");
  });
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("whitebox opening-frame host gate", () => {
  let root;
  let cwdSpy;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "worldkit-composition-host-"));
  });

  afterEach(async () => {
    cwdSpy?.mockRestore();
    await rm(root, { recursive: true, force: true });
  });

  it("rejects recomputed failing metrics without writing an opening frame", async () => {
    const project = await createProject(root);
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(project.playgroundDirectory);
    const response = await invoke(openingFrameHandler(), {
      sceneId,
      dataUrl: pngDataUrl,
      report: {
        ...passingReport,
        score: 0.4,
        pass: true,
        regions: [{ ...passingReport.regions[0], iou: 0.3, pass: true }],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("COMPOSITION_REPORT_FAILED");
    const publicDirectory = path.join(project.playgroundDirectory, "public", "scene-plans", sceneId);
    expect(await exists(path.join(publicDirectory, "whitebox-opening-frame.png"))).toBe(false);
    expect(await exists(path.join(publicDirectory, "opening-composition-report.json"))).toBe(false);
    expect(JSON.parse(await readFile(path.join(project.artifactDirectory, "manifest.json"), "utf8")))
      .toEqual(project.manifest);
  });

  it("persists trusted identity and promotes the matching planning manifest", async () => {
    const project = await createProject(root);
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(project.playgroundDirectory);
    const response = await invoke(openingFrameHandler(), {
      sceneId,
      dataUrl: pngDataUrl,
      report: passingReport,
    });

    expect(response.statusCode).toBe(200);
    const publicDirectory = path.join(project.playgroundDirectory, "public", "scene-plans", sceneId);
    const persistedReport = JSON.parse(
      await readFile(path.join(publicDirectory, "opening-composition-report.json"), "utf8"),
    );
    expect(persistedReport).toMatchObject({
      pass: true,
      planIdentity: {
        sceneId,
        specHash: project.manifest.specHash,
        frozenPlanSpecSha256: project.manifest.frozenPlanSpecSha256,
        planLockSha256: project.manifest.planLockSha256,
      },
    });
    expect(JSON.parse(await readFile(path.join(project.artifactDirectory, "manifest.json"), "utf8")))
      .toEqual({ ...project.manifest, workflowStage: "verified" });
  });

  it("rolls back the opening frame when the report target cannot be written", async () => {
    const project = await createProject(root);
    const publicDirectory = path.join(
      project.playgroundDirectory,
      "public",
      "scene-plans",
      sceneId,
    );
    const framePath = path.join(publicDirectory, "whitebox-opening-frame.png");
    const reportPath = path.join(publicDirectory, "opening-composition-report.json");
    await mkdir(publicDirectory, { recursive: true });
    await writeFile(framePath, "authoritative-old-frame");
    await mkdir(reportPath);
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(project.playgroundDirectory);

    const response = await invoke(openingFrameHandler(), {
      sceneId,
      dataUrl: pngDataUrl,
      report: passingReport,
    });

    expect(response.statusCode).toBe(400);
    expect(await readFile(framePath, "utf8")).toBe("authoritative-old-frame");
    expect(JSON.parse(await readFile(path.join(project.artifactDirectory, "manifest.json"), "utf8")))
      .toEqual(project.manifest);
    expect((await stat(reportPath)).isDirectory()).toBe(true);
  });
});
