# Cloud worker image

> Earlier workflow reference, retained for its existing code and archives.
> It is not the current Three production entry point; follow the
> [Three branch guide](../../docs/three-sdk-data-production.md). These instructions do not authorize a new run.

The image contains the pinned WorldKit source tree, the lockfile-resolved pnpm
workspace, Playwright Chromium, Python/Pillow, ffmpeg, and the AWS CLI. It does
not contain `.env` files, credentials, generated Scene artifacts, Studio data,
or prior test results.

The heavy Browser services are started only for Episode prepare/capture. All
post-capture stages run from their S3 checkpoint without starting Studio,
Playground or Playwright. This keeps every stage independently retryable and
does not change any Agent prompt, image producer, Runtime capture or video bytes.

Build `Dockerfile` for Scene/prepare/capture and `Dockerfile.postprocess` for
style, Gemini, Prompt, direct Seedance, fallback, conformance and publication.
Set the latter digest through `WORLDKIT_CLOUD_POSTPROCESS_WORKER_IMAGE` (or the
matching production-config field). Existing executions without that frozen
field keep using their original image and therefore remain resumable.

Build it from the repository root and push it to an immutable registry tag.
Resolve that tag to a digest and pass the digest to
`pnpm cloud:scene:launch-worker`; the launcher rejects mutable tags.

Runtime credentials are injected from Kubernetes Secrets. The short-lived ECR
push credential used by a cluster-side image builder is not a runtime Secret
and should be deleted immediately after the image is pushed.
