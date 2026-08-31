import { lstat, readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import { parseSceneCatalogV1 } from "@whitebox-world/scene-catalog";

import {
  createCuratedViewerBootstrapV1,
  createFixedViewerBootstrapV1,
  type ViewerBootstrapV1,
} from "./viewer-bootstrap.js";

export const VIEWER_BOOTSTRAP_ENDPOINT = "/__worldkit/viewer-bootstrap";

const MAX_CATALOG_BYTES = 1024 * 1024;
const MAX_AUTHORING_BYTES = 8 * 1024 * 1024;

export type ViewerBootstrapResolutionContextV1 =
  | Readonly<{
      kind: "curated";
      catalogPath: string;
      selectedSceneId?: string;
    }>
  | Readonly<{
      kind: "fixed-host";
      authoringSpecPath: string;
      expectedSceneId?: string;
    }>;

export type ViewerBootstrapMiddlewareOptionsV1 = Readonly<{
  repositoryRoot: string;
  fixedAuthoringSpecPath?: string;
  expectedFixedSceneId?: string;
}>;

export type ViewerBootstrapMiddlewareV1 = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => void;

function fail(code: string): never {
  throw new TypeError(code);
}

async function readRegularTextFile(
  filePath: string,
  maximumBytes: number,
  errorCode: string,
): Promise<string> {
  let metadata;
  try {
    metadata = await lstat(filePath);
  } catch {
    return fail(errorCode);
  }
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size > maximumBytes
  ) {
    return fail(errorCode);
  }
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return fail(errorCode);
  }
}

async function resolveCuratedBootstrap(
  context: Extract<ViewerBootstrapResolutionContextV1, { kind: "curated" }>,
): Promise<ViewerBootstrapV1> {
  const source = await readRegularTextFile(
    context.catalogPath,
    MAX_CATALOG_BYTES,
    "VIEWER_CATALOG_UNAVAILABLE",
  );
  let catalog;
  try {
    catalog = parseSceneCatalogV1(JSON.parse(source));
  } catch {
    return fail("VIEWER_CATALOG_INVALID");
  }
  const catalogDirectory = path.dirname(context.catalogPath);
  return createCuratedViewerBootstrapV1({
    catalog,
    ...(context.selectedSceneId === undefined
      ? {}
      : { selectedSceneId: context.selectedSceneId }),
    loadAuthoringSpec: async (relativePath) => {
      const exactPath = path.resolve(catalogDirectory, relativePath);
      const relativeToCatalog = path.relative(catalogDirectory, exactPath);
      if (
        relativeToCatalog.startsWith("..") ||
        path.isAbsolute(relativeToCatalog)
      ) {
        return fail("VIEWER_PRESET_SOURCE_OUTSIDE_CATALOG");
      }
      return readRegularTextFile(
        exactPath,
        MAX_AUTHORING_BYTES,
        "VIEWER_PRESET_SOURCE_UNAVAILABLE",
      );
    },
  });
}

export async function resolveViewerBootstrapV1(
  context: ViewerBootstrapResolutionContextV1,
): Promise<ViewerBootstrapV1> {
  if (context.kind === "curated") return resolveCuratedBootstrap(context);
  const source = await readRegularTextFile(
    path.resolve(context.authoringSpecPath),
    MAX_AUTHORING_BYTES,
    "VIEWER_FIXED_SOURCE_UNAVAILABLE",
  );
  const bootstrap = createFixedViewerBootstrapV1(source);
  if (
    context.expectedSceneId !== undefined &&
    bootstrap.authoringSpec.id !== context.expectedSceneId
  ) {
    return fail("VIEWER_FIXED_SOURCE_IDENTITY_MISMATCH");
  }
  return bootstrap;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  isHead: boolean,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  if (isHead) {
    response.end();
    return;
  }
  response.end(JSON.stringify(body));
}

function errorCode(error: unknown): string {
  if (
    error instanceof Error &&
    /^VIEWER_[A-Z0-9_]+$/.test(error.message)
  ) {
    return error.message;
  }
  return "VIEWER_BOOTSTRAP_UNAVAILABLE";
}

function statusForCode(code: string): number {
  if (code === "VIEWER_PRESET_NOT_FOUND") return 404;
  if (code.endsWith("_UNAVAILABLE")) return 404;
  return 422;
}

export function createViewerBootstrapMiddlewareV1(
  options: ViewerBootstrapMiddlewareOptionsV1,
): ViewerBootstrapMiddlewareV1 {
  const catalogPath = path.resolve(options.repositoryRoot, "scenes/catalog.json");
  return (request, response, next) => {
    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://viewer.local");
    } catch {
      next();
      return;
    }
    if (url.pathname !== VIEWER_BOOTSTRAP_ENDPOINT) {
      next();
      return;
    }
    const isHead = request.method === "HEAD";
    if (request.method !== "GET" && !isHead) {
      response.setHeader("allow", "GET, HEAD");
      writeJson(response, 405, {
        kind: "scene-viewer-bootstrap-error",
        schemaVersion: 1,
        code: "VIEWER_BOOTSTRAP_METHOD_NOT_ALLOWED",
      }, false);
      return;
    }
    void (async () => {
      let context: ViewerBootstrapResolutionContextV1;
      if (options.fixedAuthoringSpecPath !== undefined) {
        context = {
          kind: "fixed-host",
          authoringSpecPath: options.fixedAuthoringSpecPath,
          ...(options.expectedFixedSceneId === undefined
            ? {}
            : { expectedSceneId: options.expectedFixedSceneId }),
        };
      } else {
        const selectedSceneIds = url.searchParams.getAll("scene");
        if (selectedSceneIds.length > 1) {
          return fail("VIEWER_BOOTSTRAP_INVALID_SELECTION");
        }
        context = {
          kind: "curated",
          catalogPath,
          ...(selectedSceneIds.length === 0
            ? {}
            : { selectedSceneId: selectedSceneIds[0] }),
        };
      }
      const bootstrap = await resolveViewerBootstrapV1(context);
      writeJson(response, 200, bootstrap, isHead);
    })().catch((error) => {
      const code = errorCode(error);
      writeJson(response, statusForCode(code), {
        kind: "scene-viewer-bootstrap-error",
        schemaVersion: 1,
        code,
      }, isHead);
    });
  };
}
