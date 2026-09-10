# 飞龙训练场

VECTOR 顶部地图菜单提供 **飞龙 · 空中训练场**，进入后可从同一菜单返回园区、飞机场和其他地图。直接入口是 `/dragon-training.html`。

## 拉取后运行

```sh
pnpm install --frozen-lockfile
pnpm dev:editor
```

完整发布包随代码保存在 `assets/dragon-training`，约 30 MB，包含龙、骑手、火焰贴图、动画装配清单、浏览器运行脚本及 Havok WASM。无需预先运行准备脚本、启动 5186 服务，或访问维护者磁盘。

`pnpm build:editor` 生成 `.codex-tmp/react-playground-dist`。部署整个目录即可；飞龙文件发布于 `/flying-creature/`。`bundle.json` 记录每个发布文件的大小和 SHA-256。开发服务及生产构建只读取清单内文件并验证内容；发布包缺失会使生产构建失败。开发页面仍提供缺失提示与返回入口。

资源目录的 `.gitattributes` 禁止 Git 转换换行，保证 Windows/Linux 检出的文件与哈希一致。Babylon / Havok 的许可文本随包保留在 `licenses`；龙、骑手及火焰贴图来自此前 Century D01/H01 本地提取，来源写在装配清单中，不改变这些资源的权属。

## 运行边界

Babylon 飞龙在独立页面的 iframe 中运行。切换地图会导航并释放原页面，只有当前场地持有物理、动画、相机和输入循环。从飞龙返回时用 `?map=<id>` 恢复目标场地。Three 的飞机、七大类注册和其他地图保持现有运行方式。

此次提交包含页面接入代码和可直接运行的飞龙发布包；底层 Babylon 维护源码仍在原工程，未完整迁入 Three SDK。七大类目录中的 Three 原生飞龙与此训练场是不同实现，Creator / Episode 不因此自动获得 Century 训练场能力。伤害结算仍未实现。

## 更新发布包

只有维护飞龙底层实现时，才需要拥有原飞龙源工程和提取资源，并显式指定：

```powershell
$env:WORLDKIT_CREATURE_SOURCE_DIRECTORY='<飞龙源工程目录>'
$env:WORLDKIT_CREATURE_ASSET_DIRECTORY='<FlightRuntime资源目录>'
pnpm prepare:dragon-training
```

脚本利用该源工程已安装的依赖生成 `.codex-tmp/flying-creature-bundle`，不会直接替换已提交版本。经验证后把新发布文件与 `bundle.json` 一起更新到 `assets/dragon-training`，保留其 `.gitattributes`，移除清单外旧发布文件；不要提交本地缓存目录。普通开发和构建不调用该维护脚本。

## 验证

`pnpm verify:dragon-training <网站根URL> <证据目录>` 使用真实菜单和键盘验证进入飞龙、悬停、Shift 加速、Ctrl 刹停后释放、T 视角切换、E 喷火、返回飞机场、再次进入并检查状态重置，最后返回园区并确认 iframe 释放。还验证请求同源及缺失资源时可以返回。

对开发入口及构建后的静态站点分别执行该流程；另检查 React 面板、类型、工作区边界、测试清单和站点构建。训练场运行包保持原验证版本的字节，不修改飞行算法。
