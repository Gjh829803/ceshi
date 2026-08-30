# BNA-3 Native Package / Receipt 设计复核

- 日期：2026-08-30
- 模式：Mode A 设计规格审查
- 审查对象：
  `docs/superpowers/specs/2026-08-30-bna3-native-package-receipt-design.md`
- 精确审查 SHA：`807e2fb088524b078cdf092d00039eebdcfc2f98`
- 对照 `origin/main`：`b19f9e4be0cb56fc132cff656ade994df4e88a31`
- 独立 reviewer：Cursor Cloud Agent
  `bc-75662d06-7187-441a-9aa7-22482b0f9437`
- Cloud run：`run-19312eeb-6d9c-46ef-9603-58b6aeaad92a`
- 证据层：static-read；未运行产品门禁
- 裁决：**GO**

## 1. 裁决

设计规格已足以进入实施计划。当前审查没有未解决 P0、P1 或 P2。

核心裁决成立：Canonical 与 Babylon Native 共用一个
`WorldPackageManifestV1`、Receipt、Store、签名和 Host Policy；通过闭合
`sceneSource.kind` 区分来源。不新增 `@whitebox-world/native-world-package`，也不复制
Root、Receipt、Store 或 parser。

持久 Native Bundle、Lock、Check 和 Contribution 合同归现有 Babylon-free
`@whitebox-world/runtime-contracts`；`@whitebox-world/native-babylon` 只拥有 Author API、构造、
Authority Audit 和 Candidate Replay。该分工没有新增 Native 专用 Package 包。

## 2. 已关闭问题

独立复核确认以下问题在精确审查 SHA 上关闭：

1. Frozen Native input 显式冻结 `worldId`、`worldBounds`、`resourceBudget`，并唯一从
   Bootstrap/Attempt 全等关系取得 `seed`；禁止从 Bootstrap id、Contribution AABB 或 BNA-2
   Collider budget 猜值。
2. Clean-break census 已覆盖被替换的 Canonical Resource Lock、WorldPackage builder/input、
   Resolved artifact、membership 和 JCS helper 符号。
3. 持久 Native 合同存在唯一 Babylon-free type home，不出现第二 parser。
4. `NativeSceneModuleBundleRefV1` 只从已校验 Bundle Hash 唯一派生。
5. Asset Lock 只消费 BNA-2 当前已有的 admission/publication/build-record 证据，不伪造尚未实现的
   APA-1 envelope。
6. `@babylonjs/havok` 不进入 Native Module Dependency Lock，继续由 BNA-4 SDK Runtime 独占。
7. Asset resource kind 统一使用 `static-geometry-asset`。
8. 任务图、跨 Lane 文件、Hash/Ref、包边界、Havok import、Store 原子性和 cleanup 负向矩阵闭合。

## 3. 实施计划必须吸收的 P3

这些项目不改变设计裁决，但实施计划必须明确，且最终 BNA-3 review 重新复验：

1. 将 `canonicalWorldPackageSignatureEnvelopeV1` 与
   `canonicalWorldPackageDirectoryForStoreV1` 纳入命名 census，或逐一记录保留理由。
2. 指定 `buildTrustedBabylonNativeWorldPackageV1` Host 编排文件的独占任务 Owner；BNA3-10、20、30
   不得各自创建第二入口。
3. Frozen 校验要求 Native Bootstrap 与 World Runtime Bootstrap 的
   `initialControlledEntityId` 全等；Manifest 唯一取 World Runtime Bootstrap 值。
4. 冻结 world bounds/resource budget 的闭合验证谓词与 adversarial fixtures；这些谓词只能验证
   Host 已冻结事实，不能从几何或 BNA-2 budget 反推 Manifest 字段。

## 4. D1-D6 覆盖

| 维度 | 结果 |
| --- | --- |
| D1 定位与边界 | 通过；单一 Scene Source、BNA-4 前保持 formal rejection |
| D2 Schema / AI-friendly | 通过；闭合联合、唯一 Ref、current-only clean break |
| D3 承诺与事实 | 通过；规格和 Backlog 均保持 BNA-3 待实现 |
| D4 单一权威 | 通过；Root 后 Identity、Havok/Runtime 权威未迁入 Native Module |
| D5 工程质量 | 设计层通过；文件级 Host Owner留给实施计划闭合 |
| D6 门禁与证据 | 通过；本轮只主张 static-read 设计 GO，不冒充实现或 Runtime GO |

## 5. 下一道 Gate

用户确认该设计后，先编写 dependency-aware 实施计划并吸收第 3 节全部 P3；在此之前不得开始
BNA-3 实现。实现完成仍需 focused RED-to-GREEN、精确 SHA Cloud 全量门禁和新的独立深审。
