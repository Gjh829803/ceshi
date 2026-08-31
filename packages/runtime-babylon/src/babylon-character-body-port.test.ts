import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  createCharacterMovementRuntimeV1,
  createMovementTickTokenV1,
  type BodyResolveRequestV1,
  type CharacterMovementCommandV1,
  type CharacterMovementRuntimeOptionsV1,
  type MovementProposalV1,
  type MovementTickTokenV1,
} from "@whitebox-world/character-movement";
import { afterEach, describe, expect, it } from "vitest";

import {
  createBabylonCharacterBodyPortV1 as createProductionBabylonCharacterBodyPortV1,
} from "./index.js";

import {
  BABYLON_CHARACTER_BODY_PROVIDER_VERSIONS_V1,
  type BabylonCharacterBodyNativeAllocationV1,
  type BabylonCharacterBodyNativeConfigurationV1,
  type BabylonCharacterBodyNativeContactV1,
  type BabylonCharacterBodyNativeDriverV1,
  type BabylonCharacterBodyNativeIntegrateRequestV1,
  type BabylonCharacterBodyNativeSupportV1,
  type BabylonCharacterBodyPortOptionsV1,
  type BabylonCharacterBodyRuntimePortV1,
  type BabylonCharacterBodyTransactionPortV1,
} from "./babylon-character-body-port.js";
import {
  createBabylonCharacterBodyPortForTestingV1,
} from "./babylon-character-body-port.testing.js";

type Vec3 = readonly [number, number, number];

function cloneVec3(value: Vec3): [number, number, number] {
  return [value[0], value[1], value[2]];
}

const unsupportedSupport = (): BabylonCharacterBodyNativeSupportV1 => ({
  mode: "unsupported",
  averageSurfaceNormalXYZ: [0, 0, 0],
  isSurfaceDynamic: false,
});

const supportedSupport = (
  normalXYZ: Vec3 = [0, 1, 0],
): BabylonCharacterBodyNativeSupportV1 => ({
  mode: "supported",
  averageSurfaceNormalXYZ: normalXYZ,
  isSurfaceDynamic: false,
});

const groundContact = (
  normalXYZ: Vec3 = [0, 1, 0],
): BabylonCharacterBodyNativeContactV1 => ({
  pointMetersXYZ: [0, 0, 0],
  normalXYZ,
  distanceMeters: 0.05,
  motionType: "static",
});

interface FakeSnapshot {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly contacts: readonly BabylonCharacterBodyNativeContactV1[];
}

class FakeNativeDriver implements BabylonCharacterBodyNativeDriverV1 {
  position: [number, number, number] = [0, 1, 0];
  velocity: [number, number, number] = [0, 0, 0];
  support = supportedSupport();
  contacts: BabylonCharacterBodyNativeContactV1[] = [groundContact()];
  checkSupportCalls = 0;
  integrateCalls = 0;
  configureCalls = 0;
  restoreCalls = 0;
  disposeCalls = 0;
  allocation: BabylonCharacterBodyNativeAllocationV1 | undefined;
  configuration: BabylonCharacterBodyNativeConfigurationV1 | undefined;
  throwDuringConfigure: unknown;
  throwDuringIntegrate: unknown;
  throwDuringRestore: unknown;
  throwDuringDispose: unknown;
  integrateRollbackExternallySafe = true;
  didStepUpDuringIntegrate = false;
  maximumSolverCorrectionMeters = 0;
  malformedPositionAfterIntegrate = false;
  onIntegrate: ((request: BabylonCharacterBodyNativeIntegrateRequestV1) => void) | undefined;
  lastIntegrateRequest: BabylonCharacterBodyNativeIntegrateRequestV1 | undefined;

  configure(configuration: BabylonCharacterBodyNativeConfigurationV1): void {
    this.configureCalls += 1;
    if (this.throwDuringConfigure !== undefined) throw this.throwDuringConfigure;
    this.configuration = configuration;
    this.position = cloneVec3(configuration.resetState.positionMetersXYZ);
    this.velocity = cloneVec3(
      configuration.resetState.linearVelocityMetersPerSecondXYZ,
    );
  }

  captureState(): FakeSnapshot {
    return {
      position: cloneVec3(this.position),
      velocity: cloneVec3(this.velocity),
      contacts: this.contacts.map((contact) => ({
        ...contact,
        pointMetersXYZ: cloneVec3(contact.pointMetersXYZ),
        normalXYZ: cloneVec3(contact.normalXYZ),
      })),
    };
  }

  restoreState(snapshot: unknown): void {
    this.restoreCalls += 1;
    if (this.throwDuringRestore !== undefined) throw this.throwDuringRestore;
    const state = snapshot as FakeSnapshot;
    this.position = cloneVec3(state.position);
    this.velocity = cloneVec3(state.velocity);
    this.contacts = state.contacts.map((contact) => ({ ...contact }));
  }

  getPositionMetersXYZ(): Vec3 {
    return this.malformedPositionAfterIntegrate
      ? [Number.NaN, this.position[1], this.position[2]]
      : this.position;
  }

  getLinearVelocityMetersPerSecondXYZ(): Vec3 {
    return this.velocity;
  }

  setPositionMetersXYZ(value: Vec3): void {
    this.position = cloneVec3(value);
  }

  setLinearVelocityMetersPerSecondXYZ(value: Vec3): void {
    this.velocity = cloneVec3(value);
  }

  checkSupport(
    _fixedDeltaSeconds: number,
    _gravityDirectionXYZ: Vec3,
  ): BabylonCharacterBodyNativeSupportV1 {
    this.checkSupportCalls += 1;
    return this.support;
  }

  integrateExactTranslation(request: BabylonCharacterBodyNativeIntegrateRequestV1) {
    this.integrateCalls += 1;
    this.lastIntegrateRequest = request;
    this.position = [
      this.position[0] + request.translationDeltaMetersXYZ[0],
      this.position[1] + request.translationDeltaMetersXYZ[1],
      this.position[2] + request.translationDeltaMetersXYZ[2],
    ];
    this.velocity = cloneVec3(request.driverVelocityMetersPerSecondXYZ);
    this.onIntegrate?.(request);
    if (this.throwDuringIntegrate !== undefined) throw this.throwDuringIntegrate;
    return Object.freeze({
      didStepUp: this.didStepUpDuringIntegrate,
      maximumSolverCorrectionMeters: this.maximumSolverCorrectionMeters,
    });
  }

  isIntegrateRollbackExternallySafe(): boolean {
    return this.integrateRollbackExternallySafe;
  }

  readCurrentContacts(): readonly BabylonCharacterBodyNativeContactV1[] {
    return this.contacts;
  }

  dispose(): void {
    this.disposeCalls += 1;
    if (this.throwDuringDispose !== undefined) throw this.throwDuringDispose;
  }
}

const engines: NullEngine[] = [];

