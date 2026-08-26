# Terrain Height Intent Prompt V0

Use this reference only when the Host or user explicitly requests an experimental
`height-intent.png`. It is not a normal Unified Planner output. The generated PNG is an
untrusted terrain proposal that a deterministic Host compiler must inspect, normalize, constrain,
and convert to metric height samples before any Builder or Runtime consumes it.

The image supplies a macro-shape prior, not hard numeric truth. Spawn support, required routes,
Landmark support footprints, water coverage, water-surface height, and slope limits remain owned by
the existing Scene Brief, WorldSpec, AuthoringSpec, or Host-derived implementation map. Do not create
a competing terrain-control schema merely for this experiment.

## Ownership decision

Before writing the image prompt, divide visible forms by geometric ownership:

| Owner | Include in height intent | Examples |
| --- | --- | --- |
| continuous base terrain | yes | plains, basins, valleys, broad hills, mountain mass, ridges, lakebeds |
| static Landmark or Structure | no; retain only its blended support ground | isolated spires, hero peaks, rock towers, arches, overhangs, buildings |
| semantic control | encode its ground shape only | water uses a depressed bed here; water coverage and surface height belong to a separate mask/control |

If a distinctive form could be represented by a heightfield but is intended to be a separate
Landmark, the declared ownership wins. Never duplicate its silhouette in both systems.

## Required inputs

Write short prose for every bracketed input before invoking image generation:

- `[REFERENCE ROLES]`: declare exactly one image as `primary-coordinate`; declare any additional
  same-world images as `secondary-evidence`, and name the stable semantic anchors shared with the
  primary image. A style reference or a different world is not a secondary terrain view.
- `[REFERENCE EVIDENCE]`: only spatial relationships visible in each supplied image, kept separate
  by image ID.
- `[INFERRED CONTINUATION]`: conservative terrain beyond the visible frame.
- `[BASE TERRAIN]`: the continuous low-frequency landform that the heightfield owns.
- `[DEPRESSIONS]`: valleys, pits, channels, and water beds; say `none` when absent.
- `[STATIC EXCLUSIONS]`: each separately modeled Landmark and the support ground left beneath it.
- `[HEIGHT ANCHORS]`: three to seven Host-derived named regions with signed scalar ranges from `-1`
  to `+1` around the fixed `0` datum. These are sparse scalar anchors, not contour bands, and the
  deterministic compiler—not the image—is their final authority.
- `[ENTRY AND CONNECTIVITY]`: spawn support area and any genuinely constrained ground connection.
- `[ORIENTATION]`: which image edge corresponds to the entry and which direction is north/world-forward.

## Multiple-reference registration

Multiple images provide evidence; they do not provide one shared pixel coordinate system.

- The `primary-coordinate` image owns output orientation, left/right placement, and the initial
  topological layout.
- A `secondary-evidence` image may reveal an occluded depression, continuation, or back side, but
  its screen-space position and apparent size must never be averaged with the primary image.
- Register secondary evidence only through named semantic anchors, for example
  `right-mesa`, `central-gap`, or `lake-basin-behind-right-mesa`, plus topological relations such as
  `behind`, `inside`, `between`, and `connected-to`.
- When views cannot be reconciled through those anchors, keep the primary layout and record the
  secondary claim as unresolved. Do not invent a compromise position.
- Generate exactly one canonical height-intent image. Do not ask the image model for one height map
  per reference and then align its independently drifted outputs.

## Image-generation prompt recipe

Replace every bracketed input. Keep the encoding and negative constraints unchanged.

