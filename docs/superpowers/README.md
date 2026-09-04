# Superpowers documentation

This directory stores durable Superpowers output; it is not a mandatory reading set
for every task:

- `specs/` contains reviewed technical designs. Read the relevant section when the
  active task changes that design boundary or when `AGENTS.md` points to it.
- `plans/` contains implementation plans and historical execution intent. A plan is
  not current implementation or verification evidence.
- `skills/` contains reusable project-specific workflow guidance. Load a Skill only
  when the task matches its trigger.

Do not browse all specifications to discover work. Start from the affected symbol or
contract, use `rg` to locate the owning document and heading, and check the current
backlog/code before treating an older design as live authority.

Cross-lane scene-authoring design reference:

- [`specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`](specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md)
  defines the long-term Canonical JSON + Babylon Native Scene + shared SDK Runtime boundary.

Root `.superpowers/` paths are reserved for execution state such as SDD ledgers and
brainstorming sessions. They are not a parallel source of durable project truth.
