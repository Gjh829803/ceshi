# P1.5 相机收尾：Camera Tuning 数字 overlay 收口

- 状态：Completed / integrated candidate ready
- 原始方案日期：2026-08-23；当前集成基线：`main@429fe1d`（Browser Protocol V5 / Route Evidence V2）
- 对应 Backlog：`docs/18-refactor-progress-and-backlog.md` §P1.5「P1.5 合入后仍待收尾」第 1 条
- 方向：混合（production 只认锁定 Camera Profile Ref；实时预览走显式非 Gameplay 的 preview 通道）

## 最终集成状态与证据边界

- 原始 Camera 分支曾在 Browser Protocol V4 基线上记录 `typecheck`、144 files / 1428 tests
  与 Canonical Browser Gate；该结果只属于历史分支，不能作为本次 Browser V5 集成候选的
  完成证据。
- 当前候选已把 Camera preview 隔离改动移植到 `main@429fe1d` 的 Browser Protocol V5，
  必须完整保留 Route Evidence V2 方法，不恢复 V4 alias。
- 最终 Camera matrix 为 10 files / 190 tests；`typecheck`、frozen offline install、build、
  Canonical、R0/R1/R1b、Placement、Rigged、G Bot、Validation Capture 与 `diff --check` 全部
  通过。`pnpm test` 两次均为 147/149 files、1587/1589 tests，两条重型 Route 超时分别串行
  通过（`46.964s`；12/12、`102.07s`），且 1041-tick 候选/`main` 对拍为 `39.035s` /
  `40.372s`，确认是并发资源竞争而非 Camera regression。
- `verify:control-capture` 在 `main` 与候选上均因相同 stale World Package Hash 失败，作为
  既有基线漂移记录，本切片不改金标。Cursor fast 最终复核限定时间无输出后终止，不作为
  证据；最终 GO 来自 Host 三方语义复核和上述门禁。

## 1. 目标

对齐 Feel 已完成的收口（删除 `setMotionTuning` 数字袋，production 只认锁定 Ref，数字
草稿留在 authoring workspace 并 `promote` 物化），把相机从「会话数字 overlay」收成同样
的纪律，同时保留 Subject Preset 工作台的实时手感预览。

不变式（本切片的验收核心）：**Canonical `WorldRuntimeSnapshotV3.camera` 不再包含任何
Camera Tuning 数字袋或旧的自由字符串 preference**；数字 tuning 只允许存在于显式标注的
authoring preview 状态，不进入 `SimulationTakeV1` 输入，也不改变固定 Tick Gameplay Subject
真相。Preview 会改变呈现层 Camera Pose、Capture Camera Matrix 与渲染 Pixels，因此会改变
包含 `camera` 和 Pass Content Hash 的 Control Capture `frameHash`；不得把“Take 输入不含
preview”误写成“Capture Hash 不受 preview 影响”。

## 2. 现状（三个泄漏点）

| 泄漏点 | 位置 | 处置 |
|---|---|---|
| `setCameraTuning(tuning)` | `WorldkitBrowserApiV5` + `babylon-world-runtime` + `babylon-world-adapter` | 删除 production 入口，数字注入只走 preview 通道 |
| `applySubjectPresetTuning.cameraOverridesByProfileRef` + `.cameraPreference` | `ApplySubjectPresetTuningRequestV1` | 从请求中删除；相机预览改走独立 preview 通道 |
| Snapshot `camera.tuning` + `camera.preference` | `WorldRuntimeSnapshotV3.camera` | 删除两个字段 |

Authoring 层已收口、保持不变：`subject-preset-candidate.ts` 的 `overrides.cameraByProfileRef`
与 `cameraPublicationBySourceProfileRef` 是数字草稿的正确归宿，`promote` 时物化为新
`camera-rig-profile` Registry 版本。

## 3. 字段变更清单

### 3.1 删除（production 会话 / Browser 协议 / Contract）

1. `WorldRuntimeSnapshotV3.camera.tuning`（`runtime-session.ts`）
2. `WorldRuntimeSnapshotV3.camera.preference`（`runtime-session.ts`）
3. `WorldkitBrowserApiV5.setCameraTuning`
4. `ApplySubjectPresetTuningRequestV1.cameraOverridesByProfileRef`
5. `ApplySubjectPresetTuningRequestV1.cameraPreference`
6. `CameraDirectorSnapshotV1.preference` / `.tuning`（`camera-director.ts`）
7. `babylon-world-runtime.setCameraTuning`
8. `babylon-world-runtime.applySubjectPresetTuning` 内相机数字处理分支

### 3.2 P1.5 未发布过渡协议（production 只认锁定 Ref）

- `setCameraPreference(preference: CameraPreferenceV1)` → `requestCameraProfile(profileRef: string)`：
  只接受 Camera Context 可达的锁定 Profile Ref；「auto / first-person」语义收敛为 Camera
  Context 规则决定的默认 Ref，不再作为自由字符串出现在会话契约中。
- 对应 `camera-director.setPreference` 收敛为 `requestProfile(profileRef)`；`CameraPreferenceV1`
  自由字符串类型随 production 路径删除。

