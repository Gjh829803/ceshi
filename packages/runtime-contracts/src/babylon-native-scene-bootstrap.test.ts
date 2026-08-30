import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import bootstrapSchema from "./babylon-native-scene-bootstrap-v1.schema.json";
import {
  hashBabylonNativeSceneBootstrapV1,
  parseBabylonNativeSceneBootstrapV1,
} from "./babylon-native-scene-bootstrap.js";

const VALID_BOOTSTRAP = {
  kind: "babylon-native-scene-bootstrap",
  schemaVersion: 1,
  id: "cloud-ridge-native",
  sceneModuleRef: "worldkit://native-scene/cloud-ridge@1",
  nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
  nativeSceneProfileRef:
    "worldkit://native-scene-profile/whitebox.standard@1",
  gameplayBootstrapRef: "worldkit://gameplay-bootstrap/cloud-ridge@1",
  initialControlledEntityId: "g-bot-primary",
  gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
  initialCamera: {
    mode: "third-person",
    pitchRadians: 0.22,
    distanceMeters: 5,
    fovDegrees: 58,
    targetHeightMeters: 1.25,
  },
  seed: 18_427,
  spawnMarkerId: "player-spawn",
} as const;

function expectInvalid(input: unknown): void {
  expect(() => parseBabylonNativeSceneBootstrapV1(input)).toThrow(
    /BabylonNativeSceneBootstrapV1/,
  );
}

