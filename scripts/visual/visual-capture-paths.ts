import { parseWorldGenerationSceneSourceKindV1 } from "@whitebox-world/scene-authoring-contracts";

/** Presentation references the source's real captures; it never fabricates a Canonical map. */
export function visualCapturePaths(sceneSource: unknown = "canonical") {
  const source = parseWorldGenerationSceneSourceKindV1(sceneSource);
  const native = source === "babylon-native";
  const triviewRoot = native ? "final/capture/triviews" : "triviews";
  return {
    source,
    opening: native ? "final/capture/opening.png" : "opening-frame.png",
    triviewRoot,
    manifest: `${triviewRoot}/whitebox-triview-manifest.json`,
    receipt: native ? "final/capture/formal-world-capture-receipt.json" : undefined,
  };
}
