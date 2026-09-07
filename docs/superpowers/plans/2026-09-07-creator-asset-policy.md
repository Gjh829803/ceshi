# Creator asset policy implementation plan

**Goal:** One Host policy controls task-visible assets, the default humanoid,
asset admission and delivery/Episode validation. Defaults exclude G Bot, retain
other assets and allow custom assets. No preset-only character rule.

**Approved design:** Preserve existing environment/schema/search/example entry
points. AI-owned `project.json` selects assets but cannot grant permissions. Freeze
policy per task and bind it to delivered bytes; do not change existing jobs or
apply new policy retroactively to historical deliveries.

## Boundaries and ownership

- Root owns shared policy format/helpers, config, Creator compiler/tools/CLI,
  examples, documentation, tests and integration. No SDK runtime changes.
- Cloud lane owns policy freeze/transport/restart and capsule packaging with
  mocked contracts only. No deployments or real production requests.
- Episode lane owns carried policy verification at source import/load, preserving
  explicit compatibility for historical policy-less deliveries.
- Snapshots contain allowed public definitions and exclusive denied resource
  hashes; shared dependencies remain allowed. No secrets/private Host paths.
- Ordinary geometry is permitted. Exact forbidden bytes can be recognized after
  renaming; arbitrary modified/re-encoded/inlined model code cannot be provenance
  certified with custom assets and unrestricted scene code. No sandbox claim.

## Work

- [x] Failing tests: discovery, examples, denied IDs/renamed bytes, custom assets,
  snapshot drift, overrides and reserved output files.
- [x] Strict policy validation and frozen snapshot; bind candidate/delivery hash,
  check source files and selected dependencies before compile and after packaging.
- [x] Cloud Host-owned pinned policy snapshot transport and restart verification.
- [x] Episode carried policy verification with explicit legacy compatibility.
- [x] Focused/aggregate Three tests, cloud contracts, typecheck, census, prebuild,
  local browser checks and independent review.

## Shared contract

`scripts/three-creator/asset-policy.mjs` and `.d.mts` own JSON policy logic.
`AssetPolicy`: `{schemaVersion:1,allowedAssetIds:string[],defaultHumanoidAssetId:string,allowCustomAssets:boolean}`.
`AssetPolicySnapshot`: `{kind:'three-creator-asset-policy-snapshot',schemaVersion:1,policy:AssetPolicy,allowedAssets:publicCatalogEntry[],deniedResourceSha256:string[]}`.
`createAssetPolicySnapshot(policy,catalog)` validates and builds a snapshot.
`validateAssetPolicySnapshot(snapshot)` validates and returns a detached copy.
`assetPolicyHash(snapshot)` returns canonical JSON SHA-256 hex without prefix.
`verifyAssetPolicyBundle({snapshot,expectedHash,sourceFiles,playableFiles,assetDefinitions})`
checks in-memory `Record<string,Uint8Array>` file maps and selected public assets.
Host entry options: `{assetPolicySnapshotPath?:string,assetPolicySha256?:string}`;
path/hash must be paired. Defaults freeze repository config/catalog in process;
cloud supplies an explicit pinned snapshot/hash for MCP process restarts.
Delivered snapshot: `playable/asset-policy.json`; delivery manifest field:
`assetPolicySha256`. Missing both means legacy; missing one is an error. The
snapshot is covered by the existing closed file inventory.

## Completed evidence

- Final Three/Creator/Episode plus gate tests: 43 files, 526 tests passed.
- Relevant cloud coordinator, transport, host and capsule contracts: 51 tests
  passed with local mocks; no provider requests.
- Typecheck, test census (47 files), runtime prebuild and diff checks passed.
- Actual stdio Creator MCP with a Host-pinned snapshot: 22 allowed assets,
  default preset; G Bot absent in search/exact descriptions; normal compile and
  browser opening succeeded; denied ID and renamed original bytes rejected;
  restoring the project succeeded. Artifacts remain under ignored
  `.codex-tmp/asset-policy/live-mcp/`.
- Actual Episode MCP/browser tests passed for absolute and relocated bundles.
  Mocked completed evidence separately tested submit serialization/archive hash
  propagation; it is not an actual 180-second production self-check recording.
- Independent review found and reproduced JSX literal-data scanning and default
  override guidance issues. Both were fixed with regressions and re-reviewed;
  no remaining confirmed findings.
- No production release, old-job input rewrite or existing-world migration.
  Local sessions freeze at service start; cloud restarts use the original Host
  pin. Runtime-only Episode derivation does not read today's asset policy.
