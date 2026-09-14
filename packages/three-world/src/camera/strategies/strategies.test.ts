import { prepareCameraIntent } from "./evaluation";
import { composeCameraAtPosition } from "../composition";
import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import {
  resolveCameraConfiguration,
  type CameraViewConfiguration,
} from "../../config/camera/index";
import {
  evaluateThirdPerson as evaluateThirdPersonPose,
  createOpeningReference,
} from "./third-person";
import { evaluateFirstPerson as evaluateFirstPersonPose } from "./first-person";
import { evaluateShoulder as evaluateShoulderPose } from "./shoulder";
import type { CameraSubjectFacts } from "../subject";

const subject: CameraSubjectFacts = {
  id: "player",
  generation: 1,
  kind: "actor",
  positionWorldMetersXYZ: [10, 0, 0],
  geometryQuaternionWorldXYZW: [0, 0, 0, 1],
  geometryScaleXYZ: [2, 3, 4],
  semanticQuaternionWorldXYZW: [0, 0, 0, 1],
  speedMetersPerSecond: 0,
  body: { minimumHeightMeters: 0, maximumHeightMeters: 2 },
  eyeWorldMetersXYZ: [10, 1.7, 0],
  seatWorldMetersXYZ: [10, 1, 0],
};
function config(view: CameraViewConfiguration) {
  return resolveCameraConfiguration(
    {
      kind: "world-camera",
      schemaVersion: 1,
      defaultViewId: "main",
      binding: { targetEntityId: "player" },
      views: { main: view },
    },
    {
      subjectId: "player",
      subjectGeneration: 1,
      subjectKind: "actor",
      availableAnchors: ["eye", "seat"],
      body: subject.body!,
      headingAvailable: true,
    },
  );
}
const third = () =>
  config({
    kind: "third-person",
    overrides: {
      position: { distanceMeters: 4, anchor: { kind: "origin" } },
      orientation: { initialPitchRadians: 0 },
    },
  });
