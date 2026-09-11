# 鼠标抬头范围修复

## 原因与实现

`packages/three-world/src/humanoid-runtime/camera.ts` 的 `orbitRadians` 将步行第三人称的俯仰下限设为 +0.12 rad。该相机以负俯仰表示抬头，因此这个下限禁止了仰视。载具第三人称原下限 -0.6 rad、越肩 -0.65 rad，也限制了向上观察。第一人称原下限 -1.35 rad。

三个模式现在共享 -85° 的抬头下限。保留现有低头范围、鼠标方向与灵敏度、座位局部偏航、T 切换、自动回正和碰撞求解。Three 0.185.1 的 `Matrix4.lookAt` 在视线与 up 平行时需要退化处理；保留距离垂直方向 5° 的余量，避免进入这个极点。地面上的第三人称仰视会按原有碰撞规则收短镜头，此时人物可能占据较大画面；没有修改主体遮挡表现。

## 验证

- 修复前新增的三种模式仰视回归均失败；实测视线 Y 分量分别为 -0.1197、0.9757、0.6052。
- 修复后验证实际相机视线 Y > 0.99、持续输入限位、反向输入回落、不同插值帧不穿地且姿态有限。
- 11 条龙使用真实模型与 Source101 骑手，分别覆盖三个模式向上观察，并继续验证眼位、飞行、T 切换和上下龙。
- 最终 Vitest 7 文件、160 项通过，退出码 0，无未处理错误。覆盖 runtime、camera-lifecycle、flying-creature-visual、input、Creator capture-plan、Episode adapter / route-controller。报告：`D:/CodexData/Artifacts/CenturyDragon/MultiDragon/camera-sky-verified-20260911.json`。
- 第一轮断言全部通过但出现 Vitest `onTaskUpdate` 超时；真实骨架测试每例结束后增加一次事件循环让出，再跑上述完整范围，无需放宽断言或超时。
- typecheck、lint、test:census、workspace-boundaries、runtime prebuild、build:editor 均退出 0。构建保留现有大 chunk 提示。
- 5194 的 D07 页面用实际鼠标拖动与 T 切换检查了步行三视角；均达到 -1.483529864 rad。第一人称显示天空，越肩视角可仰望；第三人称地面碰撞收臂，镜头高度约 0.24 m。浏览器错误日志为空。骑乘覆盖来自真实资产自动回归，未声称逐条浏览器人工检查。

## 运行时身份

- 分支：`codex/aircraft-seven-families-20260910`；基准 HEAD：`60e91174a1d762b6b867680902ad646dd2ebe1a0`，含保留的本地未提交工作。
- runtimeHash：`27e47ad97f3314fbaba4edab01c8cac21f3f11492ba23f48ba3384d10637b9b4`。
- manifestSha256：`e6bc5ac694ae6f529276fe69bc5c603baa60856192876aab19f398163b82db07`。
- 本轮未提交或推送。
