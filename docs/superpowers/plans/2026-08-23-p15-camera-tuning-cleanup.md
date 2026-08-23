# P1.5 相机收尾：Camera Tuning 数字 overlay 收口

- 状态：Completed
- 基准日期：2026-08-23
- 对应 Backlog：`docs/18-refactor-progress-and-backlog.md` §P1.5「P1.5 合入后仍待收尾」第 1 条
- 方向：混合（production 只认锁定 Camera Profile Ref；实时预览走显式非 Gameplay 的 preview 通道）

## 完成证据

- `pnpm typecheck`：通过；
- `pnpm test`：144 个测试文件、1428 项测试；全量并发下仅 `subject-preset-promotion.test.ts`
  的 `requires --write...` 一项偶发 20s 超时，单独重跑稳定通过（22/22），
  判定为并发资源争用，与本切片无关；
- `pnpm verify:canonical`：真实 Chromium 下 Browser Protocol V4 方法集合（33 个）与全部门禁通过。

## 1. 目标

对齐 Feel 已完成的收口（删除 `setMotionTuning` 数字袋，production 只认锁定 Ref，数字
草稿留在 authoring workspace 并 `promote` 物化），把相机从「会话数字 overlay」收成同样
的纪律，同时保留 Subject Preset 工作台的实时手感预览。

不变式（本切片的验收核心）：**Canonical `WorldRuntimeSnapshotV3.camera` 不再包含任何
数字袋或自由字符串**；`tuning` / `preference` 只允许存在于显式标注的 authoring preview
状态，不进入 Capture Hash、确定性重放或 Gameplay 真相。

## 2. 现状（三个泄漏点）

| 泄漏点 | 位置 | 处置 |
|---|---|---|
| `setCameraTuning(tuning)` | `WorldkitBrowserApiV4` + `babylon-world-runtime` + `babylon-world-adapter` | 删除 production 入口，数字注入只走 preview 通道 |
| `applySubjectPresetTuning.cameraOverridesByProfileRef` + `.cameraPreference` | `ApplySubjectPresetTuningRequestV1` | 从请求中删除；相机预览改走独立 preview 通道 |
| Snapshot `camera.tuning` + `camera.preference` | `WorldRuntimeSnapshotV3.camera` | 删除两个字段 |

Authoring 层已收口、保持不变：`subject-preset-candidate.ts` 的 `overrides.cameraByProfileRef`
与 `cameraPublicationBySourceProfileRef` 是数字草稿的正确归宿，`promote` 时物化为新
`camera-rig-profile` Registry 版本。

## 3. 字段变更清单

### 3.1 删除（production 会话 / Browser 协议 / Contract）

1. `WorldRuntimeSnapshotV3.camera.tuning`（`runtime-session.ts`）
2. `WorldRuntimeSnapshotV3.camera.preference`（`runtime-session.ts`）
3. `WorldkitBrowserApiV4.setCameraTuning`
4. `ApplySubjectPresetTuningRequestV1.cameraOverridesByProfileRef`
5. `ApplySubjectPresetTuningRequestV1.cameraPreference`
6. `CameraDirectorSnapshotV1.preference` / `.tuning`（`camera-director.ts`）
7. `babylon-world-runtime.setCameraTuning`
8. `babylon-world-runtime.applySubjectPresetTuning` 内相机数字处理分支

### 3.2 改名（production 只认锁定 Ref）

- `setCameraPreference(preference: CameraPreferenceV1)` → `requestCameraProfile(profileRef: string)`：
  只接受 Camera Context 可达的锁定 Profile Ref；「auto / first-person」语义收敛为 Camera
  Context 规则决定的默认 Ref，不再作为自由字符串出现在会话契约中。
- 对应 `camera-director.setPreference` 收敛为 `requestProfile(profileRef)`；`CameraPreferenceV1`
  自由字符串类型随 production 路径删除。

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

preview 通道语义：仅服务 authoring 预览，修改 `tuningByProfileRef` 不影响
`WorldRuntimeSnapshotV3` 的字段或 Hash；`camera-director` 内部保留
`tuningByProfileRef` 用于渲染，但 snapshot 只输出 Ref 与视角偏移。

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

评审补强（后续提交）：新增 `packages/runtime-babylon/src/camera-preview-channel.test.ts`；
`applyCameraPreview` 补上缺失/非对象请求的稳定失败；Playground 草稿原子应用改为相机阶段先行。

## 5. Conformance 覆盖

1. `WorldRuntimeSnapshotV3.camera` 结构断言不含 `tuning` / `preference`
   （`capability-runtime.test.ts` + `camera-preview-channel.test.ts`）。
2. `applyCameraPreview` 后 `snapshot()` 不再输出 `tuning` / `preference`，且 Subject
   状态与同输入固定 Tick 的 Gameplay 真相不受影响（`camera-preview-channel.test.ts`）。
   澄清：渲染相机的 `positionMetersXYZ` 是 preview 的呈现层效果，会随预览数值变化；
   它不进入 Capture Hash（`SimulationTakeV1` 不含 tuning 字段），Take 重放也不读取
   preview tuning（`scripts/lib/simulation-take-runner.ts` 无 preview 调用）。
3. `requestCameraProfile` 对非锁定/不可达/自由字符串 Ref 返回稳定失败（`RangeError`），
   不改动 `activeCameraProfileRef`（`camera-preview-channel.test.ts`）。
4. `applySubjectPresetTuning` 不再接受相机数字字段（请求结构断言，类型层面删除）。

## 6. 验收命令

```bash
pnpm typecheck
pnpm test
pnpm verify:canonical
```

本切片只收口相机数字 overlay；不改变 motion / control-feel / control 的既有收口，不新增
Camera Profile 字段，不扩展现有 Registry 资源。
