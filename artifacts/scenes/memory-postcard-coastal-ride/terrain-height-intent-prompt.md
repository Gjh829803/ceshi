Use case: scientific-educational
Asset type: untrusted continuous terrain height-intent raster for deterministic SDK compilation
Input images: World Plan and Image 1 are spatial-composition references only. Infer coherent base terrain from them; do not copy perspective, lighting, materials, subjects, structures, or sky.

Reference roles and shared semantic anchors:
World Plan (`world-plan.png`) is the single `primary-coordinate` image and owns the square output orientation, complete-world extent, shoreline layout, and all left/right placement. Image 1 (`reference-0.png`) is `secondary-evidence` for the same world and registers only through the stable semantic anchors `high-entry-road`, `central-stone-arch`, `village-slope`, `bay-basin`, `upper-right-peninsula`, and `estate-plateau`; its perspective pixel positions and apparent sizes must not move the World Plan layout. No accepted exemplar matches this coastal-hillside terrain family, so no encoding-style exemplar is supplied.

Reference evidence, separated by image ID:
World Plan: the bottom-center high entry opens onto a descending central ground corridor; a stone bridge crosses that corridor before dense village ground spreads on both sides; the central-left bay bed is contained by a curved village shoreline, a lower-left headland, and the connected upper-right peninsula; continuous land follows the right rim from village to peninsula; the large-building plateau lies on the upper-right peninsula; useful side ground fills the entry shoulders, village flanks, shoreline edge, and peninsula surroundings. Image 1: the centered entry dirt road visibly descends between higher stone-walled shoulders; a single stone arch crosses above the road; village roofs step down toward the visible water; the far peninsula rises steeply from the bay; and the large building sits on high support ground near the peninsula top.

Inferred continuation:
Beyond Image 1, continue the high entry shoulders behind and to both sides as coherent sloping ground, extend the village's base slope around connected side lanes and small openings, carry a narrow but continuous land rim around the right side of the bay to the peninsula, and blend the peninsula into a broad upper plateau around the large building. Continue the lower-left headland and accessible shoreline ground exactly as established by the World Plan. Do not create detached islands, closed pits, empty padding, or new terrain landmarks.

Base terrain owned by the heightfield:
One continuous coastal hillside descends from raised bottom entry shoulders through the central village slope toward a curved bay. The village is supported by broad stepped-looking but actually smooth low-frequency hillside ground, without terraces or discrete bands. The bay is a broad depressed bed with gently deepening center. The lower-left headland and the upper-right peninsula rise continuously from the shoreline; the right-hand bay rim remains a connected land saddle from village to peninsula. The peninsula culminates in a broad stable estate plateau and rounded surrounding high ground. All landforms are single-valued continuous base ground.

Depressions owned by the heightfield:
The broad central-left bay bed is the principal depression, grading smoothly below datum from shallow shoreline shelves to a deeper open-water center. A shallow open drainage swale follows the natural central descent from the village toward the bay but never becomes a trench or separates the traversable ground. There are no closed pits. Encode only the submerged bay bed, never the water surface or water material.

Static Landmark and Structure exclusions:
Omit the complete stone arch bridge and its bridge silhouette; beneath it retain the continuous descending dirt-road ground, while both bridge abutments rest on broad blended hillside support. Omit all village houses, ordinary walls, roof forms, vegetation, boats, shoreline props, and any constructed lane surfaces; retain only their coherent underlying village slope and stable ground openings. Omit the complete large peninsula building; retain a broad, gently level blended estate plateau beneath and around its footprint. Do not create proxy mounds, rings, spikes, shadows, or markers for any omitted object.

Case-specific continuous height anchors:
Bottom-center spawn support `+0.50..+0.68`, broad and locally stable; combined bottom-left and bottom-right entry shoulders `+0.62..+0.82`; central ground beneath the omitted stone arch `+0.26..+0.42`, continuously downhill from spawn; broad village slope `+0.02..+0.32`, smoothly descending toward shore; curved bay bed `-0.68..-0.22`, shallow at shore and deepest across its broad central-left interior; connected right-rim and upper-right peninsula base `+0.25..+0.58`; broad estate plateau support `+0.52..+0.72`. Treat these as sparse smooth regional targets, not visible bands or terraces, and retain headroom at both ramp ends.

Entry and connectivity:
Keep a broad stable spawn support area at bottom center. Preserve continuous natural ground downhill from the spawn, beneath the omitted stone arch, through open village ground, along the accessible shoreline, around the right-hand land rim, and up the peninsula to the estate plateau. The ground under the bridge is a genuine narrow connection, and the blended ground beneath the omitted bridge deck must support that transverse constructed connection without drawing either connection as a route. Preserve connected side and rear ground established by the World Plan; do not draw paths, markers, or traversal shading.

Orientation:
Match the World Plan exactly: bottom edge is the high-slope entry and rear world boundary; top is north/world-forward toward the far side of the bay and remote peninsula; left remains the bay opening and lower-left headland side; right remains the continuous land rim and peninsula side. Preserve the World Plan's complete square world bounds, shoreline adjacency, all open connections, and relative terrain masses without mirroring or rotation.

Primary request: Generate one square, strict orthographic, true top-down continuous signed-color terrain height-intent image. It represents only the single-valued, continuous base ground surface. It is scientific scalar-field data, not a terrain render or decorative map. The color is a temporary transport encoding for height sign and magnitude; it is not terrain appearance and will be removed by the deterministic compiler.

Encoding contract — `signed-diverging-blue-gray-orange@1`:
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
