# M5 Route Graph / Traversability 深度审查

## 1. 审查元数据

- 审查模式：Mode B change review，并补齐 D1，实际覆盖 D1–D6。
- 里程碑定位：M5 确实是“指定主体是否能沿 Required Route 实际通过”的里程碑；它包含 R0 合同、R1 Heightfield、R1b Static Platform，以及真实 fixed-tick Babylon/Havok Controller Gate。
- 变更基线：5d97128d7f4f0e2a6db43a9dd0679eba9bd7f2d0。
- M5 完成 merge：dfe0d35d40af64a03ce2f1882b8cbe8279a0ee5。
- 审查开始 HEAD：4ae1912b3e7ce0b635a4a2fc6cf0b3ae178a75e5。
- 审查期间共享 checkout 被外部切换两次，本审查未切分支：先到 main@1df2facde449540388a8b0967c27710e948c00d5，后到 cursor/workspace-structure-audit-ad0d@1b8487b5607012c82d3c6b014e5ee9f1bd587fc3。4ae1912..1df2fac 在 M5 核心只调整 traversal-runtime-port 的 control-check 顺序；最终 1b8487b 以 4ae1912 为 merge-base，只新增一份 workspace review 文档。因此本文 findings 仍严格锚定 4ae1912。
- M5 变更规模：293 files changed，91,937 insertions，755 deletions。
- 安装依赖：Babylon.js 9.21.2、Havok 1.3.14、recast-navigation 0.43.1（含仓库 patch）、lodash-es 4.18.1。
- 权威规格：
  - docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md
  - docs/superpowers/specs/2026-08-23-route-r1b-static-platform-design.md
  - docs/superpowers/specs/2026-08-21-control-feel-physics-medium-state-resolver-design.md
  - docs/superpowers/specs/2026-08-19-world-validation-report-and-quality-gates-design.md
  - docs/reviews/runtime-deep-review-checklist.md
  - docs/reviews/full-dimension-review-protocol.md

### 1.1 结论

**NO-GO：M5 当前不能继续保持 “Complete / Final GO / 无 open P0/P1” 的结论。**

冻结的 R0/R1/R1b happy-path 与 adversarial fixture 矩阵大体健康；但是矩阵之外已复现 5 个 P0：

1. 长绕路只因起终点 XZ 接近即可在 0 Tick 假通过；
2. support station 使用 post subject origin，而非 frozen contract 要求的 retained foot；
3. M5 自定义 step-up 在一个 fixed tick 内推进约 8.3 倍允许水平距离，正式成功 fixture 仍通过；
4. Build Input Receipt 接受与同一 Traversal Lock hash 不一致的伪造胶囊能力；
5. Canonical Probe Receipt 与 context validator 接受 Tick 0 ambiguous support 的 forged complete evidence。

这些问题不是“测试偶发不绿”，而是 Blocking Gate 可静默给出错误通过，或 Canonical Evidence 可被重哈希后伪造。

### 1.2 权威图

| 事实 | 冻结权威 | 下游 | 本次结论 |
| --- | --- | --- | --- |
| Required Route inventory | ExecutionPlanV5 traversal.connectivityRequirements | Orchestrator、Report | Trusted CLI 主路径完整；公开 Report 工厂未绑定 expected set |
| Traversal capability | ResolvedTraversalLockReceipt + Graph Builder Profile | Capability Envelope、Graph、Runtime | Envelope factory 正确；Build Input receipt admission 未重新绑定 Lock |
| Graph geometry | Canonical Heightfield / Static Collider triangle soup | Recast adapter、Graph evidence | 共享 emitter 正确；远端 Surface scope 与 seam-local proof 有缺口 |
| Ground support | 每 Subject 每 fixed tick 唯一 checkSupport() | Medium、Jump、Evidence | 通过，未发现 ray/AABB 第二接地路径 |
| Runtime Surface identity | retained support + canonical collider correlation | Runtime Evidence | 通过 |
| 3D support station | retained foot XYZ + monotonic path station | expected Surface、Probe receipt | 失败：runner/context 均使用 post subject origin |
| Fixed-tick displacement | locked Feel speed × fixed dt | Controller、station window | 失败：step-up 扩大 remainingTime 并先提交 pose |
| Canonical Report/Publication | Validation evaluator + context validators | CLI、Browser V5 | 部分失败：缺 route-set binding、MIME/status closure 与 forged receipt rejection |
| Resource lifetime | Runtime owned disposer stack | Controller、Havok native handles | 部分失败：pre-existing partial-construction leak |

