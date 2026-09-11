# 交互呈现与内容生命周期

readInteractionTargets 读取 Environment 的已提交状态，不再通过任一 Actor 间接寻找
物件。返回独立副本，零 Actor 时仍可观察，读取不推进物理。PresentationState 中
没有实际消费者的目标插值缓存、copyTargets/blendTargets 已删除。Playground 的空
frameClock.reset、presentation.snap 和无调用 getter 门面也已删除；实际时钟与呈现
继续由 SDK 管理。

地图内容构建显式创建 pickup 和 loose crate 的模型，buildWorld 管理其释放。
buildInteractionVisuals.update 只投影已有模型；未知 target 不生成包裹。地图切换
先构建候选、成功后释放旧内容；普通实体今后绑定交互不会通过观察复制第二个模型。
显示目录仍识别嵌套在地图根下的物件。共享内容与显示诊断改用 SDK 的目标类型，
删除重复类型定义，不保留旧参数入口。

155 项相关状态、呈现、Playground、Creator schema 测试通过；typecheck、lint、
census、diff 和 prebuild 通过。独立只读复核没有新的确认问题。
运行时 `1304ff129c1214755619b630a57eed8f1e4ac2a6d72630bf256de4ec59a073bf`
的真实 Creator 和独立 Episode 完成移动/跳跃/视角、拾取/持有/放下、坐下/占座/起身。
证据 `.codex-tmp/interaction-visual-browser/report.json`。

真实 Playground 拖拽相机、行走跟随、工坊/室内/园区切图、前往巡逻艇、登艇和三个
镜头模式切换通过；跟随臂长漂移约 0.00000060 m。截图已检查，页面错误监听为空。
Vite 另外报告 ResizeObserver 未送达通知与软件渲染扩展提示，本批没有将其认定为
交互执行失败，也没有调查其起因。证据 `.codex-tmp/interaction-visual-playground/`。
本地服务已停止；未跑性能计时或远端 CI。

R3 动态绑定、预约与 generation，R4/R5 的事件及姿态提交，和最终 R6 验收仍未完成。
