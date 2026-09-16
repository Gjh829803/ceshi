import { ModalHeader, ModalFooter } from "./components/modal-layout";
import { FramePacingView } from "./fps-panel";
import type { FrameRateReading } from "@worldkit/preset-content/fps";
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
import { Pin, PinOff } from "lucide-react";
import type { AssetEntry } from "@worldkit/preset-content/platform/catalog";
import { MAPS } from "@worldkit/preset-content/environment/maps";
import type { WorldPresentation } from "@worldkit/three";
import { DRAGON_VARIANTS } from '@worldkit/preset-content/dragon-variants';
import { DisplayPanel } from './display-panel';
import { defaultDisplaySettings, type DisplayObjectRow } from './display-settings';

import {createPanelStateStore,type PanelStateStore} from './panel-state';

type Flags =
  | "libraryOpen"
  | "inspectorClosed"
  | "inspectorMobileOpen"
  | "quickOpen"
  | "displayOpen"
  | "mapExpanded"
  | "performanceOpen"
  | "paused"
  | "loading"
  | "contributionOpen"
  | "debugActive";
export function mountShell(host: HTMLElement, panels:PanelStateStore=createPanelStateStore()) {
  const libraryState=panels.read('assetLibrary'),inspectorState=panels.read('inspector'),displayState=panels.read('display');
  let state = {
    texts: {} as Record<string, string>,
    flags: { loading:true,debugActive:inspectorState.open,libraryOpen:libraryState.open,inspectorClosed:!inspectorState.open,inspectorMobileOpen:inspectorState.open,
      displayOpen:displayState.open,performanceOpen:panels.read('performance').open,quickOpen:panels.read('quickAccess').open,mapExpanded:panels.read('minimap').expanded } as Record<Flags, boolean>,
    mapId: "campus",
    dragonId: 'D01',
    collider: "off",
    display: defaultDisplaySettings(),
    displayAvailable: {anchors:false,climbSurfaces:false,water:false,physics:false,unmappedColliders:0},
    displayRows: [] as DisplayObjectRow[],
    displayPinned: displayState.pinned&&displayState.open,
    libraryPinned: libraryState.pinned,
    inspectorPinned: inspectorState.pinned,
    controlsLayout: panels.read('shortcuts').layout,
    displayError: '',
    quick: [] as AssetEntry[],
    activeId: "person",
    controls: [] as [string, string][],
    controlGroups: [] as {title:string;rows:[string,string][]}[],
    system: [] as [string, string][],
    recoverable:false,
    debugRecording: null as null | {enabled:boolean;busy:boolean;saved:boolean},
    drivetrain:null as null|{kind:'engine'|'pedal'|'paddle'|'push'|'motion';cadence:number;rpm:number;maxRpm:number;gear:string;speed:number;throttle:number;shifting:boolean},
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
    const next = { ...patch };
    // Shortcut producers can return fresh arrays with identical contents.
    // Keep the snapshot identity stable, but observe real key/label/order edits.
    for (const key of ['controls', 'system'] as const) {
      const rows = next[key];
      if (!rows) continue;
      const previous = state[key];
      if (rows.length === previous.length && rows.every(([binding, label], n) =>
        binding === previous[n]![0] && label === previous[n]![1])) {
        delete next[key];
      } else {
        // Own the tuples so subsequent in-place caller edits remain observable.
        next[key] = rows.map(([binding, label]) => [binding, label]);
      }
    }
    if(Object.entries(next).every(([key,value])=>Object.is(state[key as keyof typeof state],value)))return;
    Object.assign(state, next);
    if('libraryPinned' in next)panels.update('assetLibrary',{pinned:state.libraryPinned});
    if('inspectorPinned' in next)panels.update('inspector',{pinned:state.inspectorPinned});
    if('displayPinned' in next)panels.update('display',{pinned:state.displayPinned});
    if('controlsLayout' in next)panels.update('shortcuts',{layout:state.controlsLayout});
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
    if(key==='libraryOpen')panels.update('assetLibrary',{open:value});
    else if(key==='inspectorClosed')panels.update('inspector',{open:!value});
    else if(key==='displayOpen')panels.update('display',{open:value});
    else if(key==='performanceOpen')panels.update('performance',{open:value});
    else if(key==='quickOpen')panels.update('quickAccess',{open:value});
    else if(key==='mapExpanded')panels.update('minimap',{expanded:value});
    else if(key==='contributionOpen')panels.update('contribution',{open:value});
    schedule();
  };
  const action = (id: string, value?: string, event?: React.SyntheticEvent) => {
    actions.get(id)?.(value, event);
    flush();
  };
  const subscribe=(fn:()=>void)=>{listeners.add(fn);return ()=>{listeners.delete(fn);};};
  // Speed and frame diagnostics update independently of the menus/dialogs.
  // Building the entire Radix tree on every telemetry sample caused long frames.
  const liveTexts=new Set(['speed','height','heightLabel','stateValue']);
  let layout:typeof state|undefined;
  const layoutSnapshot=()=>{
    const texts=Object.fromEntries(Object.entries(state.texts).filter(([key])=>!liveTexts.has(key)));
    const flags={...state.flags};
    if(!layout||Object.keys(texts).length!==Object.keys(layout.texts).length||Object.keys(texts).some(k=>texts[k]!==layout!.texts[k])
      ||Object.keys(flags).some(k=>flags[k as Flags]!==layout!.flags[k as Flags])
      ||Object.keys(state).some(k=>!['texts','flags','pacing','drivetrain'].includes(k)&&state[k as keyof typeof state]!==layout![k as keyof typeof state]))
      layout={...state,texts,flags,pacing:null,drivetrain:null};
    return layout;
  };
  function LiveText({id,fallback=''}:{id:string;fallback?:string}){
    return useSyncExternalStore(subscribe,()=>state.texts[id]??fallback);
  }
  function Pacing(){const reading=useSyncExternalStore(subscribe,()=>state.pacing);return <FramePacingView reading={reading} panels={panels}/>;}
  function Drivetrain(){
    const d=useSyncExternalStore(subscribe,()=>state.drivetrain);
    if(!d)return null;
    return <section className="powertrain-hud" aria-label={d.kind==='engine'?'发动机与变速箱':d.kind==='motion'?'载具操控':'人力驱动'}><strong>{d.kind==='engine'?d.gear:d.kind==='pedal'?'踩踏':d.kind==='paddle'?'划桨':d.kind==='motion'?'操控':'蹬地'}</strong>{d.kind!=='motion'&&<span>{Math.round(d.kind==='engine'?d.rpm:d.cadence)} {d.kind==='engine'?'RPM':'次/分'}</span>}<span>{d.speed} km/h</span><meter min={0} max={d.kind==='engine'?d.maxRpm:100} value={d.kind==='engine'?d.rpm:d.throttle}/><small>{d.kind==='engine'?`${d.shifting?'换挡中':'自动变速箱'} · 油门`:d.kind==='motion'?'输入':'用力'} {d.throttle}%</small></section>;
  }
  function Shell() {
    const s = useSyncExternalStore(
      subscribe,
      layoutSnapshot,
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
          {s.mapId==='flying-creature-training'&&<label className="subtle-button">选择飞龙
            <ChoiceSelect id="dragonSelect" aria-label="选择飞龙" value={s.dragonId} onValueChange={value=>action('dragonSelect',value)}>
              {DRAGON_VARIANTS.map(variant=><ChoiceOption key={variant.id} value={variant.id}>{variant.name}</ChoiceOption>)}
            </ChoiceSelect>
          </label>}
          {s.recoverable&&btn("recoverButton","原地扶正 · R","subtle-button")}
          <DisplayPanel panels={panels} settings={s.display} available={s.displayAvailable} error={s.displayError}
            rows={s.displayRows} pinned={s.displayPinned} onPinnedChange={value=>action('displayPin',String(value))}
            open={!!f('displayOpen')} onOpenChange={open => { flag('displayOpen', open); action('displayOpen', String(open)); }}
            change={next => action('displayChange', JSON.stringify(next))}/>
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
          {s.debugRecording && (
            <HoverHint side="bottom" content={s.debugRecording.saved
              ? "现场已保存，游戏已暂停。告诉 AI「现场已保存」即可协助定位问题；点击「继续」后会继续记录，也可以按 F8 再次保存。"
              : s.debugRecording.enabled
              ? "正在记录。发现画面、相机或操作异常时，立即点击或按 F8 保存现场并暂停，再告诉 AI「现场已保存」，帮助 AI 定位并修复问题。"
              : "帮助 AI 定位并修复问题：准备复现异常前，点击或按 F8 开启记录；异常出现后，再按一次保存截图、人物与相机状态及最近操作。"}>
              <Button id="debugRecordButton" className="subtle-button debug-record-button" aria-keyshortcuts="F8"
                data-state={s.debugRecording.saved ? "saved" : s.debugRecording.enabled ? "recording" : "idle"}
                aria-label={s.debugRecording.saved ? "已保存现场" : s.debugRecording.enabled ? "保存现场" : "记录现场"}
                aria-busy={s.debugRecording.busy}
                disabled={s.debugRecording.busy}
                onClick={() => action("debugRecordButton")}>
                {s.debugRecording.saved
                  ? <span aria-hidden="true">✓</span>
                  : s.debugRecording.enabled && <span className="recording-dot" aria-hidden="true" />}
                {s.debugRecording.busy ? (s.debugRecording.enabled ? "保存中…" : "开启中…") : s.debugRecording.saved ? "已保存" : s.debugRecording.enabled ? "保存现场" : "记录现场"} <kbd aria-hidden="true">F8</kbd>
              </Button>
            </HoverHint>
          )}
        </div>

        <Drivetrain/>
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
      </>
    );
    return (
      <>
        <main
          className={`workspace controls-${s.controlsLayout} ${f("libraryOpen") ? "library-open" : ""} ${s.libraryPinned ? "library-pinned" : ""} ${s.inspectorPinned||s.displayPinned ? "inspector-pinned" : ""} ${f("inspectorClosed")&&!s.displayPinned ? "inspector-closed" : ""} ${f("inspectorMobileOpen") ? "inspector-mobile-open" : ""}`}
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
            <a
              className="header-link header-creator"
              href="https://world-test-platform.loopit.com.cn/"
              target="_blank"
              rel="noopener noreferrer"
              title="在新标签页打开 Creator界面"
            >
              Creator界面
            </a>
            <div className="header-spacer" />
            <div className="header-live-status" aria-label="相机状态">
              {btn("cameraButton", t("cameraButton", "相机 · 跟随"), "camera-mode-button")}
            </div>
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
                      : id === "debugButton"
                        ? !!f("debugActive")
                        : undefined,
                },
              ),
            )}
            <div className="rail-spacer" />
            {btn("performanceButton", <><Icon name="chart" size={20}/><span className="rail-label">性能</span></>, "rail-button", {
              "aria-expanded":!!f("performanceOpen"),"aria-pressed":!!f("performanceOpen"),"aria-label":"性能",title:"显示 / 收起性能面板",
              onClick:()=>{flag("performanceOpen",!f("performanceOpen"));flush();},
            })}
            {btn("controlsButton", <><Icon name="keyboard" size={20}/><span className="rail-label">快捷键</span></>, "rail-button", {
              "aria-label":s.controlsLayout === "collapsed" ? "展开快捷键" : "收起快捷键",
              "aria-pressed":s.controlsLayout !== "collapsed", title:s.controlsLayout === "collapsed" ? "浮动显示快捷键" : "收起快捷键",
              onClick:()=>update({controlsLayout:s.controlsLayout === "collapsed" ? "floating" : "collapsed"}),
            })}
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
          <aside className={`inspector-shell ${s.displayPinned?'display-inspector-pinned':''}`}>
            <div id="displayInspectorHost" hidden={!s.displayPinned}/>
            <div className="inspector-top">
              <span>主体属性</span>
              {btn(
                "inspectorPin",
                s.inspectorPinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />,
                "asset-library-close panel-pin",
                { "aria-label": s.inspectorPinned ? "取消固定 3C 调试面板" : "固定 3C 调试面板", "aria-pressed":s.inspectorPinned,
                  title:s.inspectorPinned ? "取消固定：浮在场景上，恢复完整画布" : "固定到右侧：为面板预留空间，缩小画布" },
              )}
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
            {btn("exportProfiles", "导出操控与包络配置", "export-profiles")}
          </aside>
          <footer
            id="shortcutFooter"
            className="shortcut-footer"
            aria-label="全部可用快捷键"
          >
            <div className="shortcut-window-actions">
              {btn("controlsPin", s.controlsLayout === "pinned" ? <PinOff size={14} aria-hidden="true"/> : <Pin size={14} aria-hidden="true"/>, "shortcut-window-button", {
                "aria-label":s.controlsLayout === "pinned" ? "取消固定快捷键" : "固定快捷键", "aria-pressed":s.controlsLayout === "pinned",
                title:s.controlsLayout === "pinned" ? "浮动在场景底部，不缩小画布" : "固定到底部，为快捷键预留空间",
                onClick:()=>update({controlsLayout:s.controlsLayout === "pinned" ? "floating" : "pinned"}),
              })}
              {btn("controlsCollapse", <Icon name="chevron" size={14}/>, "shortcut-window-button", {"aria-label":"收起快捷键",title:"收起到左侧「快捷键」入口",onClick:()=>update({controlsLayout:"collapsed"})})}
            </div>
            <div className="shortcut-panel-header">
              <h2><Icon name="keyboard" size={16}/>快捷键 <small>{t("shortcutSubject", "人物操作")}</small></h2>
            </div>
            {s.controlGroups.filter(group=>group.rows.length>0).map(group=>(
              <section className="shortcut-section" key={group.title} aria-label={group.title}>
                <h3>{group.title}</h3><div className="shortcut-list">{keyList(group.rows)}</div>
              </section>
            ))}
            <section className="shortcut-section" aria-label="视角与系统">
              <h3>视角与系统</h3><div className="shortcut-list">{keyList(s.system)}</div>
            </section>
            <p className="sr-only">{t("cameraNote")}</p>
          </footer>
          {f("performanceOpen") && <section id="performancePanel" className="performance-panel workspace-performance-panel" aria-label="性能诊断"
            onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();flag('performanceOpen',false);}}}>
            <div className="performance-window-heading"><span>性能</span>{btn("performanceClose",<Icon name="x" size={14}/>,"plain-icon",{"aria-label":"关闭性能面板",onClick:()=>flag('performanceOpen',false)})}</div>
            <Pacing/>
          </section>}
          <footer className="workspace-statusbar" aria-label="场景状态与操作提示">
            <div className="statusbar-subject"><span className="status-dot"/><span>{t("activeName", "人物动作训练")}</span><span className="statusbar-divider"/><LiveText id="stateValue" fallback="载入中"/></div>
            {s.interaction && <div className="statusbar-interaction" id="interaction"><Hint value={s.interaction}/></div>}
            <span className="statusbar-hint">{t("bottomHint")}</span>
            <span className="statusbar-configuration">{s.configurationDirty ? "配置有未导出修改" : "项目配置已锁定"}</span>
          </footer>
        </main>
        {s.viewport && createPortal(hud, s.viewport)}
        <Toaster closeButton richColors />
        <Dialog open={!!f("loading")}>
          <DialogContent
            className="loading-card"
            overlayClassName="loading-overlay"
            showCloseButton={false}
            onCloseAutoFocus={(event) => { event.preventDefault(); action("viewportFocus"); }}
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
            onCloseAutoFocus={(event) => { event.preventDefault(); action("viewportFocus"); }}
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
