# 015 Alien Rift Plateau terrain intent experiment

This folder is exploratory evidence, not a fourth formal Planner artifact. The source perspective
image was supplied by the user and passed to OpenAI Image 2 through Codex built-in image generation
as the sole `primary-coordinate` reference.

- source basename: `下载 (3).png`
- source SHA-256: `a2c12aa0ff6e4eef33bf3858ab956139eece5c0fcb0ba3b5d4b3c5610dba47ed`
- output SHA-256: `f5f61deb12b33afd21ba6e1d1c779c668bd287fbdf7f5f0f9fce9fc2757739ab`

## Result

The generated map preserved the strongest reference topology: a deep open-ended central rift and
channel bed between two elevated plateau systems. It omitted the astronaut, spacecraft, base,
crystals, trees, planets, and sky as requested. Those forms remain separate static-model or render
ownership rather than Terrain geometry.

- mean RGB-to-ramp residual: `21.7966`;
- p95 RGB-to-ramp residual: `49.6864`;
- mean scalar neighbor delta: `0.01008`;
- p95 scalar neighbor delta: `0.03409`;
- compiler prefilter radius: `[3px, 5px]`;
- output grid: `161 x 121`, `19,481` finite metric samples over `320m x 240m`;
- protected spawn correction: `210` samples, maximum `31.0374m`; and
- compiler, Canonical validation, Layout validation, and Babylon capture: passed.

`runtime-opening-v0.png` visibly reads as a stable entry plateau facing a depressed rift with raised
opposite shoulders, so this case is the stronger of the two new references. The large spawn
correction still means the image is only a macro-shape proposal. A future learned acceptance gate
should reject or flag support regions that require corrections above a frozen threshold rather than
treating a passing compiler as proof that the ImageGen scalar anchors were accurate.

The capture used SwiftShader. It is valid static topology evidence, not a hardware rendering or
large-world performance measurement.
