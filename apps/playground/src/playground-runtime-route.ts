import { isNil } from "lodash-es";

export interface PlaygroundRuntimeRouteDiagnosticV1 {
  readonly severity: "error";
  readonly code:
    | "PLAYGROUND_RUNTIME_ROUTE_CONFLICT"
    | "PLAYGROUND_SCENE_NOT_FOUND";
  readonly message: string;
}

export type PlaygroundRuntimeRouteV1 =
  | { readonly mode: "authoring" }
  | { readonly mode: "catalog-gameplay"; readonly sceneCatalogId: string }
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
): PlaygroundRuntimeRouteV1 {
  const parameters = new URLSearchParams(search);
  const authoringEnabled = parameters.get("authoring") === "1";
  const artifactEnabled = parameters.get("artifact") === "1";
  const captureArtifactsEnabled = parameters.get("captureArtifacts") === "1";

  if (captureArtifactsEnabled && !artifactEnabled) {
    return unknownRoute(
      "PLAYGROUND_RUNTIME_ROUTE_CONFLICT",
      "Artifact capture requires artifact-only mode (?artifact=1).",
    );
  }
  if (authoringEnabled && artifactEnabled) {
    return unknownRoute(
      "PLAYGROUND_RUNTIME_ROUTE_CONFLICT",
      "Authoring and artifact-only routes cannot be active together.",
    );
  }
  if (authoringEnabled) return Object.freeze({ mode: "authoring" });

  const requestedSceneCatalogId = parameters.get("scene");
  const trimmedSceneCatalogId = isNil(requestedSceneCatalogId)
    ? ""
    : requestedSceneCatalogId.trim();
  const sceneCatalogId = trimmedSceneCatalogId === ""
    ? DEFAULT_SCENE_CATALOG_ID
    : trimmedSceneCatalogId;
  if (!Object.hasOwn(sceneCatalog, sceneCatalogId)) {
    return unknownRoute(
      "PLAYGROUND_SCENE_NOT_FOUND",
      `Scene '${sceneCatalogId}' is not registered.`,
    );
  }

  if (artifactEnabled) {
    return Object.freeze({
      mode: "artifact-only",
      sceneCatalogId,
      captureArtifactsEnabled,
    });
  }
  return Object.freeze({ mode: "catalog-gameplay", sceneCatalogId });
}
