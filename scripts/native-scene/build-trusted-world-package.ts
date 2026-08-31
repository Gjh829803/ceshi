import {
  createBabylonNativeWorldPackageV1,
  verifyWorldPackageDirectoryV1,
  type WorldPackageDirectoryV1,
} from "@whitebox-world/world-package";

import {
  prepareFrozenBabylonNativeWorldPackageBuildInputV1,
  type PreparedFrozenBabylonNativeWorldPackageBuildInputV1,
  type PrepareFrozenBabylonNativeWorldPackageBuildInputV1,
} from "./native-package-input.js";

export class BabylonNativeWorldPackageBuildErrorV1 extends Error {
  readonly code = "WORLDKIT_NATIVE_WORLD_PACKAGE_BUILD_FAILED";

  constructor(cause?: unknown) {
    super("WORLDKIT_NATIVE_WORLD_PACKAGE_BUILD_FAILED", { cause });
  }
}

export async function buildTrustedBabylonNativeWorldPackageV1(
  input: PrepareFrozenBabylonNativeWorldPackageBuildInputV1,
): Promise<WorldPackageDirectoryV1> {
  try {
    const prepared =
      await prepareFrozenBabylonNativeWorldPackageBuildInputV1(input);
    return buildTrustedBabylonNativeWorldPackageFromPreparedV1(prepared);
  } catch (error) {
    if (error instanceof BabylonNativeWorldPackageBuildErrorV1) throw error;
    throw new BabylonNativeWorldPackageBuildErrorV1(error);
  }
}

export function buildTrustedBabylonNativeWorldPackageFromPreparedV1(
  prepared: PreparedFrozenBabylonNativeWorldPackageBuildInputV1,
): WorldPackageDirectoryV1 {
  try {
    const directory = createBabylonNativeWorldPackageV1(
      prepared.frozenInput,
    );
    const verified = verifyWorldPackageDirectoryV1(directory);
    if (verified.kind !== "babylon-native-scene") {
      throw new Error("trusted Native pipeline produced a non-Native package");
    }
    return directory;
  } catch (error) {
    if (error instanceof BabylonNativeWorldPackageBuildErrorV1) throw error;
    throw new BabylonNativeWorldPackageBuildErrorV1(error);
  }
}
