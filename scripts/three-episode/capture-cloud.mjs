import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import * as defaultCloud from './cloud.mjs';
import { threeEpisodeHostJob } from '../cloud/three-episode-host.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function readJson(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function save(file, value) { await mkdir(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.part`; await writeFile(temporary, JSON.stringify(value, null, 2)); await rename(temporary, file); }
async function kubectl(args, input) {
  const child = spawn('kubectl', args, { stdio: ['pipe', 'pipe', 'pipe'] }); const stdout = []; const stderr = [];
  child.stdout.on('data', data => stdout.push(data)); child.stderr.on('data', data => stderr.push(data)); child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  if (code !== 0) throw new Error(`EPISODE_CAPTURE_KUBE_REQUEST_FAILED: ${Buffer.concat(stderr).toString().slice(0, 3000)}`);
  const result = Buffer.concat(stdout).toString().trim(); return result ? JSON.parse(result) : null;
}
function condition(job, type) { return job.status?.conditions?.some(value => value.type === type && value.status === 'True'); }
function normalizeSummary(summary, outputRoot, worldBuildHash) {
  if (summary?.kind !== 'three-episode-capture-summary' || summary.worldBuildHash !== worldBuildHash) throw new Error('EPISODE_CAPTURE_REMOTE_IDENTITY_INVALID');
  return { ...summary, segments: summary.segments.map(segment => {
    const relative = path.posix.relative('/episode/output/capture', segment.outputRoot);
    if (!relative.startsWith('segments/') || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('EPISODE_CAPTURE_REMOTE_PATH_INVALID');
    return { ...segment, outputRoot: path.join(outputRoot, relative) };
  }) };
}

/** Only this bounded child requests a GPU. It never creates or polls provider model jobs. */
export function createCaptureDispatcher({ runtimeConfig, cloud = defaultCloud, kube = kubectl, sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)), onProgress } = {}) {
  const conf = runtimeConfig;
  if (!conf || !/^s3:\/\/[a-z0-9.-]+\/.+/.test(conf.captureS3Root ?? '')) throw new Error('EPISODE_CAPTURE_CLOUD_CONFIG_REQUIRED');
  return { async run({ sourceManifestPath, planPath, outputRoot, worldBuildHash, segmentIds }) {
    const sourceBytes = await readFile(sourceManifestPath); const planBytes = await readFile(planPath);
    const source = JSON.parse(sourceBytes); const plan = JSON.parse(planBytes);
    if (source.worldBuildHash !== worldBuildHash || plan.worldBuildHash !== worldBuildHash) throw new Error('EPISODE_CAPTURE_INPUT_IDENTITY_MISMATCH');
    if (segmentIds && (!segmentIds.length || segmentIds.some(value => !/^segment-0[0-5]$/.test(value)))) throw new Error('EPISODE_CAPTURE_SEGMENT_SELECTION_INVALID');
    const recipeHash = hash(JSON.stringify({ worldBuildHash, runtimeHash: source.runtimeHash, sourceHash: source.sourceHash, planHash: hash(planBytes), sourceArchiveS3Uri: conf.sourceArchiveS3Uri, image: conf.workerImage, segmentIds: segmentIds ?? null }));
    const jobId = `three-episode-capture-${recipeHash.slice(0, 24)}`; const namespace = conf.namespace ?? 'lwdp';
    const capturePrefix = `${conf.captureS3Root.replace(/\/$/, '')}/${recipeHash}`;
    const planUri = `${capturePrefix}/input/plan.json`;
    const stateRoot = path.join(outputRoot, '.capture-cloud', recipeHash); const stateFile = path.join(stateRoot, 'state.json');
    const previousSummary = await readJson(path.join(outputRoot, 'capture-summary.local.json'));
    const runtimeArgs = ['--import', './node_modules/tsx/dist/loader.mjs', 'scripts/three-episode/workflow.ts', '--capture-only', '--source-manifest', 'inputs/source/source.json', '--plan-s3', planUri, '--output-root', 'output/capture', '--publish-s3', capturePrefix, '--stop-before-seedance'];
    if (segmentIds) runtimeArgs.push('--segment-ids', segmentIds.join(','));
    const manifest = threeEpisodeHostJob({ jobId, namespace, image: conf.workerImage, sourceArchiveS3Uri: conf.sourceArchiveS3Uri, runArgs: runtimeArgs, gpuCount: 1, nodeSelector: conf.captureNodeSelector ?? {}, tolerations: conf.captureTolerations ?? [], cpu: conf.captureCpu ?? '4', memory: conf.captureMemory ?? '12Gi' });
    manifest.metadata.annotations = { 'worldkit.seedleap.dev/capture-recipe-hash': recipeHash, 'worldkit.seedleap.dev/world-build-hash': worldBuildHash };
    const state = await readJson(stateFile);
    if (!state) {
      await cloud.uploadArtifact(planPath, planUri); await save(path.join(stateRoot, 'job.json'), manifest);
      await save(stateFile, { status: 'submitting', jobId, namespace, recipeHash, capturePrefix });
      try { await kube(['create', '-f', '-', '-o', 'json'], manifest); }
      catch (error) {
        // A timeout may follow successful K8s persistence. Resolve that exact deterministic Job once.
        let recovered; try { recovered = await kube(['get', 'job', jobId, '-n', namespace, '-o', 'json']); } catch {}
        if (recovered?.metadata?.annotations?.['worldkit.seedleap.dev/capture-recipe-hash'] !== recipeHash) {
          await save(stateFile, { status: 'submission-unknown', jobId, namespace, recipeHash, capturePrefix });
          throw error;
        }
      }
    }
    const started = Date.now(); let job;
    for (;;) {
      job = await kube(['get', 'job', jobId, '-n', namespace, '-o', 'json']);
      if (job.metadata?.annotations?.['worldkit.seedleap.dev/capture-recipe-hash'] !== recipeHash) throw new Error('EPISODE_CAPTURE_JOB_IDENTITY_MISMATCH');
      const status = condition(job, 'Complete') ? 'completed' : condition(job, 'Failed') ? 'failed' : 'running';
      await save(stateFile, { status, jobId, namespace, recipeHash, capturePrefix, observedAt: new Date().toISOString(), uid: job.metadata.uid });
      onProgress?.({ jobId, status });
      if (status === 'completed' || status === 'failed') break;
      if (Date.now() - started > (conf.captureTimeoutMilliseconds ?? 7_200_000)) throw Object.assign(new Error('EPISODE_CAPTURE_REMOTE_PENDING'), { code: 'EPISODE_CAPTURE_REMOTE_PENDING', jobId });
      await sleep(7000);
    }
    // A technical capture failure can still publish failed-segment diagnostics. Always attempt its closed delivery.
    try { await cloud.hydrateDirectory(capturePrefix, outputRoot); }
    catch (error) { if (condition(job, 'Failed')) throw new Error(`EPISODE_CAPTURE_JOB_FAILED: ${job.status.conditions?.find(c => c.type === 'Failed')?.reason ?? 'worker-failed'}`, { cause: error }); throw error; }
    const remoteSummary = await readJson(path.join(outputRoot, 'capture-summary.json'));
    let summary = normalizeSummary(remoteSummary, outputRoot, worldBuildHash);
    if (previousSummary?.worldBuildHash === worldBuildHash && segmentIds) {
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
