# SDK Playground maintenance

Read [application usage](README.md). This application develops and calibrates SDK
capabilities using `@worldkit/three` and `@worldkit/preset-content`. It is separate
from Creator's production browser bridge.

Keep shared parameters and public capability contracts as the source of truth.
Controls submit intent to SDK owners; UI must not add physics, animation or camera
loops. Preserve actual object selection, input ownership and paused-frame state
when inspecting or adjusting presentation. Validate affected UI paths and build.
Do not impose Playground scenes, UI or developer regression steps on production.
