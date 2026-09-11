# Package internal layout verification

Base: `20463dcd488a20bd68bb9349ef9c8ff076e11337`, on MR #237's existing
`codex/package-boundaries` branch. This receipt covers internal organization after
the [workspace split](2026-09-12-workspace-package-migration.md).

## Structure and compatibility

`browser-capture`, `preset-content`, `creator-host` and `episode-pipeline` keep only
README, AGENTS, package.json and tsconfig.json at their roots. Runtime modules live
under `src/`; tests, maintainer scripts, documentation and configuration use their
own directories where needed. Larger packages group source and tests by actual
responsibility. See [the workspace guide](../workspace-packages.md#internal-layout).

All four package names and public export keys remain unchanged. Root production
commands retain their arguments and output semantics. `packages/three-world` and
`@worldkit/three` remain unchanged; neither SDK nor camera-solver executable source
was modified. Discovery selectors now read `creator-host/docs/agent`; the production
task requirements, Episode prompts and preset defaults preserve their bytes.
Asset catalog changes only relocate generator-source metadata; media and resource
declarations are unchanged. The dependency lockfile is unchanged.

Frozen entrypoints recognize legacy script, flat package and structured package
archives without replacing their image/archive identities. Streaming overlays
are layout-specific: absent `sourceLayout` means the deployed legacy script layout;
explicit values can select `flat-package` or `structured-package`. A mismatch leaves
the archived workflow intact. Matching overlays verify all supplied hashes before
copying unchanged bytes. This avoids installing legacy relative imports or root
calculations into a new directory layout. No global production configuration was
changed.

## Verification

- Root and workspace package typechecks, lint, zero-debt workspace boundaries and
  122-file Vitest census passed.
- Contract lane: 37 files / 363 tests passed. After adding the root-layout regression,
  its affected file was rerun: all 4 tests passed.
- Creator, Episode and Playground resource regressions: 31 files / 364 tests passed,
  including real browser compilation, MCP, recording, asset and control consumers.
- Independent Node/Python lane: 278 tests passed. After the overlay review correction,
  the expanded frozen-layout execution matrix passed all 19 tests; the affected
  overlay/batch consumers passed another 35 tests. Unaffected independent suites
  were not repeated. Python tests used 3.13 to support existing `zip(strict=)` calls.
- SDK runtime prebuild and Playground build passed. Against the preceding split,
  `three.js` and `worldkit-three.js` are byte-identical; `bridge.js` differs only in
  source-path line comments. The new combined runtime identity is
  `21ef917c637d8f4650d5e244a9bec3fe1fcd5874251e5d2ec27625d9fc86f9fc`.
- A fresh Creator capsule was staged locally, copied outside this checkout,
  installed offline with its frozen projected lock, prebuilt and used to compile
  an external author workspace. It had no access to repository `node_modules`.
  Production source staging excludes maintenance `AGENTS.md`, `tests/` and `scripts/`;
  runtime source, configuration and Agent guides remain included.
- All 43 asset entries passed content consistency; active document links and
  whitespace checks passed. Historical review paths remain historical evidence.
  The dragon-training README is also a hash-pinned asset resource: it preserves
  its original bytes and historical links, outside the active-document link check.
- Independent read-only review found the overlay layout mismatch, which was fixed
  and re-reviewed with no remaining actionable findings.

Evidence logs are retained in ignored `.codex-tmp/structure-*` files. These are
local execution, byte-parity and packaging checks. No cloud generation, deployment,
publication or semantic world review was performed. The unrelated SDK resource
suite was not rerun for these source relocations.
