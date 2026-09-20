# Registry / CDN 与 Whitebox 接入

内容制作源只有 `asset-library/subjects、shared、assemblies`。引擎相机、操控和手感的可编辑源在 `packages/preset-content/config/presets/subjects.json`，主体版本适配在 `config/integrations/whitebox.json`。模型尺寸、座位、轮子、碰撞代理留在内容侧。两侧通过版本和字段归属规则合并，不互相覆盖同一个字段。

## 1. 发布与部署边界

仓库根执行 `pnpm assets:publish`，会同步协议和客户端固定副本，生成 `asset-library/dist/published/`。独立资产目录内可执行：

```sh
node tools/serve.mjs --publish --prepare-only
node tools/serve.mjs --root dist/published --port 3188
```

看板地址为 `http://127.0.0.1:3188/viewer/`。`start-dashboard.cmd` 包含生成发布包和启动服务。

`dist/published` 是部署输入：`registry.json` 为当前入口；`releases/<snapshot>/registry.json` 固定历史入口；`manifests` 保存精确版本元数据；`indexes` 为可替换的检索存储；`artifacts/sha256` 为去重字节；`viewer/client` 为预览页面。不要上传整个制作目录。source、intake、migrations、原始本地路径不作为文件公开提供。

同一 ID/version 的元数据、内容事实或引用协议发生变化时，发布器拒绝覆盖；应创建新版本。先写完不可变对象，再更新当前入口。默认 audience=internal；公开发布必须符合资源中的明确再分发记录。当前只完成本地发布与服务，没有上传云端。

