import { describe, expect, it } from "vitest";

import {
  parseCameraContextSampleV2,
  parseCameraViewPreferenceV1,
} from "./camera-domain.js";

describe("@whitebox-world/camera public domain contract", () => {
  it("exports admission and deterministic selection as provider-neutral pure functions", async () => {
    const cameraDomain: Record<string, unknown> = await import("./index.js");

    expect(cameraDomain).toMatchObject({
      admitCameraContextProfileV1: expect.any(Function),
      admitCameraViewPreferenceV1: expect.any(Function),
      selectCameraViewV2: expect.any(Function),
    });
    expect(cameraDomain).not.toHaveProperty("ThirdPersonCameraRig");
    expect(cameraDomain).not.toHaveProperty("CameraMovementBasis");
  });

  it("owns the closed, unit-qualified Camera Rig parameter vocabulary", async () => {
    const cameraDomain: Record<string, unknown> = await import("./index.js");

    expect(cameraDomain.CAMERA_RIG_PARAMETER_NAMES_V1).toEqual(
      expect.arrayContaining([
        "distanceMeters",
        "pitchRadians",
        "baseFovDegrees",
        "positionDampingPerSecond",
        "transitionSeconds",
      ]),
    );
    expect(cameraDomain.CAMERA_RIG_PARAMETER_NAMES_V1).toHaveLength(35);
  });

  it("exports committed V2 context and collision-query contracts", async () => {
    const cameraDomain: Record<string, unknown> = await import("./index.js");

    expect(cameraDomain).toMatchObject({
      parseCameraContextSampleV2: expect.any(Function),
      parseCameraGeometryHitV2: expect.any(Function),
      parseCameraGeometryQueryRequestV2: expect.any(Function),
      parseCameraContextRuleV2: expect.any(Function),
      parseCameraViewPreferenceV1: expect.any(Function),
    });
  });
});
const committedCameraContextV2 = {
  schemaVersion: 2,
  semanticAuthorityStatus: "available",
  committedTick: 41,
  controlledEntityId: "g-bot-primary",
  targetEntityId: "g-bot-primary",
  subjectPose: {
    positionMetersXYZ: [1, 2, 3],
    facingYawRadians: 0.5,
  },
  locomotion: {
    schemaVersion: 2,
    status: "active",
    mobilityMode: "airborne",
    gait: "none",
    verticalPhase: "falling",
    supportMode: "unsupported",
    movementMedium: "air",
    facingYawRadians: 0.5,
    linearVelocity: { x: 0, y: -2, z: -1 },
    horizontalSpeedMetersPerSecond: 1,
    committedTick: 41,
    phaseEnteredTick: 39,
    transitionSequence: 5,
  },
  actionSummary: {
    status: "available",
    activeActionRefs: ["worldkit://semantic-action/fall@1"],
    isInterruptible: true,
  },
  environment: {
    relationshipContexts: [],
    socketPositionsMetersXYZById: {
      head: [1, 3.5, 3],
    },
    cameraContextTags: ["outdoor"],
  },
} as const;

