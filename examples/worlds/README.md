# Public streaming worlds

This is the shared demo library loaded by `pnpm dev:stream`. Each direct child is
a complete Creator source project using the streaming world UI contract. Add a
project directory here to make it available in the local console after restarting
the Host. This directory contains maintained, playable demos, not test fixtures.

Each world contains `index.html`, scene modules, `project.json`, `episode.json`,
the UI catalog/definition/state schema/React components, and optionally its source
reference. A `case.json` may declare `schemaVersion: 1`, a human-readable `title`,
`description`, reference identity and `uiProtocolVersion: 1`. The title appears in
the console; the stable world ID is the directory name.

Author using [the streaming UI contract](../../packages/creator-host/docs/agent/ui.md).
Complete Creator compile, real-input playtest and `world_submit`, then verify the
same authored source and world build in Stream Host before promoting a demo.
Keep generated types, runtime bundles, browser logs, recordings, archives, tokens
and delivery receipts in ignored evidence/cache directories, outside public source.

`../three-creator/` remains the SDK API/example fixture library; absence of a
streaming UI binding does not make those SDK tests or examples obsolete. They are
not scanned as public demo worlds. The old health-bar and mission fixtures remain
available to their regression tests/evidence but are not part of this demo list.

For direct local play without streaming, run
`pnpm dev:example examples/worlds/seaside-town 53901` from the repository, or
`pnpm dev` inside `seaside-town/`. The authored HUD is on by default; append
`?ui=off` for a clean world page or `?ui=on` to explicitly enable it.
