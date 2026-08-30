# BNA-3 Native Package / Receipt 实现审查

- 日期：2026-08-30
- 模式：实现候选自审 + exact-SHA Cursor Cloud 全量门禁 + Mode B/runtime-deep 独立复核
- 实现基线：`origin/main@620cabf6b81ecf60b3fc1bf0ac86501f79421b04`
- 最终产品 SHA：`9fe9e6e3b78b894fdb9089e6e8e718537f7675f2`
- 主干合入 SHA：`2fd8c1c2694a861e213ad2c72e9cb3aefec087ce`（PR #56）
- 范围：BNA3-00、10、20、30、40、50、60；不包含 BNA-4 Runtime/Havok admission
- 当前裁决：**GO；BNA-3 完成，BNA-4 继续保持 fail-closed**

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

## 3. Exact-SHA Cloud 证据与最终裁决

最终候选 `9fe9e6e3b78b894fdb9089e6e8e718537f7675f2` 在推送后交给两个相互独立的 Cursor Cloud Agent，
没有复用较早 SHA 的 GO：

| 责任 | Agent / Run | 结果 |
| --- | --- | --- |
| 全量门禁 | `bc-40e063a1-0a5c-4d76-93dd-72e39d69425d` / `run-93155bef-681e-423f-a1de-f557c613474f` | GO；安装、自检 bundle、TypeScript、Studio、Independent、整仓测试、两套 Build、BNA clean-break、workspace boundary 和 clean tree 全部通过 |
| Mode B + runtime-deep 独立审查 | `bc-ea3897a1-c50f-43a7-9b32-94844dcb3751` / `run-9bcb5d9c-11ec-46fb-aafd-10bb03f46325` | GO；无 P0/P1/P2；正式 Native Runtime/Havok 仍按 BNA-4 边界 fail-closed |

全量门禁的整仓测试 census 为 333 个文件：297 个 contract、36 个 resource-heavy；contract 为
3609 pass / 3 skip，resource-heavy 为 559 pass。Cloud 独立审查复验了 Package Directory 8/8 和
Simulation Take identity golden 1/1。

候选期间独立复核发现一个 P2：Canonical Package 在省略 `authoring-spec.json` 时，verifier 没有把
`sceneSource.authoringSpecHash` 与解析后的 `executionPlan.authoringSpecHash` 绑定。最终 SHA 已加入
自洽伪造 Root 的 RED 回归，并在唯一 verifier 边界修复；修复后的 Package Directory、Simulation Take、
TypeScript、自检 bundle parity 与 clean-tree 证据重新通过。该 P2 已关闭，没有遗留兼容路径。

PR #56 已合入 `main`，`9fe9e6e3b78b894fdb9089e6e8e718537f7675f2` 是
`origin/main@2fd8c1c2694a861e213ad2c72e9cb3aefec087ce` 的祖先。BNA-3 因此完成。下一项允许移除
正式 Native capability rejection 的工作只有 BNA-4；BNA-3 不声称 Native 已可玩、拥有 Havok admission
或已通过 Hosted/Route 生产 Gate。

独立审查仅记录非阻断 P3 线索：transport metadata 常量与目录拒绝规则可进一步合并、Bundle chunk
能力与单文件 builder policy 可收紧、RuntimeHost bundle-ref 格式检查可复用唯一 parser、Host 错误保真和
候选审查文档指针可改善。BNA-4 只处理与其单一 Runtime/生命周期边界直接相关的项，不借机扩张范围。
