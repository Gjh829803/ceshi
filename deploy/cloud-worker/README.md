# Cloud worker image

The image contains the pinned WorldKit source tree, the lockfile-resolved pnpm
workspace, Playwright Chromium, Python/Pillow, ffmpeg, and the AWS CLI. It does
not contain `.env` files, credentials, generated Scene artifacts, Studio data,
or prior test results.

Build it from the repository root and push it to an immutable registry tag.
Resolve that tag to a digest and pass the digest to
`pnpm cloud:scene:launch-worker`; the launcher rejects mutable tags.

Runtime credentials are injected from Kubernetes Secrets. The short-lived ECR
push credential used by a cluster-side image builder is not a runtime Secret
and should be deleted immediately after the image is pushed.
