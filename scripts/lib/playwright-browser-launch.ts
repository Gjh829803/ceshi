import { chromium, type Browser } from "playwright";

export async function launchChromiumWithSystemFallback(
  options: { headless?: boolean } = {},
): Promise<Browser> {
  const headless = options.headless ?? true;
  try {
    return await chromium.launch({ headless });
  } catch (bundledError) {
    try {
      return await chromium.launch({ headless, channel: "chrome" });
    } catch (systemChromeError) {
      throw new AggregateError(
        [bundledError, systemChromeError],
        "Neither Playwright Chromium nor the system Chrome channel is available.",
      );
    }
  }
}
