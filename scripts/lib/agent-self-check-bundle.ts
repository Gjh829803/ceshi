import { readFile } from "node:fs/promises";

export async function assertAgentSelfCheckBundleParity(input: {
  readonly bundleId:
    | "planner"
    | "builder"
    | "block-builder"
    | "subject-setup"
    | "block-builder-visual-review";
  readonly generatedBundlePath: string;
  readonly trackedBundlePath: string;
}): Promise<void> {
  const [generatedBytes, trackedBytes] = await Promise.all([
    readFile(input.generatedBundlePath),
    readFile(input.trackedBundlePath),
  ]);
  if (!generatedBytes.equals(trackedBytes)) {
    throw new Error(
      `AGENT_SELF_CHECK_BUNDLE_STALE (${input.bundleId}): '${input.trackedBundlePath}' does not match generated source output.`,
    );
  }
}
