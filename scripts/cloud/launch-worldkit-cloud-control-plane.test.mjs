import assert from "node:assert/strict";
import test from "node:test";

import { cloudControlPlaneResources } from "./launch-worldkit-cloud-control-plane.mjs";

test("cloud control plane has no durable volume, GPU, or local credential mount", () => {
  const resources = cloudControlPlaneResources({
    image: `registry.example/worldkit@sha256:${"a".repeat(64)}`,
  });
  const deployment = resources.find((resource) => resource.kind === "Deployment");
  const service = resources.find((resource) =>
    resource.kind === "Service" && resource.metadata.name === "worldkit-cloud-control-plane");
  const publicService = resources.find((resource) =>
    resource.kind === "Service" && resource.metadata.name === "worldkit-cloud-monitor-public");
  const role = resources.find((resource) => resource.kind === "Role");
  const pod = deployment.spec.template.spec;
  const container = pod.containers[0];
  assert.equal(deployment.spec.replicas, 1);
  assert.deepEqual(deployment.spec.template.metadata.annotations, {
    "instrumentation.opentelemetry.io/inject-java": "false",
    "instrumentation.opentelemetry.io/inject-python": "false",
    "instrumentation.opentelemetry.io/inject-dotnet": "false",
    "instrumentation.opentelemetry.io/inject-nodejs": "true",
  });
  assert.equal(container.resources.requests["nvidia.com/gpu"], undefined);
  assert.equal(container.env.find((item) =>
    item.name === "WORLDKIT_CLOUD_CONTROL_PLANE").value, "1");
  assert.equal(container.env.find((item) =>
    item.name === "WORLDKIT_STUDIO_HOST").value, "0.0.0.0");
  assert.equal(container.env.find((item) =>
    item.name === "WORLDKIT_CLOUD_WORKER_IMAGE").value,
    `registry.example/worldkit@sha256:${"a".repeat(64)}`);
  assert.equal(container.readinessProbe.timeoutSeconds, 10);
  assert.equal(container.readinessProbe.httpGet.path, "/index.html");
  assert.equal(container.livenessProbe.initialDelaySeconds, 600);
  assert.equal(container.livenessProbe.timeoutSeconds, 10);
  assert.equal(container.livenessProbe.httpGet.path, "/index.html");
  assert.equal(container.resources.requests.cpu, "500m");
  assert.equal(container.resources.limits.cpu, "4");
  assert.ok(pod.volumes.every((volume) => volume.emptyDir));
  assert.equal(JSON.stringify(pod).includes("aws-credentials"), false);
  assert.equal(service.spec.type, "ClusterIP");
  assert.equal(publicService.spec.type, "LoadBalancer");
  assert.equal(publicService.spec.ports[0].targetPort, "monitor");
  const monitor = pod.containers.find((item) => item.name === "read-only-monitor-proxy");
  assert.ok(monitor);
  assert.equal(monitor.command[1], "apps/studio/src/cloud-monitor-public-proxy.mjs");
  assert.equal(monitor.readinessProbe.httpGet.path, "/index.html");
  assert.equal(monitor.env.some((item) => item.name === "LWDP_GENERATION_API_TOKEN"), false);
  assert.ok(role.rules[0].verbs.includes("create"));
  assert.ok(role.rules[0].verbs.includes("patch"));
  assert.equal(role.rules[0].verbs.includes("delete"), false);
});
