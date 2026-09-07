import { describe, expect, it } from "vitest";

import {
  assertNativeSemanticPixelClaimsV1,
  type NativeSemanticPixelClaimV1,
  type NativeSemanticTargetMaskV1,
} from "./native-semantic-pixel-claims.test-support.js";

function mask(fixtureId: string, rows: readonly string[]): NativeSemanticTargetMaskV1 {
  return {
    fixtureId, viewId: "opening", cameraSignature: "same-camera",
    widthPixels: rows[0]!.length, heightPixels: rows.length,
    occupancy: Uint8Array.from(rows.join(""), (pixel) => pixel === "#" ? 1 : 0),
  };
}

const baseline = mask("baseline", ["###", "###", "###"]);
const hollow = mask("fixture", ["###", "#.#", "###"]);
const empty = mask("fixture", ["...", "...", "..."]);
const partial = mask("fixture", ["##.", "##.", "..."]);
const separated = mask("fixture", ["#.#", "#.#", "#.#"]);
const identical = { ...baseline, fixtureId: "fixture", occupancy: baseline.occupancy.slice() };

function claim(relation: NativeSemanticPixelClaimV1["relation"]): NativeSemanticPixelClaimV1 {
  return { fixtureId: "fixture", baselineFixtureId: "baseline", viewId: "opening", relation };
}

function verify(relation: NativeSemanticPixelClaimV1["relation"], fixture: NativeSemanticTargetMaskV1, base = baseline) {
  return assertNativeSemanticPixelClaimsV1({ claims: [claim(relation)], masks: [base, fixture] });
}

describe("test-only Native semantic target pixel claims", () => {
  it.each([
    ["fewer-pixels-same-bounds", hollow, baseline],
    ["zero-pixels", empty, baseline],
    ["fewer-positive-pixels", partial, baseline],
    ["two-components", separated, baseline],
    ["same-mask", identical, baseline],
    ["more-pixels", identical, { ...partial, fixtureId: "baseline" }],
  ] as const)("accepts %s", (relation, fixture, base) => {
    expect(() => verify(relation, fixture, base)).not.toThrow();
  });

  it.each([
    ["fewer-pixels-same-bounds", partial],
    ["zero-pixels", partial],
    ["fewer-positive-pixels", empty],
    ["two-components", identical],
    ["same-mask", hollow],
    ["more-pixels", identical],
  ] as const)("rejects a false %s with pair context", (relation, fixture) => {
    expect(() => verify(relation, fixture)).toThrow(new RegExp(`fixture.*baseline.*opening.*${relation}`));
  });

  it("same-mask compares every occupancy bit, not matching count and bounds", () => {
    const first = mask("baseline", ["##.", "#.#", ".##"]);
    const second = mask("fixture", ["###", "...", "###"]);
    expect(() => verify("same-mask", second, first)).toThrow();
  });

  it("same bounds uses integer pixel coordinates, not rounded normalized bounds", () => {
    const occupancy = new Uint8Array(30_000);
    occupancy.set([1, 1, 1], 1);
    const base = { ...baseline, widthPixels: 30_000, heightPixels: 1, occupancy };
    const reduced = { ...base, fixtureId: "fixture", occupancy: occupancy.slice() };
    reduced.occupancy[1] = 0;
    expect(() => verify("fewer-pixels-same-bounds", reduced, base)).toThrow();
  });

  it.each([
    ["diagonal", ["#.", ".#"]],
    ["row-boundary", ["..#", "#.."]],
  ] as const)("uses four neighbors without joining %s pixels", (_name, rows) => {
    const fixture = mask("fixture", rows);
    const base = mask("baseline", rows.map((row) => "#".repeat(row.length)));
    expect(() => verify("two-components", fixture, base)).not.toThrow();
  });

  it("rejects three components and empty component sets", () => {
    expect(() => verify("two-components", mask("fixture", ["#.#", "...", "#.."]))).toThrow();
    expect(() => verify("two-components", empty)).toThrow();
  });

  it("is stack-safe and does not mutate a large connected mask", () => {
    const occupancy = new Uint8Array(256 * 256).fill(1);
    const base = { ...baseline, widthPixels: 256, heightPixels: 256, occupancy };
    const fixture = { ...base, fixtureId: "fixture", occupancy: occupancy.slice() };
    expect(() => verify("two-components", fixture, base)).toThrow();
    expect(fixture.occupancy).toEqual(occupancy);
  });

  it.each(["fewer-pixels-same-bounds", "zero-pixels", "fewer-positive-pixels", "two-components", "same-mask", "more-pixels"] as const)(
    "requires a nonempty baseline for %s, avoiding vacuous success", (relation) => {
      expect(() => verify(relation, identical, { ...empty, fixtureId: "baseline" })).toThrow();
      expect(() => verify(relation, empty, { ...empty, fixtureId: "baseline" })).toThrow();
    },
  );

  it.each([
    { widthPixels: 9, heightPixels: 1 },
    { cameraSignature: "different-camera" },
    { cameraSignature: "  " },
    { widthPixels: 0 },
    { widthPixels: 1.5 },
    { heightPixels: Number.NaN },
    { widthPixels: Number.MAX_SAFE_INTEGER, heightPixels: 3 },
    { occupancy: new Uint8Array(8) },
    { occupancy: new Uint8Array(9).fill(2) },
    { occupancy: new Uint8Array(9).fill(255) },
    { occupancy: Array(9).fill(1) as unknown as Uint8Array },
  ])("rejects malformed or incomparable masks: %j", (patch) => {
    expect(() => verify("same-mask", { ...identical, ...patch })).toThrow();
  });

  it("rejects empty claims, missing fixture/view, duplicate mask keys and unknown relations", () => {
    expect(() => assertNativeSemanticPixelClaimsV1({ claims: [], masks: [baseline, identical] })).toThrow();
    expect(() => assertNativeSemanticPixelClaimsV1({ claims: [claim("same-mask")], masks: [] })).toThrow();
    expect(() => assertNativeSemanticPixelClaimsV1({ claims: [claim("same-mask")], masks: [baseline] })).toThrow();
    expect(() => verify("same-mask", { ...identical, viewId: "world-side" })).toThrow();
    expect(() => assertNativeSemanticPixelClaimsV1({ claims: [claim("same-mask")], masks: [baseline, identical, identical] })).toThrow();
    expect(() => verify("unknown" as NativeSemanticPixelClaimV1["relation"], identical)).toThrow();
  });

  it("checks every supplied claim and resolves fixture/view pairs without input-order assumptions", () => {
    const claims = [claim("same-mask"), { ...claim("same-mask"), viewId: "world-top-down" as const }];
    const masks = [
      { ...identical, viewId: "world-top-down" as const },
      baseline,
      { ...baseline, viewId: "world-top-down" as const },
      identical,
    ];
    expect(() => assertNativeSemanticPixelClaimsV1({ claims, masks })).not.toThrow();
    const badMasks = masks.map((item) => item.fixtureId === "fixture" && item.viewId === "world-top-down"
      ? { ...item, occupancy: hollow.occupancy } : item);
    expect(() => assertNativeSemanticPixelClaimsV1({ claims, masks: badMasks })).toThrow(/world-top-down/);
  });
});
