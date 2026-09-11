# Package internal layout implementation plan

**Goal:** Organize browser-capture, preset-content, creator-host and episode-pipeline
by conventional source/test/script/document/config boundaries and actual domains.
Continue MR #237 on codex/package-boundaries. Preserve package names, public exports,
root production commands, runtime behavior, task policy and frozen job identities.

- [x] Move runtime modules under src/, with domain folders in the larger packages.
  Put tests under tests/ mirroring their module domain, fixtures under tests/fixtures,
  maintainer imports/exports/smokes under scripts/, Agent guides under docs/agent,
  and default data/configuration under config/. Keep root metadata files only.
- [x] Rewrite actual imports and file-location expressions, package exports/scripts,
  test inventories, source extraction, example registry, capsule packaging and
  active documentation. Never rewrite historical entrypoint identities as live paths.
- [x] Preserve frozen original, flat-package and structured-package execution;
  route overlays to the matching actual source layout without modifying pinned bytes.
- [x] Verify typechecks, lint, boundaries/census, Creator/Episode source consumers,
  independent mocked production suites, browser/recording consumers, runtime byte
  parity, Playground build and isolated Creator capsule installation/compilation.
- [x] Independently review the final path and packaging boundaries.

Delivery: commit and push to the existing MR branch, then update its description
with evidence and verification limits.

Production/runtime code belongs in src/; root scripts/ directories are maintainer
utilities. No empty framework layers, new wrappers or gameplay changes are needed.
