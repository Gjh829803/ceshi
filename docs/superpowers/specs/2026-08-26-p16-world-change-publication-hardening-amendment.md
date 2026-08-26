# P1.6 WorldChangeSet Publication Hardening Amendment

## 1. 文档状态与优先级

- 状态：**Detailed design amendment；implementation not started**。
- 日期：2026-08-26。
- 基线规格：[`P1.6 AI Schema、WorldChangeSet 与 Runtime Structural Publication 设计`](./2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md)。
- 基线提交：`main@f4b2013c189fd912fea14863241764755d167330`。
- 审查记录：[`P1.6 WorldChangeSet Post-freeze Hardening Follow-up`](../../reviews/2026-08-26-p16-world-change-post-freeze-hardening-follow-up.md)。

本文是 P16-D0 的规范性增补。若本文与基线规格的 §10.2、§10.3、§12.2、§13.2、§14.2–14.3、§16.1、§18、§19、§21–23 冲突，以本文为准。其余章节继续由基线规格拥有。

本文只消除 Runtime publication 的批准、Candidate 生命周期、授权并发和 Receipt 可审计性歧义；不新增 Runtime Spawn、Terrain Hot Apply、普通 Browser API、生产代码或能力声明。

## 2. 决策摘要

1. `publish-runtime` Apply **必须**引用一个仍有效、已通过完整 Gate 的 Dry Run Candidate；调用方不能跳过审阅候选并要求 Host 在 Apply 内隐式重建后直接发布。
2. Apply admission 必须原子地把 Prepared Candidate lease pin 到 durable Request ID；被 pin 的 Candidate 在请求终态或 recovery cleanup 之前不得过期或被 GC。
3. Apply 在 admission 和 durable commit point 前都必须复验 Edit Session、World binding、所需 Scope、authorization epoch 与 `authoringEditPolicyHash`。Commit 前授权漂移稳定拒绝；Commit 后撤权不能反转已提交事实。
4. Rejected Receipt 必须保留 Apply 的 `requestedOutcome`，并显式声明 `publicationMode: "none"`，使审计、Explain 和重试逻辑不依赖重新读取原始 Request。

## 3. Apply Request clean break

`WorldChangeApplyRequestV1` 冻结为：

```ts
type WorldChangeApplyRequestV1 =
  | (WorldChangeRequestBaseV1 & Readonly<{
      mode: "apply";
      requestedOutcome: "authoring-only";
      preparedCandidateRef?: string;
      runtimeExpectation?: never;
    }>)
  | (WorldChangeRequestBaseV1 & Readonly<{
      mode: "apply";
      requestedOutcome: "publish-runtime";
      preparedCandidateRef: string;
      runtimeExpectation: RuntimePublicationExpectationV1;
    }>);
```

规则：

- `authoring-only` 可以携带有效 Candidate ref，也可以省略 ref 后重新运行完整 Candidate Build；它仍不得在存在 active Runtime binding 的 Hosted workspace 中提交 Authoring head。
- `publish-runtime` 必须同时携带 `preparedCandidateRef`、`runtimeExpectation`、`authoring.change.apply` 与 `authoring.runtime.publish` Scope。
- `publish-runtime` 引用的 Candidate 必须来自同一 `worldId`、同一 ChangeSet/Base、同一 secret-free Edit Policy、同一 Registry/Compiler/Gate identity，并且 Dry Run Receipt 已达到 `status: "succeeded"`。
- Candidate 已过期时，调用方必须创建新的 Dry Run Request，并在新的 Candidate 上创建新的 Apply Request ID；Host 不得在原 Apply 内隐式重建，也不得延长或复活原 ref。
- Candidate 绑定漂移继续返回 `WORLD_CHANGE_PREPARED_CANDIDATE_STALE`；不存在或 lease 到期继续返回 `WORLD_CHANGE_PREPARED_CANDIDATE_EXPIRED`。

## 4. Candidate pin、过期与 GC

### 4.1 Pin identity

Host 在 Apply admission 通过 Schema、Request idempotency、Session/Scope、World/Base 与 Candidate binding 检查后，必须在读取 Candidate bytes 或创建 Replacement Runtime 前执行一次原子 pin：

```ts
interface PreparedCandidatePinV1 {
  readonly preparedCandidateRef: string;
  readonly authoringEditSessionId: string;
  readonly requestId: string;
  readonly requestHash: `sha256:${string}`;
  readonly authoringEditPolicyHash: `sha256:${string}`;
  readonly pinnedAtUnixMilliseconds: number;
}
```

