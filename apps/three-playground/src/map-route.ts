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

export function writeMapHash(browser: BrowserLocation, mapId: string, replace = false): void {
  const hash = `#/scenes/${encodeURIComponent(mapId)}`;
  if (browser.location.hash === hash) return;
  const url = `${browser.location.pathname}${browser.location.search}${hash}`;
  browser.history[replace ? "replaceState" : "pushState"](browser.history.state, "", url);
}
