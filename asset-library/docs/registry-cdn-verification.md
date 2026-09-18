# Registry / CDN 本地交付验收

日期：2026-09-17；分支：codex/subject-library-demo。工作目录：`.worktrees/subject-library-demo`。本轮没有提交 Git、合并 main、调用云作业或上传 CDN。

## 已完成

- 内容与引擎参数分离：模型、骨架、动作、座位/轮子/碰撞事实归资产库；相机、操控、动力与手感归 preset-content/config。43 条既有 Host 目录和 7 份消费快照的有效配置经迁移前后对比保持一致。
- 新增独立协议包 asset-contracts、客户端 asset-client；库内固定副本由同步脚本生成并校验漂移。
- 发布器生成完整、不可变、可独立部署的 dist/published。69 主体、213 份去重发布资源；17 个 placeholder，54 个带模型条目。2 个 FBX 样本仅供预览。没有将制作原件、intake 或迁移工具作为可浏览文件发布。
- Registry 支持分页搜索、精确版本详情、兼容性、传递依赖解析、独立 CDN 定位和权限哈希范围。旧版本仍可定位；同版本内容/合同变化拒绝覆盖。
- Creator/Playground 生成项目清单与锁，交付全部资源闭包；资源与清单均校验哈希。Creator 默认允许 ID 未扩大，本地/远程权限快照一致，依赖的精确版本也受权限约束。
- 相机/操控旧空共享目录已删除；看板明确显示引擎拥有这些数据。尚未连接引擎预设编辑提供器。

发布 snapshot：`b10e823e2e562b055cacd7829cda17c53318dfc390e33cb40b285bc1ea7576e9`。

## 验证证据

| 验证 | 结果 |
| --- | --- |
| 资产库、协议、客户端、缓存、引擎适配、Host 远程/编译、云工具包闭包的集中 Node 测试 | 65 / 65 通过 |
| Creator 权限测试 | 17 / 17 通过 |
| Creator 发现与相机/挂载提示、preset 相机测试 | 25 / 25 通过（其中 2 个受 Windows 临时目录限制的编译用例在扩展权限后重跑通过） |
| Episode 载具路径测试 | 23 / 23 通过 |
| 目录边界单测与仓库布局 | 8 / 8 通过 |
| 目录生成与协议/客户端副本漂移 | 通过 |
| 全库 TypeScript、ESLint、workspace boundaries、测试 census | 通过 |
| 实际远程 Registry Playground 生产构建 | 通过；保留既有大 chunk 提示 |
| 实际 Creator SDK 编译与 Chrome 检查 | 只准备 15 条获准元数据；选定人物下载 77 份资源；独立 Registry/CDN 地址；0 页面错误、0 被阻止请求；离线缓存重放通过 |
| 实际 Playground Chrome 检查 | 42 个场景主体、138 份锁定资源；0 页面/HTTP 错误 |
| 独立看板真实 Chrome | 54 / 54 模型；分页、缩略图、骨骼、动画播放/暂停/拖动、外部片段、占位、引擎归属及移动布局通过；0 页面/HTTP 错误 |

看板证据：`tests/evidence/browser-registry.json` 和 `registry-*.png`。Creator/Playground 本轮临时验收记录及完整日志位于仓库 `.codex-tmp/registry-audit/`。独立审查记录位于 `.superpowers/sdd/2026-09-17-registry-cdn/`。

审查修复覆盖：所有主体的物理事实可独立读取；模块合同不遗漏；组合合同版本进入不可变身份；历史禁用资源不丢失；共享哈希元数据冲突拒绝发布；交付完整传递闭包；依赖精确版本受策略约束；失败下载等待所有进行中写入收尾。

## 明确范围

- 当前主体 Runtime 验证仍为 unknown/not_run；浏览器预览和现有 SDK 回归不自动转成每个资产版本的运行兼容承诺。
- 一个源 FBX 含超过 4 个蒙皮权重，Three 的预览加载器有裁减警告，记录在浏览器证据中。
- 更广的既有云编排测试在 Windows 上有 6 个环境/路径失败（Python 命令、Linux 路径、绝对 TS loader 等）；未修改这些不涉及资产的运行环境。此次不能声称全仓 CI 已在该 Windows 环境通过。
- 当前服务为本地 JSON Registry 实现，CDN 及认证尚未接云。静态 CDN 只负责分发对象；查询/解析仍需 Registry 服务。
- Creator 输出的锁可以由客户端/CLI 离线重放；作者界面尚未提供“导入旧锁并切换整个 Creator 会话”。

目录和命令以 [接入说明](integration.md) 为准。下一步可将发布包接入对象存储/CDN，并把 Registry 服务部署到正式运行环境，客户端协议不需要再改一次。
