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
    expect(resolveCameraViewTargetContextV1({
      controlledEntityId: "controller-owned",
      targetEntityId: "observer",
      mountedRelationships: [mounted("mounted:b", "rider-b", "board")],
    })).toEqual({
      controlledEntityId: "controller-owned",
      targetEntityId: "observer",
      relationshipContexts: [],
    });
  });

  it("keeps committed Mount control truth while projecting its unique Rider context", () => {
    expect(resolveCameraViewTargetContextV1({
      controlledEntityId: "board",
      targetEntityId: "board",
      mountedRelationships: [mounted("mounted:b", "rider-b", "board")],
    })).toEqual({
      controlledEntityId: "board",
      targetEntityId: "board",
      relationshipContexts: [{
        id: "mounted:b",
        type: "mountedOn",
        riderEntityId: "rider-b",
        mountEntityId: "board",
        mountSlotId: "stand",
      }],
    });
  });

  it("projects the same mounted context when the Rider is the ViewTarget", () => {
    expect(resolveCameraViewTargetContextV1({
      controlledEntityId: "rider-b",
      targetEntityId: "rider-b",
      mountedRelationships: [mounted("mounted:b", "rider-b", "board")],
    })).toMatchObject({
      controlledEntityId: "rider-b",
      targetEntityId: "rider-b",
      relationshipContexts: [{
        id: "mounted:b",
        type: "mountedOn",
        riderEntityId: "rider-b",
        mountEntityId: "board",
        mountSlotId: "stand",
      }],
    });
  });

  it("fails closed instead of guessing a Rider for a shared Mount", () => {
    const result = resolveCameraViewTargetContextV1({
      controlledEntityId: "bus",
      targetEntityId: "bus",
      mountedRelationships: [
        mounted("mounted:z", "rider-z", "bus"),
        mounted("mounted:a", "rider-a", "bus"),
      ],
    });
    expect(result).toMatchObject({
      controlledEntityId: "bus",
      targetEntityId: "bus",
    });
    expect(result.relationshipContexts.map((context) => context.id)).toEqual([
      "mounted:a",
      "mounted:z",
    ]);
  });

  it("orders committed relationships by raw UTF-16 code units", () => {
    const result = resolveCameraViewTargetContextV1({
      controlledEntityId: "bus",
      targetEntityId: "bus",
      mountedRelationships: [
        mounted("mounted:a", "rider-a", "bus"),
        mounted("mounted:Z", "rider-z", "bus"),
      ],
    });

    expect(result.relationshipContexts.map((context) => context.id)).toEqual([
      "mounted:Z",
      "mounted:a",
    ]);
  });

  it("preserves distinct committed controlled and target identities", () => {
    const result = resolveCameraViewTargetContextV1({
      controlledEntityId: "rider-a",
      targetEntityId: "board-b",
      mountedRelationships: [
        mounted("mounted:a", "rider-a", "board-a"),
        mounted("mounted:b", "rider-b", "board-b"),
        mounted("mounted:unrelated", "rider-c", "board-c"),
      ],
    });

    expect(result).toMatchObject({
      controlledEntityId: "rider-a",
      targetEntityId: "board-b",
    });
    expect(result.relationshipContexts.map((context) => context.id)).toEqual([
      "mounted:a",
      "mounted:b",
    ]);
  });
});
