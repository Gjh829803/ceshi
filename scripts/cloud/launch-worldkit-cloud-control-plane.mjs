#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { kubectlApply } from "./launch-worldkit-cloud-episode-worker-job.mjs";
import { loadLwdpGenerationConfig } from "../lib/lwdp-generation-client.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const IMAGE = /^[a-z0-9][a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/;

export function worldkitJobControllerRbac({
  namespace = "lwdp",
  serviceAccountName = "lwdp-be",
} = {}) {
  const roleName = "worldkit-cloud-job-controller";
  return [{
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "Role",
    metadata: { name: roleName, namespace },
    rules: [{
      apiGroups: ["batch"],
      resources: ["jobs"],
      verbs: ["get", "list", "watch", "create", "update", "patch", "delete"],
    }, {
      apiGroups: ["coordination.k8s.io"],
      resources: ["leases"],
      verbs: ["get", "list", "watch", "create", "update", "patch"],
    }],
  }, {
    apiVersion: "rbac.authorization.k8s.io/v1",
    kind: "RoleBinding",
    metadata: { name: roleName, namespace },
    subjects: [{ kind: "ServiceAccount", name: serviceAccountName, namespace }],
    roleRef: {
      apiGroup: "rbac.authorization.k8s.io",
      kind: "Role",
      name: roleName,
    },
  }];
}

export function cloudControlPlaneResources({
  image,
  namespace = "lwdp",
  serviceAccountName = "lwdp-be",
  generationTokenSecretName = "lwdp-generation-token",
  apiBase = "https://lwdp.loopit.me",
  userId = "worldkit-studio",
  codexAccountIds = "",
  port = 4197,
  monitorPort = 4175,
}) {
  if (!IMAGE.test(image ?? "")) throw new Error("Control-plane image must be digest-pinned.");
  const labels = { app: "worldkit-cloud-control-plane" };
  const deployment = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: "worldkit-cloud-control-plane", namespace },
    spec: {
      replicas: 1,
      strategy: { type: "Recreate" },
      selector: { matchLabels: labels },
      template: {
        metadata: {
          labels,
          // The control plane already reports durable run state, LWDP
          // heartbeats and structured stdout logs. Explicit opt-outs avoid the
          // cluster-wide observability mutator adding language runtime init
          // containers that can delay or block Studio recovery.
          annotations: {
            "instrumentation.opentelemetry.io/inject-java": "false",
            "instrumentation.opentelemetry.io/inject-python": "false",
            "instrumentation.opentelemetry.io/inject-dotnet": "false",
            "instrumentation.opentelemetry.io/inject-nodejs": "false",
          },
        },
        spec: {
          serviceAccountName,
          terminationGracePeriodSeconds: 60,
          containers: [{
            name: "studio-control-plane",
            image,
            imagePullPolicy: "IfNotPresent",
            command: ["node", "scripts/cloud/run-worldkit-cloud-control-plane.mjs"],
            ports: [{ name: "http", containerPort: port }],
            env: [
              { name: "WORLDKIT_STUDIO_PORT", value: String(port) },
              { name: "WORLDKIT_STUDIO_HOST", value: "0.0.0.0" },
              { name: "WORLDKIT_STUDIO_DATA_ROOT", value: "/var/run/worldkit-studio" },
              { name: "WORLDKIT_CLOUD_CONTROL_PLANE", value: "1" },
              { name: "WORLDKIT_CLOUD_WORKER_IMAGE", value: image },
              ...(codexAccountIds ? [{
                name: "WORLDKIT_LWDP_CODEX_ACCOUNT_IDS",
                value: codexAccountIds,
              }] : []),
              { name: "WORLDKIT_DISABLE_PLAYGROUND_SPAWN", value: "1" },
              { name: "LWDP_API_BASE", value: apiBase },
              { name: "LWDP_USER_ID", value: userId },
              { name: "AWS_REGION", value: "us-east-2" },
              { name: "AWS_DEFAULT_REGION", value: "us-east-2" },
              {
                name: "LWDP_GENERATION_API_TOKEN",
                valueFrom: {
                  secretKeyRef: { name: generationTokenSecretName, key: "token" },
                },
              },
            ],
            readinessProbe: {
              httpGet: { path: "/index.html", port: "http" },
              initialDelaySeconds: 5,
              timeoutSeconds: 10,
              periodSeconds: 10,
            },
            livenessProbe: {
              httpGet: { path: "/index.html", port: "http" },
              initialDelaySeconds: 600,
              timeoutSeconds: 10,
              periodSeconds: 20,
            },
            resources: {
              requests: { cpu: "500m", memory: "2Gi", "ephemeral-storage": "2Gi" },
              limits: { cpu: "4", memory: "8Gi", "ephemeral-storage": "8Gi" },
            },
            volumeMounts: [{ name: "ephemeral-data", mountPath: "/var/run/worldkit-studio" }],
          }, {
            name: "read-only-monitor-proxy",
            image,
            imagePullPolicy: "IfNotPresent",
            command: ["node", "apps/studio/src/cloud-monitor-public-proxy.mjs"],
            ports: [{ name: "monitor", containerPort: monitorPort }],
            env: [
              { name: "WORLDKIT_CLOUD_MONITOR_PORT", value: String(monitorPort) },
              { name: "WORLDKIT_CLOUD_MONITOR_TARGET", value: `http://127.0.0.1:${port}` },
            ],
            readinessProbe: {
              httpGet: { path: "/index.html", port: "monitor" },
              initialDelaySeconds: 5,
              timeoutSeconds: 10,
              periodSeconds: 10,
            },
            resources: {
              requests: { cpu: "100m", memory: "128Mi" },
              limits: { cpu: "500m", memory: "512Mi" },
            },
          }],
          volumes: [{ name: "ephemeral-data", emptyDir: { sizeLimit: "8Gi" } }],
        },
      },
    },
  };
  const service = {
    apiVersion: "v1",
    kind: "Service",
    metadata: { name: "worldkit-cloud-control-plane", namespace },
    spec: {
      type: "ClusterIP",
      selector: labels,
      ports: [{ name: "http", port, targetPort: "http" }],
    },
  };
  const publicMonitorService = {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name: "worldkit-cloud-monitor-public",
      namespace,
      annotations: {
        "service.beta.kubernetes.io/aws-load-balancer-scheme": "internet-facing",
      },
    },
    spec: {
      type: "LoadBalancer",
      selector: labels,
      ports: [{ name: "http", port: 80, targetPort: "monitor" }],
    },
  };
  return Object.freeze([
    ...worldkitJobControllerRbac({ namespace, serviceAccountName }),
    deployment,
    service,
    publicMonitorService,
  ]);
}

export async function launchCloudControlPlane(options) {
  const resources = cloudControlPlaneResources(options);
  const outputs = [];
  for (const resource of resources) outputs.push(await kubectlApply(resource, options));
  return { resources: resources.map((resource) => `${resource.kind}/${resource.metadata.name}`), outputs };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [config, lwdpConfig] = await Promise.all([
    readFile(join(repoRoot, "config", "cloud-episode-production.json"), "utf8")
      .then(JSON.parse),
    loadLwdpGenerationConfig(process.env),
  ]);
  launchCloudControlPlane({
    image: config.workerImage,
    namespace: config.namespace,
    apiBase: lwdpConfig.baseUrl,
    userId: lwdpConfig.userId,
    codexAccountIds: process.env.WORLDKIT_LWDP_CODEX_ACCOUNT_IDS ?? "",
  })
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
