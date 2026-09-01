# Dependency-aware Handoff

Use this reference when a technical design will feed multi-agent implementation. Keep the graph
small enough to review as a whole. A phase name is not a task unless it owns an independently
verifiable deliverable.

## Task record

Copy one record per task:

```yaml
- id: M8-S1-T1
  goal: One observable outcome
  deliverable: Exact file, interface, artifact, or decision produced
  depends_on: []
  blocks: [M8-S1-T2]
  ownership:
    files: []
    interfaces: []
    resources: [] # ports, databases, caches, devices, generated outputs
  inputs:
    contracts: []
    frozen_at: null # commit, schema version, or decision ID when relevant
  outputs:
    contracts: []
    integration_point: Exact consumer or merge boundary
  verification:
    commands: []
    evidence: Expected observable result
  mode: parallel-safe # parallel-safe | sequential | main-agent-only
  status: pending # pending | ready | running | complete | stale | blocked
```

Use `main-agent-only` for architecture, cross-cutting interfaces, dependency decisions, shared
generated authorities, and final integration until their contracts are stable.

## Ready-state rules

A task is `ready` only when all of these are true:

- every `depends_on` task is complete and its deliverable has been inspected;
- all input contracts are frozen for this task;
- ownership is exclusive or explicitly read-only;
- required processes and shared resources are available; and
- its verification can run without colliding with another active lane.

If fewer than two mutation tasks are ready, keep implementation in the main agent. Read-only work
does not make conflicting mutation safe.

## Invalidation and replanning

When a contract, ownership boundary, generated artifact, base commit, or shared resource changes:

1. identify every task whose declared input includes the changed item;
2. mark its old result and evidence `stale`, including downstream consumers;
3. interrupt work only when continuing would create unusable output;
4. update the graph and recompute the ready set; and
5. repair or redispatch with the new frozen input named explicitly.

A worker's successful report is historical once its input contract is stale.

## Delegation packet

Every worker prompt should contain only the task-specific slice:

```text
Task ID:
Goal and deliverable:
Working directory / base revision:
Allowed ownership:
Prohibited mutations:
Frozen input contracts:
Integration point:
Required verification:
Return: changed files, evidence, assumptions, unresolved concerns
```

The return packet uses the same task ID and reports actual changes, not intended changes.

## Integration evidence matrix

Before final integration, maintain this compact matrix:

| Task | Frozen input | Inspected deliverable | Focused evidence | Integration status |
|---|---|---|---|---|
| `M8-S1-T1` | contract or SHA | files/artifacts | command and result | accepted/stale |

Run shared end-to-end gates only after all required rows are accepted on the final candidate.

## Combining Codex subagents with Cursor Cloud

Use the two systems as separate layers:

- Codex subagents implement or investigate ready DAG tasks under exclusive ownership.
- The main agent owns architecture, integration, conflict reconciliation, and the final candidate.
- Cursor Cloud Agents run read-only gates or independent reviews against a clean pushed exact SHA.
- Keep one durable Cursor Agent per role and reuse it for repaired-SHA follow-ups; a reused role is
  remediation verification, not a new independent reviewer.

Do not let a Codex worker and Cursor reviewer mutate the same authority. Cursor evidence becomes
historical when the exact SHA or any reviewed input changes.