const close = (a: readonly number[], b: readonly number[]) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 8));
describe("pure camera strategy geometry", () => {
  it("places a four metre arm at literal yaw and pitch and leaves all input untouched", () => {
    const configuration = third();
    if (configuration.kind !== "third-person") throw new Error();
    const input = {
      subject,
      configuration,
      deltaSeconds: 0,
      intent: {
        yawRadians: Math.PI / 2,
        pitchRadians: 0,
        distanceMeters: 4,
        secondsSinceOrbit: 0,
      },
    };
    const before = JSON.stringify(input);
    const result = evaluateThirdPerson(input);
    close(result.proposal.positionWorldMetersXYZ, [14, 0, 0]);
    close(
      new Vector3(0, 0, -1)
        .applyQuaternion(new Quaternion(...result.proposal.quaternionWorldXYZW))
        .toArray(),
      [-1, 0, 0],
    );
    expect(evaluateThirdPerson(input)).toEqual(result);
    expect(JSON.stringify(input)).toBe(before);
  });
  it("applies local geometry scale once and metric offsets without scale", () => {
    const configuration = config({
      kind: "third-person",
      overrides: {
        position: {
          distanceMeters: 0,
          anchor: { kind: "subject-local", positionMetersXYZ: [1, 1, 1] },
          anchorOffset: { space: "subject", offsetMetersXYZ: [1, 1, 1] },
        },
      },
    });
    if (configuration.kind !== "third-person") throw new Error();
    close(
      evaluateThirdPerson({ subject, configuration, deltaSeconds: 0 }).proposal
        .positionWorldMetersXYZ,
      [13, 4, 5],
    );
  });
  it("keeps zero arm orientation finite near vertical", () => {
    const configuration = config({
      kind: "third-person",
      overrides: {
        position: { distanceMeters: 0, anchor: { kind: "origin" } },
        orientation: { pitchLimitsRadians: { kind: "unbounded" } },
      },
    });
    if (configuration.kind !== "third-person") throw new Error();
    const result = evaluateThirdPerson({
      subject,
      configuration,
      deltaSeconds: 0,
      intent: {
        yawRadians: 0.7,
        pitchRadians: Math.PI / 2,
        distanceMeters: 0,
        secondsSinceOrbit: 0,
      },
    });
    close(result.proposal.positionWorldMetersXYZ, [10, 0, 0]);
    expect(result.proposal.quaternionWorldXYZW.every(Number.isFinite)).toBe(
      true,
    );
  });
  it("uses eye and shoulder anchors without a second model scale", () => {
    const first = config({ kind: "first-person" });
    const shoulder = config({
      kind: "shoulder",
      overrides: { orientation: { initialPitchRadians: 0 } },
    });
    if (first.kind !== "first-person" || shoulder.kind !== "shoulder")
      throw new Error();
    close(
      evaluateFirstPerson({ subject, configuration: first, deltaSeconds: 0 })
        .proposal.positionWorldMetersXYZ,
      [10, 1.7, 0],
    );
    close(
      evaluateShoulder({ subject, configuration: shoulder, deltaSeconds: 0 })
        .proposal.positionWorldMetersXYZ,
      [10.4, 1.7, 2],
    );
    const { eyeWorldMetersXYZ: _, ...withoutEye } = subject;
    expect(() =>
      evaluateFirstPerson({
        subject: withoutEye,
        configuration: first,
        deltaSeconds: 0,
      }),
    ).toThrow(/eye/);
  });
  it("preserves opening independently of inactive anchor, pitch and distance", () => {
    const configuration = config({
      kind: "third-person",
      overrides: { framing: { kind: "preserve-opening" } },
      opening: {
        positionWorldMetersXYZ: [10, 0, 0],
        lookAtWorldMetersXYZ: [11, 0, 0],
        fovDegrees: 50,
      },
    });
    if (configuration.kind !== "third-person") throw new Error();
    const opening = createOpeningReference(subject, configuration);
    const result = evaluateThirdPerson({
      subject: { ...subject, positionWorldMetersXYZ: [20, 0, 0] },
      configuration,
      opening,
      deltaSeconds: 0,
    });
    close(result.proposal.positionWorldMetersXYZ, [20, 0, 0]);
    close(
      new Vector3(0, 0, -1)
        .applyQuaternion(new Quaternion(...result.proposal.quaternionWorldXYZW))
        .toArray(),
      [1, 0, 0],
    );
    expect(result.proposal.lens.verticalFovDegrees).toBe(50);
  });
});
describe("independent fixed history channels", () => {
  it("smooths translation and body anchor independently, with dt=0 and immediate response", () => {
    const configuration = config({
      kind: "third-person",
      overrides: {
        position: {
          distanceMeters: 0,
          anchor: { kind: "body", heightRatio: 1 },
          subjectTranslationHalfLifeSeconds: 1,
          anchorHalfLifeSeconds: 0,
        },
      },
    });
    if (configuration.kind !== "third-person") throw new Error();
    const initial = evaluateThirdPerson({
      subject,
      configuration,
      deltaSeconds: 0,
    });
    const moved = {
      ...subject,
      positionWorldMetersXYZ: [20, 0, 0] as const,
      body: { minimumHeightMeters: 0, maximumHeightMeters: 3 },
    };
    const input = {
      subject: moved,
      configuration,
      history: initial.history,
      intent: initial.intent,
    };
    close(
      evaluateThirdPerson({ ...input, deltaSeconds: 0 }).proposal
        .positionWorldMetersXYZ,
      [10, 3, 0],
    );
    close(
      evaluateThirdPerson({ ...input, deltaSeconds: 1 }).proposal
        .positionWorldMetersXYZ,
      [15, 3, 0],
    );
  });
  it("applies explicit zoom before the combined distance response and Cartesian arm", () => {
    const configuration = config({
      kind: "third-person",
      overrides: {
        position: {
          anchor: { kind: "origin" },
          distanceMeters: 4,
          armHalfLifeSeconds: 1,
        },
        orientation: { initialPitchRadians: 0 },
        zoom: { halfLifeSeconds: 1 },
        effects: {
          speedDistance: {
            enabled: true,
            fullEffectSpeedMetersPerSecond: 10,
            maximumOffsetMeters: 4,
            extendHalfLifeSeconds: 1,
            retractHalfLifeSeconds: 2,
          },
          speedFov: {
            enabled: true,
            fullEffectSpeedMetersPerSecond: 10,
            maximumOffsetDegrees: 10,
            halfLifeSeconds: 1,
          },
        },
      },
    });
    if (configuration.kind !== "third-person") throw new Error();
    const initial = evaluateThirdPerson({
      subject,
      configuration,
      deltaSeconds: 0,
    });
    const next = evaluateThirdPerson({
      subject: { ...subject, speedMetersPerSecond: 10 },
      configuration,
      history: initial.history,
      intent: { ...initial.intent, distanceMeters: 8 },
      deltaSeconds: 1,
    });
    expect(next.history.zoomDistanceMeters).toBe(6);
    expect(next.history.speedDistanceMeters).toBe(2);
    expect(next.proposal.positionWorldMetersXYZ[2]).toBe(5.5);
    expect(next.proposal.lens.verticalFovDegrees).toBe(63);
    const retract = evaluateThirdPerson({
      subject,
      configuration,
      history: next.history,
      intent: next.intent,
      deltaSeconds: 2,
    });
    expect(retract.history.speedDistanceMeters).toBe(1);
  });
  it("waits for orbit delay and takes the short yaw arc across pi", () => {
    const configuration = config({
      kind: "third-person",
      overrides: {
        orientation: { recenter: { delaySeconds: 1, yawHalfLifeSeconds: 1 } },
      },
    });
    if (configuration.kind !== "third-person") throw new Error();
    const turning = {
      ...subject,
      speedMetersPerSecond: 2,
      semanticQuaternionWorldXYZW: new Quaternion()
        .setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI + 0.1)
        .toArray(),
    };
    const intent = {
      yawRadians: Math.PI - 0.1,
      pitchRadians: 0.3,
      distanceMeters: 4,
      secondsSinceOrbit: 0,
    };
    const waiting = evaluateThirdPerson({
      subject: turning,
      configuration,
      intent,
      deltaSeconds: 1,
    });
    expect(waiting.intent.yawRadians).toBe(intent.yawRadians);
    const centered = evaluateThirdPerson({
      subject: turning,
      configuration,
      intent: waiting.intent,
      history: waiting.history,
      deltaSeconds: 1,
    });
    expect(centered.intent.yawRadians).toBeCloseTo(Math.PI);
    expect(centered.intent.pitchRadians).toBe(0.3);
    const { semanticQuaternionWorldXYZW: _, ...withoutHeading } = turning;
    const missing = evaluateThirdPerson({
      subject: withoutHeading,
      configuration,
      intent,
      deltaSeconds: 5,
    });
    expect(missing.intent.yawRadians).toBe(intent.yawRadians);
  });
  it.each(["world", "heading", "subject"] as const)(
    "uses %s offsets without semantic correction of geometry",
    (space) => {
      const configuration = config({
        kind: "third-person",
        overrides: {
          position: {
            distanceMeters: 0,
            anchor: { kind: "origin" },
            anchorOffset: { space, offsetMetersXYZ: [1, 0, 0] },
          },
        },
      });
      if (configuration.kind !== "third-person") throw new Error();
      const rotated = {
        ...subject,
        semanticQuaternionWorldXYZW: new Quaternion()
          .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
          .toArray(),
      };
      close(
        evaluateThirdPerson({
          subject: rotated,
          configuration,
          deltaSeconds: 0,
        }).proposal.positionWorldMetersXYZ,
        space === "heading" ? [10, 0, -1] : [11, 0, 0],
      );
    },
  );
  it("rotates subject-up arms and first-person roll only by their declared semantics", () => {
    const rotation = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      Math.PI / 2,
    );
    const rolled = {
      ...subject,
      semanticQuaternionWorldXYZW: rotation.toArray(),
    };
    for (const ratio of [0, 0.5, 1]) {
      const configuration = config({
        kind: "first-person",
        overrides: {
          orientation: {
            referenceFrame: "subject-up",
            rollInheritanceRatio: ratio,
          },
        },
      });
      if (configuration.kind !== "first-person") throw new Error();
      const result = evaluateFirstPerson({
        subject: rolled,
        configuration,
        deltaSeconds: 0,
      });
      expect(
        new Quaternion(...result.proposal.quaternionWorldXYZW).angleTo(
          new Quaternion().setFromAxisAngle(
            new Vector3(0, 0, 1),
            (Math.PI / 2) * ratio,
          ),
        ),
      ).toBeLessThan(1e-7);
    }
  });
  it("rejects cross-generation history and invalid delta", () => {
    const configuration = third();
    if (configuration.kind !== "third-person") throw new Error();
    const initial = evaluateThirdPerson({
      subject,
      configuration,
      deltaSeconds: 0,
    });
    expect(() =>
      evaluateThirdPerson({
        subject,
        configuration,
        history: { ...initial.history, subjectGeneration: 2 },
        deltaSeconds: 1,
      }),
    ).toThrow(/IDENTITY/);
    expect(() =>
      evaluateThirdPerson({ subject, configuration, deltaSeconds: Number.NaN }),
    ).toThrow(/DELTA/);
  });
});
it("keeps the target centered while the arm smooths an orbit", () => {
  const configuration = third();
  if (configuration.kind !== "third-person") throw new Error();
  const initial = evaluateThirdPerson({
    subject,
    configuration,
    deltaSeconds: 0,
  });
  const result = evaluateThirdPerson({
    subject,
    configuration,
    history: initial.history,
    intent: { ...initial.intent, yawRadians: Math.PI / 2 },
    deltaSeconds: 0.1,
  });
  const forward = new Vector3(0, 0, -1).applyQuaternion(
    new Quaternion(...result.proposal.quaternionWorldXYZW),
  );
  const ray = new Vector3(...result.proposal.pivotWorldMetersXYZ)
    .sub(new Vector3(...result.proposal.positionWorldMetersXYZ))
    .normalize();
  expect(forward.angleTo(ray)).toBeLessThan(1e-8);
});
it("retains the last horizon through a vertical first-person sample", () => {
  const configuration = config({
    kind: "first-person",
    overrides: {
      orientation: {
        rollInheritanceRatio: 0,
        pitchLimitsRadians: { kind: "unbounded" },
      },
    },
  });
  if (configuration.kind !== "first-person") throw new Error();
  const initial = evaluateFirstPerson({
    subject,
    configuration,
    intent: {
      yawRadians: 0.7,
      pitchRadians: 1.5,
      distanceMeters: 0,
      secondsSinceOrbit: 0,
    },
    deltaSeconds: 0,
  });
  const pole = evaluateFirstPerson({
    subject,
    configuration,
    intent: { ...initial.intent, pitchRadians: Math.PI / 2 },
    history: initial.history,
    deltaSeconds: 0.1,
  });
  expect(pole.history.horizonQuaternionWorldXYZW).toEqual(
    initial.history.horizonQuaternionWorldXYZW,
  );
  expect(pole.proposal.quaternionWorldXYZW.every(Number.isFinite)).toBe(true);
});
describe("opening angle admission", () => {
  const opening = {
    positionWorldMetersXYZ: [10, 4, 0] as const,
    lookAtWorldMetersXYZ: [10, 0, 0] as const,
    upWorldXYZ: [0, 0, -1] as const,
    fovDegrees: 50,
  };
  it("preserves a vertical opening with unbounded SDK angles", () => {
    const configuration = config({
      kind: "third-person",
      overrides: { framing: { kind: "preserve-opening" } },
      opening,
    });
    if (configuration.kind !== "third-person") throw new Error();
    const reference = createOpeningReference(subject, configuration);
    const result = evaluateThirdPerson({
      subject,
      configuration,
      opening: reference,
      deltaSeconds: 0,
    });
    close(result.proposal.positionWorldMetersXYZ, [10, 4, 0]);
    close(
      new Vector3(0, 0, -1)
        .applyQuaternion(new Quaternion(...result.proposal.quaternionWorldXYZW))
        .toArray(),
      [0, -1, 0],
    );
  });
  it("rejects explicit angle bounds that exclude the actual opening reference", () => {
    const configuration = config({
      kind: "third-person",
      overrides: {
        framing: { kind: "preserve-opening" },
        orientation: {
          pitchLimitsRadians: {
            kind: "bounded",
            minimumRadians: -1,
            maximumRadians: 1,
          },
        },
      },
      opening,
    });
    if (configuration.kind !== "third-person") throw new Error();
    expect(() => createOpeningReference(subject, configuration)).toThrow(
      /views\/main\/orientation\/pitchLimitsRadians/,
    );
  });
  it("does not discard an incompatible partial bounded branch", () => {
    expect(() =>
      config({
        kind: "third-person",
        overrides: {
          framing: { kind: "preserve-opening" },
          orientation: { pitchLimitsRadians: { maximumRadians: 1 } },
        },
        opening,
      }),
    ).toThrow();
  });
});
it("checks opening bounds in subject reference space and preserves inherited partial bounds", () => {
  const rotation = new Quaternion().setFromAxisAngle(
    new Vector3(0, 0, 1),
    Math.PI / 2,
  );
  const rotated = {
    ...subject,
    semanticQuaternionWorldXYZW: rotation.toArray(),
  };
  const configuration = resolveCameraConfiguration(
    {
      kind: "world-camera",
      schemaVersion: 1,
      defaultViewId: "main",
      binding: { targetEntityId: "player" },
      presets: {
        base: {
          kind: "third-person",
          values: {
            orientation: {
              pitchLimitsRadians: {
                kind: "bounded",
                minimumRadians: -0.2,
                maximumRadians: 0.2,
              },
            },
          },
        },
      },
      views: {
        main: {
          kind: "third-person",
          presetId: "base",
          overrides: {
            framing: { kind: "preserve-opening" },
            orientation: {
              referenceFrame: "subject-up",
              pitchLimitsRadians: { maximumRadians: 0.1 },
            },
          },
          opening: {
            positionWorldMetersXYZ: [10, 4, 0],
            lookAtWorldMetersXYZ: [10, 0, 0],
            upWorldXYZ: [0, 0, -1],
            fovDegrees: 50,
          },
        },
      },
    },
    {
      subjectId: "player",
      subjectGeneration: 1,
      subjectKind: "actor",
      availableAnchors: [],
      headingAvailable: true,
    },
  );
  if (configuration.kind !== "third-person") throw new Error();
  expect(configuration.values.orientation.pitchLimitsRadians).toEqual({
    kind: "bounded",
    minimumRadians: -0.2,
    maximumRadians: 0.1,
  });
  expect(
    configuration.fields["orientation.pitchLimitsRadians.maximumRadians"]
      ?.source,
  ).toBe("project-view");
  expect(
    createOpeningReference(rotated, configuration).pitchRadians,
  ).toBeCloseTo(0);
  expect(() => createOpeningReference(subject, configuration)).toThrow();
});
it("rejects nonfinite intent and clamps unbounded zoom to a nonnegative distance", () => {
  const configuration = config({
    kind: "third-person",
    overrides: { zoom: { range: { kind: "unbounded" } } },
  });
  if (configuration.kind !== "third-person") throw new Error();
  const intent = {
    yawRadians: 0,
    pitchRadians: 0,
    distanceMeters: -1,
    secondsSinceOrbit: 0,
  };
  expect(
    evaluateThirdPerson({ subject, configuration, intent, deltaSeconds: 0 })
      .intent.distanceMeters,
  ).toBe(0);
  expect(() =>
    evaluateThirdPerson({
      subject,
      configuration,
      intent: { ...intent, secondsSinceOrbit: Infinity },
      deltaSeconds: 0,
    }),
  ).toThrow(/INTENT/);
});

