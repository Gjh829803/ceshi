---
name: orchestrating-subagents
description: Use when the user explicitly requests subagents, parallel agents, delegation, or multi-agent task scheduling.
---

# Orchestrating Subagents

## Overview

Coordinate independent work while retaining architecture and integration.

**Core principle:** maximize useful parallelism, not agent count.

## Explicit Invocation Only

This skill is opt-in. Activate it only when the current user explicitly requests subagents, parallel agents, delegation, or multi-agent task scheduling. Do not infer authorization from task complexity, task count, available concurrency, a standing project recommendation, or the possibility of an independent review.

Without that explicit request, keep decomposition and execution in the main agent and do not dispatch subagents.

## Decision Gate

Do not use for simple or bounded work; phases of one small change are not independent workstreams.

Use subagents only when:

- the task is complex and each workstream merits separate context;
- delegation and subagent tools are available;
- at least two ready workstreams are independent;
- each has clear ownership and completion checks; and
- expected time savings exceed coordination costs.

Otherwise, continue directly.

## Direct-Execution Gate

Before every implementation dispatch, check the ready DAG rather than the total task count.

The main agent must execute directly when all of these conditions describe the next work:

- only one mutation workstream is ready, or ready tasks share files/interfaces and must run sequentially;
- the worker would edit the same worktree and use the same test processes, ports, caches, or native resources;
- the main agent has no separate, useful work it can complete while the worker runs; and
- delegation would provide only context isolation or another reporting layer, not concrete wall-clock savings.

Do not turn a sequential implementation plan into a one-worker-at-a-time subagent loop. In that shape, dispatch, handoff, review-package, waiting, and recovery are additional critical-path work. The main agent implements and verifies the tasks directly, then may request an independent read-only review at a meaningful checkpoint.

Long or exclusive verification strengthens the direct-execution decision. A worker that launches Browser, server, Havok/Recast, build, or full-suite processes prevents the main agent from safely running competing verification. The process owner must finish or terminate those exact processes before another lane starts; interruption is not proof that child processes stopped.

Context isolation and review independence can improve quality, but neither alone satisfies this skill's parallelism gate.

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

If `safe ready workstreams < 2`, set `worker_limit = 0` and continue in the main agent. A future DAG transition may make delegation useful; reassess then instead of committing to subagents for the whole plan.

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
- Dispatching one implementer per sequential task while the main agent waits.
- Counting context isolation or an extra task report as wall-clock savings.
- Interrupting a worker and starting new verification without checking its child processes.
- Confusing isolated context with isolated state.
- Treating successful reports as integrated proof.
