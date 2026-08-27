# P1.6 Full Reload Production Closure

## Disposition

- Date: 2026-08-27.
- Scope: P16-G1 Full Reload 的非 Incremental production closure。
- Result: **GO for the formal Full Reload Host path; P1.6 remains open for
  P16-I1 / P16-G2 Incremental.**
- Authority: P1.6 专项规格 §21 / §22；规格头仍保持
  *Detailed design; implementation not started*，本记录不修改该状态行。
- Historical baseline:
  [`2026-08-26-p16-full-reload-g1-completion.md`](2026-08-26-p16-full-reload-g1-completion.md)
  只记录 first-slice，不再代表当前 Full Reload closure 状态。

## Closed gaps from the first slice

| First-slice gap | Closure |
| --- | --- |
| `definition-override-set` 未进 O1 | Host 将 Definition / AI Profile / Host Policy 的允许路径交集注入 journal Apply；越权路径在 Candidate Build 前 fail-closed |
| journal 只是进程内 Map | `authoring-host` 保持 WAL port；正式 `scripts/lib` composition 使用 owner-private file WAL。Playground demo 仍明确为 in-memory |
| Candidate pin 不能跨进程 | 从 durable build identity + verified immutable Package Store 重建原 lease/pin，不延长 expiry |
| Dry Run `validationReports` 恒空 | Required Gate runner 的 canonical report bindings/hash 进入 Candidate、WAL、Dry Run、Apply 与 recovery；无声明 gate 的 demo 合法为空 |
| commit 后 Host 重启无法恢复 Runtime | durable Runtime owner 按 committed RuntimeSession / WorldSession / Package Root / Tick 0 重建；身份分歧保持 fenced |
| cleanup 无 retry 队列 | WAL 持久化 `scheduled → retrying → released/quarantined`，严格递增 attempt，有界到 quarantine |
| 双 Provider round-trip 未证明 | strict JSON-schema envelope 与 function/tool envelope 经过同一 parser，得到 byte-identical Canonical WorldChangeSet 与 Hash |
| rendered 证据缺少旧世界并发与 Reset truth | Browser verifier 覆盖 Prepare 期间旧 Session 输入、commit fence、首个 Tick 0 Snapshot、可见 house、Reset 初始 inspection 与单 canvas；另有人工作业证据 |

## Authority and dependency boundaries

- `@whitebox-world/authoring-host` 不依赖 `@whitebox-world/runtime-host`。
- RuntimeHost 只拥有 Runtime lifecycle、CAS、barrier 与 handle swap；不解析 ChangeSet、
  不执行 Compiler/Gate，也不拥有 Authoring authorization。
- 正式连接点位于 trusted shell 的 `scripts/lib/durable-authoring-edit-host.ts`。
- Browser Protocol V5 仍为 exact 39 keys；Authoring/Edit 保持独立 10-member object。
- 公开 rebase 信号仍只有 `WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH`；没有
  `rebaseRequired`。
- `fixed-tick` 仍返回 `WORLD_CHANGE_PUBLICATION_MODE_UNSUPPORTED`，没有偷偷打开 Slice C。

## Evidence layers

### Automated contract and fresh-process

- focused Browser/Runtime batch: 5 files / 14 tests passed。
- Provider conformance: 9 adversarial/round-trip tests passed。
- fresh-process formal Host: pre-commit exit 后 rehydrate 同一 pin 并 commit once；
  post-commit exit 后先恢复 exact Runtime identity，再开放 revision/API，并单调恢复 cleanup。
- startup recovery rejects missing/corrupt Package、wrong identity、non-zero Tick；Receipt bytes
  在恢复前后不变。
- workspace boundary: 51 registered debt entries；test census: 278 files，247 contract，
  31 resource-heavy。

### Browser numeric and rendered evidence

`worldkit-authoring-edit-add-house.browser.test.ts` 证明：

1. stale Dry Run 只返回 `WORLD_CHANGE_BASE_AUTHORING_SPEC_MISMATCH`；
2. Candidate Prepare 未完成时，旧 WorldSession Snapshot/Package 不变，12 Tick 输入仍推进；
3. durable commit-to-swap fence 由 RuntimeHost 对抗测试拒绝 Snapshot/Event/input；
4. committed Receipt 的 current identity 与 swap 后首个可观察 Snapshot 同为新
   WorldSession、Package Root、Tick 0；
5. Runtime screenshot 与页面 canvas 都是非空 PNG，before/after 不同，Feature inspection
   包含 `house-north`；
6. 发布后主体可继续移动；Reset 恢复初始 Package 与初始 inspection，且 DOM 只有一个
   `canvas.world-canvas`；
7. `window.__WORLDKIT__` exact 39 keys，catalog 不安装 Edit API。

### Manual interaction

唯一启动路径：

```bash
pnpm worldkit run examples/authoring/basic-world.json
```

headed Chromium 中实际使用键盘和鼠标：初始 Session `.world.1` 可移动/旋转；Apply pending
时旧 Session 从 Tick 3968 推进到 3980；Receipt previous 为 `.world.1` Tick 3992，current
为 `.world.2` Tick 0。首个 post-swap Snapshot 为 `.world.2` Tick 0，Root 与 Receipt 一致，
`house-north` 可见且只有一个 canvas。新世界用键盘移动到约
`[5.680, 0.598, 30.000]`，垂直速度为 0。Reset 创建 `.world.3` 并恢复初始 Package。

人工验收同时发现旧 `basic-world` fixed spawn Y=0 会在 procedural terrain 的
`[0, 30]` 处埋入约 0.596m 并穿过 Heightfield。最终修复不是硬编码采样值，而是将
spawn 交给 S1 `inside-region + supported-by` 求解；最终 placement 保持
`[0, 0.596, 30]`，Builder self-check 与 Runtime 使用同一 support authority。

## Still open; do not claim closed

- P16-I1 Handler Registry、fixed-tick Incremental transaction、差分等价与状态保留。
- P16-G2 Incremental Final GO。
- 生产编辑器 UI、多人编辑/协作与任意未授权 Host 启动面。
- Runtime kill-plane / out-of-bounds recovery：业界通常将它作为正确 support spawn 之外的
  第二道安全线。当前 ExecutionPlan V5 不携带 Authoring `heightRangeMeters` 的 Runtime
  recovery policy；本次不硬编码阈值或擅自扩大 P1.6。应另开 Runtime Safety 设计，冻结
  bounds owner、阈值、respawn identity/Event/Receipt 与多主体策略后实现。

Full Reload closure 不是完整 P1.6 GO，也不是 Incremental、生产编辑器或新增 Browser
Protocol key 的证据。
