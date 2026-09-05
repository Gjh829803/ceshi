import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { isDeepStrictEqual } from "node:util";

export function failureClass(message) {
  const text = String(message);
  const categories = [
    ["model-cli-version", /requires a newer version of Codex/i],
    ["model-account-access", /not supported.*ChatGPT|401|auth_failed|token_expired/i],
    ["model-capacity", /at capacity|No available agent/i],
    ["mcp-startup", /MCP.*(?:start|initial|fail)|CREATOR_MCP/i],
    ["runtime-browser", /browserType|chromium|browser.*(?:launch|closed)|shared libraries/i],
    ["playtest", /PLAYTEST|EXPLORATION|stuck|blocked.*target/i],
    ["event-evidence", /EVENT_EVIDENCE|EVENT_STREAM|EVENT_IDENTITY/i],
    ["world-validation", /CREATOR_(?:SOURCE|CONFIG|IMPORT|DELIVERY_CONTRACT)|validation/i],
    ["output-omission", /missing required outputs|ENOENT|DELIVERY_FILE/i],
    ["timeout", /timeout|timed out/i],
    ["transport", /ECONN|502|503|504|fetch failed|network/i],
  ];
  return categories.find(([, pattern]) => pattern.test(text))?.[0] ?? "unclassified";
}

export const finiteAtLeast = (value, minimum) => typeof value === "number" && Number.isFinite(value) && value >= minimum;
export function isPassingDelivery(result) {
  const playtest = result?.playtest;
  return result?.kind === "experimental-native-creator-delivery" && result.status === "submitted" &&
    /^sha256:[0-9a-f]{64}$/.test(result.sourceHash ?? "") && playtest?.status === "passed" &&
    finiteAtLeast(playtest.actualSimulationSeconds, 180) && finiteAtLeast(playtest.targetCount, 3) &&
    finiteAtLeast(playtest.uniqueFiveMeterCells, 15) && finiteAtLeast(playtest.maximumDistanceFromSpawnMeters, 30);
}

// Parse only transport-level completed MCP events. Never infer successful tools
// from an assistant message, a shell stdout string, or an authored JSON file.
export async function eventStatistics(file) {
  const result = {jsonLines: 0, invalidLines: 0, mcpCallsByTool: {}, submitOperationIds: [], successfulSubmitReceipts: [], previewImageObservations: 0, previewSourceHashes: []};
  const submissions = new Set();
  const observedReceipts = [];
  try {
    for await (const line of createInterface({input: createReadStream(file), crlfDelay: Infinity})) {
      if (!line.trim()) continue;
      let event; try { event = JSON.parse(line); result.jsonLines++; } catch { result.invalidLines++; continue; }
      const item = event.item;
      if (event.type !== "item.completed" || item?.type !== "mcp_tool_call" || item.server !== "worldkit_creator") continue;
      const tool = item.tool;
      if (typeof tool !== "string") continue;
      result.mcpCallsByTool[tool] = (result.mcpCallsByTool[tool] ?? 0) + 1;
      if (item.error || item.result?.isError) continue;
      const content = item.result?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.type !== "text") continue;
        let operation; try { operation = JSON.parse(block.text); } catch { continue; }
        if (tool === "world_submit" && operation.type === "world.submit" && typeof operation.id === "string") submissions.add(operation.id);
        if (tool === "operations_get" && operation.type === "world.preview" && operation.status === "succeeded" && content.some(entry => entry.type === "image" && typeof entry.data === "string" && entry.data.length > 0)) {
          result.previewImageObservations++;
          if (typeof operation.result?.sourceHash === "string") result.previewSourceHashes.push(operation.result.sourceHash);
        }
        if (tool === "operations_get" && operation.type === "world.submit" && operation.status === "succeeded" && isPassingDelivery(operation.result) && /^sha256:[0-9a-f]{64}$/.test(operation.result.archiveSha256 ?? "")) {
          observedReceipts.push({operationId: operation.id, sourceHash: operation.result.sourceHash, archiveSha256: operation.result.archiveSha256, archivePath: operation.result.archivePath, sceneId: operation.result.sceneId, delivery: operation.result});
        }
      }
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; result.unavailable = true; }
  result.submitOperationIds = [...submissions];
  result.successfulSubmitReceipts = observedReceipts.filter(receipt => submissions.has(receipt.operationId));
  return result;
}

export function validateDeliveryEvidence({result, launcherReport, events, eventsSha256, artifacts, expectedRuntimeHash, expectedSceneId, expectedWorkspace}) {
  if (!isPassingDelivery(result) || result.sceneId !== expectedSceneId) throw new Error("CREATOR_DELIVERY_CONTRACT_FAILED");
  if (launcherReport.runtimeHash !== expectedRuntimeHash || launcherReport.workspace !== expectedWorkspace) throw new Error("CREATOR_DELIVERY_EVENT_IDENTITY_FAILED");
  if (!/^[a-f0-9]{64}$/.test(eventsSha256 ?? "") || eventsSha256 !== launcherReport.eventsTransportSha256 || eventsSha256 !== launcherReport.eventsSha256) throw new Error("CREATOR_EVENT_STREAM_HASH_MISMATCH");
  for (const name of ["creator-result.json", "creator-delivery.tar.gz"]) {
    if (!/^[a-f0-9]{64}$/.test(artifacts?.[name]?.sha256 ?? "") || artifacts[name].sha256 !== launcherReport.artifacts?.[name]?.sha256) throw new Error(`CREATOR_DELIVERY_FILE_HASH_MISMATCH: ${name}`);
  }
  if (events.invalidLines || !events.jsonLines || !events.previewSourceHashes?.includes(result.sourceHash)) throw new Error("CREATOR_DELIVERY_EVENT_EVIDENCE_UNVERIFIED");
  const receipt = events.successfulSubmitReceipts.find(value => value.sourceHash === result.sourceHash && value.sceneId === result.sceneId && value.archivePath === `${expectedWorkspace}/creator-delivery.tar.gz` && value.archiveSha256 === `sha256:${artifacts["creator-delivery.tar.gz"].sha256}`);
  if (!receipt) throw new Error("CREATOR_DELIVERY_EVENT_EVIDENCE_UNVERIFIED");
  if (!isDeepStrictEqual(result, receipt.delivery)) throw new Error("CREATOR_DELIVERY_EVENT_IDENTITY_FAILED");
  return receipt;
}
