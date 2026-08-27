import { describe, expect, it } from "vitest";
import type { MountedOnRelationshipStateV1 } from "@whitebox-world/gameplay-contracts";

import { resolveCameraViewTargetContextV1 } from "./camera-view-target-context";

function mounted(
  id: string,
  riderEntityId: string,
  mountEntityId: string,
): MountedOnRelationshipStateV1 {
  return Object.freeze({
    id,
    type: "mountedOn",
    schemaVersion: 1,
    riderEntityId,
    mountEntityId,
    mountSlotId: "stand",
    establishedSimulationTick: 1,
  });
}

describe("Camera ViewTarget relationship context", () => {
  it("keeps an unrelated target outside mounted Camera context", () => {
    expect(resolveCameraViewTargetContextV1("observer", [
      mounted("mounted:b", "rider-b", "board"),
    ])).toEqual({
      controlledEntityId: "observer",
      relationshipContexts: [],
      relationshipRole: "none",
    });
  });

  it("projects the unique Rider context while retaining the Mount ViewTarget", () => {
    expect(resolveCameraViewTargetContextV1("board", [
      mounted("mounted:b", "rider-b", "board"),
    ])).toEqual({
      controlledEntityId: "rider-b",
      relationshipContexts: [{
        id: "mounted:b",
        type: "mountedOn",
        riderEntityId: "rider-b",
        mountEntityId: "board",
        mountSlotId: "stand",
      }],
      relationshipRole: "rider",
    });
  });

  it("projects the same mounted context when the Rider is the ViewTarget", () => {
    expect(resolveCameraViewTargetContextV1("rider-b", [
      mounted("mounted:b", "rider-b", "board"),
    ])).toMatchObject({
      controlledEntityId: "rider-b",
      relationshipRole: "rider",
    });
  });

  it("fails closed instead of guessing a Rider for a shared Mount", () => {
    const result = resolveCameraViewTargetContextV1("bus", [
      mounted("mounted:z", "rider-z", "bus"),
      mounted("mounted:a", "rider-a", "bus"),
    ]);
    expect(result).toMatchObject({
      controlledEntityId: "bus",
      relationshipRole: "none",
    });
    expect(result.relationshipContexts.map((context) => context.id)).toEqual([
      "mounted:a",
      "mounted:z",
    ]);
  });
});
