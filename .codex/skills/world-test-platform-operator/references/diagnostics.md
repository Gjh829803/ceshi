# 只读诊断与历史对比

在 Skill 所在目录运行以下命令，或使用脚本绝对路径。`inspect/collect` 复用
`platform.py` 的独立凭据配置并验证身份；`analyze/compare` 完全离线，不需要 Token。
不新增任务、取消任务或执行下载内容。

```sh
python3 scripts/diagnose.py inspect 'https://world-test-platform.loopit.com.cn/tasks/<sourceId>/<worldId>'
python3 scripts/diagnose.py inspect '<任务链接>' --output '/绝对路径/detail.json'
python3 scripts/diagnose.py collect '<任务链接>'
python3 scripts/diagnose.py collect '<任务链接>' --attempt 1 --output '/绝对路径/新诊断目录'
python3 scripts/diagnose.py analyze '/绝对路径/诊断目录' --output '/绝对路径/timing.json'
python3 scripts/diagnose.py compare '/绝对路径/本次目录' '/绝对路径/基线目录' --output '/绝对路径/comparison.json'
```

任务也可写成 `/tasks/<sourceId>/<worldId>`。其他环境使用脚本全局 `--origin` 参数，
放在子命令之前；完整任务 URL 必须与配置的 origin 相同，不自动切换凭据。
比较对象也可以是已保存的 `analyze` 摘要 JSON。没有 `--output` 时只打印摘要；
指定后保存完整操作明细，终端仍只显示摘要和文件路径。输出文件/目录须为新路径，不覆盖。

## 收集范围与 attempt

默认使用详情中的当前 attempt，收集：

- `detail.json`、`artifacts.json`：脱敏元数据，下载链接移除 query，不能再用它们下载。
- `sdk/creator-events.jsonl`、`sdk/creator-stderr.log`、`sdk/creator-result.json`。
- `platform/agent.log`：优先使用文件清单明确归属该 attempt 的文件。
- `download-manifest.json`：来源、attempt、SDK 身份、字节数、SHA-256 和缺失/异常项。

未指定目录时保存到当前工作区的 `.codex-tmp/world-test-platform/<worldId>/attempt-<N>/<时间标识>/`。
诊断目录权限 700、文件权限 600。确认 `.codex-tmp` 被 Git 忽略；没有 Git 的目录也可使用，
但这些资料不能直接提交或分享。原始日志保留原样，**不是已脱敏的分享材料**。
元数据脱敏处理常见凭据字段和 URL query，不能保证移除任意自由文本中的全部敏感信息。

只下载 manifest 明确归属的 SDK 日志。重复候选、未知 attempt、缺失文件会列入 `missing`，
不猜测或混用。仅当前 attempt 可以回退到 `/log?full=1`；收集后再次检查当前 attempt，
期间发生重跑或复查失败时，当前平台日志归属标为未知。运行中的任务仍是观察时刻的快照，
日志会继续增长，不能当作最终完整证据。历史 attempt 的输入身份无法由当前详情证明时保持未知。

收集部分失败仍保存清单，退出码为 2；查看 `missing/warnings` 后再决定是否重新收集。
不会自动重试写请求或启动生成。完整交付包不在默认诊断范围内，需要时仍用
`platform.py download` 下载清单中的归档入口。

## 时间统计的边界

- 平台总时长使用当前任务 `startedAt → finishedAt`；排队时间不在其中。
  准备与 Agent 执行使用指定 attempt 的 `submit/verify` 阶段边界。缺失或逆序边界返回 `null`。
  历史 attempt 缺少明确结束边界时不借用当前任务的结束时间。
- Creator 操作按 ID 合并轮询，使用最新状态。终态操作的 `createdAt → updatedAt`
  是观察到的操作墙钟时长，可能含排队，不等于纯 CPU 时间。运行中操作不当作已完成时长。
- 各类型时长是已观测终态操作的累计值；整体墙钟用时间区间并集，重叠操作不会重复扣除。
  Agent 区间扣除其中可观测操作的时间并集后，余下为 `unattributedAgentSeconds`。
  这包含编写、推理、其他工具、传输或等待，无法进一步拆分时保持未知。
- Codex JSONL 的嵌套工具结果可能已被上游截断。只恢复完整可解析的操作头，保留
  `truncatedLogRecord` 和证据行号；不补齐结果或假定语义验收成功。
  无法恢复的块、坏 JSONL 行、缺少终态时间分别计数。统计是已有证据的覆盖范围，不保证全量。
- 对比核对图片内容哈希、Prompt 哈希、SDK SHA、执行端和账号标签；缺字段显示 `unknown`。
  账号标签不证明底层模型/资源配置一致。这是历史观测比较，不是受控性能实验。
  `operationDeltaSeconds` 任一侧没有该指标时保持 `null`，不把日志缺失当作零开销。

## 本地回归

```sh
python3 -m unittest discover -s tests -v
```

回归使用合成响应和临时文件，覆盖重复轮询、区间重叠、截断、attempt 隔离、下载失败、
目录权限及元数据脱敏；不读取真实凭据、不访问云服务、不发起生成。
