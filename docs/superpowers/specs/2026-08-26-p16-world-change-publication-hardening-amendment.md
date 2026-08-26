# P1.6 WorldChangeSet Publication Hardening 历史增补记录

## 1. 文档状态

- 状态：**Historical design amendment；consolidated；non-normative**。
- 日期：2026-08-26。
- 初次 hardening 内容提交：`main@e4da05e0a6b5d42b6fb23417616ae50cbfa8b287`。
- 唯一实施权威：
  [`P1.6 AI Schema、WorldChangeSet 与 Runtime Structural Publication 设计`](./2026-08-26-p16-ai-schema-world-change-set-runtime-structural-publication-design.md)。
- 审查记录：
  [`P1.6 WorldChangeSet Post-freeze Hardening Follow-up`](../../reviews/2026-08-26-p16-world-change-post-freeze-hardening-follow-up.md)。

本文曾作为 P16-D0 的规范性增补。它的全部决定现已折回核心规格，本文只保留问题发现与迁移
索引，不再覆盖核心规格，也不能单独作为实现输入。若本文摘要与核心规格冲突，以核心规格为准。

## 2. 已收口的四个问题

1. **Runtime publication 可能绕过已批准 Candidate。** 核心规格 §10.2 现在要求
   `publish-runtime` 必须引用仍有效、已通过完整 Gate 的 Dry Run Candidate；只有
   `authoring-only` 可以省略 Candidate ref 后重新完整 Build。
2. **Candidate expiry/GC 可能与 Apply 并发。** 核心规格 §12.2 现在要求 Apply admission 在读取
   Candidate bytes 前执行 durable compare-and-set pin；同 Request 恢复复用 pin，不同 Request
   不能抢占或共享。
3. **授权撤销存在 Commit-time TOCTOU。** 核心规格 §14.2 与 §16.2 现在要求 admission 和 durable
   commit 前两次验证 Session、World、Scope、authorization epoch 与 Policy Hash；Commit 前漂移
   保留旧世界，Commit 后撤权不反转已提交事实。
4. **Rejected Apply Receipt 丢失请求意图。** 核心规格 §10.3 现在使用 mode-specific closed union；
   Apply rejection 保留 `requestedOutcome`，所有 rejection 明确
   `publicationMode: "none"`。

## 3. 实施时的入口

后续实现只使用以下核心规格章节：

- §10.2：Apply Request 与 required Candidate；
- §10.3：Diagnostic、Receipt 和 Rejected closed union；
- §12.2：Candidate lease、pin、expiry 与 GC；
- §13.1–13.2：idempotency journal、pin owner、recovery；
- §14.2–14.3：publication fence、Commit point、crash consistency；
- §16.1–16.2：Scope、workload budget、authorization epoch；
- §16.5：使用方端到端示例；
- §19、§21–23：Conformance、任务图与完成标准。

本历史文件中的提交 SHA 只说明发现来源，不冻结未来实施基线。实施必须从 Backlog 指向的当前
核心规格和最新 `origin/main` 创建 worktree。
