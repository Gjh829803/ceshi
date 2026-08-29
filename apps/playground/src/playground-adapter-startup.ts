import type { VisualCaptureGroupV1 } from "@whitebox-world/runtime-contracts";

export interface PlaygroundStartupAdapterV1 {
  configureVisualCaptureGroups(
    groups: readonly VisualCaptureGroupV1[],
  ): readonly VisualCaptureGroupV1[];
  setPaused(paused: boolean): void;
  mount(container: HTMLElement): void;
  render(): void;
}

export function initializePlaygroundAdapterV1<T extends PlaygroundStartupAdapterV1>(
  input: Readonly<{
    adapter: T;
    visualCaptureGroups: readonly VisualCaptureGroupV1[];
    viewport: HTMLElement;
    trackAdapter(adapter: T): void;
    setStartupStage(
      stage: "visual-targets-configure" | "adapter-mount" | "first-render",
    ): void;
  }>,
): T {
  input.trackAdapter(input.adapter);
  input.adapter.setPaused(true);
  input.setStartupStage("visual-targets-configure");
  if (input.visualCaptureGroups.length > 0) {
    input.adapter.configureVisualCaptureGroups(input.visualCaptureGroups);
  }
  input.setStartupStage("adapter-mount");
  input.adapter.mount(input.viewport);
  input.setStartupStage("first-render");
  input.adapter.render();
  return input.adapter;
}
