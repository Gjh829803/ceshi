#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function required(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is required.`);
  return value;
}

function jobName(executionId, jobSuffix = "") {
  const prefix = "worldkit-episode-";
  const execution = executionId.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = String(jobSuffix).toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffixPart = suffix ? `-${suffix}` : "";
  const executionBudget = 63 - prefix.length - suffixPart.length;
  if (executionBudget < 1) throw new Error("job_suffix is too long for a Kubernetes Job name.");
  return `${prefix}${execution.slice(0, executionBudget).replace(/-$/, "")}${suffixPart}`;
}

export function cloudEpisodeWorkerJob({
  executionId,
  stageId = "episode-production",
  executionPart = "full",
  requestS3Uri,
  outputS3Prefix,
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
  gpuRequired = true,
  cpuRequest = gpuRequired ? "4" : "2",
  cpuLimit = "8",
  memoryRequest = gpuRequired ? "8Gi" : "4Gi",
  memoryLimit = "16Gi",
  ephemeralStorageRequest = gpuRequired ? "32Gi" : "16Gi",
  ephemeralStorageLimit = gpuRequired ? "64Gi" : "32Gi",
  nodeSelector = {},
  tolerations = [],
  jobSuffix = "",
}) {
  required(executionId, "execution_id");
  required(stageId, "stage_id");
  if (![
    "full", "prepare", "capture", "render",
    "style-plan", "style-openings", "style-visuals", "style-diversity",
    "style-events", "style-prompts", "seedance", "conformance", "publication",
  ].includes(executionPart)) {
    throw new Error("execution_part is invalid.");
  }
  required(requestS3Uri, "request_s3_uri");
  required(outputS3Prefix, "output_s3_prefix");
  required(image, "image");
  if (!/@sha256:[a-f0-9]{64}$/.test(image)) {
    throw new Error("image must be pinned by an immutable sha256 digest.");
  }
  if (gpuRequired && (!Number.isSafeInteger(gpuCount) || gpuCount < 1)) {
    throw new Error("gpu_count must be a positive integer when GPU is required.");
  }
  if (!nodeSelector || typeof nodeSelector !== "object" || Array.isArray(nodeSelector)) {
    throw new Error("node_selector must be an object.");
  }
  if (!Array.isArray(tolerations)) throw new Error("tolerations must be an array.");
  const name = jobName(
    executionId,
    stageId === "episode-production" ? jobSuffix : `${stageId}-${jobSuffix}`,
  );
  const resourceRequests = {
    cpu: required(cpuRequest, "cpu_request"),
    memory: required(memoryRequest, "memory_request"),
    "ephemeral-storage": required(ephemeralStorageRequest, "ephemeral_storage_request"),
    ...(gpuRequired ? { [gpuResourceName]: gpuCount } : {}),
  };
  const resourceLimits = {
    cpu: required(cpuLimit, "cpu_limit"),
    memory: required(memoryLimit, "memory_limit"),
    "ephemeral-storage": required(ephemeralStorageLimit, "ephemeral_storage_limit"),
    ...(gpuRequired ? { [gpuResourceName]: gpuCount } : {}),
  };
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name,
      namespace,
      labels: {
        app: "worldkit-cloud-episode-worker",
        "worldkit.seedleap.dev/execution-id": executionId,
        "worldkit.seedleap.dev/stage-id": stageId,
      },
    },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: 43_200,
      ttlSecondsAfterFinished: 86_400,
      template: {
        metadata: { labels: { app: "worldkit-cloud-episode-worker" } },
        spec: {
          serviceAccountName,
          ...(Object.keys(nodeSelector).length > 0 ? { nodeSelector } : {}),
          ...(tolerations.length > 0 ? { tolerations } : {}),
          restartPolicy: "Never",
          terminationGracePeriodSeconds: 90,
          containers: [{
            name: "episode-worker",
            image,
            imagePullPolicy: "IfNotPresent",
            command: ["node", "scripts/cloud/run-worldkit-cloud-episode-worker.mjs"],
            args: [
              "--execution-id", executionId,
              "--stage-id", stageId,
              "--execution-part", executionPart,
              "--request-s3-uri", requestS3Uri,
              "--output-s3-prefix", outputS3Prefix,
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
              { name: "WORLDKIT_CLOUD_EXECUTION_PART", value: executionPart },
              {
                name: "LWDP_GENERATION_API_TOKEN",
                valueFrom: {
                  secretKeyRef: { name: generationTokenSecretName, key: "token" },
                },
              },
              {
                name: "WORLDKIT_CAPTURE_TRUSTED_PUBLIC_KEY_PATH",
                value: "/var/run/worldkit-host-trust/public.pem",
              },
            ],
            volumeMounts: [
              {
                name: "episode-runtime",
                mountPath: "/var/run/worldkit-episode-runtime",
                readOnly: true,
              },
              {
                name: "capture-signing-key",
                mountPath: "/var/run/worldkit-host-trust",
                readOnly: true,
              },
            ],
            resources: {
              requests: resourceRequests,
              limits: resourceLimits,
            },
          }],
          volumes: [
            {
              name: "episode-runtime",
              secret: { secretName: episodeRuntimeSecretName },
            },
            {
              name: "capture-signing-key",
              secret: {
                secretName: captureSigningSecretName,
                items: [
                  { key: "public.pem", path: "public.pem", mode: 0o444 },
                ],
              },
            },
          ],
        },
      },
    },
  };
}

