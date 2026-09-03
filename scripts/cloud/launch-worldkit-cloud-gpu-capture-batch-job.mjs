#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { kubectlApply } from "./launch-worldkit-cloud-episode-worker-job.mjs";

const IMAGE = /^[a-z0-9][a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/;

function required(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is required.`);
  return value;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value after ${argument}.`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

export function cloudGpuCaptureBatchJob({
  batchId,
  batchManifestS3Uri,
  queueS3Prefix,
  taskCount,
  minimumBatchSize = 100,
  dispatchReason = "capacity-threshold",
  drainEvidence = null,
  image,
  namespace = "lwdp",
  serviceAccountName = "lwdp-be",
  generationTokenSecretName = "lwdp-generation-token",
  episodeRuntimeSecretName = "worldkit-episode-runtime",
  captureSigningSecretName = "worldkit-cloud-capture-signing",
  apiBase = "https://lwdp.loopit.me",
  userId = "worldkit-studio",
  gpuResourceName = "nvidia.com/gpu",
  gpuCount = 1,
  nodeSelector = {},
  tolerations = [],
  taskLeaseSeconds = 3_600,
  ephemeralStorageRequest = "32Gi",
  ephemeralStorageLimit = "64Gi",
  caseConcurrency = 1,
}) {
  if (!/^gpu-capture-[a-f0-9]{24}$/.test(batchId ?? "")) {
    throw new Error("batchId is invalid.");
  }
  const tailAdmissionValid = dispatchReason === "producer-drained" &&
    Number.isSafeInteger(taskCount) && taskCount >= 1 &&
    Number.isSafeInteger(minimumBatchSize) && minimumBatchSize >= 100 &&
    taskCount < minimumBatchSize &&
    drainEvidence?.inFlightPrepareCount === 0 &&
    drainEvidence?.readyRecordCount === taskCount &&
    Number.isSafeInteger(drainEvidence?.tailIdleSeconds) &&
    drainEvidence.tailIdleSeconds >= 60 &&
    Number.isFinite(Date.parse(drainEvidence?.observedAt ?? "")) &&
    Number.isFinite(Date.parse(drainEvidence?.newestReadyAt ?? "")) &&
    Date.parse(drainEvidence.observedAt) - Date.parse(drainEvidence.newestReadyAt) >=
      drainEvidence.tailIdleSeconds * 1_000;
  const thresholdAdmissionValid = dispatchReason === "capacity-threshold" &&
    Number.isSafeInteger(taskCount) &&
    Number.isSafeInteger(minimumBatchSize) && minimumBatchSize >= 100 &&
    taskCount >= minimumBatchSize;
  const readyWaveAdmissionValid = dispatchReason === "ready-wave" &&
    Number.isSafeInteger(taskCount) && taskCount >= 1;
  if (!thresholdAdmissionValid && !tailAdmissionValid && !readyWaveAdmissionValid) {
    throw new Error(
      "GPU Batch Job requires the capacity threshold, ready wave, or valid closed-producer tail evidence.",
    );
  }
  required(batchManifestS3Uri, "batchManifestS3Uri");
  required(queueS3Prefix, "queueS3Prefix");
  if (!IMAGE.test(image ?? "")) throw new Error("image must be digest-pinned.");
  if (!Number.isSafeInteger(gpuCount) || gpuCount < 1) {
    throw new Error("gpuCount must be a positive integer.");
  }
  if (!Number.isSafeInteger(taskLeaseSeconds) || taskLeaseSeconds < 900 || taskLeaseSeconds > 3_600) {
    throw new Error("taskLeaseSeconds must be between 900 and 3600.");
  }
  if (!Number.isSafeInteger(caseConcurrency) || caseConcurrency < 1 || caseConcurrency > 10) {
    throw new Error("caseConcurrency must be between 1 and 10.");
  }
  const indexed = caseConcurrency > 1 && taskCount > 1;
  const name = `worldkit-${batchId}`.slice(0, 63).replace(/-$/, "");
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name,
      namespace,
      labels: {
        app: "worldkit-gpu-capture-batch",
        "worldkit.seedleap.dev/gpu-batch-id": batchId,
        "worldkit.seedleap.dev/task-count": String(taskCount),
        "worldkit.seedleap.dev/dispatch-reason": dispatchReason,
      },
    },
    spec: {
      backoffLimit: indexed ? taskCount * 2 : 2,
      ...(indexed ? {
        completionMode: "Indexed",
        completions: taskCount,
        parallelism: Math.min(caseConcurrency, taskCount),
      } : {}),
      activeDeadlineSeconds: 86_400,
      ttlSecondsAfterFinished: 86_400,
      template: {
        metadata: { labels: { app: "worldkit-gpu-capture-batch" } },
        spec: {
          serviceAccountName,
          ...(Object.keys(nodeSelector).length > 0 ? { nodeSelector } : {}),
          ...(tolerations.length > 0 ? { tolerations } : {}),
          restartPolicy: "Never",
          terminationGracePeriodSeconds: 120,
          containers: [{
            name: "gpu-capture-batch-worker",
            image,
            imagePullPolicy: "IfNotPresent",
            command: ["node", "scripts/cloud/run-worldkit-cloud-gpu-capture-batch-worker.mjs"],
            args: [
              "--batch-manifest-s3-uri", batchManifestS3Uri,
              "--queue-s3-prefix", queueS3Prefix,
              "--task-lease-seconds", String(taskLeaseSeconds),
            ],
            env: [
              { name: "LWDP_API_BASE", value: apiBase },
              { name: "LWDP_USER_ID", value: userId },
              { name: "AWS_REGION", value: "us-east-2" },
              { name: "AWS_DEFAULT_REGION", value: "us-east-2" },
              { name: "PLAYWRIGHT_BROWSERS_PATH", value: "/ms-playwright" },
              { name: "NODE_OPTIONS", value: "--max-old-space-size=12288" },
              { name: "WORLDKIT_CODEX_BACKEND", value: "cloud" },
              { name: "WORLDKIT_CAPTURE_GPU", value: "1" },
              { name: "WORLDKIT_CAPTURE_HEADLESS", value: "1" },
              { name: "WORLDKIT_DISABLE_PLAYGROUND_SPAWN", value: "1" },
              { name: "WORLDKIT_CLOUD_WORKER_IMAGE", value: image },
              ...(indexed ? [{
                name: "WORLDKIT_GPU_BATCH_TASK_INDEX",
                valueFrom: {
                  fieldRef: {
                    fieldPath:
                      "metadata.annotations['batch.kubernetes.io/job-completion-index']",
                  },
                },
              }] : []),
              {
                name: "LWDP_GENERATION_API_TOKEN",
                valueFrom: { secretKeyRef: { name: generationTokenSecretName, key: "token" } },
              },
              {
                name: "WORLDKIT_CAPTURE_TRUSTED_PUBLIC_KEY_PATH",
                value: "/var/run/worldkit-host-trust/public.pem",
              },
            ],
            volumeMounts: [
              { name: "episode-runtime", mountPath: "/var/run/worldkit-episode-runtime", readOnly: true },
              { name: "capture-signing-key", mountPath: "/var/run/worldkit-host-trust", readOnly: true },
            ],
            resources: {
              requests: {
                cpu: "4",
                memory: "8Gi",
                "ephemeral-storage": required(ephemeralStorageRequest, "ephemeralStorageRequest"),
                [gpuResourceName]: gpuCount,
              },
              limits: {
                cpu: "8",
                memory: "16Gi",
                "ephemeral-storage": required(ephemeralStorageLimit, "ephemeralStorageLimit"),
                [gpuResourceName]: gpuCount,
              },
            },
          }],
          volumes: [
            { name: "episode-runtime", secret: { secretName: episodeRuntimeSecretName } },
            {
              name: "capture-signing-key",
              secret: {
                secretName: captureSigningSecretName,
                items: [{ key: "public.pem", path: "public.pem", mode: 0o444 }],
              },
            },
          ],
        },
      },
    },
  };
}

