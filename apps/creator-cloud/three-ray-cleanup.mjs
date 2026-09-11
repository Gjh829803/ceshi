import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {selectThreeLiveHead} from './three-eval-live.mjs';

const exec = promisify(execFile);
const terminal = new Set(['STOPPED', 'SUCCEEDED', 'FAILED']);

export function rayStopEvidence(job, ray, observedAt = new Date().toISOString()) {
  if (!['cancelled', 'stopped'].includes(job?.status) || job?.pipeline !== 'codex' || !/^gen_[a-f0-9]+$/.test(job?.job_id ?? '')) return null;
  // A single known Ray submission closes this proof. Provider retries require
  // the provider's complete cleanup confirmation covering every submission.
  if (![0, 1].includes(job.attempt) || job.ray_submission_id !== `lwdp_${job.job_id}`) return null;
  if (ray?.submission_id !== job.ray_submission_id || !terminal.has(ray?.status) || !Number.isFinite(ray.end_time) || ray.end_time <= 0 || !Number.isFinite(Date.parse(observedAt)) || ray.end_time > Date.parse(observedAt) + 60000) return null;
  return {source: 'ray-job-api', jobId: job.job_id, submissionId: ray.submission_id, status: ray.status, endedAt: new Date(ray.end_time).toISOString(), observedAt};
}

export async function confirmRayStop(job) {
  if (!['cancelled', 'stopped'].includes(job?.status) || ![0, 1].includes(job?.attempt) || !/^gen_[a-f0-9]+$/.test(job?.job_id ?? '') || job?.ray_submission_id !== `lwdp_${job.job_id}`) return null;
  const inventory = await exec('kubectl', ['-n', 'ray', 'get', 'pods', '-l', 'ray.io/cluster=ray-cluster,ray.io/node-type=head', '-o', 'json'], {encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 * 1024});
  const pod = selectThreeLiveHead(JSON.parse(inventory.stdout));
  const script = "import json,sys,urllib.request; d=json.load(urllib.request.urlopen('http://127.0.0.1:8265/api/jobs/'+sys.argv[1],timeout=10)); print(json.dumps({k:d.get(k) for k in ['submission_id','status','end_time']}))";
  const result = await exec('kubectl', ['-n', 'ray', 'exec', pod, '-c', 'ray-head', '--', 'python3', '-c', script, job.ray_submission_id], {encoding: 'utf8', timeout: 15000, maxBuffer: 16384});
  return rayStopEvidence(job, JSON.parse(result.stdout));
}
