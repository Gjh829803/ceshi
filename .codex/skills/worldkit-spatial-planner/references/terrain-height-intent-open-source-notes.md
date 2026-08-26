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

## Academic terminology and closest prior art

The canonical geometric term is a **2.5D Heightfield**: one scalar elevation for each regular XZ
sample. In geospatial literature the closest bare-ground representation is a **Digital Elevation
Model (DEM)**. USGS terminology explicitly separates a bare-earth DEM from a surface model that
includes buildings and vegetation, which matches WorldKit's decision to keep structures and hero
Landmarks outside the terrain field:

- [USGS: What is a Digital Elevation Model?](https://www.usgs.gov/faqs/what-a-digital-elevation-model-dem)
- [Guth et al. 2021: Digital elevation models: Terminology and definitions](https://www.usgs.gov/publications/digital-elevation-models-terminology-and-definitions)

The most precise name for the experimental PNG is **a datum-centered signed scalar Heightfield
encoded by a continuous diverging colormap**. “Signed” means elevation relative to the chosen zero
datum; it does not make the image a signed distance field. Moreland's scientific-visualization work
supports using a diverging color map when a central scalar value has special meaning, while also
warning against rainbow transport that introduces false visual structure:

- [Moreland 2009: Diverging Color Maps for Scientific Visualization](https://www.sandia.gov/research/publications/details/diverging-color-maps-for-scientific-visualization-expanded-2009-07-01/)

The generation problem overlaps three research families, but none supplies WorldKit's complete
contract directly:

- **single-view terrain reconstruction**: Takahashi et al. first remove perspective lighting,
  estimate RGB-D, rasterize the visible result from above, then inpaint unseen terrain. This is a
  useful architectural reference for why a direct perspective-to-top-view image translation is
  ambiguous, not a dependency for the prompt-first path;
- **sketch-based constrained terrain synthesis**: Gain et al. deform a multiresolution surface from
  explicit silhouette, spine, and boundary constraints for both raised landforms and embedded river
  or canyon forms; and
- **frequency-layer terrain authoring**: Bradbury et al. separate elevation-map frequency bands and
  accept photographs, concept art, sketches, and height maps as different authoring inputs.

Primary references:

- [Takahashi, Kanamori, Endo 2022: 3D Terrain Estimation from a Single Landscape Image](https://kanamori.cs.tsukuba.ac.jp/projects/3D_terrain/)
- [Gain, Marais, Strasser 2009: Terrain Sketching](https://pubs.cs.uct.ac.za/id/eprint/516/)
- [Bradbury et al. 2014: Frequency-Based Creation and Editing of Virtual Terrain](https://la.disneyresearch.com/publication/frequency-based-creation-and-editing-of-virtual-terrain/)

WorldKit's distinctive combination is therefore: use ImageGen only for the ambiguous macro-shape
proposal; project its color transport back to a scalar; low-pass before resampling; then let exact
Water, Spawn, Landmark-support, and Route constraints override the stochastic proposal. Do not call
the generated PNG a DEM measurement or ground truth because it is neither georeferenced nor sensed.

## Candidate datum-recentering policy

V0 maps the signed raster through explicit minimum / datum / maximum heights and does not currently
shift a whole field merely because most generated pixels are positive. If holdout cases show a
repeatable global high/low bias, evaluate a Host-only **datum recentering** step between metric
mapping and required-constraint application:

- estimate a robust median from the unconstrained base field;
- translate the entire field so that median approaches explicit `baseHeightMeters`;
- cap the permitted translation and fail closed if it would leave `heightRangeMeters`; and
- apply Water, Spawn, Landmark support, and Route constraints only after that translation.

Do not use per-image min-max normalization. It destroys absolute relief semantics and expands a
nearly flat prompt into artificial full-range peaks and pits. Recentring is a uniform Y translation,
not contrast stretching, clipping, or another Runtime terrain authority.

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
