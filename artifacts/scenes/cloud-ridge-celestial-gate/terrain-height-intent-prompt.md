Use case: scientific-educational
Asset type: untrusted continuous terrain height-intent raster for deterministic SDK compilation
Input images: Image 1 is the current height-intent candidate to repair, Image 2 is the Planner's strict top-down world plan, and Image 3 is the user-supplied perspective scene reference. Preserve Image 1's registered topology while replacing its excessive amplitude and texture; do not copy perspective, lighting, materials, subjects, structures, route graphics, or sky.

Reference roles and shared semantic anchors:
Image 2 is primary-coordinate and owns output orientation, complete-world extent, left/right placement, and initial topology. Image 3 is secondary-evidence registered only through bottom-center-entry-shelf, central-constructed-stair-support, upper-center-hero-peak-support, left-valley, right-valley, and outer-peak-support-ground. Image 1 is an edit target, not an additional spatial authority.

Reference evidence, separated by image ID:
Image 3 visibly shows a broad rocky entry shelf in the lower foreground, a narrow central ascent toward an upper-center summit, cloud-filled separations on both sides, and high surrounding mountain masses and stone pillars. The visible central ascent is the only clear connection from the entry shelf to the summit. The gate, warrior, distinct peaks and pillars, stone stairs, trees, waterfalls, clouds, and lighting are not base terrain evidence. Image 2 shows the complete top-down footprint: entry at the bottom, central connection toward the upper-center destination, paired side valleys, and distributed outer peak supports. Image 1 already registers those regions but incorrectly contains visible texture and approximately three times the allowed color amplitude.

Inferred continuation:
The entry shelf continues behind and to both sides as stable gently rolling base ground. A low blended pedestal continues beneath the separately modeled central stair, hero peak, gate platform, and rear observation shoulder. Broad low support ground continues beneath separately modeled outer peaks while remaining separated from the central playable area by shallow valley basins. This continuation is conservative and does not claim that isolated peaks are connected.

Base terrain owned by the heightfield:
A stable nearly level lower entry shelf, gently rolling low-frequency side ground, two broad valley basins, a smooth narrow blended pedestal beneath the separately modeled central stair structure, a broad low pedestal beneath the separately modeled hero peak and gate platform, and broad low support ground beneath the separately modeled outer peaks. The Heightfield must remain visually subordinate: no dominant mountain dome, sharp summit, terrace, stair band, or high-amplitude ridge silhouette.

Depressions owned by the heightfield:
Two broad shallow connected valley basins flank the central constructed ascent on left and right and continue toward the far sides. There is no lake, river, or closed pit. Visible waterfalls and cloud sea are visual-only and do not define water beds.

Static Landmark and Structure exclusions:
Omit the entire cloud-top gate, its summit deck, the complete central stone stair and smooth structural support ramps, and the dominant hero mountain peak; leave only low broad blended support ground beneath them. Omit every distinct needle-like or steep mountain peak and the complete surrounding peak-forest landmark while leaving low blended support ground beneath their footprints. Omit the warrior, trees, waterfalls, and all decorative rock silhouettes. Do not create proxy spikes, sharp mountain domes, stair-shaped bands, terraces, or gate-shaped mounds.

Case-specific continuous height anchors:
Bottom-center entry support: 0.00..+0.01, broad and nearly flat. Ground beneath the central constructed ascent: +0.01..+0.04, smooth and continuous without visible steps or terraces. Upper-center hero-peak and gate support pedestal: +0.04..+0.08, broad and stable but visually low. Left and right valley basins: -0.08..-0.03, smooth and shallow. Ground beneath outer modeled peaks: +0.01..+0.05 with broad low-frequency variation. Far boundary base ground: 0.00..+0.04. Treat these as smooth regional targets, not visible bands. The entire raster must remain inside -0.10..+0.10; this is a deliberately low-amplitude base-ground field.