### 1.3 自动化证据

审查锚点 4ae1912：

| 命令 | 结果 |
| --- | --- |
| pnpm typecheck | exit 0 |
| focused Route Probe/Receipt tests | exit 0，2 files / 47 tests |
| pnpm build | exit 0，Vite built in 1m58s；仅大 chunk warning |
| pnpm verify:route-r0-contract | exit 0，8 项 |
| pnpm verify:route-r1-heightfield | exit 0，11 fixtures；repeat/concurrent 与 30/60/120-like hashes 一致 |
| pnpm verify:route-r1b-static-platform | exit 0，11 fixtures；legacy census 0；cadence hashes 一致 |
| pnpm verify:canonical | exit 0 |
| pnpm verify:placement-layout | exit 0 |
| pnpm verify:rigged-subject | exit 0 |
| pnpm verify:g-bot-subject | exit 0 |
| pnpm test | exit 1；144/149 files、1584/1589 tests 通过 |
| 单独 route-validation-runner.test.ts | exit 1；真实 V4/V5 case 约 140s，超过 120s test timeout |

全量测试的另外四个失败为 worldkit ready timeout、Browser navigation context destroyed、grassland compile timeout、subject-preset timeout。正式 R1/R1b verifier 没有相同 timeout，因此能通过，但 R1b verifier 实际约耗时 154s。

审查期间外部刷新到 1df2fac 后：

- M5 核心 findings 文件相对 4ae1912 无语义变化；
- pnpm typecheck exit 2，主要因为新 Gameplay integration 的 workspace package symlink 尚未同步，无法解析 @whitebox-world/gameplay-contracts / gameplay / runtime-host；这不是 M5 回归，不能覆盖或改写 4ae1912 的门禁结果。

随后外部切到 1b8487b；它相对 4ae1912 只新增 workspace review 文档，未改变 M5 源码。为避免污染他人的共享 checkout，本审查没有再次切换、安装依赖或重跑重型门禁。

证据分层：本文结论使用 static-read 与 automated-contract。Canonical / Rigged / G Bot gates 生成了截图，但本次没有把截图当作 Route 通过性证据；没有声明 manual-interaction 通过。

### 1.4 Cursor 只读独立复核

- Cursor Agent CLI（Ask/read-only，chat `0bc03737-4255-47d2-9b4c-89a7ad510cbc`）返回 **CODE NO-GO**。
- 它确认六个主审假设的机制均成立，并把 0-Tick 长绕路、Lock/Envelope 未重绑定、forged Tick 0 complete 判为 P0；单节点崩溃、Path topology 合同分裂、partial-construction native leak 判为 P1。
- 分歧：Cursor 仅凭 static-read 把 retained-foot/post-origin 与 step-up 位移定为 P1，理由是它没有执行门禁假绿/窄踏面脚本。主审保留 P0：前者已在真实 fixture 观察到 6 Tick 的允许 Surface 集合分裂，且 runner/context validator 共同使用错误权威；后者已用真实 Havok success fixture 测得 0.34m 水平位移，对冻结上界 0.041m，仍被 Blocking Gate 接受。这里记录分歧，不把 Cursor 的保守定级覆盖自动化证据。
- Cursor 未把其余 P1 提升进自己的可复现清单；主审只保留已有子审查执行证据或已独立闭合的当前源码证据，不因 Cursor 未执行这些脚本而删除。

## 2. 旧结论复验

### 2.1 已失效

- docs/reviews/2026-08-24-route-r1b-static-platform-runtime-review.md 的 Final GO、无 open P0/P1 已失效。该 review 的 frozen fixtures 仍通过，但没有覆盖本文的长绕路近终点、retained-foot/post-origin 分离、每 Tick 位移上界、Envelope→Lock 重绑定和 forged Tick 0 evidence。
- docs/18-refactor-progress-and-backlog.md 对 M5 Complete 的强结论已失效，至少应回退为 reopened / blocking fixes required。
- R1/R1b “真实 Controller happy path 能走通”仍成立；“因此所有 Required Route 的通过性证据完备”不成立。

### 2.2 仍成立

