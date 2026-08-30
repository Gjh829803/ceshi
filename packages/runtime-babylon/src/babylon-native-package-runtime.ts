import {
  defineBabylonNativeScene,
  type BabylonNativeLockedAssetResolverV1,
  type BabylonNativeSceneModuleV1,
} from "@whitebox-world/native-babylon";
import {
  createBabylonNativeLockedAssetResolutionFailureV1,
  type BabylonNativeSceneAdmissionBudgetV1,
} from "@whitebox-world/native-babylon/host";
import type {
  BabylonNativeDependencyLockV1,
  BabylonNativeSceneModuleBundleManifestV1,
  NativeSceneModuleBundleRefV1,
} from "@whitebox-world/runtime-contracts";
import {
  runtimeWorldConfigurationFromVerifiedWorldPackageV1,
  type RuntimeWorldAdapterDescriptorV1,
} from "@whitebox-world/runtime-host";
import type { VerifiedBabylonNativeWorldPackageDirectoryV1 } from
  "@whitebox-world/world-package";
import { isEqual, isNil } from "lodash-es";

export interface BabylonNativeSceneModuleLoadRequestV1 {
  readonly sceneModuleBundleRef: NativeSceneModuleBundleRefV1;
  readonly sceneModuleBundleManifest:
    BabylonNativeSceneModuleBundleManifestV1;
  readonly sceneModuleBundleBytes: Uint8Array;
  readonly dependencyLock: BabylonNativeDependencyLockV1;
}

export interface BabylonNativeSceneModuleLoaderV1 {
  load(
    request: BabylonNativeSceneModuleLoadRequestV1,
  ): Promise<BabylonNativeSceneModuleV1>;
}

export type BabylonNativeRuntimePackageErrorCodeV1 =
  | "WORLDKIT_NATIVE_SCENE_RUNTIME_PACKAGE_MISMATCH"
  | "WORLDKIT_NATIVE_SCENE_RUNTIME_MODULE_LOAD_FAILED"
  | "WORLDKIT_NATIVE_SCENE_RUNTIME_MODULE_INVALID";

export class BabylonNativeRuntimePackageErrorV1 extends Error {
  readonly code: BabylonNativeRuntimePackageErrorCodeV1;

  constructor(code: BabylonNativeRuntimePackageErrorCodeV1) {
    super(code);
    this.name = "BabylonNativeRuntimePackageErrorV1";
    this.code = code;
    Object.freeze(this);
  }
}

export interface PreparedBabylonNativeRuntimePackageV1 {
  readonly verifiedWorldPackage:
    VerifiedBabylonNativeWorldPackageDirectoryV1;
  readonly module: BabylonNativeSceneModuleV1;
  readonly assets: BabylonNativeLockedAssetResolverV1;
  readonly budget: BabylonNativeSceneAdmissionBudgetV1;
}

export interface PrepareBabylonNativeRuntimePackageInputV1 {
  readonly descriptor: RuntimeWorldAdapterDescriptorV1;
  readonly verifiedWorldPackage:
    VerifiedBabylonNativeWorldPackageDirectoryV1;
  readonly moduleLoader: BabylonNativeSceneModuleLoaderV1;
}

function packageError(
  code: BabylonNativeRuntimePackageErrorCodeV1,
): BabylonNativeRuntimePackageErrorV1 {
  return new BabylonNativeRuntimePackageErrorV1(code);
}

function assertExactDescriptor(
  descriptor: RuntimeWorldAdapterDescriptorV1,
  verifiedWorldPackage: VerifiedBabylonNativeWorldPackageDirectoryV1,
): void {
  const expected = runtimeWorldConfigurationFromVerifiedWorldPackageV1(
    verifiedWorldPackage,
  );
  if (
    descriptor.sceneSource.kind !== "babylon-native-scene" ||
    !isEqual(descriptor.worldBuildIdentity, expected.worldBuildIdentity) ||
    !isEqual(descriptor.gameplayBootstrap, expected.gameplayBootstrap) ||
    !isEqual(
      descriptor.worldRuntimeBootstrap,
      expected.worldRuntimeBootstrap,
    ) ||
    !isEqual(descriptor.sceneSource, expected.sceneSource)
  ) {
    throw packageError("WORLDKIT_NATIVE_SCENE_RUNTIME_PACKAGE_MISMATCH");
  }
}

