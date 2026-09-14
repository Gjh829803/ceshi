# Camera view selection review

Review target: PR #249, initially `70b795a8`, based on dev `f3a675b0`.
This records a local maintainer review, not an independent reviewer approval.

## Scope

- Optional rule parsing, preset inheritance, subject capability admission and
  unchanged-document behavior.
- Selection/input/fixed-commit ordering, manual choice and resume, debounce memory,
  configuration replacement, checkpoint/reset and subject lifecycle.
- Editing suspension, Episode fixed versus automatic capture, source-backed
  Creator discovery and Playground's use of the same controller.
- Diff against dev: saved calibration JSON and camera strategy algorithms are
  unchanged. No additional production generation step or second camera owner.

## Confirmed findings and corrections

P2: an active automatic eye view could lose its required eye anchor while an exit
delay was pending. The selector retained the now-invalid view even though a legal
default existed; input preparation then threw `CAMERA_ANCHOR_UNAVAILABLE`.

The selector now delays only while its current view remains available. Capability
loss selects the admitted fallback before input/pose evaluation. The regression
first failed on the original implementation and passes with this correction.

P1: the real-browser smoke found that returning to the default view while swimming
backwards reseeded camera yaw from the actor's facing. Yaw changed by approximately
180 degrees, reversing camera-relative input and sending the player back into water.
The original smoke recorded another swimming switch seven frames after exiting.

Automatic changes now rebase the current orbit heading through the existing
reference-frame conversion and retain the orbit inactivity timer. Destination
framing still applies, and explicit view selection keeps its calibrated opening.
A controller regression and native forward-into-water/backwards-out route cover
the camera heading and actual movement direction together.

Remote review also identified three lifecycle/consumer gaps, verified and corrected:

- P2: `activation: 'on-input'` waited an extra fixed tick before evaluating rules.
  The activating input now activates following and selects its rule in the same
  transaction; idle openings are still preserved.
- P2: Playground's resume action replaced the edit session and lost its original
  cancellation checkpoint. The edit session now resumes selection while retaining
  that checkpoint; SDK and Playground regressions verify apply/resume/cancel.
- P1: a later explicit view action in an automatic Episode segment lost its pin
  on mounting/dismounting. Successful actions now reacquire the Episode selection
  hold; failed actions release only their provisional hold. Native vehicle tests
  check both mount transitions and rejected commands.

P2: plan submission validated named views but omitted the automatic-selection
capability, accepting a plan that would fail only when capture began. The existing
plan-view validation now checks that capability, including legacy imports. A real
planner MCP test verifies rejection before writing `plan.json` and successful
submission after correcting the plan; no new production step is introduced.

P2: releasing an automatic Episode segment removed its hold but left a later
explicit view action pinned in the live World. The lease now tracks ownership of
that manual choice and revokes it on release without sampling geometry or changing
the final recorded pose. A native regression checks the unchanged release frame
and automatic swimming selection on the next live step.

Additional regressions cover configuration replacement/checkpoint restoration and
native Episode initialization with a 0.25-second blend and four entry delays.
No other blocking defect was identified in the inspected paths.

## Evidence and limits

The original 51-file camera suite passed 927 tests; the original PR head's complete
CI also passed. Follow-up checks passed 200 tests across the controller, selector,
native swimming and mounted routes, editing, Episode and Creator discovery. Final follow-up CI must pass
before merge.
The planner capability correction also passed 13 contract tests and nine actual
planner MCP/browser tests; that consumer is registered in the camera suite.

Native Episode tests selected alone with Vitest `-t` can trigger a cold Rapier WASM
`unreachable` followed by an unsafe-aliasing error on this macOS host, with both
Node 23 and Node 24.3.0. An existing authored-camera test without state selection
also reproduces this isolated-run failure. The complete Episode test file and
normal CI pass. This remains a test-isolation investigation; it is not evidence
that the camera change fixed or caused the underlying WASM issue.

The local production-path smoke uses actual Creator compilation, browser controls,
recording and submission, then the delivered runtime in Episode. Its artifacts
and per-attempt source identities stay outside Git. A changed runtime requires
new recording evidence; old recordings are never relabeled. The Episode smoke
is a short local capture, not the standard six-clip production or cloud generation.
Browser success does not establish all-scene visual equivalence or an FPS target.
