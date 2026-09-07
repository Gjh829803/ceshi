# Training flow acceptance — 2026-09-07

## Scope and evidence ownership

Current branch: `codex/three-sdk-data-production-20260907`; base
`d028e111088cd994947d06693f6314654bd75077`.

This is a new local Codex-authored harbor world from a saved requirement, not a
copy of the Playground, a cloud-generated production case, or a remote release.
The independent world uses the original character, rover and patrol boat through
Catalog resources, the SDK runtime and the actual Creator MCP tool dispatcher.
All generated source, media and receipts stay outside Git under
`outputs/training-flow-acceptance-20260907/`.

The retained migration boundaries in
[the implementation record](../superpowers/plans/2026-09-07-training-ground-migration.md)
still apply; this check does not certify every action, map and motion family.

## Reproduction

Put `ffmpeg` and `ffprobe` on the process PATH before starting Creator. On this
host the existing binaries are under
`outputs/tools/ffmpeg/ffmpeg-9.0.1-essentials_build/bin`.

Run `pnpm test:training:flow <authored-workspace> <new-output-directory>`.
This harbor-specific acceptance expects `requirement.md`, a complete episode of
at least 180 seconds, `person`, `rover-instance-1`, `patrol-instance-1`, and water
around `[200,-1.9,0]`. It refuses to overwrite an existing output directory and
preflights both encoders before beginning real-time recording.

The runner records asset discovery, schema lookup, validation, browser inspection,
the completed character roll, approach/enter/drive/camera/exit commands, real
keyboard playtest, captures, submission, archive extraction and independent
Episode initialization/physical input. It asserts actual model bounds, movement,
fixed ticks and absence of page/runtime/network errors.

## Test results and limitations

- Contract lane: initially 123 passed / 3 failed (126 total). Real H264 encoding
  failed because FFmpeg was absent from PATH; the repository-layout scan timed
  out under load. Both files passed unchanged in a bounded 13-test rerun after
  supplying PATH. One source-export symlink fixture remains unavailable.
- Resource-heavy lane: 362 passed / 9 failed (371 total). All nine failures are
  Windows `EPERM` while creating symlink fixtures: compiler 5, Creator 3, Episode
  MCP 1. Together with source export, **10 security fixtures remain unverified**.
  No fixture was skipped, assertion weakened or host security setting changed.
  Accounting after focused reruns is 487 passing / 10 environment-blocked tests,
  not an all-green full gate.
- Root and training-example TypeScript checks, Three workspace checker and
  registration census passed (44 files: 20 contract, 24 resource-heavy).
- Evaluation/publisher tests: 20 passed with Python UTF-8 mode; production-sync
  fixture passed separately with the Windows extended-length TEMP/TMP prefix.
  Default Windows GBK and MAX_PATH runs are retained as environment failures,
  not hidden by production code changes. All 21 local cases are covered.
- Read-only independent review found no confirmed P0/P1 in the integration and
  independently verified all 22 Catalog assets / 102 unique resources:
  47,112,492 bytes with matching size and SHA-256. Acceptance still depends on
  the real delivery/consumer run, not the reviewer alone.
- Runtime prebuild remains `outputs/training-camera-visibility/runtime-prebuild`,
  runtime hash `3ad8779f11d47ec18919379adf73e89fb5b901538a1b2e47318ab134b5e12f74`.
  No runtime source was changed by this acceptance task.

The first 181-second run (`run/`) completed genuine input with zero runtime/page
errors but was rejected because video encoding could not start (`ffmpeg ENOENT`).
It was not submitted or reused as passing evidence. The new `run-ffmpeg/` session
repeats the real recording with the existing encoder available.

## Verified new-world delivery

`run-ffmpeg/report.json` completed successfully. Creator technical status is
`passed` (semantic status remains `unreviewed`): 181.2148 seconds of real input,
187.869-second encoded self-check video, captures and a closed delivery archive.
Rover driving moved 22.8448 m; the patrol boat moved 53.7649 m. Character roll
completed, and both vehicles passed approach/enter, three camera modes and exit.

The archive was extracted into a new directory and adapted to a separate Episode
source. Both vehicles passed start probes, mounted initialization and 120 actual
fixed ticks of forward input with physical movement and no errors. The saved
1280x720 rover/boat PNGs were visually inspected: subjects are rendered and no
workbench DOM is present.

- Author source: `be4ab72d31a907c40557c53d531cd269fc8e266f7816c28a8be08e3a96a8715d`
- Creator world: `26bddca547533bae2a829bf9b8c752c9b5fbf350ed7840b385740406925e73c1`
- Derived Episode world: `948afe5fab82c079540c639142b3c5204282f98a446dcecad1e16d73b4fe67d4`

`rover-capture/capture-summary.json` also completed: six newly recorded rover
segments (no cache reuse), each 720 frames / 30 seconds, 1280x720 H264 at 24 fps.
Each has a start probe, physical-input trace, health report, first-frame PNG and
video. This extends the same new delivery through the real Episode encoder;
it is rover-family rendered evidence, not six-clip coverage of every family.

## Git byte preservation

Precommit verification compared Catalog hashes with actual staged Git blobs,
not just working-tree files. With `core.autocrlf=true`, six original license
texts were normalized on add and no longer matched their declared hashes.
`.gitattributes` now marks `assets/three-creator/training/** -text` so JSON actions,
notices and models retain exact source bytes on both add and checkout. Original
text content and Catalog hashes were not rewritten. This changes Git transport
behavior only, not the working runtime or the accepted delivery identity.
After the fix, staged blobs match all 114 resource declarations (101 distinct
source paths) across 22 assets in both byte length and SHA-256; all training
paths have staged `text: unset` attributes. This is separate from the reviewer's
working-tree resource inventory above.

The imported original license texts contain existing trailing whitespace; it is
intentionally preserved as part of the hash-verified resource. The staged diff
check outside those unchanged notices is clean.

No production tasks, cloud model jobs, remote publication or Seedance submissions
are part of this local check.
