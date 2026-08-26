# Terrain Height Intent Open-source Notes

This is a rolling implementation reference, not an approved dependency list. Verify version,
license, deterministic behavior, platform support, and workspace ownership before adoption.

| Pipeline step | Candidate/reference | Current decision |
| --- | --- | --- |
| decode, color normalization, grayscale, resize, blur | [sharp](https://github.com/lovell/sharp), Apache-2.0 | strongest Node candidate; pin the direct dependency and libvips build before claiming cross-machine determinism |
| masks, convolution, morphology, connected regions | [image-js](https://github.com/image-js/image-js), MIT | evaluate against focused fixtures; useful if it removes enough custom raster code to justify a second image dependency |
| height/control/color separation and tiled regions | [Terrain3D](https://github.com/TokisanGames/Terrain3D), MIT | architecture reference; do not import its Godot Runtime into WorldKit |
| named height and mask layers | [Houdini HeightFields](https://www.sidefx.com/docs/houdini/model/heightfields) | industry data-boundary reference, not an SDK dependency |
| region-aware deterministic heightfield composition | [fal-worldclaw](https://github.com/blendi-remade/fal-worldclaw) | algorithm study only while its repository has no declared license |
| erosion and hydrology | [Landlab](https://landlab.readthedocs.io/en/latest/) and [WhiteboxTools](https://github.com/jblindsay/whitebox-tools) | optional offline refiners after macro topology and gameplay constraints; not V0 dependencies |
| natural terrain refinement | [symbios-ground](https://github.com/TheJanusStream/symbios-ground) | inspect algorithms and conformance; do not add a Rust/WASM boundary for the first slice |
| planar or near-planar image registration | [OpenCV homography](https://docs.opencv.org/4.10.0/d9/dab/tutorial_homography.html) | useful only when views observe a shared near-planar surface with reliable feature matches; not valid for parallax-heavy canyon views |
| calibrated overlapping multi-view reconstruction | [COLMAP](https://colmap.github.io/), new BSD | credible SfM/MVS reference for real photographic capture sets; too heavy and assumption-sensitive for the prompt-first V0 path |
| learned uncalibrated multi-view reconstruction | [DUSt3R](https://github.com/naver/dust3r) | research reference only; official implementation and checkpoints require noncommercial/share-alike licensing review, so do not make it a production dependency |

## Build-versus-reuse rule

- Reuse image decoding, color conversion, resampling, and standard morphology when a maintained
  dependency has explicit licensing and deterministic fixtures pass.
- Keep WorldKit-specific datum mapping, terrain/static ownership, water semantics, slope limits,
  route/spawn projection, diagnostics, hashes, and compiler profiles in WorldKit code.
- Treat erosion as a late masked modifier. Reapply and revalidate protected gameplay constraints
  after it; never let an erosion library become the authority for spawn, route, or water state.
- Provider SDKs and image-generation model names remain in Planner/Host provenance. They do not
  enter the terrain compiler, Authoring Schema, or Runtime.

## Multiple-reference decision

- V0 uses one `primary-coordinate` reference plus zero or more `secondary-evidence` references.
  Stable semantic anchors and topological relations register secondary evidence; raw screen-space
  coordinates never do.
- Generate one canonical height-intent raster in the primary frame. Independently generated
  per-view rasters create another drift problem and are not merged.
- Use OpenCV homography only after proving the scene is near-planar and feature matches are valid.
  Elevated terrain and oblique canyon views violate the single-plane assumption.
- Consider COLMAP only for a future capture mode with genuinely overlapping real photographs,
  sufficient texture, and trusted Host-side reconstruction. It is not a default dependency.
- Do not adopt DUSt3R code or checkpoints into a commercial pipeline without an explicit license
  decision.
