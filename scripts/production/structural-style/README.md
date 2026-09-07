# Matte structural style: first isolated optimization

The user accepted the visual direction of the original001 checkpoint and asked
to pause remaining production while optimization continues. This first change
only adds the short shared style paragraph to newly prepared creative inputs.
It does not replace the old production prompt, SDK, G-bot animation, camera,
self-check contract, source-recovery behavior, completed worlds or human reviews.

The old300-case inputs were inconsistent:16 said whitebox,284 said3D world.
This preparation retains each original source prompt and reference, runs the
existing legacy-policy normalization equally for both arms, and appends the
same style-brief.md only forB. Original user gameplay and spatial requirements
are not replaced by a generic world request. Existing common instructions already
prefer G-bot and require camera/locomotion checks and meaningful exploration;
the style paragraph does not repeat those mechanics or prescribe a scene layout.

## Local preparation (no cloud operations)

Run prepare-comparison.mjs with --manifest pointing to the existing source master,
--case-ids containing explicit comma-separated source IDs, and --output-root
pointing to a **new** directory under this checkout's .codex-tmp. It verifies
all original input hashes before writing, rejects an existing output directory,
and records pair identities, source/derived/style hashes and the fixed baseline.
No accounts are selected, no files are uploaded and no generation task is started.

A andB both use the SDK-only profile in any later experiment. The runner's
--suite paired means raw-vs-SDK and is not the correct switch for this comparison.
Use separate new run IDs and each arm's manifest. Case IDs are distinct neutral
variant identities so admission can run the arms concurrently, while pairId and
reference hashes preserve their comparison relationship. Refresh availability
and pin the same verified account within each pair only after generation resumes.
The old campaign and its failed cases stay paused; these input files are not jobs.

## Verification and next boundary

Verify the assembled inputs/payloads locally: only the appended style paragraph
and necessary request/task identities may differ. Model, effort, SDK/CLI lock,
image bytes, base creative prompt and common instructions must match. Local
payload inspection is not evidence of improved generated-world quality.

Use the new human review UI to compare composition/structure, clean appearance,
motion and exploration when cloud generation is authorized again. Use several
different scene types instead of copying001's fences, trees or world layout.
Later work can add a tested matte G-bot appearance and simple lighting helper;
that is intentionally a separate experimental variable, not part of this change.

The first local set is .codex-tmp/structural-style-ab-20260907, using source cases
083/086/110/114/122 from the88 cases without playable outputs. They cover alpine
terrain, a solar field, an orchard, a canal industrial district and a greenhouse
plaza. verification.json records five assembled pairs with identical references,
original creative goals, baseline instructions, model/effort and runtime lock.
OnlyB's style paragraph and necessary neutral variant/task identities differ.
The local-proof subdirectory uses a synthetic offline account and halted run
directories solely to inspect the existing runner's prepared payloads. **Never
run or resume those proof directories.** The reusable a/b-manifest.json inputs
are separate and have no account assignment. No upload or cloud submission ran.
