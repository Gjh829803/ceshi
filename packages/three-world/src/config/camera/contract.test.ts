import { describe, expect, it } from "vitest";
import {
  type CameraDocument,
  parseCameraDocument,
  resolveCameraConfiguration,
  serializeCameraDocument,
  hashCameraDocument,
} from "./index";

const document = () => ({
  kind: "world-camera",
  schemaVersion: 1,
  defaultViewId: "main",
  views: { main: { kind: "third-person" } },
  binding: { targetEntityId: "player" },
});
const context = {
  subjectId: "player",
  subjectGeneration: 1,
  subjectKind: "character",
  availableAnchors: ["eye", "seat"] as const,
  body: { minimumHeightMeters: 0, maximumHeightMeters: 2 },
  headingAvailable: true,
};
const resolve = (value: unknown) =>
  resolveCameraConfiguration(parseCameraDocument(value), context);
const distance = (value: unknown) => {
  const result = resolve(value);
  if (result.kind === "first-person") throw new Error("expected follow view");
  return result.values.position.distanceMeters;
};
const withOverrides = (overrides: unknown) => ({
  ...document(),
  views: { main: { kind: "third-person", overrides } },
});

describe("camera document contract", () => {
  it("parses the minimal preserve-opening example as detached data", () => {
    const input = {
      ...document(),
      views: {
        main: {
          kind: "third-person",
          overrides: { framing: { kind: "preserve-opening" } },
          opening: {
            positionWorldMetersXYZ: [0, 3, 8],
            lookAtWorldMetersXYZ: [0, 1.4, 0],
            fovDegrees: 50,
          },
        },
      },
      input: { cycleViewIds: [] },
    };
    const parsed = parseCameraDocument(input);
    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(resolve(input).values.lens.verticalFovDegrees).toBe(50);
  });
  it("resolves all five layers and removal restores inheritance", () => {
    expect(distance(document())).toBe(8.8);
    const input = {
      ...document(),
      presets: {
        base: {
          kind: "third-person",
          values: { position: { distanceMeters: 6 } },
        },
        subject: {
          kind: "third-person",
          values: { position: { distanceMeters: 7 } },
        },
      },
      views: {
        main: {
          kind: "third-person",
          presetId: "base",
          overrides: { position: { distanceMeters: 10 } },
        },
      },
      binding: {
        targetEntityId: "player",
        subjectOverrides: {
          player: {
            views: {
              main: {
                presetId: "subject",
                overrides: { position: { distanceMeters: 12 } },
              },
            },
          },
        },
      },
    };
    expect(distance(input)).toBe(12);
    expect(resolve(input).fields["position.distanceMeters"]?.source).toBe(
      "project-subject",
    );
    delete (
      input.binding.subjectOverrides.player.views.main as {
        overrides?: unknown;
      }
    ).overrides;
    expect(distance(input)).toBe(10);
    input.presets.base.values.position.distanceMeters = 4;
    expect(distance(input)).toBe(10);
    delete (input.views.main as { overrides?: unknown }).overrides;
    expect(distance(input)).toBe(7);
    delete (
      input.binding.subjectOverrides.player.views.main as { presetId?: string }
    ).presetId;
    expect(distance(input)).toBe(4);
  });
  it.each([NaN, Infinity, undefined, () => 0, new Date(), 1n])(
    "rejects non JSON input %s",
    (bad) => {
      expect(() =>
        parseCameraDocument({ ...document(), extra: bad }),
      ).toThrow();
    },
  );
  it.each([
    { schemaVersion: 2 },
    { extra: 1 },
    { defaultViewId: "missing" },
    { input: { cycleViewIds: ["missing"] } },
    { views: { main: { kind: "unknown" } } },
  ])("rejects invalid format or references %j", (change) => {
    expect(() => parseCameraDocument({ ...document(), ...change })).toThrow();
  });
  it("rejects missing and mismatched preset references", () => {
    expect(() =>
      parseCameraDocument({
        ...document(),
        views: { main: { kind: "third-person", presetId: "absent" } },
      }),
    ).toThrow();
    expect(() =>
      parseCameraDocument({
        ...document(),
        views: { main: { kind: "third-person", presetId: "bad" } },
        presets: { bad: { kind: "first-person", values: {} } },
      }),
    ).toThrow();
  });
  it("validates body ratios and replaces discriminated branches", () => {
    expect(() =>
      resolve(
        withOverrides({
          position: { anchor: { kind: "body", heightRatio: 1.1 } },
        }),
      ),
    ).toThrow();
    expect(
      resolve(
        withOverrides({
          position: {
            anchor: { kind: "subject-local", positionMetersXYZ: [1, 2, 3] },
          },
        }),
      ).values.position.anchor,
    ).toEqual({ kind: "subject-local", positionMetersXYZ: [1, 2, 3] });
  });
  it("preserves inactive preset values but rejects explicit inapplicable overrides", () => {
    const input = {
      ...document(),
      presets: {
        base: {
          kind: "third-person",
          values: { position: { distanceMeters: 6 } },
        },
      },
      views: {
        main: {
          kind: "third-person",
          presetId: "base",
          overrides: { framing: { kind: "preserve-opening" } },
        },
      },
    };
    expect(resolve(input).fields["position.distanceMeters"]).toMatchObject({
      configured: 6,
      source: "view-preset",
      inactiveReason: "preserve-opening",
    });
    expect(() =>
      resolve({
        ...input,
        views: {
          main: {
            ...input.views.main,
            overrides: {
              framing: { kind: "preserve-opening" },
              position: { distanceMeters: 5 },
            },
          },
        },
      }),
    ).toThrow();
  });
  it("requires eye only for the selected first-person view and normalizes only default activation", () => {
    const input = {
      ...document(),
      views: { main: { kind: "third-person" }, eyes: { kind: "first-person" } },
    };
    const parsed = parseCameraDocument(input);
    expect(
      resolveCameraConfiguration(parsed, { ...context, availableAnchors: [] })
        .activation,
    ).toBe("on-input");
    expect(() =>
      resolveCameraConfiguration(parsed, {
        ...context,
        viewId: "eyes",
        availableAnchors: [],
      }),
    ).toThrow();
    expect(
      resolveCameraConfiguration(parsed, { ...context, viewId: "eyes" })
        .activation,
    ).toBe("on-input");
    expect(resolve({ ...input, defaultViewId: "eyes" }).activation).toBe(
      "immediate",
    );
  });
  it("validates per-view openings and excludes openings from other strategies", () => {
    expect(() =>
      parseCameraDocument({
        ...document(),
        views: {
          main: { kind: "third-person" },
          other: {
            kind: "third-person",
            overrides: { framing: { kind: "preserve-opening" } },
          },
        },
      }),
    ).toThrow();
    expect(() =>
      parseCameraDocument({
        ...document(),
        views: {
          main: {
            kind: "first-person",
            opening: {
              positionWorldMetersXYZ: [0, 0, 1],
              lookAtWorldMetersXYZ: [0, 0, 0],
              fovDegrees: 50,
            },
          },
        },
      }),
    ).toThrow();
  });
  it("supports zero third-person arm and rejects zero shoulder arm", () => {
    expect(
      distance(
        withOverrides({
          position: { distanceMeters: 0 },
          zoom: { range: { kind: "unbounded" } },
        }),
      ),
    ).toBe(0);
    expect(() =>
      resolve({
        ...document(),
        views: {
          main: {
            kind: "shoulder",
            overrides: { position: { distanceMeters: 0 } },
          },
        },
      }),
    ).toThrow();
  });
  it.each([
    { lens: { nearMeters: 1, farMeters: 1 } },
    {
      zoom: {
        range: {
          kind: "bounded",
          minimumDistanceMeters: 10,
          maximumDistanceMeters: 9,
        },
      },
    },
    { position: { distanceMeters: 20 } },
    {
      constraints: {
        recovery: {
          speedLimit: { kind: "limited", maximumSpeedMetersPerSecond: 0 },
        },
      },
    },
  ])("rejects invalid relationships %j", (overrides) => {
    expect(() => resolve(withOverrides(overrides))).toThrow();
  });
  it("supports half-life zero, unlimited recovery, and complete array replacement", () => {
    const result = resolve(
      withOverrides({
        position: {
          anchorOffset: { space: "world", offsetMetersXYZ: [3, 2, 1] },
          armHalfLifeSeconds: 0,
        },
        constraints: { recovery: { speedLimit: { kind: "unlimited" } } },
      }),
    );
    expect(result.values.position.anchorOffset.offsetMetersXYZ).toEqual([
      3, 2, 1,
    ]);
    expect(result.values.constraints.recovery.speedLimit).toEqual({
      kind: "unlimited",
    });
  });
  it("checks opening geometry and an explicitly bounded opening distance", () => {
    const input = withOverrides({
      framing: { kind: "preserve-opening" },
      zoom: {
        range: {
          kind: "bounded",
          minimumDistanceMeters: 1,
          maximumDistanceMeters: 2,
        },
      },
    });
    expect(() =>
      resolveCameraConfiguration(parseCameraDocument(input), {
        ...context,
        openingDistanceMeters: 3,
      }),
    ).toThrow();
  });
  it("canonicalizes keys, preserves array order, omits unused presets and distrusts source identity", () => {
    const input = {
      ...document(),
      presets: {
        unused: {
          kind: "third-person",
          values: {},
          sourceIdentity: { id: "unused", version: "1" },
        },
      },
      input: { cycleViewIds: ["main"] },
    };
    const serialized = serializeCameraDocument(parseCameraDocument(input));
    expect(JSON.parse(serialized).presets).toBeUndefined();
    expect(hashCameraDocument(parseCameraDocument(input))).toBe(
      hashCameraDocument(
        parseCameraDocument({
          ...input,
          binding: { targetEntityId: "player" },
        }),
      ),
    );
    expect(
      serializeCameraDocument(parseCameraDocument(JSON.parse(serialized))),
    ).toBe(serialized);
    const reversed = Object.fromEntries(Object.entries(document()).reverse());
    expect(hashCameraDocument(parseCameraDocument(reversed))).toBe(
      hashCameraDocument(parseCameraDocument(document())),
    );
  });
  it("does not mutate input during resolution", () => {
    const parsed = parseCameraDocument(document());
    const before = JSON.stringify(parsed);
    resolveCameraConfiguration(parsed, context);
    expect(JSON.stringify(parsed)).toBe(before);
  });
});

