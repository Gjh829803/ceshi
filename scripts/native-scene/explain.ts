import type {
  NativeSceneCheckResultV1,
  NativeSceneDiagnosticLocationV1,
} from "@whitebox-world/native-babylon";

function explainLocation(location: NativeSceneDiagnosticLocationV1): string {
  if (location.kind === "none") return "none";
  if (location.kind === "bootstrap") return `bootstrap:${location.instancePath}`;
  if (location.kind === "source") {
    return `${location.sourcePath}:${location.lineNumber}:${location.columnNumber}`;
  }
  if (location.kind === "registration") return `registration:${location.registrationId}`;
  if (location.kind === "asset-resource") return `asset:${location.assetResourceRef}`;
  if (location.kind === "asset-lock") {
    return `asset-lock:${location.assetResourceRef}`;
  }
  return `world:${location.positionMetersXYZ.join(",")}`;
}

export function explainNativeSceneCheckResultV1(
  result: NativeSceneCheckResultV1,
): string {
  const lines = [`outcome: ${result.outcome}`];
  for (const diagnostic of result.diagnostics) {
    lines.push(
      `stage: ${diagnostic.stage} | code: ${diagnostic.code} | ` +
      `location: ${explainLocation(diagnostic.location)} | ` +
      `message: ${diagnostic.message} | repairHint: ${diagnostic.repairHint}`,
    );
  }
  return `${lines.join("\n")}\n`;
}
