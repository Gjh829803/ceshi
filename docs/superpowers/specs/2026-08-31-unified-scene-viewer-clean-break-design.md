# Unified Scene Viewer Clean-Break Design

## 1. Decision

The repository has one developer-facing scene runtime: `apps/playground`.
It displays already-built worlds, lets a user switch among a small curated set,
and supplies the shared G Bot movement, Action, Camera, and traversal-tuning
surface. It does not author scene geometry and it does not scan generation
workspaces.

`artifacts/scenes` remains a pipeline-owned output root. It is not an
application, a scene catalog, or a public asset root. A scene becomes visible
in the Viewer only through an explicit, validated promotion into the stable
Scene Catalog.

The accepted tree contains no legacy/new compatibility layer. The old
`OutdoorSceneDefinition` catalog, the independent product-facing Native Scene
Playground, duplicate root developer scripts, and their old routes are deleted
or migrated in the same change.

## 2. Product outcome

Running `pnpm dev` opens one page with:

- a scene selector containing only maintained tuning presets;
- G Bot as the default controlled Subject;
- the existing Subject, Motion, Control Feel, Action, and Camera workbench;
- reset, capture, Runtime Snapshot, and traversal diagnostics;
- one Runtime/Browser contract regardless of the selected Scene Source.

The initial catalog contains exactly three purposes, not showcase scenes:

1. `feel-flat`: unobstructed acceleration, deceleration, turning, jump, and
   Camera tuning;
2. `traversal-course`: slopes, steps, narrow passages, ledges, and blockers;
3. `action-lab`: the maintained local Action closure and interaction targets.

Names are purpose-based so visual reconstruction cases never become permanent
product presets merely because they were generated once.

## 3. Source model

Each catalog entry selects exactly one existing Runtime Scene Source:

```ts
export type SceneCatalogEntryV1 =
  | {
      readonly id: string;
      readonly title: string;
      readonly purpose: "feel" | "traversal" | "action";
      readonly source: {
        readonly kind: "canonical-authoring";
        readonly authoringSpecPath: string;
      };
      readonly defaultSubjectDefinitionRef:
        "worldkit://subject-definition/humanoid.g-bot@2";
    }
  | {
      readonly id: string;
      readonly title: string;
      readonly purpose: "feel" | "traversal" | "action";
      readonly source: {
        readonly kind: "babylon-native-package";
        readonly worldPackageRef: string;
      };
      readonly defaultSubjectDefinitionRef:
        "worldkit://subject-definition/humanoid.g-bot@2";
    };
```

The catalog never references raw files under `artifacts/scenes`. Canonical
entries reference immutable promoted AuthoringSpec JSON. Native entries
reference a verified WorldPackage, never a TypeScript source path or arbitrary
Browser-loaded code. The Native variant is admitted to the public catalog only
after the BNA Trusted Local gates required by ADR-0007 pass; until then the
Native implementation remains a verification harness, not a Viewer entry.

## 4. Directory ownership

```text
apps/playground/                  one Viewer UI and Browser Runtime
packages/scene-catalog/           catalog schema, validator, loader, manifest
scenes/presets/<scene-id>/        promoted stable scene inputs
artifacts/scenes/<case-id>/       replaceable pipeline outputs and receipts
scripts/scenes/promote-preset.ts  sole artifacts -> preset promotion owner
```

For a Canonical preset, `scenes/presets/<id>/world.json` is the sole runtime
source. Public planning images are optional catalog metadata, not a second
world definition. Formal workflow receipts stay under `artifacts/scenes` and
are never shipped to the Viewer.

Test-only Native and receipt corpora move beside their owning verifier under a
`fixtures/` directory. No production verification test depends on a historical
user case under `artifacts/scenes`.

## 5. One bootstrap and one route

The Viewer uses one startup endpoint and one URL parameter:

```text
GET /__worldkit/viewer-bootstrap?scene=<scene-id>
```

The response is a closed union containing catalog metadata plus either a
Canonical AuthoringSpec bootstrap or an already-verified Native WorldPackage
bootstrap. It never returns filesystem paths.

