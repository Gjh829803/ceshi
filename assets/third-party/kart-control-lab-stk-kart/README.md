# Kart Control Lab STK kart source archive

This directory preserves the source-side evidence selected from
`stk-kart-control-handoff-v1.zip` (ZIP SHA-256
`48130791e3b25af726654058d60fce743b9c40720f43e168bb2259dfe5bb1e7c`).

- `source/export-stk-kart-glb.mjs` is the preferred source for regenerating the
  static GLB visual.
- `source/original-stk-kart.glb` preserves the delivered bytes. The repository
  normalization script removes the optional emissive-strength extension and
  bakes its values into core glTF material fields before Runtime publication.
- `behavior/stk-settings.json` is the original engine-neutral parameter handoff.
- `metadata/` contains the delivered asset and package manifests.
- `THIRD_PARTY_NOTICES.md` preserves the delivered attribution statement.

These files are provenance/source material, not Runtime entrypoints. The
Runtime loads only the hash-locked GLB under
`apps/playground/public/subject-assets/kart-control-lab/stk-kart/v1/`, and the
SDK owns the registered input, movement, collision, camera, and lifecycle
implementation.

Regenerate the Runtime asset with:

```bash
pnpm tsx scripts/assets/normalize-stk-kart-glb.ts \
  --input assets/third-party/kart-control-lab-stk-kart/source/original-stk-kart.glb \
  --output apps/playground/public/subject-assets/kart-control-lab/stk-kart/v1/stk-kart.glb
```

The archive is licensed under `GPL-3.0-or-later`. See
`assets/licenses/kart-control-lab-stk-kart/GPL-3.0.txt`.
