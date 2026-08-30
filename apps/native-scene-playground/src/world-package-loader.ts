import {
  assembleBabylonNativeWorldPackageDirectoryV1,
  assertWorldPackageBuildReceiptV1,
  verifyBabylonNativeWorldPackageDirectoryV1,
  type VerifiedBabylonNativeWorldPackageDirectoryV1,
} from "@whitebox-world/world-package/native-runtime";

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
  const verified = verifyBabylonNativeWorldPackageDirectoryV1(
    assembleBabylonNativeWorldPackageDirectoryV1({ receipt, files }),
  );
  return verified;
}