export function kubectlApply(manifest, { spawnImplementation = spawn } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnImplementation("kubectl", ["apply", "-f", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(`kubectl apply failed: ${stderr.trim()}`));
      else resolvePromise(stdout.trim());
    });
    child.stdin.end(`${JSON.stringify(manifest)}\n`);
  });
}

export async function launchCloudEpisodeWorkerJob(options) {
  const manifest = cloudEpisodeWorkerJob(options);
  const output = await kubectlApply(manifest, options);
  return { jobName: manifest.metadata.name, namespace: manifest.metadata.namespace, output };
}

export function deleteCloudEpisodeWorkerJobs({
  executionId,
  namespace = "lwdp",
  spawnImplementation = spawn,
}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,159}$/.test(executionId ?? "")) {
    throw new Error("execution_id is invalid for Worker cleanup.");
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawnImplementation("kubectl", [
      "delete", "jobs",
      "--namespace", namespace,
      "--selector", `worldkit.seedleap.dev/execution-id=${executionId}`,
      "--ignore-not-found=true",
      "--wait=false",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(`kubectl delete Episode Workers failed: ${stderr.trim()}`));
      else resolvePromise(stdout.trim());
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await launchCloudEpisodeWorkerJob({
    executionId: options["execution-id"],
    stageId: options["stage-id"] ?? "episode-production",
    executionPart: options["execution-part"] ?? "full",
    requestS3Uri: options["request-s3-uri"],
    outputS3Prefix: options["output-s3-prefix"],
    image: options.image,
    namespace: options.namespace ?? "lwdp",
    userId: options["user-id"] ?? "worldkit-studio",
    gpuResourceName: options["gpu-resource-name"] ?? "nvidia.com/gpu",
    gpuCount: Number(options["gpu-count"] ?? 1),
    gpuRequired: options["gpu-required"] !== "false",
    cpuRequest: options["cpu-request"],
    cpuLimit: options["cpu-limit"],
    memoryRequest: options["memory-request"],
    memoryLimit: options["memory-limit"],
    ephemeralStorageRequest: options["ephemeral-storage-request"],
    ephemeralStorageLimit: options["ephemeral-storage-limit"],
    nodeSelector: options["gpu-nodegroup-name"]
      ? { "alpha.eksctl.io/nodegroup-name": options["gpu-nodegroup-name"] }
      : {},
    jobSuffix: options["job-suffix"] ?? "",
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
