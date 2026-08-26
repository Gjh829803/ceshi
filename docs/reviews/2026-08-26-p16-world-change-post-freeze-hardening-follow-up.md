# P1.6 WorldChangeSet Post-freeze Hardening Follow-up

## 1. Scope

- Date: 2026-08-26
- Base: `main@e4da05e0a6b5d42b6fb23417616ae50cbfa8b287`
- Authority under review: `docs/superpowers/specs/2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md`
- Historical amendment: [`P1.6 WorldChangeSet Publication Hardening 历史增补记录`](../superpowers/specs/2026-08-26-p16-world-change-publication-hardening-amendment.md)
- Change class: design-only public-contract hardening; implementation remains not started

This follow-up reviews the already-hardened P1.6 design for remaining type/transition mismatches. All dispositions have since been consolidated into the core specification; the linked amendment is historical and non-normative. This work does not add Runtime Spawn, Terrain Hot Apply, a new Browser key, or any production claim.

## 2. Confirmed findings and disposition

### P16-HF1 — Runtime publication could bypass the approved Dry Run candidate

The prose requires an active Runtime edit to retain and approve a Dry Run candidate before `publish-runtime`, but the `WorldChangeApplyRequestV1` branch still declared `preparedCandidateRef` optional. That allowed a conforming implementation to rebuild and publish directly during Apply, bypassing the exact candidate that was reviewed.

Disposition: the `publish-runtime` branch now requires `preparedCandidateRef`; only `authoring-only` Apply may omit it and perform a fresh full build. An expired or stale publication candidate requires a new Dry Run and a new Apply request ID.

### P16-HF2 — Candidate expiry could race an in-flight Apply

The design allowed Candidate GC after lease expiry but did not freeze the ownership transition when Apply begins. A candidate could therefore expire while Runtime preparation still consumes it, or an implementation could extend the lease implicitly and produce non-reproducible behavior.

Disposition: Apply admission atomically pins the candidate lease to the durable Request ID before reading Candidate bytes. A pinned candidate is excluded from expiry/GC until that request reaches a terminal Receipt or recovery cleanup. Failed pin uses the existing expired/stale diagnostics; the Host never silently extends or reconstructs the same ref.

### P16-HF3 — Authorization revocation had a commit-time TOCTOU gap

The Candidate binding included a secret-free policy hash, but the Full Reload commit flow rechecked revision/runtime/activity identities without explicitly rechecking that the Edit Session was still active and authorized. A long-running Apply could therefore pass admission and commit after expiry, revocation, or policy replacement.

Disposition: Apply rechecks active Session, World binding, required Scope, authorization epoch and policy hash at admission and immediately before the durable commit point. Pre-commit drift returns `WORLD_CHANGE_AUTHORIZATION_STALE`, releases prepared resources, and preserves the old world. A durable committed Receipt is never reversed by later revocation.

### P16-HF4 — Rejected Apply Receipt did not preserve request intent

`WorldChangeRejectedReceiptV1` exposed `mode: "apply"` but omitted `requestedOutcome`, forcing audit and Explain clients to recover the original request to distinguish an authoring-only failure from a Runtime publication failure.

Disposition: Rejected Receipt is now a closed mode-specific union. Apply rejection carries `requestedOutcome`; all rejection branches carry `publicationMode: "none"`.

## 3. Verification expectations added to the specification

The implementation gates now require:

- parser rejection when `publish-runtime` omits `preparedCandidateRef`;
- a deterministic candidate pin-versus-expiry/GC race fixture;
- Session expiry, explicit revocation, Scope removal and policy-hash drift before commit;
- proof that post-commit revocation cannot rewrite a committed Receipt;
- round-trip tests for mode-specific Rejected Receipt branches and `requestedOutcome`.

## 4. Conclusion

All four findings are design-contract inconsistencies rather than new feature scope. Their resolution keeps one Canonical WorldChangeSet/Receipt protocol, preserves the Full Reload-first strategy, and removes implementation latitude at the highest-risk approval, lifetime and authorization boundaries. The dispositions are now folded into the core specification, which is the single P16-D0 implementation authority; this follow-up remains review evidence only.
