import { stringifyCanonicalJson } from "@whitebox-world/protocol";

import { verifyHostedWhiteboxArtifactsV1 } from "../lib/hosted-whitebox-artifact-verifier.js";

function option(arguments_: readonly string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  return index < 0 ? undefined : arguments_[index + 1];
}

export async function main(arguments_: readonly string[] = process.argv.slice(2)): Promise<number> {
  const sceneId = option(arguments_, "--scene-id");
  const authoringPath = option(arguments_, "--authoring");
  const buildPath = option(arguments_, "--build");
  const openingFramePath = option(arguments_, "--opening-frame");
  const runtimeSnapshotPath = option(arguments_, "--runtime-snapshot");
  const captureReceiptPath = option(arguments_, "--capture-receipt");
  const trustedCapturePublicKeyPath = option(arguments_, "--trusted-public-key");
  const whiteboxTriviewManifestPath = option(arguments_, "--triview-manifest");
  const whiteboxTriviewRoot = option(arguments_, "--triview-root");
  const requireTriview = arguments_.includes("--require-triview");
  if (
    sceneId === undefined ||
    authoringPath === undefined ||
    buildPath === undefined ||
    openingFramePath === undefined ||
    runtimeSnapshotPath === undefined ||
    captureReceiptPath === undefined ||
    trustedCapturePublicKeyPath === undefined ||
    (requireTriview &&
      (whiteboxTriviewManifestPath === undefined || whiteboxTriviewRoot === undefined))
  ) {
    process.stderr.write(
      "Usage: verify-hosted-whitebox-artifacts --scene-id <id> --authoring <json> --build <json> --opening-frame <png> --runtime-snapshot <json> --capture-receipt <json> --trusted-public-key <pem> [--require-triview --triview-manifest <json> --triview-root <directory>]\n",
    );
    return 2;
  }
  const result = await verifyHostedWhiteboxArtifactsV1({
    sceneId,
    authoringPath,
    buildPath,
    openingFramePath,
    runtimeSnapshotPath,
    captureReceiptPath,
    trustedCapturePublicKeyPath,
    requireTriview,
    ...(whiteboxTriviewManifestPath === undefined
      ? {}
      : { whiteboxTriviewManifestPath }),
    ...(whiteboxTriviewRoot === undefined ? {} : { whiteboxTriviewRoot }),
  });
  process.stdout.write(`${stringifyCanonicalJson(result)}\n`);
  return result.ok ? 0 : 1;
}

process.exitCode = await main();