function createOptions(
  overrides: Partial<BabylonCharacterBodyPortOptionsV1> = {},
): BabylonCharacterBodyPortOptionsV1 {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  return {
    schemaVersion: 1,
    providerVersions: BABYLON_CHARACTER_BODY_PROVIDER_VERSIONS_V1,
    scene,
    fixedDeltaSeconds: 1 / 60,
    gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
    capsule: {
      heightMeters: 1.8,
      radiusMeters: 0.35,
    },
    controller: {
      keepDistanceMeters: 0.05,
      keepContactToleranceMeters: 0.1,
      maxSlopeDegrees: 45,
      maxStepHeightMeters: 0.3,
      characterMassKilograms: 80,
    },
    resetState: {
      positionMetersXYZ: [0, 1, 0],
      linearVelocityMetersPerSecondXYZ: [0, 0, 0],
    },
    ...overrides,
  };
}

function createPort(
  driver = new FakeNativeDriver(),
  options = createOptions(),
) {
  const port = createBabylonCharacterBodyPortForTestingV1(options, (allocation) => {
    driver.allocation = allocation;
    return driver;
  }) as BabylonCharacterBodyTransactionPortV1;
  return { driver, port, options };
}

function retainedSupport(
  port: BabylonCharacterBodyTransactionPortV1,
) {
  return (port as BabylonCharacterBodyRuntimePortV1)
    .retainedCharacterSupportSample();
}

function proposal(
  token: MovementTickTokenV1,
  tick: number,
  translationDeltaMetersXYZ: Vec3 = [0.25, 0, -0.5],
  proposedLinearVelocityMetersPerSecondXYZ: Vec3 = [15, 0, -30],
): MovementProposalV1 {
  return Object.freeze({
    schemaVersion: 1,
    token,
    tick,
    translationDeltaMetersXYZ: Object.freeze([...translationDeltaMetersXYZ]) as Vec3,
    proposedLinearVelocityMetersPerSecondXYZ:
      Object.freeze([...proposedLinearVelocityMetersPerSecondXYZ]) as Vec3,
    proposedFacingYawRadians: 0,
    layeredMoves: Object.freeze([]),
  });
}

function beginAndResolve(
  port: ReturnType<typeof createPort>["port"],
  tick = 1,
  delta: Vec3 = [0.25, 0, -0.5],
) {
  const token = createMovementTickTokenV1();
  const sample = port.beginTick({ token, tick });
  const movementProposal = proposal(token, tick, delta);
  const resolution = port.resolve({ token, proposal: movementProposal });
  return { token, sample, proposal: movementProposal, resolution };
}

function movementOptions(): CharacterMovementRuntimeOptionsV1 {
  return {
    schemaVersion: 1,
    fixedDeltaSeconds: 1 / 60,
    jumpVariantPolicy: { mode: "hold-height" },
    initialState: {
      schemaVersion: 1,
      tick: 0,
      positionMetersXYZ: [0, 1, 0],
      facingYawRadians: 0,
      linearVelocityMetersPerSecondXYZ: [0, 0, 0],
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
      transitionEvents: [],
      runtimeState: {
        schemaVersion: 1,
        coyoteTicksRemaining: 0,
        jumpBufferTicksRemaining: 0,
        variableJumpHoldTicksRemaining: 0,
        landingTicksRemaining: 0,
        apexCrossedInAirborneEpisode: false,
      },
    },
    walkSpeedMetersPerSecond: 2.4,
    runSpeedMetersPerSecond: 4,
    accelerationMetersPerSecondSquared: 16,
    decelerationMetersPerSecondSquared: 22,
    airControlRatio: 0.3,
    gravityMetersPerSecondSquared: 9.81,
    jumpSpeedMetersPerSecond: 5.5,
    coyoteTimeSeconds: 0.1,
    jumpBufferSeconds: 0.12,
    variableJumpHoldSeconds: 0.18,
    jumpHoldGravityRatio: 0.45,
    jumpReleaseGravityRatio: 2,
    landingDurationTicks: 2,
    apexEnterSpeedMetersPerSecond: 0.05,
    apexExitSpeedMetersPerSecond: 0.15,
  };
}

function movementCommand(
  tick: number,
  overrides: Partial<CharacterMovementCommandV1> = {},
): CharacterMovementCommandV1 {
  return {
    schemaVersion: 1,
    tick,
    fixedDeltaSeconds: 1 / 60,
    movementInputXZ: [0, 0],
    runRequested: false,
    jumpPressed: false,
    jumpHeld: false,
    viewYawRadians: 0,
    layeredMoves: [],
    ...overrides,
  };
}

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
});

describe("BabylonCharacterBodyPortV1 options and ownership", () => {
  it("ignores a second package-level argument and never admits a fake native driver", () => {
    const driver = new FakeNativeDriver();
    const options = createOptions();
    let fakeFactoryInvoked = false;
    let result: ReturnType<typeof createProductionBabylonCharacterBodyPortV1> | undefined;
    let productionError: unknown;

    try {
      result = (createProductionBabylonCharacterBodyPortV1 as unknown as (
        input: BabylonCharacterBodyPortOptionsV1,
        dependencies: unknown,
      ) => ReturnType<typeof createProductionBabylonCharacterBodyPortV1>)(options, {
        nativeDriverFactory() {
          fakeFactoryInvoked = true;
          return driver;
        },
      });
    } catch (error) {
      productionError = error;
    } finally {
      result?.dispose();
    }

    expect(fakeFactoryInvoked).toBe(false);
    expect(productionError).toBeInstanceOf(Error);

    if (false) {
      // @ts-expect-error The production package factory accepts exactly one argument.
      createProductionBabylonCharacterBodyPortV1(options, {});
    }
  });

  it("validates and freezes the exact locked provider configuration before allocation", () => {
    const driver = new FakeNativeDriver();
    const options = createOptions();
    const { port } = createPort(driver, options);

    expect(driver.allocation).toMatchObject({
      scene: options.scene,
      capsule: { heightMeters: 1.8, radiusMeters: 0.35 },
      initialPositionMetersXYZ: [0, 1, 0],
    });
    expect(Object.isFrozen(driver.allocation)).toBe(true);
    expect(Object.isFrozen(driver.allocation!.capsule)).toBe(true);
    expect(Object.isFrozen(driver.configuration)).toBe(true);
    expect(Object.isFrozen(driver.configuration!.gravityDirectionXYZ)).toBe(true);
    expect(driver.configuration).toMatchObject({
      fixedDeltaSeconds: 1 / 60,
      gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
      gravityDirectionXYZ: [0, -1, 0],
      maxSlopeCosine: Math.cos(Math.PI / 4),
    });
    port.dispose();
  });

  it.each([
    ["extra key", (options: BabylonCharacterBodyPortOptionsV1) => ({ ...options, extra: true })],
    ["wrong Babylon version", (options: BabylonCharacterBodyPortOptionsV1) => ({
      ...options,
      providerVersions: { ...options.providerVersions, babylonJs: "9.21.1" },
    })],
    ["zero fixed delta", (options: BabylonCharacterBodyPortOptionsV1) => ({ ...options, fixedDeltaSeconds: 0 })],
    ["non-Scene provider handle", (options: BabylonCharacterBodyPortOptionsV1) => ({
      ...options,
      scene: {},
    })],
    ["zero gravity", (options: BabylonCharacterBodyPortOptionsV1) => ({
      ...options,
      gravityMetersPerSecondSquaredXYZ: [0, 0, 0],
    })],
    ["tilted V1 gravity", (options: BabylonCharacterBodyPortOptionsV1) => ({
      ...options,
      gravityMetersPerSecondSquaredXYZ: [1, -9.81, 0],
    })],
    ["non-finite reset position", (options: BabylonCharacterBodyPortOptionsV1) => ({
      ...options,
      resetState: { ...options.resetState, positionMetersXYZ: [0, Number.NaN, 0] },
    })],
    ["non-positive capsule", (options: BabylonCharacterBodyPortOptionsV1) => ({
      ...options,
      capsule: { ...options.capsule, radiusMeters: 0 },
    })],
  ])("rejects %s before allocating a native controller", (_name, mutate) => {
    const driver = new FakeNativeDriver();
    let allocations = 0;
    expect(() => createBabylonCharacterBodyPortForTestingV1(
      mutate(createOptions()) as never,
      () => {
        allocations += 1;
        return driver;
      },
    )).toThrow("3C_INPUT_INVALID");
    expect(allocations).toBe(0);
    expect(driver.disposeCalls).toBe(0);
  });

  it("disposes once and preserves the primary failure when construction fails after allocation", () => {
    const driver = new FakeNativeDriver();
    const primary = new Error("native configure failed");
    driver.throwDuringConfigure = primary;
    driver.throwDuringDispose = new Error("native dispose failed");

    let error: unknown;
    try {
      createPort(driver);
    } catch (reason) {
      error = reason;
    }

    expect(error).toBe(primary);
    expect(driver.disposeCalls).toBe(1);
  });

  it("keeps two ports and scenes physically and transactionally isolated", () => {
    const driverA = new FakeNativeDriver();
    const driverB = new FakeNativeDriver();
    driverB.position = [10, 2, 30];
    const first = createPort(driverA);
    const secondOptions = createOptions({
      resetState: {
        positionMetersXYZ: [10, 2, 30],
        linearVelocityMetersPerSecondXYZ: [0, 0, 0],
      },
    });
    const second = createPort(driverB, secondOptions);

    const token = createMovementTickTokenV1();
    const firstSample = first.port.beginTick({ token, tick: 1 });
    expect(firstSample.positionMetersXYZ).toEqual([0, 1, 0]);
    expect(() => second.port.beginTick({ token, tick: 1 }))
      .toThrow("3C_TICK_TOKEN_STALE");

    const secondResult = beginAndResolve(second.port, 1, [1, 0, 0]);
    expect(secondResult.resolution.positionMetersXYZ).toEqual([11, 2, 30]);
    expect(driverA.position).toEqual([0, 1, 0]);
    first.port.dispose();
    second.port.dispose();
  });
});

