const PLAYGROUND_STARTUP_LABEL_BY_STAGE_V1: Readonly<Record<string, string>> = Object.freeze({
  "host-resolver": "正在准备运行环境",
  "module-import": "正在加载运行模块",
  "authoring-load": "正在读取世界产物",
  "outdoor-scene-load": "正在读取场景产物",
  "runtime-create": "正在启动 Babylon Runtime",
  "runtime:engine": "正在创建渲染引擎",
  "runtime:scene": "正在创建白膜场景",
  "runtime:havok": "正在启动物理引擎",
  "runtime:terrain": "正在构建方块与碰撞",
  "runtime:subjects": "正在加载主体与动作",
  "runtime:camera": "正在绑定第三人称镜头",
  "runtime:ready": "正在进入世界",
  "visual-targets-configure": "正在绑定视觉目标",
  "adapter-mount": "正在挂载世界画面",
  "first-render": "正在完成世界首帧",
  "page-setup": "正在挂载试玩界面",
});

export interface PlaygroundStartupPresentationV1 {
  readonly phase: "loading" | "ready" | "error";
  readonly stage: string;
}

export type PlaygroundStartupPresentationEventV1 =
  | Readonly<{ type: "stage"; stage: string }>
  | Readonly<{ type: "complete" }>
  | Readonly<{ type: "fail"; stage: string }>;

export function createPlaygroundStartupPresentationV1(): PlaygroundStartupPresentationV1 {
  return Object.freeze({ phase: "loading", stage: "host-resolver" });
}

/** Keeps the startup overlay monotonic once a rendered world is ready. */
export function reducePlaygroundStartupPresentationV1(
  current: PlaygroundStartupPresentationV1,
  event: PlaygroundStartupPresentationEventV1,
): PlaygroundStartupPresentationV1 {
  if (event.type === "fail") {
    return Object.freeze({ phase: "error", stage: event.stage });
  }
  if (event.type === "complete") {
    return current.phase === "error"
      ? current
      : Object.freeze({ phase: "ready", stage: current.stage });
  }
  if (current.phase !== "loading") return current;
  return Object.freeze({ phase: "loading", stage: event.stage });
}

export function describePlaygroundStartupStageV1(stage: string): string {
  return PLAYGROUND_STARTUP_LABEL_BY_STAGE_V1[stage] ?? "正在初始化白膜世界";
}
