# 飞行器手感配表：资产默认值与实例覆盖

状态：已落地

适用范围：固定翼、尾推、直升机、多旋翼、倾转旋翼等由 `aircraftFlight` 控制的动力飞行器。滑翔机、滑翔伞、翼装和热气球不使用这组固定翼姿态调参。

## 1. 核心规则

飞行器参数分为两层：

```text
SDK 默认值
  ↓
载具资产默认值（例如 plane）
  ↓
场景实例覆盖值（例如 plane-01）
```

资产默认值用于保证同型号载具的基础手感一致；实例覆盖值用于处理任务特殊载具、损伤状态、升级状态或单独校准。

| 配置 | 是否需要 `instanceId` | 作用范围 |
| --- | --- | --- |
| 项目/资产默认 profile | 否 | 该资产的所有实例 |
| Playground 3C 调试修改 | 自动带入 | 当前正在驾驶的实例 |
| SDK 代码直接应用实例覆盖 | 是 | 指定的单个实例 |

用户不需要在界面中填写 `instanceId`。它由场景创建载具时生成，并由 Playground 根据当前驾驶对象自动注入。

## 2. 三个 ID 的区别

### `assetId`

表示载具资产或预设类型。例如 profile 文件中的：

```json
{
  "assetId": "plane"
}
```

它描述的是“哪一种飞机”，不是场景中的某一架飞机。

### `instanceId`

表示场景中某个实体的唯一身份。例如：

```text
plane-01
plane-02
```

同一个 `assetId` 可以有多个不同的 `instanceId`。实例 ID 必须由场景/runtime 保证唯一，不能让用户在调参面板中随意修改。

### `VehicleSpec.id`

在 Playground 当前单实例预设中，它与当前载具的实例身份一致，因此选择 `plane` 时看起来像是在按资产 ID 工作。runtime 初始化时会把场景传入的 `VehicleInstance.instanceId` 作为运行时实体 ID，保证多实例可以分开管理。

## 3. Playground 3C 调试行为

在 3C 调试面板中修改飞行姿态参数时，流程是：

1. Playground 读取当前驾驶载具。
2. 从 runtime 取得当前载具的实例 ID。
3. 内部给 profile 添加 `instanceId`。
4. 将改动只提交给当前实例。
5. 保存和重置时继续使用同一个实例作用域。

因此，用户只需要调节俯仰增益、横滚增益和阻尼等参数，不需要看到或填写实例 ID。

当前支持的飞行姿态参数包括：

- `pitchGain`：俯仰响应增益
- `rollGain`：横滚响应增益
- `pitchRateDamping`：俯仰角速度阻尼
- `rollRateDamping`：横滚角速度阻尼
- `yawRateDamping`：偏航角速度阻尼

## 4. Profile 示例

### 资产级配置：应用到所有同资产实例

不带 `instanceId`：

```ts
const profile = getDefaultProfile('plane')!;
profile.aircraftFlight!.pitchGain = 11;
applyControlProfile(runtime, profile);
```

如果场景中有 `plane-01` 和 `plane-02`，两者都会得到 `pitchGain = 11`。

### 实例级配置：只应用到某一架飞机

带 `instanceId`：

```ts
const base = getDefaultProfile('plane')!;
const profile = {
  ...base,
  instanceId: 'plane-01',
  aircraftFlight: {
    ...base.aircraftFlight!,
    pitchGain: 17,
  },
};

applyControlProfile(runtime, profile);
```

此时：

```text
plane-01 = 17
plane-02 = 保持原值
```

读取某个实例的实际生效值时，也要提供它的实例身份：

```ts
readEditableProfile(runtime, {
  ...getDefaultProfile('plane')!,
  instanceId: 'plane-01',
});
```

## 5. 保存、导出与重置

- 没有实例 ID 的 profile 使用资产级保存范围。
- 带实例 ID 的 profile 使用资产 + 实例的独立本地存储范围。
- 3C 面板的“保存”保存当前实例配置。
- 3C 面板的“重置”只恢复当前实例的默认值。
- `profiles.json` 可以同时保存资产级 profile 和实例级 profile。
- 旧版没有 `instanceId` 的 profile 仍然可以正常读取。

交付前仍需显式导出 `profiles.json`；浏览器 localStorage 只是 Playground 的本地调试覆盖，不会自动成为项目交付文件。

## 6. 调参建议

推荐的实际工作方式：

1. 先用资产级默认值确定 `plane` 的基础手感。
2. 在 3C 面板中驾驶当前飞机，自动生成实例级临时覆盖。
3. 验证起飞、爬升、转弯、横滚、拉起和降落等场景。
4. 如果多个同型号实例都需要同样结果，再整理回资产级 profile。
5. 只有任务特殊、损伤、升级或个别校准时，才保留实例级覆盖。

不要把每一次临时试验都固化成全局资产默认值，否则会让同型号载具之间失去可控的一致性。

## 7. 实现位置与验证

- Profile 数据结构与存储：[profiles.ts](../packages/preset-content/src/profiles/profiles.ts)
- Profile 应用与读取：[profile-runtime.ts](../packages/preset-content/src/profiles/profile-runtime.ts)
- 3C 面板自动绑定：[main.ts](../apps/sdk-playground/src/main.ts)
- 多实例隔离回归：[aircraft.test.ts](../packages/three-world/src/humanoid-runtime/aircraft.test.ts)

当前实现已验证：资产级配置可以同步到相同资产的多个实例，实例级覆盖不会改变其他实例；相关 profile、飞行器和 Creator 集成测试全部通过。