- 旧 review 修复后的 wrong-collider、platform-edge support loss、runtime unmatched/ambiguous surface、30/60/120 cadence、reset/rebind、多实例 isolation 均由当前正式 verifier 复验通过。
- checkSupport() 仍是唯一 Ground authority；未重开 ray/AABB grounding、Motion 参数袋或 water medium 旁路。
- Graph/Path/Overlay 的主身份链与 canonical sorting 在已覆盖 fixture 中保持确定性。
- R1b legacy public symbol census 当前 matchCount 为 0；但它没有扫描错误的 v1+json MIME 字符串，见 P1 finding。

## 3. Findings

### [P0] [D4/D6] 长绕路可因起终点 XZ 接近而在 Tick 0 假通过

- 证据（automated-contract）：667:675:packages/validation/src/route-runtime-probe.ts 在 reset 后只比较 subject 与最终 Path point 的 XZ 距离；747:753 的逐 Tick arrival 同样不要求 support station 已进入末段。最小复现使用 16.795m 的 lower→ramp→upper 路径，起终点 XZ 距离 0.4m，结果为 complete、completionDurationTicks=0、fixedTickCallCount=0。此前独立复现的 20m U path、端点距离 0.283m 也得到同样结果。
- 期望：36:59、128:131、351:384:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md 要求主体实际完成同层/分层 Required Route，不得用终点容差跳过整条路径。
- 影响：桥下到桥面、下层到上层、围墙两侧或回环路线可以完全不移动就通过 Blocking Runtime Gate。
- 建议：arrival 必须同时要求 support station 进入最终 segment/node band、Path progress 已到终段，并且实际 support 属于最终允许 Surface。零 Tick 完成只允许 canonical Path 自身总长处于终点容差内。
- 复核：主 Agent 与 Runtime 子审查分别以独立脚本确认；Cursor static-read 确认为 P0。

### [P0] [D4] Support station 使用 post subject origin，而非 retained foot

- 证据（automated-contract）：632:639、726:733:packages/validation/src/route-runtime-probe.ts 和 1698:1735:packages/traversal/src/runtime-probe-contract.ts 都把 subjectPositionMetersXYZ 传给 station。Babylon Port 同时发布 sampledFootPositionMetersXYZ 与 post subject origin，两者并非同一 pose。最小复现中 retained foot 选择 lower surface/segment 0，subject origin 提前选择 transition + upper surface/segment 1。
- 期望：621:649:docs/superpowers/specs/2026-08-23-route-r1b-static-platform-design.md 明确冻结“每 Tick 用 retained foot XYZ”，且 expected Surface 只能由 Graph/Path 与 retained foot pose 生成。
- 影响：尚未踏上下一层时可提前允许下一层 Surface，或者过早移除当前合法 Surface；分别产生 silent false pass 与 false reject。Receipt context validator 重复相同错误，因此 forged evidence 会自洽通过。
- 建议：runner 和 context validator 一律传 characterSupport.sampledFootPositionMetersXYZ；helper 参数改名为 sampledFootPositionMetersXYZ；增加 foot/post-origin 明确分离的回归。
- 复核：主 Agent、Runtime 子审查和真实 R1b fixture evidence 共同确认；Cursor 确认合同违规机制但因未执行 false-green 脚本定为 P1，主审按上述实测保留 P0。

### [P0] [D4/D5] M5 step-up 在一个 fixed tick 内推进约 8.3 倍允许水平距离

- 证据（automated-contract + installed-source）：250:284:packages/runtime-babylon/src/motion-kernel-runtime.ts 把 remainingTime 扩到足够走过 capsule radius + keepDistance + 0.02m，再仅裁剪返回的 consumed time。安装版 Babylon 9.21.2 characterController.js:1329-1343 用扩大的 remainingTime 计算 sweep 距离，1409:1444 在返回前直接提交 landing pose。真实 success-steps-platform-ramp 在 Tick 47 的水平位移为 0.34m，而 2.4m/s、1/60s、0.001m quantization 只允许 0.041m，比值 8.29268；fixture 仍以 385 ticks complete。
- 期望：369:373:docs/superpowers/specs/2026-08-21-route-graph-and-traversability-design.md 禁止 teleport/skip；626:629:R1b 规格把 station 最大前进锁为 walkSpeed × fixed dt + quantization。
- 影响：station 落后于真实 pose，无法证明每个中间 tread/path section 被实际经过；窄踏面或中间阻挡可能被 step-up 跨过，而 Gate 仍记录 complete。
- 建议：不要通过扩大 physics time budget 获得前向 clearance。修复必须先有真实失败 fixture，并逐 Tick 断言 planar pose delta 不超过冻结上界；增加不可跳过的窄 tread/blocker。
- 复核：主 Agent重跑真实 Havok probe，数值与子审查完全一致；已对照安装依赖源码。Cursor 确认时间扩张与 pose commit 机制但因未执行窄踏面脚本定为 P1，主审按真实 success fixture 的越界位移保留 P0。

