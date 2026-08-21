# 主体手感配表与版本工作区

这套工作区把“我正在试的参数”和“所有人拉取后使用的公共默认”分成不同生命周期，避免一次本地试调意外覆盖团队配置。

```text
本地工作草稿 + 锁定 Ref 预览
  → 命名的本地版本
  → 本机默认
  → 锁定候选 JSON
  → Registry 新版本
  → Git main 的公共默认
```

## 在页面里调参与保存

打开 Playground 的 Authoring 模式和“大尺寸调控台”。Motion 只选择运动算法；速度、加减速、转向、跳跃和响应曲线归 Control Feel；输入死区归 Control；相机参数归 Camera。Runtime 只预览已编译并锁定的 Motion / Control Feel / Control Ref；Feel 与 Control 的数字调整先保存在本地草稿，必须通过 `promote` 物化成新的 Registry 资源后才能改变玩法。相机微调是独立的会话预览，并按 Camera Profile 分开保存。

- **保存本地版本**：为当前 Motion 选择、Control Feel、Control 和全部已调 Camera 参数创建一个命名快照。
- **设为本机默认**：以后在同一台电脑打开相同 Subject Definition 与内容哈希时自动恢复该版本。
- **恢复版本**：原子恢复已锁定的 Feel/Control Ref 与相机预览；任意 Ref、内容哈希或安全范围不匹配时整次拒绝，不会只恢复一半。尚未 promote 的 Feel/Control 数字仍只是草稿。
- **导出候选**：生成带完整 Registry 依赖锁的 JSON，供本地 CLI 验证和生成发布计划。浏览器不会写仓库、提交或推送 Git。

本地版本属于浏览器 `localStorage`，可以自由增删，不影响其他人。Registry 内容变化后，旧本机默认不会被静默套用到新版本，必须重新检查。

## 公共默认与历史回溯

公共默认由 `assets/registry/subject-defaults/catalog.json` 明确选择一个精确的 Subject Definition Ref 和 SHA-256。Runtime 不会猜“数字最大的版本”。

发布时采用追加版本：Motion 保留精确的算法 Ref/hash；有变化时新建 Control Feel / Control / Camera / Camera Context / Subject Definition 资源，再更新公共默认指针。旧资源仍保留，因此回滚只需把公共默认指回已经验证过的旧 Ref/hash；Git 历史同时保留是谁、何时、为什么修改了配表。

当前四足公共默认是 `worldkit://subject-definition/animal.quadruped.forward-steer@2`，包含已确认的两项 Control Feel 调整（转向速率、跳跃速度）和三项自由环绕相机调整。旧导出中的 `maximumBodyLeanRadians` 不属于 P1.5 Ground/Air 参数契约，因此没有被伪装成 Motion 参数继续携带。旧的 `@1` 仍可被已有世界精确引用。

## Candidate 与本地 CLI

候选文件是不受信任的输入。发布前必须经过严格 schema、完整依赖闭包、Ref/hash、安全范围、Runtime 支持状态和相机组合校验。推荐流程：

```bash
pnpm worldkit subject-preset validate <candidate.json> --legacy-v4 --json
pnpm worldkit subject-preset plan <candidate.json> --output <plan.json> --legacy-v4 --json
pnpm worldkit subject-preset promote <candidate.json> --plan <plan.json> --write --legacy-v4 --json
```

`validate` 和 `plan` 不修改仓库。`promote --write` 只允许在干净的非 `main` 分支运行，不提交、不推送；最终仍通过代码评审、测试和 Git 合并成为公共默认。

## 新主体资产接入

美术源文件与 Runtime 资产是两层：

- `assets/subjects/source-fbx/vehicles/` 中的 FBX 是可追溯的 **source-only** 源资产，清单记录原始中文相对路径、稳定英文仓库路径、字节数和 SHA-256。
- Babylon Runtime 的正式入口仍是完成坐标、尺寸、骨骼/动作、Collider、Socket 和清单校验后的 GLB。
- 当前页面中除 G Bot 外的五个主体仍是 Registry `visualParts` 生成的程序化白模。源 FBX 没有注册到 Asset Resolver，因此不会冒充可运行主体。

新增主体时，先选择可复用的 Motion、Control Feel、Control、Camera Context 与物理/介质 Profile；只有确有差异的参数才派生主体专属版本。一般应按“运动行为类别”复用算法、手感、相机和操控，再为少量体型、挂点或手感差异建立覆盖，而不是每个模型复制一整套代码。

## 合入后收尾

相机会话 overlay、作者面板 Feel 枚举范围，以及 `ControlFeelTuningV1` / `ControlTuningV1` 从 Runtime 会话类型迁走，记在 [`docs/18` P1.5 合入后统一收尾](18-refactor-progress-and-backlog.md)。不在本页另开第二份清单。
