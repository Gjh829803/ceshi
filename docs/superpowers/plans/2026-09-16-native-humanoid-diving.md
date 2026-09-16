# Native humanoid diving implementation plan

**Goal:** Let Creator reuse native water and humanoid movement for surface swimming,
diving, underwater depth retention and return to shore.

**Approved scope:** User approved the preceding three-step proposal and requested
an isolated worktree based on the dev branch. Base: `422230e3`.

**Architecture:** Extend the existing humanoid controller and its water contact.
Use the existing signed `Input.lift` channel (positive ascent, negative descent),
with held Space and C/Ctrl on foot. Keep jump and crouch edges on land. Water entry
without dive intent retains existing surface buoyancy; explicit descent enters
underwater control, neutral input damps vertical movement, and ascent reaching the
surface restores buoyancy. Existing KCC resolves floor, ceiling and wall contacts.
Reset, relocation and water exit clear underwater control. Animation and Host
feedback consume the committed native state; no independent simulation loop.

**Constraints:** Keep original downloaded cases intact. No external jobs, new
production gates, new asset clips or global geometry detector. Visual authoring
guidance covers coplanar water/terrain; the downloaded staircase repair is separate.

## Tasks

- [x] Add failing public-world tests in `humanoid-runtime/water-feedback.test.ts`
  for signed lift, neutral depth retention, surface return, real collision,
  shoreline exit, reset and snapshot isolation. Add held/rebound keyboard input
  coverage and Episode lease input coverage using existing test owners.
- [x] Implement water tuning in `config`, vertical swimming in
  `humanoid/water-physics.ts` and `humanoid/controller.ts`, passing lift through
  `humanoid/actor.ts`. Publish the swimming mode in the existing water contact.
- [x] Extend Creator advisory feedback and its timeline for underwater swimming;
  verify malformed observations degrade locally without acceptance changes.
- [x] Synchronize capability cards, input hints, authoritative SDK water docs and
  human movement navigation. Explain native reuse and unsupported extensions;
  add visual water/solid separation guidance. Verify actual schema extraction.
- [x] Run affected tests, typecheck, census, lint/diff checks and runtime prebuild.
  Exercise native input in a local browser fixture, including the pool-case depth
  and stairs. Report observed behavior separately from full visual acceptance.

## Verification commands

`pnpm exec vitest run packages/three-world/src/humanoid-runtime/water-feedback.test.ts packages/creator-host/tests/tools/water-feedback.test.ts packages/three-world/src/episode.test.ts packages/three-world/src/input.test.ts packages/creator-host/tests/discovery/authoring-schema.test.ts`

`pnpm typecheck`; `pnpm test:census`; `pnpm verify:workspace-boundaries`;
`pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/three-runtime`.


## Verified results

- Native water suite: 13 tests passed, including dive/hold/ascent, floor/ceiling,
  stairs, real shoreline entry/exit, reset, inactive mounted contact and copies.
- Native runtime: 66 tests passed, retaining land actions and mounted controls.
- Episode SDK port: 24 tests passed, including command-based descent, release,
  neutral hold, surface return and observation without simulation advancement.
- Creator water feedback: 39 tests passed. Source schema extraction: 18 passed.
  Actual materialized-runtime discovery: 12 passed, including Chinese diving
  search and the public water observation contract. Browser input: 11 passed.
- Existing bridge-inspection and traversal-composite suites passed in the affected
  regression selection. No external production services were called.
- `pnpm typecheck`, `pnpm test:census` (168 registered test files), workspace
  boundaries, changed TypeScript ESLint, changed Markdown local links and
  `git diff --check` passed. Runtime prebuild completed locally.
- One broad parallel run hit an existing 5-second discovery timeout; the full
  discovery suite passed with one worker and a 20-second per-test timeout.
- Independent read-only review found no blocking correctness issues; the 4 cm
  surface-return tolerance is documented explicitly.

A local migration of the user's pool case lives in ignored
`.codex-tmp/native-pool-review/`, served at `http://127.0.0.1:8081/`.
It keeps the original geometry/model and supplies two native `map.water` volumes,
uses the full humanoid controller and its animation owner, and separates water
height from the first stair by 5 cm. The original download and its delivery
identities remain unchanged. Browser-observed native input results at x=5,z=4:
feet Y -1.35014 (surface), -3.53754 (descent), -3.67504 (neutral hold),
-1.34987 (return). Native underwater character presentation was visually inspected.
This is focused integration evidence, not full acceptance of the pool's portal
journey, all camera views or a new production delivery. No global coplanar mesh
checker or dedicated dive animation clip was added.
