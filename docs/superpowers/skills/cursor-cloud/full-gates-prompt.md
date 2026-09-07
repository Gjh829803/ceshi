# Three integration verification prompt

Verify `seedleap/agent-whitebox-world-sdk` at exact commit `<TARGET_SHA>` on remote
branch `<TARGET_BRANCH>`. Scope: `<AFFECTED_BEHAVIOR>`.

1. Fetch and verify the requested SHA. Read AGENTS.md, docs/three-sdk-architecture.md,
   docs/three-sdk-data-production.md and the runtime review checklist. Report the
   source SHA and initial worktree state.
2. Prepare dependencies for this exact checkout, using its lockfile and runtime
   requirements. Verify Chromium/media tooling if required by the selected tests.
   Do not assume the remote environment's default-branch configuration matches
   the target. Report setup failures separately; do not change lockfiles.
3. Run the affected reproducer first. For an integrated Three runtime change,
   execute the following closure once:

   ```sh
   pnpm exec vitest run packages/three-world scripts/three-creator scripts/three-episode
   node --test scripts/three-episode/*.test.mjs scripts/cloud/three-episode-scheduling.test.mjs scripts/lib/cloud-production-run.test.mjs
   pnpm typecheck
   pnpm test:census
   pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/three-runtime
   git diff --check
   git status --short
   ```

4. Add Creator cloud contract or other direct-consumer checks when their inputs
   are affected. For documentation-only changes, use links/claims/diff and relevant
   documentation-consumer checks instead of replaying this runtime closure.
5. Keep cloud/provider calls mocked. Do not submit or retry production jobs, edit
   source, replace evidence, commit, push, merge or deploy. Build output belongs
   only in the designated ignored temporary directory.
6. Record commands, exit codes, counts, artifacts and limits. Do not repeat passing
   checks whose relevant inputs are unchanged. Preserve the first failure.
7. Report GO/NO-GO for this stated scope and list unrun evidence layers. This is
   Three integration verification, not proof of full-repository CI, deployed
   runtime identity, visual quality or generated-video readiness.

Return results in the remote task; do not create a repository report file.
