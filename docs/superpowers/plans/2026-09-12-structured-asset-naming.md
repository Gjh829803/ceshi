# Structured asset naming migration

Approved scope: migrate the useful parts of closed PR #236 onto the package layout
from PR #237. Base: `1c1e7732017bd066a435915a9cfdad258e687ca9`.
Branch: `codex/asset-naming-structured`; keep the structure-only branch unchanged.

- [x] Reproduce missing flight/summon discovery and ambiguous animation fields
  through existing Creator tool tests, including restricted-asset and workspace-source cases.
- [x] Rename the 12 reviewed asset identities and maintained consumers, normalize
  locomotion tags, distinguish animationClips from executable actions, and update
  import/build/export generators. Preserve source rig/file identities and model bytes.
- [x] Expose flying mount metadata through search and detail. Preserve current
  topic=mounted-interaction, variant=flying-creature and parameterized snippets;
  never restore the removed fixed D01 example or obsolete topic.
- [x] Preserve the 43 primary model identities, numerical calibration, permitted
  subjects and current production behavior; regenerate only derived metadata.
- [x] Verify affected contracts, browser and Episode consumers, content/resource
  hashes, typechecks, census, lint, prebuild and isolated capsule staging.
- [x] Independently review the final implementation.

Delivery: commit and publish a separate PR depending on the structured workspace.

Existing frozen production tasks retain their old capsule, asset IDs and hashes.
Newly authored consumers use the new contract directly; no runtime aliases or new
generation gates. This task does not deploy or start cloud production.