it.each(["look-at", "preserve-opening"] as const)(
  "keeps %s quaternion continuous across both vertical poles",
  (framing) => {
    const configuration = config({
      kind: "third-person",
      overrides: {
        framing: { kind: framing },
        position: { armHalfLifeSeconds: 0 },
        ...(framing === "look-at"
          ? {
              orientation: {
                pitchLimitsRadians: { kind: "unbounded" as const },
              },
            }
          : {}),
      },
      ...(framing === "preserve-opening"
        ? {
            opening: {
              positionWorldMetersXYZ: [10, 0, 4] as const,
              lookAtWorldMetersXYZ: [10, 0, 0] as const,
              fovDegrees: 50,
            },
          }
        : {}),
    });
    if (configuration.kind !== "third-person") throw new Error();
    const opening =
      framing === "preserve-opening"
        ? createOpeningReference(subject, configuration)
        : undefined;
    for (const pole of [-Math.PI / 2, Math.PI / 2]) {
      const input = {
        subject,
        configuration,
        ...(opening ? { opening } : {}),
        deltaSeconds: 0.1,
      };
      const before = evaluateThirdPerson({
        ...input,
        intent: {
          yawRadians: 0.3,
          pitchRadians: pole - 0.001,
          distanceMeters: 4,
          secondsSinceOrbit: 0,
        },
      });
      const after = evaluateThirdPerson({
        ...input,
        history: before.history,
        intent: { ...before.intent, pitchRadians: pole + 0.001 },
      });
      const a = new Quaternion(...before.proposal.quaternionWorldXYZW);
      const b = new Quaternion(...after.proposal.quaternionWorldXYZW);
      expect(a.angleTo(b)).toBeCloseTo(0.002, 7);
      expect(
        new Vector3(...before.proposal.upWorldXYZ).dot(
          new Vector3(...after.proposal.upWorldXYZ),
        ),
      ).toBeGreaterThan(0.999);
    }
  },
);
it.each([
  [-Math.PI, Math.PI, Math.PI - 0.1, -Math.PI + 0.1, -Math.PI + 0.1],
  [-1, 1, 0.9, -0.9, -0.9],
  [-1, 1, 0.9, 2, 1],
])(
  "recenters inside bounded yaw [%s, %s]",
  (minimum, maximum, initialYaw, heading, expected) => {
    const configuration = config({
      kind: "third-person",
      overrides: {
        orientation: {
          yawLimitsRadians: {
            kind: "bounded",
            minimumRadians: minimum!,
            maximumRadians: maximum!,
          },
          recenter: { delaySeconds: 0, yawHalfLifeSeconds: 1 },
        },
      },
    });
    if (configuration.kind !== "third-person") throw new Error();
    const moving = {
      ...subject,
      speedMetersPerSecond: 2,
      semanticQuaternionWorldXYZW: new Quaternion()
        .setFromAxisAngle(new Vector3(0, 1, 0), heading!)
        .toArray(),
    };
    let result = evaluateThirdPerson({
      subject: moving,
      configuration,
      intent: {
        yawRadians: initialYaw!,
        pitchRadians: 0,
        distanceMeters: 4,
        secondsSinceOrbit: 0,
      },
      deltaSeconds: 1,
    });
    for (let i = 0; i < 30; i++) {
      expect(result.intent.yawRadians).toBeGreaterThanOrEqual(minimum!);
      expect(result.intent.yawRadians).toBeLessThanOrEqual(maximum!);
      result = evaluateThirdPerson({
        subject: moving,
        configuration,
        intent: result.intent,
        history: result.history,
        deltaSeconds: 1,
      });
    }
    expect(result.intent.yawRadians).toBeCloseTo(expected!, 7);
  },
);
it("keeps world-up horizontal during a pitched, half-smoothed orbit", () => {
  const configuration = config({
    kind: "third-person",
    overrides: {
      position: {
        anchor: { kind: "origin" },
        distanceMeters: 4,
        armHalfLifeSeconds: 1,
      },
      orientation: { initialPitchRadians: 0.4 },
    },
  });
  if (configuration.kind !== "third-person") throw new Error();
  const initial = evaluateThirdPerson({
    subject,
    configuration,
    deltaSeconds: 0,
  });
  const result = evaluateThirdPerson({
    subject,
    configuration,
    history: initial.history,
    intent: { ...initial.intent, yawRadians: Math.PI / 2 },
    deltaSeconds: 1,
  });
  expect(
    new Vector3(1, 0, 0).applyQuaternion(
      new Quaternion(...result.proposal.quaternionWorldXYZW),
    ).y,
  ).toBeCloseTo(0, 10);
});
it("preserves explicit opening roll through a smoothed orbit", () => {
  const roll = 0.3;
  const configuration = config({
    kind: "third-person",
    overrides: {
      framing: { kind: "preserve-opening" },
      position: { armHalfLifeSeconds: 1 },
    },
    opening: {
      positionWorldMetersXYZ: [10, 0, 4],
      lookAtWorldMetersXYZ: [10, 0, 0],
      upWorldXYZ: [-Math.sin(roll), Math.cos(roll), 0],
      fovDegrees: 50,
    },
  });
  if (configuration.kind !== "third-person") throw new Error();
  const opening = createOpeningReference(subject, configuration);
  const initial = evaluateThirdPerson({
    subject,
    configuration,
    opening,
    deltaSeconds: 0,
  });
  const result = evaluateThirdPerson({
    subject,
    configuration,
    opening,
    history: initial.history,
    intent: { ...initial.intent, yawRadians: Math.PI / 2 },
    deltaSeconds: 1,
  });
  expect(
    new Vector3(1, 0, 0).applyQuaternion(
      new Quaternion(...result.proposal.quaternionWorldXYZW),
    ).y,
  ).toBeCloseTo(Math.sin(roll), 8);
});

