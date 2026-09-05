# Three Creator SDK work graph

Authority: [implementation contract](../specs/2026-09-05-three-creator-sdk-refactor.md).
Root owns architecture, types, dependencies, tests census, final integration and
publication. Workers do not modify frozen V3 SDK/artifacts or another checkout.

| ID | Deliverable / owner | depends_on | blocks | exclusive ownership | evidence | mode |
| --- | --- | --- | --- | --- | --- | --- |
| T0 | Contract and baseline / root | — | T1–T4 | spec, plan, contracts.ts, package manifests/lock, AGENTS | source audit and executable engine/assets spikes | main-agent-only |
| T1 | Real Three/Rapier physics / native worker | T0 | T3,T5 | three-world/src/physics.ts, geometry.ts, physics.test.ts | actual stairs/slopes/run/dynamic lifecycle tests | parallel-safe |
| T2 | GLB/animations / asset worker | T0 | T3,T5 | three-world/src/assets.ts, assets.test.ts; scripts/three-creator/asset-catalog.json | original hashes, isolated clones, correct orientation, real animation bounds | parallel-safe |
| T3 | Thin world/input/camera/commands / root | T0; integrate T1,T2 | T5 | remaining three-world/src files, examples, app harness | real controls, update hooks, attachments, commands/reset/capture | sequential |
| T3N | Navigation derived from the same geometry / asset worker after T2 | T0,T1 geometry contract | T3,T5 | three-world/src/navigation.ts, navigation.test.ts | real Recast obstacle detour, disconnected islands, raised route, bridge removal | parallel-safe |
| T4 | Incremental tools and raw comparison / tools worker | T0 | T5,T6 | scripts/three-creator except asset-catalog.json; apps/three-creator-playground | build caching, browser input transcripts, diagnostic/report identities | parallel-safe |
| T5 | Integration/independent QA / root | T1,T2,T3,T4 | T6 | census, validation evidence, review fixes assigned by file | focused tests, typecheck, workspace boundaries, affected build, actual browser/visual tests | main-agent-only |
| T6 | Pinned cloud profile + paired trials / cloud worker | T5 | T7 | versioned scripts/cloud/three-* and runtime capsule staging, experiment reports | real model calls/images, exact hashes, no duplicate submissions | sequential |
| T7 | Five-case comparison and gallery / root | T6 | finish | eval reports/gallery manifests | independent original-vs-output and human-playable URLs | main-agent-only |

T4 may implement against contracts before T1–T3 are ready, but cannot claim a
working Runtime or start model cases until T5. T6 initially prepares only the
cloud integration while SDK work is pending. The old palace publication is a
separate already-authorized V3 baseline closure, owned by the cloud worker.

Shared interfaces: PhysicsPort and AssetDefinition/AssetInstance in contracts.ts;
createWorld and browser observation API are root-owned. Any necessary interface
change is proposed to root before editing. Only root runs pnpm install or changes
workspace package manifests to avoid lockfile races. All required failure cases
remain visible and retain exact source/runtime identity.
