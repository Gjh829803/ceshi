import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { isBabylonNativeBlockIdV1 } from "./profile.js";
import { createBabylonNativeBlockInputParsersV1 } from "./session-input.js";

describe("shared Host and task-feedback input grammar", () => {
  const fail = (code: string, detail: string): never => {
    throw new TypeError(code + ": " + detail);
  };
  const host = createBabylonNativeBlockInputParsersV1(fail);
  const context = vm.createContext({});
  const realm = vm.runInContext(
    "({ objectPrototype: Object.prototype, arrayPrototype: Array.prototype })", context,
  );
  const feedback = createBabylonNativeBlockInputParsersV1(fail, realm);
  const block = '{ id: "gate", shape: "full", paletteRole: "structure", centerMetersXYZ: [0, 0.5, 0] }';
  const collider = '{ id: "gate-solid", colliderGeometrySource: { kind: "block", blockId: "gate" }, traversalBinding: { kind: "not-traversable" }, exposedEdgePolicy: "none" }';
  const evaluate = (source: string, foreign: boolean): unknown =>
    foreign ? vm.runInContext("(" + source + ")", context) : new Function("return (" + source + ")")();
  const error = (read: () => unknown): string => {
    try { read(); return "accepted"; } catch (caught) {
      return (caught as Error).message;
    }
  };

  it.each([
    ["create", "({ ..." + block + ", unexpected: true })", "CREATE_INPUT_INVALID"],
    ["create", "({ ..." + block + ", rotationQuarterTurnsY: undefined })", "CREATE_INPUT_INVALID"],
    ["create", "({ ..." + block + ", visualGroupId: undefined })", "CREATE_INPUT_INVALID"],
    ["create", "({ ..." + block + ", colliderGroupId: null })", "CREATE_INPUT_INVALID"],
    ["create", "({ ..." + block + ', [Symbol("extra")]: true })', "CREATE_INPUT_INVALID"],
    ["create", "Object.defineProperty(" + block + ', "hidden", { value: 1 })', "CREATE_INPUT_INVALID"],
    ["create", "Object.assign(Object.create(null), " + block + ")", "CREATE_INPUT_INVALID"],
    ["create", "Object.assign(Object.create({ custom: true }), " + block + ")", "CREATE_INPUT_INVALID"],
    ["create", "({ ..." + block + ", centerMetersXYZ: [0, , 0] })", "CREATE_INPUT_INVALID"],
    ["create", "({ ..." + block + ', get id() { throw new Error("getter executed"); } })', "CREATE_INPUT_INVALID"],
    ["create", "({ ..." + block + ', id: { toString() { throw new Error("coercion executed"); } } })', "CREATE_INPUT_INVALID"],
    ["grid", '{ idPrefix: "ab", shape: "full", paletteRole: "ground", minimumCenterMetersXYZ: [0, 0.5, 0], repeatCountXYZ: [1, 1, 1] }', "GRID_CREATE_INPUT_INVALID"],
    ["grid", '{ idPrefix: "ground", shape: "full", paletteRole: "ground", minimumCenterMetersXYZ: [0, 0.5, 0], repeatCountXYZ: [9007199254740991, 2, 1] }', "GRID_CREATE_INPUT_INVALID"],
    ["finalize", '{ staticColliders: [,] }', "FINALIZE_INPUT_INVALID"],
    ["finalize", '{ get staticColliders() { throw new Error("getter executed"); } }', "FINALIZE_INPUT_INVALID"],
    ["finalize", "{ staticColliders: [" + collider + ", " + collider + "] }", "COLLIDER_ID_DUPLICATE"],
    ["finalize", "{ staticColliders: [" + collider + ", { ..." + collider + ', id: "other-solid" }] }', "COLLIDER_GEOMETRY_SOURCE_DUPLICATE"],
    ["finalize", "{ staticColliders: [{ ..." + collider + ", frictionRatio: undefined }] }", "COLLIDER_SELECTION_INVALID"],
    ["finalize", "{ staticColliders: [{ ..." + collider + ", restitutionRatio: -0 }] }", "COLLIDER_SELECTION_INVALID"],
  ] as const)("rejects the same %s input in both realms: %s", (kind, source, code) => {
    const parse = (parser: typeof host, input: unknown): unknown => {
      switch (kind) {
        case "create": return parser.parseCreateInput(input);
        case "grid": return parser.parseGridCreateInput(input);
        case "finalize": return parser.parseFinalizeInput(input);
      }
    };
    const hostError = error(() => parse(host, evaluate(source, false)));
    const feedbackError = error(() => parse(feedback, evaluate(source, true)));
    expect(hostError).toContain("WORLDKIT_NATIVE_BLOCK_" + code);
    expect(feedbackError).toBe(hostError);
    expect(feedbackError).not.toContain("executed");
  });

  it("accepts only the explicitly supplied VM realm without relaxing the Host", () => {
    const foreignBlock = evaluate(block, true);
    expect(() => host.parseCreateInput(foreignBlock)).toThrow(/ordinary object prototype/);
    expect(feedback.parseCreateInput(foreignBlock)).toEqual(host.parseCreateInput(evaluate(block, false)));
    const otherRealmBlock = vm.runInNewContext("(" + block + ")");
    expect(() => feedback.parseCreateInput(otherRealmBlock)).toThrow(/ordinary object prototype/);
  });

  it("keeps accepted normalization, grid order and Collider canonical order identical", () => {
    const grid = '{ idPrefix: "ground", shape: "quarter", paletteRole: "ground", minimumCenterMetersXYZ: [0, 0.25, 0.25], rotationQuarterTurnsY: 1, repeatCountXYZ: [2, 2, 2] }';
    expect(feedback.parseGridCreateInput(evaluate(grid, true)))
      .toEqual(host.parseGridCreateInput(evaluate(grid, false)));
    const row = feedback.parseCreateInput(evaluate("({ ..." + block + ", centerMetersXYZ: [0.0000000001, 0.5, 0] })", true));
    expect(row.centerMetersXYZ).toEqual([0, 0.5, 0]);
    expect(row.rotationQuarterTurnsY).toBe(0);
    const other = "{ ..." + collider + ', id: "aaa-solid", colliderGeometrySource: { kind: "block-group", colliderGroupId: "ground-group" } }';
    expect(feedback.parseFinalizeInput(evaluate("{ staticColliders: [" + collider + ", " + other + "] }", true)))
      .toEqual(host.parseFinalizeInput(evaluate("{ staticColliders: [" + other + ", " + collider + "] }", false)));
  });
});

