import { describe, expect, it } from "vitest";

import {
  cameraViewCommandCanonicalBytesV1,
  cameraViewEventCanonicalBytesV1,
  canonicalizeCameraViewCommandV1,
  canonicalizeCameraViewEventV1,
  canonicalizeCameraViewCommandReceiptV1,
  deriveCameraViewCommandHashV1,
  deriveCameraViewCommandReceiptIdV1,
  deriveCameraViewEventIdV1,
  parseCameraViewCommandV1,
  parseCameraViewCommandReceiptV1,
  parseCameraViewEventV1,
} from "./camera-view-contract";

const session = {
  runtimeSessionId: "runtime-1",
  worldSessionId: "world-1",
  cameraEntityId: "camera.local-player",
} as const;

describe("Camera View Command V1", () => {
  it("parses and canonicalizes the closed set/reset command union", () => {
    const setCommand = parseCameraViewCommandV1({
      type: "view.camera-preference.set",
      schemaVersion: 1,
      id: "camera-command-1",
      ...session,
      cameraViewPreference: {
        mode: "camera-rig-profile",
        cameraRigProfileRef: "worldkit://camera-profile/orbit.medium@1",
      },
    });
    const resetCommand = parseCameraViewCommandV1({
      type: "view.camera-preference.reset",
      schemaVersion: 1,
      id: "camera-command-2",
      ...session,
    });

    expect(setCommand).toEqual({
      schemaVersion: 1,
      id: "camera-command-1",
      ...session,
      type: "view.camera-preference.set",
      cameraViewPreference: {
        mode: "camera-rig-profile",
        cameraRigProfileRef: "worldkit://camera-profile/orbit.medium@1",
      },
    });
    expect(resetCommand.type).toBe("view.camera-preference.reset");
    if (setCommand.type !== "view.camera-preference.set") {
      throw new Error("Expected the set command variant.");
    }
    expect(Object.isFrozen(setCommand)).toBe(true);
    expect(Object.isFrozen(setCommand.cameraViewPreference)).toBe(true);
    expect(canonicalizeCameraViewCommandV1(setCommand)).toBe(
      new TextDecoder().decode(cameraViewCommandCanonicalBytesV1(setCommand)),
    );
    expect(deriveCameraViewCommandHashV1(setCommand)).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
  });

  it("rejects aliases, unknown fields, malformed preferences, and accessor input", () => {
    const base = {
      schemaVersion: 1,
      id: "camera-command-invalid",
      ...session,
    };
    for (const input of [
      { ...base, type: "view.set-rig", cameraRigProfileRef: "profile" },
      {
        ...base,
        type: "view.camera-preference.set",
        cameraViewPreference: { mode: "camera-rig-profile", cameraRigProfileRef: "" },
      },
      {
        ...base,
        type: "view.camera-preference.set",
        cameraViewPreference: { mode: "auto", profileRef: "legacy" },
      },
      {
        ...base,
        type: "view.camera-preference.reset",
        cameraViewPreference: { mode: "auto" },
      },
      {
        ...base,
        type: "view.camera-preference.reset",
        unexpected: true,
      },
    ]) {
      expect(() => parseCameraViewCommandV1(input)).toThrow(
        /CameraViewCommandV1/,
      );
    }
    const accessor = { ...base, type: "view.camera-preference.reset" };
    Object.defineProperty(accessor, "cameraEntityId", {
      enumerable: true,
      get: () => "camera.local-player",
    });
    expect(() => parseCameraViewCommandV1(accessor)).toThrow(
      /CameraViewCommandV1/,
    );
  });
});

