import {
  AnimationClip,
  Group,
  NumberKeyframeTrack,
} from "three";
import { describe, expect, it } from "vitest";
import type { ActionManifest } from "../../contracts/src/index.js";
import {
  ActionRegistry,
  HumanoidActionStateMachine,
  validateActionManifest,
} from "./index.js";

function clip(name: string): AnimationClip {
  return new AnimationClip(name, 1, [
    new NumberKeyframeTrack(".position[x]", [0, 1], [0, 1]),
  ]);
}

const manifest: ActionManifest = {
  version: 1,
  rigId: "test-rig",
  actions: [
    { id: "idle", clip: "Asset Idle v12", loop: true, blendIn: 0.1, speed: 1, rootMotion: "none" },
    { id: "walk", clip: "Vendor Walk", loop: true, blendIn: 0.1, speed: 1, rootMotion: "inPlace" },
    { id: "run", clip: "Vendor Run", loop: true, blendIn: 0.1, speed: 1, rootMotion: "inPlace" },
  ],
};

describe("ActionRegistry", () => {
  it("plays stable ids without exposing source clip names", () => {
    const registry = new ActionRegistry({
      root: new Group(),
      clips: [clip("Asset Idle v12"), clip("Vendor Walk"), clip("Vendor Run")],
      manifest,
    });

    expect(registry.supportedActionIds).toEqual(["idle", "walk", "run"]);
    expect(registry.play("walk")).toBe(true);
    expect(registry.currentActionId).toBe("walk");
    expect(registry.play("source-file-name")).toBe(false);
  });

  it("reports duplicate ids and missing target clips", () => {
    const issues = validateActionManifest([clip("Idle")], {
      version: 1,
      rigId: "test-rig",
      actions: [
        { id: "idle", clip: "Idle", loop: true, blendIn: 0, speed: 1, rootMotion: "none" },
        { id: "idle", clip: "Missing", loop: true, blendIn: 0, speed: 1, rootMotion: "none" },
      ],
    });
    expect(issues.map((issue) => issue.code)).toEqual([
      "DUPLICATE_ACTION_ID",
      "MISSING_CLIP",
    ]);
  });
});

describe("HumanoidActionStateMachine", () => {
  it("adapts legacy grounded and run-threshold inputs to canonical actions", () => {
    const played: string[] = [];
    const machine = new HumanoidActionStateMachine({
      currentActionId: null,
      has: (id) => ["idle", "walk", "run", "jump"].includes(id),
      play: (id) => {
        played.push(id);
        return true;
      },
    });
    machine.update({ grounded: true, horizontalSpeed: 0, runRequested: false });
    machine.update({ grounded: true, horizontalSpeed: 0.081, runRequested: true });
    machine.update({ grounded: true, horizontalSpeed: 3.2, runRequested: true });
    machine.update({ grounded: false, horizontalSpeed: 4, runRequested: true });
    expect(played).toEqual(["idle", "walk", "run", "jump"]);
  });

  it("validates speed through the canonical resolver before airborne priority", () => {
    const machine = new HumanoidActionStateMachine({
      currentActionId: null,
      has: () => true,
      play: () => true,
    });

    expect(() => machine.update({
      grounded: false,
      horizontalSpeed: Number.NaN,
      runRequested: true,
    })).toThrow(RangeError);
  });

  it("preserves missing jump and run clip fallbacks in the legacy adapter", () => {
    const played: string[] = [];
    const available = new Set(["idle", "walk"]);
    const machine = new HumanoidActionStateMachine({
      currentActionId: null,
      has: (id) => available.has(id),
      play: (id) => {
        if (!available.has(id)) return false;
        played.push(id);
        return true;
      },
    });

    machine.update({ grounded: false, horizontalSpeed: 4, runRequested: true });
    expect(played).toEqual(["walk"]);
  });
});