### [P0] [D4/D6] Build Input Receipt 接受与 Traversal Lock 不一致的伪造 Capability Envelope

- 证据（automated-contract）：425:527:packages/traversal/src/build-input.ts 只校验 Envelope 字段形状/范围；1002:1033 只重新解析 Graph Builder Profile；1273:1299 从 caller 提供的 Envelope 自身重算 Receipt。主 Agent从真实 R1b success receipt 克隆输入，把 capsuleRadiusMeters 从 0.32 改为 0.01，保留相同 resolvedTraversalLockHash，createRouteBuildInputReceiptV2 仍 exit 0 并生成新的合法 routeBuildInputHash。
- 期望：79:172:packages/traversal/src/capability-envelope.ts 是 Envelope 唯一派生 owner；307:312:docs/superpowers/specs/2026-08-23-route-r1b-static-platform-design.md 要求 Build Input admission/Receipt 重算并证明 Lock-derived Capability，而不是只信 Envelope 自己。
- 影响：Graph Gate 可按伪造的小胶囊、坡度或步高构图，Runtime Gate 仍按真实 Lock 运行；两道 Blocking Gate 虽携带同一 Lock hash，实际证明的是不同能力合同。
- 建议：Build Input context/admission 必须接收 canonical ResolvedTraversalLockReceipt 和 Graph Builder receipt，重新调用唯一 Envelope factory并逐字节比较；所有 Lock-derived 字段做篡改单元表。
- 复核：Contract 子审查发现，主 Agent用真实 receipt 独立重跑确认；Cursor static-read 确认为 P0。

### [P0] [D4/D6] Canonical Probe Receipt 接受错误 Tick 0 support 的 forged complete evidence

- 证据（automated-contract）：813:827:packages/traversal/src/runtime-probe-contract.ts 仅在 ticks.length===0 时把 initial mismatch 计入 metrics；1527:1553 只搜索后续 Tick mismatch；1563:1571 的 complete 检查只拒绝 initial unsupported；1698:1719 的 context validator 同样只在无 Tick 时检查 initial mismatch。主 Agent从真实 385-Tick complete receipt 仅把 initial surfaceResolution 改为 ambiguous；canonicalizer 与 context validator 都接受 complete，wrongSupportSurfaceCount 仍为 0。
- 期望：642:644 及 1080 后的 Runtime oracle:R1b 规格要求 unmatched、ambiguous、wrong resolved Surface 在 Tick 0 也阻断。
- 影响：错误层、重叠 Surface 或伪造的初始 Evidence 可作为 complete Canonical Artifact 被 Report/Browser 接受。
- 建议：initial expected Surface 必须独立派生并始终计入 mismatch；complete 一律拒绝 initial mismatch；context validator 不得只在 zero-tick 分支校验。
- 复核：Contract 子审查发现，主 Agent在真实 receipt 上独立确认；Cursor static-read 确认为 P0。

### [P1] [D3/D4] 合法单节点、零边 Path 在 station helper 中抛 TypeError

- 证据（automated-contract）：286:330:packages/traversal/src/path-receipt.ts 与 113:125:path-receipt.test.ts 明确允许 one-node/zero-edge complete Path；R1b 规格第 635 行也冻结单节点语义。929:1042:packages/traversal/src/runtime-probe-contract.ts 在无 segment 时仍默认 primaryIndex=0 并读取 identities[1]/points[1]，复现为 TypeError。
- 期望：同一 Graph Node 内的不同起终 Anchor 应得到可执行 Path；若不支持必须在 Connectivity 层产生 typed failure，不能由 Runtime 基础设施崩溃。
- 影响：短而合法的 Required Route Graph Gate complete 后无法产生 Canonical Probe Receipt。
- 建议：为单节点返回 arc=0、唯一 Surface；evaluate-route 需保留实际 destination endpoint，增加同 polygon 不同 Anchor 的端到端 fixture。
- 复核：主 Agent与两个子审查均确认；Cursor static-read 确认为 P1。

