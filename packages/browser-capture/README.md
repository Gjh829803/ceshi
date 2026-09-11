# Browser capture

`@worldkit/browser-capture/browser` provides the existing deterministic Chromium
launch configuration and system-browser fallback. `@worldkit/browser-capture/video`
provides rendered-frame encoding and video inspection. Creator and Episode share
these helpers while retaining their own capture plans and clock ownership.

This Node-side package does not create a world or advance simulation. Browser
selection, frame timing and encoder settings are part of the capture contract;
verify both consumers when changing them.

Runtime implementation lives in `src/`; regression tests live in `tests/`. The
package root contains only metadata and usage/maintenance instructions.