describe("BabylonCharacterBodyPortV1 transaction", () => {
  it("retains reset contacts only inside the character-body vertical band", () => {
    const { driver, port } = createPort();
    const exactIdentity = {
      colliderSubshapeId: "collider:ground:primary",
      traversalSurfaceId: "traversal-surface:ground",
      surfaceEntityId: "ground",
    } as const;
    driver.contacts = [{
      ...groundContact(),
      pointMetersXYZ: [0, 0.15, 0],
      ...exactIdentity,
    }, {
      ...groundContact(),
      pointMetersXYZ: [0, 0.151, 0],
      ...exactIdentity,
    }, {
      ...groundContact([1, 0, 0]),
      pointMetersXYZ: [0, 0.15, 0],
      ...exactIdentity,
    }];

    port.resetToState({
      positionMetersXYZ: [0, 0.9, 0],
      linearVelocityMetersPerSecondXYZ: [0, 0, 0],
    });

    expect(driver.checkSupportCalls).toBe(1);
    expect(retainedSupport(port)?.supportContacts).toEqual([{
      pointMetersXYZ: [0, 0.15, 0],
      normalXYZ: [0, 1, 0],
      ...exactIdentity,
    }]);
    port.dispose();
  });

  it("restores the committed retained contact band after abort", () => {
    const { driver, port } = createPort();
    const exactIdentity = {
      colliderSubshapeId: "collider:ground:primary",
      traversalSurfaceId: "traversal-surface:ground",
      surfaceEntityId: "ground",
    } as const;
    driver.contacts = [{
      ...groundContact(),
      pointMetersXYZ: [0, 0.15, 0],
      ...exactIdentity,
    }];
    port.resetToState({
      positionMetersXYZ: [0, 0.9, 0],
      linearVelocityMetersPerSecondXYZ: [0, 0, 0],
    });
    const committed = retainedSupport(port);
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });
    driver.onIntegrate = () => {
      driver.contacts = [{
        ...groundContact(),
        pointMetersXYZ: [0, 0.151, 0],
        ...exactIdentity,
      }];
    };
    port.resolve({ token, proposal: proposal(token, 1, [0, 0, 0], [0, 0, 0]) });

    expect(retainedSupport(port)).toEqual(committed);
    port.abortTick(token);
    expect(retainedSupport(port)).toEqual(committed);
    expect(driver.checkSupportCalls).toBe(2);
    port.dispose();
  });

  it("captures immutable pre-proposal position, velocity, and support with one support query", () => {
    const { driver, port } = createPort();
    driver.position = [2, 3, 4];
    driver.velocity = [5, -6, 7];
    driver.support = supportedSupport([0, 1, 0]);
    driver.contacts = [{ ...groundContact(), pointMetersXYZ: [2, 2.1, 4] }];
    const token = createMovementTickTokenV1();

    const sample = port.beginTick({ token, tick: 9 });

    expect(driver.checkSupportCalls).toBe(1);
    expect(sample).toEqual({
      schemaVersion: 1,
      token,
      tick: 9,
      positionMetersXYZ: [2, 3, 4],
      linearVelocityMetersPerSecondXYZ: [5, -6, 7],
      support: {
        mode: "supported",
        pointMetersXYZ: [2, 2.1, 4],
        normalXYZ: [0, 1, 0],
        isDynamic: false,
      },
    });
    expect(Object.isFrozen(sample)).toBe(true);
    expect(Object.isFrozen(sample.support)).toBe(true);
    port.dispose();
  });

  it("normalizes native support once and passes the same canonical normal to integrate", () => {
    const { driver, port } = createPort();
    driver.support = supportedSupport([0, 2, 0]);
    const token = createMovementTickTokenV1();

    const sample = port.beginTick({ token, tick: 1 });
    port.resolve({ token, proposal: proposal(token, 1) });

    expect(sample.support).toMatchObject({
      mode: "supported",
      normalXYZ: [0, 1, 0],
    });
    expect(driver.lastIntegrateRequest?.supportBeforeIntegrate)
      .toMatchObject({
        mode: "supported",
        averageSurfaceNormalXYZ: [0, 1, 0],
      });
    port.dispose();
  });

  it("allows an immediate failed-begin retry but stales it after a newer begin succeeds", () => {
    const immediate = createPort();
    const token = createMovementTickTokenV1();
    immediate.driver.support = {
      ...supportedSupport(),
      averageSurfaceNormalXYZ: [Number.NaN, 1, 0],
    };
    expect(() => immediate.port.beginTick({ token, tick: 1 }))
      .toThrow("3C_INPUT_INVALID");
    immediate.driver.support = supportedSupport();
    expect(immediate.port.beginTick({ token, tick: 1 }).token).toBe(token);
    immediate.port.dispose();

    const superseded = createPort();
    const failedToken = createMovementTickTokenV1();
    superseded.driver.support = {
      ...supportedSupport(),
      averageSurfaceNormalXYZ: [Number.NaN, 1, 0],
    };
    expect(() => superseded.port.beginTick({ token: failedToken, tick: 1 }))
      .toThrow("3C_INPUT_INVALID");
    superseded.driver.support = supportedSupport();
    beginAndResolve(superseded.port, 2);
    expect(() => superseded.port.beginTick({ token: failedToken, tick: 1 }))
      .toThrow("3C_TICK_TOKEN_STALE");
    superseded.port.dispose();
  });

  it("rejects duplicate begin and duplicate resolve with their stable diagnostics", () => {
    const { port } = createPort();
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });
    expect(() => port.beginTick({ token, tick: 1 }))
      .toThrow("3C_SUPPORT_SAMPLE_DUPLICATE");
    const request: BodyResolveRequestV1 = { token, proposal: proposal(token, 1) };
    port.resolve(request);
    expect(() => port.resolve(request)).toThrow("3C_BODY_RESOLUTION_DUPLICATE");
    port.dispose();
  });

  it("rejects stale, wrong-tick, cross-port, reset-invalidated, and disposed tokens", () => {
    const first = createPort();
    const second = createPort();
    const token = createMovementTickTokenV1();
    first.port.beginTick({ token, tick: 4 });
    expect(() => first.port.resolve({ token, proposal: proposal(token, 5) }))
      .toThrow("3C_TICK_TOKEN_STALE");
    expect(() => second.port.resolve({ token, proposal: proposal(token, 4) }))
      .toThrow("3C_TICK_TOKEN_STALE");
    first.port.reset();
    expect(() => first.port.resolve({ token, proposal: proposal(token, 4) }))
      .toThrow("3C_TICK_TOKEN_STALE");
    first.port.dispose();
    expect(() => first.port.beginTick({ token: createMovementTickTokenV1(), tick: 5 }))
      .toThrow("3C_RUNTIME_DISPOSED");
    second.port.dispose();
  });

  it("drives collision with the exact proposal translation including Root Motion", () => {
    const { driver, port } = createPort();
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });
    const rootMotionProposal: MovementProposalV1 = Object.freeze({
      ...proposal(token, 1, [0.6, 0.12, -0.3], [0, 0, 0]),
      layeredMoves: Object.freeze([Object.freeze({
        schemaVersion: 1,
        kind: "root-motion",
        id: "action.root",
        priority: 10,
        startedTick: 1,
        rootMotionSourceRef: "worldkit://root-motion/action.root@1",
        rootMotionSourceHash: `sha256:${"a".repeat(64)}`,
        translationDeltaMetersXYZ: Object.freeze([0.6, 0.12, -0.3]) as Vec3,
        facingYawDeltaRadians: 0,
      })]),
    });

    port.resolve({ token, proposal: rootMotionProposal });

    expect(driver.integrateCalls).toBe(1);
    expect(driver.lastIntegrateRequest).toMatchObject({
      translationDeltaMetersXYZ: [0.6, 0.12, -0.3],
      driverVelocityMetersPerSecondXYZ: [36, 7.2, -18],
    });
    expect(driver.lastIntegrateRequest).not.toHaveProperty(
      "proposedLinearVelocityMetersPerSecondXYZ",
    );
    port.dispose();
  });

  it("removes transient Root Motion from persisted post-resolve velocity", () => {
    const { driver, port } = createPort();
    driver.contacts = [];
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });
    const semanticVelocity: Vec3 = [2, 0, 0];
    const rootTranslation: Vec3 = [0.5, 0.2, 0];
    const totalTranslation: Vec3 = [
      rootTranslation[0] + semanticVelocity[0] / 60,
      rootTranslation[1] + semanticVelocity[1] / 60,
      0,
    ];
    const rootProposal: MovementProposalV1 = Object.freeze({
      ...proposal(token, 1, totalTranslation, semanticVelocity),
      layeredMoves: Object.freeze([Object.freeze({
        schemaVersion: 1,
        kind: "root-motion",
        id: "vault",
        priority: 10,
        startedTick: 1,
        rootMotionSourceRef: "worldkit://root-motion/vault@1",
        rootMotionSourceHash: `sha256:${"b".repeat(64)}`,
        translationDeltaMetersXYZ: rootTranslation,
        facingYawDeltaRadians: 0,
      })]),
    });

    const resolution = port.resolve({ token, proposal: rootProposal });
    expect(driver.lastIntegrateRequest?.translationDeltaMetersXYZ)
      .toEqual(totalTranslation);
    expect(resolution.linearVelocityMetersPerSecondXYZ).toEqual(semanticVelocity);
    const nextToken = createMovementTickTokenV1();
    expect(port.beginTick({ token: nextToken, tick: 2 })
      .linearVelocityMetersPerSecondXYZ).toEqual(semanticVelocity);
    port.dispose();
  });

  it("keeps horizontal and upward Root Motion transient across runtime-plus-port Ticks", () => {
    const runtime = createCharacterMovementRuntimeV1(movementOptions());
    const { port } = createPort();
    const rootMove = Object.freeze({
      schemaVersion: 1 as const,
      kind: "root-motion" as const,
      id: "runtime-vault",
      priority: 10,
      startedTick: 1,
      rootMotionSourceRef: "worldkit://root-motion/runtime-vault@1" as const,
      rootMotionSourceHash: `sha256:${"d".repeat(64)}` as const,
      translationDeltaMetersXYZ: Object.freeze([0.5, 0.2, 0]) as Vec3,
      facingYawDeltaRadians: 0,
    });
    const token = runtime.beginTick(movementCommand(1, {
      layeredMoves: [rootMove],
    }));
    const sample = port.beginTick({ token, tick: 1 });
    const proposal = runtime.proposeMovement(token, sample);
    const resolution = port.resolve({ token, proposal });
    const commit = runtime.reconcile(token, resolution);

    expect(proposal.translationDeltaMetersXYZ).toEqual([0.5, 0.2, 0]);
    expect(commit.linearVelocityMetersPerSecondXYZ).toEqual([0, 0, 0]);
    expect(commit.locomotion.status).toBe("active");
    if (commit.locomotion.status !== "active") throw new Error("expected active locomotion");
    expect(commit.locomotion.verticalPhase).not.toBe("rising");
    expect(commit.locomotion.verticalPhase).not.toBe("takeoff");

    const nextToken = runtime.beginTick(movementCommand(2));
    expect(port.beginTick({ token: nextToken, tick: 2 })
      .linearVelocityMetersPerSecondXYZ).toEqual([0, 0, 0]);
    runtime.dispose();
    port.dispose();
  });

  it("does not create reverse velocity when Root Motion is collision-blocked", () => {
    const { driver, port } = createPort();
    driver.onIntegrate = () => {
      driver.position = [0.1, 1, 0];
      driver.velocity = [0, 0, 0];
      driver.contacts = [{
        ...groundContact([-1, 0, 0]),
        pointMetersXYZ: [0.1, 1, 0],
      }];
    };
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });
    const rootProposal: MovementProposalV1 = Object.freeze({
      ...proposal(token, 1, [0.55, 0, 0], [3, 0, 0]),
      layeredMoves: Object.freeze([Object.freeze({
        schemaVersion: 1,
        kind: "root-motion",
        id: "blocked-vault",
        priority: 10,
        startedTick: 1,
        rootMotionSourceRef: "worldkit://root-motion/blocked-vault@1",
        rootMotionSourceHash: `sha256:${"c".repeat(64)}`,
        translationDeltaMetersXYZ: Object.freeze([0.5, 0, 0]) as Vec3,
        facingYawDeltaRadians: 0,
      })]),
    });

    expect(port.resolve({ token, proposal: rootProposal })
      .linearVelocityMetersPerSecondXYZ).toEqual([0, 0, 0]);
    port.dispose();
  });

  it.each([
    ["pure Root Motion", [0, 0, 0] as Vec3],
    ["mixed base and Root Motion", [0.3, 0, 0] as Vec3],
  ])("makes %s contact-cone velocity byte-identical for every contact permutation", (
    _case,
    semanticVelocity,
  ) => {
    const rootTranslation = Object.freeze([1 / 60, 0, 0]) as Vec3;
    const contacts = [
      {
        ...groundContact([-1, 0, 0]),
        pointMetersXYZ: [0.1, 1, 0] as Vec3,
      },
      {
        ...groundContact([-Math.SQRT1_2, 0, -Math.SQRT1_2]),
        pointMetersXYZ: [0.1, 1, 0.1] as Vec3,
      },
    ] as const;
    const resolveForOrder = (
      orderedContacts: readonly BabylonCharacterBodyNativeContactV1[],
    ): Vec3 => {
      const { driver, port } = createPort();
      driver.onIntegrate = () => {
        driver.position = [0, 1, 0];
        driver.velocity = [0, 0, 0];
        driver.contacts = [...orderedContacts];
      };
      const token = createMovementTickTokenV1();
      port.beginTick({ token, tick: 1 });
      const semanticDelta = semanticVelocity.map((value) => value / 60) as unknown as Vec3;
      const totalDelta = Object.freeze([
        rootTranslation[0] + semanticDelta[0],
        0,
        0,
      ]) as Vec3;
      const rootProposal: MovementProposalV1 = Object.freeze({
        ...proposal(token, 1, totalDelta, semanticVelocity),
        layeredMoves: Object.freeze([Object.freeze({
          schemaVersion: 1,
          kind: "root-motion",
          id: "corner-root",
          priority: 10,
          startedTick: 1,
          rootMotionSourceRef: "worldkit://root-motion/corner-root@1",
          rootMotionSourceHash: `sha256:${"e".repeat(64)}`,
          translationDeltaMetersXYZ: rootTranslation,
          facingYawDeltaRadians: 0,
        })]),
      });
      const velocity = port.resolve({ token, proposal: rootProposal })
        .linearVelocityMetersPerSecondXYZ;
      port.dispose();
      return velocity;
    };

    const forward = resolveForOrder(contacts);
    const reverse = resolveForOrder([...contacts].reverse());

    expect(JSON.stringify(reverse)).toBe(JSON.stringify(forward));
    for (const velocity of [forward, reverse]) {
      for (const contact of contacts) {
        expect(
          velocity[0] * contact.normalXYZ[0] +
            velocity[1] * contact.normalXYZ[1] +
            velocity[2] * contact.normalXYZ[2],
        ).toBeGreaterThanOrEqual(-1e-10);
      }
    }
  });

  it("rejects provider-created horizontal progress beyond the exact proposal", () => {
    const { driver, port } = createPort();
    driver.onIntegrate = () => {
      driver.position = [0.80, 1.2, 0];
      driver.velocity = [0.6, 0, 0];
    };
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });

    expect(() => port.resolve({
      token,
      proposal: proposal(token, 1, [0.01, 0, 0], [0.6, 0, 0]),
    })).toThrow("3C_INPUT_INVALID");
    port.dispose();
  });

  it("accepts bounded Babylon solver correction without treating it as motion amplification", () => {
    const { driver, port } = createPort();
    driver.maximumSolverCorrectionMeters = 1e-4;
    driver.onIntegrate = () => {
      driver.position = [0.01005, 1, 0];
      driver.velocity = [0.6, 0, 0];
    };
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });

    expect(() => port.resolve({
      token,
      proposal: proposal(token, 1, [0.01, 0, 0], [0.6, 0, 0]),
    })).not.toThrow();
    port.dispose();
  });

  it("rejects padded step-up progress beyond the exact horizontal proposal", () => {
    const { driver, port } = createPort();
    driver.didStepUpDuringIntegrate = true;
    driver.onIntegrate = () => {
      driver.position = [0.15, 0.997, 0];
      driver.velocity = [0.6, 0, 0];
    };
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });

    expect(() => port.resolve({
      token,
      proposal: proposal(token, 1, [0.01, 0, 0], [0.6, 0, 0]),
    })).toThrow("3C_INPUT_INVALID");
    port.dispose();
  });

  it.each([
    ["perpendicular horizontal", [0.01, 1, 10] as Vec3],
    ["opposite horizontal", [-10, 1, 0] as Vec3],
    ["vertical beyond max step", [0.01, 1.31, 0] as Vec3],
  ])("rejects unexplained %s displacement amplification", (_case, position) => {
    const { driver, port } = createPort();
    driver.onIntegrate = () => {
      driver.position = cloneVec3(position);
      driver.velocity = [0.6, 0, 0];
    };
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });

    expect(() => port.resolve({
      token,
      proposal: proposal(token, 1, [0.01, 0, 0], [0.6, 0, 0]),
    })).toThrow("3C_INPUT_INVALID");
    port.dispose();
  });

  it("rejects step-height downward amplification while unsupported", () => {
    const { driver, port } = createPort();
    driver.support = unsupportedSupport();
    driver.contacts = [];
    driver.onIntegrate = (request) => {
      driver.position = [
        request.translationDeltaMetersXYZ[0],
        1 + request.translationDeltaMetersXYZ[1] - 0.2,
        request.translationDeltaMetersXYZ[2],
      ];
      driver.velocity = cloneVec3(request.driverVelocityMetersPerSecondXYZ);
      driver.contacts = [];
    };
    const token = createMovementTickTokenV1();
    expect(port.beginTick({ token, tick: 1 }).support.mode).toBe("unsupported");

    expect(() => port.resolve({
      token,
      proposal: proposal(token, 1, [0, -1 / 60, 0], [0, -1, 0]),
    })).toThrow("3C_INPUT_INVALID");
    port.dispose();
  });

  it.each(["supported", "sliding"] as const)(
    "allows bounded downward slope projection while %s",
    (supportMode) => {
      const { driver, port } = createPort();
      driver.support = {
        ...supportedSupport([0, 0.999989, 0.004687]),
        mode: supportMode,
      };
      driver.contacts = [];
      driver.onIntegrate = (request) => {
        driver.position = [
          request.translationDeltaMetersXYZ[0],
          1 + request.translationDeltaMetersXYZ[1],
          0.0000127567,
        ];
        driver.velocity = cloneVec3(request.driverVelocityMetersPerSecondXYZ);
        driver.contacts = [];
      };
      const token = createMovementTickTokenV1();
      expect(port.beginTick({ token, tick: 1 }).support.mode).toBe(supportMode);

      const resolution = port.resolve({
        token,
        proposal: proposal(
          token,
          1,
          [0, -0.0027215494, 0],
          [0, -0.163292964, 0],
        ),
      });

      expect(resolution.appliedTranslationMetersXYZ[2])
        .toBeCloseTo(0.0000127567, 10);
      port.dispose();
    },
  );

  it.each([
    ["beyond the supported bound", "supported", -0.0027215494, 0.000012758],
    ["against the slope direction", "supported", -0.0027215494, -0.0000127567],
    ["while unsupported", "unsupported", -0.0027215494, 0.0000127567],
    ["for an upward proposal", "supported", 0.0027215494, 0.0000127567],
  ] as const)(
    "rejects slope-tangential displacement %s",
    (_case, supportMode, proposedYMeters, appliedZMeters) => {
      const { driver, port } = createPort();
      driver.support = supportMode === "unsupported"
        ? unsupportedSupport()
        : supportedSupport([0, 0.999989, 0.004687]);
      driver.contacts = [];
      driver.onIntegrate = (request) => {
        driver.position = [
          request.translationDeltaMetersXYZ[0],
          1 + request.translationDeltaMetersXYZ[1],
          appliedZMeters,
        ];
        driver.velocity = cloneVec3(request.driverVelocityMetersPerSecondXYZ);
        driver.contacts = [];
      };
      const token = createMovementTickTokenV1();
      port.beginTick({ token, tick: 1 });

      expect(() => port.resolve({
        token,
        proposal: proposal(
          token,
          1,
          [0, proposedYMeters, 0],
          [0, proposedYMeters * 60, 0],
        ),
      })).toThrow("3C_INPUT_INVALID");
      port.dispose();
    },
  );

  it("allows a bounded downhill projection from an active walkable landing contact", () => {
    const { driver, port } = createPort();
    driver.support = unsupportedSupport();
    driver.contacts = [];
    driver.onIntegrate = () => {
      driver.position = [
        0,
        1 - 0.0000013963066463063,
        0.000298391886385474,
      ];
      driver.velocity = [0, 0, 0];
      driver.contacts = [{
        ...groundContact([0, 0.9999890138533573, 0.004687448409305356]),
        distanceMeters: 0.10488346219062805,
      }];
    };
    const token = createMovementTickTokenV1();
    expect(port.beginTick({ token, tick: 1 }).support.mode).toBe("unsupported");

    const resolution = port.resolve({
      token,
      proposal: proposal(
        token,
        1,
        [0, -0.06365833333333333, 0],
        [0, -3.8195, 0],
      ),
    });

    expect(resolution.appliedTranslationMetersXYZ[2])
      .toBeCloseTo(0.000298391886385474, 12);
    port.dispose();
  });

  it.each([
    ["beyond the contact projection bound", -0.06365833333333333, 0.10488346219062805, 0.000298394],
    ["from an inactive distant contact", -0.06365833333333333, 0.16, 0.000298391886385474],
    ["for an upward proposal", 0.06365833333333333, 0.10488346219062805, 0.000298391886385474],
  ] as const)(
    "rejects landing slope projection %s",
    (_case, proposedYMeters, contactDistanceMeters, appliedZMeters) => {
      const { driver, port } = createPort();
      driver.support = unsupportedSupport();
      driver.contacts = [];
      driver.onIntegrate = () => {
        driver.position = [0, 1, appliedZMeters];
        driver.velocity = [0, 0, 0];
        driver.contacts = [{
          ...groundContact([0, 0.9999890138533573, 0.004687448409305356]),
          distanceMeters: contactDistanceMeters,
        }];
      };
      const token = createMovementTickTokenV1();
      port.beginTick({ token, tick: 1 });

      expect(() => port.resolve({
        token,
        proposal: proposal(
          token,
          1,
          [0, proposedYMeters, 0],
          [0, proposedYMeters * 60, 0],
        ),
      })).toThrow("3C_INPUT_INVALID");
      port.dispose();
    },
  );

  it("allows only the frozen support-surface velocity contribution from a moving base", () => {
    const { driver, port } = createPort();
    driver.support = {
      ...supportedSupport(),
      isSurfaceDynamic: true,
      averageSurfaceVelocityMetersPerSecondXYZ: [0, 0, 6],
    };
    driver.onIntegrate = () => {
      driver.position = [0.01, 1, 0.1];
      driver.velocity = [0.6, 0, 6];
    };
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });

    expect(port.resolve({
      token,
      proposal: proposal(token, 1, [0.01, 0, 0], [0.6, 0, 0]),
    }).appliedTranslationMetersXYZ).toEqual([0.01, 0, 0.1]);
    port.dispose();
  });

  it("allows takeoff when the frozen support translation is not applied", () => {
    const { driver, port } = createPort();
    driver.support = {
      ...supportedSupport([0, 0.9999890138533574, 0.004687448409305357]),
      averageSurfaceVelocityMetersPerSecondXYZ: [
        0,
        0.00020703446300274209,
        9.704740260435551e-7,
      ],
    };
    driver.contacts = [];
    driver.onIntegrate = (request) => {
      driver.position = [0, 1 + request.translationDeltaMetersXYZ[1], 0];
      driver.velocity = cloneVec3(request.driverVelocityMetersPerSecondXYZ);
      driver.contacts = [];
    };
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });

    const resolution = port.resolve({
      token,
      proposal: proposal(
        token,
        1,
        [0, 0.09166666666666666, 0],
        [0, 5.5, 0],
      ),
    });

    expect(resolution.appliedTranslationMetersXYZ)
      .toEqual([0, 0.09166666666666656, 0]);
    port.dispose();
  });

  it.each([
    [
      "beyond its frozen bound",
      0.09166666666666666 + 0.0000034505743833790347,
      1.6174567100725918e-8 + 2e-9,
    ],
    [
      "against its frozen direction",
      0.09166666666666666,
      -1.6174567100725918e-8,
    ],
  ] as const)(
    "rejects takeoff support translation %s",
    (_case, appliedYMeters, appliedZMeters) => {
      const { driver, port } = createPort();
      driver.support = {
        ...supportedSupport([0, 0.9999890138533574, 0.004687448409305357]),
        averageSurfaceVelocityMetersPerSecondXYZ: [
          0,
          0.00020703446300274209,
          9.704740260435551e-7,
        ],
      };
      driver.contacts = [];
      driver.onIntegrate = (request) => {
        driver.position = [0, 1 + appliedYMeters, appliedZMeters];
        driver.velocity = cloneVec3(request.driverVelocityMetersPerSecondXYZ);
        driver.contacts = [];
      };
      const token = createMovementTickTokenV1();
      port.beginTick({ token, tick: 1 });

      expect(() => port.resolve({
        token,
        proposal: proposal(
          token,
          1,
          [0, 0.09166666666666666, 0],
          [0, 5.5, 0],
        ),
      })).toThrow("3C_INPUT_INVALID");
      port.dispose();
    },
  );

  it("returns coherent collision-shortened displacement, limitation, and native post velocity", () => {
    const { driver, port } = createPort();
    driver.onIntegrate = (request) => {
      driver.position = [0.1, 1, -0.2];
      driver.velocity = [1.5, 0, -3];
      driver.contacts = [groundContact()];
      expect(request.translationDeltaMetersXYZ).toEqual([0.25, 0, -0.5]);
    };

    const { resolution } = beginAndResolve(port);

    expect(resolution).toMatchObject({
      positionMetersXYZ: [0.1, 1, -0.2],
      appliedTranslationMetersXYZ: [0.1, 0, -0.2],
      linearVelocityMetersPerSecondXYZ: [1.5, 0, -3],
      isTranslationLimited: true,
      hasCeilingContact: false,
      support: { mode: "supported", normalXYZ: [0, 1, 0] },
    });
    expect(Object.isFrozen(resolution)).toBe(true);
    expect(Object.isFrozen(resolution.appliedTranslationMetersXYZ)).toBe(true);
    port.dispose();
  });

  it.each([
    ["takeoff", [0, 0.2, 0] as Vec3, [groundContact()], [0, 12, 0] as Vec3, "unsupported", false],
    ["ledge", [0.4, -0.1, 0] as Vec3, [], [24, -6, 0] as Vec3, "unsupported", false],
    ["landing", [0, -0.4, 0] as Vec3, [groundContact()], [0, 0, 0] as Vec3, "supported", false],
    ["sliding slope", [0.2, -0.1, 0] as Vec3, [groundContact([0.8, 0.6, 0])], [12, -6, 0] as Vec3, "sliding", false],
    ["ceiling", [0, 0.3, 0] as Vec3, [{
      ...groundContact([0, -1, 0]),
      pointMetersXYZ: [0, 1.8, 0] as Vec3,
    }], [0, 0, 0] as Vec3, "unsupported", true],
  ])("derives post-resolution %s support/ceiling from current contacts without a second query", (
    _name,
    delta,
    contacts,
    velocity,
    expectedMode,
    expectedCeiling,
  ) => {
    const { driver, port } = createPort();
    driver.onIntegrate = () => {
      driver.contacts = contacts;
      driver.velocity = cloneVec3(velocity);
      if (_name === "ceiling") driver.position = [0, 1.05, 0];
    };

    const { resolution } = beginAndResolve(port, 1, delta);

    expect(driver.checkSupportCalls).toBe(1);
    expect(driver.integrateCalls).toBe(1);
    expect(resolution.support.mode).toBe(expectedMode);
    expect(resolution.hasCeilingContact).toBe(expectedCeiling);
    if (resolution.support.mode !== "unsupported") {
      expect(Math.hypot(...resolution.support.normalXYZ)).toBeCloseTo(1, 12);
    }
    port.dispose();
  });

  it("keeps grounded support when native applies a numerical upward lift", () => {
    const { driver, port } = createPort();
    driver.support = supportedSupport();
    driver.contacts = [groundContact()];
    driver.onIntegrate = (request) => {
      driver.position = [
        request.translationDeltaMetersXYZ[0],
        1 + 4.958337362220844e-9,
        request.translationDeltaMetersXYZ[2],
      ];
      driver.velocity = [
        request.driverVelocityMetersPerSecondXYZ[0],
        2.975002416860662e-7,
        request.driverVelocityMetersPerSecondXYZ[2],
      ];
      driver.contacts = [groundContact()];
    };
    const token = createMovementTickTokenV1();
    expect(port.beginTick({ token, tick: 1 }).support.mode).toBe("supported");

    const resolution = port.resolve({
      token,
      proposal: proposal(token, 1, [0.04, 0, 0], [2.4, 0, 0]),
    });

    expect(resolution.support.mode).toBe("supported");
    port.commitTick(token);
    driver.support = supportedSupport();
    const next = createMovementTickTokenV1();
    expect(port.beginTick({ token: next, tick: 2 }).support.mode).toBe("supported");
    port.abortTick(next);
    port.dispose();
  });

  it("keeps an authored upward takeoff unsupported on the next support sample", () => {
    const { driver, port } = createPort();
    driver.support = supportedSupport();
    driver.contacts = [groundContact()];
    driver.onIntegrate = (request) => {
      driver.position = [0, 1 + request.translationDeltaMetersXYZ[1], 0];
      driver.velocity = cloneVec3(request.driverVelocityMetersPerSecondXYZ);
      driver.contacts = [groundContact()];
    };
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });
    expect(port.resolve({
      token,
      proposal: proposal(token, 1, [0, 5.5 / 60, 0], [0, 5.5, 0]),
    }).support.mode).toBe("unsupported");
    port.commitTick(token);

    driver.support = supportedSupport();
    const flight = createMovementTickTokenV1();
    expect(port.beginTick({ token: flight, tick: 2 }).support.mode)
      .toBe("unsupported");
    port.abortTick(flight);
    port.dispose();
  });

  it("does not keep takeoff unsupported after aborting the takeoff Tick", () => {
    const { driver, port } = createPort();
    driver.support = supportedSupport();
    driver.contacts = [groundContact()];
    driver.onIntegrate = (request) => {
      driver.position = [0, 1 + request.translationDeltaMetersXYZ[1], 0];
      driver.velocity = cloneVec3(request.driverVelocityMetersPerSecondXYZ);
      driver.contacts = [groundContact()];
    };
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });
    expect(port.resolve({
      token,
      proposal: proposal(token, 1, [0, 5.5 / 60, 0], [0, 5.5, 0]),
    }).support.mode).toBe("unsupported");
    port.abortTick(token);

    driver.support = supportedSupport();
    driver.velocity = [0, 0, 0];
    const next = createMovementTickTokenV1();
    expect(port.beginTick({ token: next, tick: 1 }).support.mode).toBe("supported");
    port.abortTick(next);
    port.dispose();
  });

  it("rolls back invalid native output and retries the same valid resolution safely", () => {
    const { driver, port } = createPort();
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });
    const request: BodyResolveRequestV1 = { token, proposal: proposal(token, 1) };
    driver.malformedPositionAfterIntegrate = true;

    expect(() => port.resolve(request)).toThrow("3C_INPUT_INVALID");
    expect(driver.position).toEqual([0, 1, 0]);
    expect(driver.restoreCalls).toBe(1);

    driver.malformedPositionAfterIntegrate = false;
    const result = port.resolve(request);
    expect(result.positionMetersXYZ).toEqual([0.25, 1, -0.5]);
    expect(driver.integrateCalls).toBe(2);
    port.dispose();
  });

  it("rolls back a throwing native integrate and lets the same request retry", () => {
    const { driver, port } = createPort();
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });
    const request: BodyResolveRequestV1 = { token, proposal: proposal(token, 1) };
    const primary = new Error("native integrate failed");
    driver.throwDuringIntegrate = primary;

    expect(() => port.resolve(request)).toThrow(primary);
    expect(driver.position).toEqual([0, 1, 0]);
    driver.throwDuringIntegrate = undefined;
    expect(port.resolve(request).positionMetersXYZ).toEqual([0.25, 1, -0.5]);
    port.dispose();
  });

  it("fails closed and releases the controller when transactional rollback fails", () => {
    const { driver, port } = createPort();
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });
    driver.malformedPositionAfterIntegrate = true;
    driver.throwDuringRestore = new Error("native rollback failed");

    expect(() => port.resolve({ token, proposal: proposal(token, 1) }))
      .toThrow("3C_INPUT_INVALID");
    expect(driver.disposeCalls).toBe(1);
    expect(() => port.beginTick({ token: createMovementTickTokenV1(), tick: 2 }))
      .toThrow("3C_RUNTIME_DISPOSED");
    port.dispose();
    expect(driver.disposeCalls).toBe(1);
  });

  it("fails closed after integrate failure when external rollback is not safe", () => {
    const { driver, port } = createPort();
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });
    const primary = new Error("native integrate failed after collision effects");
    driver.throwDuringIntegrate = primary;
    driver.integrateRollbackExternallySafe = false;

    expect(() => port.resolve({ token, proposal: proposal(token, 1) }))
      .toThrow(primary);
    expect(driver.restoreCalls).toBe(1);
    expect(driver.disposeCalls).toBe(1);
    expect(() => port.beginTick({ token: createMovementTickTokenV1(), tick: 2 }))
      .toThrow("3C_RUNTIME_DISPOSED");
  });

  it("reset restores the configured physical snapshot and invalidates outstanding tokens", () => {
    const options = createOptions({
      resetState: {
        positionMetersXYZ: [3, 4, 5],
        linearVelocityMetersPerSecondXYZ: [1, 2, 3],
      },
    });
    const { driver, port } = createPort(new FakeNativeDriver(), options);
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });
    driver.position = [100, 200, 300];
    driver.velocity = [9, 9, 9];

    port.reset();

    expect(driver.position).toEqual([3, 4, 5]);
    expect(driver.velocity).toEqual([1, 2, 3]);
    expect(() => port.resolve({ token, proposal: proposal(token, 1) }))
      .toThrow("3C_TICK_TOKEN_STALE");
    port.dispose();
  });

  it("stages a resolved native Tick until the Golden commit and restores exact pre-Tick state on abort", () => {
    const { driver, port } = createPort();
    const token = createMovementTickTokenV1();
    const before = driver.captureState();
    port.beginTick({ token, tick: 1 });
    port.resolve({ token, proposal: proposal(token, 1, [0.5, 0.25, -0.75]) });
    expect(driver.position).not.toEqual(before.position);

    port.abortTick(token);

    expect(driver.captureState()).toEqual(before);
    expect(() => port.abortTick(token)).toThrow("3C_TICK_TOKEN_STALE");
    expect(() => port.resolve({ token, proposal: proposal(token, 1) }))
      .toThrow("3C_TICK_TOKEN_STALE");
    const next = createMovementTickTokenV1();
    port.beginTick({ token: next, tick: 1 });
    port.resolve({ token: next, proposal: proposal(next, 1) });
    port.commitTick(next);
  });

  it("commits a resolved native Tick exactly once and isolates two provider sessions", () => {
    const first = createPort();
    const second = createPort();
    const firstToken = createMovementTickTokenV1();
    const secondToken = createMovementTickTokenV1();
    first.port.beginTick({ token: firstToken, tick: 1 });
    first.port.resolve({ token: firstToken, proposal: proposal(firstToken, 1, [1, 0, 0]) });
    second.port.beginTick({ token: secondToken, tick: 1 });
    second.port.resolve({ token: secondToken, proposal: proposal(secondToken, 1, [0, 0, -1]) });

    first.port.commitTick(firstToken);
    second.port.abortTick(secondToken);

    expect(first.driver.position).toEqual([1, 1, 0]);
    expect(second.driver.position).toEqual([0, 1, 0]);
    expect(() => first.port.commitTick(firstToken)).toThrow("3C_BODY_RESOLUTION_DUPLICATE");
    expect(() => second.port.commitTick(secondToken)).toThrow("3C_TICK_TOKEN_STALE");
  });

  it("dispose attempts the owned driver once, preserves its error, and stays idempotent", () => {
    const driver = new FakeNativeDriver();
    const primary = new Error("native dispose failed");
    driver.throwDuringDispose = primary;
    const { port } = createPort(driver);

    expect(() => port.dispose()).toThrow(primary);
    expect(() => port.dispose()).not.toThrow();
    expect(driver.disposeCalls).toBe(1);
  });
});