describe("camera contract edge semantics", () => {
  it("allows partial inherited branch fields and requires complete replacement branches", () => {
    expect(
      resolve(withOverrides({ position: { anchor: { heightRatio: 0.5 } } }))
        .values.position.anchor,
    ).toEqual({ kind: "body", heightRatio: 0.5 });
    expect(() =>
      resolve(
        withOverrides({ position: { anchor: { kind: "subject-local" } } }),
      ),
    ).toThrow();
  });
  it("keeps preset FOV provenance when opening supplies the effective lens", () => {
    const result = resolve({
      ...document(),
      presets: {
        base: {
          kind: "third-person",
          values: { lens: { verticalFovDegrees: 70 } },
        },
      },
      views: {
        main: {
          kind: "third-person",
          presetId: "base",
          overrides: { framing: { kind: "preserve-opening" } },
          opening: {
            positionWorldMetersXYZ: [0, 3, 8],
            lookAtWorldMetersXYZ: [0, 1, 0],
            fovDegrees: 50,
          },
        },
      },
    });
    expect(result.fields["lens.verticalFovDegrees"]).toMatchObject({
      configured: 70,
      source: "view-preset",
      inactiveReason: "preserve-opening",
    });
    expect(result.fields["opening.fovDegrees"]).toMatchObject({
      configured: 50,
      effective: 50,
      source: "opening",
    });
    expect(result.values.lens.verticalFovDegrees).toBe(50);
  });
  it("does not invoke JSON array accessors", () => {
    let calls = 0;
    const vector = [0, 1, 2];
    Object.defineProperty(vector, "0", {
      get() {
        calls++;
        return 0;
      },
      enumerable: true,
    });
    expect(() =>
      parseCameraDocument(
        withOverrides({
          position: { anchorOffset: { offsetMetersXYZ: vector } },
        }),
      ),
    ).toThrow();
    expect(calls).toBe(0);
  });
  it("hashes actual referenced content even when identity claims are unchanged", () => {
    const input = {
      ...document(),
      views: { main: { kind: "third-person", presetId: "base" } },
      presets: {
        base: {
          kind: "third-person",
          values: { position: { distanceMeters: 6 } },
          sourceIdentity: { id: "same", version: "same" },
        },
      },
    };
    const before = hashCameraDocument(parseCameraDocument(input));
    input.presets.base.values.position.distanceMeters = 7;
    expect(hashCameraDocument(parseCameraDocument(input))).not.toBe(before);
  });
  it("preserves cycle order in canonical documents", () => {
    const input = {
      ...document(),
      views: {
        main: { kind: "third-person" },
        other: { kind: "first-person" },
      },
      input: { cycleViewIds: ["main", "other"] },
    };
    const before = hashCameraDocument(parseCameraDocument(input));
    input.input.cycleViewIds.reverse();
    expect(hashCameraDocument(parseCameraDocument(input))).not.toBe(before);
  });
  it("reports pathful RuntimeError data", () => {
    try {
      parseCameraDocument(withOverrides({ lens: { nearMeters: -1 } }));
      throw Error("expected rejection");
    } catch (error) {
      expect(error).toMatchObject({
        code: "CAMERA_CONFIGURATION_INVALID",
        category: "invalid-input",
        message: expect.stringContaining(
          "/views/main/overrides/lens/nearMeters",
        ),
      });
    }
  });
});

