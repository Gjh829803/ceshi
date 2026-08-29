# Cursor Cloud full-gates prompt

Run a non-mutating full verification of `seedleap/agent-whitebox-world-sdk` at exact commit
`<TARGET_SHA>` from remote branch `<TARGET_BRANCH>`.

Requirements:

1. Read `AGENTS.md` before running commands. Fetch the remote, check out the exact target
   commit in detached HEAD, and report `git rev-parse HEAD` before any gate.
2. Do not edit source, generated artifacts, lockfiles, fixtures, goldens, plans, or review
   records. Do not commit, push, open a PR, merge, reset a remote branch, or update snapshots.
3. Use the existing lockfile. Run these commands once, in order, and record each exact
   command, exit code, duration, and concise result:

   ```bash
   pnpm install --frozen-lockfile
   pnpm check:agent-self-check
   pnpm typecheck
   pnpm test:studio
   pnpm test:independent
   pnpm test
   pnpm build
   pnpm build:native-scene
   pnpm verify:bna1-clean-break
   pnpm verify:unreleased-clean-break
   pnpm verify:route-r0-contract
   pnpm verify:route-r1-heightfield
   pnpm verify:route-r1b-static-platform
   pnpm verify:canonical
   pnpm verify:native-scene-playground
   git diff --check
   git status --short
   ```

4. Do not rerun a failed command merely to obtain a green result. Preserve the first
   failure output, diagnose it without changing files, and continue only when later gates
   do not depend on the failed gate.
5. Treat a dirty tracked tree after a gate as a failure. List untracked files separately;
   do not delete them.
6. End with `GO` only if every required command exits zero, the exact SHA matches, and no
   tracked file changed. Otherwise end with `NO-GO` and identify the first causal failure.

Return the report in the Cloud Agent conversation. Do not create a repository report file.
