import { describe, expect, it } from "vitest";

import { normalizeAuthoringSpecV4 } from "@whitebox-world/authoring";
import { createValidAuthoringSpecV4 } from "@whitebox-world/authoring/testing";
import {
  CORE_CONTROL_FEATURE_REF,
  CORE_SEMANTIC_ACTION_FEATURE_REF,
  MOUNTED_RELATIONSHIP_FEATURE_REF,
} from "@whitebox-world/gameplay";

import {
  MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
  MOUNTED_SKATEBOARD_S1_DISMOUNT_ACTION_REF,
  MOUNTED_SKATEBOARD_S1_MOUNT_ACTION_REF,
  augmentMountedSkateboardS1AuthoringSpecV1,
  createMountedSkateboardS1GameplayResourcesV1,
  mountedSkateboardS1Scene,
} from "./mounted-skateboard-s1.js";

describe("mounted skateboard S1 Playground fixture", () => {
  it("adds a separate G Bot Rider and primitive board with one stand slot", () => {
    const source = augmentMountedSkateboardS1AuthoringSpecV1(
      createValidAuthoringSpecV4(),
    );
    const boardDefinition = source.resources.subjectDefinitions.find(
      ({ id }) => id === "skateboard.s1",
    );

    expect(mountedSkateboardS1Scene.id).toBe("mounted-skateboard-s1");
    expect(source.startup.controlledEntityId).toBe("player");
    expect(source.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "player",
        kind: "subject",
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@2",
      }),
      expect.objectContaining({
        id: MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
        kind: "subject",
        subjectDefinitionRef:
          "package://subject-definition/skateboard.s1@1",
      }),
    ]));
    expect(boardDefinition?.mountSlots).toEqual([
      expect.objectContaining({
        id: "stand",
        mode: "stand",
        mountSocketId: "MountStand",
      }),
    ]);
    expect(boardDefinition?.visualParts.map(({ id }) => id)).toEqual([
      "body.support-capsule",
      "deck",
      "wheel.back-left",
      "wheel.back-right",
      "wheel.front-left",
      "wheel.front-right",
    ]);
    expect(source.relationships).toEqual([]);
  });

  it("locks the two immediate Actions, three Features, and exact Request bytes", () => {
    const normalized = normalizeAuthoringSpecV4(
      augmentMountedSkateboardS1AuthoringSpecV1(createValidAuthoringSpecV4()),
    );
    expect(normalized.ok, JSON.stringify(normalized.diagnostics)).toBe(true);
    if (!normalized.ok || normalized.value === undefined) return;

    expect(
      normalized.value.resources.subjectDefinitions.find(
        ({ subjectDefinitionRef }) =>
          subjectDefinitionRef ===
          "worldkit://subject-definition/humanoid.g-bot@2",
      )?.sockets.map(({ id }) => id),
    ).toContain("FootAlignment");

    const resources = createMountedSkateboardS1GameplayResourcesV1(
      normalized.value,
    );
    expect(
      resources.gameplayBootstrap.featureResourceLocks.map(
        ({ resourceRef }) => resourceRef,
      ),
    ).toEqual([
      CORE_CONTROL_FEATURE_REF,
      CORE_SEMANTIC_ACTION_FEATURE_REF,
      MOUNTED_RELATIONSHIP_FEATURE_REF,
    ]);
    expect(
      resources.gameplayBootstrap.semanticActionDefinitions.map(
        ({ resourceRef }) => resourceRef,
      ),
    ).toEqual([
      MOUNTED_SKATEBOARD_S1_DISMOUNT_ACTION_REF,
      MOUNTED_SKATEBOARD_S1_MOUNT_ACTION_REF,
    ]);
    for (const request of resources.actionRequests) {
      expect(resources.gameplayActionRequestResolver(
        request.resourceRef,
        request.contentHash,
      )?.actionRequestBytes).toEqual(request.canonicalBytes);
    }
    expect(resources.gameplayActionRequestResolver(
      resources.actionRequests[0]!.resourceRef,
      `sha256:${"0".repeat(64)}`,
    )).toBeUndefined();
  });
});
