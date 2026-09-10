# 双板滑雪

参考视频中的站姿双板与雪杖，资产 ID 为 `vehicle.ski`。工作台资产库中选择
“双板滑雪”，可在“滑雪与雪橇坡道”准备。独立示例直接从资产目录加载 GLB。

```sh
pnpm exec tsx scripts/three-creator/example-preview.ts examples/three-creator/alpine-ski 5198
```

F 穿脱双板；W 在低于 3 m/s 时撑杖起步；A/D 压刃转向；S 或 Space 制动；
松键依靠重力顺坡滑行。使用既有人物、交互距离与下车速度检查、碰撞和跟随相机。
坡道有真实碰撞，人物和载具共用 SDK 时钟。雪杖跟随原骨架手部，双板对齐脚部；
显示取样与重置不会另行推进动画或物理。

参数见 [SKI_SPEC](../../../shared/preset-content/ski.ts)：下坡限速 24 m/s，撑杖峰值加速度
5 m/s²，滑动摩擦 .18 m/s²，制动 7 m/s²，侧向阻尼 4.5 /s。
这是一套压实雪面的简化滑行模型，尚不包含深雪变形、独立双腿物理和腾空技巧。

模型源文件为 [ski-model.ts](../../../shared/preset-content/ski-model.ts)，使用
[export-ski.ts](../../../scripts/three-creator/export-ski.ts) 重新导出模型与目录哈希。
[episode.json](episode.json) 覆盖步行、穿板、撑杖、滑行、左右转向、制动、脱板、
再次步行、暂停与重置。Creator 负责实际录制和交付身份，Episode 使用同一运行时。
