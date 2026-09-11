#!/usr/bin/env node
import {episodeNodeArguments} from './frozen-entrypoints.mjs';
import { spawn } from 'node:child_process';
import { copyFile, chmod, mkdir, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { episodeScheduling } from './cloud-scheduling.mjs';

/** Same Kubernetes Secret authority as the production Episode Worker, least required files. */
export async function materializeThreeEpisodeConfig({ repoRoot, secretRoot = '/var/run/worldkit-episode-runtime', environment = process.env, captureOnly = false }) {
  if (!captureOnly && !environment.LWDP_GENERATION_API_TOKEN) throw new Error('EPISODE_HOST_TOKEN_SECRET_MISSING');
  const runtimeRoot = path.join(repoRoot, '.codex-tmp/runtime-config');
  await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
  if (!captureOnly) await writeFile(path.join(runtimeRoot, 'lwdp.env'), `LWDP_API_BASE=${environment.LWDP_API_BASE ?? 'https://lwdp.loopit.me'}\nLWDP_USER_ID=${environment.LWDP_USER_ID ?? 'worldkit-studio'}\nLWDP_GENERATION_API_TOKEN=${environment.LWDP_GENERATION_API_TOKEN}\n`, { mode: 0o600 });
  for (const name of (captureOnly ? ['aws-config', 'aws-credentials'] : ['aws-config', 'aws-credentials', 'gemini.env', 'google-service-account.json'])) {
    const source = path.join(secretRoot, name);
    const metadata = await lstat(source);
    // Kubernetes Secret projection uses controlled symlinks; copying materializes a private regular file.
    if (!metadata.isFile() && !metadata.isSymbolicLink()) throw new Error('EPISODE_HOST_SECRET_FILE_INVALID');
    await copyFile(source, path.join(runtimeRoot, name)); await chmod(path.join(runtimeRoot, name), 0o600);
  }
  return runtimeRoot;
}

export function threeEpisodeHostJob({ jobId, image, sourceArchiveS3Uri, sourceArchiveSha256, runArgs, namespace = 'lwdp', cpu = '2', memory = '4Gi', gpuCount = 0, nodeSelector = {}, tolerations = [] }) {
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(jobId ?? '') || !/@sha256:[a-f0-9]{64}$/.test(image ?? '') || !/^s3:\/\/[a-z0-9.-]+\/.+\.tar\.gz$/.test(sourceArchiveS3Uri ?? '')) throw new Error('EPISODE_HOST_JOB_IDENTITY_INVALID');
  if (!/^[a-f0-9]{64}$/.test(sourceArchiveSha256 ?? '')) throw new Error('EPISODE_SOURCE_ARCHIVE_HASH_REQUIRED');
  if (!Array.isArray(runArgs) || runArgs.some(v => typeof v !== 'string') || !runArgs.includes('--stop-before-seedance')) throw new Error('EPISODE_HOST_REQUIRES_PRE_SEEDANCE_STOP');
  if (!Number.isInteger(gpuCount) || gpuCount < 0 || gpuCount > 1) throw new Error('EPISODE_HOST_GPU_COUNT_INVALID');
  if (gpuCount) throw new Error('EPISODE_GPU_REQUIRES_BATCH');
  const scheduling = episodeScheduling({gpuCount,nodeSelector,tolerations});
  const secretMount = { name: 'episode-runtime', mountPath: '/var/run/worldkit-episode-runtime', readOnly: true };
  const workspaceMount = { name: 'workspace', mountPath: '/episode' };
  return { apiVersion: 'batch/v1', kind: 'Job', metadata: { name: jobId, namespace, labels: { 'app.kubernetes.io/name': 'worldkit-three-episode' } }, spec: { backoffLimit: 0, activeDeadlineSeconds: 21600, ttlSecondsAfterFinished: 3600, template: { spec: { serviceAccountName: 'worldkit-three-host', restartPolicy: 'Never', ...scheduling, initContainers: [{ name: 'hydrate-source', image, command: ['sh', '-c', 'unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN AWS_WEB_IDENTITY_TOKEN_FILE AWS_ROLE_ARN AWS_DEFAULT_PROFILE; aws s3 cp --only-show-errors "$1" /episode/source.tar.gz && printf "%s  /episode/source.tar.gz\\n" "$2" | sha256sum -c - && tar -xzf /episode/source.tar.gz -C /episode && rm /episode/source.tar.gz && (test -f /episode/packages/episode-pipeline/src/cli/batch-cli.mjs || test -f /episode/packages/episode-pipeline/batch-cli.mjs || test -f /episode/scripts/three-episode/batch-cli.mjs)', 'hydrate', sourceArchiveS3Uri, sourceArchiveSha256], env: [{ name: 'AWS_SHARED_CREDENTIALS_FILE', value: '/var/run/worldkit-episode-runtime/aws-credentials' }, { name: 'AWS_CONFIG_FILE', value: '/var/run/worldkit-episode-runtime/aws-config' }, { name: 'AWS_PROFILE', value: 'default' }], volumeMounts: [secretMount, workspaceMount] }], containers: [{ name: 'episode-host', image, workingDir: '/episode', command: ['node', ...episodeNodeArguments('host')], args: ['--run', ...runArgs], env: [{ name: 'WORLDKIT_SOURCE_ARCHIVE_SHA256', value: sourceArchiveSha256 }, { name: 'WORLDKIT_EPISODE_HOST_JOB', value: jobId }, { name: 'LWDP_API_BASE', value: 'https://lwdp.loopit.me' }, { name: 'LWDP_USER_ID', value: 'worldkit-studio' }, { name: 'LWDP_GENERATION_API_TOKEN', valueFrom: { secretKeyRef: { name: 'lwdp-generation-token', key: 'token' } } }, { name: 'WORLDKIT_CAPTURE_GPU', value: String(gpuCount) }, { name: 'PLAYWRIGHT_BROWSERS_PATH', value: '/ms-playwright' }, ...(gpuCount ? [{ name: 'NVIDIA_DRIVER_CAPABILITIES', value: 'compute,utility,graphics' }] : [])], volumeMounts: [secretMount, workspaceMount], resources: { requests: { cpu, memory, ...(gpuCount ? { 'nvidia.com/gpu': gpuCount } : {}) }, limits: { cpu: '4', memory: '12Gi', ...(gpuCount ? { 'nvidia.com/gpu': gpuCount } : {}) } } }], volumes: [{ name: 'workspace', emptyDir: {} }, { name: 'episode-runtime', secret: { secretName: 'worldkit-episode-runtime' } }] } } } };
}

