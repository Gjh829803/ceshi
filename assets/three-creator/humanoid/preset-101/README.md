# Default humanoid preset

`humanoid.preset-101` reuses the Training Playground's original Source101 mesh,
materials, skeleton and bind pose. The ordinary SDK bundle includes five authored
motions: idle, walk, run, jump and fall. Landing returns to grounded locomotion.
It is the default for new Creator humanoid players and NPCs.

The builder removes the source stage offset, root translation and root yaw so
Rapier owns motion. It starts jump at the measured takeoff frame (10/30 seconds).
The catalog rotates the +Z source to the SDK's -Z front; it does not rescale or
retarget the model. The original source assets and G Bot remain unchanged.
Walk/run playback rates match ordinary SDK default speeds (2.4 / 4.8 m/s), from
measured source root speeds of 2 / 5 m/s. Custom movement speeds require a stride
check; this asset does not add dynamic gait-rate control to the SDK.

```sh
python3 scripts/three-creator/build-preset-humanoid.py
python3 scripts/three-creator/build-preset-humanoid.py --check
```

`v1/provenance.json` records every source model/clip hash and the derived bytes.
Source attribution and notices are included through the asset catalog in Creator
deliveries. The source material remains under
`assets/three-creator/training/humanoid/source`.

The full 48-action Training bundle is still `humanoid.source-101`. Its contextual
traversal, swimming and interaction controllers are not replaced by this ordinary
locomotion asset. The runtime continues to own one physics world, animation mixer
and camera writer. No generated body, rig or procedural gait is needed in scenes.
