import { ModalHeader, ModalFooter } from "./components/modal-layout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "./components/ui/dialog";
import { toast } from "sonner";
import { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type {
  HumanoidCharacter,
  CharacterAttachmentPoint,
} from "@worldkit/three";
import {
  ACCESSORY_CHOICES,
  type createAccessoryPreview,
} from "@worldkit/preset-content/humanoid/accessories";
import "./styles/equipment-panel.css";
import { Button } from "./components/ui/button";
import { Checkbox } from "./components/ui/checkbox";
import { createEquipmentPreview, type PreviewPin } from "./equipment-preview";
import { Backpack, Footprints, Hand, HardHat, X } from "lucide-react";
const DETAILS = {
  head: { name: "头部", hint: "帽子、头盔等头部装饰", Icon: HardHat },
  back: { name: "背部", hint: "背包、披风等背部装饰", Icon: Backpack },
  handLeft: { name: "左手", hint: "随左手运动的视觉道具", Icon: Hand },
  handRight: { name: "右手", hint: "随右手运动的视觉道具", Icon: Hand },
  footLeft: { name: "左脚", hint: "随左脚运动的鞋靴或护具", Icon: Footprints },
  footRight: { name: "右脚", hint: "随右脚运动的鞋靴或护具", Icon: Footprints },
} as const;
type Accessories = ReturnType<typeof createAccessoryPreview>;
type Controller = {
  open(): void;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
};
function EquipmentPanel({
  character,
  accessories,
  onOpenChange,
  controller,
}: {
  character: HumanoidCharacter;
  accessories: Accessories;
  onOpenChange(open: boolean): void;
  controller: { current?: Controller };
}) {
  const openRef = useRef(false),
    attempted = useRef(false),
    stage = useRef<HTMLElement>(null),
    preview = useRef<ReturnType<typeof createEquipmentPreview> | undefined>(
      undefined,
    );
  const previousFocus = useRef<HTMLElement | null>(null),
    disposed = useRef(false),
    slots = useRef(new Map<CharacterAttachmentPoint, HTMLButtonElement>());
  const [open, setOpen] = useState(false);
  const [openRevision, setOpenRevision] = useState(0);
  const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null);
  const [selected, setSelected] = useState<CharacterAttachmentPoint>("head"),
    [showPins, setShowPins] = useState(true),
    [pins, setPins] = useState<PreviewPin[]>([]),
    [ready, setReady] = useState(false),
    [canvasVersion, setCanvasVersion] = useState(0),
    [, setRevision] = useState(0);
  const changeOpen = (value: boolean) => {
    if (disposed.current || openRef.current === value) return;
    openRef.current = value;
    setOpen(value);
    onOpenChange(value);
  };
  useLayoutEffect(() => {
    if (!open || !canvasNode || !stage.current) return;
    const value = createEquipmentPreview(
      canvasNode,
      stage.current,
      character,
      () => openRef.current,
      setPins,
    );
    preview.current = value;
    if (!attempted.current) {
      attempted.current = true;
      try {
        value.initialize();
        setReady(true);
        setRevision((n) => n + 1);
        value.refreshModel();
        value.resetCamera();
      } catch (error) {
        // React discards a constructor-failed canvas and its retained GL listeners.
        value.clearModel();
        setReady(false);
        setPins([]);
        setCanvasVersion((n) => n + 1);
        toast.error("人物预览暂时无法显示，请关闭后重试。", {
          id: "equipment-feedback",
        });
        console.error("EQUIPMENT_PREVIEW_OPEN_FAILED", error);
      }
    }
    return () => {
      value.dispose();
      if (preview.current === value) preview.current = undefined;
    };
  }, [character, canvasNode, open, openRevision]);
  controller.current = {
    open() {
      if (disposed.current || openRef.current) return;
      previousFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      attempted.current = false;
      setOpenRevision((n) => n + 1);
      setReady(false);
      setPins([]);
      changeOpen(true);
    },
    close: () => changeOpen(false),
    isOpen: () => openRef.current,
    dispose() {
      if (disposed.current) return;
      changeOpen(false);
      disposed.current = true;
      preview.current?.dispose();
    },
  };
  const select = (point: CharacterAttachmentPoint) => {
    setSelected(point);
    slots.current.get(point)?.scrollIntoView({ block: "nearest" });
  };
  const choice = ACCESSORY_CHOICES.find((item) => item.point === selected)!,
    detail = DETAILS[selected],
    Icon = detail.Icon;
  const update = (all = false) => {
    try {
      if (all)
        for (const { point } of ACCESSORY_CHOICES)
          accessories.set(point, false);
      else accessories.set(selected, !accessories.enabled(selected));
      setRevision((n) => n + 1);
      preview.current?.refreshModel();
      toast.success(
        all
          ? "已卸下全部装备"
          : accessories.enabled(selected)
            ? "已穿戴到场景人物"
            : "已卸下",
      );
    } catch (error) {
      toast.error("装备预览更新失败，请关闭后重试。", {
        id: "equipment-feedback",
      });
      console.error("EQUIPMENT_PREVIEW_UPDATE_FAILED", error);
    }
  };
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        className="equipment-panel"
        aria-label="人物装备"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!openRef.current)
            previousFocus.current?.focus({ preventScroll: true });
        }}
      >
        <ModalHeader title="人物装备" closeLabel="关闭人物装备" />
        <DialogDescription className="sr-only">
          选择部位，预览并穿戴装备。
        </DialogDescription>
        <div className="equipment-body">
          <aside className="equipment-slots">
            <h3>挂载部位</h3>
            {ACCESSORY_CHOICES.map(({ point, label }) => {
              const SlotIcon = DETAILS[point].Icon;
              return (
                <Button
                  key={point}
                  ref={(node) => {
                    if (node) slots.current.set(point, node);
                    else slots.current.delete(point);
                  }}
                  className="equipment-slot"
                  aria-pressed={selected === point}
                  onClick={() => select(point)}
                >
                  <SlotIcon size={24} />
                  <span>
                    <strong>{DETAILS[point].name}</strong>
                    <small>
                      {accessories.enabled(point) ? label : "未装备"}
                    </small>
                  </span>
                </Button>
              );
            })}
          </aside>
          <section
            ref={stage}
            className="equipment-stage"
            aria-label="人物模型预览"
          >
            <canvas
              key={canvasVersion}
              ref={setCanvasNode}
              aria-label="可旋转缩放的人物装备模型"
              tabIndex={0}
              aria-describedby="equipment-orbit-hint"
            />
            <span className="equipment-count">
              已装备{" "}
              {
                ACCESSORY_CHOICES.filter((item) =>
                  accessories.enabled(item.point),
                ).length
              }{" "}
              / {ACCESSORY_CHOICES.length}
            </span>
            <p className="equipment-orbit-hint" id="equipment-orbit-hint">
              拖动 / Shift＋方向键旋转 · 滚轮缩放
            </p>
            {ACCESSORY_CHOICES.map(({ point }) => {
              const pin = pins.find((p) => p.point === point);
              return (
                <Button
                  key={point}
                  className="equipment-pin"
                  hidden={!showPins || !pin || pin.hidden}
                  style={{ left: pin?.left ?? 0, top: pin?.top ?? 0 }}
                  aria-label={`选择${DETAILS[point].name}挂点`}
                  data-selected={selected === point}
                  onClick={() => select(point)}
                >
                  {DETAILS[point].name}
                </Button>
              );
            })}
          </section>
          <aside className="equipment-detail">
            <span className="equipment-eyebrow">当前部位</span>
            <h3>{detail.name}</h3>
            <p className="equipment-muted">{detail.hint}</p>
            <div className="equipment-item">
              <div className="equipment-item-icon">
                <Icon size={42} />
              </div>
              <strong>{choice.label}</strong>
              <span className="equipment-muted">视觉附件</span>
            </div>
            <Button
              className="equipment-primary"
              data-equipped={accessories.enabled(selected)}
              disabled={
                !ready || !character.attachmentPoints.includes(selected)
              }
              onClick={() => update()}
            >
              {accessories.enabled(selected) ? "卸下装备" : "穿戴装备"}
            </Button>

            <p className="equipment-footnote">
              手持物不改变拾取状态；披风为固定样件。
            </p>
          </aside>
        </div>
        <ModalFooter className="equipment-footer">
          <label>
            <Checkbox
              checked={showPins}
              onCheckedChange={(value) => setShowPins(value === true)}
            />
            显示挂点
          </label>
          <Button
            className="equipment-secondary"
            onClick={() => preview.current?.resetCamera()}
          >
            重置视角
          </Button>

          <Button className="equipment-secondary" onClick={() => update(true)}>
            卸下全部
          </Button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
export function mountEquipmentPanel(
  host: HTMLElement,
  character: HumanoidCharacter,
  accessories: Accessories,
  onOpenChange: (open: boolean) => void,
) {
  const container = document.createElement("div");
  host.append(container);
  const root = createRoot(container),
    controller: { current?: Controller } = {};
  let disposed = false;
  flushSync(() =>
    root.render(
      <EquipmentPanel
        character={character}
        accessories={accessories}
        onOpenChange={onOpenChange}
        controller={controller}
      />,
    ),
  );
  return {
    open() {
      if (!disposed) flushSync(() => controller.current?.open());
    },
    close() {
      if (!disposed) controller.current?.close();
    },
    isOpen: () => !disposed && (controller.current?.isOpen() ?? false),
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.current?.dispose();
      root.unmount();
      container.remove();
    },
  };
}
