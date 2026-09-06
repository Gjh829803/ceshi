# CF-04/12 WebGL2 occlusion probe

This is a read-only presentation diagnostic, not a production gate or generated
scene. It exercises the actual fade shader and shared artifact identity capture,
including the very first identity image after material preparation. It does not
prove complete interactive/Formal parity or human control feel.

From the repair worktree:

```sh
pnpm exec vite build scripts/verification/native-block-occlusion-browser --outDir ../../../output/playwright/cf-occlusion-browser
pnpm exec vite preview scripts/verification/native-block-occlusion-browser --outDir ../../../output/playwright/cf-occlusion-browser --host 127.0.0.1
```

Open the printed local URL in a WebGL2 browser. The page displays the opaque
opening, faded opening, identity mask, and JSON result. Require `status: passed`,
including zero red Subject pixels in the **first** identity mask, and inspect the
images. Do not add warm-up frames to hide first-capture shader failures. Save any
screenshots under `output/playwright/`; stop the owned preview when finished.

The CF-04/T1 timing probe also compares delta-zero Reset presentation with one
`1/60s` update using the same migrated fade algorithm and unchanged geometry.
It requires different display pixels, opacity `Math.fround(1 - (1/60)/0.15)`
after that update, and partial Subject visibility between the opaque and fully
faded captures. This deliberately demonstrates why an extra neutral Tick is not
equivalent to waiting for rendering. A passing probe proves that sensitivity;
it does **not** mean the Formal capture timing difference has been fixed or that
three production entry points have matching pixels.
