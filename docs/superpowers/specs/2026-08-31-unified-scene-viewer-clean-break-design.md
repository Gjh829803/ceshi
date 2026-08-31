# WRC-Aligned Unified Scene Viewer Design

**Status:** reviewed supporting developer-tool design; not a WRC-1 authority

**WRC authority:** `docs/superpowers/specs/2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md`

**Live status authority:** `docs/18-refactor-progress-and-backlog.md`

## 1. Decision and authority

`apps/playground` is the one developer-facing Scene Viewer. It displays an existing world, selects a
small curated set of product-tuning presets, and exposes the existing G Bot movement, Action, Camera
and traversal workbench. It does not author geometry or own Gameplay state.

This design is downstream of WRC-1. It adds no Runtime, Scene Source, WorldPackage format, Compiler,
WorldKit Browser protocol, Gameplay owner, production admission path or WRC work package. It consumes
Canonical AuthoringSpec through the existing RuntimeHost/Babylon/Havok kernel. A future Native Viewer
source requires a separate current-only contract change after the applicable BNA disposition; no
Native member exists in the current Viewer Catalog or bootstrap contract.

## 2. Product outcome

`pnpm dev` opens the Viewer with `feel-flat`. The actual controlled Subject in each curated
AuthoringSpec is `worldkit://subject-definition/humanoid.g-bot@2`; the Catalog does not duplicate this
fact. A selector exposes three maintained presets:

1. `feel-flat`: acceleration, braking, turning, current jump/land presentation and Camera tuning;
2. `traversal-course`: measurable slope, step, corridor, ledge and blocker stations;
3. `action-lab`: only currently admitted G Bot actions and presentation transitions.

These presets are not WRC acceptance cases. WRC-1's mountain/T-space,
stairs/building/limited-interior and interactive reconstruction cases keep their own identities and
evidence.

## 3. Current Catalog contract

The Catalog is internal development metadata, not a Scene Source or public Runtime protocol:

```ts
type SceneCatalogEntryV1 = Readonly<{
  id: string;
  title: string;
  purpose: "feel" | "traversal" | "action";
  source: Readonly<{
    kind: "canonical-authoring";
    authoringSpecPath: string;
  }>;
}>;
```

The Host parses each source through authoritative `parseAuthoringSpecV4`, requires
`authoringSpec.id === entry.id`, resolves `startup.controlledEntityId`, and requires that controlled
Subject to bind `humanoid.g-bot@2` before publishing a curated bootstrap. UI metadata is derived only
after this validation. `worldkit run <world.json>`, Studio and trusted Capture may open a Host-selected
temporary Canonical source in the same Viewer without adding it to the Catalog.

## 4. Directory ownership

```text
apps/playground/                  one Viewer UI; no Runtime authority
packages/scene-catalog/           internal Canonical preset metadata validation
scenes/presets/<scene-id>/        stable product-tuning AuthoringSpec inputs
artifacts/scenes/<case-id>/       WRC pipeline outputs, receipts and active evidence
scripts/scenes/promote-preset.ts  sole curated-preset publication owner
```

`artifacts/scenes` is not another application, but remains an active WRC evidence root. Capture,
Receipt, reconstruction scoring and acceptance-corpus material stay with their current owners.

## 5. One Viewer shell and atomic route cutover

There is one app shell and one app-owned internal bootstrap DTO. It is not part of WorldKit Browser
Protocol V5. The Host chooses exactly one Canonical source from one of three contexts:

- `pnpm dev`: `?scene=<preset-id>` selects an allowlisted curated preset; empty search selects
  `feel-flat`;
- `worldkit run <world.json>`: the Host fixes one validated source; Browser query cannot replace it;
- Studio: the Studio Host fixes one attempt-bound validated source.

The route cutover is atomic across Playground, CLI and Studio consumers. The accepted merge candidate
does not retain `?authoring=1` or `catalog-gameplay` as alternate source-selection authorities. The
existing trusted artifact renderer/capture capability is a separate internal evidence tool and is not
renamed into a second product Viewer; any later migration of that owner requires its own WRC-approved
plan.

## 6. Runtime responsibility boundary

Scene reconstruction owns source bytes, static geometry, Spawn intent, visuals and declared static
traversal surfaces. Runtime owners keep normalized Input, CharacterMovement, Gameplay state, Action,
Camera, Havok bodies, fixed Tick, Snapshot, Hash, Reset, Replay and Rollback. The Viewer composes UI
and invokes existing owners only.

## 7. Incremental integration and deletion policy

- **USV-0 — validated inputs:** land the Canonical-only Catalog contract, three runnable G Bot presets
  and publication validation. This is independently useful through existing `worldkit run` and adds
  no new route.
- **USV-1 — atomic Viewer cutover:** update Playground, CLI and Studio source selection together,
  delete the replaced public route owner, and make `pnpm dev` the curated entry.
- **USV-2 — proven-obsolete cleanup:** after exact census and WRC/BNA owner sign-off, remove only
  obsolete showcase/UI paths. It never deletes active WRC evidence or Native verification Harnesses.

A path is eligible for USV-2 deletion only when production/test references are zero, it is not active
WRC evidence, identity-bound fixtures were migrated by their owner, BNA evidence is preserved, and
affected owner gates pass. No redirect, alias, fallback parser or dual route survives a completed
migration.

## 8. Work graph

| ID | Goal / deliverable | depends_on | blocks | Exclusive ownership | Stable input -> output / integration | Evidence | Mode |
|---|---|---|---|---|---|---|---|
| USV-0A | Canonical-only Catalog parser | none | USV-0B, USV-1 | `packages/scene-catalog` | manifest bytes -> frozen internal metadata; no Runtime protocol | adversarial parser/census/typecheck | main-agent-only |
| USV-0B | Three G Bot tuning presets and publisher | USV-0A | USV-1 | `scenes/presets`, promotion command | V4 source -> durable preset then catalog publication | validate/build/headless load | sequential |
| USV-1A | App-owned Host projection | USV-0B | USV-1B | focused Viewer Host module | validated fixed/catalog/Studio source -> one bootstrap DTO | source/identity/method/path tests | sequential |
| USV-1B | Atomic Playground/CLI/Studio cutover | USV-1A | USV-2 | route owner and exact consumers | one Host bootstrap -> existing RuntimeHost session | owner tests, Browser switch/reset/tuning | main-agent-only |
| USV-2 | Delete only proven-obsolete entries | USV-1B plus WRC/BNA sign-off | none | confirmed legacy paths only | zero consumers -> deletion | census and affected owner gates | separate checkpoint, main-agent-only |

## 9. Acceptance

- `pnpm dev` loads `feel-flat` through one Viewer shell.
- Authoritative AuthoringSpec validation proves the controlled Subject is G Bot; no duplicate Catalog
  field can disagree.
- All three presets create fresh existing RuntimeHost sessions and retain tuning controls.
- Unknown, malformed, unpromoted or Browser-substituted fixed sources fail closed.
- Playground, CLI and Studio have no replaced `authoring/catalog-gameplay` source-selection path.
- WRC active corpus, Capture, Receipt and reconstruction evidence remain unchanged.
- Native Viewer is not claimed or represented by the current contract.
- Focused tests, frozen install, census, typecheck, affected owner tests, build and rendered/manual
  Viewer checks pass on the exact candidate tree.
