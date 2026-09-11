# Creator Host maintenance

Read [service usage](README.md), [Agent task requirements](docs/agent/README.md) and
[programming and checks](docs/agent/programming.md). The `docs/agent/` documents define the
production workflow; maintain one source loaded by discovery and the cloud runner.
Do not copy their policy into wrappers or expand it during infrastructure changes.

Creator owns compilation, browser tools, real-input self-check evidence and local
handoff. The `src/browser/` directory is the production bridge and capture support,
not the developer Playground. It shares the SDK runtime and does not own a second
physics, animation or camera loop. Captures and temporary views restore state.

Preserve reference-driven authoring, asset permissions, initial state and camera
handoff. Asset additions must expose accurate source-backed capability and binding
contracts. Do not derive visible geometry by iterating collision proxies or turn
examples into mandatory scene templates.
Verify returned document/example requests with their actual tools, schema source
extraction, package source closure and final runtime hashes.

A submitted world's technical status is separate from semantic/reference review.
Recording length follows requested coverage, independently of content capacity.
Do not modify SDK validators merely to make a scene pass. Runtime modifications
belong in the authored project's runtime build and must be delivered as actual bytes.

Check affected Creator/Episode integration from repository scripts; Creator
production code must not depend on the downstream Episode package. Shared capture
helpers come from `@worldkit/browser-capture`. Cloud submission belongs to the
Creator Cloud application and requires task authorization.

Keep runtime modules in `src/` by domain, tests in matching `tests/` directories,
and maintainer imports/exports/smokes in `scripts/`. Root files are package metadata.
