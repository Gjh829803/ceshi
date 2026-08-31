export interface PlaygroundRuntimeRouteDiagnosticV1 {
  readonly severity: "error";
  readonly code:
    | "PLAYGROUND_RUNTIME_ROUTE_CONFLICT"
    | "PLAYGROUND_RUNTIME_ROUTE_REMOVED"
    | "PLAYGROUND_SCENE_NOT_FOUND";
  readonly message: string;
}

export type PlaygroundRuntimeRouteV1 =
  | { readonly mode: "viewer"; readonly studioWorldId?: string }
  | {
      readonly mode: "artifact-only";
      readonly sceneCatalogId: string;
      readonly captureArtifactsEnabled: boolean;
    }
  | {
      readonly mode: "unknown";
      readonly diagnostic: PlaygroundRuntimeRouteDiagnosticV1;
    };

export type PlaygroundSceneCatalogV1 = Readonly<Record<string, unknown>>;
export type PlaygroundViewerSourceAuthorityV1 = "curated-host" | "fixed-host";

const DEFAULT_SCENE_CATALOG_ID = "grassland";

function unknownRoute(
  code: PlaygroundRuntimeRouteDiagnosticV1["code"],
  message: string,
): PlaygroundRuntimeRouteV1 {
  return Object.freeze({
    mode: "unknown",
    diagnostic: Object.freeze({ severity: "error", code, message }),
  });
}

/** Classifies page ownership without constructing a renderer or RuntimeHost. */
export function resolvePlaygroundRuntimeRoute(
  search: string,
  sceneCatalog: PlaygroundSceneCatalogV1,
  viewerSourceAuthority: PlaygroundViewerSourceAuthorityV1,
  hostStudioWorldId?: string,
): PlaygroundRuntimeRouteV1 {
  const parameters = new URLSearchParams(search);
  const artifactEnabled = parameters.get("artifact") === "1";
  const captureArtifactsEnabled = parameters.get("captureArtifacts") === "1";

  if (parameters.has("authoring")) {
    return unknownRoute(
      "PLAYGROUND_RUNTIME_ROUTE_REMOVED",
      "The authoring route was removed; use the unified Viewer URL.",
    );
  }

  if (captureArtifactsEnabled && !artifactEnabled) {
    return unknownRoute(
      "PLAYGROUND_RUNTIME_ROUTE_CONFLICT",
      "Artifact capture requires artifact-only mode (?artifact=1).",
    );
  }
  const requestedSceneCatalogId = parameters.get("scene");
  const trimmedSceneCatalogId = requestedSceneCatalogId?.trim() ?? "";
  const fixedStudioWorldId = hostStudioWorldId?.trim() ?? "";

  if (parameters.has("world")) {
    return unknownRoute(
      "PLAYGROUND_RUNTIME_ROUTE_REMOVED",
      "The Browser world selector was removed; Studio binds the Viewer source in the Host document.",
    );
  }

  if (
    fixedStudioWorldId !== "" &&
    !/^[a-z0-9][a-z0-9-]{2,79}$/.test(fixedStudioWorldId)
  ) {
    return unknownRoute(
      "PLAYGROUND_RUNTIME_ROUTE_CONFLICT",
      "Studio Viewer source identity is invalid.",
    );
  }

  if (
    artifactEnabled &&
    (viewerSourceAuthority === "fixed-host" || fixedStudioWorldId !== "")
  ) {
    return unknownRoute(
      "PLAYGROUND_RUNTIME_ROUTE_CONFLICT",
      "Artifact mode cannot replace a Host-owned Viewer source.",
    );
  }

  if (!artifactEnabled) {
    if (trimmedSceneCatalogId !== "" && fixedStudioWorldId !== "") {
      return unknownRoute(
        "PLAYGROUND_RUNTIME_ROUTE_CONFLICT",
        "Curated and Studio Viewer sources cannot be selected together.",
      );
    }
    if (fixedStudioWorldId === "") {
      return Object.freeze({ mode: "viewer" });
    }
    return Object.freeze({
      mode: "viewer",
      studioWorldId: fixedStudioWorldId,
    });
  }

  const sceneCatalogId = trimmedSceneCatalogId === ""
    ? DEFAULT_SCENE_CATALOG_ID
    : trimmedSceneCatalogId;
  if (!Object.hasOwn(sceneCatalog, sceneCatalogId)) {
    return unknownRoute(
      "PLAYGROUND_SCENE_NOT_FOUND",
      `Scene '${sceneCatalogId}' is not registered.`,
    );
  }

  return Object.freeze({
    mode: "artifact-only",
    sceneCatalogId,
    captureArtifactsEnabled,
  });
}
