import type { FeatureInspection } from "./playground-world.js";

// Fixed row pitch includes the existing 5px inter-row gap; text stays single-line.
export const FEATURE_ROW_HEIGHT_PIXELS = 53;
export const FEATURE_LIST_MAX_HEIGHT_PIXELS = 424;
export const FEATURE_LIST_OVERSCAN_ROWS = 4;

export function featureListWindow(count: number, scrollTopPixels: number, viewportHeightPixels: number) {
  const height = Math.max(1, Math.min(FEATURE_LIST_MAX_HEIGHT_PIXELS, viewportHeightPixels || FEATURE_LIST_MAX_HEIGHT_PIXELS));
  const totalHeightPixels = count * FEATURE_ROW_HEIGHT_PIXELS;
  const top = Math.max(0, Math.min(scrollTopPixels, Math.max(0, totalHeightPixels - height)));
  return {
    start: Math.max(0, Math.floor(top / FEATURE_ROW_HEIGHT_PIXELS) - FEATURE_LIST_OVERSCAN_ROWS),
    end: Math.min(count, Math.ceil((top + height) / FEATURE_ROW_HEIGHT_PIXELS) + FEATURE_LIST_OVERSCAN_ROWS),
    scrollTopPixels: top,
    totalHeightPixels,
  };
}

/** View-only window. The consumer retains the selected identity and inspection data. */
export function installFeatureListWindow(input: Readonly<{
  root: HTMLDivElement;
  onSelect: (featureId: string) => void;
}>) {
  const { root } = input;
  const document = root.ownerDocument;
  const track = document.createElement("div");
  track.className = "feature-list-window";
  track.setAttribute("role", "presentation");
  root.replaceChildren(track);
  root.setAttribute("role", "listbox");
  root.setAttribute("aria-label", "Features");
  root.tabIndex = 0;
  let features: readonly FeatureInspection[] = [];
  let selectedFeatureId: string | null = null;
  let disposed = false;
  let previousStart = -1;
  let previousEnd = -1;

  function select(index: number): void {
    if (disposed) return;
    const feature = features[index];
    if (feature === undefined) return;
    root.focus({ preventScroll: true });
    input.onSelect(feature.id);
  }

  function render(force = false): void {
    if (disposed) return;
    const range = featureListWindow(features.length, root.scrollTop, root.clientHeight);
    if (root.scrollTop !== range.scrollTopPixels) root.scrollTop = range.scrollTopPixels;
    if (!force && range.start === previousStart && range.end === previousEnd) return;
    previousStart = range.start;
    previousEnd = range.end;
    root.removeAttribute("aria-activedescendant");
    const rows: HTMLButtonElement[] = [];
    for (let index = range.start; index < range.end; index += 1) {
      const feature = features[index]!;
      const button = document.createElement("button");
      const selected = selectedFeatureId === feature.id;
      button.type = "button";
      button.className = `feature-item${selected ? " selected" : ""}`;
      button.id = `${root.id}-option-${index}`;
      button.dataset.featureId = feature.id;
      button.tabIndex = -1;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(selected));
      button.setAttribute("aria-posinset", String(index + 1));
      button.setAttribute("aria-setsize", String(features.length));
      button.style.top = `${index * FEATURE_ROW_HEIGHT_PIXELS}px`;
      button.style.height = `${FEATURE_ROW_HEIGHT_PIXELS - 5}px`;
      const icon = document.createElement("span");
      icon.className = `feature-icon ${feature.resources[0]?.kind ?? "mesh"}`;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = feature.id;
      const description = document.createElement("small");
      description.textContent = `${feature.type} · v${feature.version}`;
      label.append(name, description);
      const status = document.createElement("em");
      status.textContent = feature.status;
      button.append(icon, label, status);
      button.addEventListener("click", () => select(index));
      if (selected) root.setAttribute("aria-activedescendant", button.id);
      rows.push(button);
    }
    track.replaceChildren(...rows);
  }

  const onScroll = (): void => render();
  const onKeyDown = (event: KeyboardEvent): void => {
    if (features.length === 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    const index = features.findIndex(({ id }) => id === selectedFeatureId);
    let next: number;
    switch (event.key) {
      case "ArrowDown": next = Math.min(features.length - 1, index + 1); break;
      case "ArrowUp": next = Math.max(0, index - 1); break;
      case "Home": next = 0; break;
      case "End": next = features.length - 1; break;
      case "Enter":
      case " ": next = Math.max(0, index); break;
      default: return;
    }
    event.preventDefault();
    select(next);
  };
  root.addEventListener("scroll", onScroll, { passive: true });
  root.addEventListener("keydown", onKeyDown);
  const resizeObserver = new (document.defaultView!.ResizeObserver)(() => render());
  resizeObserver.observe(root);

  return {
    update(nextFeatures: readonly FeatureInspection[], nextSelectedFeatureId: string | null): void {
      if (disposed) return;
      const selectionChanged = selectedFeatureId !== nextSelectedFeatureId;
      features = nextFeatures;
      selectedFeatureId = nextSelectedFeatureId;
      root.style.height = `${Math.min(features.length * FEATURE_ROW_HEIGHT_PIXELS, FEATURE_LIST_MAX_HEIGHT_PIXELS)}px`;
      track.style.height = `${features.length * FEATURE_ROW_HEIGHT_PIXELS}px`;
      if (selectionChanged) {
        const index = features.findIndex(({ id }) => id === selectedFeatureId);
        if (index >= 0) {
          const top = index * FEATURE_ROW_HEIGHT_PIXELS;
          const height = root.clientHeight || FEATURE_LIST_MAX_HEIGHT_PIXELS;
          if (top < root.scrollTop) root.scrollTop = top;
          else if (top + FEATURE_ROW_HEIGHT_PIXELS > root.scrollTop + height) {
            root.scrollTop = top + FEATURE_ROW_HEIGHT_PIXELS - height;
          }
        }
      }
      render(true);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      resizeObserver.disconnect();
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("keydown", onKeyDown);
      root.removeAttribute("aria-activedescendant");
      root.removeAttribute("aria-label");
      root.removeAttribute("role");
      root.removeAttribute("tabindex");
      root.style.height = "";
      track.replaceChildren();
      root.replaceChildren();
      features = [];
      selectedFeatureId = null;
    },
  };
}
