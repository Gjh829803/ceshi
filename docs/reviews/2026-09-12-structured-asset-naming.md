# Asset naming and discovery on the structured workspace

Base: `1c1e7732017bd066a435915a9cfdad258e687ca9` (PR #237).
Branch: `codex/asset-naming-structured`. This ports the applicable intent from
closed PR #236 without restoring its obsolete directory or public example API.

## Result

Creator searches now include flying-mount usage/capabilities and curated selection
terms. Chinese flight search returns all 11 permitted numbered variants with mount
guidance; a D02-only policy uses the same parameterized binding without requiring
D01. Raw, denied and workspace-source contexts do not advertise Host executable
examples as verified current capabilities.

`animationClips` identifies playback resources separately from executable skills.
Locomotion discovery tags use `locomotion.*`; IDs, display names, SDK defaults,
asset policy, import/export generators and maintained consumers are updated together.
The public example remains `topic: mounted-interaction, variant: flying-creature`.
Production document hierarchy and scene-authoring rules are retained.

| Previous asset ID | Current asset ID |
| --- | --- |
| `humanoid.source-101` | `humanoid.uefn-mannequin` |
| `quadruped.animal.large-static` | `creature.quadruped-static-diagnostic` |
| `creature.dragon` | `creature.dragon-evolved` |
| `vehicle.bike` | `vehicle.motorcycle` |
| `vehicle.touring-bike` | `vehicle.touring-motorcycle` |
| `vehicle.slide` | `vehicle.skateboard` |
| `vehicle.hover` | `vehicle.hovercraft` |
| `vehicle.rescue-hover` | `vehicle.rescue-hovercraft` |
| `vehicle.sub` | `vehicle.submarine` |
| `vehicle.observation-sub` | `vehicle.observation-submarine` |
| `vehicle.space` | `vehicle.spacecraft` |
| `vehicle.survey-space` | `vehicle.survey-spacecraft` |

Source rig names, imported filenames and pinned donor IDs remain source facts;
the importer translates donor identity at its boundary. No runtime asset aliases
are added. Existing project selections and exported profiles must use the new
identifiers where renamed; frozen jobs retain their original capsule and identities.

Playground distinguishes local instance/profile identity from catalog identity.
Its local `dragon` slot retains selection, save/reset and profile wiring while
the selected numbered model reports its actual `creature.dragon.dXX` asset ID.
The ordinary dragon preset maps to `creature.dragon-evolved`. The library and
workbench receive the actual runtime specs rather than substituting that preset.

## Evidence

- All 43 primary models, animation mappings, collision data and numerical vehicle
  calibration are unchanged. The same 15 subjects remain permitted.
- All 130 unique primary/resource files match their declared hashes and sizes
  (210 referenced entries). Changed bundled documentation has refreshed hashes.
- The three new Creator naming/discovery regressions failed on the base and pass
  after the migration. Actual tool calls confirm the new animation field and
  flight/summon discovery while the removed standalone flying topic remains invalid.
- Contract lane: 36 files / 369 tests passed initially; its one stale search fixture
  was corrected and the complete affected SDK asset-library file passed on rerun.
  The final import/preset identity file separately passed all 16 tests.
- Affected resource lane: 21 files / 438 tests passed, covering Creator browser,
  selected-asset delivery, SDK humanoids and Episode consumers.
- After review corrections, two targeted actual flying identity/collision tests,
  50 spacecraft/vehicle-dynamics tests, eight inspector tests and nine workbench
  tests passed. Unrelated resource suites were not repeated.
- Independent Node/Python lane: 284 tests passed with external transport mocked.
- Final typecheck, lint, workspace boundaries, 122-file census and Playground
  build passed. The humanoid deterministic build reproduced the original model SHA.
- Actual Playground startup, selection and reset passed with no page/world errors;
  its SDK snapshot exposed the expected motorcycle/submarine/spacecraft identities
  and D02 identity, and the workbench offered the selected D02 subject.
- The production capsule installed offline outside this checkout, prebuilt and
  compiled an external world using the renamed default humanoid. Runtime hash:
  `30331c1ae6154bdb65e345a8b020a455713316ee5efa5cf725477f2c48c19ee4`.
- Independent review findings about dynamic Playground identities and numbered
  flying fixtures were fixed and re-reviewed with no remaining functional findings.

Local evidence is in ignored `.codex-tmp/naming-*` files. No cloud generation,
deployment or new semantic world acceptance was performed. The new source/runtime
and policy hashes require a new release identity; do not relabel old recordings.
