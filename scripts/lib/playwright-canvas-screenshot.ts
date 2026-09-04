import type { Locator } from "playwright";

/**
 * Capture the composited canvas through Playwright. Keeping PNG serialization
 * outside the page avoids blocking Babylon's render thread on toDataURL for a
 * complex world during reconnaissance.
 */
export async function savePlaywrightCanvasScreenshot(
  canvas: Locator,
  targetPath: string,
): Promise<void> {
  await canvas.screenshot({
    path: targetPath,
    type: "png",
    animations: "disabled",
    timeout: 60_000,
  });
}
