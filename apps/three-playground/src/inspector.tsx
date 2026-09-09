import { Box, PersonStanding } from "lucide-react";
import { Hint } from "./components/hint";
import { toast } from "sonner";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { training } from "@worldkit/three";
import type {
  AssetProfile,
  ProfileCameraTuning,
  ControlTuning,
} from "../../../shared/training-content/platform/profiles";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Slider } from "./components/ui/slider";
import { Switch } from "./components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { Label } from "./components/ui/label";
import "./styles/inspector.css";

export type InspectorSubject = {
  name: string;
  subtitle?: string;
  state?: string;
  color?: string;
};
export type InspectorCamera = {
  mode: number;
  distance: number;
  fovDegrees: number;
  yawRadians: number;
  pitchRadians: number;
  collisionLimited: boolean;
};
export type InspectorTelemetry = {
  speedKmh?: number;
  altitudeMeters?: number;
  paused?: boolean;
  position?: readonly number[];
  headingDegrees?: number;
};
export type InspectorTab = "movement" | "camera";
export type InspectorMovement = {
  family: string;
  control: ControlTuning;
  velocity: readonly number[];
  grounded: boolean;
};
export type InspectorOptions = {
  getAssetId(): string;
  getSubject(): InspectorSubject;
  getProfile(id: string): AssetProfile;
  applyProfile(profile: AssetProfile, tab: InspectorTab): void;
  saveProfile(profile: AssetProfile): void;
  resetProfile(id: string, tab: InspectorTab): void;
  getMovement(): InspectorMovement;
  getCamera(): InspectorCamera;
  setCameraMode(mode: number): void;
  getTelemetry?(): InspectorTelemetry;
  onInteract?(): void;
};
export type AssetInspector = { sync(): void; focus(): void; dispose(): void };
type NumericCameraKey = Exclude<keyof ProfileCameraTuning, "collisionEnabled">;
type Snapshot = {
  assetId: string;
  subject: InspectorSubject;
  profile: AssetProfile;
  movement: InspectorMovement;
  camera: InspectorCamera;
  telemetry: InspectorTelemetry;
};
const format = (value: number | undefined, precision = 1) =>
  value === undefined || !Number.isFinite(value)
    ? "—"
    : value.toFixed(precision);
const precision = (step: number) =>
  step < 0.001 ? 4 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
let inspectorCount = 0;

function Group({
  title,
  kicker = "TUNING",
  children,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
}) {
  return (
    <section className="inspector-group">
      <div className="inspector-group-header">
        <h3 className="inspector-group-title">{title}</h3>
        <span className="inspector-group-kicker">{kicker}</span>
      </div>
      {children}
    </section>
  );
}
function NumericField({
  id,
  fieldKey,
  group = "camera",
  label,
  unit,
  step,
  note,
  value,
  bounds,
  disabled = false,
  reason,
  hidden = false,
  onChange,
}: {
  id: string;
  fieldKey: string;
  group?: "camera" | "control";
  label: string;
  unit: string;
  step: number;
  note: string;
  value: number;
  bounds: readonly [number, number];
  disabled?: boolean;
  reason?: string | undefined;
  hidden?: boolean;
  onChange(value: number): void;
}) {
  const [draft, setDraft] = useState(
    String(Number(value.toFixed(precision(step)))),
  );
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current)
      setDraft(String(Number(value.toFixed(precision(step)))));
  }, [value, step]);
  return (
    <Hint content={disabled ? (reason ?? "此模式不使用该参数") : ""}>
      <div
        className="inspector-field"
        data-control-field={group === "control" ? fieldKey : undefined}
        data-camera-field={group === "camera" ? fieldKey : undefined}
        data-inactive={disabled}
        hidden={hidden}
      >
        <div className="inspector-field-label-row">
          <Label
            className="inspector-field-label"
            htmlFor={`${id}-${fieldKey}-number`}
          >
            {label}
          </Label>
          <span className="inspector-number-wrap">
            <Hint content={note}>
              <Input
                className="inspector-number"
                id={`${id}-${fieldKey}-number`}
                type="number"
                min={bounds[0]}
                max={bounds[1]}
                step={step}
                inputMode="decimal"
                disabled={disabled}
                value={draft}
                onFocus={() => {
                  editing.current = true;
                }}
                onChange={(event) => {
                  const input = event.currentTarget;
                  setDraft(input.value);
                  if (
                    input.value !== "" &&
                    input.validity.valid &&
                    Number.isFinite(input.valueAsNumber)
                  )
                    onChange(input.valueAsNumber);
                }}
                onBlur={() => {
                  editing.current = false;
                  setDraft(String(Number(value.toFixed(precision(step)))));
                }}
              />
            </Hint>
            <span className="inspector-field-unit" aria-hidden="true">
              {unit}
            </span>
          </span>
        </div>
        <Hint content={note}>
          <Slider
            className="inspector-range"
            min={bounds[0]}
            max={bounds[1]}
            step={step}
            value={[value]}
            disabled={disabled}
            aria-label={`${label}滑块`}
            onValueChange={(values) => {
              const next = values[0];
              if (next !== undefined && Number.isFinite(next)) onChange(next);
            }}
          />
        </Hint>
        <p className="inspector-field-note" hidden={group !== "control"}>
          {note}
        </p>
      </div>
    </Hint>
  );
}