The page route is `/?scene=<scene-id>`. The default is `feel-flat`. The old
`?authoring=1`, `?artifact=1`, catalog-gameplay route, and product-facing
Native Playground route do not survive as alternate public entry modes.
Trusted capture and Studio preview call the same bootstrap contract with a
Host-selected Scene identity; they do not select another frontend.

## 6. Responsibility boundary

Scene reconstruction owns Scene Source bytes, static geometry, Spawn intent,
visuals, and declared static traversal surfaces. It cannot own Subject Motion,
Input, Camera, Gameplay state, or physics bodies.

Product tuning owns G Bot Subject Definition selection and the existing
Control Feel, Motion, Action, and Camera profiles. A tuning draft can replace
the selected Subject closure for the running session without rewriting the
scene source. Exported tuning candidates remain profile artifacts, not scene
geometry changes.

The Viewer consumes both responsibilities and owns neither.

## 7. Deletion and migration policy

Delete from the accepted tree:

- the old `apps/playground/src/scenes` OutdoorScene catalog and its `?scene=`
  compiler bridge after the three presets are represented by stable JSON;
- Azure Bay, Canyon showcase form, Mistbound Rider, Sunlit Flower Bay,
  `world-08170639-54db`, and their registered/public duplicate assets;
- tracked historical cases under `artifacts/scenes` after any still-required
  verifier evidence is moved to owner-local fixtures;
- root aliases `dev:g-bot`, `dev:g-bot:refresh`, `dev:catalog`,
  `dev:native-scene`, `dev:alpha-local-actions`, and its refresh alias;
- the independent Native Playground as a public app after its Host/provider
  code is migrated to the owning package/test harness;
- documentation and tests that describe removed routes or directories as
  current product entry points.

Do not retain redirects, deprecated exports, fallback route parsing, or old
script aliases.

## 8. Work graph

| ID | Goal and deliverable | depends_on | blocks | Exclusive ownership | Input / output contract | Verification | Mode |
|---|---|---|---|---|---|---|---|
| USV-1 | Freeze `SceneCatalogEntryV1` and Viewer Bootstrap V1 | none | USV-2, USV-3 | `packages/scene-catalog`, bootstrap types | manifest bytes -> validated closed catalog/bootstrap | schema and adversarial parser tests | main-agent-only |
| USV-2 | Promote three purpose-built Canonical presets | USV-1 | USV-3, USV-4 | `scenes/presets`, promotion command | accepted AuthoringSpec -> immutable preset | validate/build/load each preset | sequential |
| USV-3 | Make `apps/playground` the sole Viewer with selector and G Bot tuning | USV-1, USV-2 | USV-4, USV-5 | Playground route, startup, UI | Viewer Bootstrap -> one Runtime session | real-browser switch/reset/tuning tests | sequential |
| USV-4 | Migrate Studio, capture, and trusted `worldkit run` to Viewer Bootstrap | USV-3 | USV-5 | Studio proxy, CLI server, capture launch | Host-selected source -> same bootstrap | CLI, Studio, capture integration tests | sequential |
| USV-5 | Remove old catalog, public assets, scripts, tracked cases, and Native public app | USV-3, USV-4 | USV-6 | legacy paths and references | no legacy inputs; deleted outputs | repository census and negative searches | main-agent-only |
| USV-6 | Full integration and main merge | USV-5 | none | final tree and Git integration | exact clean tree -> main | typecheck, root test, Studio test, builds, Browser smoke | main-agent-only |

## 9. Acceptance gates

- `pnpm dev` prints and serves exactly one Viewer URL.
- The initial page shows G Bot in `feel-flat`, never the red capsule.
- Switching among all three entries creates one fresh Runtime session and
  keeps the tuning workbench available.
- Unknown, inherited, malformed, or unpromoted scene IDs fail closed.
- No root `dev:*` product alias remains.
- No production source imports the deleted OutdoorScene catalog.
- No current test or verifier consumes a tracked historical user case from
  `artifacts/scenes`.
- `apps/native-scene-playground` is absent from the final accepted tree; any
  retained Native test harness is package-owned and has no root dev command.
- Repository typecheck, root tests, Studio tests, production builds, and a
  rendered Browser switch/reset smoke all pass on the exact merged tree.
