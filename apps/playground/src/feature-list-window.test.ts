import { describe, expect, it, vi } from "vitest";
import { FEATURE_LIST_OVERSCAN_ROWS, FEATURE_ROW_HEIGHT_PIXELS, featureListWindow, installFeatureListWindow } from "./feature-list-window.js";
import type { FeatureInspection } from "./playground-world.js";

// Native EventTarget with only the DOM surface used by the view owner. No layout,
// Browser, Babylon or global document is started by this focused contract test.
class ElementDouble extends EventTarget {
  children: ElementDouble[] = [];
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  attributes = new Map<string, string>();
  className = "";
  textContent = "";
  id = "";
  tabIndex = -1;
  type = "";
  scrollTop = 0;
  clientHeight = 424;
  constructor(readonly ownerDocument: DocumentDouble, readonly tagName: string) { super(); }
  append(...children: ElementDouble[]) { this.children.push(...children); }
  replaceChildren(...children: ElementDouble[]) { this.children = children; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  focus() { this.ownerDocument.activeElement = this; }
}
class DocumentDouble {
  activeElement: ElementDouble | null = null;
  resize: (() => void) | undefined;
  disconnect = vi.fn();
  defaultView;
  constructor() {
    const document = this;
    this.defaultView = { ResizeObserver: class {
      constructor(callback: () => void) { document.resize = callback; }
      observe() {}
      disconnect() { document.disconnect(); }
    } };
  }
  createElement(tagName: string) { return new ElementDouble(this, tagName); }
}
const features = (count: number): FeatureInspection[] => Array.from({ length: count }, (_, index) => ({
  id: `feature-${index}`, type: "mesh", version: 1, status: "ready", resources: [], parameters: {}, diagnostics: [],
}));
function setup(count: number) {
  const document = new DocumentDouble();
  const root = document.createElement("div");
  root.id = "feature-list";
  const data = features(count);
  const selected: string[] = [];
  const view = installFeatureListWindow({ root: root as unknown as HTMLDivElement, onSelect(id) {
    selected.push(id);
    view.update(data, id);
  } });
  view.update(data, data[0]?.id ?? null);
  const rows = () => root.children.flatMap((child) => child.children).filter((child) => child.dataset.featureId !== undefined);
  const scroll = (top: number) => { root.scrollTop = top; root.dispatchEvent(new Event("scroll")); };
  const key = (key: string) => {
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperty(event, "key", { value: key });
    root.dispatchEvent(event);
    return event;
  };
  return { document, root, data, selected, view, rows, scroll, key };
}

describe("bounded Feature inspector window", () => {
  it.each([5738, 10000])("bounds %i rows including fractional/negative/last scroll edges", (count) => {
    for (const top of [-100, 0, 53.5, count * 53 - 500, count * 53 + 100]) {
      const range = featureListWindow(count, top, 424);
      expect(range.start).toBeGreaterThanOrEqual(0);
      expect(range.end).toBeLessThanOrEqual(count);
      expect(range.end - range.start).toBeLessThanOrEqual(9 + FEATURE_LIST_OVERSCAN_ROWS * 2);
      expect(range.totalHeightPixels).toBe(count * FEATURE_ROW_HEIGHT_PIXELS);
    }
    expect(featureListWindow(count, count * 53, 424).end).toBe(count);
    expect(featureListWindow(0, 100, 0)).toMatchObject({ start: 0, end: 0, scrollTopPixels: 0 });
  });

  it.each([5738, 10000])("keeps bounded DOM and complete ARIA positions across %i rows", (count) => {
    const value = setup(count);
    expect(value.rows().length).toBeGreaterThan(0);
    expect(value.rows().length).toBeLessThanOrEqual(17);
    expect(value.rows()[0]!.getAttribute("aria-posinset")).toBe("1");
    expect(value.rows()[0]!.getAttribute("aria-setsize")).toBe(String(count));
    expect(value.rows()[0]!.getAttribute("aria-selected")).toBe("true");
    expect(value.root.getAttribute("role")).toBe("listbox");
    value.scroll(count * 53);
    expect(value.rows().at(-1)!.dataset.featureId).toBe(`feature-${count - 1}`);
    expect(value.rows().at(-1)!.getAttribute("aria-posinset")).toBe(String(count));
    expect(value.rows().length).toBeLessThanOrEqual(17);
    expect(value.root.getAttribute("aria-activedescendant")).toBeNull();
    value.scroll(0);
    expect(value.rows()[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it("selects by original identity, keeps focus, and reaches both ends by keyboard", () => {
    const value = setup(10000);
    value.rows()[2]!.dispatchEvent(new Event("click"));
    expect(value.selected).toEqual(["feature-2"]);
    expect(value.document.activeElement).toBe(value.root);
    expect(value.key("End").defaultPrevented).toBe(true);
    expect(value.selected.at(-1)).toBe("feature-9999");
    expect(value.rows().at(-1)!.getAttribute("aria-selected")).toBe("true");
    const lastId = value.rows().at(-1)!.id;
    expect(value.root.getAttribute("aria-activedescendant")).toBe(lastId);
    value.key("ArrowUp");
    expect(value.selected.at(-1)).toBe("feature-9998");
    value.key("Home");
    value.key("ArrowDown");
    expect(value.selected.at(-1)).toBe("feature-1");
    expect(value.key("Tab").defaultPrevented).toBe(false);
  });

  it("handles hidden/resize, shorter and empty lists without stale options", () => {
    const value = setup(5738);
    value.root.clientHeight = 0;
    value.document.resize?.();
    expect(value.rows().length).toBeLessThanOrEqual(17);
    value.root.clientHeight = 106;
    value.document.resize?.();
    expect(value.rows().length).toBe(6);
    value.scroll(200000);
    value.view.update(value.data.slice(0, 2), "feature-1");
    expect(value.root.scrollTop).toBe(0);
    expect(value.rows().map((row) => row.dataset.featureId)).toEqual(["feature-0", "feature-1"]);
    value.view.update([], null);
    expect(value.rows()).toEqual([]);
    expect(value.root.getAttribute("aria-activedescendant")).toBeNull();
    value.key("End");
    expect(value.selected).toEqual([]);
  });

  it("does not rebuild the same scroll window and fully detaches on dispose", () => {
    const value = setup(10000);
    const first = value.rows()[0]!;
    value.scroll(1);
    value.scroll(2);
    const staleRow = value.rows()[0]!;
    value.scroll(3);
    expect(value.rows()[0]).toBe(staleRow);
    value.view.dispose();
    value.view.dispose();
    value.scroll(5000);
    value.key("End");
    first.dispatchEvent(new Event("click"));
    value.document.resize?.();
    value.view.update(value.data, "feature-10");
    expect(value.root.children).toEqual([]);
    expect(value.selected).toEqual([]);
    expect(value.document.disconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps content as text, refreshes visible rows, and never mutates inspection data", () => {
    const value = setup(5738);
    const dangerousId = '<img src="bad" onerror="bad()">';
    const changed = [{ ...value.data[0]!, id: dangerousId, type: "new-type", version: 7,
      status: "error" as const, resources: [{ id: "surface", kind: "surface" as const }] }, ...value.data.slice(1)];
    const before = JSON.stringify(changed);
    value.view.update(changed, dangerousId);
    const row = value.rows()[0]!;
    expect(row.dataset.featureId).toBe(dangerousId);
    expect(row.children[0]!.className).toBe("feature-icon surface");
    expect(row.children[1]!.children[0]!.textContent).toBe(dangerousId);
    expect(row.children[1]!.children[1]!.textContent).toBe("new-type · v7");
    expect(row.children[2]!.textContent).toBe("error");
    expect(row.children[1]!.children[0]!.children).toEqual([]);
    expect(row.style.height).toBe("48px");
    const descendants = (element: ElementDouble): number => 1 + element.children.reduce((sum, child) => sum + descendants(child), 0);
    expect(descendants(value.root)).toBeLessThanOrEqual(104);
    value.scroll(100000);
    value.view.update(changed, "feature-5737");
    expect(value.rows().at(-1)!.getAttribute("aria-selected")).toBe("true");
    expect(JSON.stringify(changed)).toBe(before);
  });

  it("isolates consumers and allows a fresh installation after disposal", () => {
    const first = setup(5738);
    const second = setup(10000);
    first.key("End");
    expect(second.selected).toEqual([]);
    first.view.dispose();
    second.key("End");
    expect(second.selected).toEqual(["feature-9999"]);
    expect(second.document.disconnect).not.toHaveBeenCalled();
    const replacement = installFeatureListWindow({ root: first.root as unknown as HTMLDivElement,
      onSelect: (id) => first.selected.push(id) });
    replacement.update(first.data, "feature-0");
    first.rows()[1]!.dispatchEvent(new Event("click"));
    expect(first.selected).toEqual(["feature-5737", "feature-1"]);
    replacement.dispose();
    expect(first.document.disconnect).toHaveBeenCalledTimes(2);
  });
});
