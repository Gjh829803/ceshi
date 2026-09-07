import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import * as defaultCloud from './cloud.mjs';
import { createBatchQueue } from './batch-controller.mjs';
import { createBatchStore } from './batch-store.mjs';

import { PLAYER_CAPTURE_VERSION } from './playback-policy.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function readJson(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function save(file, value) { await mkdir(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.part`; await writeFile(temporary, JSON.stringify(value, null, 2)); await rename(temporary, file); }
function normalizeSummary(summary, outputRoot, worldBuildHash) {
  if (summary?.kind !== 'three-episode-capture-summary' || summary.worldBuildHash !== worldBuildHash || summary.playerCaptureVersion !== PLAYER_CAPTURE_VERSION) throw new Error('EPISODE_CAPTURE_REMOTE_IDENTITY_INVALID');
  return { ...summary, segments: summary.segments.map(segment => {
    const relative = path.posix.relative('/episode/output/capture', segment.outputRoot);
    if (!relative.startsWith('segments/') || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('EPISODE_CAPTURE_REMOTE_PATH_INVALID');
    return { ...segment, outputRoot: path.join(outputRoot, relative) };
  }) };
}

/** Only this bounded child requests a GPU. It never creates or polls provider model jobs. */
export function createCaptureDispatcher({ runtimeConfig, cloud = defaultCloud, kube, queue, onProgress } = {}) {
  const conf = runtimeConfig;
  if (!conf || !/^s3:\/\/[a-z0-9.-]+\/.+/.test(conf.captureS3Root ?? '')) throw new Error('EPISODE_CAPTURE_CLOUD_CONFIG_REQUIRED');
  const batchQueue = queue ?? createBatchQueue({store:createBatchStore({namespace:conf.namespace ?? 'lwdp', ...(kube?{request:kube}:{})})});
  return { async run({ sourceManifestPath, planPath, outputRoot, worldBuildHash, segmentIds, caseId, continuation, cohortId = conf.captureCohortId }) {
    if (!cohortId || !caseId) throw new Error('EPISODE_CAPTURE_COHORT_REQUIRED');
    if (!/^[a-f0-9]{64}$/.test(conf.sourceArchiveSha256 ?? '')) throw new Error('EPISODE_SOURCE_ARCHIVE_HASH_REQUIRED');
    const sourceBytes = await readFile(sourceManifestPath); const planBytes = await readFile(planPath);
    const source = JSON.parse(sourceBytes); const plan = JSON.parse(planBytes);
    if (source.worldBuildHash !== worldBuildHash || plan.worldBuildHash !== worldBuildHash) throw new Error('EPISODE_CAPTURE_INPUT_IDENTITY_MISMATCH');
    if (segmentIds && (!segmentIds.length || segmentIds.some(value => !/^segment-0[0-5]$/.test(value)))) throw new Error('EPISODE_CAPTURE_SEGMENT_SELECTION_INVALID');
    const recipeHash = hash(JSON.stringify({ cohortId, caseId, playerCaptureVersion: PLAYER_CAPTURE_VERSION, worldBuildHash, runtimeHash: source.runtimeHash, sourceHash: source.sourceHash, planHash: hash(planBytes), sourceArchiveS3Uri: conf.sourceArchiveS3Uri, image: conf.workerImage, sourceArchiveSha256: conf.sourceArchiveSha256, segmentIds: segmentIds ?? null }));
    const jobId = `three-episode-capture-${recipeHash.slice(0, 24)}`; const namespace = conf.namespace ?? 'lwdp';
    const capturePrefix = `${conf.captureS3Root.replace(/\/$/, '')}/${recipeHash}`;
    const planUri = `${capturePrefix}/input/plan.json`;
    const stateRoot = path.join(outputRoot, '.capture-cloud', recipeHash); const stateFile = path.join(stateRoot, 'state.json');
    const previousSummary = await readJson(path.join(outputRoot, 'capture-summary.local.json'));
    const taskId = `capture-${recipeHash.slice(0, 40)}`;
    const existing = await batchQueue.task(cohortId, taskId);
    if (!existing) {
      const relative = conf.sourceManifestRelativePath ?? 'inputs/source/source.json';
      if (path.isAbsolute(relative) || relative.split('/').includes('..')) throw new Error('EPISODE_SOURCE_PATH_INVALID');
      const input = { id: taskId, caseId, recipeHash, workerImage: conf.workerImage, sourceArchiveS3Uri: conf.sourceArchiveS3Uri, sourceArchiveSha256: conf.sourceArchiveSha256,
        sourceManifestRelativePath: relative, worldBuildHash, runtimeHash: source.runtimeHash, planHash: hash(planBytes), planS3Uri: planUri, outputS3Prefix: capturePrefix, ...(segmentIds?{segmentIds}:{}) };
      const inputFile = path.join(stateRoot, 'input.json'); await save(inputFile, input);
      const inputS3Uri = `${capturePrefix}/input/capture.json`;
      await cloud.uploadArtifact(planPath, planUri); await cloud.uploadArtifact(inputFile, inputS3Uri);
      const local = await readJson(stateFile);
      const task = { ...input, inputHash: hash(await readFile(inputFile)), inputS3Uri, createdAt: local?.createdAt ?? new Date().toISOString() };
      await save(stateFile, {status:'enqueueing',taskId,cohortId,recipeHash,capturePrefix,createdAt:task.createdAt});
      await batchQueue.enqueue(cohortId, task, continuation);
    }
    const task = await batchQueue.task(cohortId, taskId);
    if (!task?.receipt) {
      onProgress?.({taskId,cohortId,status:'queued'});
      throw Object.assign(new Error('EPISODE_CAPTURE_BATCH_PENDING'), {code:'EPISODE_CAPTURE_BATCH_PENDING', taskId, cohortId});
    }
    if (task.receipt.status === 'capture-cancelled') throw new Error('EPISODE_CAPTURE_CANCELLED');
    try { await cloud.hydrateDirectory(capturePrefix, outputRoot); }
    catch (error) { throw new Error(`EPISODE_CAPTURE_OUTPUT_UNAVAILABLE: ${task.receipt.error ?? error.message}`, {cause:error}); }
    const remoteSummary = await readJson(path.join(outputRoot, 'capture-summary.json'));
    let summary = normalizeSummary(remoteSummary, outputRoot, worldBuildHash);
    if (previousSummary?.worldBuildHash === worldBuildHash && previousSummary.playerCaptureVersion === PLAYER_CAPTURE_VERSION && segmentIds) {
      const fresh = new Map(summary.segments.map(segment => [segment.segmentId, segment]));
      const merged = previousSummary.segments.map(segment => fresh.get(segment.segmentId) ?? segment);
      for (const segment of summary.segments) if (!merged.some(previous => previous.segmentId === segment.segmentId)) merged.push(segment);
      merged.sort((a, b) => a.segmentId.localeCompare(b.segmentId));
      summary = { ...summary, status: merged.every(segment => segment.status === 'completed') ? 'completed' : merged.some(segment => segment.status === 'completed') ? 'partial' : 'failed', segments: merged };
    }
    await save(path.join(outputRoot, 'capture-summary.local.json'), summary);
    return summary;
  } };
}
