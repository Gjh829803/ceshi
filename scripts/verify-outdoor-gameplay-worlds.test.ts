import { describe, expect, it } from "vitest";

import {
  OUTDOOR_GAMEPLAY_SCENE_CATALOG_IDS,
  outdoorGameplayFailureCount,
  outdoorGameplaySceneUrl,
  type OutdoorGameplayVerificationReportV1,
  type VerificationResultV1,
} from "./verify-outdoor-gameplay-worlds.js";

function failed<T>(message: string): VerificationResultV1<T> {
  return {
    status: "failed",
    failure: { name: "Error", message },
  };
}

describe("verify:outdoor-gameplay", () => {
  it("locks the complete six-scene outdoor catalog", () => {
    expect(OUTDOOR_GAMEPLAY_SCENE_CATALOG_IDS).toEqual([
      "grassland",
      "azure-bay",
      "canyon",
      "mistbound-rider",
      "sunlit-flower-bay",
      "world-08170639-54db",
    ]);
  });

  it("creates distinct gameplay and artifact-only routes", () => {
    expect(outdoorGameplaySceneUrl("http://127.0.0.1:5173", "azure-bay"))
      .toBe("http://127.0.0.1:5173/?scene=azure-bay");
    expect(
      outdoorGameplaySceneUrl(
        "http://127.0.0.1:5173/?stale=1",
        "azure-bay",
        true,
      ),
    ).toBe(
      "http://127.0.0.1:5173/?stale=1&scene=azure-bay&artifact=1",
    );
  });

  it("counts failures across gameplay, unknown-scene, and artifact gates", () => {
    const report = {
      kind: "outdoor-gameplay-browser-verification",
      schemaVersion: 1,
      generatedAt: "2026-08-24T00:00:00.000Z",
      scenes: [failed("gameplay")],
      invalidSceneRoute: failed("unknown-scene"),
      artifacts: [failed("artifact")],
    } satisfies OutdoorGameplayVerificationReportV1;

    expect(outdoorGameplayFailureCount(report)).toBe(3);
  });
});
