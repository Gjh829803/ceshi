import {CameraPanel,type CameraEditorBinding} from "./camera/panel";
import { Box, PersonStanding } from "lucide-react";
import {MotionFamilyCatalog} from './motion-family-catalog';
import { Hint } from "./components/hint";
import { toast } from "sonner";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { humanoid } from "@worldkit/three";
import type {
  AssetProfile,
  ControlTuning,
} from "@worldkit/preset-content/platform/profiles";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Slider } from "./components/ui/slider";
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
  viewId: string | null;
  kind: "third-person" | "first-person" | "shoulder" | null;
  views: readonly {id:string;label:string;kind:"third-person"|"first-person"|"shoulder"}[];
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
  powertrain?:boolean;
  family: string;
  control: ControlTuning;
  velocity: readonly number[];
  grounded: boolean;
};
export type InspectorOptions = {
  cameraEditor?():CameraEditorBinding;
  getAssetId(): string;
  getSubject(): InspectorSubject;
  getProfile(id: string): AssetProfile;
  applyProfile(profile: AssetProfile, tab: InspectorTab): void;
  saveProfile(profile: AssetProfile): void;
  resetProfile(id: string, tab: InspectorTab): void;
  getMovement(): InspectorMovement;
  getCamera(): InspectorCamera;
  setCameraView(viewId: string): void;
  getTelemetry?(): InspectorTelemetry;
  onInteract?(): void;
};
export type AssetInspector = { sync(): void; focus(): void; dispose(): void };
type NumericFieldKey = keyof ControlTuning;
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
// Live speed/pose samples must not rebuild every slider and tooltip.
const NumericField = memo(function NumericField({
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
  fieldKey: NumericFieldKey;
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
  onChange(key: NumericFieldKey, value: number, group: "camera" | "control"): void;
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
                    onChange(fieldKey, input.valueAsNumber, group);
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
              if (next !== undefined && Number.isFinite(next)) onChange(fieldKey, next, group);
            }}
          />
        </Hint>
        <p className="inspector-field-note" hidden={group !== "control"}>
          {note}
        </p>
      </div>
    </Hint>
  );
});

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
  const interact = useCallback(() => options.onInteract?.(), [options]);
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const person = assetId === "person",
    shoulder = camera.kind === "shoulder",
    cockpit = camera.kind === "first-person";
  const descriptions = humanoid.controlFields(movement.family,movement.powertrain);
  const hasChanges =
    dirty.has(`${assetId}:movement`) || dirty.has(`${assetId}:camera`);
  const markDirty = (target: InspectorTab) =>
    setDirty((previous) => new Set(previous).add(`${assetId}:${target}`));
  const run = useCallback((action: () => void, fallback: string) => {
    try {
      action();
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallback, {
        id: `${id}-profile`,
      });
    }
  }, [id, refresh]);
  const apply = useCallback((
    key: keyof ControlTuning,
    value: number | boolean,
    group: "camera" | "control" = "camera",
  ) => {
    run(() => {
      const next = structuredClone(options.getProfile(assetId));
      next.control[key] = value as number;
      const target = group === "control" ? "movement" : "camera";
      options.applyProfile(next, target);
      setDirty((previous) => new Set(previous).add(`${assetId}:${target}`));
    }, "无法应用参数");
  }, [assetId, options, run]);
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
  return (
    <section
      className="camera-inspector"
      aria-labelledby={`${id}-title`}
      data-tab={tab}
      data-asset-id={assetId}
      data-view-id={camera.viewId}
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
            <MotionFamilyCatalog onInteract={interact} />
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
                        bounds={humanoid.CONTROL_RANGES[d.key]}
                        disabled={!!d.disabled}
                        reason={d.note}
                        onChange={apply}
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
                {camera.views.map(({label,id}) => (
                  <Button
                    key={id}
                    type="button"
                    className="inspector-mode"
                    data-view-id={id}
                    aria-pressed={camera.viewId === id}
                    onClick={() => {
                      options.onInteract?.();
                      run(
                        () => options.setCameraView(id),
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
                    ? "第一人称 · 点击画面自由观察，Esc 释放"
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
            {options.cameraEditor && <CameraPanel binding={options.cameraEditor()} subjectId={assetId}/> }
          </TabsContent>
        </Tabs>
      </div>
      <footer className="inspector-footer" hidden={tab === "camera"}>
        <div className="inspector-actions">
          <Button
            type="button"
            className="inspector-reset"
            disabled={tab === "camera"}
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
            disabled={tab === "camera"}
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
    lastViewId: string | null = null,
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
    lastViewId = snapshot.camera.viewId;
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
        lastViewId !== options.getCamera().viewId
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
