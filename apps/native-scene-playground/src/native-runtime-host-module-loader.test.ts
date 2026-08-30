import { readFile } from "node:fs/promises";

import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
import {
  assembleWorldPackageDirectoryV1,
  assertWorldPackageBuildReceiptV1,
  verifyWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeSpies = vi.hoisted(() => ({
  create: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("@whitebox-world/runtime-babylon", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@whitebox-world/runtime-babylon")
  >();
  return {
    ...original,
    BabylonWorldRuntime: {
      create: runtimeSpies.create,
    },
  };
});

import { NativeRuntimeHostV1 } from "./native-runtime-host.js";

const CLOUD_RIDGE_PACKAGE_ROOT = new URL(
  "../../playground/public/world-packages/cloud-ridge/",
  import.meta.url,
);

async function verifiedCloudRidgePackage() {
  const receipt = assertWorldPackageBuildReceiptV1(JSON.parse(
    await readFile(
      new URL("world-package-build-receipt.json", CLOUD_RIDGE_PACKAGE_ROOT),
      "utf8",
    ),
  ));
  const files = await Promise.all(receipt.fileIntegrityEntries.map(
    async ({ path, mediaType }) => ({
      path,
      mediaType,
      bytes: new Uint8Array(await readFile(
        new URL(path, CLOUD_RIDGE_PACKAGE_ROOT),
      )),
    }),
  ));
  const verified = verifyWorldPackageDirectoryV1(
    assembleWorldPackageDirectoryV1({ receipt, files }),
  );
  if (verified.kind !== "babylon-native-scene") {
    throw new Error("Cloud Ridge is not a Babylon Native WorldPackage.");
  }
  return verified;
}

describe("Native Playground exact linked Module loader", () => {
  beforeEach(() => {
    runtimeSpies.create.mockReset();
    runtimeSpies.dispose.mockReset();
  });

  it("rejects a linked Module whose build-time Bundle hash differs from the verified Package", async () => {
    const verifiedWorldPackage = await verifiedCloudRidgePackage();
    const loadedSceneModule = defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "mismatched-preloaded-module",
      build() {},
    });
    const options = {
      runtimeSessionId: "native-loader-mismatch",
      canvasHost: Object.freeze({}) as HTMLElement,
      verifiedWorldPackage,
      loadedSceneModule,
      loadedSceneModuleBundleContentHash:
        `sha256:${"f".repeat(64)}` as const,
      subjectAssetResolver: Object.freeze({
        async resolveSubjectAsset() {
          throw new Error("Asset resolution must not run for a mismatched Module.");
        },
      }),
    };

    await expect(NativeRuntimeHostV1.create(options)).rejects.toThrow(
      "WORLDKIT_NATIVE_SCENE_MODULE_BUNDLE_MISMATCH",
    );
  });

  it("removes the Candidate canvas when post-Runtime admission setup fails", async () => {
    const verifiedWorldPackage = await verifiedCloudRidgePackage();
    const loadedSceneModule = defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "missing-admission-callback-module",
      build() {},
    });
    runtimeSpies.create.mockResolvedValue(Object.freeze({
      dispose: runtimeSpies.dispose,
    }));
    runtimeSpies.dispose.mockResolvedValue(undefined);
    let isCandidateCanvasInserted = false;
    let isCandidateCanvasRemoved = false;
    const candidateCanvas = {
      hidden: false,
      tabIndex: 0,
      setAttribute() {},
      remove() {
        isCandidateCanvasRemoved = true;
      },
    } as unknown as HTMLCanvasElement;
    const canvasHost = {
      ownerDocument: {
        createElement() {
          return candidateCanvas;
        },
      },
      prepend(canvas: HTMLCanvasElement) {
        expect(canvas).toBe(candidateCanvas);
        isCandidateCanvasInserted = true;
      },
    } as unknown as HTMLElement;

    await expect(NativeRuntimeHostV1.create({
      runtimeSessionId: "native-loader-post-runtime-failure",
      canvasHost,
      verifiedWorldPackage,
      loadedSceneModule,
      loadedSceneModuleBundleContentHash:
        verifiedWorldPackage.sceneModuleBundleManifest.bundleContentHash,
      subjectAssetResolver: Object.freeze({
        async resolveSubjectAsset() {
          throw new Error("Asset resolution is not expected in this test.");
        },
      }),
    })).rejects.toThrow("WORLD_SESSION_FAILED");

    expect(isCandidateCanvasInserted).toBe(true);
    expect(runtimeSpies.dispose).toHaveBeenCalledTimes(1);
    expect(isCandidateCanvasRemoved).toBe(true);
  });
});