### [P1] [D3] Runtime runner 额外拒绝 Canonical Path 已允许的拓扑

- 证据（static-read + automated-contract）：212:269:packages/validation/src/route-runtime-probe.ts 拒绝纯竖直 XZ-zero segment、任意非相邻重复 XZ 点和任意非相邻 XZ 自交；297:313:route-runtime-probe.test.ts 把这些值固化为 invalid。Canonical RoutePathReceiptV2 只禁止相邻 3D 完全重复；626:635:R1b 规格明确要求不相邻自交 segment 不能扩大 tie set，而不是把整条 Path 判 invalid。
- 期望：Canonical Path 与 Probe admission 使用同一个关闭合同。当前 walk-only driver 若不支持纯竖直边，应由 Graph/Path contract 明确禁止或返回 typed failure；分层 Path 的 XZ 自交必须由 3D station window 正确处理。
- 影响：合法的分层交叉/回转 Path 会 fail closed 为基础设施输入错误，跨包合同不一致。
- 建议：删除未冻结的 topology blanket rejection，或在 Canonical Path/Graph 边界原子冻结相同限制；增加多层 XZ crossing 与 single-node regressions。
- 复核：主 Agent对拍当前源码、测试和冻结规格确认；Cursor static-read 确认为 P1。

### [P1] [D3] 远端已绑定平台会让无关 Required Route 的 Build Input admission 失败

- 证据（static-read）：992:1010:packages/traversal-recast/src/heightfield-source.ts 把 Execution Plan 的全部 Traversal Surfaces 放入每条 route 的 Build Input；790:808、1110:1120 却只保留与当前 hard ribbon 相交的 Static Colliders。980:997:packages/traversal/src/build-input.ts 又要求每个非 Heightfield Surface join 当前 staticColliders row。子审查在 z=0 地面路线加入 z=100 合法平台后稳定得到 ROUTE_BUILD_INPUT_INVALID。
- 期望：Surface 与 Collider inventory 必须采用同一完整世界或同一路线 scope；无关合法平台不得污染另一条 Required Route。
- 影响：多路线/多平台世界出现无关 false reject，规模越大越容易触发。
- 建议：统一 route-scoped Surface + Collider 筛选规则，或统一使用完整世界 inventory；增加 route 外绑定平台 fixture。
- 复核：Contract 子审查执行复现，主 Agent独立核对当前 join/scope 源码；Cursor 未执行该复现，因此未纳入其清单。

### [P1] [D3/D4] 分层端点歧义被 provider nearest polygon 静默消解

- 证据（static-read）：631:680:packages/traversal-recast/src/evaluate-route.ts 对起终点只调用 findNearestPolygon 并接受单个 provider polygon；query-provider 公共 seam 不返回全部候选；696:730:packages/traversal/src/connectivity-result.ts 也没有 ROUTE_CORRIDOR_LAYER_AMBIGUOUS reason。
- 期望：127:131:Route 规格要求同 XZ 多层端点命中无法唯一选择时返回 ROUTE_CORRIDOR_LAYER_AMBIGUOUS，禁止 nearest/highest/mesh order。
- 影响：桥面/桥下或 stacked platform 的路线可从错误层开始，结果还可能依赖 provider/tile 顺序。
- 建议：endpoint admission 先用 canonical Surface query 枚举/消歧层，再把唯一 Surface 约束交给 provider；反转 polygon/tile 顺序的结果必须稳定。
- 复核：Contract 子审查与主 Agent static-read 确认；Cursor 未执行 endpoint-order 复现，因此未纳入其清单。

### [P1] [D3/D4] 跨 Surface seam 证明不是 edge-local，step 也使用错误采样点

