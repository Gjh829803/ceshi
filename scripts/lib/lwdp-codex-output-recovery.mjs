import path from "node:path";
import { readFile } from "node:fs/promises";

import {
  assertSuccessfulJob,
  downloadS3FileAtomic,
  fetchGenerationItems,
  LwdpJobPendingError,
  loadLwdpGenerationConfig,
  lwdpRequest,
} from "./lwdp-generation-client.mjs";

const stageOutputs = Object.freeze({
  planner: Object.freeze([
    "artifacts/scenes/{sceneId}/scene-brief.md",
    "artifacts/scenes/{sceneId}/planner-self-check.json",
    "apps/playground/public/scene-plans/{sceneId}/entry-whitebox-target.png",
    "apps/playground/public/scene-plans/{sceneId}/world-plan.png",
  ]),
  builder: Object.freeze([
    "artifacts/scenes/{sceneId}/world.mjs",
    "artifacts/scenes/{sceneId}/authoring.json",
    "artifacts/scenes/{sceneId}/implementation-map.draft.json",
    "artifacts/scenes/{sceneId}/builder-self-check.json",
    "artifacts/scenes/{sceneId}/builder-top-down-comparison.png",
    "artifacts/scenes/{sceneId}/builder-entry-comparison.png",
  ]),
  visual: Object.freeze([
    "artifacts/scenes/{sceneId}/visual-generation-prompts.json",
    "artifacts/scenes/{sceneId}/styled-opening-frame.png",
  ]),
});

const terminalStatuses = new Set([
  "succeeded", "completed", "failed", "submit_failed", "cancelled", "stopped",
]);

function validId(value) {
  return /^[a-z0-9][a-z0-9-]{2,79}$/.test(String(value ?? ""));
}

function validatedVisualTargetIds(visualTargetIds) {
  if (
    !Array.isArray(visualTargetIds) ||
    visualTargetIds.length < 1 ||
    visualTargetIds.length > 5 ||
    visualTargetIds.some((targetId) => !validId(targetId)) ||
    new Set(visualTargetIds).size !== visualTargetIds.length
  ) {
    throw new Error("Visual late recovery requires 1-5 unique valid visual target ids.");
  }
  return visualTargetIds;
}

export function expectedLateCodexOutputPaths(sceneId, stage, { visualTargetIds } = {}) {
  if (!validId(sceneId)) throw new Error(`Invalid WorldKit scene id: ${sceneId}`);
  const templates = stageOutputs[stage];
  if (!templates) throw new Error(`Unsupported late LWDP recovery stage: ${stage}`);
  const fixed = templates.map((template) => template.replaceAll("{sceneId}", sceneId));
  if (stage !== "visual") return fixed;
  return [
    ...fixed,
    ...validatedVisualTargetIds(visualTargetIds).map((visualTargetId) =>
      `artifacts/scenes/${sceneId}/triviews/${visualTargetId}/styled-triview.png`),
  ];
}

export function resolveLateCodexOutputUris({
  sceneId,
  stage,
  taskId,
  outputUris,
  visualTargetIds,
}) {
  if (!validId(taskId)) throw new Error(`Invalid LWDP task id: ${taskId}`);
  if (!Array.isArray(outputUris)) throw new Error("LWDP succeeded item omitted metadata.output_uris.");
  const expectedPaths = expectedLateCodexOutputPaths(sceneId, stage, { visualTargetIds });
  const expectedTaskPrefix = `/tasks/${taskId}/`;
  const byRelativePath = new Map();
  for (const uri of outputUris) {
    if (typeof uri !== "string" || !uri.startsWith("s3://")) {
      throw new Error("LWDP output URI is not an S3 URI.");
    }
    const marker = uri.indexOf(expectedTaskPrefix);
    if (marker < 0) throw new Error(`LWDP output URI does not belong to task ${taskId}.`);
    const relativePath = uri.slice(marker + expectedTaskPrefix.length);
    if (!expectedPaths.includes(relativePath) || byRelativePath.has(relativePath)) {
      throw new Error(`LWDP output URI is outside the ${stage} recovery contract: ${relativePath}`);
    }
    byRelativePath.set(relativePath, uri);
  }
  const missing = expectedPaths.filter((relativePath) => !byRelativePath.has(relativePath));
  if (missing.length > 0) {
    throw new Error(`LWDP succeeded item omitted declared ${stage} outputs: ${missing.join(", ")}`);
  }
  return expectedPaths.map((relativePath) => ({ relativePath, s3Uri: byRelativePath.get(relativePath) }));
}

export async function recoverSucceededCodexJobOutputs({
  jobId,
  repoRoot,
  sceneId,
  stage,
  visualTargetIds,
  config,
  requestImplementation = lwdpRequest,
  itemsImplementation = fetchGenerationItems,
  downloadImplementation = downloadS3FileAtomic,
} = {}) {
  if (!/^gen_[a-z0-9]+$/.test(String(jobId ?? ""))) throw new Error(`Invalid LWDP job id: ${jobId}`);
  const resolvedConfig = config ?? await loadLwdpGenerationConfig();
  const jobPayload = await requestImplementation(
    `/api/v1/generation/jobs/${encodeURIComponent(jobId)}`,
    { config: resolvedConfig },
  );
  const job = jobPayload?.job ?? jobPayload;
  const itemsPayload = await itemsImplementation(jobId, { config: resolvedConfig });
  const items = itemsPayload?.items ?? itemsPayload?.data ?? [];
  if (!terminalStatuses.has(String(job?.status ?? ""))) {
    throw new LwdpJobPendingError(jobId, 0, job);
  }
  assertSuccessfulJob(job, itemsPayload);
  let resolvedVisualTargetIds = visualTargetIds;
  if (stage === "visual" && resolvedVisualTargetIds === undefined) {
    const manifestPath = path.resolve(
      repoRoot,
      "artifacts",
      "scenes",
      sceneId,
      "triviews",
      "whitebox-triview-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    resolvedVisualTargetIds = (manifest?.whiteboxTriviews ?? [])
      .map(({ visualTargetId }) => visualTargetId);
  }
  const expectedPrefix = stage === "planner"
    ? "planner-"
    : stage === "builder" ? "builder-" : "visual-";
  const matchingItems = Array.isArray(items)
    ? items.filter((item) => item?.status === "succeeded" &&
      String(item.item_id ?? item.id ?? "").startsWith(expectedPrefix))
    : [];
  if (matchingItems.length !== 1) {
    throw new Error(`LWDP job ${jobId} has ${matchingItems.length} successful ${stage} items; expected exactly one.`);
  }
  const taskId = matchingItems[0].item_id ?? matchingItems[0].id;
  assertSuccessfulJob(job, itemsPayload, [taskId]);
  const outputs = resolveLateCodexOutputUris({
    sceneId,
    stage,
    taskId,
    outputUris: matchingItems[0]?.metadata?.output_uris,
    visualTargetIds: resolvedVisualTargetIds,
  });
  const downloaded = [];
  for (const output of outputs) {
    const destination = path.resolve(repoRoot, output.relativePath);
    const relativeDestination = path.relative(path.resolve(repoRoot), destination);
    if (!relativeDestination || relativeDestination.startsWith("..") || path.isAbsolute(relativeDestination)) {
      throw new Error(`Unsafe LWDP recovery destination: ${output.relativePath}`);
    }
    downloaded.push(await downloadImplementation(output.s3Uri, destination));
  }
  return {
    jobId,
    taskId,
    sceneId,
    stage,
    status: "recovered",
    outputs: downloaded.map(({ localPath, s3Uri, size }) => ({ localPath, s3Uri, size })),
  };
}
