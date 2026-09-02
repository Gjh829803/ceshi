# Persistent Seedance review publication

The public Seedance review surface is a read-only static publication. It must
not depend on a developer machine, Studio process, localhost URL, or ephemeral
Cloudflare quick tunnel.

## Ownership

- Episode generation owns the source artifacts and mutable execution state.
- The publication builder derives closed static Case manifests and a catalog.
- S3 owns immutable release media and downloadable bundles.
- The public review UI reads only the published catalog and relative objects.
- A small `latest/index.html` pointer may change only after the immutable
  release has uploaded and passed object admission checks.

## Release layout

```text
world-model/sft/worldkit_seedance_review/
  releases/<release-id>/
    index.html
    app.js
    styles.css
    data/catalog.json
    cases/<episode-id>/manifest.json
    cases/<episode-id>/artifacts/**
    cases/<episode-id>/scene-assets/**
    cases/<episode-id>/data/**
    cases/<episode-id>/bundle/*.zip
    play/index.html
    play/assets/**
    play/subject-assets/**
    play/worlds/<scene-id>/preview-bootstrap.json
  latest/
    index.html
    catalog.json
```

Release objects are immutable. `latest` is promoted only after `index.html`,
the catalog, a representative Case manifest, and representative media can all
be read from S3. The publication plan is local build metadata and is never
uploaded.

## Project-local credentials

Publication uses only `.codex-tmp/runtime-config/aws-credentials` and
`.codex-tmp/runtime-config/aws-config`. Ambient AWS credentials and home
profiles are cleared before invoking AWS CLI.

## Commands

Build-only smoke:

```sh
node scripts/publication/publish-seedance-static-review.mjs \
  --source-origin http://127.0.0.1:4398 \
  --episodes-root /absolute/path/to/artifacts/episodes \
  --dry-run
```

Publish:

```sh
node scripts/publication/publish-seedance-static-review.mjs \
  --source-origin http://127.0.0.1:4398 \
  --episodes-root /absolute/path/to/artifacts/episodes
```

Publish the matching read-only playable whitebox runtime after the review
release is admitted:

```sh
node scripts/publication/publish-static-playground.mjs \
  --source-dist /absolute/path/to/apps/playground/dist \
  --release-id <release-id> \
  --catalog-url <release-data-catalog-url> \
  --source-origin http://127.0.0.1:4398
```

The static Playground owns no generation or recording API. It embeds the
approved preview bootstrap for each published scene and rewrites only runtime
resource locations. World content, subject selection, movement, camera, and
rendering code are unchanged from the source Playground build.
