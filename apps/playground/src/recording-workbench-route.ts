import type { PlaygroundRuntimeRouteV1 } from "./playground-runtime-route.js";

export function recordingWorkbenchSceneId(
  runtimeRoute: PlaygroundRuntimeRouteV1,
): string | undefined {
  return runtimeRoute.mode === "viewer"
    ? runtimeRoute.studioWorldId
    : undefined;
}
