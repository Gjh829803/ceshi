# Asset Registry / CDN 下一阶段重构建议

状态：本地实现与验收已完成，尚未部署云端 CDN。本文保留决策时的现状和目标；实际目录、命令及已实现接口以 [integration.md](integration.md) 为准，验收范围见 [registry-cdn-verification.md](registry-cdn-verification.md)。
依据：2026-09-17 当前 codex/subject-library-demo 分支，以及《Branch · 资产框架体系总结》最后一轮的 Engine Repo / Registry / Object Storage 分层目标。

## 1. 当前基础与需要调整的地方

当前已具备稳定主体 ID、版本目录、资源 SHA-256、骨架/动作/挂点元数据、来源记录、独立预览、Host 的本地/HTTP 来源选择和哈希校验。这些可继续使用。

当前还有五个限制：

1. shared/camera_profiles、control_profiles 只有 README，但主体 profiles 已有实质数据：69 主体中，51 份相机文件含预设，51 份 locomotion 文件含参数或人物 control_profile。上一阶段将这些数据统一归入库；新的目标需要重新划分字段归属。
2. HTTP Host 每次读取完整 dist/whitebox/asset-catalog.json；底层仍依赖 asset-library/ 开头的物理 sourcePath。它支持远程目录，尚不是按 ID 查询、按项目选择资源的 Registry 客户端。
3. 通用 search 下载完整 catalog/index.json 再筛选；服务端 /api/search 尚无分页。Creator 已有分页摘要，但在本地完整目录上检索。需要延续工具接口并替换底层查询来源。
4. 现有 materialize 会复制 tools、viewer、shared、docs、migrations 等整个目录；serve.mjs 可以提供库内任意普通文件。它们适合本地演示，不能直接作为 CDN 发布清单或按项目下载器。
5. assembly.lock.json 是全库锁。69 主体的库内 runtime 验证目前均为 not_run；组合 assembly 和兼容性大多仍是占位说明。现有 SDK 测试证据不能自动变成每个主体、每个版本的兼容承诺。

## 2. 数据归属：按字段拆分，保持每项只有一个权威来源

| 数据 | 建议权威位置 | 当前迁移判断 |
| --- | --- | --- |
| 模型、蒙皮、骨架、动画、贴图、预览、来源 | Asset Library；发布后由 Registry 描述、对象存储保存字节 | 保留现有内容身份与哈希 |
| 单位/轴向、实测尺寸、骨骼名称、动作映射、座位挂点、轮子几何、与模型绑定的碰撞代理 | 主体 metadata / bindings | 跟随具体模型版本；不因 JSON 很小就搬到引擎 |
| 镜头距离、FOV、平滑、回正、输入映射、加速/刹车/转向等游戏体验参数 | 引擎仓库 preset-content 的可编辑 preset 源 | 从现有主体 profiles 中按字段迁回 |
| 某个模型在某个引擎版本下如何选 preset、如何绑定控制器 | 引擎侧 integrations，引用精确 subject/model 身份 | 保存 subject 专属适配与必要覆盖值；不能覆盖远程模型事实 |
| 场景位置、当前镜头选择、某个游戏的额外覆盖 | 现有游戏/Playground 配置 | 延续当前项目归属 |
| 通信 DTO、能力/绑定/兼容性协议、校验规则 | 独立版本的 asset-contracts | 单一源；库工具携带生成的固定版本副本或已发布包 |
| 分类词表 | Registry taxonomy | 记录 taxonomy_version，协议引用它，不重复手改词表 |

例如 D01：骨架 Seat 节点、座位坐标、模型碰撞代理留在内容侧；镜头距离 32、速度 18、刹车和视角回正等当前手感参数进入引擎 preset。同一字段不能同时在两侧可编辑。

现有 locomotion.json 混有尺寸与体验参数，不能整文件机械搬迁。必须先制定字段归属表，再生成合并后的宿主 spec，按当前有效值对比保证迁移不改变手感。质量、摩擦等字段也要逐项判断是经测量的模型属性，还是特定游戏的调参。

“唯一资产库”继续约束正式美术内容源。引擎 preset 与项目配置是不同职责，不构成第二份模型库。

## 3. 建议目录：保留已有包，建立清楚的发布边界

以下为规划结构；实施时按仓库规则将引擎 presets / integrations 放在 preset-content/config 内，客户端源放在独立 asset-client 包，库内携带生成固定副本。

