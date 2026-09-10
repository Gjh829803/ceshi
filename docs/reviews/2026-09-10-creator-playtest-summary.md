# Creator 已录轨迹查询

开发基线已同步至 #222 合入后的 `36598b99`。第四次练车时，Agent 两次写 Python 查 `trace.json`，按时间查看驾驶和制动过程。本批让同一份已录数据可通过工具按需查询。

`world_read_playtest({operationId, fromSeconds?, toSeconds?, maxSamples?})` 读取同一 Creator 服务中完成的 playtest。默认最多 12 个采样，范围 2—32，另外返回至多 32 条按键事件；省略数量明确可见。位置、速度模长、骑乘、镜头和动作名来自实际轨迹，缺失值为 null，不对跨 reset 或骑乘转换的位置插值。区间最高速度来自该区间全部有效速度采样。

结果绑定原 Creator operation、源码/运行时/episode 哈希和 trace SHA256。`operationCompletedAt` 是 Host 操作完成时间，采样时间是浏览器 trace 开始后的秒数。`currentWorldComparison:'not-performed'` 明确未比较当前源码；录制状态和完整性与摘要的 observed/empty 状态分开。

查询不会编译、打开浏览器、推进模拟、创建新 operation 或重录。同一服务关闭浏览器、当前作品被修改后仍可查旧记录。新服务不信任磁盘伪造的 operation。未完成录制返回 not-ready；缺失或篡改的轨迹返回 unavailable，不修改原操作状态或交付规则。新工具同步接入 MCP/CLI 与云端工具清单、进度名称；playtest 返回按需读取入口。

本批先提供实际时间段查询，没有用计划步骤时长推算精确步骤边界，也没有新增逐帧采样或每单必调工具。任意道具位移、连续最大速度、碰撞因果和玩法成功不由此摘要认定。

验证：5 文件 130 项相关测试通过，另 37 项本地云链路契约测试通过；typecheck、census（88 文件：27 contract、61 resource-heavy）、workspace boundaries 及 runtime prebuild 通过。浏览器集成验证实际录制后的只读查询、文件完整性、原操作身份和关闭后的读取。没有新增完整 Agent case，实际返工/耗时收益需在后续创作中观察。

SDK runtimeHash 仍为 `156f66d59c8544de584b58507e3596f52d466297142d013ad94b5b296ed5a695`，没有修改模拟或 Episode 执行。调用方式与边界见 [Creator 指南](../../scripts/three-creator/README.md)。

另外，#221 的完整 CI 暴露默认 schema 响应 12,115 字节超过 12,000 字节预算；文案去重作为独立修复 #222 提交，保持原阈值。原失败测试和相机发现消费者均已复验通过，不将该修复与轨迹查询的收益混为一谈。