/** Seed one immutable source capsule into S3 without moving provider credentials or copying the capsule through the developer machine. */
export function threeEpisodeSourceUploadJob({ jobId, image, archivePath, archiveSha256, outputS3Uri, namespace = 'lwdp' }) {
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(jobId ?? '') || !/@sha256:[a-f0-9]{64}$/.test(image ?? '') || !/^[a-f0-9]{64}$/.test(archiveSha256 ?? '') || !/^\/fsx\/pipeline\/worldkit-three-episode-experiments\/[a-zA-Z0-9/_.-]+\.tar\.gz$/.test(archivePath ?? '') || archivePath.split('/').includes('..') || !/^s3:\/\/[a-z0-9.-]+\/.+\.tar\.gz$/.test(outputS3Uri ?? '')) throw new Error('EPISODE_SOURCE_UPLOAD_IDENTITY_INVALID');
  const script = 'set -eu; printf "%s  %s\\n" "$3" "$1" | sha256sum -c -; mkdir -p /episode/.codex-tmp/runtime-config; cp /var/run/worldkit-episode-runtime/aws-config /episode/.codex-tmp/runtime-config/aws-config; cp /var/run/worldkit-episode-runtime/aws-credentials /episode/.codex-tmp/runtime-config/aws-credentials; chmod 600 /episode/.codex-tmp/runtime-config/aws-config /episode/.codex-tmp/runtime-config/aws-credentials; AWS_SHARED_CREDENTIALS_FILE=/episode/.codex-tmp/runtime-config/aws-credentials AWS_CONFIG_FILE=/episode/.codex-tmp/runtime-config/aws-config AWS_PROFILE=default aws s3 cp --only-show-errors "$1" "$2"';
  return { apiVersion: 'batch/v1', kind: 'Job', metadata: { name: jobId, namespace }, spec: { backoffLimit: 0, activeDeadlineSeconds: 900, ttlSecondsAfterFinished: 86400, template: { spec: { serviceAccountName: 'worldkit-three-host', restartPolicy: 'Never', ...episodeScheduling(), containers: [{ name: 'source-upload', image, command: ['sh', '-c', script, 'source-upload', archivePath, outputS3Uri, archiveSha256], resources: { requests: { cpu: '1', memory: '1Gi' }, limits: { cpu: '2', memory: '2Gi' } }, volumeMounts: [{ name: 'fsx', mountPath: '/fsx', readOnly: true }, { name: 'workspace', mountPath: '/episode' }, { name: 'episode-runtime', mountPath: '/var/run/worldkit-episode-runtime', readOnly: true }] }], volumes: [{ name: 'fsx', persistentVolumeClaim: { claimName: 'fsx-public-output-p125-pvc', readOnly: true } }, { name: 'workspace', emptyDir: {} }, { name: 'episode-runtime', secret: { secretName: 'worldkit-episode-runtime', items: [{ key: 'aws-config', path: 'aws-config' }, { key: 'aws-credentials', path: 'aws-credentials' }] } }] } } } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--run') throw new Error('Usage: three-episode-host.mjs --run <node arguments> --stop-before-seedance');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  await materializeThreeEpisodeConfig({ repoRoot: root, captureOnly: process.argv.includes('--capture-only') });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(LWDP_GENERATION_API_TOKEN|AWS_|OPENAI_|GOOGLE_|GCLOUD_|GEMINI_)/.test(key)));
  const child = spawn(process.execPath, process.argv.slice(3), { cwd: root, env, stdio: 'inherit' });
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve(code ?? 1)); });
}
