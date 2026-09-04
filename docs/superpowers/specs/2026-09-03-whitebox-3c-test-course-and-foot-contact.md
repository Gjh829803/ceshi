# Whitebox 3C Test Course and Grounded Foot Contact

## Status

Implementation authority for the 2026-09-03 viewer follow-up. This specification is scoped to the curated local Viewer, the built-in G Bot presentation, and one deterministic 3C test preset. It does not expand Canonical AuthoringSpec V4 or Browser Protocol V5.

## User outcomes

1. A supported, idle G Bot visibly rests on the support surface instead of appearing to float.
2. The scene picker always offers a dedicated `Whitebox 3C 测试场` and selects it when the Viewer is opened without an explicit scene query.
3. One deterministic world supports repeated manual evaluation of locomotion, traversal, jumping, high-speed turning, and third-person camera occlusion without authoring a new scene.

## Ground-contact contract

- Havok character support remains the sole gameplay authority for grounded state. The fix must not infer support from rendered mesh bounds, change the capsule, alter gravity, or add a second movement state.
- On the flat spawn pad after Runtime initialization and an idle render pose, the committed subject origin and visual root remain on the support plane.
- The lowest rendered G Bot geometry must be within `0.03 m` of the support plane. Presentation-only adjustment may correct a verified visual/animation offset below the committed visual root.
- The verified current geometry already satisfies that tolerance. Canonical terrain remains shadow-receiver-ready in every atmosphere, while only the `clear-day` directional light currently owns a finite, bounded shadow generator. The authoritative possessed G Bot visual meshes are its only casters; in other atmosphere presets the receiver flag is inert because no generator is attached. This is a rendering cue only and must not become a grounding signal.
- The correction must remain finite and isolated to the controlled visual. Reset must restore the authored presentation state, and no correction may rewrite Snapshot, Hash, Replay, Rollback, camera, or character-body state.
- A focused regression must first demonstrate the current failure using the real G Bot GLB and the supported flat-ground Runtime.

## Curated 3C test-course contract

### Identity and entry

- Scene id: `whitebox-3c-test-course`
- Picker title: `Whitebox 3C 测试场`
- Purpose: `traversal`
- Environment: deterministic `clear-day`
- Controlled subject: `worldkit://subject-definition/humanoid.g-bot@2`
- Camera: `worldkit://camera/third-person.standard@1` only
- Spawn: a flat, obstacle-free calibration pad on the terrain support plane

### Required stations

The AuthoringSpec must contain stable semantic stations for:

1. `3c.flat-calibration`: open flat acceleration, braking, and ordinary turning space.
2. `3c.slope`: a traversable incline with a level approach and exit.
3. `3c.stairs`: multiple static risers spanning low to near-limit step heights.
4. `3c.narrow-gate`: a passage wider than the `0.70 m` G Bot capsule diameter but narrow enough to reveal steering/collision error.
5. `3c.ledge`: a raised platform with an exposed edge and a nearby lower landing surface.
6. `3c.obstacle.small` and `3c.obstacle.large`: mixed-size slalom blockers.
7. `3c.narrow-corridor`: a sustained corridor rather than a single doorway.
8. `3c.high-speed-turn`: spaced chicanes or a hairpin with adequate run-up.
9. `3c.camera-occlusion`: pillars plus an L-shaped wall corner that can pass between subject and camera.
10. `3c.jump-takeoff` and `3c.jump-landing`: explicit takeoff and landing references with safe surrounding support.

All geometry uses current V4 primitives and fixed placements. Ordinary static traversal surfaces may use the existing ground-static traversal binding when needed; the preset does not claim trusted Route publication and declares no unsupported dynamic, stacked, cave, flight, or water connectivity.

## UI behavior

- Existing curated presets remain available.
- With no `scene` parameter, the Viewer resolves `whitebox-3c-test-course` as the catalog default.
- Selecting any picker entry keeps the existing closed URL behavior (`?scene=<id>`); no new selector state or compatibility alias is introduced.

## Acceptance evidence

- Contract test parses the catalog and new AuthoringSpec, verifies identity/default selection, controlled G Bot, third-person-only camera, flat supported spawn, and every required semantic station.
- Runtime regression uses the real G Bot asset and verifies supported state plus visible ground-contact tolerance.
- Runtime regression also verifies that the clear-day sun owns the shadow generator, the real G Bot meshes are registered as casters, and terrain receives the resulting contact shadow.
- Focused tests pass before broader gates.
- Final tree passes relevant TypeScript typecheck, scoped changed-domain tests, and Playground production build. The root aggregate is also attempted, with any host-platform failures reported separately from changed-domain results.
- Manual browser inspection confirms the picker entry, grounded idle pose, required course stations, usable traversal, camera occlusion opportunities, and no console errors.
