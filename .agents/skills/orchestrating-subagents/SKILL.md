---
name: orchestrating-subagents
description: Use when designing or executing a complex software-development task with multiple substantial, materially independent workstreams whose parallel execution is expected to materially reduce wall-clock time.
---

# Orchestrating Subagents

## Overview

Coordinate independent work while retaining architecture and integration.

**Core principle:** maximize useful parallelism, not agent count.

## Decision Gate

Do not use for simple or bounded work; phases of one small change are not independent workstreams.

Use subagents only when:

- the task is complex and each workstream merits separate context;
- delegation and subagent tools are available;
- at least two ready workstreams are independent;
- each has clear ownership and completion checks; and
- expected time savings exceed coordination costs.

Otherwise, continue directly.

## Design-stage Handoff

For qualifying tasks, design first produces this dependency-aware graph:

| Field | Required content |
|---|---|
| `id`, goal, deliverable | Independently verifiable outcome |
| `depends_on`, blocks | Dependency DAG and ready state |
| ownership | Files, interfaces, and shared resources |
| contract, integration | Stable inputs, outputs, and integration point |
| verification, mode | Completion check plus `parallel-safe`, `sequential`, or `main-agent-only` |

Keep cross-cutting interfaces main-agent-owned until stable. Do not distort architecture to create agent work.

## Workflow

1. Consume the handoff or build a dependency graph; identify ready work.
2. Map ownership and shared resources.
3. Set `worker_limit = min(runtime worker capacity after main-agent accounting, safe ready workstreams)`.
4. Dispatch tasks with the contract below.
5. Validate results, update dependencies, and backfill newly ready work.
6. Integrate and run end-to-end verification.

Never hard-code a worker count. Idle capacity warrants reassessment, not invented work.

## Model and Thinking Inheritance

Default: omit `model` and `reasoning_effort`; all subagents, including nested subagents, inherit the main conversation's model and thinking level. Override only when explicitly required by the user or applicable project/skill instructions—not for role, cost, or speed.

## Parallelism and Ownership

Assume files and processes are shared unless runtime guarantees isolation. Context isolation is not state isolation.

Parallel mutation requires exclusive ownership of files, interfaces, and resources. Check branches, outputs, ports, databases, caches, coverage, and temporary paths. If verification collides, isolate or serialize it.

Do not parallelize work that changes the same files or tightly coupled API, depends on an unresolved decision, or would duplicate effort. Read-only exploration can usually run more broadly, but external resources may still collide.

## Delegation Contract

Every delegated task states:

- **Scope and goal:** domain and outcome.
- **Context:** working directory and necessary context.
- **Ownership:** allowed files, interfaces, mutations, and resources.
- **Completion:** required tests or evidence.
- **Return:** findings, changes, verification, and concerns.

Avoid prompts such as "investigate this" or "fix the project."

## Main Agent Responsibilities

- Own architecture, dependencies, cross-cutting interfaces, and critical-path work.
- Review actual changes, reconcile assumptions, integrate, and verify.

## Common Mistakes

- Treating task phases as workstreams or fixed worker counts as portable.
- Confusing isolated context with isolated state.
- Treating successful reports as integrated proof.
