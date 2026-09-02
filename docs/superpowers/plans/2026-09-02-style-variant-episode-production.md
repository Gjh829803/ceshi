# Ten-style Episode production

## Outcome

One admitted Scene, one Playthrough Plan, and one hash-closed whitebox capture
produce ten visually distinct Episode variants. Every variant owns an independent
appearance specification, styled opening-frame set, complete-target tri-view set,
Gemini event prompt, Seedance prompt set, generated video set, and conformance
evidence. The whitebox videos remain the only motion, camera, and spatial authority.

## Authority map

- Scene Planner and Builder own playable topology and Runtime geometry once.
- Host-owned whitebox capture owns camera paths, motion timing, poses, occlusion,
  traversal envelopes, and video timing once.
- Style Variant Director owns ten independent appearance interpretations. It does
  not edit Scene geometry or create video.
- One Style Variant Visual Reconstructor owns all styled openings and tri-views for
  one variant.
- A different Codex Visual Reviewer owns the semantic composition and tri-view
  verdict for that variant. It cannot edit images.
- Gemini owns large, style-specific timed visual events only after visual review.
- Seedance owns final rendering, natural secondary motion, and synchronized effects
  while preserving the shared whitebox video.
- Host owns identity hashes, stage admission, retry bounds, media conformance, and
  S3 publication. Host does not replace Codex visual judgment with pixel thresholds.

## Dependency graph

1. Existing `whitebox-capture` produces six healthy 30-second recordings and one
   quality report. More than five consecutive seconds of effective Subject
   immobility rejects the capture.
2. `style-variant-plan` produces exactly ten standalone variant specifications.
3. `style-variant-visuals` fans out ten independent Visual Reconstructor jobs.
4. `style-variant-visual-review` fans out ten independent Codex Reviewer jobs.
5. A failed variant receives at most two total visual-generation attempts; the
   Reviewer diagnosis is the only repair brief. Other variants do not rerun.
6. Only review-passed variants enter independent Gemini event direction, Seedance
   prompt construction, Seedance generation, and conformance.
7. The Cloud Episode manifest publishes the shared whitebox once and all variant
   artifacts under `episode/style-variants/<variant-id>/`.

## Invariants

- Every variant references the same Playthrough Plan hash, whitebox trace hash,
  quality-report hash, and per-Segment source-video hash.
- A style may radically reinterpret a landmark inside its registered occupancy
  envelope, but may not move the camera, reveal a hidden remainder, change visible
  crop, alter traversal space, or introduce a new motion path.
- Review is semantic and image-aware. The Host validates Reviewer identity, input
  hashes, output schema, and a `passed` verdict; it does not use similarity scores,
  red-pixel ratios, or bounding-box thresholds as a substitute.
- Front/Right/Back target identity, direction, comparable scale, and baseline are
  review requirements. Local silhouette and material design remain style-owned.
- An admitted variant may be retried or resumed independently. Planner, Builder,
  Runtime capture, and already passed variants remain immutable.
