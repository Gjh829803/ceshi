import { ModalHeader, ModalFooter } from "./components/modal-layout";
import { FramePacingView } from "./fps-panel";
import type { FrameRateReading } from "../../../shared/preset-content/fps";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "./components/ui/popover";
import { Hint as HoverHint } from "./components/hint";
import { Toaster } from "./components/ui/sonner";
import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createPortal, flushSync } from "react-dom";
import { Button } from "./components/ui/button";
import { ChoiceSelect, ChoiceOption } from "./components/choice-select";
import { Icon } from "./components/icon";
import type { AssetEntry } from "../../../shared/preset-content/platform/catalog";
import { MAPS } from "../../../shared/preset-content/environment/maps";
import type { WorldPresentation } from "@worldkit/three";

type Flags =
  | "libraryOpen"
  | "inspectorClosed"
  | "inspectorMobileOpen"
  | "quickOpen"
  | "mapExpanded"
  | "performanceOpen"
  | "paused"
  | "loading"
  | "contributionOpen"
  | "interactionSmall"
  | "fpsSlow"
  | "debugActive";
export function mountShell(host: HTMLElement) {
  let state = {
    texts: {} as Record<string, string>,
    flags: { loading: true, debugActive: true } as Record<Flags, boolean>,
    mapId: "campus",
    collider: "off",
    quick: [] as AssetEntry[],
    activeId: "person",
    controls: [] as [string, string][],
    system: [] as [string, string][],
    recoverable:false,
    drivetrain:null as null|{kind:'engine'|'pedal'|'paddle'|'push';cadence:number;rpm:number;maxRpm:number;gear:string;speed:number;throttle:number;shifting:boolean},
    interaction: "",
    pacing: null as FrameRateReading | null,
    configurationDirty: false,
    viewport: null as HTMLElement | null,
  };
  const listeners = new Set<() => void>(),
    actions = new Map<
      string,
      (value?: string, event?: React.SyntheticEvent) => void
    >();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const notify = () => {
    timer = undefined;
    state = { ...state };
    for (const fn of listeners) fn();
  };
  const schedule = () => {
    if (!timer) timer = setTimeout(notify, 100);
  };
  const update = (patch: Partial<typeof state>) => {
    Object.assign(state, patch);
    schedule();
  };
  const flush = () => {
    if (timer) clearTimeout(timer);
    flushSync(notify);
  };
  const text = (id: string, value: string) => {
    if (state.texts[id] === value) return;
    state.texts = { ...state.texts, [id]: value };
    schedule();
  };
  const flag = (key: Flags, value: boolean) => {
    if (state.flags[key] === value) return;
    state.flags = { ...state.flags, [key]: value };
    schedule();
  };
  const action = (id: string, value?: string, event?: React.SyntheticEvent) => {
    actions.get(id)?.(value, event);
    flush();
  };
  function Shell() {
    const s = useSyncExternalStore(
      (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      () => state,
    );
    const t = (id: string, fallback = "") => s.texts[id] ?? fallback,
      f = (id: Flags) => s.flags[id];
    const btn = (
      id: string,
      label: React.ReactNode,
      className: string,
      extra: React.ComponentProps<typeof Button> = {},
    ) => {
      const { key, title, ...props } = extra;
      const button = (
        <Button
          key={id}
          id={id}
          className={className}
          onClick={(e) => action(id, undefined, e)}
          {...props}
        >
          {label}
        </Button>
      );
      return title ? (
        <HoverHint key={key ?? id} content={title} side={className === "rail-button" ? "right" : "top"}>
          {button}
        </HoverHint>
      ) : (
        React.cloneElement(button, { key: key ?? id })
      );
    };
    const keyList = (pairs: [string, string][]) =>
      pairs.map(([keys, label]) => (
        <div className="shortcut" key={keys + label}>
          <span className="keys">
            {keys.split(" / ").map((key) => (
              <kbd key={key}>{key}</kbd>
            ))}
          </span>
          <span>{label}</span>
        </div>
      ));
    const hud = (
      <>
        <div className="stage-bar">
          <span className="status-dot" />
          <span>{t("activeName", "人物动作训练")}</span>
          <span className="stage-divider" />
          <span>{t("stateValue", "载入中")}</span>
        </div>
        <section
          className={`minimap ${f("mapExpanded") ? "expanded" : ""}`}
          id="minimap"
          aria-label="训练场小地图"
        >
          <div className="map-head">
            <span>
              <Icon name="map" size={15} /> 场地导航
            </span>
            <span>N ↑</span>
            {btn(
              "mapExpandButton",
              <Icon name="expand" size={16} />,
              "plain-icon",
              {
                "aria-label": f("mapExpanded") ? "缩小小地图" : "展开小地图",
                "aria-expanded": !!f("mapExpanded"),
              },
            )}
          </div>
          <canvas
            id="map"
            width="376"
            height="364"
            aria-label="场地区域和载具位置地图"
          />
          <div className="map-footer">
            <span className="status-dot" />
            <span>{t("zone", "载具整备区")}</span>
          </div>
        </section>
        <div className="stage-actions">
          {s.recoverable&&btn("recoverButton","原地扶正 · R","subtle-button")}
          <label
            className={`subtle-button collider-toggle ${s.collider !== "off" ? "active" : ""}`}
          >
            碰撞体
            <ChoiceSelect
              id="colliderSelect"
              aria-label="碰撞体显示"
              value={s.collider}
              onValueChange={(value) => action("colliderSelect", value)}
            >
              <ChoiceOption value="person">人</ChoiceOption>
              <ChoiceOption value="all">全部</ChoiceOption>
              <ChoiceOption value="off">关闭</ChoiceOption>
            </ChoiceSelect>
          </label>
          <Popover
            open={!!f("quickOpen")}
            onOpenChange={(open) => {
              flag("quickOpen", open);
              flush();
            }}
          >
            <PopoverTrigger asChild>
              {btn(
                "quickButton",
                <>
                  <Icon name="assets" size={16} />
                  快速前往
                  <Icon name="chevron" size={12} />
                </>,
                "subtle-button",
                { "aria-expanded": !!f("quickOpen") },
              )}
            </PopoverTrigger>{" "}
            <PopoverContent
              className="quick-panel"
              id="quickPanel"
              align="end"
              sideOffset={8}
              onEscapeKeyDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
            >
              <h3>收藏与最近使用</h3>
              <nav id="quickSlots" aria-label="载具快捷槽">
                {s.quick.map((asset, n) => (
                  <Button
                    key={asset.id}
                    className={`vehicle-button ${asset.id === s.activeId ? "selected" : ""}`}
                    data-vehicle-id={asset.id}
                    style={
                      {
                        "--vehicle-color": asset.color,
                      } as React.CSSProperties
                    }
                    onClick={() => action("quickSelect", asset.id)}
                  >
                    <span className="vehicle-number">
                      {String(n + 1).padStart(2, "0")}
                    </span>
                    <span className="vehicle-name">{asset.name}</span>
                  </Button>
                ))}
              </nav>
              <p>数字 1–6 前往 · 完整列表见资产库</p>
            </PopoverContent>
          </Popover>
          {btn(
            "resetButton",
            <>
              <Icon name="reset" size={17} />
              复位
            </>,
            "subtle-button",
            { title: "返回当前场景起点" },
          )}
          {btn("pauseButton", t("pauseButton", "暂停"), "subtle-button")}
        </div>

        <div
          className={`interaction ${f("interactionSmall") ? "small" : ""}`}
          id="interaction"
        >
          <Hint value={s.interaction} />
        </div>
        {s.drivetrain&&<section className="powertrain-hud" aria-label={s.drivetrain.kind==='engine'?'发动机与变速箱':'人力驱动'}><strong>{s.drivetrain.kind==='engine'?s.drivetrain.gear:s.drivetrain.kind==='pedal'?'踩踏':s.drivetrain.kind==='paddle'?'划桨':'蹬地'}</strong><span>{Math.round(s.drivetrain.kind==='engine'?s.drivetrain.rpm:s.drivetrain.cadence)} {s.drivetrain.kind==='engine'?'RPM':'次/分'}</span><span>{s.drivetrain.speed} km/h</span><meter min={0} max={s.drivetrain.kind==='engine'?s.drivetrain.maxRpm:100} value={s.drivetrain.kind==='engine'?s.drivetrain.rpm:s.drivetrain.throttle}/><small>{s.drivetrain.kind==='engine'?`${s.drivetrain.shifting?'换挡中':'自动变速箱'} · 油门`:'用力'} {s.drivetrain.throttle}%</small></section>}
        <div className="bottom-hint">{t("bottomHint")}</div>
        {["left", "right"].map((side) => (
          <div key={side} className={`touch ${side}`}>
            {(side === "left"
              ? ["KeyA", "KeyW", "KeyS", "KeyD"]
              : ["ShiftLeft", "ControlLeft", "Space"]
            ).map((code) => (
              <Button
                key={code}
                data-key={code}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  action("touchDown", code, e);
                }}
                onPointerUp={(e) => action("touchUp", code, e)}
                onPointerCancel={(e) => action("touchUp", code, e)}
                onLostPointerCapture={(e) => action("touchUp", code, e)}
              >
                {code
                  .replace("Key", "")
                  .replace("Left", "")
                  .replace("Control", "Ctrl")}
              </Button>
            ))}
            {side === "right" && btn("touchInteract", "F", "")}
          </div>
        ))}
        <span className="configuration-status">
          {s.configurationDirty ? "配置有未导出修改" : "项目配置已锁定"}
        </span>
      </>
    );
    return (
      <>
        <main
          className={`workspace ${f("libraryOpen") ? "library-open" : ""} ${f("inspectorClosed") ? "inspector-closed" : ""} ${f("inspectorMobileOpen") ? "inspector-mobile-open" : ""}`}
          id="workspace"
        >
          <header className="workspace-header">
            <div className="brand">
              <span className="brand-emblem">V</span>
              <strong>VECTOR</strong>
            </div>
            <div className="scene-switch">
              <Icon name="box" />
              <label className="sr-only" htmlFor="mapSelect">
                当前训练地图
              </label>
              <ChoiceSelect
                id="mapSelect"
                value={s.mapId}
                onValueChange={(value) => action("mapSelect", value)}
              >
                {MAPS.map((map) => (
                  <ChoiceOption key={map.id} value={map.id}>
                    {map.name}
                  </ChoiceOption>
                ))}
              </ChoiceSelect>
            </div>
            {btn(
              "sceneTopButton",
              <>
                <Icon name="flag" />
                <span>{t("mapBadge", "综合园区")}</span>
                <Icon name="chevron" size={14} />
              </>,
              "header-route",
              { title: "选择测试区域" },
            )}
            <div className="header-spacer" />
            {btn(
              "contributeButton",
              <>
                <Icon name="book" />
                <span>资产规范</span>
              </>,
              "header-link",
            )}
            <span className="local-status">
              <span className="status-dot" />
              本地工作区
            </span>
          </header>
          <nav className="workspace-rail" aria-label="训练工作区">
            {[
              ["exploreButton", "explore", "探索"],
              ["libraryButton", "assets", "资产库"],
              ["humanButton", "character", "人物动作"],
              ["equipmentButton", "t-shirt", "人物装备"],
              ["scenesButton", "scenes", "测试场景"],
              ["debugButton", "camera", "3C 调试"],
            ].map(([id, icon, label]) =>
              btn(
                id!,
                <><Icon name={icon!} size={20} /><span className="rail-label">{label}</span></>,
                "rail-button",
                {
                  key: id,
                  title: label,
                  "aria-label": label,
                  "aria-pressed":
                    id === "libraryButton"
                      ? !!f("libraryOpen")
                      : id === "exploreButton"
                        ? !f("libraryOpen")
                        : id === "debugButton"
                          ? !!f("debugActive")
                          : undefined,
                },
              ),
            )}
            <div className="rail-spacer" />
            <Popover
              open={!!f("performanceOpen")}
              onOpenChange={(open) => {
                flag("performanceOpen", open);
                flush();
              }}
            >
              <HoverHint content="性能" side="right"><PopoverTrigger asChild>
                {btn(
                  "performanceButton",
                  <><Icon name="chart" size={20} /><span className="rail-label">性能</span></>,
                  "rail-button",
                  { "aria-expanded": !!f("performanceOpen"), "aria-label": "性能" },
                )}
              </PopoverTrigger></HoverHint>
              <PopoverContent
                id="performancePanel"
                className="performance-panel"
                aria-label="性能诊断"
                side="right"
                align="end"
                sideOffset={12}
                onEscapeKeyDown={(e) => e.stopPropagation()}
              >
                <FramePacingView reading={s.pacing} />
              </PopoverContent>
            </Popover>
          </nav>
          <section
            id="stage"
            className="workspace-stage"
            aria-label="实时训练视口"
          >
            <canvas
              id="viewport"
              aria-label="载具训练场，可使用键盘与鼠标自由探索"
              tabIndex={0}
            />
          </section>
          <div id="libraryHost" className="library-host" />
          <aside className="inspector-shell">
            <div className="inspector-top">
              <span>主体属性</span>
              {btn(
                "inspectorClose",
                <Icon name="x" size={16} />,
                "asset-library-close",
                { "aria-label": "收起属性面板" },
              )}
            </div>
            <div id="inspectorHost" />
            {btn(
              "advancedButton",
              <>
                操控参数与配置文件
                <Icon name="arrow-up-right" size={15} />
              </>,
              "advanced-button",
            )}
            {btn("exportProfiles", "导出全部配置", "export-profiles")}
          </aside>
          <footer
            id="shortcutFooter"
            className="shortcut-footer"
            aria-label="全部可用快捷键"
          >
            <div className="shortcut-main">
              <span className="shortcut-heading">
                <Icon name="keyboard" size={18} />
                <span>{t("shortcutSubject", "人物操作")}</span>
              </span>
              <div className="shortcut-list">{keyList(s.controls)}</div>
            </div>
            <div className="shortcut-system">
              <div className="system-keys">{keyList(s.system)}</div>
              {btn(
                "cameraButton",
                t("cameraButton", "相机 · 跟随"),
                "camera-mode-button",
              )}
              <output
                id="fpsReadout"
                aria-label="渲染回调频率"
                aria-live="off"
                data-slow={f("fpsSlow") || undefined}
              >
                {t("fpsReadout", "渲染回调 —/s")}
              </output>
            </div>
            <p className="sr-only">{t("cameraNote")}</p>
          </footer>
        </main>
        {s.viewport && createPortal(hud, s.viewport)}
        <Toaster closeButton richColors />
        <Dialog open={!!f("loading")}>
          <DialogContent
            className="loading-card"
            showCloseButton={false}
            onEscapeKeyDown={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <DialogTitle>VECTOR</DialogTitle>
            <div className="loader" />
            <DialogDescription>
              {t("loadText", "正在准备场景、人物动作与载具…")}
            </DialogDescription>
          </DialogContent>
        </Dialog>
        <Dialog
          open={!!f("paused")}
          onOpenChange={(open) => {
            if (!open) action("resumeButton");
          }}
        >
          <DialogContent
            className="pause-card"
            showCloseButton={false}
            onEscapeKeyDown={(e) => e.stopPropagation()}
          >
            <ModalHeader title="训练已暂停" />
            <div className="modal-body">
              <DialogDescription>
                从资产库选择主体，前往场景开始测试。底部显示当前主体操作，可在右侧调整相机。
              </DialogDescription>
            </div>
            <ModalFooter>
              {btn("resumeButton", "继续训练", "primary")}
            </ModalFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={!!f("contributionOpen")}
          onOpenChange={(open) => {
            if (!open) action("contributionClose");
          }}
        >
          <DialogContent
            className="contribution-dialog"
            id="contributionDialog"
            showCloseButton={false}
            onEscapeKeyDown={(e) => e.stopPropagation()}
          >
            <ModalHeader title="资产规范" closeLabel="关闭资产规范" />
            <div className="modal-body">
              <DialogDescription>
                当前为本地测试工作区。团队通过 Git
                提交资产与配置；在线成员、实时同步和权限管理属于后续建设范围。
              </DialogDescription>
              <ol>
                {[
                  [
                    "登记资产",
                    "稳定 ID、版本、贡献者、来源与授权、运动类型和检索标签。",
                  ],
                  [
                    "接入 3C",
                    "模型与动作引用、操控策略、驾驶位、碰撞和独立相机配置。",
                  ],
                  [
                    "提交测试",
                    "选定地图与测试点，记录适用范围和已知限制，再提交审核。",
                  ],
                ].map(([a, b]) => (
                  <li key={a}>
                    <strong>{a}</strong>
                    <span>{b}</span>
                  </li>
                ))}
              </ol>
              <p>
                资产目录由注册数据生成，新增条目无需增加工具栏按钮。示例模板用于协作登记，当前页面尚不支持直接导入任意模型包。
              </p>
            </div>
            <ModalFooter>
              {btn("downloadManifest", "下载资产登记模板", "primary")}
            </ModalFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  const root = createRoot(host);
  flushSync(() => root.render(<Shell />));
  return {
    text,
    flag,
    update,
    flush,
    get: () => state,
    on: (
      id: string,
      fn: (value?: string, event?: React.SyntheticEvent) => void,
    ) => actions.set(id, fn),
    attachViewport(presentation: WorldPresentation) {
      const viewport = document.createElement("div");
      viewport.className = "react-viewport-ui";
      presentation.ui.mount(viewport);
      update({ viewport });
      flush();
    },
    dispose() {
      if (timer) clearTimeout(timer);
      root.unmount();
      listeners.clear();
      actions.clear();
    },
  };
}
// SDK hints contain only keycaps; interpret those explicitly rather than injecting HTML.
function Hint({ value }: { value: string }) {
  return (
    <>
      {value
        .split(/(<kbd>.*?<\/kbd>)/g)
        .map((part, i) =>
          part.startsWith("<kbd>") ? (
            <kbd key={i}>{part.slice(5, -6)}</kbd>
          ) : (
            part
          ),
        )}
    </>
  );
}
