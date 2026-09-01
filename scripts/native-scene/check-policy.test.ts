import { describe, expect, it } from "vitest";

import {
  createBabylonNativeAssetFreeResolverV1,
  resolveBabylonNativeCheckPolicyV1,
} from "./check-policy.js";
import { BNA2_WHITEBOX_ADMISSION_BUDGET_V1 } from
  "./admission-budget.js";
import { VALID_NATIVE_SCENE_BOOTSTRAP_FIXTURE_V1 } from "./test-support.js";

describe("BNA2 Native check policy", () => {
  it.each([
    "worldkit://native-scene-profile/whitebox.standard@1",
    "worldkit://native-scene-profile/whitebox.blocks@1",
  ])("maps %s to the one frozen whitebox budget", (nativeSceneProfileRef) => {
    const result = resolveBabylonNativeCheckPolicyV1({
      ...VALID_NATIVE_SCENE_BOOTSTRAP_FIXTURE_V1,
      nativeSceneProfileRef,
    });

    expect(result.outcome).toBe("passed");
    if (result.outcome === "passed") {
      expect(result.budget).toBe(BNA2_WHITEBOX_ADMISSION_BUDGET_V1);
      expect(result.budget).toEqual({
        maximumStaticColliderCount: 256,
        maximumStaticColliderVertexCount: 65_536,
        maximumStaticColliderTriangleCount: 131_072,
      });
      expect(Object.isFrozen(result.budget)).toBe(true);
    }
  });

  it("rejects every profile outside the closed policy map", () => {
    const result = resolveBabylonNativeCheckPolicyV1({
      ...VALID_NATIVE_SCENE_BOOTSTRAP_FIXTURE_V1,
      nativeSceneProfileRef:
        "worldkit://native-scene-profile/not-registered@1",
    });

    expect(result.outcome).toBe("rejected");
    if (result.outcome === "rejected") {
      expect(result.diagnostics[0]?.code).toBe(
        "WORLDKIT_NATIVE_SCENE_PROFILE_UNSUPPORTED",
      );
      expect(result.diagnostics[0]?.stage).toBe("capability");
    }
  });

  it("returns one stable locked-asset diagnostic without provider detail", async () => {
    const resolver = createBabylonNativeAssetFreeResolverV1();

    await expect(resolver.resolve({
      assetResourceRef: "worldkit://asset/not-locked@1",
    })).rejects.toMatchObject({
      diagnostic: {
        code: "WORLDKIT_NATIVE_SCENE_ASSET_LOCK_UNAVAILABLE",
        stage: "capability",
        location: {
          kind: "asset-resource",
          assetResourceRef: "worldkit://asset/not-locked@1",
        },
      },
    });
  });
});