function productionSources(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      files.push(...productionSources(absolute));
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(entry) && !entry.includes(".test.")) {
      files.push(absolute);
    }
  }
  return files;
}

describe("Babylon Character Controller provider boundary census", () => {
  it("keeps every new direct checkSupport call inside the BodyPort adapter", () => {
    const sourceRoot = join(process.cwd(), "packages/runtime-babylon/src");
    const callSites = productionSources(sourceRoot)
      .filter((path) => /\.checkSupport\s*\(/.test(readFileSync(path, "utf8")))
      .map((path) => relative(sourceRoot, path).replaceAll("\\", "/"))
      .sort();

    expect(callSites).toEqual([
      "babylon-character-body-port.ts",
      "motion-kernel-runtime.ts",
    ]);

    const adapterSource = readFileSync(
      join(sourceRoot, "babylon-character-body-port.ts"),
      "utf8",
    );
    const legacySource = readFileSync(
      join(sourceRoot, "motion-kernel-runtime.ts"),
      "utf8",
    );
    expect(adapterSource.match(/this\.controller\.checkSupport\s*\(/g)).toHaveLength(1);
    expect(adapterSource.match(/this\.driver\.checkSupport\s*\(/g)).toHaveLength(1);
    expect(adapterSource.match(/this\.checkSupport\s*\(1 \/ 60/g)).toHaveLength(1);
    expect(legacySource.match(/this\.physicsController\.checkSupport\s*\(/g))
      .toHaveLength(4);
  });

  it("keeps construction and Babylon protected/private access in the adapter", () => {
    const sourceRoot = join(process.cwd(), "packages/runtime-babylon/src");
    const protectedAccess = /new (?:GroundAwarePhysicsCharacterController|PhysicsCharacterController)\s*\(|_tryStepUp|_refreshManifoldAtPosition|_getClosestCastHit|_castWithCollectors|\._manifold|\._castCollector/;
    const callSites = productionSources(sourceRoot)
      .filter((path) => protectedAccess.test(readFileSync(path, "utf8")))
      .map((path) => relative(sourceRoot, path).replaceAll("\\", "/"))
      .sort();

    expect(callSites).toEqual(["babylon-character-body-port.ts"]);
  });
});
