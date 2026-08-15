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
  it("selects idle, walk and run through stable action ids", () => {
    const played: string[] = [];
    const machine = new HumanoidActionStateMachine({
      currentActionId: null,
      has: (id) => ["idle", "walk", "run"].includes(id),
      play: (id) => {
        played.push(id);
        return true;
      },
    });
    machine.update({ grounded: true, horizontalSpeed: 0, runRequested: false });
    machine.update({ grounded: true, horizontalSpeed: 1.5, runRequested: false });
    machine.update({ grounded: true, horizontalSpeed: 4, runRequested: true });
    expect(played).toEqual(["idle", "walk", "run"]);
  });
});
