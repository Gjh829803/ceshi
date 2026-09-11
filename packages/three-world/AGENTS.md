# Three SDK maintenance

Read [the SDK guide](README.md), [runtime checklist](../../docs/reviews/runtime-deep-review-checklist.md)
and the architecture's design background before changing public behavior.

- Maintain one fixed clock, Rapier world, controller per actor, animation owner
  and active camera writer. Extensions return intent; no second execution loop.
- Input, action metadata, live controls and recordings share the same contracts.
  Describe preconditions, scene requirements, units, completion and rejection.
  A clip alone is not proof of an executable action.
- Verify installed dependency semantics, transitions, failure conditions and the
  affected Creator and Episode consumers. Builds identify actual runtime bytes.
- Expose measured state with source and sampling identity. Distinguish unknown,
  stale and inferred values. Reading diagnostics must not advance simulation.
- Three authors own visuals, colliders and scene composition. Presentation DOM
  owns UI; production captures use pure renderer pixels.
- Defaults belong in `src/config`; Playground and SDK consume the same definitions.
  Calibration does not create a second source of truth or mandatory production step.
- Keep `@worldkit/three` and the `ThreeWorld` public API identities. Use public
  exports for cross-package dependencies and `./testing` only in tests.
