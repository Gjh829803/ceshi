import { describe, expect, it } from "vitest";

import {
  parseCameraCollisionQueryResultV1,
  parseCameraCollisionQueryRequestV1,
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
      parseCameraCollisionQueryResultV1: expect.any(Function),
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
    relationshipRole: "none",
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

  it("admits only an explicitly unavailable neutral transitional authority sample", () => {
    const parsed = parseCameraContextSampleV2({
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
        relationshipRole: "none",
        relationshipContexts: [],
        socketPositionsMetersXYZById: {},
        cameraContextTags: [],
      },
    });

    expect(parsed.semanticAuthorityStatus).toBe("unavailable");
    expect(parsed.environment).toEqual({
      relationshipRole: "none",
      relationshipContexts: [],
      socketPositionsMetersXYZById: {},
      cameraContextTags: [],
    });
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    ["unknown authority status", {
      ...committedCameraContextV2,
      semanticAuthorityStatus: "legacy",
    }],
    ["active unavailable locomotion", {
      ...committedCameraContextV2,
      semanticAuthorityStatus: "unavailable",
    }],
    ["available unavailable Action", {
      ...committedCameraContextV2,
      semanticAuthorityStatus: "unavailable",
      locomotion: {
        schemaVersion: 2,
        status: "suspended",
        suspendedByRelationshipId: "3c-task6-authority-unavailable",
        committedTick: 41,
        transitionSequence: 0,
      },
    }],
    ["relationship role in unavailable authority", {
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
        relationshipRole: "rider",
        relationshipContexts: [],
        socketPositionsMetersXYZById: {},
        cameraContextTags: [],
      },
    }],
    ["relationship Context in unavailable authority", {
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
        relationshipRole: "none",
        relationshipContexts: [{
          id: "possession-primary",
          type: "possessedBy",
          controlledEntityId: "g-bot-primary",
          controllerEntityId: "controller-primary",
        }],
        socketPositionsMetersXYZById: {},
        cameraContextTags: [],
      },
    }],
    ["Socket in unavailable authority", {
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
        relationshipRole: "none",
        relationshipContexts: [],
        socketPositionsMetersXYZById: { head: [1, 2, 3] },
        cameraContextTags: [],
      },
    }],
    ["tag in unavailable authority", {
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
        relationshipRole: "none",
        relationshipContexts: [],
        socketPositionsMetersXYZById: {},
        cameraContextTags: ["sprint"],
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

describe("CameraCollisionQueryRequestV1", () => {
  const request = {
    schemaVersion: 1,
    committedTick: 41,
    fromMetersXYZ: [0, 2, 0],
    toMetersXYZ: [0, 2, -4],
    radiusMeters: 0.25,
    excludedEntityIds: ["g-bot-primary"],
  } as const;

  it("strictly parses and deeply freezes a positive-radius request", () => {
    const parsed = parseCameraCollisionQueryRequestV1(request);
    expect(parsed).toEqual(request);
    expect(Object.isFrozen(parsed.fromMetersXYZ)).toBe(true);
    expect(Object.isFrozen(parsed.excludedEntityIds)).toBe(true);
  });

  it.each([
    ["zero radius", { ...request, radiusMeters: 0 }],
    ["non-finite radius", { ...request, radiusMeters: Number.NaN }],
    ["sparse vector", { ...request, fromMetersXYZ: new Array(3) }],
    ["extra-key ids", { ...request, excludedEntityIds: Object.assign([], { provider: true }) }],
    ["duplicate excluded ids", {
      ...request,
      excludedEntityIds: ["g-bot-primary", "g-bot-primary"],
    }],
    ["non-NFC excluded id", {
      ...request,
      excludedEntityIds: ["g-bot-e\u0301"],
    }],
    ["oversized excluded ids", {
      ...request,
      excludedEntityIds: Array.from({ length: 65 }, (_, index) => `entity-${index}`),
    }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseCameraCollisionQueryRequestV1(input)).toThrow(
      "closed CameraCollisionQueryRequestV1 schema",
    );
  });
});

describe("CameraCollisionQueryResultV1", () => {
  const request = {
    schemaVersion: 1,
    committedTick: 41,
    fromMetersXYZ: [0, 0, 0],
    toMetersXYZ: [0, 0, 4],
    radiusMeters: 0.5,
    excludedEntityIds: ["g-bot-primary"],
  } as const;

  it.each([
    ["no-hit approximation", {
      schemaVersion: 1,
      quality: "ray-fan-approximation",
      hit: false,
    }],
    ["exact hit", {
      schemaVersion: 1,
      quality: "exact-sphere-sweep",
      hit: true,
      distanceMeters: 2.5,
      positionMetersXYZ: [0, 1, 2.5],
      normalXYZ: [0, 0, -1],
      hitEntityId: "wall-primary",
    }],
    ["provider hit with explicitly unavailable normal", {
      schemaVersion: 1,
      quality: "ray-fan-approximation",
      hit: true,
      distanceMeters: 2.5,
      positionMetersXYZ: [0, 1, 2.5],
      hitEntityId: "wall-primary",
    }],
  ])("parses and freezes %s", (_label, result) => {
    const parsed = parseCameraCollisionQueryResultV1(result);

    expect(parsed).toEqual(result);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("validates one safe Camera-center hit against its query arm", () => {
    const parsed = parseCameraCollisionQueryResultV1({
      schemaVersion: 1,
      quality: "ray-fan-approximation",
      hit: true,
      distanceMeters: 2,
      positionMetersXYZ: [0, 0, 2],
      normalXYZ: [0, 0, -1],
      hitEntityId: "wall-primary",
    }, request);

    expect(parsed).toMatchObject({
      hit: true,
      distanceMeters: 2,
      positionMetersXYZ: [0, 0, 2],
    });
  });

  it("validates the supplied request even when the provider reports no hit", () => {
    expect(() => parseCameraCollisionQueryResultV1({
      schemaVersion: 1,
      quality: "ray-fan-approximation",
      hit: false,
    }, {
      ...request,
      committedTick: -1,
    })).toThrow("closed CameraCollisionQueryRequestV1 schema");
  });

  it.each([
    ["hit details on no-hit", {
      schemaVersion: 1,
      quality: "ray-fan-approximation",
      hit: false,
      distanceMeters: 1,
    }],
    ["non-finite hit", {
      schemaVersion: 1,
      quality: "exact-sphere-sweep",
      hit: true,
      distanceMeters: Number.POSITIVE_INFINITY,
      positionMetersXYZ: [0, 0, 0],
      normalXYZ: [0, 1, 0],
      hitEntityId: "wall-primary",
    }],
    ["non-unit normal", {
      schemaVersion: 1,
      quality: "ray-fan-approximation",
      hit: true,
      distanceMeters: 2,
      positionMetersXYZ: [0, 0, 2],
      normalXYZ: [0, 0, -2],
      hitEntityId: "wall-primary",
    }],
    ["non-NFC hit Entity", {
      schemaVersion: 1,
      quality: "ray-fan-approximation",
      hit: true,
      distanceMeters: 2,
      positionMetersXYZ: [0, 0, 2],
      normalXYZ: [0, 0, -1],
      hitEntityId: "wa\u0301ll-primary",
    }],
  ])("rejects %s", (_label, result) => {
    expect(() => parseCameraCollisionQueryResultV1(result)).toThrow(
      "closed CameraCollisionQueryResultV1 schema",
    );
  });

  it.each([
    ["distance beyond arm", {
      schemaVersion: 1,
      quality: "ray-fan-approximation",
      hit: true,
      distanceMeters: 5,
      positionMetersXYZ: [0, 0, 5],
      normalXYZ: [0, 0, -1],
      hitEntityId: "wall-primary",
    }],
    ["longitudinal position mismatch", {
      schemaVersion: 1,
      quality: "ray-fan-approximation",
      hit: true,
      distanceMeters: 2,
      positionMetersXYZ: [0, 0, 1],
      normalXYZ: [0, 0, -1],
      hitEntityId: "wall-primary",
    }],
    ["position is not the safe Camera center", {
      schemaVersion: 1,
      quality: "ray-fan-approximation",
      hit: true,
      distanceMeters: 2,
      positionMetersXYZ: [0.6, 0, 2],
      normalXYZ: [0, 0, -1],
      hitEntityId: "wall-primary",
    }],
  ])("rejects request-incoherent %s", (_label, result) => {
    expect(() => parseCameraCollisionQueryResultV1(result, request)).toThrow(
      "closed CameraCollisionQueryResultV1 schema",
    );
  });
});
