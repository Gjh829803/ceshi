import { describe, expect, it } from "vitest";

import { deterministicCaptureBrowserLaunchOptions } from
  "./playwright-browser-launch";

describe("deterministicCaptureBrowserLaunchOptions", () => {
  it("uses native ANGLE Vulkan for deterministic GPU capture", () => {
    const options = deterministicCaptureBrowserLaunchOptions({
      WORLDKIT_CAPTURE_GPU: "1",
      WORLDKIT_CAPTURE_HEADLESS: "1",
    });
    expect(options.headless).toBe(true);
    expect(options.args).toContain("--use-gl=angle");
    expect(options.args).toContain("--use-angle=vulkan");
    expect(options.args).toContain("--enable-features=Vulkan");
    expect(options.args).toContain("--disable-software-rasterizer");
    expect(options.args).not.toContain("--use-gl=egl");
  });

  it("keeps local CPU capture behavior unchanged", () => {
    expect(deterministicCaptureBrowserLaunchOptions({})).toEqual({
      headless: true,
      args: [],
    });
  });
});