it("damps a half-turn along the source camera Cartesian chord", () => {
  const configuration = config({
    kind: "third-person",
    overrides: {
      position: {
        anchor: { kind: "origin" },
        distanceMeters: 4,
        armHalfLifeSeconds: 1,
      },
      orientation: { initialPitchRadians: 0.4 },
    },
  });
  if (configuration.kind !== "third-person") throw new Error();
  const initial = evaluateThirdPerson({
    subject,
    configuration,
    deltaSeconds: 0,
  });
  const result = evaluateThirdPerson({
    subject,
    configuration,
    history: initial.history,
    intent: { ...initial.intent, yawRadians: Math.PI },
    deltaSeconds: 0.01,
  });
  const alpha=1-2**-.01;
  const expectedArm=new Vector3(0,4*Math.sin(.4),4*Math.cos(.4)*(1-2*alpha));
  close(new Vector3(...result.proposal.positionWorldMetersXYZ).sub(new Vector3(...result.proposal.pivotWorldMetersXYZ)).toArray(),expectedArm.toArray());
  const sight=new Vector3(0,0,-1).applyQuaternion(new Quaternion(...result.proposal.quaternionWorldXYZW));
  expect(sight.angleTo(expectedArm.clone().negate())).toBeLessThan(1e-7);

});
it("damps the Cartesian destination when yaw pitch and distance change together", () => {
  const configuration = config({
    kind: "third-person",
    overrides: {
      position: {
        anchor: { kind: "origin" },
        distanceMeters: 4,
        armHalfLifeSeconds: 1,
      },
      orientation: {
        initialPitchRadians: 0,
        pitchLimitsRadians: { kind: "unbounded" },
      },
      zoom: { halfLifeSeconds: 0 },
    },
  });
  if (configuration.kind !== "third-person") throw new Error();
  const initial = evaluateThirdPerson({
    subject,
    configuration,
    deltaSeconds: 0,
  });
  const result = evaluateThirdPerson({
    subject,
    configuration,
    history: initial.history,
    intent: {
      ...initial.intent,
      yawRadians: 3 * Math.PI,
      pitchRadians: 0.8,
      distanceMeters: 8,
    },
    deltaSeconds: 1,
  });
  const position = new Vector3(...result.proposal.positionWorldMetersXYZ);
  const pivot = new Vector3(...result.proposal.pivotWorldMetersXYZ);
  close(position.clone().sub(pivot).toArray(), [0,4*Math.sin(.8),2-4*Math.cos(.8)]);
  expect(position.distanceTo(pivot)).toBeCloseTo(Math.hypot(4*Math.sin(.8),2-4*Math.cos(.8)),8);
  const orientation = new Quaternion(...result.proposal.quaternionWorldXYZW);
  expect(new Vector3(1, 0, 0).applyQuaternion(orientation).y).toBeCloseTo(
    0,
    10,
  );
  expect(
    new Vector3(0, 0, -1)
      .applyQuaternion(orientation)
      .distanceTo(pivot.sub(position).normalize()),
  ).toBeLessThan(1e-8);
});
it("keeps the source half-smoothed quarter turn on its chord", () => {
  const configuration = config({
    kind: "third-person",
    overrides: {
      position: {
        anchor: { kind: "origin" },
        distanceMeters: 4,
        armHalfLifeSeconds: 1,
      },
      orientation: { initialPitchRadians: 0 },
    },
  });
  if (configuration.kind !== "third-person") throw new Error();
  const initial = evaluateThirdPerson({
    subject,
    configuration,
    deltaSeconds: 0,
  });
  const result = evaluateThirdPerson({
    subject,
    configuration,
    history: initial.history,
    intent: { ...initial.intent, yawRadians: Math.PI / 2 },
    deltaSeconds: 1,
  });
  close(result.proposal.positionWorldMetersXYZ, [
    12,
    0,
    2,
  ]);
});
it.each([-Math.PI / 2, Math.PI / 2])(
  "smooths explicit pitch continuously through pole %s",
  (pole) => {
    const configuration = config({
      kind: "third-person",
      overrides: {
        position: {
          anchor: { kind: "origin" },
          distanceMeters: 4,
          armHalfLifeSeconds: 1,
        },
        orientation: { pitchLimitsRadians: { kind: "unbounded" } },
      },
    });
    if (configuration.kind !== "third-person") throw new Error();
    const initial = evaluateThirdPerson({
      subject,
      configuration,
      intent: {
        yawRadians: 0.3,
        pitchRadians: pole - 0.001,
        distanceMeters: 4,
        secondsSinceOrbit: 0,
      },
      deltaSeconds: 0,
    });
    const result = evaluateThirdPerson({
      subject,
      configuration,
      history: initial.history,
      intent: { ...initial.intent, pitchRadians: pole + 0.003 },
      deltaSeconds: 1,
    });
    expect(result.history.orbitPitchRadians).toBeCloseTo(pole + 0.001, 10);
    expect(
      new Quaternion(...initial.proposal.quaternionWorldXYZW).angleTo(
        new Quaternion(...result.proposal.quaternionWorldXYZW),
      ),
    ).toBeCloseTo(0.002, 7);
    expect(
      new Vector3(...initial.proposal.upWorldXYZ).dot(
        new Vector3(...result.proposal.upWorldXYZ),
      ),
    ).toBeGreaterThan(0.999);
  },
);

