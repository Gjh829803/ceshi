#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { kubectlApply } from "./launch-worldkit-cloud-episode-worker-job.mjs";
import { worldkitJobControllerRbac } from "./launch-worldkit-cloud-control-plane.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const IMAGE = /^[a-z0-9][a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/;

export function gpuBatchDispatcherCronJob({
  image,
  namespace = "lwdp",
  serviceAccountName = "lwdp-be",
  generationTokenSecretName = "lwdp-generation-token",
  apiBase = "https://lwdp.loopit.me",
  userId = "worldkit-studio",
  schedule = "* * * * *",
}) {
  if (!IMAGE.test(image ?? "")) throw new Error("Dispatcher image must be digest-pinned.");
  return {
    apiVersion: "batch/v1",
    kind: "CronJob",
    metadata: { name: "worldkit-gpu-batch-dispatcher", namespace },
    spec: {
      schedule,
      concurrencyPolicy: "Forbid",
      successfulJobsHistoryLimit: 1,
      failedJobsHistoryLimit: 3,
      jobTemplate: {
        spec: {
          backoffLimit: 1,
          activeDeadlineSeconds: 300,
          template: {
            metadata: { labels: { app: "worldkit-gpu-batch-dispatcher" } },
            spec: {
              serviceAccountName,
              restartPolicy: "Never",
              containers: [{
                name: "dispatcher",
                image,
                imagePullPolicy: "IfNotPresent",
                command: ["node", "scripts/cloud/dispatch-worldkit-gpu-capture-batch.mjs"],
                env: [
                  { name: "LWDP_API_BASE", value: apiBase },
                  { name: "LWDP_USER_ID", value: userId },
                  { name: "AWS_REGION", value: "us-east-2" },
                  { name: "AWS_DEFAULT_REGION", value: "us-east-2" },
                  { name: "WORLDKIT_CLOUD_WORKER_IMAGE", value: image },
                  { name: "WORLDKIT_CLOUD_CONTROL_PLANE", value: "1" },
                  {
                    name: "LWDP_GENERATION_API_TOKEN",
                    valueFrom: {
                      secretKeyRef: { name: generationTokenSecretName, key: "token" },
                    },
                  },
                ],
                resources: {
                  requests: { cpu: "250m", memory: "512Mi" },
                  limits: { cpu: "1", memory: "2Gi" },
                },
              }],
            },
          },
        },
      },
    },
  };
}

export async function launchGpuBatchDispatcherCronJob(options) {
  const manifest = gpuBatchDispatcherCronJob(options);
  const resources = [
    ...worldkitJobControllerRbac({
      namespace: manifest.metadata.namespace,
      serviceAccountName: options.serviceAccountName ?? "lwdp-be",
    }),
    manifest,
  ];
  const outputs = [];
  for (const resource of resources) outputs.push(await kubectlApply(resource, options));
  return {
    name: manifest.metadata.name,
    namespace: manifest.metadata.namespace,
    resources: resources.map((resource) => `${resource.kind}/${resource.metadata.name}`),
    outputs,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(await readFile(
    join(repoRoot, "config", "cloud-episode-production.json"),
    "utf8",
  ));
  launchGpuBatchDispatcherCronJob({
    image: config.workerImage,
    namespace: config.namespace,
  }).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
