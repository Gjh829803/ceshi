import { filterAssets, resolveQuickSlots, sanitizeAssetIds, sortAssets, type AssetEntry, type AssetSort } from './catalog';
import { icon } from '../ui/icons';
import './platform.css';

export type LibraryOptions = {
  assets: readonly AssetEntry[];
  /** Called only by the primary action, never by browsing a result. */
  onSelect: (id: string) => void;
  onOpenChange: (open: boolean) => void;
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

const STORAGE_KEY = 'vector.asset-library.v1';
const categoryLabels = { all: '全部', character: '人物', ground: '陆地', water: '水域', air: '空域', creatures: '生物' } as const;
let nextLibraryId = 0;

function create<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(className: string, text = ''): HTMLButtonElement {
  const element = create('button', className, text);
  element.type = 'button';
  return element;
}

export function mountAssetLibrary(host: HTMLElement, options: LibraryOptions): AssetLibrary {
  const catalogIds = options.assets.map(asset => asset.id);
  const byId = new Map(options.assets.map(asset => [asset.id, asset]));
  const thumbnails = new Map<string, string>();
  let favorites: string[] = [];
  let recent: string[] = [];
  let activeId: string | null = null;
  let selectedId: string | null = catalogIds[0] ?? null;
  let category: keyof typeof categoryLabels = 'all';
  let order: AssetSort = 'catalog';
  let favoritesOnly = false;
  let disposed = false;
  let opened = false;
  let restoreFocus: HTMLElement | null = null;
  let storageAvailable = true;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved: unknown = JSON.parse(raw);
      if (saved && typeof saved === 'object' && 'version' in saved && saved.version === 1) {
        favorites = sanitizeAssetIds(options.assets, 'favorites' in saved ? saved.favorites : undefined);
        recent = sanitizeAssetIds(options.assets, 'recent' in saved ? saved.recent : undefined);
      }
    }
  } catch {
    storageAvailable = false;
  }

  const libraryId = `asset-library-${++nextLibraryId}`;
  const drawer = create('aside', 'asset-library');
  drawer.hidden = true;
  drawer.setAttribute('aria-labelledby', `${libraryId}-title`);
  const header = create('header', 'asset-library-header');
  const heading = create('div', 'asset-library-heading');
  heading.append(create('div', 'asset-library-eyebrow', 'WORKSPACE'));
  const titleRow = create('div', 'asset-library-title-row');
  const title = create('h2', 'asset-library-title', '资产库');
  title.id = `${libraryId}-title`;
  titleRow.append(title, create('span', 'asset-library-total', String(options.assets.length)));
  heading.append(titleRow);
  const closeButton = button('asset-library-close');
  closeButton.append(icon('x', 16));
  closeButton.setAttribute('aria-label', '收起资产库');
  closeButton.title = '收起资产库 · Esc';
  header.append(heading, closeButton);

  const tools = create('div', 'asset-library-tools');
  const searchLabel = create('label', 'asset-library-search');
  searchLabel.append(icon('search', 16));
  const search = create('input', 'asset-library-search-input');
  search.type = 'search';
  search.placeholder = '搜索资产、标签、贡献者…';
  search.setAttribute('aria-label', '搜索资产');
  search.autocomplete = 'off';
  search.spellcheck = false;
  searchLabel.append(search);
  tools.append(searchLabel);
  const filters = create('div', 'asset-library-filters');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', '按类别筛选资产');
  const categoryButtons = new Map<string, HTMLButtonElement>();
  for (const [value, label] of Object.entries(categoryLabels)) {
    const filter = button('asset-library-filter', label);
    filter.dataset.environment = value;
    filter.setAttribute('aria-pressed', String(value === category));
    filter.addEventListener('click', () => {
      category = value as keyof typeof categoryLabels;
      for (const [key, entry] of categoryButtons) entry.setAttribute('aria-pressed', String(key === category));
      renderAssets();
    });
    categoryButtons.set(value, filter);
    filters.append(filter);
  }
  tools.append(filters);

  const resultsHeading = create('div', 'asset-library-results-heading');
  const resultCount = create('span', 'asset-library-result-count');
  resultCount.setAttribute('role', 'status');
  resultCount.setAttribute('aria-live', 'polite');
  const resultTools = create('div', 'asset-library-result-tools');
  const favoriteFilter = button('asset-library-favorite-filter');
  favoriteFilter.append(icon('star', 13), create('span', '', '收藏'));
  favoriteFilter.setAttribute('aria-pressed', 'false');
  favoriteFilter.setAttribute('aria-label', '仅看收藏');
  favoriteFilter.addEventListener('click', () => {
    favoritesOnly = !favoritesOnly;
    favoriteFilter.setAttribute('aria-pressed', String(favoritesOnly));
    renderAssets();
  });
  const sort = create('select', 'asset-library-sort');
  sort.setAttribute('aria-label', '资产排序');
  for (const [value, label] of [['catalog', '默认排序'], ['name', '按名称'], ['recent', '最近使用']]) {
    const option = create('option', '', label);
    option.value = value!;
    sort.append(option);
  }
  sort.addEventListener('change', () => {
    order = sort.value as AssetSort;
    renderAssets();
  });
  resultTools.append(favoriteFilter, sort);
  resultsHeading.append(resultCount, resultTools);
  const list = create('div', 'asset-library-list');
  list.setAttribute('aria-label', '资产搜索结果');

  const detail = create('section', 'asset-library-detail');
  detail.setAttribute('aria-label', '选中资产详情');
  const detailContent = create('div', 'asset-library-detail-content');
  const primaryAction = button('asset-library-primary');
  primaryAction.append(create('span', '', '前往资产'), icon('arrow-up-right', 16));
  primaryAction.addEventListener('click', () => {
    const asset = selectedId ? byId.get(selectedId) : undefined;
    if (!asset || asset.status === 'draft') return;
    close();
    options.onSelect(asset.id);
    markRecent(asset.id);
  });
  detail.append(detailContent, primaryAction);
  const footer = create('footer', 'asset-library-footer');
  const favoriteCount = create('span', 'asset-library-favorite-count');
  const preferenceStatus = create('span', 'asset-library-preference-status');
  preferenceStatus.setAttribute('role', 'status');
  preferenceStatus.setAttribute('aria-live', 'polite');
  footer.append(favoriteCount, preferenceStatus);
  drawer.append(header, tools, resultsHeading, list, detail, footer);
  host.append(drawer);

  function getQuickSlots(): AssetEntry[] {
    return resolveQuickSlots(options.assets, [...favorites, ...recent, ...catalogIds]);
  }

  function updatePreferences(): void {
    favoriteCount.textContent = `${favorites.length} 项收藏`;
    preferenceStatus.textContent = storageAvailable ? '收藏优先 · 6 个快捷位' : '仅本次会话保存';
    preferenceStatus.title = storageAvailable
      ? '收藏数量不限。前 6 项优先进入快捷栏，其余槽位显示最近使用的资产。'
      : '浏览器存储不可用，收藏和最近使用仅保留在本次会话。';
  }

  function savePreferences(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, favorites, recent }));
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
    updatePreferences();
    options.onQuickSlotsChange?.(getQuickSlots());
  }

  function markRecent(id: string): void {
    if (recent[0] === id) return;
    recent = [id, ...recent.filter(previous => previous !== id)];
    savePreferences();
  }

  function renderThumbnail(element: HTMLElement, asset: AssetEntry): void {
    const url = thumbnails.get(asset.id) ?? asset.thumbnail;
    if (!url) {
      element.replaceChildren(icon(asset.icon, 25));
      return;
    }
    const image = create('img', 'asset-library-thumbnail');
    image.src = url;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => element.replaceChildren(icon(asset.icon, 25)), { once: true });
    element.replaceChildren(image);
  }

  function symbol(asset: AssetEntry): HTMLElement {
    const element = create('span', 'asset-library-symbol');
    element.dataset.assetThumbnail = asset.id;
    element.style.setProperty('--asset-color', asset.color);
    element.setAttribute('aria-hidden', 'true');
    renderThumbnail(element, asset);
    return element;
  }

  function updateFavoriteButton(element: HTMLButtonElement, asset: AssetEntry): void {
    const selected = favorites.includes(asset.id);
    element.setAttribute('aria-pressed', String(selected));
    element.setAttribute('aria-label', `${selected ? '取消收藏' : '收藏'}${asset.name}`);
    element.title = selected ? '取消收藏' : '收藏资产';
  }

  function renderDetail(): void {
    const asset = selectedId ? byId.get(selectedId) : undefined;
    detailContent.replaceChildren();
    primaryAction.disabled = !asset || asset.status === 'draft';
    if (!asset) {
      detailContent.append(create('p', 'asset-library-detail-empty', '选择资产，查看详情'));
      return;
    }
    const heading = create('div', 'asset-library-detail-heading');
    const information = create('div', 'asset-library-detail-information');
    const top = create('div', 'asset-library-detail-title-row');
    top.append(create('strong', 'asset-library-detail-title', asset.name));
    top.append(create('span', 'asset-library-detail-state', activeId === asset.id ? '操控中' : '已选中'));
    information.append(top, create('p', 'asset-library-detail-summary', asset.summary ?? `${categoryLabels[asset.environment]} · ${asset.tags.slice(0, 2).join(' / ')}`));
    heading.append(symbol(asset), information);
    const source = create('p', 'asset-library-detail-source', asset.source ?? '来源未记录');
    source.title = `来源：${asset.source ?? '未记录'}`;
    const version = asset.version && asset.version !== 'local' ? `v${asset.version}` : '本地版本';
    const metadata = create('p', 'asset-library-detail-meta', `${asset.contributor ?? '贡献者未记录'} · ${version}${asset.status === 'draft' ? ' · 草稿' : ''}`);
    detailContent.append(heading, source, metadata);
    primaryAction.title = asset.kind === 'character' ? '前往人物，恢复步行操控' : `前往${asset.name}停靠位置，按 F 进入`;
  }

  function renderAssets(): void {
    const matches = sortAssets(filterAssets(options.assets, search.value, category)
      .filter(asset => !favoritesOnly || favorites.includes(asset.id)), order, recent);
    resultCount.textContent = `${matches.length} 项资产`;
    list.replaceChildren();
    if (!matches.length) {
      const empty = create('div', 'asset-library-empty');
      empty.append(icon('search', 28));
      empty.append(create('strong', 'asset-library-empty-title', favoritesOnly ? '暂无匹配的收藏' : '没有找到匹配资产'));
      empty.append(create('p', 'asset-library-empty-description', '试试其他名称，或切换分类。'));
      list.append(empty);
      return;
    }
    for (const asset of matches) {
      const row = create('article', 'asset-library-card');
      row.dataset.assetId = asset.id;
      row.dataset.active = String(activeId === asset.id);
      row.dataset.selected = String(selectedId === asset.id);
      row.style.setProperty('--asset-color', asset.color);
      const select = button('asset-library-select');
      select.setAttribute('aria-label', `查看${asset.name}`);
      select.setAttribute('aria-pressed', String(selectedId === asset.id));
      select.title = `查看${asset.name}详情`;
      const information = create('span', 'asset-library-information');
      const nameRow = create('span', 'asset-library-name-row');
      nameRow.append(create('span', 'asset-library-name', asset.name));
      if (activeId === asset.id) nameRow.append(create('span', 'asset-library-active-marker', '操控中'));
      information.append(nameRow, create('span', 'asset-library-en', `${asset.en} · ${asset.kernel}`));
      information.append(create('span', 'asset-library-metadata', `${categoryLabels[asset.environment]} / ${asset.tags[0] ?? asset.mode}`));
      select.append(symbol(asset), information);
      select.addEventListener('click', () => {
        selectedId = asset.id;
        // Update selection in place to preserve scroll and keyboard focus.
        for (const candidate of list.querySelectorAll<HTMLElement>('.asset-library-card')) {
          const selected = candidate.dataset.assetId === asset.id;
          candidate.dataset.selected = String(selected);
          candidate.querySelector('.asset-library-select')?.setAttribute('aria-pressed', String(selected));
        }
        renderDetail();
        options.onBrowseChange?.(asset);
      });
      const favorite = button('asset-library-favorite');
      favorite.append(icon('star', 15));
      updateFavoriteButton(favorite, asset);
      favorite.addEventListener('click', () => {
        favorites = favorites.includes(asset.id) ? favorites.filter(id => id !== asset.id) : [...favorites, asset.id];
        savePreferences();
        if (favoritesOnly) {
          renderAssets();
          favoriteFilter.focus({ preventScroll: true });
        } else {
          updateFavoriteButton(favorite, asset);
        }
      });
      row.append(select, favorite);
      list.append(row);
    }
  }

  function open(): void {
    if (disposed || opened) return;
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    renderAssets();
    renderDetail();
    opened = true;
    drawer.hidden = false;
    options.onOpenChange(true);
    search.focus({ preventScroll: true });
  }

  function close(): void {
    if (!opened) return;
    opened = false;
    drawer.hidden = true;
    options.onOpenChange(false);
    if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
    restoreFocus = null;
  }

  search.addEventListener('input', renderAssets);
  closeButton.addEventListener('click', close);
  drawer.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  // Let key releases reach the live viewport so a held movement key cannot
  // remain latched when focus moves from the canvas into this drawer.
  updatePreferences();
  renderAssets();
  renderDetail();

  return {
    open,
    close,
    isOpen: () => opened,
    setActive(id) {
      if (disposed) return;
      const nextId = id && byId.has(id) ? id : null;
      if (activeId === nextId) return;
      activeId = nextId;
      if (nextId) markRecent(nextId);
      if (opened) {
        renderAssets();
        renderDetail();
      }
    },
    setThumbnail(id, url) {
      const asset = byId.get(id);
      if (disposed || !asset || thumbnails.get(id) === url) return;
      thumbnails.set(id, url);
      for (const element of drawer.querySelectorAll<HTMLElement>('[data-asset-thumbnail]')) {
        if (element.dataset.assetThumbnail === id) renderThumbnail(element, asset);
      }
    },
    getQuickSlots,
    dispose() {
      if (disposed) return;
      close();
      disposed = true;
      thumbnails.clear();
      drawer.remove();
    },
  };
}