function createPackageAssetResolver(
  verifiedWorldPackage: VerifiedBabylonNativeWorldPackageDirectoryV1,
): BabylonNativeLockedAssetResolverV1 {
  const entryByRef = new Map(
    verifiedWorldPackage.assetLock.entries.map((entry) =>
      [entry.assetResourceRef, entry] as const
    ),
  );
  const resolver: BabylonNativeLockedAssetResolverV1 = {
    async resolve(request) {
      const entry = entryByRef.get(request.assetResourceRef);
      const bytes = verifiedWorldPackage.immutableAssetBytesByResourceRef.get(
        request.assetResourceRef,
      );
      if (isNil(entry) || isNil(bytes)) {
        throw createBabylonNativeLockedAssetResolutionFailureV1({
          kind: "native-scene-diagnostic",
          schemaVersion: 1,
          id: "native-runtime.asset-not-locked",
          severity: "error",
          stage: "runtime",
          code: "WORLDKIT_NATIVE_SCENE_RUNTIME_ASSET_NOT_LOCKED",
          location: Object.freeze({
            kind: "asset-resource",
            assetResourceRef: request.assetResourceRef,
          }),
          measurement: Object.freeze({ kind: "none" }),
          message: "The requested Native Scene asset is not locked by the verified WorldPackage.",
          repairHint: "Declare and admit the asset before building a new WorldPackage.",
        });
      }
      return Object.freeze({
        kind: "babylon-native-locked-asset" as const,
        schemaVersion: 1 as const,
        assetResourceRef: entry.assetResourceRef,
        assetAdmissionReceiptRef: entry.assetAdmissionReceiptRef,
        assetAdmissionReceiptHash: entry.assetAdmissionReceiptHash,
        assetPublicationReceiptRef: entry.assetPublicationReceiptRef,
        assetPublicationReceiptHash: entry.assetPublicationReceiptHash,
        classBuildRecordRef: entry.classBuildRecordRef,
        classBuildRecordHash: entry.classBuildRecordHash,
        resourceManifestHash: entry.resourceManifestHash,
        artifactContentHash: entry.artifactContentHash,
        bytes: new Uint8Array(bytes),
        importMetadata: entry.importMetadata,
      });
    },
  };
  return Object.freeze(resolver);
}

export async function prepareBabylonNativeRuntimePackageV1(
  input: PrepareBabylonNativeRuntimePackageInputV1,
): Promise<PreparedBabylonNativeRuntimePackageV1> {
  assertExactDescriptor(input.descriptor, input.verifiedWorldPackage);
  let loadedModule: BabylonNativeSceneModuleV1;
  try {
    loadedModule = await input.moduleLoader.load(Object.freeze({
      sceneModuleBundleRef:
        input.verifiedWorldPackage.sceneModuleBundleRef,
      sceneModuleBundleManifest:
        input.verifiedWorldPackage.sceneModuleBundleManifest,
      sceneModuleBundleBytes: new Uint8Array(
        input.verifiedWorldPackage.sceneModuleBundleBytes,
      ),
      dependencyLock: input.verifiedWorldPackage.dependencyLock,
    }));
  } catch {
    throw packageError("WORLDKIT_NATIVE_SCENE_RUNTIME_MODULE_LOAD_FAILED");
  }
  let module: BabylonNativeSceneModuleV1;
  try {
    module = defineBabylonNativeScene(loadedModule);
  } catch {
    throw packageError("WORLDKIT_NATIVE_SCENE_RUNTIME_MODULE_INVALID");
  }
  const resourceBudget = input.verifiedWorldPackage.manifest.resourceBudget;
  return Object.freeze({
    verifiedWorldPackage: input.verifiedWorldPackage,
    module,
    assets: createPackageAssetResolver(input.verifiedWorldPackage),
    budget: Object.freeze({
      maximumStaticColliderCount: resourceBudget.maximumColliders,
      maximumStaticColliderVertexCount: resourceBudget.maximumVertices,
      maximumStaticColliderTriangleCount: resourceBudget.maximumTriangles,
    }),
  });
}
