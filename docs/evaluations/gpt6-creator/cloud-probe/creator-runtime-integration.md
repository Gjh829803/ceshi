# Cloud Creator runtime integration evidence — 2026-09-05

This is an isolated experiment using the deployed LWDP `options.codex_bin`
override. The shared deployment, default CLI, account homes and global
configuration were not replaced. It does not claim the planned production
Creator runtime profile is implemented.

## Runtime contents and actual verification

| Component | Pinned identity | Evidence |
| --- | --- | --- |
| Codex | Official Linux x64 0.153.3; binary SHA-256 `f9d4eab23d0e0726340e084ed22d668885c1dcabeb29ec508b8962e5e29b8dc6` | Probe attempt 2 executed GPT-6 xhigh successfully. |
| SDK | Source commit `9dff2e91`; archive SHA-256 `89223f7003f52545779a685887a77c45c1cca4f2903abe1f9dd2976c85e8cc1b` | Actual cloud Node 20.20.2, asset discovery and Babylon/Havok preview through MCP. |
| Browser | Chromium revision 1234, version 151.0.7922.34; archive SHA-256 `4b3f79c9ab400ecf76bd64ae44aba84f1bf77a267c98876d6dae277648cd50cd` | Native cloud WebGL probe and real world image passed with Jammy libraries/fonts. |
| Frozen V3 runtime | Raw lock SHA-256 `67c79376c6b19117414f20799a96dd615ddf0063ea9485b61654ab4a02fe3613` | Local and FSx bytes matched before submission. |

The SDK and browser capsules live below
`/fsx/pipeline/worldkit-creator-experiments/gpt6-five-case-20260905/`.
The current launcher is in its `v3/` directory. Earlier directories and locks
remain available for reproducing the integration failures.

The no-model MCP doctor ran from an external FSx case workspace with an FSx
TMPDIR, the same bridge, native Node loader and restricted environment used by
the model. It discovered all 11 tools, queried environment/schema, called
`world_preview`, waited through `operations_get`, and required both successful
Runtime audit and actual PNG content. The returned bytes matched the image on
disk: 1280×720, 57,747 bytes, SHA-256
`b7c64dc938c3c4e6d176b4f2dc11b7ec2e61c7cffeb73cf4bb4672a5f5f679a4`.
Human-visible inspection showed the complete red G Bot on green ground with a
brown column and blue sky. Browser errors and Runtime audit errors were empty.

Doctor outputs are in
`.codex-tmp/gpt6-five-case-eval/cloud-doctor-v2/`. Its runtime hash identifies V2;
V3 changes only precise MCP tool approval configuration, which was separately
verified with Codex 0.153.3 strict effective-config parsing.

## Integration attempts

| Attempt | Job ID | Observed result |
| --- | --- | --- |
| V1 lighthouse | `gen_9a075d23684d2efe` | Terminal failed before model work: tsx CLI cache with FSx TMPDIR resolved an MCP SDK pnpm dependency through the logical alias and failed to load `zod`. |
| V2 lighthouse | `gen_bc944f7058f0f303` | MCP initialized, but real tool calls were rejected by approval policy. The job reached terminal failure; it was not left running or counted as a delivered world. |
| V3 lighthouse | `gen_7f4f2c564a32b853` | Delivered with GPT-6 xhigh. Actual MCP submit, final-source image response, complete event stream, delivery JSON and archive hashes passed both launcher and Host transport checks. |

V2 fixes the first failure by running native Node with the tsx import loader,
disabling transform caching and fixing the tool cwd/tsconfig to the frozen SDK.
The authored workspace still comes from the explicit absolute `--workspace`.
No pnpm peers were patched into the published capsule.

V3 gives exactly the eleven enabled WorldKit tools
`tools.<name>.approval_mode="approve"`, while retaining the server default
`prompt`, global `approval_policy="never"`, and workspace-write sandbox. The
user had authorized these world-building operations. Write tools were not
mislabelled as read-only, and unrelated tool/plugin permissions were not changed.

## Delivery and failure evidence

