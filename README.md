# Three SDK 与数据生产

Agent 使用普通 Three.js 创建简洁可玩的白模，复用或修改人物、动作、物理与镜头能力。
环境以白色、浅灰基本体块和均匀基础照明为主，少量关键标志物或交互目标使用识别色。
保留参考图的大体构图、尺度、空间关系及真实碰撞和动作条件。
人形默认保留 `humanoid.source-101` 提供的可见模型、骨架与动作；其他主体优先复用，
没有合适的再自绘 Mesh 并绑定能力。Creator 自检以核心功能覆盖决定长度。

```mermaid
flowchart LR
  A[原图与需求] --> B[Agent 创作 Mesh 与场景]
  B --> C[绑定主体与动作 · 用户操作]
  C --> D[Creator 自检与交付]
  D --> E[Episode 规划 · 真实动作录制]
  E --> F[6 × 30 秒 · 10 套风格]
  F --> G[视频输入与请求准备]
```

Agent 按四层使用：**直接复用 → 场景与能力绑定 → 参数配置 → 源码修改**。
按键、Agent 指令和录制共用执行逻辑；能力说明明确前置条件、场景要求和实际结果。
当前视频流程执行到 Seedance 提交前。

- [文档索引](docs/README.md) · [设计与职责](docs/three-sdk-architecture.md)
- [SDK 用法与动作条件](packages/three-world/README.md)
- [Creator 创作工具](scripts/three-creator/README.md) · [云生成](scripts/cloud/three-eval-README.md)
- [Episode 录制与素材](scripts/three-episode/README.md) · [生产流程](docs/three-sdk-data-production.md)

```sh
pnpm install --frozen-lockfile
pnpm dev
```

本地训练场默认地址为 `http://127.0.0.1:5175/`，展示完整人物、19 个载具和三张
示例地图。修改源码后重启服务；项目参数保存在 `profiles.json`，界面支持导出。
`?debugProfiles=1` 可加载浏览器本地调试参数，正式交付使用项目配置。

独立集成示例位于 [character-actions](examples/three-creator/character-actions/main.ts)
和 [training-independent](examples/three-creator/training-independent/main.ts)。
`pnpm test:training:browser` 检查工作台，`pnpm test:training:delivery` 验证真实浏览器
自检、交付和独立 Episode 消费；后者需要 FFmpeg/ffprobe。

```sh
pnpm three:creator:prebuild --profile three-sdk --output .codex-tmp/three-runtime
```

构建与本地验证不启动云生产。外部运行配置和任务身份见各组件说明。