`PreparedCandidatePinV1` 是 Host persistence 内部记录，不进入公共 Request，也不成为调用方可伪造的权限对象。

### 4.2 Pin 规则

- Pin 是 compare-and-set：只有 Candidate 存在、未过期、未被另一非终态 Request pin、全部 binding 仍匹配时成功。
- Pin 成功后，该 Candidate 不受普通 lease expiry/GC 影响，直到绑定 Request 写入 terminal Receipt，或 crash recovery 明确把该 Request 判定为可清理。
- 同一 Request ID 的幂等恢复复用同一个 pin；不同 Request 不能抢占或共享 pin。
- Host 不得因为 Apply 运行时间较长而静默修改 Dry Run Receipt 中的到期时间，也不得生成同 ref 的新 Candidate bytes。
- Commit 前 Rejected、Runtime Prepare 失败或 recovery abandon 必须释放 pin，并按 Ownership cleanup 规则清理 Candidate/Runtime lease。
- Durable commit 后，Candidate 由 committed revision/Package ownership 接管；pin 的释放不能删除已提交制品。

## 5. 授权 epoch 与 commit-time revalidation

### 5.1 Host authority state

Trusted Host 为每个 Authoring/Edit Session 维护单调的 `authorizationEpoch`。以下变化必须推进 epoch：

- Session 显式撤销；
- Session 到期；
- World allowlist、Scope、Registry Lock、Capability Set、Projection Profile、Gate Profile、资源预算或 workload budget 被替换；
- 任何会改变 `authoringEditPolicyHash` 的 secret-free policy 变化。

`authorizationEpoch` 是 Host 内部并发控制值，不进入 ChangeSet 或 Candidate bytes；`authoringEditPolicyHash` 继续进入 Receipt 与 Candidate binding。

### 5.2 两次授权检查

Apply 必须在两个位置检查授权：

1. **Admission check**：Request 进入 durable journal 后、Candidate pin 前，验证 Session active、未过期、允许 `worldId`、具备所需 Scope，并记录当前 authorization epoch 与 policy hash。
2. **Commit check**：在 exclusive per-World publication fence 内、durable commit transaction 前，重新验证 Session active、World binding、所需 Scope、authorization epoch 与 policy hash均未漂移，同时复验 revision/runtime/activity CAS。

Commit check 失败时：

- 返回 Rejected Receipt，`failurePhase: "authorization"`；
- Diagnostic 使用 `WORLD_CHANGE_AUTHORIZATION_STALE`；
- 销毁未发布 Replacement Runtime，释放 Candidate pin；
- 旧 revision head、旧 Runtime 与旧 WorldSession 继续运行；
- 不写 commit record，不产生部分 publication。

Durable commit transaction 成功后，后续 Session 撤销、Scope 移除或 Policy 变化不能把 Committed Receipt 改写为 Rejected，也不能回滚已发布 Runtime；它们只影响后续 Request。

## 6. Diagnostic 增补

`WorldChangeDiagnosticCodeV1` 增加：

```ts
| "WORLD_CHANGE_AUTHORIZATION_STALE"
```

`WorldChangeDiagnosticDetailsV1` 增加关闭分支：

```ts
| Readonly<{
    kind: "authorization-stale";
    reason:
      | "session-expired"
      | "session-revoked"
      | "scope-removed"
      | "policy-hash-changed";
  }>
```

公开 Diagnostic 不泄漏 principal、token、原始 Policy、内部 ACL、堆栈或 Provider 对象。

## 7. Rejected Receipt closed union

基线中的单一 `WorldChangeRejectedReceiptV1` 被以下关闭联合替换：

```ts
interface WorldChangeRejectedReceiptBaseV1
  extends WorldChangeReceiptBaseV1 {
  readonly status: "rejected";
  readonly publicationMode: "none";
  readonly failurePhase: WorldChangeFailurePhaseV1;
  readonly currentAuthoringSpecHash?: `sha256:${string}`;
  readonly conflictingIds?: WorldChangeAffectedIdsV1;
}

type WorldChangeRejectedReceiptV1 =
  | (WorldChangeRejectedReceiptBaseV1 & Readonly<{
      mode: "validate" | "dry-run";
      requestedOutcome?: never;
    }>)
  | (WorldChangeRejectedReceiptBaseV1 & Readonly<{
      mode: "apply";
      requestedOutcome: "authoring-only" | "publish-runtime";
    }>);
```

