# BNA-3 Native Package / Receipt 实现审查

- 日期：2026-08-30
- 模式：实现候选自审；等待 exact-SHA Cursor Cloud Mode B + runtime-deep 独立复核
- 实现基线：`origin/main@620cabf6b81ecf60b3fc1bf0ac86501f79421b04`
- 当前实现 tip：`36df06b`（候选文档提交之前）
- 范围：BNA3-00、10、20、30、40、50、60；不包含 BNA-4 Runtime/Havok admission
- 当前裁决：**LOCAL GO / CLOUD PENDING**

## 1. 当前结论

BNA-3 实现候选已经建立一条唯一的 trusted Host 链路：受信工作区先经过 BNA-2 Source Admission，
随后生成确定性 Module Bundle、安装树 Dependency Lock、已发布资产 Asset Lock，再进行两次隔离
Candidate replay；只有全部闭合后才构造 Native WorldPackage Root、`WorldBuildIdentityV1` 和 Build
Receipt。统一 verifier、Store、文件适配器、Ed25519 签名与 CLI inspect 同时支持 Canonical 和 Native
判别成员。

RuntimeHost 目前只接受 verified Native Package 投影出的 Bootstrap/Bundle identity 进入纯数据 preflight，
随后以 `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED` 在 adapter preflight、Candidate、Module、Engine
或 Scene 分配前拒绝。该候选没有实现或声称 BNA-4、Havok、Gameplay Surface、可玩性或正式 Capture。

## 2. 实现闭合

### D1 定位与边界

- `scripts/native-scene/build-trusted-world-package.ts` 是唯一异步 Host 入口；纯 Package builder 不读文件、
  不执行 Module，也不依赖 Babylon。
- `packages/world-package/src/package-build.ts` 在 Root 完成后派生 Package Ref、Build Identity 和 Receipt；
  transport/signature 文件不进入 Root。
- Canonical-only Runtime、WorldChange、Validation 和 Playground 消费者均按 verified `kind` 显式拒绝
  Native，不使用 optional Plan 字段或 property probing。

### D2 合同与 AI 友好性

- 一个当前 `WorldPackageManifestV1`、Receipt、Store、Host Policy 和 verifier；`sceneSource.kind` 是唯一来源
  判别器。
- Native Package 固定绑定 Bootstrap、Bundle、Dependency/Asset Lock、Route、Attempt、completed Result、
  passed Check、Contribution、Gameplay/Runtime Bootstrap、Registry 和 legal/resource bytes。
- 未引入 Native 专用 WorldPackage 包、旧字段 alias、第二 parser 或 V1/V2 并行路径。

### D3 承诺与事实

- Native Package 可以 build/read/verify/store/sign/inspect；正式 Runtime load 仍稳定拒绝。
- BNA-4 至 BNA-8、BWB-3+、Hosted 隔离、AI 评测、Capture/Route/Nav 继续开放。

### D4 单一权威

- BNA-2 继续独占 Source/Authority Audit/Candidate Replay；BNA-3 只消费其结果。
- SDK Runtime 继续独占 Havok、Subject、Camera、Input、Tick 和正式 Candidate 生命周期。
- Dependency Lock 明确排除 Havok；Native Module 不获得 Engine、Render Loop 或物理权威。

### D5 工程质量

- Bundle、依赖、资产、Root、Receipt 和 Store 均以 canonical bytes/hash 和 exact-set closure 验证。
- 临时 Bundle 与 Candidate 失败路径保留 cleanup；Store/File 继续使用已有原子 publication 机制。
- Native/Canonical Root 互相夹带 shadow 文件即使重算自洽 Root/Identity 也会被 verifier 拒绝。

### D6 门禁与证据

本地只运行受影响聚焦门禁，没有重复运行整仓重型链路：

| 命令 | Exit | 结果 |
| --- | ---: | --- |
| Native Bundle/Dependency/Asset/Input 聚焦 suites | 0 | Bundle 双 root、锁、双 replay、cleanup 与负向矩阵通过 |
| `pnpm exec vitest run packages/world-package/src/package-build.test.ts` | 0 | 6/6 |
| Package directory/store/file/signing/CLI 五个 suites | 0 | 39/39 |
| `pnpm exec vitest run packages/runtime-host/src/runtime-host-lifecycle.test.ts` | 0 | 34/34 |
| `pnpm test:census` | 0 | 333 files：297 contract + 36 resource-heavy |
| `pnpm verify:unreleased-clean-break` | 0 | forbidden match 0 |
| `pnpm verify:bna1-clean-break` | 0 | diagnostics 0；保留 pre-allocation guard |
| `pnpm verify:bna2-clean-break` | 0 | diagnostics 0 |
| `pnpm verify:workspace-boundaries` | 0 | 49 个既有登记 debt；无新增跨包私有源码依赖 |
| `pnpm typecheck` | 0 | `tsc --noEmit` 通过 |
| `git diff --check` | 0 | 通过 |

门禁过程中曾发现两项并已在候选中修复：BNA-1 allowlist 漏登记已经存在的 Alpha split-jump evidence；
Native 测试 fixture 曾直接跨包引用私有源码，现已统一经 `@whitebox-world/world-package/testing`。

## 3. 开放风险与下一 Gate

当前没有已知未解决的本地 P0/P1/P2，但 **BNA-3 尚未完成**。必须把包含本文的精确候选 SHA 推送，
分别交给 Cursor Cloud 执行全量门禁和独立 Mode B + runtime-deep 审查。任何产品代码修复都使旧 GO
失效并需要新 SHA；仅审查结果、链接和 Backlog 真相更新可按文档门禁处理。

Cloud GO 后才可创建 PR、合入 `main`，并把 BNA-3 标记完成。下一项产品开发只能是 BNA-4 或依赖
BNA-3 的 BWB-3，不能在本候选中提前删除 RuntimeHost capability rejection。
