# Humanoid motion repairs — 2026-09-06

The user explicitly authorized manual repair of all ten cases and then requested
in-place publication at their original URLs, after each Agent finished. All ten
original case entries now serve the manual revisions. The URL folder retains its
historical build name by request; `manual-repair.json` and the gallery metadata
identify the actual new source/build/runtime. Original provider archives and
hash-verified payloads remain untouched. These repairs are not new model samples.

## Changes and responsibility

- Prompt: prefer G-bot and its supplied motions; appearance differences alone do
  not justify replacing locomotion. Require actual side-view motion checks.
- SDK guide: distinguish asset-backed animation from custom-object physics; explain
  -Z forward, -Y limbs, and signed knee/elbow flexion, with bind-pose caveats.
- MCP starter: now selects and loads G-bot instead of a static custom cube.
- SDK animation: walk/run follows control intent instead of a universal 3 m/s
  cutoff. Three regression speed pairs failed before the fix and pass afterward.
- Manual case adapter: retain each authored humanoid's meshes, outfit and joints,
  copy limb directions from the original G-bot skeleton played by the SDK, and
  keep actor position, collisions, support, facing and clock SDK-owned. The adapter
  is case-repair code, not a new general SDK authoring API. Scene/camera/gameplay
  geometry remains authored by the original Agent.
- Case 02 state telemetry now reads SDK animation state; case 03 gained elbow
  pivots without changing its mesh appearance; case 06's semantic front now agrees
  with its nested visual orientation.

## Evidence

203 SDK/Creator tests and the repository typecheck pass. Each of the ten final
worlds passed a short native-keyboard walk/run/jump/reset recording with no page
or runtime errors. Side-view frames were inspected and opening/object captures
were regenerated. This is motion regression evidence, not a repeated full-route
exploration acceptance. The original route reports remain in the archived payloads.
All ten public original links were checked against the exact compiled entry and
SDK bytes; actual HTTP 07 and 05 were also opened and inspected in the browser.
See `manual-revisions.json` and `online-verification.json`.

05 hit the outer 90-minute timeout, but its completed Creator archive was present
on FSx. The existing Host unpacker verified archive SHA, file closure, and its
249-second recording. The final park change was retained before motion repair.
The original generation remains recorded as timed out; manual recovery is separate.

## Cloud runtime for subsequent jobs

Use `runtime-lock.json` in this directory for new jobs. Do not reuse the original
ten-case lock for new generation. Model/effort remain GPT-6 Astra/xhigh, authoring
ceiling 90 minutes, and the existing account policy is unchanged.

- Source commit: a774b0ccd67d84d93b3b9ec06abe7709ca18d22c
- Cloud lock: 7486b980ac3656ad705e9d9f9902f50e204c828b7db4519a87a10ee38d39d6b0
- SDK runtime: 4ba31f620f16f57f6889a4cf47eb70df8379a3316d79596e3269c04b277b3d2e
- Cloud root: /fsx/pipeline/worldkit-three-creator-experiments/humanoid-motion-guidance-a774b0cc

The no-model cloud doctor verified the actual 15-tool MCP interface, the new
asset-backed starter, WebGL preview, native keyboard movement and installed byte
closure. No cloud generation was restarted for these manual repairs.

## Reproduction and publication

Apply the numbered patches to the corresponding original payload/source, and copy
`scripts/evaluations/humanoid-motion-repair/gbot-visual-motion.js` into the author
workspace. Compile with the runtime above. Materialized workspaces and full short
recordings remain under `.codex-tmp/humanoid-motion-repair-20260906`.

The run publisher reapplies tested manual overlays after staging, so a later
status publication cannot silently restore old code. It admits only terminal
provider cases and checks exact source/build/capture identities. Original metadata
backups are retained under that task directory. Platform notes distinguish manual
repairs from original Agent delivery. No assistant review gate was introduced.