export async function launchCloudGpuCaptureBatchJob(options) {
  const manifest = cloudGpuCaptureBatchJob(options);
  const output = await kubectlApply(manifest, options);
  return { jobName: manifest.metadata.name, namespace: manifest.metadata.namespace, output };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await launchCloudGpuCaptureBatchJob({
    batchId: options["batch-id"],
    batchManifestS3Uri: options["batch-manifest-s3-uri"],
    queueS3Prefix: options["queue-s3-prefix"],
    taskCount: Number(options["task-count"]),
    minimumBatchSize: Number(options["minimum-batch-size"] ?? 100),
    dispatchReason: options["dispatch-reason"] ?? "capacity-threshold",
    image: options.image,
    namespace: options.namespace ?? "lwdp",
    userId: options["user-id"] ?? "worldkit-studio",
    gpuResourceName: options["gpu-resource-name"] ?? "nvidia.com/gpu",
    gpuCount: Number(options["gpu-count"] ?? 1),
    taskLeaseSeconds: Number(options["task-lease-seconds"] ?? 3_600),
    caseConcurrency: Number(options["case-concurrency"] ?? 1),
    ephemeralStorageRequest: options["ephemeral-storage-request"] ?? "32Gi",
    ephemeralStorageLimit: options["ephemeral-storage-limit"] ?? "64Gi",
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