```text
packages/
  three-world/                         现有 Runtime 算法
  preset-content/
    config/presets/                    引擎预设的唯一可编辑源
      camera/
      control/
      locomotion/
    config/integrations/               主体版本 + 引擎 preset 的适配
    config/generated/                  保留为生成消费快照
  asset-contracts/                     小型无 Three/Host 依赖的协议包
    schemas/
    types/
    examples/

asset-library/                         当前内容制作与管理工作目录，可独立移出
  subjects/                            保留现有主体 ID 和版本目录
  shared/                              仅内容共享依赖：rig、motion、material 等
  assemblies/                          内容组合、角色及依赖
  taxonomy/
  intake/                              制作输入，不默认发布
  migrations/                          审计记录，不默认发布
  tools/                               入库、校验、Registry 索引、发布导出
  client/                              先升级现有客户端，后续按需要独立发布
  viewer/                              改为 Registry API 的消费者
  dist/
    published/                         唯一 CDN 部署输入
      registry.json                    协议/发布身份及各入口描述
      manifests/<id>/<version>/        不可变资源与装配清单
      artifacts/sha256/<prefix>/<hash>  runtime/preview 发布字节
      indexes/                         可选静态检索投影
    whitebox/                          过渡适配输出，最终按项目选择生成

项目生成目录/
  project.assets.json                  项目需要哪些主体/组合
  project.assets.lock.json             解析后的精确依赖与哈希
```

独立 source archive 存制作原件、原始授权附件和审计记录；访问策略与 runtime/preview 发布产物分开。已有本地 source 文件不必立即全部挪动，发布器用明确的资源清单决定上传范围。

CDN 是发布产物的分发层，Registry 负责搜索、元数据和依赖解析。当前 asset-library 文件夹可以继续作为制作入口。第一阶段不必引入正式数据库：由现有 JSON 生成索引并提供 HTTP Registry；未来接数据库时替换服务端存储实现，客户端协议保持稳定。

## 4. 先固定通信契约，再接云服务

统一保留已有主体 ID，例如 creature.dragon.d01，不为改目录重新命名。
区分 subject_id、resource_id、artifact_id：前两者描述逻辑身份，artifact_id 用 sha256 指定实际字节。URL 是传输位置，可以更新；项目锁不保存临时签名 URL 作为资产身份。

建议 v1 接口：

| 操作 | 输入 | 输出及约束 |
| --- | --- | --- |
| searchAssets | query、分类/形态/运动/能力过滤、目标 Runtime、limit、cursor | 小型摘要、预览引用、next_cursor、snapshot_id；不返回模型和完整骨骼树 |
| describeAsset | asset_id、version | 固定版本完整元数据、资源摘要、已知限制与验证范围；v1 不提供 sections 投影 |
| checkCompatibility | 主体/角色组合、rig/motion、宿主支持的协议/模块、引擎适配版本 | compatible / incompatible / unknown / adapter_required，附理由与证据身份 |
| resolveAssembly | 项目选择、明确版本约束、用途、目标 Runtime/integration、Registry snapshot | 精确版本、完整传递依赖、资源闭包、诊断与可锁定结果；不下载大文件 |
| materializeAssets | 已解析 lock、用途、缓存位置 | 只下载锁中需要的字节并校验，返回本地映射；这是客户端/CLI 操作 |

HTTP 对应可以是 GET /v1/assets、GET /v1/assets/:id/versions/:version、POST /v1/compatibility/check、POST /v1/assemblies/resolve。服务器解析操作不创建游戏、不更改生产准入策略。已有 Creator assets_search / assets_describe 工具名称可以保留，内部转接上述服务。

v1 最少定义以下字段组：

- Registry：registry_id、release_id / snapshot_id、contract_version、taxonomy_version、端点与能力声明。
- Subject/Assembly：稳定 ID、精确 version、manifest_digest、逻辑依赖及角色、内容绑定、runtime_requirements。
- Resource：resource_id、artifact_id、role、format / mime_type、byte_length、依赖与使用范围；模型内片段另用 clip 引用定位。
- Compatibility：被验证的 subject/rig/motion 版本、宿主协议、runtime/adapter/preset 身份，结论、原因、证据。形态相同不能推导兼容。
- Error：稳定 code、可读说明、retryable、定位信息；缺失版本、契约不支持、依赖未满足、哈希损坏必须能区分。

资源下载端点支持从 artifact_id 获取当时可用的 URL/过期时间；Registry 与 CDN 的根地址分别配置，不能假定它们在同一个域或目录。支持受控 CDN 跳转/签名 URL时依然验证最终字节，不继承当前固定根路径的隐式信任。