// Tests exercise the two production phases together unless explicitly checking their boundary.
function prepareAndEvaluate<
  K extends import("../../config/camera/index").CameraKind,
>(
  input: Omit<import("./types").CameraStrategyInput<K>, "intent"> & {
    intent?: import("./types").CameraIntent;
  },
  evaluate: (
    input: import("./types").CameraStrategyInput<K>,
  ) => import("./types").CameraStrategyResult<K>,
) {
  return evaluate({ ...input, intent: prepareCameraIntent(input) });
}
function evaluateThirdPerson(
  input: Omit<
    import("./types").CameraStrategyInput<"third-person">,
    "intent"
  > & { intent?: import("./types").CameraIntent },
) {
  return prepareAndEvaluate(input, evaluateThirdPersonPose);
}
function evaluateFirstPerson(
  input: Omit<
    import("./types").CameraStrategyInput<"first-person">,
    "intent"
  > & { intent?: import("./types").CameraIntent },
) {
  return prepareAndEvaluate(input, evaluateFirstPersonPose);
}
function evaluateShoulder(
  input: Omit<import("./types").CameraStrategyInput<"shoulder">, "intent"> & {
    intent?: import("./types").CameraIntent;
  },
) {
  return prepareAndEvaluate(input, evaluateShoulderPose);
}