function Inspector({
  id,
  snapshot,
  options,
  refresh,
}: {
  id: string;
  snapshot: Snapshot;
  options: InspectorOptions;
  refresh(): void;
}) {
  const { assetId, subject, profile, movement, camera, telemetry } = snapshot;
  const [tab, setTab] = useState<InspectorTab>("movement");
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const person = assetId === "person",
    shoulder = camera.mode === 2,
    cockpit = camera.mode === 1;
  const descriptions = training.controlFields(movement.family);
  const hasChanges =
    dirty.has(`${assetId}:movement`) || dirty.has(`${assetId}:camera`);
  const markDirty = (target: InspectorTab) =>
    setDirty((previous) => new Set(previous).add(`${assetId}:${target}`));
  const run = (action: () => void, fallback: string) => {
    try {
      action();
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallback, {
        id: `${id}-profile`,
      });
    }
  };
  function apply(
    key: keyof ProfileCameraTuning | keyof ControlTuning,
    value: number | boolean,
    group: "camera" | "control" = "camera",
  ) {
    run(() => {
      const next = structuredClone(options.getProfile(assetId));
      if (group === "control")
        next.control[key as keyof ControlTuning] = value as number;
      else if (key === "collisionEnabled")
        next.camera.collisionEnabled = value as boolean;
      else next.camera[key as NumericCameraKey] = value as number;
      const target = group === "control" ? "movement" : "camera";
      options.applyProfile(next, target);
      markDirty(target);
    }, "无法应用参数");
  }
  const cameraField = (
    key: NumericCameraKey,
    note: string,
    disabled = false,
    reason?: string,
    hidden = false,
  ) => {
    const definition =
      key === "distance"
        ? { label: "基础距离", unit: "m", step: 0.1 }
        : training.CAMERA_PARAMETERS[key];
    const bounds: readonly [number, number] =
      key === "distance"
        ? person
          ? [3.2, 12]
          : [1, 40]
        : training.CAMERA_TUNING_RANGES[key];
    return (
      <NumericField
        key={`${assetId}:${key}`}
        id={id}
        fieldKey={key}
        {...definition}
        note={note}
        value={profile.camera[key]}
        bounds={bounds}
        disabled={disabled}
        reason={reason}
        hidden={hidden}
        onChange={(value) => apply(key, value)}
      />
    );
  };
  const stat = (label: string, value: string) => (
    <div className="inspector-stat" key={label}>
      <span className="inspector-stat-label">{label}</span>
      <output className="inspector-stat-value" aria-live="off">
        {value}
      </output>
    </div>
  );
  const actual = (label: string, value: string) => (
    <div className="inspector-actual-entry" key={label}>
      <span className="inspector-actual-label">{label}</span>
      <output className="inspector-actual-value" aria-live="off">
        {value}
      </output>
    </div>
  );
  const collisionActive = profile.camera.collisionEnabled && !cockpit;
  return (
    <section
      className="camera-inspector"
      aria-labelledby={`${id}-title`}
      data-tab={tab}
      data-asset-id={assetId}
      data-mode={camera.mode}
      onPointerDown={() => options.onInteract?.()}
      onFocus={() => options.onInteract?.()}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <header className="inspector-header">
        <div className="inspector-heading">
          <h2 className="inspector-title" id={`${id}-title`}>
            3C 调试
          </h2>
        </div>
        <span className="inspector-live" data-paused={!!telemetry.paused}>
          {telemetry.paused ? "已暂停" : "实时"}
        </span>
      </header>
      <div className="inspector-scroll">
        <section className="inspector-subject" aria-label="当前操控主体">
          <div className="inspector-subject-top">
            <span
              className="inspector-subject-mark"
              aria-hidden="true"
              style={
                {
                  "--subject-color": subject.color ?? "#d3e9a8",
                } as CSSProperties
              }
            >
              {person ? <PersonStanding size={19} /> : <Box size={19} />}
            </span>
            <div className="inspector-subject-info">
              <div className="inspector-subject-heading">
                <h3 className="inspector-subject-name">{subject.name}</h3>
                <span className="inspector-subject-state">{subject.state ?? (person ? "步行" : "驾驶")}</span>
              </div>
              <span className="inspector-subject-subtitle">
                {subject.subtitle ?? assetId.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="inspector-subject-stats">
            {stat("速度 km/h", format(telemetry.speedKmh))}
            {stat("高度 m", format(telemetry.altitudeMeters))}
            {stat("朝向 °", format(telemetry.headingDegrees, 0))}
          </div>
          <div className="inspector-position">{`X ${format(telemetry.position?.[0])}    Y ${format(telemetry.position?.[1])}    Z ${format(telemetry.position?.[2])}`}</div>
        </section>
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as InspectorTab);
            options.onInteract?.();
          }}
        >
          <TabsList className="inspector-tabs" aria-label="主体属性分类">
            <TabsTrigger className="inspector-tab" value="movement">
              运动属性
            </TabsTrigger>
            <TabsTrigger className="inspector-tab" value="camera">
              相机模式
            </TabsTrigger>
          </TabsList>
          <TabsContent className="inspector-tab-panel" value="movement">
            <Group title="运动控制" kicker="MOVEMENT">
              <p className="inspector-group-note">{`当前家族 ${movement.family} · 仅应用到当前资产；灰色项不参与该家族运动。`}</p>
            </Group>
            {["速度范围", "加速与减速", "转向与稳定", "专项运动"].map(
              (section) => {
                const fields = descriptions.filter(
                  (d) => d.section === section,
                );
                return fields.length > 0 ? (
                  <Group key={section} title={section}>
                    {fields.map((d) => (
                      <NumericField
                        key={`${assetId}:${d.key}`}
                        id={id}
                        fieldKey={d.key}
                        group="control"
                        label={d.label}
                        unit={d.unit}
                        step={d.step}
                        note={d.note}
                        value={profile.control[d.key]}
                        bounds={training.CONTROL_RANGES[d.key]}
                        disabled={!!d.disabled}
                        reason={d.note}
                        onChange={(value) => apply(d.key, value, "control")}
                      />
                    ))}
                  </Group>
                ) : null;
              },
            )}
            <Group title="实时运动状态" kicker="READ ONLY">
              <output
                className="inspector-motion-velocity"
                aria-label="世界坐标速度"
              >{`VX ${format(movement.velocity[0], 2)}   VY ${format(movement.velocity[1], 2)}   VZ ${format(movement.velocity[2], 2)} m/s`}</output>
              <p className="inspector-group-note">{`支撑接触：${movement.grounded ? "有" : "无"} · 世界坐标速度只读`}</p>
              <output
                className="inspector-effective-control"
                aria-label="有效运动配置"
              >{`生效配置\n${descriptions
                .filter((d) => !d.disabled)
                .map(
                  (d) =>
                    `${d.label}: ${format(movement.control[d.key], d.step < 0.001 ? 4 : 2)} ${d.unit}`,
                )
                .join("\n")}`}</output>
            </Group>
          </TabsContent>
          <TabsContent className="inspector-tab-panel" value="camera">
            <Group title="相机模式" kicker="CAMERA">
              <div
                className="inspector-modes"
                role="group"
                aria-label="相机模式"
              >
                {(
                  [
                    ["第一人称", 1],
                    ["第三人称", 0],
                    ["沉浸越肩", 2],
                  ] as const
                ).map(([label, mode]) => (
                  <Button
                    key={mode}
                    type="button"
                    className="inspector-mode"
                    data-mode={mode}
                    aria-pressed={camera.mode === mode}
                    onClick={() => {
                      options.onInteract?.();
                      run(
                        () => options.setCameraMode(mode),
                        "无法切换相机模式",
                      );
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <p className="inspector-mode-note">
                {shoulder
                  ? "近距离右肩视角 · 滚轮调节距离 · 移动时轻微拉远"
                  : cockpit
                    ? "第一人称 · 点击画面自由观察，T 切换，Esc 释放"
                    : "第三人称跟随 · 鼠标自由环绕"}
              </p>
              <div className="inspector-camera-actual">
                {actual("实际距离", `${format(camera.distance, 2)} m`)}
                {actual("实际 FOV", `${format(camera.fovDegrees)}°`)}
                {actual(
                  "视角偏航",
                  `${format((camera.yawRadians * 180) / Math.PI)}°`,
                )}
                {actual(
                  "视角俯仰",
                  `${format((camera.pitchRadians * 180) / Math.PI)}°`,
                )}
              </div>
            </Group>
            <Group title="跟随与构图" kicker="FOLLOW & FRAMING">
              {cameraField(
                "distance",
                "跟随模式的镜头臂长；人物室内默认自动使用 5.6 m。",
                cockpit || shoulder,
                "第一人称固定眼位；越肩使用独立近距镜头，滚轮可调 1.3–3.2 m",
                shoulder,
              )}
              {cameraField(
                "followResponsePerSecond",
                "数值越大，镜头越快跟上主体。",
                cockpit,
                "当前模式不使用跟随阻尼",
              )}
              {cameraField(
                "targetHeightOffset",
                "在主体原始注视高度上增加偏移。",
                cockpit,
                "第一人称眼位由人物姿态决定",
              )}
              {cameraField(
                "horizontalOffset",
                "相对镜头右方向偏移；驾驶位相对座位右方向。",
                cockpit,
                "第一人称眼位由人物姿态决定",
              )}
            </Group>
            <Group title="自动回正" kicker="RECENTER">
              <p className="inspector-group-note">
                {person
                  ? "人物使用自由环绕，不自动回正。"
                  : cockpit
                    ? "第一人称保持独立观察，不自动回正。"
                    : "载具移动时回正；环绕操作会重新计时。"}
              </p>
              {cameraField(
                "recenterDelaySeconds",
                "停止环绕后，载具行驶超过此时长开始回正。",
                person || cockpit,
                "人物保持原有自由环绕；载具在第三人称和越肩模式可自动回正",
              )}
              {cameraField(
                "recenterResponsePerSecond",
                "回正到载具前进方向的速率；空中模式按原始比例放缓，0 关闭自动回正。",
                person || cockpit,
                "人物保持原有自由环绕；载具在第三人称和越肩模式可自动回正",
              )}
            </Group>
            <Group title="镜头" kicker="LENS">
              {cameraField(
                "baseFovDegrees",
                "人物保持设置的视野；载具会按速度额外增加最多 12°。",
              )}
              <p className="inspector-group-note">
                {shoulder
                  ? "越肩随移动速度最多增加 4° 视野。"
                  : person || cockpit
                    ? "视野固定为设置值。"
                    : "随速度增加视野，上方显示实时结果。"}
              </p>
            </Group>
            <Group title="镜头避障" kicker="COLLISION">
              <Label
                className="inspector-toggle-row"
                htmlFor={`${id}-collision`}
              >
                <span className="inspector-field-label">启用碰撞检测</span>
                <Switch
                  id={`${id}-collision`}
                  className="inspector-toggle"
                  checked={profile.camera.collisionEnabled}
                  disabled={cockpit}
                  onCheckedChange={(value) => apply("collisionEnabled", value)}
                />
              </Label>
              {cameraField(
                "collisionRadiusMeters",
                "镜头球体探测半径；更大半径会更早收回镜头。",
                cockpit || !profile.camera.collisionEnabled,
                "关闭检测或第一人称时不使用探测球",
              )}
              <div
                className="inspector-collision-state"
                data-limited={collisionActive && camera.collisionLimited}
              >
                {!collisionActive
                  ? "检测未启用"
                  : camera.collisionLimited
                    ? "检测到遮挡 · 镜头已收回"
                    : "检测正常 · 镜头无遮挡"}
              </div>
            </Group>
            <p className="inspector-interaction-note">
              拖动场景环绕 · 滚轮缩放
            </p>
          </TabsContent>
        </Tabs>
      </div>
      <footer className="inspector-footer">
        <div className="inspector-actions">
          <Button
            type="button"
            className="inspector-reset"
            onClick={() =>
              run(() => {
                options.resetProfile(assetId, tab);
                markDirty(tab);
                toast.success("已恢复当前页默认 · 尚未保存到本地", {
                  id: `${id}-profile`,
                });
              }, "无法恢复默认参数")
            }
          >
            {tab === "movement" ? "恢复运动默认" : "恢复相机默认"}
          </Button>
          <Button
            type="button"
            className="inspector-save"
            data-dirty={hasChanges}
            onClick={() =>
              run(() => {
                options.saveProfile(options.getProfile(assetId));
                setDirty((previous) => {
                  const next = new Set(previous);
                  next.delete(`${assetId}:movement`);
                  next.delete(`${assetId}:camera`);
                  return next;
                });
                toast.success(
                  "已保存本地 · debugProfiles=1 加载；交付需导出配置",
                  { id: `${id}-profile` },
                );
              }, "浏览器本地存储不可用")
            }
          >
            保存到本地
          </Button>
        </div>
        <p className="inspector-save-status" role="status" aria-live="polite">
          {hasChanges
            ? "实时已应用 · 尚未保存到本地"
            : "参数按当前资产独立保存；正式交付需导出配置。"}
        </p>
      </footer>
    </section>
  );
}

/** The caller owns simulation and placement. sync reads its state; it never advances it. */
export function mountInspector(
  host: HTMLElement,
  options: InspectorOptions,
): AssetInspector {
  const id = `camera-inspector-${++inspectorCount}`;
  const root = createRoot(host);
  let disposed = false,
    lastRender = -Infinity,
    lastAssetId = "",
    lastMode = -1,
    timer: ReturnType<typeof setTimeout> | undefined;
  const read = (): Snapshot => {
    const assetId = options.getAssetId();
    return {
      assetId,
      subject: { ...options.getSubject() },
      profile: structuredClone(options.getProfile(assetId)),
      movement: structuredClone(options.getMovement()),
      camera: { ...options.getCamera() },
      telemetry: structuredClone(options.getTelemetry?.() ?? {}),
    };
  };
  const render = () => {
    if (disposed) return;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    const snapshot = read();
    lastAssetId = snapshot.assetId;
    lastMode = snapshot.camera.mode;
    lastRender = performance.now();
    flushSync(() =>
      root.render(
        <Inspector
          id={id}
          snapshot={snapshot}
          options={options}
          refresh={render}
        />,
      ),
    );
  };
  render();
  return {
    sync() {
      if (disposed) return;
      const elapsed = performance.now() - lastRender;
      if (
        elapsed >= 100 ||
        lastAssetId !== options.getAssetId() ||
        lastMode !== options.getCamera().mode
      )
        render();
      else if (timer === undefined) timer = setTimeout(render, 100 - elapsed);
    },
    focus() {
      host
        .querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
        ?.focus({ preventScroll: true });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      root.unmount();
    },
  };
}