The launcher preserves the complete Codex JSON event stream, hashes it while
receiving it, and requires an actual WorldKit `world_submit` operation followed
by its successful `operations_get` result. The result must bind the same final
source hash, a preview image response from that source, the complete delivery
JSON, and the archive bytes. The local downloader repeats those checks.
Provider success or an assistant-authored success file alone cannot pass.

The deployed worker skips declared-output upload after nonzero Codex exit.
The trusted Host therefore recovers only the exact job/task output event and
diagnostic files, using directory descriptors with no-follow opens, regular
file/link/size checks and SHA-256 verification. Failed jobs remain failed; no
successful artifact is synthesized to make transport work. V1/V2 diagnostics
and their S3 recovery manifests are under each original local run directory.

The five selected source cases and all runtime/input identities remain frozen.
First-frame quality, exploration quality and production readiness must be
reported separately from this runtime/tool integration evidence.

## First complete V3 delivery

The lighthouse finished at 04:29:53 UTC. The final source hash is
`sha256:f7ba70e2b7ed8e034c05123900c13d6b6126071f6d4413c31558ddfe11edd8a2`.
Its actual controller report passed 260 simulation seconds, all 19 authored
targets, 96 distinct five-metre cells, 618.28 metres travelled, and 134.90 metres
maximum distance from spawn. The route includes beach, cliff foot, east ascent,
lighthouse courtyard, elevated lookout and return. This demonstrates the
authored route; it is not exhaustive navigation proof.

- Archive: 15,402,444 bytes; SHA-256 `4f1ed4da1b830f50065c0f376eec2865a148d1c2ef4407583525ff5e3a14c453`.
- Complete events: 2,468,631 bytes; SHA-256 `039c2c752de15a9bb941d661d49ad6d922530656e67e6208383cf30d2f5a0e7f`.
- Actual submit operation: `op-3449fed1-73ea-4d21-ad0d-186a5a8e0724`.
- Queue: 6.10 seconds. Remote run excluding queue: 1,790.22 seconds.
- Local artifact download: 41.40 seconds.

The complete files are in
`.codex-tmp/gpt6-five-case-eval/runs/gpt6-five-case-eval-20260905-r3/gpt6-eval-coast-lighthouse/`.
The model used real images to repair terrain face winding, lighthouse placement
and a roof intersection. Runtime checks caught collider mutation; a short
controller test caught an initially blocked tide-pool route. The final version
was independently re-previewed and re-playtested after those edits. Failed
intermediate reports remain in the complete event stream.

Following the user's four-way concurrency request, the remaining jobs are:

| Case | Job ID |
| --- | --- |
| Forest lookout | `gen_1f04dd24d1d30a8d` |
| Paper moon palace | `gen_c18e93849298f49e` (replaces the cancelled pre-CLI request `gen_bdad645aceef06e1`) |
| Rice terraces | `gen_a4e89f0e4fc94dea` |
| Nine-tailed fox | `gen_4a4f2b81c6d9ab90` |

These use the same V3 runtime and original frozen inputs. Their final outcomes
belong in the batch summary, rather than being inferred from the lighthouse.
The palace replacement was submitted only after the earlier request reached
LWDP `cancelled`, the exact Ray submission reached `STOPPED`, and local admission
closed. It uses run ID `gpt6-five-case-eval-20260905-r3-ac4` and four account slots
instead of one, with pod concurrency still one. The deployed account semaphore
is shared across jobs; one slot can serialize otherwise parallel requests that
select the same account. No existing request was modified or submitted twice.

## Authoring feedback gaps found during the run

The Creator helper restricts entity IDs to lowercase even though the Native
Host identity contract permits nonempty trimmed NFC strings. Forest's `L/R`
suffixes exposed this extra Creator restriction. Generic module errors are also
deliberately collapsed by the formal Host, leaving this experimental Creator
without enough private diagnostics. These are Creator usability issues; they
must not be reported as violations of the underlying Native identity contract.
The frozen run is retained unchanged. A future revision should expose precise
imports and helper schemas, align IDs with the Native contract, and provide a
bounded private authoring diagnostic channel while preserving formal public
Host diagnostics.
