import { describe, expect, it, vi } from "vitest";

import { savePlaywrightCanvasScreenshot } from "./playwright-canvas-screenshot";

describe("Playwright canvas screenshots", () => {
  it("captures through Playwright without evaluating canvas.toDataURL on the page thread", async () => {
    const screenshot = vi.fn(async () => Buffer.from("png"));
    const evaluate = vi.fn(() => {
      throw new Error("page-thread canvas serialization must not run");
    });

    await savePlaywrightCanvasScreenshot(
      { screenshot, evaluate } as never,
      "/tmp/recon.png",
    );

    expect(evaluate).not.toHaveBeenCalled();
    expect(screenshot).toHaveBeenCalledWith({
      path: "/tmp/recon.png",
      type: "png",
      animations: "disabled",
      timeout: 60_000,
    });
  });
});
