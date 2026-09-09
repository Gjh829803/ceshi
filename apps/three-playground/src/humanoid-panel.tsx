import { ModalHeader, ModalFooter } from "./components/modal-layout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "./components/ui/dialog";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { training } from "@worldkit/three";
import type { CollisionDebugMode } from "../../../examples/three-creator/sdk-capabilities/humanoid/capsule-debug";
import type { CharacterTrial } from "../../../examples/three-creator/sdk-capabilities/environment/types";
import { MAPS } from "../../../examples/three-creator/sdk-capabilities/environment/maps";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Checkbox } from "./components/ui/checkbox";
import { ChoiceSelect, ChoiceOption } from "./components/choice-select";
type HumanoidInput = training.HumanoidInput;
interface Options {
  onOpenChange(open: boolean): void;
  onPrepare(mapId: string, trial: CharacterTrial, demo: boolean): void;
  onAction(command: HumanoidInput | "jump"): void;
  getState(): Record<string, unknown>;
  getKeyBindings(): training.KeyBindings;
  getAutoTraverse(): boolean;
  setAutoTraverse(value: boolean): void;
  getSmoothing(): boolean;
  setSmoothing(value: boolean): void;
  getDebug(): CollisionDebugMode;
  setDebug(value: CollisionDebugMode): void;
}
const choices: [string, HumanoidInput | "jump"][] = [
  ["站立 / 蹲伏", { toggleCrouch: true }],
  ["普通跳跃（原地）", "jump"],
  ["翻滚", { roll: true }],
  ["滑铲", { slide: true }],
  ["匍匐 / 起身", { prone: true }],
  ["进入攀爬", { climb: true }],
  ["松开攀爬面", { releaseClimb: true }],
  ["拾取 / 坐下 / 起身", { interact: true }],
  ["放到台面", { putDown: true }],
  ["切换泳姿", { toggleSwimStyle: true }],
  ["取消离散动作", { cancel: true }],
];
type Controller = { open(): void; close(): void; isOpen(): boolean };
function HumanoidLab({
  options: o,
  controller,
}: {
  options: Options;
  controller: { current?: Controller };
}) {
  const openRef = useRef(false),
    pendingAction = useRef<HumanoidInput | "jump" | undefined>(undefined),
    previousFocus = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [autoTraverse, setAutoTraverse] = useState(o.getAutoTraverse),
    [smoothing, setSmoothing] = useState(o.getSmoothing),
    [debug, setDebug] = useState(o.getDebug);
  const [mapId, setMapId] = useState("character-workshop"),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("");
  const changeOpen = (value: boolean) => {
    if (openRef.current === value) return;
    openRef.current = value;
    setOpen(value);
    o.onOpenChange(value);
  };
  const close = () => {
    pendingAction.current = undefined;
    changeOpen(false);
  };
  useEffect(() => {
    if (open) return;
    const action = pendingAction.current;
    pendingAction.current = undefined;
    // The controlled Dialog has left the DOM and modal input was reset first.
    if (action) o.onAction(action);
  }, [open, o]);
  controller.current = {
    open() {
      if (openRef.current) return;
      pendingAction.current = undefined;
      previousFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setAutoTraverse(o.getAutoTraverse());
      setSmoothing(o.getSmoothing());
      setDebug(o.getDebug());
      setStatus(JSON.stringify(o.getState(), null, 2));
      changeOpen(true);
    },
    close,
    isOpen: () => !!openRef.current,
  };
  useEffect(() => {
    const timer = setInterval(() => {
      if (openRef.current) setStatus(JSON.stringify(o.getState(), null, 2));
    }, 200);
    return () => clearInterval(timer);
  }, [o]);
  const map = MAPS.find((m) => m.id === mapId)!,
    trials = (map.characterTrials ?? []).filter(
      (t) =>
        !query.trim() ||
        `${t.name} ${t.description} ${t.action}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    );
  const bindings = o.getKeyBindings();
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        className="workbench humanoid-lab"
        aria-label="人物动作工坊"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!openRef.current)
            previousFocus.current?.focus({ preventScroll: true });
        }}
      >
        <ModalHeader title="人物动作" />

        <DialogDescription className="sr-only">
          选择测试点，或在当前位置执行动作。
        </DialogDescription>
        <div className="modal-body">
          <p className="wb-note">
            {training
              .controlHints(bindings)
              .map(([key, label]) => `${key}：${label}`)
              .join(" · ")}
          </p>
          <p className="wb-note">
            滑铲需要空手、站立且实际速度达到 2.5
            m/s；低通道不是启动条件。头顶受阻时继续移出再起身。攀爬需要声明并绑定碰撞体的墙面或梯子。游泳需要足够深的水体与真实池底。
          </p>
          <div className="wb-actions">
            {choices.map(([label, command]) => {
              const field: training.ControlAction | undefined =
                command === "jump"
                  ? "jump"
                  : command.toggleCrouch || command.releaseClimb
                    ? "crouch"
                    : command.climb || command.interact
                      ? "interact"
                      : command.roll
                        ? "roll"
                        : command.prone
                          ? "prone"
                          : command.putDown
                            ? "putDown"
                            : command.toggleSwimStyle
                              ? "swimStyle"
                              : undefined;
              const key =
                command !== "jump" && command.slide
                  ? `${training.bindingLabel("sprint", bindings)} + ${training.bindingLabel("crouch", bindings)}`
                  : field
                    ? training.bindingLabel(field, bindings)
                    : undefined;
              return (
                <Button
                  key={label}
                  className="wb-button"
                  onClick={() => {
                    pendingAction.current = command;
                    changeOpen(false);
                  }}
                >
                  {key ? `${key} · ${label}` : label}
                </Button>
              );
            })}
          </div>
          <div className="wb-parameter-grid">
            <label className="wb-field wb-check-field">
              自动翻越 / 攀上（调试，默认关闭）
              <Checkbox
                checked={autoTraverse}
                onCheckedChange={(value) => {
                  const enabled = value === true;
                  o.setAutoTraverse(enabled);
                  setAutoTraverse(enabled);
                }}
              />
            </label>
            <label className="wb-field wb-check-field">
              原人物动画平滑混合
              <Checkbox
                checked={smoothing}
                onCheckedChange={(value) => {
                  const enabled = value === true;
                  o.setSmoothing(enabled);
                  setSmoothing(enabled);
                }}
              />
            </label>
            <label className="wb-field">
              碰撞体显示
              <ChoiceSelect
                aria-label="碰撞体显示"
                value={debug}
                onValueChange={(value) => {
                  const mode = value as CollisionDebugMode;
                  o.setDebug(mode);
                  setDebug(mode);
                }}
              >
                {(
                  [
                    ["person", "人"],
                    ["all", "全部"],
                    ["off", "关闭"],
                  ] as const
                ).map(([value, label]) => (
                  <ChoiceOption key={value} value={value}>
                    {label}
                  </ChoiceOption>
                ))}
              </ChoiceSelect>
            </label>
          </div>
          <div className="wb-parameter-grid">
            <ChoiceSelect
              aria-label="人物测试地图"
              value={mapId}
              onValueChange={(value) => setMapId(value)}
            >
              {MAPS.filter((m) => m.characterTrials?.length).map((m) => (
                <ChoiceOption key={m.id} value={m.id}>
                  {m.name}
                </ChoiceOption>
              ))}
            </ChoiceSelect>
            <Input
              type="search"
              placeholder="搜索动作、场景或测试点"
              aria-label="搜索人物测试点"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="wb-scene-grid">
            {trials.map((trial) => (
              <section className="wb-scene" key={trial.id}>
                <h3>{trial.name}</h3>
                <p className="wb-note">{trial.description}</p>
                <div className="wb-scene-actions">
                {(
                  [
                    ["前往测试点", false],
                    ["前往并演示", true],
                  ] as const
                ).map(([label, demo]) => (
                  <Button
                    key={label}
                    className="wb-button"
                    onClick={() => {
                      try {
                        o.onPrepare(map.id, trial, demo);
                        close();
                      } catch (e) {
                        toast.error(String(e));
                      }
                    }}
                  >
                    {label}
                  </Button>
                ))}
                </div>
              </section>
            ))}
            {!trials.length && <p className="wb-note">没有匹配的测试点。</p>}
          </div>
          <h3>当前人物状态</h3>
          <output className="wb-telemetry" aria-label="人物动作实时状态">
            {status}
          </output>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function mountHumanoidLab(host: HTMLElement, options: Options) {
  const container = document.createElement("div");
  host.append(container);
  const root = createRoot(container),
    controller: { current?: Controller } = {};
  flushSync(() =>
    root.render(<HumanoidLab options={options} controller={controller} />),
  );
  let disposed = false;
  return {
    open() {
      if (!disposed) flushSync(() => controller.current?.open());
    },
    close() {
      if (!disposed) controller.current?.close();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.current?.close();
      root.unmount();
      container.remove();
    },
  };
}