describe("Camera View Event V1", () => {
  it("parses ordered Selection evidence and preserves the unified sequence", () => {
    const sequence = 7;
    const event = parseCameraViewEventV1({
      type: "camera.selection.changed",
      schemaVersion: 1,
      id: deriveCameraViewEventIdV1(session.worldSessionId, sequence),
      ...session,
      sequence,
      simulationTick: 42,
      previousCameraRigProfileRef: "worldkit://camera-profile/orbit.medium@1",
      activeCameraRigProfileRef: "worldkit://camera-profile/follow.medium@1",
      activeCameraModifierRefs: [
        "worldkit://camera-modifier/mounted-framing@1",
        "worldkit://camera-modifier/sprint-emphasis@1",
      ],
      targetEntityId: "skateboard",
      matchedCameraContextRuleIds: ["mounted", "sprint"],
      fallbackActive: false,
      reason: "context-changed",
    });

    expect(event).toMatchObject({
      type: "camera.selection.changed",
      sequence: 7,
      simulationTick: 42,
      activeCameraModifierRefs: [
        "worldkit://camera-modifier/mounted-framing@1",
        "worldkit://camera-modifier/sprint-emphasis@1",
      ],
      matchedCameraContextRuleIds: ["mounted", "sprint"],
    });
    if (event.type !== "camera.selection.changed") {
      throw new Error("Expected the selection-changed event variant.");
    }
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.activeCameraModifierRefs)).toBe(true);
    expect(canonicalizeCameraViewEventV1(event)).toBe(
      new TextDecoder().decode(cameraViewEventCanonicalBytesV1(event)),
    );
  });

  it("parses target-unbound evidence and rejects invalid identity or list ambiguity", () => {
    const valid = {
      type: "camera.target.unbound",
      schemaVersion: 1,
      id: deriveCameraViewEventIdV1(session.worldSessionId, 8),
      ...session,
      sequence: 8,
      simulationTick: 42,
      previousTargetEntityId: "player",
      reason: "control-released",
    } as const;
    expect(parseCameraViewEventV1(valid)).toEqual(valid);
    expect(() => parseCameraViewEventV1({
      ...valid,
      id: "camera-view-event:other-world:8",
    })).toThrow(/CameraViewEventV1/);
    expect(() => parseCameraViewEventV1({
      type: "camera.selection.changed",
      schemaVersion: 1,
      id: deriveCameraViewEventIdV1(session.worldSessionId, 9),
      ...session,
      sequence: 9,
      simulationTick: 42,
      previousCameraRigProfileRef: "before",
      activeCameraRigProfileRef: "after",
      activeCameraModifierRefs: ["modifier-a", "modifier-a"],
      targetEntityId: "player",
      matchedCameraContextRuleIds: [],
      fallbackActive: false,
      reason: "preference-changed",
    })).toThrow(/CameraViewEventV1/);
  });
});

describe("Camera View Command Receipt V1", () => {
  it("derives a canonical committed receipt with View revision evidence", () => {
    const body = {
      kind: "worldkit-camera-view-command-receipt",
      schemaVersion: 1,
      ...session,
      commandId: "camera-command-1",
      commandHash: `sha256:${"a".repeat(64)}`,
      commandType: "view.camera-preference.set",
      simulationTick: 42,
      status: "committed",
      eventIds: [deriveCameraViewEventIdV1(session.worldSessionId, 7)],
      viewStateRevision: 3,
    } as const;
    const receipt = parseCameraViewCommandReceiptV1({
      id: deriveCameraViewCommandReceiptIdV1(body),
      ...body,
    });
    expect(receipt).toEqual({ id: deriveCameraViewCommandReceiptIdV1(body), ...body });
    expect(canonicalizeCameraViewCommandReceiptV1(receipt)).toContain(
      '"kind":"worldkit-camera-view-command-receipt"',
    );
  });

  it("rejects malformed and self-inconsistent receipts", () => {
    const body = {
      kind: "worldkit-camera-view-command-receipt",
      schemaVersion: 1,
      ...session,
      commandId: "camera-command-2",
      commandHash: `sha256:${"b".repeat(64)}`,
      commandType: "view.camera-preference.reset",
      simulationTick: 42,
      status: "rejected",
      eventIds: [],
      diagnostic: {
        code: "CAMERA_PREFERENCE_NOT_ALLOWED",
        message: "Preference rejected.",
      },
    } as const;
    expect(() => parseCameraViewCommandReceiptV1({ id: "wrong", ...body }))
      .toThrow(/CameraViewCommandReceiptV1/);
    expect(() => deriveCameraViewCommandReceiptIdV1({
      ...body,
      eventIds: ["camera-view-event:world-1:1"],
    })).toThrow(/CameraViewCommandReceiptV1/);
  });
});
