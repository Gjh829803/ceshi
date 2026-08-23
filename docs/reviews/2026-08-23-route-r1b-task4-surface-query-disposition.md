# Route R1b Task 4 Surface Query Disposition

## Scope and status

- Scope: R1b Task 4 shared canonical Surface query and overlap preflight only.
- Baseline reviewed: PR #24 snapshot `a0c6dc418763986af093937471da34d60e8bcf5e`.
- Status: **accepted for continued R1b integration**. This does not mark R1b or M5 complete.
- Provider-specific handles, tags, native paths, and implementation names remain outside Canonical Schema, CLI, Browser, Report, and Snapshot contracts.

## Confirmed review findings and dispositions

| Finding | Disposition | Evidence |
| --- | --- | --- |
| Finite input coordinates could overflow derived triangle math and publish non-finite resolved evidence. | Fixed. Public query and preflight now fail closed with `TRAVERSAL_SURFACE_QUERY_INPUT_INVALID`; derived edges, normals, areas, intersections, barycentric values, heights, and distances are checked. | Focused overflow regressions in `packages/terrain-surface/src/traversal-surface-query.test.ts`. |
| Preflight performed a full Cartesian scan before its pair budget could help disjoint geometry. | Fixed. A deterministic package-private XZ broadphase prunes disjoint candidates while preserving ascending canonical second-triangle ordinal and counting before normal admission/classification. | Disjoint-heavy benchmark below and ordering/reversal tests. |
| Large triangle inventories could exceed the JavaScript argument limit while building index bounds. | Fixed. Bounds, center extents, and minimum ordinal use iterative accumulation; a 130,000-entry regression is covered. | Focused large-index test. |
| Seam coverage did not explicitly prove flat-to-ramp, ridge, and legal 0.25m step behavior. | Fixed. These remain boundary-only/clear and retain deterministic owner ordering. | Focused seam regressions. |

The broadphase helper is intentionally not exported from the package root. Consumers continue to use only `queryCanonicalTraversalSurfaceHitsV1()` and `preflightCanonicalTraversalSurfaceOverlapsV1()`.

## Deterministic benchmark evidence

Commands were run as separate processes so each `maximumResidentSetSizeKiB` value is the peak RSS for that fixture:

```bash
pnpm benchmark:route-r1b-surface-preflight representative
pnpm benchmark:route-r1b-surface-preflight near-budget
pnpm benchmark:route-r1b-surface-preflight disjoint-heavy
```

Environment:

- macOS/Darwin `24.6.0`, x64
- Intel Core i9-9880H @ 2.30 GHz, 16 logical CPUs
- Node.js `v23.11.0`

| Fixture | Sources | Triangles | Broadphase candidates | Result | Wall time | Peak RSS |
| --- | ---: | --- | ---: | --- | ---: | ---: |
| representative | 3 | 2 + 2 + 2 | 4 | `clear` | 2.714 ms | 118,500 KiB |
| near-budget | 2 | 2,000 + 2,001 | 4,002,000 possible; stopped at 4,000,001 | `budget-exceeded` with max 4,000,000 and min required 4,000,001 | 15,348.186 ms | 144,912 KiB |
| disjoint-heavy | 2 | 20,000 + 20,000 | 0 of a 400,000,000 naive Cartesian product | `clear` | 189.595 ms | 186,996 KiB |

Interpretation:

- The representative path is low-millisecond.
- The adversarial near-ceiling case remains deterministically bounded and exits on the first forbidden candidate without materializing candidate pairs. Its roughly 15.35-second result is build-time release-policy evidence, not a per-tick runtime cost.
- The disjoint-heavy case demonstrates the intended asymptotic protection: 400 million naive pair opportunities are rejected by the XZ index without classification.
- The unreleased Profile ceiling remains `4_000_000` for the current R1b integration. Re-measure on supported CI/release hardware before declaring M5 complete; change the Profile value and content hash only if that release environment rejects this disposition.

## Verification

- Terrain Surface plus Heightfield source: 6 files / 78 tests passed.
- Full repository: 146 files / 1,499 tests passed.
- `pnpm typecheck`, `pnpm build`, and `pnpm verify:route-r1-heightfield` passed.
- Canonical, placement-layout, rigged-subject, and G Bot verification gates passed.
- Independent completion review is recorded in the PR #24 fix disposition.

R1b remains open for Tasks 5–10 and the completion matrix.