describe("BabylonNativeSceneBootstrapV1", () => {
  it("keeps the published JSON Schema and exact parser aligned", () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      bootstrapSchema,
    );
    const cases = [
      VALID_BOOTSTRAP,
      { ...VALID_BOOTSTRAP, geometry: [] },
      { ...VALID_BOOTSTRAP, schemaVersion: 2 },
      { ...VALID_BOOTSTRAP, id: "" },
      { ...VALID_BOOTSTRAP, sceneModuleRef: "worldkit://native-scene/cloud-ridge@latest" },
      { ...VALID_BOOTSTRAP, seed: -1 },
      { ...VALID_BOOTSTRAP, seed: 0x1_0000_0000 },
      {
        ...VALID_BOOTSTRAP,
        gravityMetersPerSecondSquaredXYZ: [0, -9.81],
      },
      {
        ...VALID_BOOTSTRAP,
        initialCamera: { ...VALID_BOOTSTRAP.initialCamera, distanceMeters: 0 },
      },
      {
        ...VALID_BOOTSTRAP,
        initialCamera: { ...VALID_BOOTSTRAP.initialCamera, fovDegrees: 180 },
      },
    ];

    for (const candidate of cases) {
      const schemaAccepted = validate(candidate);
      let parserAccepted = true;
      try {
        parseBabylonNativeSceneBootstrapV1(candidate);
      } catch {
        parserAccepted = false;
      }
      expect(parserAccepted, JSON.stringify(validate.errors)).toBe(schemaAccepted);
    }
  });

  it("documents signed zero as an exact-parser invariant beyond JSON Schema equality", () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      bootstrapSchema,
    );
    const inMemorySignedZero = { ...VALID_BOOTSTRAP, seed: -0 };

    expect(validate(inMemorySignedZero)).toBe(true);
    expectInvalid(inMemorySignedZero);

    const wireRoundTrip = JSON.parse(JSON.stringify(inMemorySignedZero));
    expect(validate(wireRoundTrip)).toBe(true);
    expect(parseBabylonNativeSceneBootstrapV1(wireRoundTrip).seed).toBe(0);
    expect(Object.is(wireRoundTrip.seed, -0)).toBe(false);
  });

  it("parses a detached deeply frozen Native Bootstrap snapshot", () => {
    const mutable = {
      ...VALID_BOOTSTRAP,
      gravityMetersPerSecondSquaredXYZ:
        VALID_BOOTSTRAP.gravityMetersPerSecondSquaredXYZ.map(Number),
      initialCamera: {
        ...VALID_BOOTSTRAP.initialCamera,
        distanceMeters: Number(VALID_BOOTSTRAP.initialCamera.distanceMeters),
      },
    };
    const parsed = parseBabylonNativeSceneBootstrapV1(mutable);

    expect(parsed).toEqual(VALID_BOOTSTRAP);
    expect(parsed).not.toBe(mutable);
    expect(parsed.initialCamera).not.toBe(mutable.initialCamera);
    expect(parsed.gravityMetersPerSecondSquaredXYZ).not.toBe(
      mutable.gravityMetersPerSecondSquaredXYZ,
    );
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.initialCamera)).toBe(true);
    expect(Object.isFrozen(parsed.gravityMetersPerSecondSquaredXYZ)).toBe(true);

    mutable.initialCamera.distanceMeters = 99;
    mutable.gravityMetersPerSecondSquaredXYZ[1] = -1;
    expect(parsed.initialCamera.distanceMeters).toBe(5);
    expect(parsed.gravityMetersPerSecondSquaredXYZ).toEqual([0, -9.81, 0]);
  });

  it("rejects geometry and legacy semantic aliases", () => {
    for (const input of [
      { ...VALID_BOOTSTRAP, meshes: [] },
      { ...VALID_BOOTSTRAP, terrain: {} },
      { ...VALID_BOOTSTRAP, sceneModuleId: "cloud-ridge-native" },
      {
        ...VALID_BOOTSTRAP,
        controlledSubjectDefinitionRef:
          "worldkit://subject-definition/humanoid.g-bot@2",
      },
      {
        ...VALID_BOOTSTRAP,
        cameraRigRef: "worldkit://camera/third-person.standard@1",
      },
      { ...VALID_BOOTSTRAP, staticCollisionBudget: {} },
    ]) expectInvalid(input);
  });

  it("rejects missing keys, wrong discriminators, and empty identities", () => {
    const { spawnMarkerId: _spawnMarkerId, ...missingSpawn } = VALID_BOOTSTRAP;
    for (const input of [
      missingSpawn,
      { ...VALID_BOOTSTRAP, kind: "babylon-native-world-bootstrap" },
      { ...VALID_BOOTSTRAP, schemaVersion: 2 },
      { ...VALID_BOOTSTRAP, id: "" },
      { ...VALID_BOOTSTRAP, initialControlledEntityId: "" },
      { ...VALID_BOOTSTRAP, spawnMarkerId: "" },
      {
        ...VALID_BOOTSTRAP,
        initialCamera: { ...VALID_BOOTSTRAP.initialCamera, mode: "orbit" },
      },
    ]) expectInvalid(input);
  });

  it("does not treat explicit null or undefined as a missing-field default", () => {
    for (const value of [null, undefined]) {
      expectInvalid({ ...VALID_BOOTSTRAP, seed: value });
      expectInvalid({
        ...VALID_BOOTSTRAP,
        initialCamera: {
          ...VALID_BOOTSTRAP.initialCamera,
          distanceMeters: value,
        },
      });
    }
  });

  it("rejects refs outside each exact WorldKit resource family", () => {
    for (const input of [
      { ...VALID_BOOTSTRAP, sceneModuleRef: "app://native/cloud-ridge" },
      {
        ...VALID_BOOTSTRAP,
        sceneModuleRef: "worldkit://native-scene/cloud-ridge@latest",
      },
      {
        ...VALID_BOOTSTRAP,
        nativeSceneApiRef: "worldkit://native-scene/cloud-ridge@1",
      },
      {
        ...VALID_BOOTSTRAP,
        nativeSceneProfileRef:
          "worldkit://native-scene-api/whitebox.standard@1",
      },
      {
        ...VALID_BOOTSTRAP,
        gameplayBootstrapRef: "worldkit://gameplay/cloud-ridge@1",
      },
    ]) expectInvalid(input);
  });

  it("rejects accessors, symbols, custom prototypes, and impure arrays", () => {
    const accessor = { ...VALID_BOOTSTRAP };
    Object.defineProperty(accessor, "id", {
      enumerable: true,
      get: () => "cloud-ridge-native",
    });
    const symbol = { ...VALID_BOOTSTRAP } as Record<PropertyKey, unknown>;
    symbol[Symbol("alias")] = true;
    const customPrototype = Object.assign(
      Object.create({ inherited: true }),
      VALID_BOOTSTRAP,
    );
    const impureGravity = [...VALID_BOOTSTRAP.gravityMetersPerSecondSquaredXYZ];
    Object.defineProperty(impureGravity, "0", {
      enumerable: true,
      get: () => 0,
    });
    for (const input of [
      accessor,
      symbol,
      customPrototype,
      { ...VALID_BOOTSTRAP, gravityMetersPerSecondSquaredXYZ: impureGravity },
      {
        ...VALID_BOOTSTRAP,
        initialCamera: Object.assign(
          Object.create(null),
          VALID_BOOTSTRAP.initialCamera,
        ),
      },
    ]) expectInvalid(input);
  });

  it("rejects non-canonical numeric values and invalid camera bounds", () => {
    for (const input of [
      {
        ...VALID_BOOTSTRAP,
        gravityMetersPerSecondSquaredXYZ: [0, Number.NaN, 0],
      },
      {
        ...VALID_BOOTSTRAP,
        gravityMetersPerSecondSquaredXYZ: [-0, -9.81, 0],
      },
      { ...VALID_BOOTSTRAP, seed: -1 },
      { ...VALID_BOOTSTRAP, seed: -0 },
      { ...VALID_BOOTSTRAP, seed: Number.MAX_SAFE_INTEGER + 1 },
      {
        ...VALID_BOOTSTRAP,
        initialCamera: {
          ...VALID_BOOTSTRAP.initialCamera,
          pitchRadians: Number.POSITIVE_INFINITY,
        },
      },
      {
        ...VALID_BOOTSTRAP,
        initialCamera: { ...VALID_BOOTSTRAP.initialCamera, distanceMeters: 0 },
      },
      {
        ...VALID_BOOTSTRAP,
        initialCamera: { ...VALID_BOOTSTRAP.initialCamera, fovDegrees: 0 },
      },
      {
        ...VALID_BOOTSTRAP,
        initialCamera: { ...VALID_BOOTSTRAP.initialCamera, fovDegrees: 180 },
      },
    ]) expectInvalid(input);
  });

  it("accepts only unsigned 32-bit deterministic seeds", () => {
    expect(parseBabylonNativeSceneBootstrapV1({
      ...VALID_BOOTSTRAP,
      seed: 0xffff_ffff,
    }).seed).toBe(0xffff_ffff);
    for (const seed of [0x1_0000_0000, -1, -0, 1.5]) {
      expectInvalid({ ...VALID_BOOTSTRAP, seed });
      expect(() => hashBabylonNativeSceneBootstrapV1({
        ...VALID_BOOTSTRAP,
        seed,
      })).toThrow(/BabylonNativeSceneBootstrapV1/);
    }
  });

  it("hashes only canonical parsed Bootstrap data", () => {
    const hash = hashBabylonNativeSceneBootstrapV1(VALID_BOOTSTRAP);
    expect(hash).toBe(
      "sha256:59d8fb0c2518be986decd52e19e03a19edb13dec1cbb7b825fb2b9ffd6142d95",
    );
    expect(hashBabylonNativeSceneBootstrapV1({
      spawnMarkerId: VALID_BOOTSTRAP.spawnMarkerId,
      seed: VALID_BOOTSTRAP.seed,
      initialCamera: { ...VALID_BOOTSTRAP.initialCamera },
      gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
      initialControlledEntityId: VALID_BOOTSTRAP.initialControlledEntityId,
      gameplayBootstrapRef: VALID_BOOTSTRAP.gameplayBootstrapRef,
      nativeSceneProfileRef: VALID_BOOTSTRAP.nativeSceneProfileRef,
      nativeSceneApiRef: VALID_BOOTSTRAP.nativeSceneApiRef,
      sceneModuleRef: VALID_BOOTSTRAP.sceneModuleRef,
      id: VALID_BOOTSTRAP.id,
      schemaVersion: 1,
      kind: "babylon-native-scene-bootstrap",
    })).toBe(hash);
  });
});
