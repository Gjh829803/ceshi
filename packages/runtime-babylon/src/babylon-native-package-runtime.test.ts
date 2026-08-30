import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
import {
  createBabylonNativeWorldPackageV1,
  verifyWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { createBabylonNativeWorldPackageTestInputV1 } from
  "@whitebox-world/world-package/testing";
import { runtimeWorldConfigurationFromVerifiedWorldPackageV1 } from
  "@whitebox-world/runtime-host";
import { describe, expect, it, vi } from "vitest";

import {
  BabylonNativeRuntimePackageErrorV1,
  prepareBabylonNativeRuntimePackageV1,
  type BabylonNativeSceneModuleLoaderV1,
} from "./babylon-native-package-runtime";

function fixture() {
  const verified = verifyWorldPackageDirectoryV1(
    createBabylonNativeWorldPackageV1(
      createBabylonNativeWorldPackageTestInputV1(),
    ),
  );
  if (verified.kind !== "babylon-native-scene") {
    throw new Error("unreachable");
  }
  const configuration = runtimeWorldConfigurationFromVerifiedWorldPackageV1(
    verified,
  );
  if (configuration.sceneSource.kind !== "babylon-native-scene") {
    throw new Error("unreachable");
  }
  return {
    verified,
    descriptor: Object.freeze({
      runtimeSessionId: "runtime.native-package",
      worldSessionId: "world-session.native-package",
      worldBuildIdentity: configuration.worldBuildIdentity,
      gameplayBootstrap: configuration.gameplayBootstrap,
      worldRuntimeBootstrap: configuration.worldRuntimeBootstrap,
      sceneSource: configuration.sceneSource,
    }),
  };
}

function module() {
  return defineBabylonNativeScene({
    kind: "babylon-native-scene-module",
    id: "package-fixture-module",
    build() {},
  });
}

describe("Babylon verified Native runtime Package preparation", () => {
  it("loads one exact copied Bundle and derives budget exclusively from Package", async () => {
    const { verified, descriptor } = fixture();
    const load = vi.fn<BabylonNativeSceneModuleLoaderV1["load"]>(
      async () => module(),
    );
    const loader = Object.freeze({ load });

    const prepared = await prepareBabylonNativeRuntimePackageV1({
      descriptor,
      verifiedWorldPackage: verified,
      moduleLoader: loader,
    });

    expect(loader.load).toHaveBeenCalledTimes(1);
    const request = load.mock.calls[0]![0];
    expect(Object.keys(request)).toEqual([
      "sceneModuleBundleRef",
      "sceneModuleBundleManifest",
      "sceneModuleBundleBytes",
      "dependencyLock",
    ]);
    expect(request.sceneModuleBundleRef).toBe(verified.sceneModuleBundleRef);
    expect(request.sceneModuleBundleManifest).toBe(
      verified.sceneModuleBundleManifest,
    );
    expect(request.dependencyLock).toBe(verified.dependencyLock);
    expect(request.sceneModuleBundleBytes).not.toBe(
      verified.sceneModuleBundleBytes,
    );
    expect([...request.sceneModuleBundleBytes]).toEqual([
      ...verified.sceneModuleBundleBytes,
    ]);
    expect(prepared.budget).toEqual({
      maximumStaticColliderCount:
        verified.manifest.resourceBudget.maximumColliders,
      maximumStaticColliderVertexCount:
        verified.manifest.resourceBudget.maximumVertices,
      maximumStaticColliderTriangleCount:
        verified.manifest.resourceBudget.maximumTriangles,
    });
    expect(prepared.module.id).toBe("package-fixture-module");

    request.sceneModuleBundleBytes[0] =
      request.sceneModuleBundleBytes[0] === 0 ? 1 : 0;
    expect([...verified.sceneModuleBundleBytes]).not.toEqual([
      ...request.sceneModuleBundleBytes,
    ]);
  });

  it("fails descriptor mismatch before invoking the Module loader", async () => {
    const { verified, descriptor } = fixture();
    const load = vi.fn<BabylonNativeSceneModuleLoaderV1["load"]>(
      async () => module(),
    );
    const loader = Object.freeze({ load });

    await expect(prepareBabylonNativeRuntimePackageV1({
      descriptor: {
        ...descriptor,
        runtimeSessionId: "runtime.native-package.other",
        sceneSource: {
          ...descriptor.sceneSource,
          sceneModuleBundleRef:
            `package://native-scene-module/sha256/${"f".repeat(64)}`,
        },
      },
      verifiedWorldPackage: verified,
      moduleLoader: loader,
    })).rejects.toMatchObject({
      code: "WORLDKIT_NATIVE_SCENE_RUNTIME_PACKAGE_MISMATCH",
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("rejects an invalid loaded Module with a stable closed error", async () => {
    const { verified, descriptor } = fixture();
    const privateMessage = "private loader implementation detail";
    const loader = Object.freeze({
      load: vi.fn(async () => ({
        kind: "babylon-native-scene-module" as const,
        id: "package-fixture-module",
        build: privateMessage,
      })),
    }) as unknown as BabylonNativeSceneModuleLoaderV1;

    const error = await prepareBabylonNativeRuntimePackageV1({
      descriptor,
      verifiedWorldPackage: verified,
      moduleLoader: loader,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BabylonNativeRuntimePackageErrorV1);
    expect(error).toMatchObject({
      code: "WORLDKIT_NATIVE_SCENE_RUNTIME_MODULE_INVALID",
    });
    expect(String(error)).not.toContain(privateMessage);
  });

  it("sanitizes loader failure and exposes no undeclared asset fallback", async () => {
    const { verified, descriptor } = fixture();
    const privateMessage = "/private/workspace/native/scene.mjs failed";
    const loader = Object.freeze({
      load: vi.fn(async () => {
        throw new Error(privateMessage);
      }),
    });

    const error = await prepareBabylonNativeRuntimePackageV1({
      descriptor,
      verifiedWorldPackage: verified,
      moduleLoader: loader,
    }).catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      code: "WORLDKIT_NATIVE_SCENE_RUNTIME_MODULE_LOAD_FAILED",
    });
    expect(String(error)).not.toContain(privateMessage);

    const prepared = await prepareBabylonNativeRuntimePackageV1({
      descriptor,
      verifiedWorldPackage: verified,
      moduleLoader: Object.freeze({ load: async () => module() }),
    });
    await expect(prepared.assets.resolve({
      assetResourceRef: "worldkit://static-geometry-asset/undeclared@1",
    })).rejects.toMatchObject({
      diagnostic: {
        code: "WORLDKIT_NATIVE_SCENE_RUNTIME_ASSET_NOT_LOCKED",
        location: {
          kind: "asset-resource",
          assetResourceRef:
            "worldkit://static-geometry-asset/undeclared@1",
        },
      },
    });
  });
});
