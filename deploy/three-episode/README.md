# Three Episode deployment resources

[`device-plugin.json`](device-plugin.json) is the Kubernetes NVIDIA device-plugin
DaemonSet consumed by
[`three-episode-batch-infrastructure.mjs`](../../packages/episode-pipeline/src/cloud/cloud-batch-infrastructure.mjs).
The generator combines it with the Episode service accounts, scheduling policies
and reconciler resources. Application settings and runtime examples remain under
[`config`](../../config/README.md).

Moving this manifest does not deploy it or change existing cluster resources.
Its object identity, image, selectors and resource settings are unchanged.
