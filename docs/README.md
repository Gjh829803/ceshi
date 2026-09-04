# Documentation

- Do not scan this directory as a task-startup step. Begin with the user request,
  `AGENTS.md`, and the affected code; search for a document only when a contract or
  decision needs clarification.
- Numbered Markdown files describe product areas, architecture, and workflows. Read
  only the file for the area being changed. `18-refactor-progress-and-backlog.md` is
  the roadmap/status authority, not a general implementation prerequisite.
- `decisions/` contains project-wide architecture decisions. Use the decision that
  owns the affected boundary.
- `reviews/` contains source-backed findings and completion evidence for the exact
  tree state they reviewed. A review is not proof of the current tree and is not a
  default implementation authority.
- `assets/` contains documentation-only media and is never required reading.

Superpowers-produced specifications, plans, and reusable project guidance live under
`superpowers/`. The root `.superpowers/` directory is reserved for tool workflow state,
not durable documentation.

Within `superpowers/`, specifications record accepted design decisions, plans record
implementation intent, and skills define task-specific procedures. Plans and older
specifications may be superseded; use current code, explicit status documents, and
the authority named by the active task to resolve conflicts. Search by the exact
contract or symbol and read the relevant section instead of opening every match.