- 证据（static-read）：1298:1340:packages/traversal-recast/src/build-graph.ts 用仅含两个 Surface ID 的 seamCache，并对整对 triangle soups 求全局最小 XZ gap；同一 Surface pair 在远处相接会让当前位置的 gap edge 通过。stepHeight 又在两个 Node centroid XZ 采样，而不是当前 portal/boundary。149:166:adapter-identity.ts 却声明 portal endpoint discontinuity。
- 期望：799:807:R1b 规格要求每条 edge 的 canonical boundary evidence；存在水平 gap 不得发布 edge，step 使用当前 portal 高差。
- 影响：可能形成真实物理 gap 的 Graph false edge，或因斜坡 centroid 高差拒绝 portal 共面的合法 seam。
- 建议：cache key 必须绑定 edge-local canonical boundary/portal；gap 与 step 都在该 boundary 计算。增加“远端 exact seam + 当前 gap”和“portal 共面但 centroid 高差大”的 fixture。
- 复核：Contract 子审查与主 Agent current-source 对拍确认；Cursor 未执行 seam fixture，因此未纳入其清单。

### [P1] [D4/D6] 公开 Validation Report 可对 Required Route 严格子集静默 passed

- 证据（static-read）：75:81、1864:1901:packages/validation/src/route-evaluator.ts 的公开工厂只接收 caller rows，不接收 ExecutionPlan 或 expected route-set receipt；1926:1938 只在 rows 为空时诊断 missing，任意非空子集按 >=1 门槛聚合。Report 虽绑定 executionPlanHash，但没有 expected constraint IDs/count/hash。
- 期望：54:59:Route 规格要求每条 Required Route 都经 Graph +真实 Controller；Report 必须能独立审计 missing required rows。
- 影响：公开、可哈希的 Canonical Report/Browser publication 可以声称世界 passed，却省略 Plan 中未验证的 Route。
- 建议：引入并 hash-bind 从 ExecutionPlan 派生的 expected route-set receipt；Report、validator、Browser publication 全部拒绝 missing/extra/duplicate rows。
- 复核：Validation 子审查确认；主 Agent核对 Trusted orchestrator 当前确实遍历完整 requirements，因此这是公开合同缺口而非已证明 CLI 主路径误判；Cursor 未把它提升为独立 finding。

### [P1] [D2/D6] V2 Route JSON evidence 仍标记为 v1+json

- 证据（static-read）：1190、1226、1331、1340、1505:packages/validation/src/route-evaluator.ts 分别把 V2 Connectivity Failure、Graph、Path、Probe 标为 application/vnd.worldkit.*.v1+json；validate-v2 只检查 mediaType 是字符串，不检查 kind/schemaVersion/mediaType 闭包；legacy census 未扫描这些 MIME 值。
- 期望：R1b clean break 要求 V1/V2 bytes 与公共协议原子迁移，不保留 V1 alias。
- 影响：按 MIME 分派的消费者会调用已删除 V1 decoder 或拒绝合法 V2 bytes；Report hash 还会把错误元数据固化。
- 建议：冻结 kind + schemaVersion + mediaType 映射表，V2 四类改为 v2+json，并更新 golden hashes；RouteValidationSetReceipt 本身仍是 V1，应保留 v1。
- 复核：Validation 子审查和主 Agent源码检索确认；Cursor 未把它提升为独立 finding。

### [P1] [D5/D6] SubjectController 部分构造失败泄漏两个 Havok QueryCollector（pre-existing）

- 证据（automated-contract + installed-source）：463:483:packages/runtime-babylon/src/motion-kernel-runtime.ts 在 new PhysicsCharacterController 后仍执行可能抛错的 bootstrap/checkSupport；审查锚点 777:786:babylon-world-runtime.ts 只有构造成功后才注册 disposer。Babylon 9.21.2 characterController.js:208-209 创建两个 collectors，214:223 仅由 controller.dispose 释放。失败注入连续 3 次均 created=2、released=0，虽然 engineDisposed=true。
- 期望：runtime-deep-review checklist 要求 partial construction 和 throwing cleanup 不泄漏 native resources。
- 影响：同一进程启动失败/重试会持续泄漏 Havok handle。
- 建议：把 controller native allocation 后的配置封装为可回滚 factory，catch 时先 dispose 再 rethrow；测试精确比较 created/released handle 集合。
- 复核：Runtime 子审查发现，主 Agent独立重跑 3/3 确认。该问题早于 M5 baseline，不应标成 M5 regression，但属于当前 Runtime debt；Cursor static-read 确认为 P1。

### [P2] [D6] 正式 verifier 通过，但仓库同一真实 fixture 的测试 timeout 已稳定失效

