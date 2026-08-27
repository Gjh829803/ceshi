import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const VERIFIERS = [
  "scripts/verification/verify-canonical-world.ts",
  "scripts/verification/verify-placement-layout.ts",
  "scripts/verification/verify-rigged-subject-world.ts",
  "scripts/verification/verify-g-bot-subject-world.ts",
] as const;

describe("real Browser verifier launch policy", () => {
  it("shares the bundled-Chromium then system-Chrome fallback", async () => {
    for (const verifierPath of VERIFIERS) {
      const source = await readFile(verifierPath, "utf8");
      expect(source).toContain('from "../lib/playwright-browser-launch"');
      expect(source).toContain("launchChromiumWithSystemFallback()");
      expect(source).not.toContain("chromium.executablePath()");
      expect(source).not.toContain("chromium.launch({ headless: true })");
    }
  });

  it("uses the same fallback for Simulation Take and Control Capture", async () => {
    const source = await readFile("scripts/lib/simulation-take-cli.ts", "utf8");
    expect(source).toContain('from "./playwright-browser-launch"');
    expect(source).toContain("launchChromiumWithSystemFallback()");
    expect(source).not.toContain("chromium.launch(");
  });

  it("marks only the tested primary subject for pose-silhouette evidence", async () => {
    for (const verifierPath of [
      "scripts/verification/verify-rigged-subject-world.ts",
      "scripts/verification/verify-g-bot-subject-world.ts",
    ]) {
      const source = await readFile(verifierPath, "utf8");
      expect(source).toContain("__WORLDKIT_AUTHORING_CAPTURE__");
      expect(source).toContain('visualTargetId: "pose-primary-subject"');
      expect(source).toContain('identityColor: "#E85D5D"');
      expect(source.indexOf('identityColor: "#E85D5D"')).toBeGreaterThan(
        source.indexOf("CLI world.png"),
      );
    }
  });
});
