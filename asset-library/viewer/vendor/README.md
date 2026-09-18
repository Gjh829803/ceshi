# Viewer dependencies

This directory contains the unmodified Three.js 0.185.1 files reachable from the
viewer's import map and `app.mjs`: the WebGL ES modules, OrbitControls, GLTFLoader,
FBXLoader and their transitive utilities (including fflate 0.8.2).

Keep `three/LICENSE` and the third-party notices embedded in the source files.
WebGPU, CommonJS, unused examples, decoder binaries and alternate minified builds
are not needed by this viewer and are not vendored. Optional GLTF decoders are not
configured by the viewer; adding one requires including its runtime dependencies.

To update, trace the viewer's imports against the new pinned Three version and
copy that dependency closure, preserving upstream bytes. Verify the published
viewer with GLB and FBX models, skeleton display and animation playback. Do not copy
the whole `three/build` or `three/examples` directory.