describe("CameraContextSampleV2", () => {
  it("parses and deeply freezes committed semantic context", () => {
    const parsed = parseCameraContextSampleV2(committedCameraContextV2);

    expect(parsed).toEqual(committedCameraContextV2);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.subjectPose.positionMetersXYZ)).toBe(true);
    if (parsed.locomotion.status !== "active") throw new Error("Expected active locomotion.");
    expect(Object.isFrozen(parsed.locomotion.linearVelocity)).toBe(true);
    if (parsed.actionSummary.status !== "available") throw new Error("Expected Action authority.");
    expect(Object.isFrozen(parsed.actionSummary.activeActionRefs)).toBe(true);
    expect(Object.isFrozen(parsed.environment.socketPositionsMetersXYZById.head)).toBe(true);
  });

  it("accepts canonical Gameplay Relationship IDs in Camera context", () => {
    const relationshipId = `mounted-on:sha256:${"a".repeat(64)}`;
    const parsed = parseCameraContextSampleV2({
      ...committedCameraContextV2,
      environment: {
        relationshipContexts: [{
          id: relationshipId,
          type: "mountedOn",
          riderEntityId: "rider-primary",
          mountEntityId: "skateboard",
          mountSlotId: "stand",
        }],
        socketPositionsMetersXYZById: {},
        cameraContextTags: [],
      },
    });

    expect(parsed.environment.relationshipContexts).toEqual([{
      id: relationshipId,
      type: "mountedOn",
      riderEntityId: "rider-primary",
      mountEntityId: "skateboard",
      mountSlotId: "stand",
    }]);
  });

  it("canonicalizes Relationship contexts by type then id using raw UTF-16 code units", () => {
    const parsed = parseCameraContextSampleV2({
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        relationshipContexts: [
          {
            id: "mounted:a",
            type: "mountedOn",
            riderEntityId: "rider-a",
            mountEntityId: "mount-a",
            mountSlotId: "stand",
          },
          {
            id: "possessed:Z",
            type: "possessedBy",
            controlledEntityId: "g-bot-primary",
            controllerEntityId: "controller-primary",
          },
          {
            id: "mounted:Z",
            type: "mountedOn",
            riderEntityId: "rider-z",
            mountEntityId: "mount-z",
            mountSlotId: "stand",
          },
          {
            id: "equipped:a",
            type: "equippedAt",
            itemEntityId: "item-primary",
            wearerEntityId: "g-bot-primary",
            equipmentSlotId: "hand",
          },
        ],
      },
    });

    expect(parsed.environment.relationshipContexts.map(({ type, id }) =>
      `${type}:${id}`
    )).toEqual([
      "equippedAt:equipped:a",
      "mountedOn:mounted:Z",
      "mountedOn:mounted:a",
      "possessedBy:possessed:Z",
    ]);
  });

  it("accepts a canonical Gameplay Relationship ID as suspended authority", () => {
    const relationshipId = `mounted-on:sha256:${"b".repeat(64)}`;
    const parsed = parseCameraContextSampleV2({
      ...committedCameraContextV2,
      locomotion: {
        schemaVersion: 2,
        status: "suspended",
        suspendedByRelationshipId: relationshipId,
        committedTick: 41,
        transitionSequence: 6,
      },
      actionSummary: { status: "unavailable" },
    });

    expect(parsed.locomotion).toMatchObject({
      status: "suspended",
      suspendedByRelationshipId: relationshipId,
    });
  });

  it.each([
    ["grounded rising locomotion", {
      ...committedCameraContextV2,
      locomotion: {
        ...committedCameraContextV2.locomotion,
        mobilityMode: "grounded",
        gait: "walk",
        verticalPhase: "rising",
        supportMode: "supported",
        movementMedium: "ground",
      },
    }],
    ["provider-private field", {
      ...committedCameraContextV2,
      babylonCamera: "native",
    }],
    ["provider-private relationship context", {
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        relationshipContexts: [{
          id: "possession-primary",
          type: "possessedBy",
          controlledEntityId: "g-bot-primary",
          controllerEntityId: "controller-primary",
          providerHandle: "native",
        }],
      },
    }],
    ["non-finite pose", {
      ...committedCameraContextV2,
      subjectPose: {
        ...committedCameraContextV2.subjectPose,
        positionMetersXYZ: [1, Number.NaN, 3],
      },
    }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseCameraContextSampleV2(input)).toThrow(
      "closed CameraContextSampleV2 schema",
    );
  });

  it.each([
    ["locomotion Tick mismatch", {
      ...committedCameraContextV2,
      locomotion: { ...committedCameraContextV2.locomotion, committedTick: 40 },
    }],
    ["pose/locomotion facing mismatch", {
      ...committedCameraContextV2,
      subjectPose: { ...committedCameraContextV2.subjectPose, facingYawRadians: 0.75 },
    }],
  ])("rejects %s with the stable uncommitted diagnostic", (_label, input) => {
    expect(() => parseCameraContextSampleV2(input)).toThrow(
      "3C_CAMERA_CONTEXT_UNCOMMITTED",
    );
  });

  it.each([
    ["non-NFC entity id", {
      ...committedCameraContextV2,
      controlledEntityId: "e\u0301ntity",
    }],
    ["ill-formed Action Ref", {
      ...committedCameraContextV2,
      actionSummary: {
        ...committedCameraContextV2.actionSummary,
        activeActionRefs: ["worldkit://semantic-action/fall\ud800@1"],
      },
    }],
    ["non-canonical Action Ref", {
      ...committedCameraContextV2,
      actionSummary: {
        ...committedCameraContextV2.actionSummary,
        activeActionRefs: ["not a semantic action ref"],
      },
    }],
    ["duplicate Action Refs", {
      ...committedCameraContextV2,
      actionSummary: {
        ...committedCameraContextV2.actionSummary,
        activeActionRefs: [
          "worldkit://semantic-action/fall@1",
          "worldkit://semantic-action/fall@1",
        ],
      },
    }],
    ["duplicate relationship ids", {
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        relationshipContexts: [
          {
            id: "relationship-primary",
            type: "possessedBy",
            controlledEntityId: "g-bot-primary",
            controllerEntityId: "controller-primary",
          },
          {
            id: "relationship-primary",
            type: "equippedAt",
            itemEntityId: "camera-primary",
            wearerEntityId: "g-bot-primary",
            equipmentSlotId: "head",
          },
        ],
      },
    }],
    ["duplicate Camera tags", {
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        cameraContextTags: ["outdoor", "outdoor"],
      },
    }],
    ["whitespace Socket id", {
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        socketPositionsMetersXYZById: { "bad socket": [0, 0, 0] },
      },
    }],
    ["non-NFC Socket id", {
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        socketPositionsMetersXYZById: { "cafe\u0301": [0, 0, 0] },
      },
    }],
    ["whitespace Camera tag", {
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        cameraContextTags: ["bad tag"],
      },
    }],
    ["non-NFC Camera tag", {
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        cameraContextTags: ["cafe\u0301"],
      },
    }],
    ["whitespace relationship id", {
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        relationshipContexts: [{
          id: "bad relationship",
          type: "possessedBy",
          controlledEntityId: "g-bot-primary",
          controllerEntityId: "controller-primary",
        }],
      },
    }],
    ["leading-colon relationship id", {
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        relationshipContexts: [{
          id: ":mounted-on-primary",
          type: "mountedOn",
          riderEntityId: "g-bot-primary",
          mountEntityId: "skateboard",
          mountSlotId: "stand",
        }],
      },
    }],
    ["empty-segment relationship id", {
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        relationshipContexts: [{
          id: "mounted-on::sha256",
          type: "mountedOn",
          riderEntityId: "g-bot-primary",
          mountEntityId: "skateboard",
          mountSlotId: "stand",
        }],
      },
    }],
    ["whitespace relationship slot id", {
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        relationshipContexts: [{
          id: "mount-primary",
          type: "mountedOn",
          riderEntityId: "g-bot-primary",
          mountEntityId: "mount-primary",
          mountSlotId: "bad slot",
        }],
      },
    }],
    ["non-canonical relationship entity id", {
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        relationshipContexts: [{
          id: "possession-primary",
          type: "possessedBy",
          controlledEntityId: "bad entity",
          controllerEntityId: "controller-primary",
        }],
      },
    }],
    ["oversized Action set", {
      ...committedCameraContextV2,
      actionSummary: {
        ...committedCameraContextV2.actionSummary,
        activeActionRefs: Array.from(
          { length: 65 },
          (_, index) => `worldkit://semantic-action/action-${index}@1`,
        ),
      },
    }],
    ["oversized Socket map", {
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        socketPositionsMetersXYZById: Object.fromEntries(
          Array.from({ length: 257 }, (_, index) => [`socket-${index}`, [0, 0, 0]]),
        ),
      },
    }],
  ])("rejects hostile or unbounded %s", (_label, input) => {
    expect(() => parseCameraContextSampleV2(input)).toThrow(
      "closed CameraContextSampleV2 schema",
    );
  });

  it("accepts Gameplay-derived mounted relationship ids in Camera Context", () => {
    const relationshipId = `mounted-on:sha256:${"ab".repeat(32)}`;
    const parsed = parseCameraContextSampleV2({
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        relationshipContexts: [{
          id: relationshipId,
          type: "mountedOn",
          riderEntityId: "g-bot-primary",
          mountEntityId: "skateboard",
          mountSlotId: "stand",
        }],
      },
    });

    expect(parsed.environment.relationshipContexts).toEqual([{
      id: relationshipId,
      type: "mountedOn",
      riderEntityId: "g-bot-primary",
      mountEntityId: "skateboard",
      mountSlotId: "stand",
    }]);
  });

  it("accepts Gameplay-derived relationship ids as the suspended authority", () => {
    const relationshipId = `mounted-on:sha256:${"cd".repeat(32)}`;
    const parsed = parseCameraContextSampleV2({
      ...committedCameraContextV2,
      locomotion: {
        schemaVersion: 2,
        status: "suspended",
        suspendedByRelationshipId: relationshipId,
        committedTick: 41,
        transitionSequence: 6,
      },
      actionSummary: { status: "unavailable" },
    });

    expect(parsed.locomotion).toEqual({
      schemaVersion: 2,
      status: "suspended",
      suspendedByRelationshipId: relationshipId,
      committedTick: 41,
      transitionSequence: 6,
    });
  });

  it("accepts the authoritative suspended locomotion branch without fabricated yaw", () => {
    const parsed = parseCameraContextSampleV2({
      ...committedCameraContextV2,
      locomotion: {
        schemaVersion: 2,
        status: "suspended",
        suspendedByRelationshipId: "mounted-on-primary",
        committedTick: 41,
        transitionSequence: 6,
      },
      actionSummary: { status: "unavailable" },
    });

    expect(parsed.locomotion).toEqual({
      schemaVersion: 2,
      status: "suspended",
      suspendedByRelationshipId: "mounted-on-primary",
      committedTick: 41,
      transitionSequence: 6,
    });
    expect(parsed.actionSummary).toEqual({ status: "unavailable" });
  });

  it("rejects the removed transitional semantic-authority seam", () => {
    expect(() => parseCameraContextSampleV2({
      ...committedCameraContextV2,
      semanticAuthorityStatus: "unavailable",
      locomotion: {
        schemaVersion: 2,
        status: "suspended",
        suspendedByRelationshipId: "3c-task6-authority-unavailable",
        committedTick: 41,
        transitionSequence: 0,
      },
      actionSummary: { status: "unavailable" },
      environment: {
        relationshipContexts: [],
        socketPositionsMetersXYZById: {},
        cameraContextTags: [],
      },
    })).toThrow("closed CameraContextSampleV2 schema");
  });

  it.each([
    ["unknown authority status", {
      ...committedCameraContextV2,
      semanticAuthorityStatus: "legacy",
    }],
    ["removed relationship role alias", {
      ...committedCameraContextV2,
      environment: {
        ...committedCameraContextV2.environment,
        relationshipRole: "rider",
      },
    }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseCameraContextSampleV2(input)).toThrow(
      "closed CameraContextSampleV2 schema",
    );
  });

  it("snapshots a hostile Context Proxy once and never reads caller properties", () => {
    const target = structuredClone(committedCameraContextV2) as unknown as Record<string, unknown>;
    const reads: string[] = [];
    const hostile = new Proxy(target, {
      get: (_object, key) => {
        reads.push(String(key));
        throw new Error("CONTEXT_DIRECT_READ");
      },
    });

    const parsed = parseCameraContextSampleV2(hostile);
    target.controlledEntityId = "mutated-after-admission";

    expect(reads).toEqual([]);
    expect(parsed.controlledEntityId).toBe("g-bot-primary");
    expect(Object.isFrozen(parsed)).toBe(true);
  });
});

