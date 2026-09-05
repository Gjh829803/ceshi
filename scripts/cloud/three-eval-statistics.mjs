import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {THREE_TOOL_VERSION} from './three-eval-runtime.mjs';

export const hashPattern = /^[a-f0-9]{64}$/;
const finiteAtLeast = (value, minimum) => typeof value === 'number' && Number.isFinite(value) && value >= minimum;
export function failureClass(message) {
  const text = String(message);
  return [
    ['account-usage', /hit your usage limit|account has reached its usage limit/i],
    ['model-cli-version', /requires a newer version/i], ['model-capacity', /at capacity|No available agent/i],
    ['mcp-startup', /MCP.*(?:start|initial|fail)|CREATOR_MCP/i], ['runtime-browser', /browser|chromium|shared libraries/i],
    ['event-evidence', /EVENT_|RECEIPT_|TRANSPORT_|IDENTITY_/], ['world-validation', /THREE_(?:SOURCE|IMPORT|ENTRY|PROJECT|SUBMIT|DELIVERY|BUILD)/],
    ['playtest', /PLAYTEST|EPISODE|stuck/i], ['timeout', /timeout|timed out/i],
    ['transport', /ECONN|502|503|504|fetch failed|network/i], ['output-omission', /ENOENT|missing required outputs/i],
  ].find(([, pattern]) => pattern.test(text))?.[0] ?? 'unclassified';
}
export function isPassingDelivery(result, expectedProfile = result?.profile) {
  if (!['three-raw', 'three-sdk'].includes(expectedProfile) || result?.profile !== expectedProfile || result?.engine !== 'three@0.185.1' ||
    result?.kind !== 'three-creator-delivery' || ![1,2].includes(result.schemaVersion) || result.status !== (result.schemaVersion === 1 ? 'ready-for-independent-review' : 'ready') ||
    result.technicalStatus !== 'passed' || (result.schemaVersion === 1 ? result.semanticStatus !== 'unreviewed' : 'semanticStatus' in result) || result.toolVersion !== (result.schemaVersion === 1 ? '0.2.0-experimental' : THREE_TOOL_VERSION) ||
    result.sdkVersion !== (expectedProfile === 'three-sdk' ? result.toolVersion : null) ||
    result.browserObservationContract !== (expectedProfile === 'three-sdk' ? 'WorldObservation-v2' : 'WorldObservation-v1') ||
    !Number.isSafeInteger(result.archiveByteLength) || result.archiveByteLength < 1 ||
    !['sourceHash', 'worldBuildHash', 'runtimeHash', 'creatorRuntimeLockHash', 'archiveSha256', 'deliveryManifestSha256'].every(key => hashPattern.test(result[key] ?? ''))) return false;
  const worldHash = createHash('sha256').update(JSON.stringify({sourceHash: result.sourceHash, runtimeHash: result.runtimeHash, profile: result.profile})).digest('hex');
  if (result.worldBuildHash !== worldHash) return false;
  if (result.schemaVersion === 2) return result.validationMode === 'interactive-preview' && hashPattern.test(result.previewEvidenceSha256 ?? '') && ['episodeHash','actualWallSeconds','activePlaySeconds','inputWallSeconds','videoMetadata','captureTiming'].every(key => !(key in result));
  if (!hashPattern.test(result.episodeHash ?? '') || !finiteAtLeast(result.actualWallSeconds,180) || !finiteAtLeast(result.inputWallSeconds,180) || !finiteAtLeast(result.activePlaySeconds,180)) return false;
  const video = result.videoMetadata, capture = result.captureTiming;
  if (!finiteAtLeast(video?.durationSeconds, 180) || !['frameCount','widthPixels','heightPixels'].every(key=>Number.isSafeInteger(video?.[key])&&video[key]>0) ||
    capture?.clock !== 'browser-performance' || !['initialFrameRequestedAtMilliseconds','finalFrameRequestedAtMilliseconds','recorderStoppedAtMilliseconds','framePeriodSeconds','postrollSeconds'].every(key=>finiteAtLeast(capture?.[key],0)) ||
    capture.framePeriodSeconds <= 0 || capture.framePeriodSeconds > 1 || !Number.isSafeInteger(capture.requestedFrames) || capture.requestedFrames < 2 ||
    capture.finalFrameRequestedAtMilliseconds < capture.initialFrameRequestedAtMilliseconds || capture.recorderStoppedAtMilliseconds < capture.finalFrameRequestedAtMilliseconds ||
    video.durationSeconds < result.inputWallSeconds - Math.max(1, 2*capture.framePeriodSeconds)) return false;
  return true;
}

