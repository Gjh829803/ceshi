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
