/** Unknown or malformed scene links open the default training campus. */
export function readMapHash(hash: string, mapIds: readonly string[]): string {
  const match = /^#\/scenes\/([^/]+)$/.exec(hash);
  if (match) {
    try {
      const id = decodeURIComponent(match[1]!);
      if (mapIds.includes(id)) return id;
    } catch {
      // A manually edited URL may contain an incomplete percent escape.
    }
  }
  return "campus";
}

type BrowserLocation = {
  location: Pick<Location, "hash" | "pathname" | "search">;
  history: Pick<History, "state" | "pushState" | "replaceState">;
};

/** 新网址优先；旧 ?map= 链接仅在首次没有 hash 时用于选择地图。 */
export function readInitialMap(hash: string, search: string, mapIds: readonly string[]): string {
  if (hash) return readMapHash(hash, mapIds);
  const legacy = new URLSearchParams(search).get("map");
  return legacy && mapIds.includes(legacy) ? legacy : "campus";
}

export function writeMapHash(browser: BrowserLocation, mapId: string, replace = false): void {
  const hash = `#/scenes/${encodeURIComponent(mapId)}`;
  if (browser.location.hash === hash) return;
  const url = `${browser.location.pathname}${browser.location.search}${hash}`;
  browser.history[replace ? "replaceState" : "pushState"](browser.history.state, "", url);
}