// Only actual completed transport events count. Shell output and assistant prose
// cannot establish a preview or submit receipt, even if they resemble tool JSON.
export async function eventStatistics(file) {
  const statistics = {jsonLines: 0, invalidLines: 0, mcpCallsByTool: {}, submitOperationIds: [], successfulSubmitReceipts: [], previewImageObservations: 0, previewWorldBuildHashes: [], previewSourceHashes: [], openingObservations: []};
  const submissions = new Set();
  try {
    for await (const line of createInterface({input: createReadStream(file), crlfDelay: Infinity})) {
      if (!line.trim()) continue;
      let event; try { event = JSON.parse(line); statistics.jsonLines++; } catch { statistics.invalidLines++; continue; }
      const item = event.item;
      if (event.type !== 'item.completed' || item?.type !== 'mcp_tool_call' || item.server !== 'worldkit_three_creator' || typeof item.tool !== 'string') continue;
      statistics.mcpCallsByTool[item.tool] = (statistics.mcpCallsByTool[item.tool] ?? 0) + 1;
      if (item.error || item.result?.isError || !Array.isArray(item.result?.content)) continue;
      const content = item.result.content;
      for (const block of content) {
        if (block.type !== 'text') continue;
        let operation; try { operation = JSON.parse(block.text); } catch { continue; }
        if (item.tool === 'world_submit' && typeof operation.operationId === 'string' && ['queued', 'running'].includes(operation.status)) submissions.add(operation.operationId);
        if (item.tool !== 'operations_get' || operation.status !== 'succeeded') continue;
        if (operation.type === 'world.preview' && operation.result?.view === 'opening' && ['three-raw','three-sdk'].includes(operation.result?.profile) && hashPattern.test(operation.result?.worldBuildHash ?? '') && hashPattern.test(operation.result?.sourceHash ?? '')) {
          const image = operation.result.image;
          const matchingImage = image && hashPattern.test(image.sha256 ?? '') && content.some(value => {
            if (value.type !== 'image' || value.mimeType !== 'image/png' || typeof value.data !== 'string' || !value.data.length) return false;
            const bytes = Buffer.from(value.data, 'base64');
            return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && createHash('sha256').update(bytes).digest('hex') === image.sha256;
          });
          if (matchingImage) { statistics.previewImageObservations++; statistics.previewWorldBuildHashes.push(operation.result.worldBuildHash); statistics.previewSourceHashes.push(operation.result.sourceHash); statistics.openingObservations.push({profile:operation.result.profile,worldBuildHash:operation.result.worldBuildHash,sourceHash:operation.result.sourceHash}); }
        }
        if (operation.type === 'world.submit' && submissions.has(operation.id) && isPassingDelivery(operation.result)) {
          statistics.successfulSubmitReceipts.push({operationId: operation.id, delivery: operation.result});
        }
      }
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; statistics.unavailable = true; }
  statistics.submitOperationIds = [...submissions];
  return statistics;
}

export function validateDeliveryEvidence({result, launcherReport, events, eventsSha256, artifacts, expectedRuntimeHash, expectedFixedRuntimeHash, expectedCaseId, expectedTaskId, expectedProfile, expectedWorkspace}) {
  if (!isPassingDelivery(result, expectedProfile)) throw new Error('THREE_DELIVERY_CONTRACT_FAILED');
  if (launcherReport.kind !== 'three-creator-launcher-report' || launcherReport.runtimeHash !== expectedRuntimeHash ||
    result.creatorRuntimeLockHash !== expectedRuntimeHash || result.runtimeHash !== expectedFixedRuntimeHash || launcherReport.caseId !== expectedCaseId || launcherReport.taskId !== expectedTaskId ||
    launcherReport.profile !== expectedProfile || launcherReport.engine !== 'three@0.185.1' || launcherReport.workspace !== expectedWorkspace ||
    launcherReport.model !== 'gpt-6-astra' || launcherReport.reasoningEffort !== 'xhigh') throw new Error('THREE_EVENT_IDENTITY_FAILED');
  if (!hashPattern.test(eventsSha256 ?? '') || eventsSha256 !== launcherReport.eventsTransportSha256 || eventsSha256 !== launcherReport.eventsSha256) throw new Error('THREE_EVENT_STREAM_HASH_MISMATCH');
  for (const name of ['creator-result.json', 'creator-delivery.tar.gz']) {
    if (!hashPattern.test(artifacts?.[name]?.sha256 ?? '') || artifacts[name].sha256 !== launcherReport.artifacts?.[name]?.sha256 ||
      !Number.isSafeInteger(artifacts[name].bytes) || artifacts[name].bytes < 1 || artifacts[name].bytes !== launcherReport.artifacts[name].bytes) throw new Error(`THREE_DELIVERY_FILE_HASH_MISMATCH: ${name}`);
  }
  if (events.invalidLines || !events.jsonLines || !events.openingObservations?.some(value=>value.profile===expectedProfile&&value.worldBuildHash===result.worldBuildHash&&value.sourceHash===result.sourceHash)) throw new Error('THREE_EVENT_PREVIEW_UNVERIFIED');
  const receipt = events.successfulSubmitReceipts.find(value => isDeepStrictEqual(value.delivery, result));
  if (!receipt || result.archivePath !== `${expectedWorkspace}/creator-delivery.tar.gz` ||
    result.archiveSha256 !== artifacts['creator-delivery.tar.gz'].sha256 || result.archiveByteLength !== artifacts['creator-delivery.tar.gz'].bytes) throw new Error('THREE_RECEIPT_ARCHIVE_UNVERIFIED');
  return receipt;
}
