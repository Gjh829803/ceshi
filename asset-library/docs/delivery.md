# 交付说明 · 2026-09-17

本次迁移在 `codex/subject-library-demo` 分支中完成资产来源切换。`asset-library` 是该分支唯一资产库；本文不表示 main 或其他工作区已同步这些更改。

## 内容与保留范围

- 43 个原目录主体的 130 份模型及附件按原始字节迁入，保留来源路径与 SHA-256。
- 9 个程序化载具以真实模型构造函数和 GLTFExporter 导出：超跑、卡丁车、推进式飞机、直升机、多旋翼、倾转旋翼、滑翔伞、翼装、热气球。
- 13 个动物来源分类保留代表占位，其中棕熊与角雕带来源 FBX 样本；另有机器狗、人形机器人、滚动球、史莱姆 4 个分类模板占位。
- 共 69 个主体、54 个带模型条目（52 个 GLB 与 2 个 FBX）、17 个 placeholder。两个 FBX 样本仍计入 placeholder。271 条动画记录包含未绑定片段和源姿态，不等于 271 个已验证游戏动作。
- 删除当前分支旧根资产目录前，逐一覆盖核对了 181 个文件、173,351,435 字节。此前目录导入未包含的 rider GLB 已作为来源附件保留；50 份额外原始文本记录保存在 `migrations/legacy-source-records.json`，含原路径、原字节内容和 SHA-256。

[原始映射](../migrations/whitebox-map.json)、[完整移除覆盖记录](../migrations/legacy-removal-coverage.json)与[保留文本记录](../migrations/legacy-source-records.json)记录迁移身份。停用的 import-whitebox、export-whitebox-procedural、setup-docs 工具只存于[惰性归档](../migrations/retired-bootstrap-records.json)，不再作为可运行工具或生成输入。

## 权威与交付边界

资产的可编辑权威来源只有 `subjects / shared / assemblies`。骨架与蒙皮留在模型中，语义映射位于 bindings，物理事实位于 facts/physical.json，操控参数位于引擎 preset-content/config/presets。SDK 提供执行算法，模块描述只声明宿主接口。

`catalog / dist` 和仓库 `packages/preset-content/config/generated` 是生成快照。Host 默认读取仓库内库，也支持 `ASSET_LIBRARY_ROOT` 外部目录及 `ASSET_LIBRARY_URL` HTTP 来源，无旧资产回退。远程同步构造器在使用前需 `await prepareAssetLibrary(root)`。

Playground 的 Vite 端与 Creator 共同使用 Host 校验字节长度和 SHA-256；浏览器保留内容寻址 `./assets/...` URL。远程选择改变 Vite/Host 的上游来源，不让浏览器绕过验证直连模型。资源锁位于 `dist/assembly.lock.json`。

## 验证范围

75 个 GLB 经 Khronos glTF Validator 检查，0 errors、233 warnings。逐文件结果见[格式证据](../tests/evidence/gltf-validation.json)。警告涉及源模型的蒙皮节点层级、零权重 joint、切线等内容；没有通过重写源字节隐藏这些问题。

维护工具的真实导出、人形模型字节重建和飞龙测量已有检查。本轮删除旧路径后的实际看板、Playground、Creator 和构建检查见[唯一资产库迁移验收](unique-library-verification.md)，其中明确列出已通过检查与 Windows 环境限制。

FBX 样本尚未规范化，部分蒙皮权重会触发浏览器加载器提示。动画轨道未匹配模型节点时，应显示需要补齐绑定。格式通过、可预览与游戏行为通过是不同事实；本轮未重新验证所有物理、足滑、骑乘接触与控制手感，不能把这些主体统一标成 runtime verified。

## 操作与基线

在仓库根运行 `pnpm dev:assets` 打开 [Worldkit Atlas](../../apps/asset-platform/README.md)；新增或更新资源遵循[入库流程](../CONTRIBUTING.md)。库内运行 validate、validate-formats、build 和合同测试；Whitebox 仓库根运行 `pnpm content:sync`、`pnpm content:check` 同步并核对消费快照。

资源原始快照基于提交 `514fd6ba261f079620c47c49228c70d70f6e8cb1`。当前隔离分支的集成起点为 `63b289d541e2aa89b64dd8cfa044657e2f4dc5d1`。这两个提交分别描述资源来源和集成基线，不应改写为同一个身份。
