# Worldkit Atlas · 世界资产库

独立部署的 Next.js 全栈应用。React 管理页面和状态，shadcn/ui 提供控件，Lucide
提供图标，Three.js 仅负责模型画布。使用 Next.js 自带的 Turbopack，不使用 Vite。

应用包含资产搜索、分类和阶段筛选、分页、GLB/FBX 模型检查、骨骼高亮、线框与
白模、内嵌/独立动画播放与时间轴、来源和授权记录、校验后的资源下载。
前端通过 `@worldkit/asset-client` 读取固定快照；Next API 路由通过
`@worldkit/asset-library/registry-server` 提供同一 Registry 协议。

## 本地开发

在仓库根目录，使用 Node 22+ 和 pnpm：

```sh
pnpm install
pnpm assets:publish
pnpm dev:assets
```

打开 <http://127.0.0.1:3188/>。`/viewer/index.html?asset=...` 会跳转至新页面并保留
资产选择。开发默认读取 `asset-library/dist/published`，也可以用环境变量指定
另一个发布目录。`PORT` 可修改开发端口。

## 独立部署

```sh
pnpm build:assets
pnpm --filter @worldkit/asset-platform package
```

将 `apps/asset-platform/dist/standalone/` 整个目录复制到部署机器。它包含 Next
服务和前端静态文件，可从任意目录启动，不依赖源码仓库、pnpm、Creator 或 Playground。
发布数据单独挂载为只读目录；不把整个 `asset-library` 作为静态目录公开。

```sh
ASSET_PUBLICATION_ROOT=/srv/atlas/published \
ASSET_PUBLIC_URL=https://assets.example.com/ \
HOSTNAME=0.0.0.0 PORT=3188 \
node /srv/atlas/app/start.mjs
```

| 配置 | 用途 |
| --- | --- |
| `ASSET_PUBLICATION_ROOT` | 发布目录的绝对路径。生产必填，包含 registry.json、releases、indexes、manifests 和 artifacts |
| `ASSET_PUBLIC_URL` | 面向消费者的 Registry 根 URL；HTTPS 反向代理部署时配置，供资源地址解析使用 |
| `ASSET_ARTIFACT_BASE_URL` | 可选 CDN/对象存储根 URL，资源沿已发布的 storage_path 解析 |
| `HOSTNAME` / `PORT` | 打包服务监听地址，默认 0.0.0.0:3188 |

应用只在服务器读取这些变量，不使用 `NEXT_PUBLIC_*` 注入部署路径或凭证。
发布目录缺失时，页面显示可重试的连接错误，API 返回 503。发布新快照后重启应用
以加载新的 RegistryStore。保留被历史锁引用的发布内容。

当前服务读取已有发布数据。上传、编辑、登录权限、OSS 私有桶签名与写入仍需后续
建设；本次框架迁移不改变既有访问和发布权限。`ASSET_ARTIFACT_BASE_URL` 只配置
资源位置，不能替代私有 OSS 的鉴权。

## 协议与检查

保留 `/registry.json`、`/v1/*`、`/releases/*`、`/indexes/*`、`/manifests/*`、
`/artifacts/*`。Next 转发至现有 Registry handler，保留 POST 请求体上限、
HEAD、Range、ETag、内容哈希检查和发布路径白名单。API 不读取制作侧 subjects。

```sh
pnpm typecheck
pnpm assets:check
pnpm build:assets
pnpm --filter @worldkit/asset-platform package
ASSET_PUBLICATION_ROOT=/absolute/published pnpm --filter @worldkit/asset-platform test:integration
```

集成检查把服务包复制到临时目录运行，验证脱离仓库的服务闭包、协议响应和缺失数据
处理。界面验收使用 Codex 内置浏览器，覆盖分页、筛选、模型、骨骼、动作、资源下载
和窄屏；模型至少覆盖 GLB、FBX、内嵌动画、独立动画与无模型占位条目。

内容制作与不可变版本规则见[资产库](../../asset-library/README.md)，生产锁定清单见
[Registry 接入](../../asset-library/docs/integration.md)。
