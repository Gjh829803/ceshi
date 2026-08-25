import type { RuntimeCaptureTargetV1 } from "@whitebox-world/runtime-contracts";

export interface PlaygroundStartupAdapterV1 {
  configureVisualCaptureTargets(
    targets: readonly RuntimeCaptureTargetV1[],
  ): readonly RuntimeCaptureTargetV1[];
  mount(container: HTMLElement): void;
  render(): void;
}

export function initializePlaygroundAdapterV1<T extends PlaygroundStartupAdapterV1>(
  input: Readonly<{
    adapter: T;
    visualCaptureTargets: readonly RuntimeCaptureTargetV1[];
    viewport: HTMLElement;
    trackAdapter(adapter: T): void;
    setStartupStage(
      stage: "visual-targets-configure" | "adapter-mount" | "first-render",
    ): void;
  }>,
): T {
  input.trackAdapter(input.adapter);
  input.setStartupStage("visual-targets-configure");
  if (input.visualCaptureTargets.length > 0) {
    input.adapter.configureVisualCaptureTargets(input.visualCaptureTargets);
  }
  input.setStartupStage("adapter-mount");
  input.adapter.mount(input.viewport);
  input.setStartupStage("first-render");
  input.adapter.render();
  return input.adapter;
}