内容协议只声明需要的能力。Registry 不发送待执行的控制器脚本；宿主根据自身支持的合同和准入策略决定能否装配。

## 5. 发布、项目锁和下载的最小闭环

发布器需要完成：

1. 按资源用途与实际依赖计算 runtime / preview / source 清单。不能按文件扩展名或 source 文件夹名直接判定运行是否需要。
2. 校验 schemas、引用、版本、哈希与发布范围，将可发布字节按内容哈希去重导出；制作目录和内部追溯文件不进入默认 CDN 包。
3. 同一已发布 ID/version 的内容不可变；内容变化创建新版本。资源就绪后才更新 release/current 指针，避免元数据先指向不存在的对象。
4. 不可变资源/manifest 与可变发现入口使用不同缓存策略；保留旧版本和项目锁引用的字节，回滚只切换发布指针。
5. 记录 release 清单、校验结果和上传/回读验证。当前授权未知或仅限内部使用的内容按明确发布规则处理，不能因已有本地预览就自动公开。

项目锁至少固定：

- registry 与 contract/taxonomy 身份；
- subject/assembly 的精确版本和 manifest digest；
- 所需 artifact_id、字节数及传递依赖；
- engine runtime、adapter、preset 版本/哈希，以及项目覆盖配置的身份。

现有全库 assembly.lock.json 继续可作为发布校验输入，但项目只应携带自己那一份依赖锁。已有 Creator policy、世界身份及 Episode 冻结交付继续有效；新锁补充资产解析身份，不绕过它们。

Loader 使用按哈希寻址的未提交缓存，支持并发去重、损坏重取、原子写入与精确 lock 重现。只有已验证的锁定缓存可用于离线模式；网络失败不能悄悄使用另一套本地库或浮动版本。

## 6. 与当前消费者衔接

- Playground：继续由 Host 验证字节后供浏览器读取。将“启动时读完整目录并准备场景全部资源”逐步改为场景 manifest 选择；资源卡片查询走 Registry。
- Creator：保留 Agent 已认识的工具，摘要搜索不预下载模型；Host 的准入过滤仍执行。同步 policy 构造前只准备所需资产的精确元数据，避免以后为数万主体预加载整份目录。
- 看板：内容、动作、依赖、兼容性、来源与发布状态由 Registry 提供。相机/操控展示为“引擎预设/适配”，标明引擎侧来源；可连接 preset provider 查看，但不把它们伪装成远程内容。
- Whitebox Adapter：由“内容清单 + 本地 integration/preset”生成当前宿主需要的 spec 和资源映射；不让通用 Registry DTO 直接等同于完整 VehicleSpec。
- 验证证据：将现有已通过测试逐项绑定到相应模型、Runtime 和适配版本。只确认已覆盖组合；未验证、占位、仅能预览的资产继续如实返回相应状态。

下一次实施只需要改资产库、协议包、preset 的数据归属和必要消费接口。保持现有 SDK 算法、UI 整体布局和 Creator Agent 创作策略的范围稳定。

## 7. 实施顺序与完成条件

| 顺序 | 工作包 | 交付/验收 |
| --- | --- | --- |
| P0-1 | 字段归属与 preset 迁移 | 数据字节完整保留；合并后的当前有效配置逐项一致；调整引擎镜头参数不改变模型 artifact 身份 |
| P0-2 | 协议/schema 和客户端边界 | 单一版本化协议；保持已有 ID；请求响应/错误/兼容性范围有示例和校验 |
| P0-3 | 发布导出与内容寻址 | 可独立部署的 published 目录；同版本改内容被拒绝；默认包不夹带 intake/source/migrations |
| P0-4 | 项目级 resolve / lock / cache | 解析真实传递依赖；空缓存仅下载所选主体；断网可用已锁定缓存、损坏字节被拒绝 |
| P0-5 | Registry API、Agent 入口和看板贯通 | 分页搜索→按需描述→兼容性检查→锁定→下载→实际加载；Host 准入不被扩大 |

首个验收样例建议使用现有 horse 或 D01 加现有人物：搜索阶段没有 GLB 请求；选择具体版本后仅拉取该组合需要的资源；更换 CDN 根地址仍使用同一 lock；切换 Registry 最新版本不影响旧项目；旧制作目录不可用时仍可从发布端完成加载。兼容性应返回真实证据状态，不为让样例通过而直接标成 verified。

上述闭环完成后再连接实际对象存储/CDN与认证；数据库、复杂向量检索、批量管理后台按增长需要后续替换/扩展。每个阶段都复用同一协议和同一份权威数据，避免迁到云端时再改一次 Agent 接口。
