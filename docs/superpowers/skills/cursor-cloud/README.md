# Cursor Cloud test and review templates

These are optional templates for an explicitly requested remote verification or
independent review. They do not start work by themselves. Use the installed
`working-with-cursor-cloud` skill for current CLI/handoff mechanics and verify
that the target branch is pushed before dispatch.

- [Three integration checks](full-gates-prompt.md): verify the requested exact SHA
  and report the Three closure, without calling it whole-repository CI.
- [Read-only review](read-only-review-prompt.md): source-backed findings against an
  exact base/head, using current Three responsibilities.

Replace every placeholder before sending a task. Testing and independent review
are separate evidence; neither replaces visual/manual acceptance or deployment.
Cloud results must prove the requested SHA and report environment failures apart
from repository failures. Preserve unrelated changes and historical artifacts.
