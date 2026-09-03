import { describe, expect, it } from "vitest";

import type { WorldRuntimeSnapshotV4 } from "@whitebox-world/runtime-contracts";

import {
  findLocomotionCapabilityState,
  requireActivePublishedLocomotionV1,
} from "./locomotion-capability-state.js";

function snapshotWithCapability(
  entityId: string,
  capability: WorldRuntimeSnapshotV4["world"]["subjectStatesByEntityId"][string]["capabilityStatesById"][string],
): WorldRuntimeSnapshotV4 {
  return {
    world: {
      subjectStatesByEntityId: {
        [entityId]: {
          entityState: { id: entityId },
          capabilityStatesById: {
            [capability.id]: capability,
          },
        },
      },
    },
  } as unknown as WorldRuntimeSnapshotV4;
}

describe("published locomotion capability", () => {
  it("reads the canonical locomotion capability", () => {
    const snapshot = snapshotWithCapability("g-bot-primary", {
      id: "capability-state:g-bot-primary:locomotion",
      kind: "locomotion-capability-state-v2",
      ownerEntityId: "g-bot-primary",
      locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
      locomotionCapabilityHash: `sha256:${"b".repeat(64)}`,
      locomotion: {
        schemaVersion: 2,
        status: "active",
        mobilityMode: "airborne",
        gait: "none",
        verticalPhase: "rising",
        supportMode: "unsupported",
        movementMedium: "air",
        facingYawRadians: 0.5,
        linearVelocity: { x: 0, y: 2, z: 0 },
        horizontalSpeedMetersPerSecond: 0,
        committedTick: 12,
        phaseEnteredTick: 10,
        transitionSequence: 1,
      },
    });
    expect(findLocomotionCapabilityState(snapshot, "g-bot-primary")?.kind)
      .toBe("locomotion-capability-state-v2");
    expect(requireActivePublishedLocomotionV1(snapshot, "g-bot-primary")).toEqual({
      mode: "airborne",
      movementMedium: "air",
    });
  });

  it("rejects a missing or suspended capability", () => {
    expect(() => requireActivePublishedLocomotionV1(
      snapshotWithCapability("player", {
        id: "capability-state:player:other",
        kind: "other-capability-state",
      } as never),
      "player",
    )).toThrow("Missing locomotion capability state for 'player'.");
    expect(() => requireActivePublishedLocomotionV1(
      snapshotWithCapability("player", {
        id: "capability-state:player:locomotion",
        kind: "locomotion-capability-state-v2",
        ownerEntityId: "player",
        locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
        locomotionCapabilityHash: `sha256:${"c".repeat(64)}`,
        locomotion: {
          schemaVersion: 2,
          status: "suspended",
          suspendedByRelationshipId: "rel-1",
          committedTick: 3,
          transitionSequence: 1,
        },
      }),
      "player",
    )).toThrow("Unexpected suspended locomotion capability for 'player'.");
  });

  it("rejects two locomotion authorities for one Subject", () => {
    const snapshot = snapshotWithCapability("player", {
      id: "capability-state:player:locomotion-a",
      kind: "locomotion-capability-state-v2",
      ownerEntityId: "player",
      locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
      locomotionCapabilityHash: `sha256:${"a".repeat(64)}`,
      locomotion: {
        schemaVersion: 2,
        status: "active",
        mobilityMode: "grounded",
        gait: "idle",
        verticalPhase: "none",
        supportMode: "supported",
        movementMedium: "ground",
        facingYawRadians: 0,
        linearVelocity: { x: 0, y: 0, z: 0 },
        horizontalSpeedMetersPerSecond: 0,
        committedTick: 0,
        phaseEnteredTick: 0,
        transitionSequence: 0,
      },
    });
    const subject = snapshot.world.subjectStatesByEntityId.player!;
    const ambiguous = {
      ...snapshot,
      world: {
        ...snapshot.world,
        subjectStatesByEntityId: {
          player: {
            ...subject,
            capabilityStatesById: {
              ...subject.capabilityStatesById,
              "capability-state:player:locomotion-b": {
                id: "capability-state:player:locomotion-b",
                kind: "locomotion-capability-state-v2",
                ownerEntityId: "player",
                locomotionCapabilityRef:
                  "worldkit://capability/locomotion.ground@1",
                locomotionCapabilityHash: `sha256:${"b".repeat(64)}`,
                locomotion: {
                  schemaVersion: 2,
                  status: "active",
                  mobilityMode: "grounded",
                  gait: "idle",
                  verticalPhase: "none",
                  supportMode: "supported",
                  movementMedium: "ground",
                  facingYawRadians: 0,
                  linearVelocity: { x: 0, y: 0, z: 0 },
                  horizontalSpeedMetersPerSecond: 0,
                  committedTick: 0,
                  phaseEnteredTick: 0,
                  transitionSequence: 0,
                },
              },
            },
          },
        },
      },
    } as WorldRuntimeSnapshotV4;

    expect(() => findLocomotionCapabilityState(ambiguous, "player"))
      .toThrow("Ambiguous locomotion capability state for 'player'.");
  });
});