it('preserves an opening pose while orbiting the declared body anchor and offset',()=>{
 const configuration=config({kind:'third-person',opening:{positionWorldMetersXYZ:[10,3,8],lookAtWorldMetersXYZ:[10,1.2,0],fovDegrees:48},overrides:{framing:{kind:'preserve-opening'},position:{anchor:{kind:'body',heightRatio:.6},anchorOffset:{space:'world',offsetMetersXYZ:[0,.1,0]},armHalfLifeSeconds:0},orientation:{recenter:{enabled:false}}}});
 if(configuration.kind!=='third-person')throw new Error();
 const opening=createOpeningReference(subject,configuration);
 const intent=prepareCameraIntent({subject,configuration,opening,deltaSeconds:0});
 const first=evaluateThirdPersonPose({subject,configuration,opening,intent,deltaSeconds:0}).proposal;
 close(first.positionWorldMetersXYZ,[10,3,8]);close(first.pivotWorldMetersXYZ,[10,1.3,0]);expect(first.lens.verticalFovDegrees).toBe(48);
 expect(opening.distanceMeters).toBeCloseTo(Math.hypot(8,1.7),8);
 const turned=evaluateThirdPersonPose({subject,configuration,opening,intent:{...intent,yawRadians:intent.yawRadians+Math.PI/2},deltaSeconds:0}).proposal;
 close(turned.pivotWorldMetersXYZ,[10,1.3,0]);close(turned.positionWorldMetersXYZ,[18,3,0]);
});