it("rejects invalid subject generation identity without converting it to null", () => {
  expect(() =>
    resolveCameraConfiguration(parseCameraDocument(document()), {
      ...context,
      subjectGeneration: NaN,
    }),
  ).toThrow();
});

describe("review regressions", () => {
  it("rejects partial bounded fields incompatible with preserve-opening defaults", () => {
    const input = withOverrides({
      framing: { kind: "preserve-opening" },
      zoom: { range: { maximumDistanceMeters: 2 } },
    });
    expect(() =>
      resolveCameraConfiguration(parseCameraDocument(input), {
        ...context,
        openingDistanceMeters: 3,
      }),
    ).toThrow();
    const explicit = resolveCameraConfiguration(
      parseCameraDocument(
        withOverrides({
          framing: { kind: "preserve-opening" },
          zoom: {
            range: {
              kind: "bounded",
              minimumDistanceMeters: 0,
              maximumDistanceMeters: 2,
            },
          },
        }),
      ),
      { ...context, openingDistanceMeters: 1 },
    );
    expect(explicit.fields["zoom.range.maximumDistanceMeters"]).toMatchObject({
      configured: 2,
      effective: 2,
      source: "project-view",
    });
  });
  it("rejects a hidden array toJSON getter without invoking it", () => {
    let calls = 0;
    const vector = [0, 1, 2];
    Object.defineProperty(vector, "toJSON", {
      get() {
        calls++;
        return () => [3, 4, 5];
      },
    });
    expect(() =>
      parseCameraDocument(
        withOverrides({
          position: { anchorOffset: { offsetMetersXYZ: vector } },
        }),
      ),
    ).toThrow();
    expect(calls).toBe(0);
  });
  it("rejects nonstandard array prototypes without invoking inherited hooks", () => {
    let calls = 0;
    const prototype = Object.create(Array.prototype);
    Object.defineProperty(prototype, "toJSON", {
      get() {
        calls++;
        return () => [3, 4, 5];
      },
    });
    const vector = [0, 1, 2];
    Object.setPrototypeOf(vector, prototype);
    expect(() =>
      parseCameraDocument(
        withOverrides({
          position: { anchorOffset: { offsetMetersXYZ: vector } },
        }),
      ),
    ).toThrow();
    expect(calls).toBe(0);
  });
  it.each(["constructor", "toString", "__proto__"])(
    "does not inherit subject dictionary entry %s",
    (subjectId) => {
      const parsed = parseCameraDocument({
        ...document(),
        binding: { targetEntityId: subjectId, subjectOverrides: {} },
      });
      expect(
        resolveCameraConfiguration(parsed, { ...context, subjectId }).subjectId,
      ).toBe(subjectId);
    },
  );
  it("does not inherit a subject view dictionary entry", () => {
    const parsed = parseCameraDocument({
      ...document(),
      defaultViewId: "constructor",
      views: { constructor: { kind: "third-person" } },
      binding: {
        targetEntityId: "player",
        subjectOverrides: { player: { views: {} } },
      },
    });
    expect(resolveCameraConfiguration(parsed, context).viewId).toBe(
      "constructor",
    );
  });
});