```text
Use case: scientific-educational
Asset type: untrusted continuous terrain height-intent raster for deterministic SDK compilation
Input images: Image 1..N are spatial-composition references only. Infer coherent base terrain from them; do not copy perspective, lighting, materials, subjects, structures, or sky.

Reference roles and shared semantic anchors:
[REFERENCE ROLES]

Reference evidence, separated by image ID:
[REFERENCE EVIDENCE]

Inferred continuation:
[INFERRED CONTINUATION]

Base terrain owned by the heightfield:
[BASE TERRAIN]

Depressions owned by the heightfield:
[DEPRESSIONS]

Static Landmark and Structure exclusions:
[STATIC EXCLUSIONS]

Case-specific continuous height anchors:
[HEIGHT ANCHORS]

Entry and connectivity:
[ENTRY AND CONNECTIVITY]

Orientation:
[ORIENTATION]

Primary request: Generate one square, strict orthographic, true top-down continuous signed-color terrain height-intent image. It represents only the single-valued, continuous base ground surface. It is scientific scalar-field data, not a terrain render or decorative map. The color is a temporary transport encoding for height sign and magnitude; it is not terrain appearance and will be removed by the deterministic compiler.

Encoding contract:
- Encode signed height on one continuous two-segment color ramp:
  deep depression `-1 = RGB(32,64,208)` -> ordinary ground `0 = RGB(128,128,128)` -> high base terrain `+1 = RGB(224,96,32)`.
- Cool blue-gray values below `0` are basins, valleys, pits, channels, and submerged beds.
- Neutral gray `RGB(128,128,128)` is the ordinary undeformed ground datum.
- Warm orange-gray values above `0` are broad hills, mountain masses, mesas, and ridges.
- Use only smooth interpolated colors on that ramp. Never use hue for material, biome, water,
  lighting, or semantic classes. Do not create discrete blue/gray/orange zones or contour bands.
- Retain headroom at both ends. Do not auto-normalize every scene to fill `-1..+1`.
- Use smooth, continuous, low-frequency gradients. Preserve broad flat support areas and connected ground; do not create visible contour bands or terraces.
- Honor the sign and approximate range of the case-specific anchors, then interpolate smoothly between them. Do not shift all anchors upward or stretch each image to its own relative minimum and maximum.

Multiple-reference rule: construct the canonical map in the primary image's coordinate frame.
Use secondary images only to add or clarify terrain through the declared shared semantic anchors and
topological relations. Ignore secondary-image pixel offsets caused by camera perspective, parallax,
crop, or model drift. If an item cannot be registered semantically, do not place it.

Water rule: encode the terrain bed below water, but do not depict a water surface, shoreline color, reflection, or water material. A separate semantic mask and control JSON own water coverage and water-surface height.

Static-geometry rule: omit every declared static Landmark or Structure silhouette from this image. At each declared footprint, render only the real continuous support ground or a broad blended terrain pedestal. Do not create a proxy spike, mound, ring, shadow, or marker for the omitted object.

Constraints: the complete world bounds fill the square canvas; preserve visible adjacency, containment, separation, openings, and large-scale landform proportions; keep the declared spawn support area stable; keep every declared ground connection continuous; all output geometry must be representable by one height value per XZ point.

Avoid: perspective, isometric view, camera shading, cast shadows, ambient occlusion, surface normals, rock strata, erosion texture, cracks, material grain, noise, contour lines, discrete color bands, rainbow colors, labels, legend, grid, compass, route line, spawn icon, people, animals, vegetation, buildings, static Landmarks, sky, border, transparency, UI, logo, and watermark.
```

## Post-generation inspection

Inspect rather than trusting the model's claim:

1. Confirm the image is top-down and its orientation matches the declared world direction.
2. Project every RGB pixel onto the nearest point of the declared two-segment color ramp. Record
   color residuals and reject obvious material/lighting colors; freeze a numeric residual threshold
   only after a representative fixture set exists.
3. Confirm requested depressions have negative projected values and requested raised base terrain
   has positive projected values. Sample every declared height-anchor region. A scene that merely
   stretches its own minimum and maximum or reverses an anchor's sign has violated the contract.
4. Confirm declared static geometry is absent while its support ground remains coherent.
5. For multiple references, confirm every secondary addition is registered through a declared
   semantic anchor and that primary-coordinate features did not move to follow secondary pixels.
6. Reject lighting, rock layers, micro-noise, disconnected traversal, or invented water semantics.
7. Record source-image hashes, reference roles, the exact rendered prompt, generator provenance, output hash, and
   measurements. Never send the generated pixels directly to Runtime.

An isolated numeric miss inside an already declared protected region may be overridden by the Host
constraint pass. A sign reversal that changes macro topology, duplicates a static Landmark, closes a
required gap, or invents a disconnected basin rejects the candidate; do not keep lengthening the
prompt to make a stochastic image behave like a solver.

## Canyon courier example inputs

```text
REFERENCE EVIDENCE: A broad low foreground basin; an isolated narrow rock tower on the left; a broad mesa on the right; connected canyon walls across the far background; a central gap between the left and right masses.
INFERRED CONTINUATION: The central low ground continues through the far gap into a coherent off-camera canyon; side terrain continues as broad canyon shoulders.
BASE TERRAIN: Low foreground basin, wide central valley, broad right-side mesa base, and connected far canyon mass. The basin and valley are below the ordinary surrounding datum; the mesa base and canyon mass are above it.
DEPRESSIONS: Wide central valley only. There is no water and no closed pit.
STATIC EXCLUSIONS: The isolated left rock tower and the distinctive upper silhouette of the right mesa are separate static Landmarks. Keep low stable support ground under the tower and a broad blended heightfield pedestal under the mesa Landmark.
HEIGHT ANCHORS: Bottom-center spawn support -0.85..-0.55; broad foreground basin -0.75..-0.35; central valley -0.90..-0.60; left tower support footprint -0.25..0.00, matching nearby low ground rather than forming a mound; broad right mesa pedestal +0.35..+0.70; connected far canyon mass +0.55..+0.85. Treat these as smooth regional targets, not visible bands.
ENTRY AND CONNECTIVITY: A broad stable spawn support area at bottom center connects through a wide low valley to the far central gap. This is open natural ground, not a painted road.
ORIENTATION: Bottom edge is the entry; top is world-forward into the distant canyon; preserve reference left and right.
```
