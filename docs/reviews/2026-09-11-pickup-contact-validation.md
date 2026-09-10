# 拾取接触再验证

原实现只在预约时检查目标位置和声明质量；目标在播放期间移走、禁用或变重后，
握取仍会完成。三个红测已复现。现在预约资格和接触提交通过原物理 owner 读取
实际位置、尺寸、质量、启用状态和可移动性。接触阶段使用 Actor 的实际位置与朝向，
不复用开头的站位判断。失效时取消并释放预约，物体保持原物理状态，不吸附到手中。

物理能力也拒绝获取禁用 body/collider，保留原持有者重复调用的幂等性。取消已经
握取的动作仍保留持有；此规则没有因增加接触检查改变。该动作仍是 Source101
校准的桌面高度动作，不是任意位置 IK。

删除了 SourceCharacter 中仅为旧 inspector 保留、已无实际消费者的 ik 和 handError
占位字段。当前源码、示例、脚本和说明没有残留调用；不保留兼容访问器。

166 项相关物理/共享动作/Runtime 回归，以及 44 项源人物/呈现/Creator schema/
Episode 合同测试通过；typecheck、lint、census、diff 和 prebuild 通过。独立只读
复核没有新的确认问题。

真实 Creator 与独立 Episode 使用
`bb298a081127e26f8a20987f56166ba87c60e6b48e5cfb10f70a045533c6992b`，
移动/跳跃/视角、拾取/持续持有/放下、坐下/持续占座/起身通过，证据在
`.codex-tmp/pickup-contact-browser/report.json`。未跑性能计时或远端 CI。

动态实体/slot/generation、事件提交、完整 Source/Display 边界和最终 R6 深查仍在
总计划内；本记录不代表完整交互系统或整个重构已完成。
