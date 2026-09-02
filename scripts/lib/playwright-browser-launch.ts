import { chromium, type Browser } from "playwright";

export function deterministicCaptureBrowserLaunchOptions(
  environment: NodeJS.ProcessEnv = process.env,
): { headless: boolean; args: readonly string[] } {
  return {
    headless: environment.WORLDKIT_CAPTURE_HEADLESS !== "0",
    args: environment.WORLDKIT_CAPTURE_GPU === "1"
      ? [
          "--use-gl=angle",
          "--use-angle=vulkan",
          "--enable-features=Vulkan",
          "--enable-gpu-rasterization",
          "--ignore-gpu-blocklist",
          "--disable-software-rasterizer",
          "--disable-gpu-sandbox",
        ]
      : [],
  };
}

export async function launchChromiumWithSystemFallback(
  options: { headless?: boolean; args?: readonly string[] } = {},
): Promise<Browser> {
  const headless = options.headless ?? true;
  const args = [...(options.args ?? [])];
  try {
    return await chromium.launch({ headless, args });
  } catch (bundledError) {
    try {
      return await chromium.launch({ headless, channel: "chrome", args });
    } catch (systemChromeError) {
      throw new AggregateError(
        [bundledError, systemChromeError],
        "Neither Playwright Chromium nor the system Chrome channel is available.",
      );
    }
  }
}
