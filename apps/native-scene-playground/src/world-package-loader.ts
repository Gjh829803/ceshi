import {
  assembleWorldPackageDirectoryV1,
  assertWorldPackageBuildReceiptV1,
  verifyWorldPackageDirectoryV1,
  type VerifiedBabylonNativeWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";

async function fetchRequired(url: URL): Promise<Response> {
  const response = await fetch(url, {
    mode: "same-origin",
    credentials: "same-origin",
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok || response.redirected) {
    throw new Error("WORLDKIT_NATIVE_WORLD_PACKAGE_FETCH_FAILED");
  }
  return response;
}

export async function loadVerifiedNativeWorldPackageV1(
  packageBaseUrl: URL,
): Promise<VerifiedBabylonNativeWorldPackageDirectoryV1> {
  const receipt = assertWorldPackageBuildReceiptV1(await (
    await fetchRequired(new URL(
      "world-package-build-receipt.json",
      packageBaseUrl,
    ))
  ).json());
  const files = await Promise.all(receipt.fileIntegrityEntries.map(
    async ({ path, mediaType }) => ({
      path,
      mediaType,
      bytes: new Uint8Array(await (
        await fetchRequired(new URL(path, packageBaseUrl))
      ).arrayBuffer()),
    }),
  ));
  const verified = verifyWorldPackageDirectoryV1(
    assembleWorldPackageDirectoryV1({ receipt, files }),
  );
  if (verified.kind !== "babylon-native-scene") {
    throw new Error("WORLDKIT_NATIVE_WORLD_PACKAGE_KIND_INVALID");
  }
  return verified;
}
