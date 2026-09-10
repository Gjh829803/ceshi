# R3 交互绑定实施边界

父计划：[可扩展运行时](2026-09-10-extensible-world-and-content.md)。继续在同一分支
实现，不保留旧协议分支或第二套动作执行器。本文件是实现计划，不是已发布 API。

## 所有权

交互语义与物理实体分开。World 保存纯绑定定义、注册 generation 和 reset baseline；
WorldInteractions 保存 slot、预约及持续占用；Actor 持有带 generation 的关系。
物理实体的原 owner 负责临时持有、位置投影、碰撞关闭和恢复。ActionSystem 不直接
操作借用的 Rapier body，否则 ThreePhysics 下一 tick 会按 entry.enabled 再次开启它。

Map 的物件物理由 Environment 创建和释放，普通实体由 ThreePhysics 创建和释放，
都向同一交互实现提供受限物理能力。Map 定义是内容输入，不是另一种运行协议。
交互层不销毁借用物体；实体删除先使 slot 和关系失效，再销毁物理资源。

## 顺序

1. 提供内部物理能力：读取实际姿态/质量/尺寸、独占持有、移动已持有实体、按原
   配置释放、判断失效。ThreePhysics 把持有状态纳入子步和变更规则，避免双写。
   Map pickup/loose crate 的原生创建和释放移出 WorldInteractions。迁移全部裸
   target.body/collider 消费者，不加转发别名。验证原 body 数量不变、跨 tick 保持
   持有、原质量/摩擦/重力不被通用动作覆盖、删除后同 ID 新实例不受旧引用影响。
2. 用同一种 slot 定义连接 Entity 与动作：本地 anchor/rotation/approach，显式
   entityId、slotId 和 generation；生成世界坐标。单槽可省略请求 slotId，多槽必须
   指定。第一版每个实际座位槽容量为一，多个座位用多个独立位置；拾取另外持有
   整个物体的排他资源。更新 Map 内容及实际 Creator/Playground/Episode 字段。
3. 普通实体 options/prototype 绑定纯 slot 数据；动态注册在实际实体存在且物理
   能力有效后提交。World 保存 baseline，reset 与 map replacement 重解析能力，
   不保存旧 Rapier handle。碰撞体重建与实体 generation 分开；持有时拒绝冲突的
   物理重建。偏心 Group 的抓握点换算为实体根姿态，不能把抓握点直接当根原点。
4. 资源原子获取：角色移动/全身动画/姿态/双手、实体与交互槽按稳定顺序校验后
   一起占用。失败无半套预约，不隐式重试。短期预约按模拟时间过期；grip/坐定
   再验证身份、姿态与接触，转为持续 held/occupied，操作完成不释放持续关系。
5. 内容构建阶段创建实际模型，普通物件复用已有 Object3D。Map 白模也按内容定义
   创建，不能让 slot 观察自动为任意 pickup 再造一个包裹。同步与呈现各守自身阶段；
   纯观察不推进模拟或改变持有关系。动作事件的统一提交与 source/display 分离
   继续归 R4/R5，不以渲染回调作为新动作 owner。

## 失败和验收

- 目标移动/禁用/移除、slot 重绑、Actor 移除或 reset 后，旧引用不能完成 grip 或
  把已删除的物体重新开启；取消终态仍等待安全清理。
- 两 NPC 争一个物体/座位只能一方成功。同实体多槽可以分别坐人，但整实体 pickup
  必须与所有槽占用互斥。持有者移除时物体保留；目标移除时 Actor 关系结束。
- 真实 Mesh/Group 的 body/模型数量不增加，偏心抓握正确，持有和占座跨操作完成
  保持。暂停观察、reset、地图替换和同 ID 重生有回归。
- 用真实 Creator 与独立 Episode 验证完整争用、搬运/放下、坐下/起身场景，再进入
  R4/R5/R6；保持 Source101 和已调好的 Playground 行为。