it('keeps native view cycling opt-in while declaring all named views',async()=>{
 const {createHumanoidCameraDocument}=await import('./humanoid');const configuration=createHumanoidCameraDocument('person');
 expect(Object.keys(configuration.views)).toEqual(['third-person','first-person','shoulder']);expect(configuration.input?.cycleViewIds).toEqual([]);expect(configuration.input?.orbitRateRadiansPerSecond).toBe(1.2);
});


describe("speed FOV envelope", () => {
  it.each(["third-person", "first-person", "shoulder"] as const)("checks the enabled sum for %s", kind => {
    const input = (offset: number, enabled = true) => ({...document(), views: {main: {kind, overrides: {
      lens: {verticalFovDegrees: 170}, effects: {speedFov: {enabled, maximumOffsetDegrees: offset}},
    }}}});
    for (const offset of [10, 20]) expect(() => parseCameraDocument(input(offset))).toThrow(/effective base FOV/);
    expect(resolve(input(9.9)).values.lens.verticalFovDegrees).toBe(170);
    expect(() => parseCameraDocument(input(20, false))).not.toThrow();
  });
  it("checks the composed preset and subject override", () => {
    const input = {...document(), presets: {wide: {kind: "third-person", values: {lens: {verticalFovDegrees: 170}}}},
      views: {main: {kind: "third-person", presetId: "wide"}},
      binding: {targetEntityId: "player", subjectOverrides: {player: {views: {main: {overrides: {
        effects: {speedFov: {enabled: true, maximumOffsetDegrees: 20}},
      }}}}}}};
    expect(() => parseCameraDocument(input)).toThrow(/effective base FOV/);
  });
  it("checks the explicit opening FOV rather than the inactive preset FOV", () => {
    const input = {...document(), presets: {wide: {kind: "third-person", values: {lens: {verticalFovDegrees: 170}}}},
      views: {main: {kind: "third-person", presetId: "wide", opening: {
        positionWorldMetersXYZ: [0,3,8], lookAtWorldMetersXYZ: [0,1,0], fovDegrees: 170,
      }, overrides: {framing: {kind: "preserve-opening"}, effects: {speedFov: {enabled: true, maximumOffsetDegrees: 20}}}}}};
    expect(() => parseCameraDocument(input)).toThrow(/effective base FOV/);
    input.views.main.opening.fovDegrees = 60;
    expect(resolve(input).values.lens.verticalFovDegrees).toBe(60);
    const {opening: _, ...implicit} = input.views.main;
    expect(() => parseCameraDocument({...input, views: {main: implicit}})).not.toThrow();
  });
});


