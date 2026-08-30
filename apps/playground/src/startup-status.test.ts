import { describe, expect, it } from "vitest";

import {
  createPlaygroundStartupPresentationV1,
  describePlaygroundStartupStageV1,
  reducePlaygroundStartupPresentationV1,
} from "./startup-status";

describe("Playground startup status", () => {
  it("describes the expensive Runtime phases instead of leaving FPS at a silent dash", () => {
    expect(describePlaygroundStartupStageV1("authoring-load")).toBe("正在读取世界产物");
    expect(describePlaygroundStartupStageV1("runtime:terrain")).toBe("正在构建方块与碰撞");
    expect(describePlaygroundStartupStageV1("runtime:subjects")).toBe("正在加载主体与动作");
    expect(describePlaygroundStartupStageV1("runtime:ready")).toBe("正在进入世界");
  });

  it("uses a stable fallback for an internal stage not intended for display", () => {
    expect(describePlaygroundStartupStageV1("private-provider-stage")).toBe("正在初始化白膜世界");
  });

  it("does not reopen the startup overlay after the first rendered world is ready", () => {
    const loading = reducePlaygroundStartupPresentationV1(
      createPlaygroundStartupPresentationV1(),
      { type: "stage", stage: "first-render" },
    );
    const ready = reducePlaygroundStartupPresentationV1(loading, {
      type: "complete",
    });

    expect(
      reducePlaygroundStartupPresentationV1(ready, {
        type: "stage",
        stage: "runtime:ready",
      }),
    ).toEqual(ready);
  });

  it("allows a real startup failure to replace a visually ready state", () => {
    const ready = reducePlaygroundStartupPresentationV1(
      createPlaygroundStartupPresentationV1(),
      { type: "complete" },
    );

    expect(
      reducePlaygroundStartupPresentationV1(ready, {
        type: "fail",
        stage: "page-setup",
      }),
    ).toEqual({ phase: "error", stage: "page-setup" });
  });
});
