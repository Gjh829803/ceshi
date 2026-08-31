# WRC-Aligned Unified Scene Viewer Design

**Status:** supporting developer-tool proposal; not a WRC-1 authority

**WRC authority:** `docs/superpowers/specs/2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md`

**Live status authority:** `docs/18-refactor-progress-and-backlog.md`

## 1. Decision and authority

`apps/playground` becomes the repository's one developer-facing Scene Viewer. It displays an existing
world, selects among a small curated set of tuning presets, and exposes the shared G Bot movement,
Action, Camera and traversal workbench. It does not author geometry or own Gameplay state.

This design is downstream of WRC-1. It introduces no Runtime, Scene Source, WorldPackage format,
Compiler, Browser protocol, Gameplay owner, production admission path or WRC work package. It consumes
Canonical AuthoringSpec or an admitted Native WorldPackage through the existing one
RuntimeHost/Babylon/Havok kernel. If this document conflicts with WRC-1 or a domain authority, this
Viewer design changes.

## 2. Product outcome

`pnpm dev` opens the Viewer with G Bot in `feel-flat`. A selector exposes exactly three maintained
product-tuning presets:

1. `feel-flat`: acceleration, deceleration, turning, jump and Camera tuning;
2. `traversal-course`: slopes, steps, narrow passages, ledges and blockers;
3. `action-lab`: admitted local Action closure and interaction targets.

These are not WRC acceptance cases. WRC-1's mountain/T-space, stairs/building/limited-interior and
interactive reconstruction cases keep their own corpus identities and evidence.

## 3. Source and catalog model

The catalog is internal development-tool metadata, not a third Scene Source or public Runtime
protocol. A catalog entry selects exactly one existing source:

```ts
type SceneCatalogEntryV1 = Readonly<{
  id: string;
  title: string;
  purpose: "feel" | "traversal" | "action";
  source:
    | Readonly<{ kind: "canonical-authoring"; authoringSpecPath: string }>
    | Readonly<{ kind: "babylon-native-package"; worldPackageRef: string }>;
  defaultSubjectDefinitionRef:
    "worldkit://subject-definition/humanoid.g-bot@2";
}>;
```

Canonical presets reference validated stable JSON under `scenes/presets`. Native entries reference a
verified WorldPackage, never a TypeScript path or Browser-loaded source. Native catalog discovery is
disabled until the applicable BNA production/admission disposition permits that exact claim.

`worldkit run <world.json>`, Studio and trusted Capture may open a Host-selected temporary source in
the same Viewer without adding it to the curated catalog.

## 4. Directory ownership

```text
apps/playground/                  one Viewer UI; no Gameplay authority
packages/scene-catalog/           internal development metadata validation
scenes/presets/<scene-id>/        stable product-tuning AuthoringSpec inputs
artifacts/scenes/<case-id>/       WRC pipeline outputs, receipts and active evidence
scripts/scenes/promote-preset.ts  sole curated-preset publication owner
```

`artifacts/scenes` is not another application, but it remains an active WRC evidence root. Capture,
Receipt, reconstruction scoring and acceptance-corpus material stay with their current owner while
required. Formal receipts never become Viewer catalog metadata.

## 5. Viewer transport and responsibility boundary

The Viewer uses one internal Host bootstrap transport and the page route `/?scene=<preset-id>`. The
transport projects catalog metadata and one already selected Canonical or admitted Native source. It
does not expose filesystem paths and does not become a new Browser protocol or Scene Source.

Scene reconstruction owns source bytes, static geometry, Spawn intent, visuals and declared static
traversal surfaces. Runtime owners keep normalized Input, CharacterMovement, Gameplay state, Action,
Camera, Havok bodies, fixed Tick, Snapshot, Hash, Reset, Replay and Rollback. The Viewer only composes
the UI and invokes existing Host/runtime owners.

## 6. Incremental integration

This work follows WRC-1's small-checkpoint rule:

- **Checkpoint A — Viewer and presets:** one Viewer, default G Bot, three Canonical tuning presets.
  It deletes no WRC/BNA corpus, Harness, Studio route, Capture path or verifier fixture.
- **Checkpoint B — Host consumer migration:** Studio, Capture and `worldkit run` use the same Viewer
  shell while retaining their existing authority and evidence contracts.
- **Checkpoint C — proven-obsolete cleanup:** remove old Web entries and cases only after an exact
  reference census and the relevant WRC/BNA owner confirm every current consumer has migrated.

Each checkpoint is independently useful, reviewed and merged to `main` before the next begins. This
is not a long-lived replacement branch.

## 7. Deletion policy

A path is eligible for Checkpoint C deletion only when all of these are true:

- production and test reference census is zero;
- it is not an active WRC acceptance case, Capture, Receipt or reconstruction-score input;
- any identity-bound verifier fixture has moved through its owning generator and integrity checks;
- removing it does not weaken BNA admission, isolation or production-disposition evidence;
- affected owner gates pass on the exact candidate tree.

Eligible targets may include the old OutdoorScene public catalog, obsolete showcase assets, duplicate
root Viewer aliases and the independent Native Web UI. Native provider code and verification Harnesses
must first move to their owning packages. No redirect, alias, fallback parser or dual route survives a
completed migration.

## 8. Work graph

| ID | Deliverable | depends_on | Exclusive owner | Verification | Mode |
|---|---|---|---|---|---|
| USV-A1 | closed internal preset catalog projection | none | `packages/scene-catalog` | adversarial parser tests | main-agent-only |
| USV-A2 | three validated Canonical G Bot presets | USV-A1 | `scenes/presets`, promotion command | validate/build/headless load | sequential |
| USV-A3 | default one-Viewer startup, selector and tuning | USV-A1, USV-A2 | Playground startup/UI | browser switch/reset/tuning | sequential |
| USV-B1 | Studio/Capture/CLI use the same Viewer | USV-A3 | existing Host owners | owner integration gates | separate checkpoint |
| USV-C1 | delete only proven-obsolete entries | USV-B1 plus WRC/BNA owner sign-off | legacy paths only | census plus owner gates | separate checkpoint, main-agent-only |

## 9. Checkpoint A acceptance

- `pnpm dev` serves one Viewer URL and loads `feel-flat`.
- The controlled Subject is `humanoid.g-bot@2`, never the red capsule.
- All three presets switch through fresh existing RuntimeHost sessions and retain the tuning workbench.
- Unknown, inherited, malformed or unpromoted preset IDs fail closed.
- WRC active corpus, Capture, Receipt and reconstruction evidence remain unchanged and available.
- No Native production claim is added.
- Focused tests, typecheck, Playground build and rendered Browser switch/reset smoke pass on the exact
  Checkpoint A tree.
