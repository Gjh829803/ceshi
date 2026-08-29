# Cursor Cloud full-gates prompt

Run a non-mutating full verification of `seedleap/agent-whitebox-world-sdk` at exact commit
`<TARGET_SHA>` from remote branch `<TARGET_BRANCH>`.

Requirements:

1. Read `AGENTS.md` before running commands. Fetch the remote, check out the exact target
   commit in detached HEAD, and report `git rev-parse HEAD` before any setup or gate.
2. Do not edit source, generated artifacts, lockfiles, fixtures, goldens, plans, or review
   records. Do not commit, push, open a PR, merge, reset a remote branch, or update snapshots.
3. Do not assume the feature branch's `.cursor/environment.json` was applied to the active
   Build: Cursor Builds take configuration from the environment's default branch. Prepare
   this exact checkout with the following idempotent commands, once and in order. Record
   every command, exit code, duration, and concise result. Treat
   `pnpm install --frozen-lockfile` as the install gate; do not run it again later.

   ```bash
   command -v pnpm >/dev/null || (corepack enable && corepack prepare pnpm@10.14.0 --activate)
   sudo apt-get update
   sudo apt-get install -y ffmpeg python3-pil python3-requests
   pnpm install --frozen-lockfile
   npm ci --prefix sites/world-sdk-blueprint --no-audit --no-fund
   pnpm exec playwright install --with-deps chromium
   ffmpeg -version
   python3 -c 'import PIL, requests'
   test -x sites/world-sdk-blueprint/node_modules/.bin/vinext
   git diff --exit-code -- pnpm-lock.yaml sites/world-sdk-blueprint/package-lock.json
   ```

   If setup or a probe fails, preserve its first output and classify it as an environment
   failure. Do not run gates that depend on the missing prerequisite.

4. After setup passes, run these remaining gates once, in order, and record the same
   evidence:

   ```bash
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

5. Do not rerun a failed command merely to obtain a green result. Preserve the first
   failure output, diagnose it without changing files, and continue only when later gates
   do not depend on the failed gate.
6. Treat a dirty tracked tree after a gate as a failure. List untracked files separately;
   do not delete them.
7. End with `GO` only if every required command exits zero, the exact SHA matches, and no
   tracked file changed. Otherwise end with `NO-GO` and identify the first causal failure.

Return the report in the Cloud Agent conversation. Do not create a repository report file.