CDN 提供字节分发；搜索、兼容性和依赖解析由 Registry HTTP 服务提供。当前 tools/registry.mjs 使用生成 JSON，未来可换数据库。静态 CDN 本身不会执行 /v1/* 查询。

## 2. Agent 的读取顺序

协议源为 `packages/asset-contracts/index.d.mts` 与 `schemas/v1.schema.json`；客户端源为 `packages/asset-client`。库内 client/contracts 和生成客户端只读，通过 scripts/assets/sync-asset-{contracts,client}.mjs --check 查漂移。

| 操作 | HTTP / 输入 | 结果 |
| --- | --- | --- |
| searchAssets | GET /v1/assets；query、group、形态/运动/能力过滤、limit≤20、cursor | 小型摘要、next_cursor、snapshot_id；不下载模型 |
| describeAsset | GET /v1/assets/:id/versions/:version | 固定版本完整清单；v1 暂不提供 sections 投影 |
| checkCompatibility | POST /v1/compatibility/check；主体版本、Runtime 与适配上下文 | compatible / incompatible / unknown / adapter_required，以及原因和精确证据 |
| resolveAssembly | POST /v1/assemblies/resolve；assets、assemblies、purpose、runtime | 精确版本、传递依赖、哈希与 lock_digest；不下载模型 |
| materializeAssets | 客户端操作；lock、cacheRoot、可选 outputRoot/offline | 只取锁内字节，校验清单及资源 SHA-256，返回路径映射 |

```js
import {RegistryClient} from '@worldkit/asset-client';
import {materializeAssets} from '@worldkit/asset-client/materialize';
const client=new RegistryClient({registryUrl:'http://127.0.0.1:3188/'});
const page=await client.searchAssets({query:'horse',limit:5});
const detail=await client.describeAsset('creature.horse',{version:'0.1.0'});
const lock=await client.resolveAssembly({
  assets:[{asset_id:'creature.horse',version:'0.1.0'}],purpose:'runtime',runtime:null
});
const result=await materializeAssets(lock,{client,cacheRoot:'.asset-cache'});
```

通用 Agent 使用显式 runtime 声明真实支持的 contract/version、Runtime、adapter、preset 和 overrides 身份。预览成功不构成运行证据；当前库内没有标记已验证 Runtime 的主体。调用方必须处理兼容性结果。

`pnpm assets:cli search horse --registry URL`、`describe ID --version VERSION`、`resolve --manifest project.assets.json --out project.assets.lock.json`、`fetch --lock project.assets.lock.json --cache DIR [--output DIR] [--offline]` 可完成同一流程。除离线 fetch 外，各命令均需 --registry URL 或环境变量。独立库对应入口为 `node client/cli.mjs`。

## 3. Whitebox 来源与权限

| 配置 | 用途 |
| --- | --- |
| ASSET_REGISTRY_URL | 新链路 Registry 根 URL；后续远程部署使用 |
| ASSET_ARTIFACT_BASE_URL | 可选独立 CDN 根 URL，只改变传输位置 |
| ASSET_CACHE_ROOT | 可选按哈希缓存目录，默认仓库 .asset-cache |
| ASSET_LIBRARY_ROOT / 未配置来源 | 明确的本地制作/开发适配器，默认当前 asset-library |
| ASSET_LIBRARY_URL | 旧完整目录 HTTP 开发适配器；不能与 Registry URL 同时配置 |

选择 Registry 后，即使本地制作目录存在，也不会在网络失败时回退。Registry 客户端在一次会话内固定 snapshot；更换根 URL 不改变内容或锁的身份。模型下载按字节数与 SHA-256 验证，缓存再次使用也检查；离线缺失或损坏直接报错。

Creator CLI/MCP 启动先准备准入策略内的元数据，随后保持既有 assets_search / assets_describe 工具和引擎语义提示。Host 不为搜索下载 GLB，也不加载全库主体详情。POST /v1/policies/resource-scope 保留未准入资产全部历史版本的禁用哈希；Creator 的允许 ID、默认人物、custom asset 策略均不改变。依赖必须同样获得准入，且版本和清单哈希匹配冻结的策略范围。

## 4. 项目交付与回放

Registry 模式下 Creator playable 输出、Playground 构建输出都包含 project.assets.json（ResolveRequest）与 project.assets.lock.json（ProjectLock）。两者是 Host 生成文件，不接受作者伪造覆盖。锁记录精确主体、组合、完整依赖、资源哈希、Registry snapshot 与 Runtime/preset/override 身份，不包含临时 CDN URL。

Creator 将 lock_digest 纳入世界 sourceHash；Runtime 使用实际编译产物哈希。Playground 绑定 Runtime/应用源文件、被消费的配置及依赖锁身份。两者交付全部锁定资源，保留现有浏览器 ./assets/subjects|resources/<hash>.<ext> 适配 URL，并提供 artifacts/sha256 完整闭包。

SDK 模式拒绝不兼容或缺少适配器的内容。Raw 模式由作者实现行为，不宣称支持 SDK motor/physics 合同；会保留 adapter_required 诊断，但同样拒绝明确 incompatible。两者均不把技术编译成功等同于主体行为已验证。

Creator 当前每次会话从选定 snapshot 解析；写出的锁可用通用 CLI 离线重放。尚未把“导入旧锁自动切换 Creator 会话”做成作者界面。

## 5. 看板与维护

看板通过 Registry 分页、固定版本详情及已校验字节预览模型、骨骼、动作。它只依赖发布包，可与制作目录分离部署；相机/操控页显示引擎归属及未连接引擎提供器的状态，避免伪造远程预设数据。

维护入口：pnpm content:sync/check 同步制作侧 Whitebox 适配和生成 preset；pnpm assets:publish/check 生成与校验发布链路；pnpm assets:serve 启动已经生成的 Registry 看板。生成目录、项目交付目录和缓存均不是第二个可编辑资产库。

## 6. 制作契约与运行证据

主体的 assembly 可省略 bindings、facts、modules 和 authority；声明的文件引用必须存在。
新增静态模型仅保存实际资源，不默认依赖人物 motor 或相机。带骨骼或动画的模型在入库时
创建对应绑定，动作语义、挂点和运行模块由后续明确接入。

物理事实通过 `assembly.facts.physical` 指向 `facts/physical.json`；`parameters` 保存主体
几何事实，人物身体事实使用 `body`，可选模型展示事实通过 `facts.model` 引用。
[字段 Schema](../schemas/content-parameters.schema.json)声明米制长度、局部 XYZ 坐标、
正尺寸与必要数组长度；[文档 Schema](../schemas/physical-facts.schema.json)检查容器字段。
制作校验、发布和宿主合成都检查物理值；相机及操控参数仍在引擎。

`validation.evidence` 中的字符串用于格式、视觉等报告引用；声明 `runtime: verified`
必须附带结构化 RuntimeEvidence，包含资产 ID/版本、evidence_id、Runtime ID/版本/字节哈希、
adapter ID/版本、preset_digest 和 overrides_digest（无覆盖时为 null）。记录必须属于
当前资产版本。新制作与发布共用 `@worldkit/asset-contracts` 的 RuntimeValidation；
Registry 使用同一 RuntimeEvidence 定义检验运行证据。v1 读取端保留不透明的 validation
对象，允许旧的空记录、unknown 状态或仅报告路径的清单继续下载与离线回放，不修改其
字节或哈希。证据缺失、格式错误或身份不匹配时不授予兼容，返回 unknown；显式不兼容
与缺少适配器仍单独报告。兼容性只对身份完全匹配的运行上下文成立。

本次制作目录改名不改变模型字节、资产版本和既有发布清单。Registry v1 的
`sections.facts.content_profile` / `control_profile` 是已发布的传输字段，由发布器从新制作
命名转换；它们不作为新的制作入口。空绑定若已进入历史发布清单仍予以保留，避免重写
同版本身份；新入库资产按实际组件声明。运行证据或任何已发布内容发生变化时仍需新版本。

模型展示事实、挂点和碰撞体也通过同一制作读取入口校验：

| 可选文件 | Schema 与检查 |
| --- | --- |
| `facts/model.json` | [模型事实](../schemas/model-facts.schema.json)：坐垫中心为局部米制 XYZ、尺寸为三个正数，socket_ids 不重复且引用实际声明的挂点 |
| `bindings/sockets.json` | [挂点](../schemas/sockets.schema.json)：唯一 ID、可选节点名、三个有限数值组成的 positionMetersXYZ |
| `collision/collision.json` | [碰撞体](../schemas/collision.schema.json)：当前接入的 box 使用正 halfExtents 和局部 offset，复用内容参数 Schema 的 box 定义 |

制作校验、发布、Whitebox 目录生成和实际消费模型事实的 preset 生成器复用这些检查。
未声明的组件仍可省略；已声明的引用缺失或字段错误会在生成产物前报错。未来接入新的
碰撞形状时同步其真实消费者和 Schema，不仅新增标签。classification/morphology 描述
内容，control.archetype 描述控制方式，bindings/whitebox.json 声明引擎适配；分类标签
不会自动创建控制器或表示已验证运行能力。
