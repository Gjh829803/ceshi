#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
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

function jobNameForExecution(executionId, jobSuffix = "") {
  const suffix = executionId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const normalizedJobSuffix = jobSuffix.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `worldkit-scene-${suffix}${normalizedJobSuffix ? `-${normalizedJobSuffix}` : ""}`
    .slice(0, 63)
    .replace(/-$/, "");
}

export function cloudSceneWorkerJob({
  executionId,
  requestS3Uri,
  outputS3Prefix,
  image,
  namespace = "lwdp",
  serviceAccountName = "lwdp-be",
  generationTokenSecretName = "lwdp-generation-token",
  captureSigningSecretName = "worldkit-cloud-capture-signing",
  apiBase = "https://lwdp.loopit.me",
  userId = "worldkit-studio",
  resumeManifestS3Uri = undefined,
  resumeMode = "verify-only",
  jobSuffix = "",
}) {
  required(executionId, "execution_id");
  required(requestS3Uri, "request_s3_uri");
  required(outputS3Prefix, "output_s3_prefix");
  required(image, "image");
  if (resumeManifestS3Uri !== undefined) required(resumeManifestS3Uri, "resume_manifest_s3_uri");
  if (!["verify-only", "builder", "host"].includes(resumeMode)) {
    throw new Error("resume_mode must be verify-only, builder, or host.");
  }
  if (resumeManifestS3Uri === undefined && resumeMode !== "verify-only") {
    throw new Error("resume_mode builder or host requires resume_manifest_s3_uri.");
  }
  if (!/@sha256:[a-f0-9]{64}$/.test(image)) {
    throw new Error("image must be pinned by an immutable sha256 digest.");
  }
  const name = jobNameForExecution(executionId, jobSuffix);
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name,
      namespace,
      labels: {
        app: "worldkit-cloud-scene-worker",
        "worldkit.seedleap.dev/execution-id": executionId,
      },
    },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: 21_600,
      ttlSecondsAfterFinished: 86_400,
      template: {
        metadata: { labels: { app: "worldkit-cloud-scene-worker" } },
        spec: {
          serviceAccountName,
          nodeSelector: { "workload-type": "platform" },
          tolerations: [{
            key: "workload-type",
            operator: "Equal",
            value: "platform",
            effect: "NoSchedule",
          }],
          restartPolicy: "Never",
          terminationGracePeriodSeconds: 60,
          containers: [{
            name: "scene-worker",
            image,
            imagePullPolicy: "IfNotPresent",
            args: [
              "--execution-id", executionId,
              "--stage-id", "scene-production",
              "--request-s3-uri", requestS3Uri,
              "--output-s3-prefix", outputS3Prefix,
              ...(resumeManifestS3Uri === undefined
                ? []
                : [
                  "--resume-manifest-s3-uri", resumeManifestS3Uri,
                  "--resume-mode", resumeMode,
                ]),
            ],
            env: [
              { name: "LWDP_API_BASE", value: apiBase },
              { name: "LWDP_USER_ID", value: userId },
              { name: "AWS_REGION", value: "us-east-2" },
              { name: "AWS_DEFAULT_REGION", value: "us-east-2" },
              { name: "PLAYWRIGHT_BROWSERS_PATH", value: "/ms-playwright" },
              { name: "NODE_OPTIONS", value: "--max-old-space-size=6144" },
              { name: "WORLDKIT_CODEX_BACKEND", value: "cloud" },
              { name: "WORLDKIT_CLOUD_WORKER_IMAGE", value: image },
              {
                name: "LWDP_GENERATION_API_TOKEN",
                valueFrom: {
                  secretKeyRef: { name: generationTokenSecretName, key: "token" },
                },
              },
              {
                name: "WORLDKIT_CAPTURE_SIGNING_PRIVATE_KEY_PATH",
                value: "/var/run/worldkit-host-trust/private.pem",
              },
              {
                name: "WORLDKIT_CAPTURE_TRUSTED_PUBLIC_KEY_PATH",
                value: "/var/run/worldkit-host-trust/public.pem",
              },
            ],
            volumeMounts: [{
              name: "capture-signing-key",
              mountPath: "/var/run/worldkit-host-trust",
              readOnly: true,
            }],
            resources: {
              requests: { cpu: "500m", memory: "2Gi" },
              limits: { cpu: "4", memory: "8Gi" },
            },
          }],
          volumes: [{
            name: "capture-signing-key",
            secret: {
              secretName: captureSigningSecretName,
              items: [
                { key: "private.pem", path: "private.pem", mode: 0o400 },
                { key: "public.pem", path: "public.pem", mode: 0o444 },
              ],
            },
          }],
        },
      },
    },
  };
}

function kubectlApply(manifest, { spawnImplementation = spawn } = {}) {
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

export async function launchCloudSceneWorkerJob(options) {
  const manifest = cloudSceneWorkerJob(options);
  const output = await kubectlApply(manifest, options);
  return { jobName: manifest.metadata.name, namespace: manifest.metadata.namespace, output };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await launchCloudSceneWorkerJob({
    executionId: options["execution-id"],
    requestS3Uri: options["request-s3-uri"],
    outputS3Prefix: options["output-s3-prefix"],
    image: options.image,
    namespace: options.namespace ?? "lwdp",
    userId: options["user-id"] ?? "worldkit-studio",
    resumeManifestS3Uri: options["resume-manifest-s3-uri"],
    resumeMode: options["resume-mode"] ?? "verify-only",
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
