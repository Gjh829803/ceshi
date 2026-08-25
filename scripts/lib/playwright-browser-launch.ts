import { chromium, type Browser } from "playwright";

export async function launchChromiumWithSystemFallback(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (bundledError) {
    try {
      return await chromium.launch({ headless: true, channel: "chrome" });
    } catch (systemChromeError) {
      throw new AggregateError(
        [bundledError, systemChromeError],
        "Neither Playwright Chromium nor the system Chrome channel is available.",
      );
    }
  }
}
