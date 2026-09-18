# Asset Library 工作规则

制作维护使用 tools/library.mjs search / describe；远程 Agent 使用 client/cli.mjs 或 RegistryClient 的 search / describe，不要猜 ID。

1. subjects 元数据为权威来源；catalog 和 dist 自动生成。
2. 文件夹确定归属，结构化字段确定分类，引用确定复用。
3. 新主体必须有六类基础元数据、bindings、profiles、default assembly、README。
4. 使用 taxonomy 中的规范词，不把参数、依赖或运行实例状态塞进标签。形态相同不代表骨架兼容。
5. 新内容默认留在主体中，只有真实复用或明确版本契约才进入 Shared。
6. 所有可消费路径相对库根；禁止 ../、绝对盘符、符号链接逃出库。provenance 中历史源路径仅用于追溯。
7. ID 稳定；同一 ID/version 已发布内容不可变。dist/assembly.lock.json 是制作审计锁；部署仅使用 dist/published，项目使用 project.assets.lock.json。
8. Placeholder 和 planned 能被搜索，但不能声称 runtime ready。不得由动画名字推断完整能力。
9. 改动后运行 validate、build 与 tests/*.test.mjs；模型变更还运行 validate-formats 和实际看板抽检。仓库内协议和客户端固定副本必须通过 sync --check。
10. 需要宿主 motor / animation / physics / camera 执行时声明依赖，不在资产库复制引擎。
11. 相机/操控/手感可编辑参数属于引擎 preset-content/config；主体仅保存模型事实、内容绑定和外部合同引用。发布器不读取引擎仓库。