it('validates recenter source branches and exposes unavailable velocity without rejecting a usable view',()=>{
 const document: CameraDocument={kind:'world-camera',schemaVersion:1,defaultViewId:'orbit',binding:{targetEntityId:'person'},views:{orbit:{kind:'third-person',overrides:{position:{anchor:{kind:'origin'}},orientation:{recenter:{yawTarget:{kind:'movement-direction'}}}}}}};
 const context={subjectId:'person',subjectGeneration:1,subjectKind:'ordinary',availableAnchors:[] as const,headingAvailable:false};
 const resolved=resolveCameraConfiguration(document,context);
 expect(resolved.fields['orientation.recenter.yawTarget.kind']?.inactiveReason).toBe('velocity-unavailable');
 const world={...document,views:{orbit:{kind:'third-person' as const,overrides:{position:{anchor:{kind:'origin' as const}},orientation:{recenter:{yawTarget:{kind:'world-forward' as const,yawRadians:1}}}}}}};
 expect(resolveCameraConfiguration(world,context).fields['orientation.recenter.yawTarget.kind']?.inactiveReason).toBeUndefined();
 for(const target of [{kind:'velocity'},{kind:'world-forward'},{kind:'world-forward',yawRadians:Infinity},{kind:'subject-forward',yawRadians:1}]){
  expect(()=>parseCameraDocument({...world,views:{orbit:{...world.views.orbit,overrides:{...world.views.orbit.overrides,orientation:{recenter:{yawTarget:target}}}}}})).toThrow();
 }
});