describe("CameraViewPreferenceV1", () => {
  it.each([
    { mode: "auto" },
    { mode: "first-person" },
    {
      mode: "camera-rig-profile",
      cameraRigProfileRef: "worldkit://camera-profile/follow.medium@1",
    },
  ])("parses and freezes the exact legal shape %#", (input) => {
    const parsed = parseCameraViewPreferenceV1(input);
    expect(parsed).toEqual(input);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    ["legacy extra key", {
      mode: "auto",
      motionKernelRef: "worldkit://motion-kernel/legacy@1",
    }],
    ["invalid mode", { mode: "bogus" }],
    ["missing explicit ref", { mode: "camera-rig-profile" }],
    ["extraneous auto ref", {
      mode: "auto",
      cameraRigProfileRef: "worldkit://camera-profile/follow.medium@1",
    }],
    ["extraneous first-person ref", {
      mode: "first-person",
      cameraRigProfileRef: "worldkit://camera-profile/follow.medium@1",
    }],
    ["non-canonical ref", {
      mode: "camera-rig-profile",
      cameraRigProfileRef: "follow.medium",
    }],
    ["non-NFC ref", {
      mode: "camera-rig-profile",
      cameraRigProfileRef: "worldkit://camera-profile/cafe\u0301@1",
    }],
    ["symbol key", Object.assign({ mode: "auto" }, { [Symbol("legacy")]: true })],
    ["accessor", Object.defineProperty({ mode: "auto" }, "legacy", {
      enumerable: true,
      get: () => { throw new Error("PREFERENCE_ACCESSOR_READ"); },
    })],
  ])("rejects %s", (_label, input) => {
    expect(() => parseCameraViewPreferenceV1(input)).toThrow(
      "closed CameraViewPreferenceV1 schema",
    );
  });

  it("fails a throwing Proxy closed without leaking the provider error", () => {
    const hostile = new Proxy({ mode: "auto" }, {
      getPrototypeOf: () => { throw new Error("PREFERENCE_PROXY_REFLECTION"); },
    });
    expect(() => parseCameraViewPreferenceV1(hostile)).toThrow(
      "closed CameraViewPreferenceV1 schema",
    );
  });
});