- 证据（automated-contract）：route-validation-runner.test.ts 的真实 V4/V5 fixture 在全量测试约 197s、单独重跑约 140s，均超过 120s timeout；正式 verify:route-r1b-static-platform 约 154s 后 exit 0。
- 期望：完成门禁应在同一默认测试预算下可重复运行，不能靠“脚本没有 timeout”掩盖测试长期红。
- 影响：pnpm test 当前不能作为 release completion proof，也会放大并发运行时的浏览器/场景超时。
- 建议：先 profile 耗时来源；拆分/缓存确定性重复工作，或在有证据后调整专用 timeout，同时保留 wall-clock regression budget。
- 复核：主 Agent全量与单文件两次确认。

### [P2] [D6] Browser V2 canonicalizer 允许 complete connectivity 却没有 Path

- 证据（automated-contract）：443:452:packages/runtime-contracts/src/browser-route-evidence.ts 只校验 hasPath implies connectivity complete，没有反向约束。最小 DTO 被接受为 connectivityStatus=complete、routePathStatus=unavailable，且没有 Probe/Overlay。
- 期望：Browser summary 状态必须与 canonical child evidence 双向闭合。
- 影响：独立 DTO、夹具或非 Trusted Host consumer 可发布自相矛盾摘要；当前 Trusted Host factory 不生成该形状，因此定为 P2。
- 建议：connectivity complete 与 hasPath 双向等价；unreachable/incomplete 必须无 Path；建立状态组合表测试。
- 复核：Runtime 子审查发现，主 Agent独立重跑确认；Cursor 未把它提升为独立 finding。

### [P2] [D3/D5] 其他合同与完成声明不一致

- 证据（static-read）：
  - packages/traversal/src/lock.ts 接受 maxSlopeDegrees=90，build-input 也接受 [0,90]，但 traversal-recast/src/recast-config.ts 要求 [0,90)；
  - packages/compiler/src/compile-traversal-lock.ts 对 Medium Profile 没有像 Motion Profile 一样比较 Execution Plan contentHash；
  - docs/18-refactor-progress-and-backlog.md 一处宣称 Route R0/R1/R1b 完成，另一处仍写 Route/Browser/CI 待接入；
  - validation 中仍有 V2 | V2 重复 union、重复 interface 与旧 V1 helper dead code。
- 期望：公共 Lock 与 provider admission 一致；Compiler capability assembly fail closed；唯一进度账本和 clean-break census 与事实一致。
- 影响：90° profile 在 provider 才异常；Medium hash drift 未在 compiler 边界拒绝；后续 Agent 可能重复实现或漏修真实能力。
- 建议：原子统一 slope domain；补 Medium hash regression；修订 capability ledger；清理死分支并扩大 clean-break census。
- 复核：Contract/Validation 子审查发现，主 Agent核对当前源码；未单独提升为 P0/P1。

## 4. 维度覆盖表

| 维度 | 状态 | 证据摘要 |
| --- | --- | --- |
| D1 定位与需求边界 | 已查 | M5=Route/主体真实通过性；区分 R0、R1、R1b 与 H1/H2/H3、dynamic platform、NPC/goTo 等开放项 |
| D2 Schema 与 AI-friendly | 已查 | V2 naming/identity 主体一致；发现 MIME clean-break 与冗余声明 |
| D3 承诺与事实 | 已查 | 对拍 Route/R1b/Validation 规格、backlog、旧 review；发现 complete claim、Path topology、scope/seam/layer 差异 |
| D4 单一权威状态 | 已查 | 检查 Lock→Envelope、Graph、retained support、station、arrival、Medium；确认 5 个 P0 |
| D5 工程质量 | 已查 | 检查 installed Babylon semantics、partial construction、dispose、test timeout、dead code；发现 step-up 与 native leak |
| D6 门禁与证据分层 | 已查 | 跑 R0/R1/R1b、full tests、build/typecheck、artifact forgery probes；明确 automated 与 rendered/manual 边界 |

最终处置建议：重新打开 M5。先修复并以 failing reproducer 锁住全部 P0，再处理 P1 合同缺口；之后必须重跑 focused regressions、R0/R1/R1b、完整 pnpm test/typecheck/build、同字节 Report/Browser publication，以及真实窄踏面/分层长绕路交互证据。不能仅凭当前 11+11 fixture matrix 恢复 Final GO。
