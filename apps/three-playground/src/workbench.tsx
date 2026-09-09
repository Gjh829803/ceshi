import { ModalHeader, ModalFooter } from "./components/modal-layout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "./components/ui/dialog";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { training } from "@worldkit/three";
import { SPECS } from "../../../shared/training-content/config";
import { MAPS } from "../../../shared/training-content/environment/maps";
import {
  parseAssetProfile,
  type AssetProfile,
} from "../../../shared/training-content/platform/profiles";
import "./styles/workbench.css";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { ChoiceSelect, ChoiceOption } from "./components/choice-select";

type Tab = "scenes" | "camera";
interface WorkbenchOptions {
  onOpenChange(open: boolean): void;
  onPrepare(mapId: string, regionId: string, assetId: string): void;
  getMapId(): string;
  getAssetId(): string;
  getProfile(id: string): AssetProfile;
  applyProfile(profile: AssetProfile): void;
  saveProfile(profile: AssetProfile): void;
  resetProfile(id: string): void;
  getState(): Record<string, unknown>;
  togglePause(): void;
  step(): void;
}
const subjects = [
  { id: "person", name: "主体人物", mode: "character" },
  ...SPECS,
];
type Controller = { open(tab?: Tab): void; close(): void; isOpen(): boolean };
function Workbench({
  options: o,
  controller,
}: {
  options: WorkbenchOptions;
  controller: { current?: Controller };
}) {
  const openRef = useRef(false),
    previousFocus = useRef<HTMLElement | null>(null);
  const [tab, setTab] = useState<Tab>("scenes"),
    [mapId, setMapId] = useState(o.getMapId),
    [assetId, setAssetId] = useState(o.getAssetId);
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [telemetry, setTelemetry] = useState(() => o.getState());
  const report = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : String(error), {
      id: "workbench-feedback",
    });
  const inform = (text: string) => {
    if (text) toast.success(text, { id: "workbench-feedback" });
  };
  const changeOpen = (value: boolean) => {
    if (openRef.current === value) return;
    openRef.current = value;
    setOpen(value);
    o.onOpenChange(value);
  };
  const close = () => changeOpen(false);
  controller.current = {
    open(next = "scenes") {
      if (!openRef.current) {
        previousFocus.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setMapId(o.getMapId());
        setAssetId(o.getAssetId());
        changeOpen(true);
      }
      setTab(next);
      setRevision((n) => n + 1);
      setTelemetry(o.getState());
      inform("");
    },
    close,
    isOpen: () => !!openRef.current,
  };
  useEffect(() => {
    const timer = setInterval(() => {
      if (openRef.current && tab === "camera") setTelemetry(o.getState());
    }, 250);
    return () => clearInterval(timer);
  }, [o, tab]);
  const selectAsset = (label: string) => (
    <label className="wb-field">
      {label}
      <ChoiceSelect
        aria-label={label}
        value={assetId}
        onValueChange={(value) => {
          setAssetId(value);
          inform("");
        }}
      >
        {subjects.map((s) => (
          <ChoiceOption key={s.id} value={s.id}>
            {s.name}
          </ChoiceOption>
        ))}
      </ChoiceSelect>
    </label>
  );
  const map = MAPS.find((m) => m.id === mapId)!,
    subject = subjects.find((s) => s.id === assetId)!;
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        className="workbench"
        aria-label="训练与资产工作台"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!openRef.current)
            previousFocus.current?.focus({ preventScroll: true });
        }}
      >
        <ModalHeader title="测试工作台" />
        <DialogDescription className="sr-only">
          选择测试场景，调整人物与载具的操控和相机配置。
        </DialogDescription>
        <div className="modal-body">
          <nav className="wb-tabs" aria-label="工作台分区">
            {(
              [
                ["scenes", "测试场景"],
                ["camera", "3C 调试与配置"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                className="wb-button"
                aria-current={tab === id}
                onClick={() => {
                  setTab(id);
                  setRevision((n) => n + 1);
                  inform("");
                }}
              >
                {label}
              </Button>
            ))}
          </nav>
          <div className="wb-content">
            {tab === "scenes" ? (
              <>
                <p className="wb-note">
                  先选择人物或载具，再准备对应区域。准备会复位这个主体；资产库的“前往”会保留其当前位置。切换地图会重新整备所有主体。
                </p>
                <div className="wb-parameter-grid">
                  <label className="wb-field">
                    测试地图
                    <ChoiceSelect
                      aria-label="测试地图"
                      value={mapId}
                      onValueChange={(value) => {
                        setMapId(value);
                        inform("");
                      }}
                    >
                      {MAPS.map((m) => (
                        <ChoiceOption key={m.id} value={m.id}>
                          {m.name}
                        </ChoiceOption>
                      ))}
                    </ChoiceSelect>
                  </label>
                  {selectAsset("测试主体")}
                </div>
                <p className="wb-note">{map.description}</p>
                <div className="wb-scene-grid">
                  {map.regions.map((region) => {
                    const compatible = region.modes.includes(subject.mode);
                    return (
                      <section
                        key={region.id}
                        className={`wb-scene${compatible ? "" : " wb-incompatible"}`}
                        style={
                          { "--region-color": region.color } as CSSProperties
                        }
                      >
                        <span className="wb-chip">
                          {compatible
                            ? "可准备 · 静态测试场"
                            : "请选择适配主体"}
                        </span>
                        <h3>{region.name}</h3>
                        <p className="wb-note">{region.description}</p>
                        <Button
                          className="wb-button"
                          disabled={!compatible}
                          onClick={() => {
                            try {
                              o.onPrepare(map.id, region.id, assetId);
                              close();
                            } catch (e) {
                              report(e);
                            }
                          }}
                        >
                          {compatible ? (
                            <>
                              准备 {subject.name}
                              <ArrowRight size={16} aria-hidden="true" />
                            </>
                          ) : (
                            "当前主体不适配"
                          )}
                        </Button>
                      </section>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                {selectAsset("编辑 3C 资产")}
                <CameraEditor
                  key={`${assetId}:${revision}`}
                  assetId={assetId}
                  options={o}
                  report={report}
                  inform={inform}
                  reset={() => setRevision((n) => n + 1)}
                />
                <h3>当前运行主体 · 实时状态</h3>
                <output
                  className="wb-telemetry"
                  aria-label="主体和相机实时状态"
                >
                  {JSON.stringify(telemetry, null, 2)}
                </output>
                <p className="wb-note">
                  请在门框、楼梯、低顶和转角处结合移动观察镜头。渲染回调频率用于诊断，不代表显示器实际呈现
                  FPS。
                </p>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function CameraEditor({
  assetId,
  options: o,
  report,
  inform,
  reset,
}: {
  assetId: string;
  options: WorkbenchOptions;
  report(e: unknown): void;
  inform(s: string): void;
  reset(): void;
}) {
  const current = o.getProfile(assetId),
    mode = SPECS.find((s) => s.id === assetId)?.mode;
  const fields: {
    group: "camera" | "control";
    key: string;
    label: string;
    step: number;
  }[] = [
    {
      group: "camera" as const,
      key: "distance",
      label: "跟随距离 / 米",
      step: 0.25,
    },
    ...(
      [
        "baseFovDegrees",
        "recenterDelaySeconds",
        "followResponsePerSecond",
      ] as const
    ).map((key) => ({
      group: "camera" as const,
      key,
      label: `${training.CAMERA_PARAMETERS[key].label} / ${training.CAMERA_PARAMETERS[key].unit}`,
      step: training.CAMERA_PARAMETERS[key].step,
    })),
    ...training
      .controlFields(mode ?? "character",!!SPECS.find(s=>s.id===assetId)?.wheelPhysics)
      .filter((f) => !f.disabled)
      .map((f) => ({
        group: "control" as const,
        key: f.key,
        label: `${f.label} / ${f.unit}`,
        step: f.step,
      })),
  ].filter((f) => assetId !== "person" || f.key !== "recenterDelaySeconds");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((f) => [
        `${f.group}.${f.key}`,
        String((current[f.group] as unknown as Record<string, number>)[f.key]),
      ]),
    ),
  );
  const read = (draft = values) => {
    const next = o.getProfile(assetId);
    for (const f of fields) {
      const value = draft[`${f.group}.${f.key}`] ?? "";
      (next[f.group] as unknown as Record<string, number>)[f.key] = value.trim()
        ? Number(value)
        : NaN;
    }
    return parseAssetProfile(next, assetId);
  };
  return (
    <>
      <p className="wb-note">
        操控与相机参数按资产独立应用。进入相应载具后使用它的配置；保存到本地后，下次打开继续使用。
      </p>
      {assetId === "person" && (
        <p className="wb-note">
          人物使用已标定的 Playground
          默认配置；下方基准参数与实际速度的换算见字段说明。
        </p>
      )}
      {mode === "space" && (
        <p className="wb-note">
          默认启用平移稳定辅助：松开某个方向会消除该方向的漂移，Shift
          强制制动。辅助设为 0 可测试纯惯性；已输入的方向仍能加速到最高速度。
        </p>
      )}
      {mode === "sub" && (
        <p className="wb-note">
          侧向阻尼控制转向后的横滑。Space 上浮、Ctrl 下潜，Shift 独立制动。
        </p>
      )}
      {(mode === "wheeled" || mode === "bike") && (
        <p className="wb-note">
          转向倍率作用于随速度变化的转弯半径。实际轨迹还受抓地、制动和碰撞影响；松油减速和刹车参数可独立调整。
        </p>
      )}
      <div className="wb-parameter-grid">
        {fields.map((f) => {
          const id = `${f.group}.${f.key}`,
            bounds =
              f.group === "camera"
                ? f.key === "distance"
                  ? training.CAMERA_DISTANCE_EDITOR_RANGE
                  : training.CAMERA_TUNING_RANGES[
                      f.key as training.NumericCameraKey
                    ]
                : training.CONTROL_RANGES[f.key as training.ControlKey];
          return (
            <label key={id} className="wb-field">
              {f.label}
              <Input
                type="number"
                step={f.step}
                min={bounds[0]}
                max={bounds[1]}
                value={values[id]}
                onChange={(e) => {
                  const next = { ...values, [id]: e.target.value };
                  setValues(next);
                  try {
                    o.applyProfile(read(next));
                    inform("已应用到这个资产；保存后可跨刷新保留。");
                  } catch {
                    /* Keep incomplete edits until blur/save. */
                  }
                }}
                onBlur={() => {
                  try {
                    o.applyProfile(read());
                    inform("已应用到这个资产；保存后可跨刷新保留。");
                  } catch (e) {
                    setValues((v) => ({
                      ...v,
                      [id]: String(
                        (
                          o.getProfile(assetId)[f.group] as unknown as Record<
                            string,
                            number
                          >
                        )[f.key],
                      ),
                    }));
                    report(e);
                  }
                }}
              />
            </label>
          );
        })}
      </div>

      <details>
        <summary>碰撞体积与资产标识</summary>
        <pre className="wb-telemetry">
          {JSON.stringify(
            {
              assetId: current.assetId,
              version: current.version,
              envelope: current.envelope,
            },
            null,
            2,
          )}
        </pre>
      </details>
      <ModalFooter>
        <Button
          className="wb-button"
          onClick={() => {
            try {
              const profile = read();
              o.applyProfile(profile);
              o.saveProfile(profile);
              inform("已保存到本机浏览器。");
            } catch (e) {
              report(e);
            }
          }}
        >
          保存这个资产的配置
        </Button>
        <Button
          className="wb-button"
          onClick={() => {
            try {
              o.resetProfile(assetId);
              reset();
              inform("已恢复并清除这个资产的本地覆盖。");
            } catch (e) {
              report(e);
            }
          }}
        >
          恢复资产默认值
        </Button>
        <Button className="wb-button" onClick={o.togglePause}>
          暂停 / 继续
        </Button>
        <Button className="wb-button" onClick={o.step}>
          单步 1/60 秒
        </Button>
      </ModalFooter>
    </>
  );
}
export function mountWorkbench(host: HTMLElement, options: WorkbenchOptions) {
  const container = document.createElement("div");
  host.append(container);
  const root = createRoot(container),
    controller: { current?: Controller } = {};
  flushSync(() =>
    root.render(<Workbench options={options} controller={controller} />),
  );
  let disposed = false;
  return {
    open(tab?: Tab) {
      if (!disposed) flushSync(() => controller.current?.open(tab));
    },
    close() {
      if (!disposed) controller.current?.close();
    },
    isOpen: () => !disposed && (controller.current?.isOpen() ?? false),
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.current?.close();
      root.unmount();
      container.remove();
    },
  };
}
