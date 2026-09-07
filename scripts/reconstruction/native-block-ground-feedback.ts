import {
  analyzeBabylonNativeBlockSourceGroundV1,
  deriveBabylonNativeBlockSourceGroundGeometryV1,
  deriveBabylonNativeBlockSourceLayoutV1,
  BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
} from "@whitebox-world/native-babylon-block-profile/host";
import type { BabylonNativeBlockCreateInputV1, BabylonNativeBlockStaticColliderSelectionV1 } from "@whitebox-world/native-babylon-block-profile";
import { BUILT_IN_NATIVE_BLOCK_GROUND_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF, resolveTraversalGraphBuilderProfileV2 } from "@whitebox-world/traversal";
import type { WorldRuntimeBootstrapV1 } from "@whitebox-world/runtime-contracts";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { groupBy, orderBy } from "lodash-es";
import { createNativeBlockGroundIntentV1, type NativeBlockGroundIntentInputV1 } from "./native-ground-case-intent.js";

/** Same-task authoring feedback, never a Package or Runtime admission receipt. */
export function checkNativeBlockGroundFeedbackV1(input: NativeBlockGroundIntentInputV1 & Readonly<{
  blocks: readonly BabylonNativeBlockCreateInputV1[];
  selections: readonly BabylonNativeBlockStaticColliderSelectionV1[];
  worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
}>) {
  const layout = deriveBabylonNativeBlockSourceLayoutV1(input.blocks.map(block => ({ input: block })));
  if (layout.issues.length > 0) throw new TypeError(
    `NATIVE_BLOCK_BUILDER_GROUND_INVALID: ${layout.issues.map(issue => `${issue.code}:${issue.blockId}`).join("; ")}`,
  );
  const groundModel = deriveBabylonNativeBlockSourceGroundGeometryV1({ blocks: layout.blocks, selections: input.selections });
  const subject = input.worldRuntimeBootstrap.subjectRuntimeDescriptors.find(row =>
    row.entityId === input.worldRuntimeBootstrap.initialControlledEntityId);
  if (subject === undefined) throw new TypeError("NATIVE_BLOCK_BUILDER_GROUND_INVALID: controlled Subject missing");
  const blockCount = Math.max(1, input.blocks.length);
  const report = analyzeBabylonNativeBlockSourceGroundV1({
    groundModel,
    envelope: {
      capsuleRadiusMeters: subject.collider.radiusMeters,
      capsuleHeightMeters: subject.collider.heightMeters,
      clearanceMarginMeters: resolveTraversalGraphBuilderProfileV2(
        BUILT_IN_NATIVE_BLOCK_GROUND_TRAVERSAL_GRAPH_BUILDER_PROFILE_REF,
      ).profile.clearanceMarginMeters,
    },
    caseIntent: createNativeBlockGroundIntentV1(input),
    measurementChunkPolicy: BABYLON_NATIVE_BLOCK_CURRENT_CHUNK_POLICY_V1,
    budget: { kind: "babylon-native-block-ground-analysis-budget", schemaVersion: 1,
      maximumSolidOccupancyCellCount: blockCount * 16, maximumSupportTopCellCount: blockCount * 4 },
  });
  // Summarize the existing Host graph; never derive a second connectivity graph.
  // Legacy check.ts reports the largest 16 disconnected components with bounds.
  const disconnectedComponentSummaries = orderBy(Object.values(groupBy(
    report.standableNodes.filter(node => !node.isReachableFromSpawn),
    node => node.componentId,
  )).map(nodes => {
    const minimum = new Vector3(Infinity, Infinity, Infinity);
    const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const node of nodes) {
      minimum.minimizeInPlaceFromFloats(...node.positionMetersXYZ);
      maximum.maximizeInPlaceFromFloats(...node.positionMetersXYZ);
    }
    const sample = orderBy(nodes, node => node.positionMetersXYZ.join(","))[0]!;
    return Object.freeze({
      standPositionCount: nodes.length,
      minimumMetersXYZ: Object.freeze([minimum.x, minimum.y, minimum.z]),
      maximumMetersXYZ: Object.freeze([maximum.x, maximum.y, maximum.z]),
      sampleStandPositionMetersXYZ: sample.positionMetersXYZ,
    });
  }), [summary => summary.standPositionCount,
    summary => summary.sampleStandPositionMetersXYZ.join(",")], ["desc", "asc"]);
  return Object.freeze({
    outcome: report.admissionOutcome,
    disconnectedComponentCount: disconnectedComponentSummaries.length,
    disconnectedComponentSummaries: Object.freeze(disconnectedComponentSummaries.slice(0, 16)),
    failureFacts: Object.freeze(report.failureFacts.slice(0, 32).map(fact => Object.freeze({
      ...fact, affectedSourceBlockIds: Object.freeze(fact.affectedSourceBlockIds.slice(0, 32)),
      omittedAffectedSourceBlockCount: Math.max(0, fact.affectedSourceBlockIds.length - 32),
    }))),
    omittedFailureFactCount: Math.max(0, report.failureFacts.length - 32),
    metrics: report.metrics,
  });
}