`requestCameraProfile` / `resetCameraProfile` 只是 P1.5 期间尚未发布的过渡协议，不是长期
公共命名。后续 GCC-3 必须按已评审的
[`上下文驱动 Gameplay 与 Camera 组合设计`](../specs/2026-08-24-context-driven-gameplay-camera-composition-design.md)
执行 clean break：统一为闭合 `cameraViewPreference` 与
`view.camera-preference.set` / `view.camera-preference.reset`，并同步 Schema、Runtime/World
Session、CLI、Browser、generated types、Snapshot/Event 和测试；不得保留 request/reset alias。

### 3.3 新增（preview 通道，非 Gameplay）

新类型（`runtime-contracts`）：

```ts
export interface CameraPreviewStateV1 {
  readonly kind: "worldkit-camera-preview-state";
  readonly schemaVersion: 1;
  readonly activeCameraProfileRef: string;
  readonly activeCameraRigRef: string;
  readonly activeCameraModifierRefs: readonly string[];
  readonly tuningByProfileRef: Readonly<Record<string, Readonly<CameraTuningV1>>>;
}
```

新方法（Runtime + Browser API，均带可选签名，标记 `?`）：

- `getCameraPreviewState(): CameraPreviewStateV1`
- `applyCameraPreview(request: ApplyCameraPreviewRequestV1): CameraPreviewStateV1`

`ApplyCameraPreviewRequestV1` 最终实现仅含 `tuningByProfileRef`（早期草稿曾带
`activeCameraProfileRef`，已收窄：preview 只改数值，不切换激活 Profile；切换走
`requestCameraProfile` / `resetCameraProfile`）。

preview 通道语义：仅服务 authoring 预览，修改 `tuningByProfileRef` 不向
`WorldRuntimeSnapshotV3` 写回数字 tuning，也不改变 Subject Gameplay State 或
`SimulationTakeV1` 输入；`camera-director` 内部保留 `tuningByProfileRef` 用于渲染，snapshot
只输出 Ref、呈现层 Camera Pose 与视角偏移。由于 preview 会改变 rendered Camera、Camera
Matrix 和 Pixels，Control Capture 的 `frameHash` 也会相应变化。

## 4. 受影响文件（实际改动面）

- `packages/runtime-contracts/src/runtime-session.ts`
- `packages/runtime-babylon/src/camera-director.ts`
- `packages/runtime-babylon/src/babylon-world-runtime.ts`
- `packages/runtime-babylon/src/capability-runtime.test.ts`
- `apps/playground/src/babylon-world-adapter.ts`
- `apps/playground/src/worldkit-browser-api.ts` + `worldkit-browser-api.test.ts`
- `apps/playground/src/subject-preset-workbench.ts` + `subject-preset-workbench.test.ts`
- `apps/playground/src/main.ts`
- `scripts/verify-canonical-world.ts`
- `artifacts/examples/package-subject-world/snapshot.json`（确定性裁剪）
- `docs/18-refactor-progress-and-backlog.md`、`.gitignore`

未改动（早期清单多列，现澄清）：`camera-parameter-contract.ts`（`CameraTuningV1`
原样保留供 preview 通道使用）、`subject-preset-local.ts`、
`subject-preset-local.test.ts`、`subject-preset-candidate.test.ts`、
`scripts/lib/subject-preset-promotion.test.ts`。

候选实现补强：新增 `packages/runtime-babylon/src/camera-preview-channel.test.ts`；
`applyCameraPreview` 补上缺失/非对象请求的稳定失败，并补充 Runtime 隔离、Reset、
30/60/120 Hz-like cadence、Subject Gameplay truth 与 Camera 呈现层变化的回归；这些覆盖
已纳入最终 10 files / 190 tests 矩阵。

## 5. Conformance 覆盖

1. `WorldRuntimeSnapshotV3.camera` 结构断言不含 `tuning` / `preference`
   （`capability-runtime.test.ts` + `camera-preview-channel.test.ts`）。
2. `applyCameraPreview` 后 `snapshot()` 不再输出 `tuning` / `preference`，且 Subject
   状态与同输入固定 Tick 的 Gameplay 真相不受影响（`camera-preview-channel.test.ts`）。
   澄清：`SimulationTakeV1` 不含 preview tuning，Take runner 也不发 preview 命令，因此
   Preview 不属于 Take 输入或 Gameplay Subject truth；但渲染相机的 `positionMetersXYZ`、
   Capture Camera Matrix 与 Pixels 会随预览数值变化，Control Capture `frameHash` 包含
   `camera` 和 Pass Content Hash，也会变化。
3. `requestCameraProfile` 对非锁定/不可达/自由字符串 Ref 返回稳定失败（`RangeError`），
   不改动 `activeCameraProfileRef`（`camera-preview-channel.test.ts`）。
4. `applySubjectPresetTuning` 不再接受相机数字字段（请求结构断言，类型层面删除）。

## 6. 最终验收与例外

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify:canonical
pnpm verify:route-r0-contract
pnpm verify:route-r1-heightfield
pnpm verify:route-r1b-static-platform
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
pnpm verify:validation-capture
git diff --check
```

本切片只收口相机数字 overlay；不改变 motion / control-feel / control 的既有收口，不新增
Camera Profile 字段，不扩展现有 Registry 资源。上述命令均已通过；full-suite Route 资源
竞争与 `verify:control-capture` 既有 Hash 漂移按本节开头记录，不阻断 P1.5 integration。
GCC-3 `cameraViewPreference` clean break 与 Camera Context Projector 继续开放。
