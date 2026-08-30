import {
  parseNativeSceneCheckResultV1,
  type NativeSceneCheckedInputV1,
  type NativeSceneCheckResultV1,
  type NativeSceneDiagnosticV1,
} from "@whitebox-world/native-babylon";
import { replayBabylonNativeSceneModuleV1 } from
  "@whitebox-world/native-babylon/host";
import { orderBy } from "lodash-es";

import {
  readBabylonNativeAuthoringWorkspaceRootV1,
} from "./authoring-workspace.js";
import {
  createBabylonNativeAssetFreeResolverV1,
  createBabylonNativeNullEngineCandidateFactoryV1,
  resolveBabylonNativeCheckPolicyV1,
} from "./check-policy.js";
import {
  typecheckBundleAndLoadBabylonNativeSceneModuleV1,
} from "./ephemeral-bundle.js";
import { admitBabylonNativeSourceGraphV1 } from "./source-admission.js";

function diagnosticLocationSortKey(
  diagnostic: NativeSceneDiagnosticV1,
): string {
  const { location } = diagnostic;
  if (location.kind === "source") return `0:${location.sourcePath}`;
  if (location.kind === "registration") {
    return `1:${location.registrationId}`;
  }
  if (location.kind === "asset-resource") {
    return `2:${location.assetResourceRef}`;
  }
  if (location.kind === "asset-lock") {
    return `3:${location.assetResourceRef}:${location.assetAdmissionReceiptRef}`;
  }
  if (location.kind === "bootstrap") return `4:${location.instancePath}`;
  if (location.kind === "world") {
    return `5:${location.positionMetersXYZ.join(",")}`;
  }
  return "6:";
}

function sortedDiagnostics(
  diagnostics: readonly NativeSceneDiagnosticV1[],
): readonly NativeSceneDiagnosticV1[] {
  return Object.freeze(orderBy(diagnostics, [
    diagnosticLocationSortKey,
    (diagnostic) => diagnostic.location.kind === "source"
      ? diagnostic.location.lineNumber
      : 0,
    (diagnostic) => diagnostic.location.kind === "source"
      ? diagnostic.location.columnNumber
      : 0,
    "code",
    "id",
  ], ["asc", "asc", "asc", "asc", "asc"]));
}

function result(
  id: string,
  checkedInput: NativeSceneCheckedInputV1,
  outcome: NativeSceneCheckResultV1["outcome"],
  diagnostics: readonly NativeSceneDiagnosticV1[],
): NativeSceneCheckResultV1 {
  return parseNativeSceneCheckResultV1({
    kind: "native-scene-check-result",
    schemaVersion: 1,
    id,
    checkedInput,
    outcome,
    diagnostics: sortedDiagnostics(diagnostics),
  });
}

function resultFromFailure(
  id: string,
  checkedInput: NativeSceneCheckedInputV1,
  failure: Readonly<{
    outcome: "rejected" | "tool-error";
    diagnostics: readonly NativeSceneDiagnosticV1[];
  }>,
): NativeSceneCheckResultV1 {
  return result(id, checkedInput, failure.outcome, failure.diagnostics);
}

export async function checkBabylonNativeSceneWorldDirectoryV1(
  worldDirectoryPath: string,
): Promise<NativeSceneCheckResultV1> {
  const workspace = await readBabylonNativeAuthoringWorkspaceRootV1(
    worldDirectoryPath,
  );
  if (workspace.outcome !== "passed") {
    return resultFromFailure(
      "native-scene.unresolved-world-check",
      { kind: "unresolved-world" },
      workspace,
    );
  }

  const { bootstrap } = workspace.workspaceRoot;
  const checkedInput = Object.freeze({
    kind: "native-scene-module" as const,
    sceneModuleRef: bootstrap.sceneModuleRef,
  });
  const checkId = `${bootstrap.id}.native-scene-check`;
  const source = await admitBabylonNativeSourceGraphV1(worldDirectoryPath);
  if (source.outcome !== "passed") {
    return resultFromFailure(checkId, checkedInput, source);
  }

  const policy = resolveBabylonNativeCheckPolicyV1(bootstrap);
  if (policy.outcome !== "passed") {
    return resultFromFailure(checkId, checkedInput, policy);
  }

  const loaded = await typecheckBundleAndLoadBabylonNativeSceneModuleV1(
    source.sourceGraph,
  );
  if (loaded.outcome !== "passed") {
    return resultFromFailure(checkId, checkedInput, loaded);
  }

  const replay = await replayBabylonNativeSceneModuleV1({
    candidateFactory: createBabylonNativeNullEngineCandidateFactoryV1(),
    bootstrap,
    module: loaded.module,
    assets: createBabylonNativeAssetFreeResolverV1(),
    budget: policy.budget,
  });
  return result(
    checkId,
    checkedInput,
    replay.checkResult.outcome,
    replay.checkResult.diagnostics,
  );
}
