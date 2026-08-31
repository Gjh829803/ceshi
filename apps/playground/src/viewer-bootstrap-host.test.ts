import { createServer, type Server } from "node:http";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createViewerBootstrapMiddlewareV1,
  resolveViewerBootstrapV1,
  VIEWER_BOOTSTRAP_ENDPOINT,
} from "./viewer-bootstrap-host.js";

const repositoryRoot = path.resolve(".");
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

async function serve(
  middleware: ReturnType<typeof createViewerBootstrapMiddlewareV1>,
): Promise<string> {
  const server = createServer((request, response) => {
    middleware(request, response, () => {
      response.statusCode = 404;
      response.end("not found");
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("missing address");
  return `http://127.0.0.1:${address.port}`;
}

describe("Viewer bootstrap Host", () => {
  it("serves the default and explicit curated presets without leaking source paths", async () => {
    const origin = await serve(createViewerBootstrapMiddlewareV1({ repositoryRoot }));

    const defaultResponse = await fetch(`${origin}${VIEWER_BOOTSTRAP_ENDPOINT}`);
    expect(defaultResponse.status).toBe(200);
    const defaultText = await defaultResponse.text();
    expect(JSON.parse(defaultText).selection.selectedSceneId).toBe("feel-flat");
    expect(defaultText).not.toContain("authoringSpecPath");
    expect(defaultText).not.toContain(repositoryRoot);

    const selectedResponse = await fetch(
      `${origin}${VIEWER_BOOTSTRAP_ENDPOINT}?scene=traversal-course`,
    );
    expect(selectedResponse.status).toBe(200);
    expect((await selectedResponse.json()).selection.selectedSceneId).toBe(
      "traversal-course",
    );
  });

  it("keeps a fixed Host source authoritative even when the Browser asks for another preset", async () => {
    const origin = await serve(createViewerBootstrapMiddlewareV1({
      repositoryRoot,
      fixedAuthoringSpecPath: path.join(
        repositoryRoot,
        "scenes/presets/action-lab/world.json",
      ),
    }));

    const response = await fetch(
      `${origin}${VIEWER_BOOTSTRAP_ENDPOINT}?scene=feel-flat`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.selection).toEqual({
      kind: "fixed-host",
      selectedSceneId: "action-lab",
    });
  });

  it("rejects a fixed Studio identity that does not match the validated source", async () => {
    await expect(resolveViewerBootstrapV1({
      kind: "fixed-host",
      authoringSpecPath: path.join(
        repositoryRoot,
        "scenes/presets/action-lab/world.json",
      ),
      expectedSceneId: "studio-scene",
    })).rejects.toThrow("VIEWER_FIXED_SOURCE_IDENTITY_MISMATCH");
  });

  it("enforces HEAD and method behavior", async () => {
    const origin = await serve(createViewerBootstrapMiddlewareV1({ repositoryRoot }));
    const head = await fetch(`${origin}${VIEWER_BOOTSTRAP_ENDPOINT}`, {
      method: "HEAD",
    });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(head.headers.get("cache-control")).toBe("no-store");

    const post = await fetch(`${origin}${VIEWER_BOOTSTRAP_ENDPOINT}`, {
      method: "POST",
    });
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
  });

  it("returns closed errors for unknown presets and leaves unrelated routes alone", async () => {
    const origin = await serve(createViewerBootstrapMiddlewareV1({ repositoryRoot }));
    const missing = await fetch(
      `${origin}${VIEWER_BOOTSTRAP_ENDPOINT}?scene=missing`,
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      kind: "scene-viewer-bootstrap-error",
      schemaVersion: 1,
      code: "VIEWER_PRESET_NOT_FOUND",
    });
    expect((await fetch(`${origin}/unrelated`)).status).toBe(404);
  });
});
