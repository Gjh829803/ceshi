# CF 场景生成试跑交接

2026-09-06。试跑分支：`codex/cf-production-effect-closure`。
这不是 main 发布，也不是“所有 CF 已完成”的验收声明。请在开始前记录
`git rev-parse HEAD` 的完整 SHA，并在整轮执行期间保持实现文件不变。

## 获取与环境

推荐新目录，避免覆盖现有工作树或把未提交代码带入正式 Capture：

```bash
git clone --branch codex/cf-production-effect-closure \
  https://github.com/seedleap/agent-whitebox-world-sdk.git agent-whitebox-cf-trial
cd agent-whitebox-cf-trial
git rev-parse HEAD
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

CI 使用 Node 24.3.0，仓库指定 pnpm 10.14.0。此前规划目录拷贝的 EEXIST 是 SDK
缺陷，不是同事使用 Node 25 的错误；本分支已在 Node 25.8.1 上通过专门回归。
本地真实运行记录使用 Node 23.11.0；不要把这些结果称为最终完整 CI。

本地执行需要已安装并登录的 Codex CLI，以及该账号可用的正式模型和图片生成能力。
正式 Planner/Builder 保持 `gpt-5.6-sol` / `xhigh`，不降级。Cloud 测试平台则保留
原有 Cloud 路由及平台提供的凭据；不要把下方的 `local` 选择照搬到 Cloud 平台，
也不要把凭据写入仓库、运行说明或回传日志。

## 本地完整生成

将图片路径改为本机真实文件，并为每次新输入选择一个未使用的 scene-id。
不要在同一个 scene-id 下覆盖先前失败或成功的产物。

```bash
WORLDKIT_CODEX_BACKEND=local pnpm agent:world \
  --scene-source babylon-native \
  --scene-id cf-colleague-trial-001 \
  --image /absolute/path/reference.png \
  '根据参考图还原一个完整、可探索的场景，保留建筑、山体、道路阶梯与水体的空间关系，以 Babylon Native Block 白盒表达。'
```

不要追加 strict 模式、隐藏修复任务或更改 gate/阈值。普通生产保持原有 Planner、
Builder 同任务内自修复，以及 Host 的交接、Check、Ground、Package、Capture、评估与发布。
模型阶段耗时波动较大；此前一轮真实运行在约 26 分钟后结束于 Host 检查，不能据此
保证本轮完成时间或成功。不要因暂时没有终端输出重复提交同一模型任务。

## 回传信息与已知边界

- 回传完整提交 SHA、Node 版本、backend、scene-id、run-id、实际终态、首个原始错误码。
- 保留 `artifacts/scenes/<scene-id>/` 和对应的
  `apps/playground/public/scene-plans/<scene-id>/`，不要清理失败收据或手改生成结果后称为原 Run 通过。
- 本版本包含规划目录 EEXIST、Host 冻结输入读取、Subject 校验 CSP 启动等修复。
  最新修复已通过定向回归、类型检查、六组合成真实捕获和七条像素关系验证。
- 合成捕获不等于参考图生成验收；当前没有这版代码的完整真实 054 成功收据，也没有
  最终 exact-SHA 全仓 CI 或独立审查证明。
- CF-20 的全世界容量/预算映射、部分地理还原仍在开发；生产方块上限目前为 8,000。
  不要据此声称已达到老分支的大场景容量或还原效果。
- 用户最新安排：本次真实 Case 完整跑通并完成必要合入检查后，可以先合入 main，
  再从最新 main 拉新分支继续 CF；第二张图在后续分支验证，不再是本次合入前置。
  这不把容量、地理还原或其他未完成 CF 项标记为完成。
- 固定 `fda2ced3` 的 054 试跑已结束于 Native Check：Planner/Host 交接通过，
  Builder 退出 0，但源码包含小数点 ID，触发 `WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID`。
  Ground/Capture/发布未启动，因此当前尚不满足合入条件。CF-19 正修复任务内 ID 反馈遗漏，
  不能把私有诊断回放称为原 Run 成功。
