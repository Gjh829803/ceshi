import { Hint } from "./components/hint";
import { toast } from "sonner";
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { ChoiceSelect, ChoiceOption } from "./components/choice-select";
import {
  filterAssets,
  resolveQuickSlots,
  sanitizeAssetIds,
  sortAssets,
  type AssetEntry,
  type AssetSort,
} from "@worldkit/preset-content/platform/catalog";
import "./styles/platform.css";
import { Icon } from "./components/icon";
import { Pin, PinOff } from "lucide-react";

import type {PanelStateStore} from './panel-state';

export type LibraryOptions = {
  panels?:PanelStateStore;
  assets: readonly AssetEntry[];
  /** Called only by the primary action, never by browsing a result. */
  onSelect: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  onPinnedChange?: (pinned:boolean) => void;
  onBrowseChange?: (asset: AssetEntry) => void;
  onQuickSlotsChange?: (assets: AssetEntry[]) => void;
};
export type AssetLibrary = {
  open(): void;
  close(): void;
  isOpen(): boolean;
  setActive(id: string | null): void;
  setThumbnail(id: string, url: string): void;
  getQuickSlots(): AssetEntry[];
  dispose(): void;
};
const STORAGE_KEY = "vector.asset-library.v1";
const categoryLabels = {
  all: "全部",
  character: "人物",
  ground: "陆地",
  water: "水域",
  air: "空域",
  creatures: "生物",
} as const;
let nextLibraryId = 0;
function AssetThumbnail({ source, icon }: { source: string; icon: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <Icon name={icon} size={25} />
  ) : (
    <img
      className="asset-library-thumbnail"
      src={source}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
function AssetSymbol({
  asset,
  url,
}: {
  asset: AssetEntry;
  url?: string | undefined;
}) {
  const source = url ?? asset.thumbnail;
  return (
    <span
      className="asset-library-symbol"
      data-asset-thumbnail={asset.id}
      style={{ "--asset-color": asset.color } as CSSProperties}
      aria-hidden="true"
    >
      {source ? (
        <AssetThumbnail key={source} source={source} icon={asset.icon} />
      ) : (
        <Icon name={asset.icon} size={25} />
      )}
    </span>
  );
}

type State = {
  opened: boolean;
  favorites: string[];
  recent: string[];
  activeId: string | null;
  selectedId: string | null;
  category: keyof typeof categoryLabels;
  order: AssetSort;
  favoritesOnly: boolean;
  query: string;
  storageAvailable: boolean;
  pinned: boolean;
  thumbnails: Record<string, string>;
};
function initialState(assets: readonly AssetEntry[],panels?:PanelStateStore): State {
  const state: State = {
    opened: false,
    pinned: false,
    favorites: [],
    recent: [],
    activeId: null,
    selectedId: assets[0]?.id ?? null,
    category: "all",
    order: "catalog",
    favoritesOnly: false,
    query: "",
    storageAvailable: true,
    thumbnails: {},
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (
      saved &&
      typeof saved === "object" &&
      "version" in saved &&
      saved.version === 1
    ) {
      state.favorites = sanitizeAssetIds(
        assets,
        "favorites" in saved ? saved.favorites : undefined,
      );
      state.recent = sanitizeAssetIds(
        assets,
        "recent" in saved ? saved.recent : undefined,
      );
    }
  } catch {
    state.storageAvailable = false;
  }
  const restored=panels?.read('assetLibrary');
  if(restored)Object.assign(state,{opened:restored.open,pinned:restored.pinned,query:restored.query,category:restored.category,order:restored.order,favoritesOnly:restored.favoritesOnly,
    selectedId:assets.some(asset=>asset.id===restored.selectedId)?restored.selectedId:state.selectedId});
  return state;
}
type LibraryHandle = Omit<AssetLibrary, "dispose">;
const Library = forwardRef<
  LibraryHandle,
  LibraryOptions & { libraryId: string }
>(function Library(options, ref) {
  const [state, setState] = useState(() => initialState(options.assets,options.panels));
  // The ref makes synchronous SDK calls observe the latest state even before React commits.
  const current = useRef(state);
  const searchRef = useRef<HTMLInputElement>(null);
  const favoriteFilterRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const catalogIds = options.assets.map((asset) => asset.id);
  function update(patch: Partial<State>) {
    current.current = { ...current.current, ...patch };
    setState(current.current);
    const next=current.current;options.panels?.update('assetLibrary',{open:next.opened,pinned:next.pinned,query:next.query,category:next.category,order:next.order,favoritesOnly:next.favoritesOnly,selectedId:next.selectedId??''});
  }
  function getQuickSlots() {
    return resolveQuickSlots(options.assets, [
      ...current.current.favorites,
      ...current.current.recent,
      ...catalogIds,
    ]);
  }
  function savePreferences(
    patch: Pick<State, "favorites"> | Pick<State, "recent">,
  ) {
    const next = { ...current.current, ...patch };
    let storageAvailable = true;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          favorites: next.favorites,
          recent: next.recent,
        }),
      );
    } catch {
      storageAvailable = false;
      toast.error("浏览器存储不可用，收藏和最近使用仅保留在本次会话。", {
        id: `${options.libraryId}-storage`,
      });
    }
    update({ ...patch, storageAvailable });
    options.onQuickSlotsChange?.(getQuickSlots());
  }
  function markRecent(id: string) {
    if (current.current.recent[0] !== id)
      savePreferences({
        recent: [
          id,
          ...current.current.recent.filter((previous) => previous !== id),
        ],
      });
  }
  function close() {
    if (!current.current.opened) return;
    update({ opened: false });
    options.onOpenChange(false);
    if (restoreFocus.current?.isConnected)
      restoreFocus.current.focus({ preventScroll: true });
    restoreFocus.current = null;
  }
  useImperativeHandle(ref, () => ({
    open() {
      if (current.current.opened) return;
      restoreFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      flushSync(() => update({ opened: true }));
      options.onOpenChange(true);
      searchRef.current?.focus({ preventScroll: true });
    },
    close,
    isOpen: () => current.current.opened,
    setActive(id) {
      const nextId = id && catalogIds.includes(id) ? id : null;
      if (current.current.activeId === nextId) return;
      update({ activeId: nextId });
      if (nextId) markRecent(nextId);
    },
    setThumbnail(id, url) {
      if (!catalogIds.includes(id) || current.current.thumbnails[id] === url)
        return;
      update({ thumbnails: { ...current.current.thumbnails, [id]: url } });
    },
    getQuickSlots,
  }));
  const matches = sortAssets(
    filterAssets(options.assets, state.query, state.category).filter(
      (asset) => !state.favoritesOnly || state.favorites.includes(asset.id),
    ),
    state.order,
    state.recent,
  );
  const selected = options.assets.find(
    (asset) => asset.id === state.selectedId,
  );
  const symbol = (asset: AssetEntry) => (
    <AssetSymbol
      key={asset.id}
      asset={asset}
      url={state.thumbnails[asset.id]}
    />
  );
  return (
    <aside
      className="asset-library"
      hidden={!state.opened}
      aria-labelledby={`${options.libraryId}-title`}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      <header className="asset-library-header">
        <div className="asset-library-heading">
          <div className="asset-library-title-row">
            <h2
              className="asset-library-title"
              id={`${options.libraryId}-title`}
            >
              资产库
            </h2>
            <span className="asset-library-total">{options.assets.length}</span>
          </div>
        </div>
        <div className="asset-library-header-actions">
        {options.onPinnedChange && <Hint content={state.pinned ? "取消固定：浮在场景上，恢复完整画布" : "固定到左侧：为面板预留空间，缩小画布"}>
          <Button type="button" className="asset-library-close panel-pin"
            aria-label={state.pinned ? "取消固定资产库面板" : "固定资产库面板"} aria-pressed={state.pinned}
            onClick={()=>{const pinned=!current.current.pinned;update({pinned});options.onPinnedChange?.(pinned);}}>
            {state.pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
          </Button>
        </Hint>}
        <Hint content="收起资产库 · Esc">
          <Button
            type="button"
            className="asset-library-close"
            aria-label="收起资产库"
            onClick={close}
          >
            <Icon name="x" size={16} />
          </Button>
        </Hint>
        </div>
      </header>
      <div className="asset-library-tools">
        <label className="asset-library-search">
          <Icon name="search" size={16} />
          <Input
            ref={searchRef}
            className="asset-library-search-input"
            type="search"
            placeholder="搜索资产、标签、贡献者…"
            aria-label="搜索资产"
            autoComplete="off"
            spellCheck={false}
            value={state.query}
            onChange={(event) => update({ query: event.target.value })}
          />
        </label>
        <div
          className="asset-library-filters"
          role="group"
          aria-label="按类别筛选资产"
        >
          {Object.entries(categoryLabels).map(([value, label]) => (
            <Button
              type="button"
              key={value}
              className="asset-library-filter"
              data-environment={value}
              aria-pressed={state.category === value}
              onClick={() => update({ category: value as State["category"] })}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div className="asset-library-results-heading">
        <span
          className="asset-library-result-count"
          role="status"
          aria-live="polite"
        >
          {matches.length} 项资产
        </span>
        <div className="asset-library-result-tools">
          <Button
            type="button"
            ref={favoriteFilterRef}
            className="asset-library-favorite-filter"
            aria-pressed={state.favoritesOnly}
            aria-label="仅看收藏"
            onClick={() => update({ favoritesOnly: !state.favoritesOnly })}
          >
            <Icon name="star" size={13} />
            <span>收藏</span>
          </Button>
          <ChoiceSelect
            className="asset-library-sort"
            aria-label="资产排序"
            value={state.order}
            onValueChange={(value) => update({ order: value as AssetSort })}
          >
            <ChoiceOption value="catalog">默认排序</ChoiceOption>
            <ChoiceOption value="name">按名称</ChoiceOption>
            <ChoiceOption value="recent">最近使用</ChoiceOption>
          </ChoiceSelect>
        </div>
      </div>
      <div className="asset-library-list" aria-label="资产搜索结果">
        {!matches.length ? (
          <div className="asset-library-empty">
            <Icon name="search" size={28} />
            <strong className="asset-library-empty-title">
              {state.favoritesOnly ? "暂无匹配的收藏" : "没有找到匹配资产"}
            </strong>
            <p className="asset-library-empty-description">
              试试其他名称，或切换分类。
            </p>
          </div>
        ) : (
          matches.map((asset) => (
            <article
              key={asset.id}
              className="asset-library-card"
              data-asset-id={asset.id}
              data-active={state.activeId === asset.id}
              data-selected={state.selectedId === asset.id}
              style={{ "--asset-color": asset.color } as CSSProperties}
            >
              <Hint content={`查看${asset.name}详情`}>
                <Button
                  type="button"
                  className="asset-library-select"
                  aria-label={`查看${asset.name}`}
                  aria-pressed={state.selectedId === asset.id}
                  onClick={() => {
                    update({ selectedId: asset.id });
                    options.onBrowseChange?.(asset);
                  }}
                >
                  {symbol(asset)}
                  <span className="asset-library-information">
                    <span className="asset-library-name-row">
                      <span className="asset-library-name">{asset.name}</span>
                      {state.activeId === asset.id && (
                        <span className="asset-library-active-marker">
                          操控中
                        </span>
                      )}
                    </span>
                    <span className="asset-library-en">
                      {asset.en} · {asset.kernel}
                    </span>
                    <span className="asset-library-metadata">
                      {categoryLabels[asset.environment]} /{" "}
                      {asset.tags[0] ?? asset.mode}
                    </span>
                  </span>
                </Button>
              </Hint>
              <Hint
                content={
                  state.favorites.includes(asset.id) ? "取消收藏" : "收藏资产"
                }
              >
                <Button
                  type="button"
                  className="asset-library-favorite"
                  aria-pressed={state.favorites.includes(asset.id)}
                  aria-label={`${state.favorites.includes(asset.id) ? "取消收藏" : "收藏"}${asset.name}`}
                  onClick={() => {
                    const favorites = current.current.favorites;
                    savePreferences({
                      favorites: favorites.includes(asset.id)
                        ? favorites.filter((id) => id !== asset.id)
                        : [...favorites, asset.id],
                    });
                    if (current.current.favoritesOnly)
                      favoriteFilterRef.current?.focus({ preventScroll: true });
                  }}
                >
                  <Icon name="star" size={15} />
                </Button>
              </Hint>
            </article>
          ))
        )}
      </div>
      <section className="asset-library-detail" aria-label="选中资产详情">
        <div className="asset-library-detail-content">
          {selected ? (
            <>
              <div className="asset-library-detail-heading">
                {symbol(selected)}
                <div className="asset-library-detail-information">
                  <div className="asset-library-detail-title-row">
                    <strong className="asset-library-detail-title">
                      {selected.name}
                    </strong>
                    <span className="asset-library-detail-state">
                      {state.activeId === selected.id ? "操控中" : "已选中"}
                    </span>
                  </div>
                  <p className="asset-library-detail-summary">
                    {selected.summary ??
                      `${categoryLabels[selected.environment]} · ${selected.tags.slice(0, 2).join(" / ")}`}
                  </p>
                </div>
              </div>
              <Hint content={`来源：${selected.source ?? "未记录"}`}>
                <p className="asset-library-detail-source">
                  {selected.source ?? "来源未记录"}
                </p>
              </Hint>
              <p className="asset-library-detail-meta">
                {selected.contributor ?? "贡献者未记录"} ·{" "}
                {selected.version && selected.version !== "local"
                  ? `v${selected.version}`
                  : "本地版本"}
                {selected.status === "draft" ? " · 草稿" : ""}
              </p>
            </>
          ) : (
            <p className="asset-library-detail-empty">选择资产，查看详情</p>
          )}
        </div>
        <Hint
          content={
            selected
              ? selected.kind === "character"
                ? "前往人物，恢复步行操控"
                : `前往${selected.name}停靠位置，按 F 进入`
              : undefined
          }
        >
          <Button
            type="button"
            className="asset-library-primary"
            disabled={!selected || selected.status === "draft"}
            onClick={() => {
              if (!selected || selected.status === "draft") return;
              close();
              options.onSelect(selected.id);
              markRecent(selected.id);
            }}
          >
            <span>前往资产</span>
            <Icon name="arrow-up-right" size={16} />
          </Button>
        </Hint>
      </section>
      <footer className="asset-library-footer">
        <span className="asset-library-favorite-count">
          {state.favorites.length} 项收藏
        </span>
        <Hint
          content={
            state.storageAvailable
              ? "收藏数量不限。前 6 项优先进入快捷栏，其余槽位显示最近使用的资产。"
              : "浏览器存储不可用，收藏和最近使用仅保留在本次会话。"
          }
        >
          <span
            className="asset-library-preference-status"
            role="status"
            aria-live="polite"
          >
            {state.storageAvailable
              ? "收藏优先 · 6 个快捷位"
              : "仅本次会话保存"}
          </span>
        </Hint>
      </footer>
    </aside>
  );
});

/** Imperative bridge for the SDK host; React owns every element inside this mount. */
export function mountAssetLibrary(
  host: HTMLElement,
  options: LibraryOptions,
): AssetLibrary {
  const container = document.createElement("div");
  container.style.display = "contents";
  host.append(container);
  const root = createRoot(container);
  const handle: { current: LibraryHandle | null } = { current: null };
  flushSync(() =>
    root.render(
      <Library
        {...options}
        libraryId={`asset-library-${++nextLibraryId}`}
        ref={handle}
      />,
    ),
  );
  let disposed = false;
  let finalQuickSlots: AssetEntry[] = [];
  return {
    open: () => {
      if (!disposed) handle.current?.open();
    },
    close: () => {
      if (!disposed) flushSync(() => handle.current?.close());
    },
    isOpen: () => !disposed && !!handle.current?.isOpen(),
    setActive: (id) => {
      if (!disposed) flushSync(() => handle.current?.setActive(id));
    },
    setThumbnail: (id, url) => {
      if (!disposed) flushSync(() => handle.current?.setThumbnail(id, url));
    },
    getQuickSlots: () => handle.current?.getQuickSlots() ?? finalQuickSlots,
    dispose() {
      if (disposed) return;
      flushSync(() => handle.current?.close());
      finalQuickSlots = handle.current?.getQuickSlots() ?? [];
      disposed = true;
      root.unmount();
      container.remove();
    },
  };
}