Entry and connectivity:
Keep the bottom-center spawn support broad, stable, and nearly flat. Preserve continuous low support ground beneath the separately modeled stair and ramp connection from entry to the upper-center gate platform; do not encode that constructed connection as a ridge, road, stair, terrace, or visible route. Valleys may fall away on both sides but must not cut beneath the support pedestal.

Orientation:
The bottom edge is the entry and world-rear. The top edge is north and world-forward toward the gate summit. Preserve reference left and right.

Primary request: Generate one square, strict orthographic, true top-down continuous signed-color terrain height-intent image. It represents only the single-valued, continuous base ground surface. It is scientific scalar-field data, not a terrain render or decorative map. The color is a temporary transport encoding for height sign and magnitude; it is not terrain appearance and will be removed by the deterministic compiler.

Encoding profile: `signed-diverging-blue-gray-orange@1`.

Encoding contract:
- Encode signed height on one continuous two-segment color ramp:
  deep depression `-1 = RGB(32,64,208)` -> ordinary ground `0 = RGB(128,128,128)` -> high base terrain `+1 = RGB(224,96,32)`.
- Cool blue-gray values below `0` are basins, valleys, pits, channels, and submerged beds.
- Neutral gray `RGB(128,128,128)` is the ordinary undeformed ground datum.
- Warm orange-gray values above `0` are broad hills, mountain masses, mesas, and ridges.
- Use only smooth interpolated colors on that ramp. Never use hue for material, biome, water, lighting, or semantic classes. Do not create discrete blue/gray/orange zones or contour bands.
- Retain headroom at both ends. Do not auto-normalize every scene to fill `-1..+1`.
- Use smooth, continuous, low-frequency gradients. Preserve broad flat support areas and connected ground; do not create visible contour bands or terraces.
- Honor the sign and approximate range of the case-specific anchors, then interpolate smoothly between them. Do not shift all anchors upward or stretch each image to its own relative minimum and maximum.
- Hard low-amplitude calibration: every pixel must project inside scalar -0.10..+0.10. Therefore all transport colors must remain very close to neutral gray: negative extrema no cooler than approximately RGB(118,122,136), positive extrema no warmer than approximately RGB(138,125,118), and ordinary ground near RGB(128,128,128). Do not use saturated blue or orange anywhere.

Multiple-reference rule: construct the canonical map in the primary image's coordinate frame. Use secondary images only to add or clarify terrain through the declared shared semantic anchors and topological relations. Ignore secondary-image pixel offsets caused by camera perspective, parallax, crop, or model drift. If an item cannot be registered semantically, do not place it.

Water rule: encode the terrain bed below water, but do not depict a water surface, shoreline color, reflection, or water material. A separate semantic mask and control JSON own water coverage and water-surface height.

Static-geometry rule: omit every declared static Landmark or Structure silhouette from this image. At each declared footprint, render only the real continuous support ground or a broad blended terrain pedestal. Do not create a proxy spike, mound, ring, shadow, or marker for the omitted object.

Constraints: the complete world bounds fill the square canvas; preserve visible adjacency, containment, separation, openings, and large-scale landform proportions; keep the declared spawn support area stable; keep every declared ground connection continuous; all output geometry must be representable by one height value per XZ point.

Avoid: perspective, isometric view, camera shading, cast shadows, ambient occlusion, surface normals, rock strata, erosion texture, cracks, material grain, noise, contour lines, discrete color bands, rainbow colors, labels, legend, grid, compass, route line, spawn icon, people, animals, vegetation, buildings, static Landmarks, sky, border, transparency, UI, logo, and watermark.

Repair instruction for Image 1: change only the scalar-field rendering. Preserve the same region topology and orientation, remove all paper/rock texture and micro-noise, and compress every pixel into the hard -0.10..+0.10 range around neutral gray. The result must look like a smooth matte scientific data raster, not a painted terrain map. Do not preserve Image 1's blue/orange intensity merely because it is the edit target.