规则：

- 所有 Rejected Receipt 的 `publicationMode` 恒为 `none`；被拒绝的请求没有结构发布事实。
- Apply Rejection 必须原样保留 Request 的 `requestedOutcome`。
- `requestedOutcome` 不能出现在 Validate/Dry Run Receipt 中。
- Parser 必须拒绝缺失、额外或与 `mode` 不一致的字段；不保留未发布宽松形状的 Alias。

## 8. Full Reload publication 流程修订

基线 §14.2 的固定流程在 publication fence 内增加授权复验：

```text
Candidate Dry Run succeeded
  → Apply admission + atomic Candidate pin
  → verify Runtime expectation and zero active Runtime Activity
  → preflight temporary dual residency budget
  → create Replacement Runtime/WorldSession in isolation
  → await Candidate World Ready
  → acquire exclusive per-World publication fence
  → recheck revision head + RuntimeSession + WorldSession + Package + activity epoch
  → recheck active Edit Session + World binding + required Scopes
  → recheck authorization epoch + authoringEditPolicyHash
  → persist commit record + new revision head + immutable Receipt in one transaction
  → synchronously swap RuntimeHost handle
  → release fence and publish new Snapshot + stored Receipt
  → dispose old Runtime and report cleanup independently
```

Candidate pin 不替代 publication fence；前者保护 Candidate 生命周期，后者保护 revision/Runtime 的唯一 Commit point。

## 9. Conformance 增补

P16-A0、P16-P1、P16-R1、P16-H1 与 P16-F1 的必需 Gate 增加：

- `publish-runtime` 缺少 `preparedCandidateRef`、缺少 `runtimeExpectation`、或携带不匹配 Candidate ref 时 parser/admission 稳定失败；
- `authoring-only` 省略 Candidate ref 时执行完整 Build，而 `publish-runtime` 绝不走该隐式路径；
- Candidate 在 expiry/GC 与 Apply pin 同时发生时只有一个确定赢家；成功 pin 后 bytes 在 Request 终态前始终可用；失败 pin 不读取 Candidate bytes、不创建 Runtime；
- 同 Request retry 复用 pin，不同 Request 无法抢占；Rejected/recovery cleanup 释放 pin且不泄漏制品；
- Session 在 admission 后、commit 前分别发生 expiry、explicit revoke、Scope removal、policy-hash change 时全部稳定拒绝，旧世界继续运行；
- durable commit 后立即撤权仍返回同一 byte-identical Committed Receipt，新 WorldSession 不回滚；
- Rejected Receipt 的四个模式/意图分支 round-trip、unknown-key、missing-key 与 Alias negative tests；
- Explain 能区分 Candidate expired/stale、authorization stale，以及 authoring-only/publish-runtime 的失败意图。

## 10. 实施任务边界修订

- **P16-A0**：冻结并测试 required publication candidate、mode-specific Rejected Receipt、`WORLD_CHANGE_AUTHORIZATION_STALE` 与关闭 details。
- **P16-P1**：实现 Candidate lease metadata 与 pin port；Candidate bytes 的读取必须发生在成功 pin 之后。
- **P16-R1**：持久化 Request admission epoch/policy hash、Candidate pin owner 与 terminal release/recovery sweep。
- **P16-H1**：在 publication fence 内执行 commit-time authorization/CAS revalidation，并保证 durable commit 后撤权不反转结果。
- **P16-CLI1 / P16-B1**：live publication 工作流必须先 Dry Run，再用新 Apply Request ID引用返回的 Candidate ref；断线后按原 Request ID 对账。
- **P16-F1**：把 pin/GC race、commit 前撤权和 post-commit revoke 加入真实 Host/Browser adversarial evidence。

## 11. 最终冻结判断

1. Runtime publication 只能发布调用方明确 Dry Run 并批准的精确 Candidate。
2. Prepared Candidate ref 不是权限凭证；Scope 与授权在 admission 和 Commit 前都必须成立。
3. Candidate pin 与 publication fence 是两个不同的原子边界，缺一不可。
4. Commit 前撤权保留旧世界；Commit 后撤权不能篡改已提交事实。
5. Rejected Receipt 自身足以解释请求模式、Apply 意图与“未发布”结果。
6. 本增补不改变 Full Reload-first、Incremental-later、Browser V5 exact 39 keys 或 implementation-not-started 状态。