// Recovery contract: main 28524686 inherits translation and damps the Cartesian
// arm. A 90-degree turn at one half-life reaches the chord midpoint, not the arc.
it('restores the main camera Cartesian arm response', () => {
 const configuration=config({kind:'third-person',overrides:{position:{anchor:{kind:'origin'},distanceMeters:4,subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:0,armHalfLifeSeconds:1},orientation:{initialPitchRadians:0,recenter:{enabled:false}},zoom:{halfLifeSeconds:0}}});
 if(configuration.kind!=='third-person')throw new Error();
 const initial=evaluateThirdPerson({subject,configuration,deltaSeconds:0});
 const result=evaluateThirdPerson({subject,configuration,history:initial.history,intent:{...initial.intent,yawRadians:Math.PI/2},deltaSeconds:1});
 close(new Vector3(...result.proposal.positionWorldMetersXYZ).sub(new Vector3(...result.proposal.pivotWorldMetersXYZ)).toArray(),[2,0,2]);
 const sight=new Vector3(0,0,-1).applyQuaternion(new Quaternion(...result.proposal.quaternionWorldXYZW));
 expect(sight.angleTo(new Vector3(...result.proposal.pivotWorldMetersXYZ).sub(new Vector3(...result.proposal.positionWorldMetersXYZ)))).toBeLessThan(1e-7);
});

