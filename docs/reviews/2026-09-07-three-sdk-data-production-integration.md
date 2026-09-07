# Three SDK / data production integration evidence

Branch: `codex/three-sdk-data-production-20260907`.

The branch starts at Episode production `864c2dd2`. Commit `d0c93604` snapshots
the current Three production working files, excluding the unrelated old Episode
global GPU configuration. Merge `520efaae` includes Creator `0abd9a00`, the
Creator working documentation, the SDK locomotion correction and the unified
branch guide. Original working trees, runtime archives, reviewer stores and
running processes were not changed by this integration.

## Integration decisions

- Keep Creator v0.2 tools, delivery validator, launcher and runtime-lock protocol
  together. Preserve the compiler camera override and presentation schema needed
  by the independent Episode consumer.
- Keep Episode clock ownership, episodePort, presentation, relocation and reset.
  Add Creator representative capture and preserve-opening follow behavior.
  The camera's physical decollider remains one authority.
- Carry the verified locomotion resolver and planar KCC correction, including
  Episode-start history clearing. No generated world geometry is edited.
- Keep source, capture, image and provider journals separate from code. Human
  feedback is not versioned by SDK. The original human-ten aggregate page remains
  served by its existing process; generic report/preview support is in the branch.
- Preserve the original source-repair patch files byte-for-byte. Their blank
  unified-diff context lines intentionally contain a space; all other staged
  files pass whitespace checks without exemptions.

## Verification of the integrated tree

| Check | Result |
| --- | --- |
| Three SDK + Creator + Episode Vitest | 30 files, 365 tests passed; includes real Chromium/MCP source loading and capture adapters |
| Three Episode / scheduling / shared production Node tests | 104 passed |
| Creator cloud contract Node tests | 40 passed |
| Campaign controller / publisher Python tests | 11 + 2 passed |
| TypeScript | `pnpm typecheck` passed |
| Test registry | 379 files classified; 320 contract, 59 resource-heavy |
| SDK prebuild | Passed from the integrated source |

The runtime and camera integrator additionally verified the narrow merge
regressions; they are covered by the integrated test run above and are not added
again to its test count. Tests did not submit production jobs or video requests.

The final compatibility-import correction uses a narrow type-only
`@worldkit/three/camera-compat` export and a test-only physics export. The camera
kernel body and original SHA proof remain unchanged. Its affected compatibility
tests passed 31/31, typecheck passed, and both real Creator/repaired-source browser
adapter cases passed again. Workspace boundaries passed with the same 49 existing
debt entries; no verifier exemption or new boundary debt was introduced.

The final SDK prebuild has runtimeHash
`9bbd588f267ef71949ffc6eb052dc61ac0c444f776423f38d0793be760ad1beb`
and manifest SHA256
`aa6aa225e5a944244e0227e10b295c465887af076b1775f207017d22416f24c9`.
The runtime bytes are unchanged by the type-import correction. No full-repository
test claim is made from these Three checks.

## Capability boundary

The completed code path prepares six 30-second reference clips and up to sixty
style-conditioned render requests. It still requires `--stop-before-seedance`.
Automatic Creator delivery subscription, video-provider submission and final
generated-video acceptance remain subsequent work; the new branch does not
represent them as deployed or complete.


## Follow-up: complete source bundle export

The recording task confirmed the missing reference image belonged to its capture
patch packaging step, not the original SDK derivative. The original ten local
derivatives already had those images and their closure hashes. Its frozen r2
package and production queue were not changed by this follow-up.

`source.ts` now exposes complete manifest-driven copying through
`three:episode:source --copy ... --output ...` and received-package verification
through `--verify ...`. The loader also checks that an optional contextPath is an
ordinary package-local file. A missing context had a failing reproducer before
the change. Tests cover relocation after deleting the original, omission of
reference/plan/context files, corrupted inputs, symlinks and existing outputs.

All 77 Episode tests, typecheck and the 380-file test census passed. A real local
human-ten-04 copy was archived, extracted to another directory and verified with
runtimeHash `f059b8feadea05343244191a53a86f9e5c6fd082bccd0f3893b4aa6fb34672fe`
and unchanged worldBuildHash
`106852bff22ee139bb53b959cd9ccaf65cb519257513aecdd70d60fd1a65020c`.
No SDK bytes, original source bundle, production worktree, frozen package, GPU
queue, review record or provider task was modified by that verification.
