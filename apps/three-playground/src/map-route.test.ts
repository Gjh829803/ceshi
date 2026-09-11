import { describe, expect, it, vi } from "vitest";
import { MAPS } from "../../../shared/preset-content/environment/maps";
import { readMapHash, writeMapHash } from "./map-route";

const mapIds = ["campus", "grand-prix", "character-workshop", "aircraft-training", "flying-creature-training", "space-training"];

describe("Playground map URL", () => {
  it.each(["npc-workshop", "space-training", "flying-creature-training"])("exposes %s through the real scene catalog", (id) => {
    expect(readMapHash(`#/scenes/${id}`, MAPS.map(map => map.id))).toBe(id);
  });
  it.each(mapIds)("restores the %s map from its URL", (id) => {
    expect(readMapHash(`#/scenes/${id}`, mapIds)).toBe(id);
  });

  it.each(["", "#other", "#/scenes/missing", "#/scenes/%E0%A4", "#/scenes/grand-prix/extra"])(
    "falls back to campus for an absent or invalid route: %s",
    (hash) => expect(readMapHash(hash, mapIds)).toBe("campus"),
  );

  it("preserves the page path and query, and does not duplicate history on back/forward", () => {
    const browser = {
      location: { pathname: "/playground/", search: "?debug=1", hash: "#/scenes/campus" },
      history: { state: { panel: "open" }, pushState: vi.fn(), replaceState: vi.fn() },
    };
    writeMapHash(browser, "grand-prix");
    expect(browser.history.pushState).toHaveBeenCalledWith({ panel: "open" }, "", "/playground/?debug=1#/scenes/grand-prix");
    browser.location.hash = "#/scenes/grand-prix";
    writeMapHash(browser, "grand-prix");
    expect(browser.history.pushState).toHaveBeenCalledTimes(1);
    browser.location.hash = "#/scenes/unknown";
    writeMapHash(browser, "campus", true);
    expect(browser.history.replaceState).toHaveBeenCalledWith({ panel: "open" }, "", "/playground/?debug=1#/scenes/campus");
  });
});
