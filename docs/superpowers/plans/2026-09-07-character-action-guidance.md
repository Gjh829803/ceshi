# Character action discovery and guidance

User approved improving action discovery, conditions and examples. The ordinary
preset remains a five-clip bundle; no runtime controller or 48-clip source change.

- [x] Expose policy-filtered character usage through existing asset tools. Reuse
  SDK skill definitions and input bindings; distinguish clips from commands.
- [x] Add a character-actions schema topic backed by SDK README and actual types,
  and a minimal character-only Training example that loads the original bundle.
- [x] Verify Chinese action search, permission filtering, real example compilation
  and browser roll completion. Run focused Host/schema/capsule checks and typecheck.

Root owns this bounded Host/docs/example change. No physics, animation, camera,
production configuration, existing world or video-provider changes are needed.

## Verification

- Creator suite: 11 files / 115 tests passed; cloud/capsule contracts: 29 passed.
- Root and standalone character-example typechecks, 48-file test census,
  runtime prebuild and diff checks passed. SDK runtime bytes are unchanged.
- Real browser probe loaded the complete kit, completed a training.action roll,
  walked into the declared 2 m-deep pool with actual keys, observed swimming,
  then swim-idle, and reset to idle with swimming=false. No page/network errors.
  Evidence remains in `.codex-tmp/character-actions/visual/` outside Git.
- Probe corrections: target the Presentation input surface (not the renderer
  canvas it covers); follow the actual opening camera toward the left-side pool.
  The example hint now says toward the pool; its short episode uses A.
- Independent review found missing Chinese labels in the search index and an
  unavailable example recommendation under restricted policy. Both regressions
  were reproduced, fixed, tested and independently rechecked.
- These are selected trigger/Host checks, not full 48-action acceptance. No cloud
  model invocation, production deployment or SDK physics/animation edits.
