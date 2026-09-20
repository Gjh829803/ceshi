# 平台接口参考

核对基线：2026-09-18。依据 `server/index.mjs`、`batch-submission.mjs`、`world-list-query.mjs`、`cloud-artifacts.mjs`、`three-delivery-artifacts.mjs`。这不是未来部署的固定合同，接口变化时以当前服务为准。

## 认证

平台接受 HTTPS `Authorization: Bearer <Token>`。Token 长期有效、与所属账号拥有相同的平台权限，可随时吊销。没有名称、权限或有效期选项。旧格式 Token 仍检查签发时的到期时间，不恢复已过期或已吊销凭据。

`GET /api/auth/session` 返回 `authenticated/provider/user`；Token 认证成功时 provider 为 `api-token`，另有 `token.id`。`GET/POST /api/auth/tokens` 列出自己的 Token 或一键生成；`DELETE /api/auth/tokens/:id` 吊销自己的 Token。POST 无需参数，201 只返回仅一次可见的 `token` 和 `metadata`，与 Skill 无关。列表不返回完整 Token。完整凭据不能写进聊天、Skill 或公开发布。

`GET /api/skills/world-test-platform-operator.zip` 在已登录会话下下载通用 Skill ZIP，不要求已有 Token，也不创建 Token；包内没有凭据，固定文件名为 `world-test-platform-operator.zip`。

Token 认证复用所属账号的身份，支持平台现有接口和 HTTP 方法；个人 Token 管理仍限定为该账号自己的凭据。每次请求校验当前吊销状态。

## 选择输入和提交

| 方法与路径 | 参数/结果 |
| --- | --- |
| `GET /api/cases` | 返回 `cases[]`；使用 `id`，保留 fileName、Prompt 等实际字段 |
| `GET /api/branches` | 返回 branches、fetchedAt、warning；会尝试 Git fetch，提交前选择分支时调用即可 |
| `GET /api/branches/head?branch=…` | 查询指定分支当前 HEAD；不能用当前 HEAD 覆盖已提交任务的固定 SHA |
| `POST /api/cases` | JSON：`fileName`、图片 `dataUrl`、可选 `prompt`；201 返回 `id/fileName`。会创建用例，不支持提交幂等键，超时先核对库中记录 |
| `POST /api/generate` | JSON：必填 `branch/prompt`，可选 `caseId/title/sha/codexBackend/idempotencyKey`；202 返回 `runId/sourceId/run` 和可能存在的 `world.id` |
| `POST /api/batches` | JSON：必填 `caseIds/branch/idempotencyKey`，可选 `repeatCount/title/sha/codexBackend/prompt/casePrompts`；202 返回 `batch/worlds` |

提交的 `sha` 是完整 40 位 SHA。`codexBackend` 仅 `local/cloud`，本基线默认 `local`。批次 repeatCount 为每用例次数，1–5；任务总数为用例数乘次数。`caseIds` 不能重复。

批次 Prompt 规则：不传覆盖时使用每个用例已有 Prompt；`prompt` 为全批次统一覆盖；`casePrompts` 为按 caseId 填写的对象，必须恰好包含所有所选用例且内容非空，不能与非空 `prompt` 同传。

单任务 JSON 结构示意（值须替换为实际输入，不能直接照抄发起任务）：

```json
{
  "branch": "<用户选定的 SDK 分支>",
  "caseId": "<用例接口返回的 id>",
  "prompt": "<用户或该用例的 Prompt>",
  "codexBackend": "local",
  "idempotencyKey": "<本次逻辑提交生成并保存的 UUID>"
}
```

API 提交前保存请求内容与幂等键。相同键只重发完全相同的参数，409 请求键冲突时停止，不能换键规避。浏览器提交按钮没有暴露键时不要自行双击/重复提交；响应不明先查任务列表。

## 任务和进度

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/worlds?page=1&pageSize=20&summary=1` | 返回 worlds 和分页信息；pageSize 最大 100，支持 q、branch、status、batchId；查列表无需拉完整日志/清单 |
| `GET /api/batches` | 批次列表、状态计数及 pool；具体成员可用 worlds 的 batchId 筛选 |
| `GET /api/runs/:runId` | 准备阶段记录，跟随 `run.sourceId/worldId` 到实际世界 |
| `GET /api/worlds/:sourceId/:worldId?includeArtifacts=0` | 返回 world、attempts、progressNodes、sdkExecution、platformActivities，适合进度查询 |
| `GET /api/worlds/:sourceId/:worldId/artifacts` | 显式读取文件清单：artifacts.files、images、texts 等，以及 attempt |

路径段和 query 值分别 URL 编码。`sourceId=run` 时 `worldId` 暂为 runId，接口后续可映射到真实世界。使用最终响应中的真实标识保存下载文件。

常见状态：queued、preparing、running、stopping、ready、failed、interrupted、pending、unverified、change-requested。结合 `failedStage/error/errorDetail/diagnosticCodes` 和 `pendingReason/remoteUnresolved/resumeAvailable` 解释。只看到 failed/interrupted 但远程执行未确认结束时，不盲目重跑。

稳定页面入口：`/tasks/:sourceId/:worldId`。查看世界使用详情 UI 的“进入世界”或响应提供的入口；平台播放路由为 `/play/:sourceId/:worldId`。没有可玩交付文件可能返回 409；不能以首帧图片代替运行验收。

## 文件与完整日志

- 使用 `artifacts.files[].url`。条目包含 fileName、relativePath、bytes、source、platformAttempt；platformAttempt 可能为空，不能据此擅自归到当前尝试。
- 云存储文件 URL 指向 `/api/worlds/:sourceId/:worldId/artifact-file?area=…&path=…&version=…`。三项参数都必需，由清单提供；version 是对象键派生的版本标记，**不是文件 SHA-256**。
- 旧任务可能提供 `/sdk-artifact?file=…`，仍使用实际清单 URL，不枚举目录。
- `GET /api/worlds/:sourceId/:worldId/log` 默认至多末尾 400 KiB。下载当前平台完整 agent 日志用 `?full=1`；HTTP Range 可分段，需按 200/206 和 Content-Range 正确组装。准备阶段未建世界时可能返回准备说明，不能当完整执行日志。
- 历史尝试的日志优先按文件清单中该 attempt 的归档下载；当前 `/log?full=1` 不保证是指定历史尝试。
- Three SDK 常见独立文件：`creator-delivery.tar.gz`、`creator-result.json`、`creator-events.jsonl`、`creator-stderr.log`。以存在的文件为准；交付包不保证包含独立事件日志和 stderr。
- `/text/:name` 仅为命名文本预览，可能截断，不能替代原始文件下载。
- 下载的 302 CDN 跳转使用限时签名；本机 HTTP 客户端跨 origin 跳转时必须去掉平台认证头。下载失败先检查链接时效与文件版本，重新从平台申请；不重复创建任务。

保存原包时先检查文件大小与类型、验证压缩包结构。若要提取内容，只在用户需要时使用能防止路径逃逸和符号链接逃逸的解压方式；不能执行包内脚本来“验证完整性”。

## 浏览器操作路径

已有网页登录时：用例库选择用例 → 配置生成任务 → 选择分支/Prompt/次数 → 提交；生成任务 → 按 ID 找详情 → 执行过程查看阶段；结果与验收 → 进入世界；产物与证据 → 选文件下载；原始日志 → 下载完整日志。页面标签变化时看实际 UI，不坚持过期文字。

本 Skill 创建本身不授权新建测试任务、取消/重跑现有任务或部署平台。验证 Skill 时可检查源码合同与已有脱敏响应；真实生成须来自用户的提交请求。