it.each([
  ["abc", true], ["0ab", true], ["tower-p95", true], ["a".repeat(80), true],
  ["ab", false], ["a".repeat(81), false], ["tower-p9.5", false],
  ["Tower", false], ["tower_name", false], ["tower\n", false],
  ["éclair", false], [undefined, false], [null, false], [9.5, false],
])("retains the existing Host Block identifier boundary for %s", (value, expected) => {
  expect(isBabylonNativeBlockIdV1(value)).toBe(expected);
});

interface ProfileModule {
  readonly BABYLON_NATIVE_BLOCK_PALETTE_COLOR_HEX_BY_ROLE_V1: Readonly<{
    ground: "#7F956E";
    route: "#C9A96B";
    structure: "#AEB8C4";
    hazard: "#C74F45";
    "water-like-visual": "#4E91B5";
    "background-mass": "#626B78";
  }>;
}

async function loadProfile(): Promise<ProfileModule> {
  const modulePath = ["./", "profile.js"].join("");
  return import(modulePath) as Promise<ProfileModule>;
}

describe("Babylon Native block semantic palette", () => {
  it("maps every closed role to one stable sRGB hex color", async () => {
    const profile = await loadProfile();

    expect(profile.BABYLON_NATIVE_BLOCK_PALETTE_COLOR_HEX_BY_ROLE_V1)
      .toEqual({
        ground: "#7F956E",
        route: "#C9A96B",
        structure: "#AEB8C4",
        hazard: "#C74F45",
        "water-like-visual": "#4E91B5",
        "background-mass": "#626B78",
      });
    expect(Object.isFrozen(
      profile.BABYLON_NATIVE_BLOCK_PALETTE_COLOR_HEX_BY_ROLE_V1,
    )).toBe(true);
  });
});