it('keeps the committed horizon while a Cartesian arm approaches a pole',()=>{
 const configuration=config({kind:'third-person',overrides:{position:{anchor:{kind:'origin'},distanceMeters:4,armHalfLifeSeconds:.1},orientation:{initialPitchRadians:80*Math.PI/180,pitchLimitsRadians:{kind:'unbounded'},recenter:{enabled:false}}}});
 if(configuration.kind!=='third-person')throw new Error();
 const initial=evaluateThirdPerson({subject,configuration,deltaSeconds:0});
 const result=evaluateThirdPerson({subject,configuration,history:initial.history,intent:{...initial.intent,pitchRadians:91*Math.PI/180},deltaSeconds:1/60});
 expect(new Vector3(...initial.proposal.upWorldXYZ).dot(new Vector3(...result.proposal.upWorldXYZ))).toBeGreaterThan(.99);
});

it('retains the PR 240 upright aircraft shoulder while using local seat yaw',()=>{
 const configuration=config({kind:'shoulder',overrides:{position:{anchor:{kind:'eye'},anchorOffset:{space:'orbit',offsetMetersXYZ:[.48,.22,0]},distanceMeters:2,armHalfLifeSeconds:0},orientation:{referenceFrame:'subject-heading',initialPitchRadians:0,yawLimitsRadians:{kind:'bounded',minimumRadians:-Math.PI*5/6,maximumRadians:Math.PI*5/6},recenter:{enabled:false}}}});
 if(configuration.kind!=='shoulder')throw new Error();
 const rolled={...subject,continuousHeadingSeedRadians:0,semanticQuaternionWorldXYZW:new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI).toArray()};
 const result=evaluateShoulder({subject:rolled,configuration,deltaSeconds:0});
 expect(result.intent.yawRadians).toBe(0);
 expect(new Vector3(1,0,0).applyQuaternion(new Quaternion(...result.proposal.quaternionWorldXYZW)).y).toBeCloseTo(0,10);
 expect(result.proposal.upWorldXYZ[1]).toBeCloseTo(1,10);
 close(new Vector3(...result.proposal.pivotWorldMetersXYZ).sub(new Vector3(...rolled.eyeWorldMetersXYZ!)).toArray(),[.48,.22,0]);
});

it('uses an explicit posture recenter preference without changing the selected view',()=>{
 const configuration=config({kind:'third-person',overrides:{orientation:{recenter:{enabled:true,delaySeconds:0,minimumSpeedMetersPerSecond:0,pitch:{targetSource:'subject',targetRadians:.2,halfLifeSeconds:0}}}}});
 if(configuration.kind!=='third-person')throw new Error();
 const seated={...subject,preferredOrbitPitchRadians:.25};
 const result=evaluateThirdPerson({subject:seated,configuration,deltaSeconds:1/60});
 expect(result.intent.pitchRadians).toBe(.25);
 expect(result.history.viewId).toBe(configuration.viewId);
 const fallback=evaluateThirdPerson({subject,configuration,deltaSeconds:1/60});expect(fallback.intent.pitchRadians).toBe(.2);
});

it('retains the smoothed spacecraft horizon when collision shortens the arm', () => {
  const configuration = config({kind:'third-person', overrides:{
    position:{anchor:{kind:'origin'}, distanceMeters:4, armHalfLifeSeconds:0},
    orientation:{referenceFrame:'subject-up', inheritSubjectYaw:false, initialPitchRadians:0,
      upHalfLifeSeconds:Math.LN2/5, recenter:{enabled:false}},
  }});
  if(configuration.kind!=='third-person') throw new Error();
  const initial = evaluateThirdPerson({subject, configuration, deltaSeconds:0});
  const banked = {...subject, semanticQuaternionWorldXYZW:new Quaternion()
    .setFromAxisAngle(new Vector3(0,0,1), Math.PI/4).toArray()};
  const result = evaluateThirdPerson({subject:banked, configuration, history:initial.history, deltaSeconds:1/60});
  const pivot = new Vector3(...result.proposal.pivotWorldMetersXYZ);
  const safeEye = new Vector3(...result.proposal.positionWorldMetersXYZ).lerp(pivot, .5);
  const corrected = composeCameraAtPosition(result.proposal, safeEye.toArray());
  expect(new Quaternion(...corrected.quaternionWorldXYZW)
    .angleTo(new Quaternion(...result.proposal.quaternionWorldXYZW))).toBeLessThan(1e-7);
});
