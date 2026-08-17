# Creator Studio：上传、生成与历史世界

## 目标

Creator Studio 是运行在用户电脑上的 WorldKit 创作入口。用户输入世界描述并可选上传一张 PNG、JPEG 或 WebP 参考图，Studio 调用本机已经登录的 Codex CLI，完成 World Planner、Plan Lock 和 World Builder 三个阶段，最终给出可游玩的白膜世界链接。

它不把 Codex 凭证、用户参考图或生成工作区上传到一个额外的业务服务。第一版只监听 `127.0.0.1`，适合个人本地创作。

## 启动

在仓库根目录运行：

```bash
pnpm studio
```

- Creator Studio：`http://127.0.0.1:4174/`
- Whitebox Playground：`http://127.0.0.1:5173/`

如果 Playground 尚未启动，Studio 会自动启动它；如果它已经存在，Studio 会复用现有实例。

### 临时公网访问

Creator Studio 不能作为纯静态站点部署后继续调用本机 Codex。完整能力采用“受保护公网隧道 → 独立 Studio 公网实例 → 本地 Codex”的方式：

```bash
WORLDKIT_ACCESS_KEY="至少16位的访问密钥" pnpm studio:public
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:4175
```

公网实例使用 HTTP Basic Auth，用户名固定为 `worldkit`，密码来自 `WORLDKIT_ACCESS_KEY`。公网 Studio 通过同源 `/play/` 代理访问本地 Playground，因此历史记录中的游玩链接也可从公网打开。访问凭证在代理到 Playground 前会被移除。Quick Tunnel 只适合体验：依赖本机在线，URL 与进程生命周期绑定；正式长期服务需要具名 Tunnel，或改造成“云端任务队列 + 本地出站 Worker”的架构。

## 数据流

```text
Prompt + optional image
        ↓
Creator Studio local API
        ↓
single-job queue
        ↓
scripts/run-scene-agent.sh
        ↓
isolated World Planner Agent
        ↓
WorldSpec + WorldPrompt + Entity Catalog + planning images
        ↓
hash-frozen Plan Lock
        ↓
isolated World Builder Agent
        ↓
scene implementation + tests + exported planning artifacts
        ↓
Playground ?scene=<stable-scene-id>
```

Creator Studio 不直接拼接或执行 shell 字符串。场景 ID 只允许小写字母、数字和连字符；Prompt 与图片作为独立进程参数传给现有可信启动器。启动器把指定图片复制进一次性沙箱，并继续执行仓库的 `whitebox_workspace_only` 权限、阶段写入范围和构建门禁。

## 历史记录

每个 Studio 世界保存在：

```text
apps/studio/data/worlds/<scene-id>/
  record.json
  reference.png|jpg|webp   # 仅上传图片时存在
  agent.log
```

运行时数据默认被 Git 忽略，但不会因刷新页面或重启 Studio 消失。启动时，Studio 还会扫描 `artifacts/scenes/*/manifest.json`，将已有的 `verified` 场景作为可游玩历史自动导入。

每条历史记录的详情页同时聚合视觉产物：用户参考图、世界俯视规划图、进入视角规划图、SDK 白膜首帧、样式化首帧，以及 Entity Catalog 中每个主体、标志物和客体的白膜/样式三视图与对应 Prompt。生成中的记录会随着文件落盘自动补齐，不要求刷新页面。打开已完成世界的详情页时，Studio 会用一个不可见的本地 Playground 运行时自动补导缺失的白膜首帧和白膜三视图，并展示首帧构图验收分数；样式化首帧和样式三视图仍属于后续 Visual Bible 阶段。

状态包括：

- `queued`：等待本地 Codex；
- `running`：Planner、计划冻结、Builder 或验证进行中；
- `ready`：场景实现和导出工件验证通过；
- `failed`：Agent 或门禁失败，可查看日志并重试；
- `interrupted`：Studio 在任务完成前退出，可手动重试。

队列一次只运行一个世界，避免两个 Agent 同时修改场景目录和注册表。Studio 重启时不会假装仍在执行已丢失的子进程，而会把这类记录明确标记为 `interrupted`。

## 当前边界

- 页面生成的是当前第一期支持的室外高度场白膜世界；室内、载具、NPC 行为与运行时世界导演仍不在本入口的生产能力内。
- Studio 在 Builder 通过后标记白膜可游玩；打开详情页会自动导出白膜首帧和白膜三视图并给出构图评分。样式三视图与最终渲染首帧仍属于后续 Visual Bible 阶段。
- 公网入口必须使用访问密钥和安全反向通道，不能让匿名公共网页任意访问本机 Codex。当前 Quick Tunnel 是本机在线期间的临时体验入口，不承诺固定域名或持续在线。

## API

- `GET /api/health`：本地 Codex、pnpm、队列和 Playground 状态；
- `GET /api/worlds`：历史世界；
- `POST /api/worlds`：创建世界；
- `GET /api/worlds/:id`：单个世界与末尾生成日志；
- `POST /api/worlds/:id/retry`：重试失败或中断任务；
- `GET /api/worlds/:id/reference`：读取该记录明确保存的参考图。

创建请求使用同源 JSON：

```json
{
  "title": "可选世界名称",
  "prompt": "完整场景描述",
  "image": {
    "name": "reference.png",
    "dataUrl": "data:image/png;base64,..."
  }
}
```

图片字段可以省略。服务端重新检查 MIME、文件头和 12 MB 大小限制，不信任浏览器传入的文件名或类型。
