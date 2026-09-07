# Human-ten 离线适配与去 UI 验证

> Historical source-bound review/verification record. Scope and results apply only
> to the source and artifacts identified below. For current behavior, use the
> [branch guide](../three-sdk-data-production.md); recheck findings against current code.

已完成本地适配；没有运行这批真实案例的录制、规划或生成，也没有更新云端部署。原公开试玩页与冻结交付包不变。

## 适配内容

- 已知源 SDK hash：`1c5b8333cd1a54ed9162f7c15ba90798f3649ef9b4a67159e4b73ae38b508d8d`。
- 原镜头来源：Creator 冻结提交 `f2be8beeb12f6c1991e41d14a553d008ab3d161b`，camera.ts SHA-256 `4cd28d853135cfa49abfb202fc581aac470cc1858b23ec4572d5398728ddea2f`；已核对该提交原文件。
- `compat/creator-camera.ts` 保留原 followHalfLifeSeconds、开场构图、四元数过渡及碰撞恢复实现，增加 SDK 录制起点的 pose/memory 重定位。去掉新增方法和路径调整后，测试验证文件字节与原 hash 一致。
- 编译器只在显式选择时替换 camera 模块；不同时运行两个 camera。SDK 继续独占固定时钟、物理、人物输入和 Episode 端口。镜头模块字节进入编译缓存身份，不与默认运行时混用。
- 产数页面隐藏 DOM UI、动态提示和辅助 canvas，仅显示世界 renderer 的 canvas。保留 DOM 节点以避免作者回调失效；世界中的标牌和材质不按文字或颜色删改。
- HTML 和新 presentation 模块纳入派生 playable hash；作者源码及 compiled 入口原字节保留。输出非空时拒绝覆盖。
- 采用原 captures 清单的 important-representatives-v1 选择，保持五个重要目标；通过 orientationTargetId 把 player 别名对应到真实主角。保留原用户图片的确切字节与哈希。

## 本地验证

以下均 exit 0；中间一次 test census 因新增清单未排序失败，修正排序后最终通过。

| 命令 | 结果 | 证明范围 |
|---|---|---|
| `pnpm exec vitest run scripts/three-episode scripts/three-creator/compiler.test.ts scripts/three-creator/tools.test.ts packages/three-world` | 276 tests / 21 files | SDK、编译器、原镜头29项、相对起点/reset、Episode接续和合成浏览器场景 |
| `node --test scripts/three-episode/*.test.mjs` | 79 tests | 现有队列、资源与视觉流程契约回归 |
| `pnpm typecheck` | 通过 | 新 adapter 与编译器类型检查 |
| `pnpm test:census` | 371 files：317 contract / 54 resource-heavy | 新测试已纳入正确 lane，非全部371个文件均在本次执行 |
| `git diff --check` | 通过 | 格式检查 |

合成浏览器场景测试证明：当前 SDK 端口可固定推进三 tick；原镜头参数由适配 kernel 消费；世界画布可见；红色全屏 HUD、动态提示及辅助 canvas 均隐藏；页面截图中无 HUD 红色像素。默认/兼容运行时的缓存身份分离且可重复命中。此为自动契约/真实合成浏览器证据，不是这批真实案例的录制或视觉质量验收。

源码、编译入口未改的断言在合成包装测试及本地真实交付文件检查中验证。没有重新生成原图或评判世界质量。

## 真实交付的离线打包

打包时已有 7 个正式交付：01、02、03、04、07、09、10。每例只执行 source 验证、SDK 编译、文件复制和 hash 核验；没有打开其运行场景、调用规划 Agent 或开始录制。各副本均有 5 个重要目标、原参考图及去 UI 的派生页面。

本地索引：`.codex-tmp/three-episode-human-ten-adapted/intake.json`。
每个条目记录 original/derived worldBuildHash、runtimeHash、source.json 路径、目标清单与原图 SHA-256，状态为 adapted-not-run。05、06、08 在该索引快照中仍为 waiting-delivery，不据此伪造上游封口。

证据日志保存于同目录 `evidence/`。这些副本没有写入生产队列，也没有上传或替换 r13 云端胶囊。后续真实运行仍需要使用包含此适配器的新冻结源码/运行包，不能用旧 r13 源码静默重建本批 SDK。
