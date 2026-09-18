# 唯一资产库迁移验收 · 2026-09-17

本记录针对 `codex/subject-library-demo` 分支。唯一可编辑资产源为本分支根目录的 `asset-library/subjects`、`shared`、`assemblies`；索引、Whitebox 适配目录与包内 preset JSON 是生成快照。

## 已移除的来源

- 仓库根 `assets/`：181 文件、173,351,435 字节全部保留并核对 SHA-256 后删除；见 `migrations/legacy-removal-coverage.json`。
- Playground `public/dragon-thumbnails/`：11 PNG、567,408 字节全部迁入对应主体并核对后删除；见 `migrations/playground-preview-coverage.json`。
- 手工维护的两个 preset camera JSON、旧飞龙复制插件和旧 catalog 写入器已移除。历史相机导出器只允许显式指定新的归档目录，不再写当前权威配置。
- 全部活动媒体文件扫描未发现库外运行资产源。来源档案中的旧路径只供追溯；已发布游戏内的 `playable/assets/` 属于不可变交付快照。

## 新链路

主体数据 → 生成目录与 preset 快照 → Host 选择唯一的本地目录或远程 HTTP 库 → 校验路径、字节数和 SHA-256 → Playground / Creator 交付 → Episode 消费已锁定交付。

远程失败或资源哈希不符直接失败，不回退本地。Creator 的现有资产准入策略保持有效；搜索到占位不等于获准运行。通用控制、几何构造、动画与物理算法仍由宿主提供，专属参数由库生成。

## 已通过

- 库结构及资源完整性：69 主体、217 个登记文件；独立合同和生成器测试 10 项通过。`content:check` 确认 43 项 Host 定义与 7 份 preset 快照未漂移。
- 75 个 GLB 格式验证：0 errors、233 个源内容 warnings。模型二进制没有为消除警告而重写。
- SDK 资产/骨架/动画及相关集成 21 套、293 项通过；迁移测试 helper 后，其 11 套依赖、259 项通过。两组部分重叠，不应相加。
- 专属配置集成 22 项、模型车轮/物理/回归 166 项、Episode 资产策略 19 项通过。Creator 资源、策略和相关发现/编译用例通过；完整套件的限制见下。
- 云端目录策略 6 项、安装包资源闭包 4 项通过；安装包不依赖旧资产目录。
- 根 TypeScript、ESLint、工作区边界和测试登记检查通过。Playground 本地来源生产构建与 Three Runtime 预构建通过。
- 真实 Chrome 看板加载 54 个模型；骨架、播放/暂停、时间轴、外部动作、占位、移动布局检查通过，0 页面错误、0 HTTP 错误。见 `tests/evidence/browser.json`。
- 真实 Playground 使用 HTTP 库，经 Host 验证后完成 D01/D02 场景加载；50 次模型/贴图交付请求，0 页面错误、0 HTTP 错误。人物、马、D01 的实际交付字节另核对哈希；见 `tests/evidence/playground-remote.json`。
- 真实本地 Creator 从 HTTP 库搜索/描述资产并编译、启动游戏场景，页面错误和被阻止的网络请求均为 0。没有启动云任务或提交游戏。
- 篡改远程资源的实际 Vite 构建被 `THREE_ASSET_HASH_MISMATCH` 拒绝；来源迁移测试覆盖外部库目录、HTTP 失败无回退及资源身份检查。

## 验收限制

没有宣称全套 CI 通过。完整 Host/Episode/云端套件中的部分安全夹具在 Windows 创建文件符号链接时得到 EPERM；还有未修改的声明消费者路径用例与 Linux capsule/Python 环境假设未通过。未跳过或放宽这些安全断言，完整 Linux CI 与 Docker 构建需在对应环境运行。

本轮确认资源迁移、关键运行集成与预览；没有重新人工验收全部角色动作、足滑、骑乘接触或游戏控制手感。资源的 runtime readiness 不因这些检查统一提升。
