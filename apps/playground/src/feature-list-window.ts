import type { FeatureInspection } from "./playground-world.js";

export interface FeatureListWindowV1 {
  readonly startIndex: number;
  readonly endIndexExclusive: number;
  readonly totalHeightPixels: number;
}

export const FEATURE_LIST_ROW_HEIGHT_PIXELS_V1 = 48;
export const FEATURE_LIST_MAX_VIEWPORT_HEIGHT_PIXELS_V1 = 432;
const FEATURE_LIST_OVERSCAN_ROW_COUNT_V1 = 5;

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculateFeatureListWindowV1(input: Readonly<{
  itemCount: number;
  overscanRowCount: number;
  rowHeightPixels: number;
  scrollTopPixels: number;
  viewportHeightPixels: number;
}>): FeatureListWindowV1 {
  const itemCount = Number.isSafeInteger(input.itemCount)
    ? Math.max(0, input.itemCount)
    : 0;
  const rowHeightPixels = Number.isFinite(input.rowHeightPixels) &&
      input.rowHeightPixels > 0
    ? input.rowHeightPixels
    : FEATURE_LIST_ROW_HEIGHT_PIXELS_V1;
  const overscanRowCount = Number.isSafeInteger(input.overscanRowCount)
    ? Math.max(0, input.overscanRowCount)
    : 0;
  const viewportHeightPixels = finiteNonNegative(input.viewportHeightPixels);
  const visibleRowCount = Math.max(1, Math.ceil(viewportHeightPixels / rowHeightPixels));
  const maximumVisibleStartIndex = Math.max(0, itemCount - visibleRowCount);
  const visibleStartIndex = Math.min(
    maximumVisibleStartIndex,
    Math.floor(finiteNonNegative(input.scrollTopPixels) / rowHeightPixels),
  );
  const startIndex = Math.max(0, visibleStartIndex - overscanRowCount);
  const endIndexExclusive = Math.min(
    itemCount,
    visibleStartIndex + visibleRowCount + overscanRowCount,
  );
  return Object.freeze({
    startIndex,
    endIndexExclusive,
    totalHeightPixels: itemCount * rowHeightPixels,
  });
}

export interface VirtualFeatureListV1 {
  setFeatures(
    features: readonly FeatureInspection[],
    selectedFeatureId: string | null,
  ): void;
  dispose(): void;
}

export function createVirtualFeatureListV1(input: Readonly<{
  container: HTMLDivElement;
  createRow(feature: FeatureInspection): HTMLButtonElement;
}>): VirtualFeatureListV1 {
  const track = document.createElement("div");
  track.className = "feature-list-track";
  input.container.classList.add("feature-list-virtualized");
  input.container.replaceChildren(track);
  let features: readonly FeatureInspection[] = [];
  let selectedFeatureId: string | null = null;
  let disposed = false;

  const render = (): void => {
    if (disposed) return;
    const viewportHeightPixels = Math.min(
      FEATURE_LIST_MAX_VIEWPORT_HEIGHT_PIXELS_V1,
      input.container.clientHeight || FEATURE_LIST_MAX_VIEWPORT_HEIGHT_PIXELS_V1,
    );
    const window = calculateFeatureListWindowV1({
      itemCount: features.length,
      overscanRowCount: FEATURE_LIST_OVERSCAN_ROW_COUNT_V1,
      rowHeightPixels: FEATURE_LIST_ROW_HEIGHT_PIXELS_V1,
      scrollTopPixels: input.container.scrollTop,
      viewportHeightPixels,
    });
    track.style.height = `${window.totalHeightPixels}px`;
    const rows: HTMLButtonElement[] = [];
    for (let index = window.startIndex; index < window.endIndexExclusive; index += 1) {
      const feature = features[index]!;
      const row = input.createRow(feature);
      row.classList.toggle("selected", selectedFeatureId === feature.id);
      row.setAttribute("aria-selected", String(selectedFeatureId === feature.id));
      row.style.transform = `translateY(${index * FEATURE_LIST_ROW_HEIGHT_PIXELS_V1}px)`;
      rows.push(row);
    }
    track.replaceChildren(...rows);
  };

  const onScroll = (): void => render();
  input.container.addEventListener("scroll", onScroll, { passive: true });

  return Object.freeze({
    setFeatures(
      nextFeatures: readonly FeatureInspection[],
      nextSelectedFeatureId: string | null,
    ): void {
      if (disposed) return;
      features = nextFeatures;
      selectedFeatureId = nextSelectedFeatureId;
      input.container.style.height = `${Math.min(
        FEATURE_LIST_MAX_VIEWPORT_HEIGHT_PIXELS_V1,
        features.length * FEATURE_LIST_ROW_HEIGHT_PIXELS_V1,
      )}px`;
      render();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      input.container.removeEventListener("scroll", onScroll);
      input.container.replaceChildren();
      input.container.classList.remove("feature-list-virtualized");
      input.container.style.removeProperty("height");
    },
  });
}
