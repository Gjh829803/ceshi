# Three documentation cleanup plan

> **Execution:** The user authorized documentation cleanup in the current branch.
> Execute inline; package and runtime removal is a separate later task.

**Goal:** Make Three SDK, Creator v0.2 and the independent Episode pipeline the
single current documentation direction.

**Architecture:** Consolidate present design in `docs/three-sdk-architecture.md`,
keep production details in the branch guide and component READMEs, remove
superseded design documents, and retain source-bound production evidence.

**Spec:** [Current branch boundaries](../../three-sdk-data-production.md).

## Constraints

- No package source, dependencies, executable scripts, prompts, skill behavior,
  runtime artifacts, provider journals, review stores or running jobs are changed.
- Creator retains v0.2 real self-check recording. Episode requires
  `--stop-before-seedance` and retains six independent 30-second recordings.
- Historical documents never authorize a new production run or declare deployment.
- The old route census directly stats `docs/17-canonical-json-quickstart.md`;
  retain that path as a migration notice until its code consumer is removed.

## Tasks

- [x] Add the current architecture guide; update root/docs and component indexes.
- [x] Remove superseded numbered guides, ADRs, old workflow/design/plan documents,
  duplicate design-only API declarations and obsolete architecture reviews.
- [x] Update runtime review guidance for Three/Rapier and label retained evidence.
  Point references to deleted historical material at the pre-cleanup Git snapshot.
- [x] Check Markdown links and removal consumers; verify guide-topic extraction,
  whitespace and change scope. Record precise results without a full CI claim.

## Execution result

- Removed 239 historical documentation files, including the design-only API
  sketches; current package/runtime source and dependency declarations are unchanged.
- Added the current architecture guide and documentation/evidence indexes;
  updated review rules, component navigation and historical scope notices.
- Verified 123 local Markdown links with zero missing targets and six historical
  Git links against their exact pre-cleanup objects. No new broken links.
- `git diff --check`: passed. Scope check: no runtime, dependency, prompt, skill,
  frozen evaluation input, asset, journal or production-data changes.
- `pnpm exec vitest run scripts/three-creator/authoring-schema.test.ts`: two passed,
  one failed. The failed example typecheck reports missing `three` declarations;
  `require.resolve` confirms both `three` and `@types/three/package.json` are absent
  from the current environment. Its example, schema, contracts and test sources
  are unchanged. The guide-topic test passed. No dependency install was performed.
- No full CI, build, browser replay, cloud submission or deployment was run.

Old Babylon/Havok dependencies still belong to retained legacy packages. Their
removal, the old Site implementation, old executable skills/prompts and the route
census's remaining document path are separate code-cleanup work.
