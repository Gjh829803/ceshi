import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import {
  assertMovementTickTokenIdentityV1,
  CHARACTER_MOVEMENT_DIAGNOSTIC_CODES_V1,
  createMovementTickTokenV1,
  parseBodyResolutionV1,
  parseBodySampleV1,
  parseCharacterMovementCommandV1,
  parseCharacterMovementSnapshotV1,
  parseGroundSurfaceMotionResponseV1,
  parseLayeredMoveV1,
  parseMovementCommitV1,
  parseMovementProposalV1,
} from "./index.js";

const PACKAGE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_PACKAGES = join(PACKAGE_DIRECTORY, "..");
const PRODUCTION_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"] as const;
const temporaryDirectories: string[] = [];

function productionSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return productionSourceFiles(entryPath);
    return entry.isFile() && PRODUCTION_EXTENSIONS.some((extension) => entry.name.endsWith(extension)) &&
      !entry.name.includes(".test.") && !entry.name.includes(".spec.") &&
      !entry.name.endsWith(".d.ts") && !entry.name.endsWith(".d.mts")
      ? [entryPath]
      : [];
  });
}

function dependencyClosure(
  initialDependencies: readonly string[],
  workspaceDependencies: (dependency: string) => readonly string[],
): ReadonlySet<string> {
  const visited = new Set<string>();
  const pending = [...initialDependencies];
  while (pending.length > 0) {
    const dependency = pending.pop()!;
    if (visited.has(dependency)) continue;
    visited.add(dependency);
    if (!dependency.startsWith("@whitebox-world/")) continue;
    pending.push(...workspaceDependencies(dependency));
  }
  return visited;
}

function isForbiddenDependency(dependency: string, forbiddenRoots: ReadonlySet<string>): boolean {
  return [...forbiddenRoots].some((root) => dependency === root || dependency.startsWith(`${root}/`));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("@whitebox-world/character-movement package boundary", () => {
  it("has a gameplay/protocol-only transitive production dependency closure", () => {
    const manifest = JSON.parse(
      readFileSync(join(PACKAGE_DIRECTORY, "package.json"), "utf8"),
    ) as { dependencies?: Readonly<Record<string, string>> };
    const dependencies = Object.keys(manifest.dependencies ?? {}).sort();

    expect(dependencies).toEqual([
      "@whitebox-world/gameplay-contracts",
      "@whitebox-world/protocol",
    ]);

    const forbidden = new Set([
      "@babylonjs/core",
      "@babylonjs/havok",
      "@whitebox-world/camera",
      "@whitebox-world/runtime-babylon",
      "@whitebox-world/runtime-host",
      "@whitebox-world/runtime-contracts",
    ]);
    const closure = dependencyClosure(dependencies, (dependency) => {
      expect(isForbiddenDependency(dependency, forbidden)).toBe(false);
      const packageName = dependency.slice("@whitebox-world/".length);
      const dependencyManifest = JSON.parse(readFileSync(
        join(REPOSITORY_PACKAGES, packageName, "package.json"),
        "utf8",
      )) as { dependencies?: Readonly<Record<string, string>> };
      return Object.keys(dependencyManifest.dependencies ?? {});
    });
    for (const dependency of closure) {
      expect(isForbiddenDependency(dependency, forbidden)).toBe(false);
    }
  });

  it("contains no Babylon, Havok, camera, Runtime Host or Runtime Babylon imports", () => {
    const sources = productionSourceFiles(join(PACKAGE_DIRECTORY, "src"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    for (const dependency of [
      "@babylonjs/core",
      "@babylonjs/havok",
      "@whitebox-world/camera",
      "@whitebox-world/runtime-babylon",
      "@whitebox-world/runtime-host",
    ]) {
      expect(sources).not.toContain(dependency);
    }
  });

  it("detects forbidden external providers and their subpaths in transitive closure", () => {
    const providerSubpath = "@babylonjs/core/Physics/v2/physicsCharacterController";
    const closure = dependencyClosure(["@whitebox-world/neutral"], (dependency) =>
      dependency === "@whitebox-world/neutral" ? [providerSubpath] : []
    );
    expect(closure).toContain(providerSubpath);
    expect(isForbiddenDependency(providerSubpath, new Set(["@babylonjs/core"]))).toBe(true);
  });

  it("scans TSX and MTS production modules", () => {
    const directory = mkdtempSync(join(tmpdir(), "movement-boundary-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, "provider.tsx"), "export const provider = true;\n", "utf8");
    writeFileSync(join(directory, "adapter.mts"), "export const adapter = true;\n", "utf8");
    expect(productionSourceFiles(directory).map((file) => file.slice(directory.length + 1)).sort())
      .toEqual(["adapter.mts", "provider.tsx"]);
  });
});

const activeLocomotion = {
  schemaVersion: 2,
  status: "active",
  mobilityMode: "grounded",
  gait: "walk",
  verticalPhase: "none",
  supportMode: "supported",
  movementMedium: "ground",
  facingYawRadians: 0,
  linearVelocity: { x: 0, y: 0, z: -1 },
  horizontalSpeedMetersPerSecond: 1,
  committedTick: 5,
  phaseEnteredTick: 5,
  transitionSequence: 2,
} as const;

describe("character movement neutral contracts", () => {
  const token = createMovementTickTokenV1();

  it("freezes both LayeredMove branches and rejects unknown or non-finite data", () => {
    const rootMotion = {
      schemaVersion: 1,
      kind: "root-motion",
      id: "vault-primary",
      priority: 20,
      startedTick: 5,
      rootMotionSourceRef: "worldkit://root-motion/vault@1",
      rootMotionSourceHash: `sha256:${"a".repeat(64)}`,
      translationDeltaMetersXYZ: [0, 0.1, -0.4],
      facingYawDeltaRadians: 0.2,
    } as const;
    const impulse = {
      schemaVersion: 1,
      kind: "impulse",
      id: "jump-primary",
      priority: 10,
      startedTick: 5,
      velocityDeltaMetersPerSecondXYZ: [0, 5, 0],
    } as const;

    for (const value of [rootMotion, impulse]) {
      const parsed = parseLayeredMoveV1(value);
      expect(parsed).toEqual(value);
      expect(Object.isFrozen(parsed)).toBe(true);
    }
    expect(parseLayeredMoveV1({ ...impulse, priority: -1 }).priority).toBe(-1);
    expect(() => parseLayeredMoveV1({ ...rootMotion, providerClip: "vault" }))
      .toThrow("closed LayeredMoveV1 schema");
    expect(() => parseLayeredMoveV1({
      ...impulse,
      velocityDeltaMetersPerSecondXYZ: [0, Number.NaN, 0],
    })).toThrow("closed LayeredMoveV1 schema");
  });

  it("strictly parses immutable sample, proposal, resolution and commit shapes", () => {
    const sample = {
      schemaVersion: 1,
      token,
      tick: 5,
      positionMetersXYZ: [0, 1, 0],
      linearVelocityMetersPerSecondXYZ: [0, 0, -1],
      support: {
        mode: "supported",
        pointMetersXYZ: [0, 0, 0],
        normalXYZ: [0, 1, 0],
        isDynamic: false,
      },
    } as const;
    const proposal = {
      schemaVersion: 1,
      token,
      tick: 5,
      translationDeltaMetersXYZ: [0, 0, -1 / 60],
      proposedLinearVelocityMetersPerSecondXYZ: [0, 0, -1],
      proposedFacingYawRadians: 0,
      layeredMoves: [],
    } as const;
    const resolution = {
      schemaVersion: 1,
      token,
      tick: 5,
      positionMetersXYZ: [0, 1, -1 / 60],
      appliedTranslationMetersXYZ: [0, 0, -1 / 60],
      linearVelocityMetersPerSecondXYZ: [0, 0, -1],
      support: sample.support,
      hasCeilingContact: false,
      isTranslationLimited: false,
    } as const;
    const commit = {
      schemaVersion: 1,
      tick: 5,
      positionMetersXYZ: resolution.positionMetersXYZ,
      facingYawRadians: 0,
      linearVelocityMetersPerSecondXYZ: resolution.linearVelocityMetersPerSecondXYZ,
      locomotion: activeLocomotion,
      transitionEvents: [],
    } as const;

    for (const [parse, value] of [
      [parseBodySampleV1, sample],
      [parseMovementProposalV1, proposal],
      [parseBodyResolutionV1, resolution],
      [parseMovementCommitV1, commit],
    ] as const) {
      const parsed = parse(value);
      expect(parsed).toEqual(value);
      expect(Object.isFrozen(parsed)).toBe(true);
      if ("token" in parsed) expect(parsed.token).toBe(token);
    }
    expect(() => parseBodySampleV1({ ...sample, tick: Number.POSITIVE_INFINITY }))
      .toThrow("closed BodySampleV1 schema");
    expect(() => parseMovementProposalV1({ ...proposal, nativeBody: {} }))
      .toThrow("closed MovementProposalV1 schema");
  });

  it("preserves exact token provenance and rejects cross-runtime or post-reset reuse", () => {
    const runtimeAToken = createMovementTickTokenV1();
    const runtimeBToken = createMovementTickTokenV1();
    const postResetToken = createMovementTickTokenV1();
    const sample = parseBodySampleV1({
      schemaVersion: 1,
      token: runtimeAToken,
      tick: 9,
      positionMetersXYZ: [0, 1, 0],
      linearVelocityMetersPerSecondXYZ: [0, 0, 0],
      support: { mode: "unsupported" },
    });

    expect(sample.token).toBe(runtimeAToken);
    expect(assertMovementTickTokenIdentityV1(runtimeAToken, sample.token)).toBe(runtimeAToken);
    expect(() => assertMovementTickTokenIdentityV1(runtimeBToken, sample.token))
      .toThrow("3C_TICK_TOKEN_STALE");
    expect(() => assertMovementTickTokenIdentityV1(postResetToken, sample.token))
      .toThrow("3C_TICK_TOKEN_STALE");
    expect(() => parseBodySampleV1({ ...sample, token: Object.freeze({}) }))
      .toThrow("closed BodySampleV1 schema");
  });

  it.each([
    ["sparse vector", (() => { const value = new Array(3); value[0] = 0; return value; })()],
    ["accessor vector", (() => {
      const value = [0, 0, 0];
      Object.defineProperty(value, "1", { enumerable: true, get: () => 0 });
      return value;
    })()],
    ["symbol vector", Object.assign([0, 0, 0], { [Symbol("provider")]: true })],
    ["extra-key vector", Object.assign([0, 0, 0], { provider: true })],
    ["non-enumerable vector index", (() => {
      const value = [0, 0, 0];
      Object.defineProperty(value, "1", { enumerable: false, value: 0 });
      return value;
    })()],
  ])("rejects an exotic %s", (_label, vector) => {
    expect(() => parseLayeredMoveV1({
      schemaVersion: 1,
      kind: "impulse",
      id: "bad-vector",
      priority: 0,
      startedTick: 1,
      velocityDeltaMetersPerSecondXYZ: vector,
    })).toThrow("closed LayeredMoveV1 schema");
  });

  it("rejects sparse and extra-key LayeredMove lists", () => {
    const sparse = new Array(1);
    const extra = Object.assign([], { provider: true });
    const base = {
      schemaVersion: 1,
      token,
      tick: 5,
      translationDeltaMetersXYZ: [0, 0, 0],
      proposedLinearVelocityMetersPerSecondXYZ: [0, 0, 0],
      proposedFacingYawRadians: 0,
    } as const;
    expect(() => parseMovementProposalV1({ ...base, layeredMoves: sparse }))
      .toThrow("closed MovementProposalV1 schema");
    expect(() => parseMovementProposalV1({ ...base, layeredMoves: extra }))
      .toThrow("closed MovementProposalV1 schema");
  });

  it("rejects commits with unrelated velocity, speed, event Tick, order or terminal sequence", () => {
    const commit = {
      schemaVersion: 1,
      tick: 5,
      positionMetersXYZ: [0, 1, 0],
      facingYawRadians: 0,
      linearVelocityMetersPerSecondXYZ: [0, 0, -1],
      locomotion: activeLocomotion,
      transitionEvents: [],
    } as const;
    expect(() => parseMovementCommitV1({
      ...commit,
      linearVelocityMetersPerSecondXYZ: [99, 99, 99],
    })).toThrow("closed MovementCommitV1 schema");
    expect(() => parseMovementCommitV1({
      ...commit,
      locomotion: { ...activeLocomotion, horizontalSpeedMetersPerSecond: 2 },
    })).toThrow();
    expect(() => parseMovementCommitV1({
      ...commit,
      transitionEvents: [{
        schemaVersion: 1,
        type: "landed",
        committedTick: 999,
        transitionSequence: 2,
      }],
    })).toThrow("closed MovementCommitV1 schema");
    expect(() => parseMovementCommitV1({
      ...commit,
      transitionEvents: [
        { schemaVersion: 1, type: "apex-crossed", committedTick: 5, transitionSequence: 2 },
        { schemaVersion: 1, type: "landed", committedTick: 5, transitionSequence: 2 },
      ],
    })).toThrow("closed MovementCommitV1 schema");
    expect(() => parseMovementCommitV1({
      ...commit,
      transitionEvents: [{
        schemaVersion: 1,
        type: "landed",
        committedTick: 5,
        transitionSequence: 1,
      }],
    })).toThrow("closed MovementCommitV1 schema");
  });

  it("rejects vertical events that do not describe one legal chain ending at committed Locomotion", () => {
    const groundedCommit = {
      schemaVersion: 1,
      tick: 5,
      positionMetersXYZ: [0, 1, 0],
      facingYawRadians: 0,
      linearVelocityMetersPerSecondXYZ: [0, 0, -1],
      locomotion: activeLocomotion,
      transitionEvents: [],
    } as const;
    const fallingLocomotion = {
      ...activeLocomotion,
      mobilityMode: "airborne",
      gait: "none",
      verticalPhase: "falling",
      supportMode: "unsupported",
      movementMedium: "air",
      linearVelocity: { x: 0, y: -1, z: 0 },
      horizontalSpeedMetersPerSecond: 0,
      transitionSequence: 3,
    } as const;
    const fallingCommit = {
      ...groundedCommit,
      linearVelocityMetersPerSecondXYZ: [0, -1, 0],
      locomotion: fallingLocomotion,
    } as const;

    for (const transitionEvents of [
      [{ schemaVersion: 1, type: "apex-crossed", committedTick: 5, transitionSequence: 2 }],
      [{ schemaVersion: 1, type: "landed", committedTick: 5, transitionSequence: 2 }],
    ] as const) {
      expect(() => parseMovementCommitV1({ ...groundedCommit, transitionEvents }))
        .toThrow("closed MovementCommitV1 schema");
    }
    expect(() => parseMovementCommitV1({
      ...fallingCommit,
      transitionEvents: [{
        schemaVersion: 1,
        type: "phase-changed",
        fromVerticalPhase: "rising",
        toVerticalPhase: "apex",
        committedTick: 5,
        transitionSequence: 3,
      }],
    })).toThrow("closed MovementCommitV1 schema");
    expect(() => parseMovementCommitV1({
      ...fallingCommit,
      transitionEvents: [
        {
          schemaVersion: 1,
          type: "phase-changed",
          fromVerticalPhase: "takeoff",
          toVerticalPhase: "rising",
          committedTick: 5,
          transitionSequence: 2,
        },
        {
          schemaVersion: 1,
          type: "phase-changed",
          fromVerticalPhase: "apex",
          toVerticalPhase: "falling",
          committedTick: 5,
          transitionSequence: 3,
        },
      ],
    })).toThrow("closed MovementCommitV1 schema");
    expect(() => parseMovementCommitV1({
      ...groundedCommit,
      locomotion: { ...activeLocomotion, verticalPhase: "landing", transitionSequence: 3 },
      transitionEvents: [
        {
          schemaVersion: 1,
          type: "phase-changed",
          fromVerticalPhase: "rising",
          toVerticalPhase: "landing",
          committedTick: 5,
          transitionSequence: 2,
        },
        { schemaVersion: 1, type: "landed", committedTick: 5, transitionSequence: 3 },
      ],
    })).toThrow("closed MovementCommitV1 schema");
    expect(() => parseMovementCommitV1({
      ...groundedCommit,
      locomotion: {
        schemaVersion: 2,
        status: "suspended",
        suspendedByRelationshipId: "mounted-on-primary",
        committedTick: 5,
        transitionSequence: 2,
      },
      transitionEvents: [{
        schemaVersion: 1,
        type: "apex-crossed",
        committedTick: 5,
        transitionSequence: 2,
      }],
    })).toThrow("closed MovementCommitV1 schema");
  });

  it("requires semantic apex/landing event placement and accepts legal multi-event chains", () => {
    const base = {
      schemaVersion: 1,
      tick: 5,
      positionMetersXYZ: [0, 1, 0],
      facingYawRadians: 0,
    } as const;
    const fallingLocomotion = {
      ...activeLocomotion,
      mobilityMode: "airborne",
      gait: "none",
      verticalPhase: "falling",
      supportMode: "unsupported",
      movementMedium: "air",
      linearVelocity: { x: 0, y: -1, z: 0 },
      horizontalSpeedMetersPerSecond: 0,
      transitionSequence: 5,
    } as const;
    const legalApexChain = {
      ...base,
      linearVelocityMetersPerSecondXYZ: [0, -1, 0],
      locomotion: fallingLocomotion,
      transitionEvents: [
        {
          schemaVersion: 1,
          type: "phase-changed",
          fromVerticalPhase: "rising",
          toVerticalPhase: "apex",
          committedTick: 5,
          transitionSequence: 3,
        },
        { schemaVersion: 1, type: "apex-crossed", committedTick: 5, transitionSequence: 4 },
        {
          schemaVersion: 1,
          type: "phase-changed",
          fromVerticalPhase: "apex",
          toVerticalPhase: "falling",
          committedTick: 5,
          transitionSequence: 5,
        },
      ],
    } as const;
    expect(parseMovementCommitV1(legalApexChain)).toEqual(legalApexChain);

    for (const transitionEvents of [
      [legalApexChain.transitionEvents[0]],
      [legalApexChain.transitionEvents[0], legalApexChain.transitionEvents[2], legalApexChain.transitionEvents[1]],
    ] as const) {
      const transitionSequence = transitionEvents.at(-1)!.transitionSequence;
      expect(() => parseMovementCommitV1({
        ...legalApexChain,
        locomotion: { ...fallingLocomotion, verticalPhase: transitionEvents.length === 1 ? "apex" : "falling", transitionSequence },
        transitionEvents,
      })).toThrow("closed MovementCommitV1 schema");
    }

    const legalLanding = {
      ...base,
      linearVelocityMetersPerSecondXYZ: [0, 0, 0],
      locomotion: {
        ...activeLocomotion,
        verticalPhase: "landing",
        linearVelocity: { x: 0, y: 0, z: 0 },
        horizontalSpeedMetersPerSecond: 0,
        transitionSequence: 7,
      },
      transitionEvents: [
        {
          schemaVersion: 1,
          type: "phase-changed",
          fromVerticalPhase: "falling",
          toVerticalPhase: "landing",
          committedTick: 5,
          transitionSequence: 6,
        },
        { schemaVersion: 1, type: "landed", committedTick: 5, transitionSequence: 7 },
      ],
    } as const;
    expect(parseMovementCommitV1(legalLanding)).toEqual(legalLanding);
  });

  it("strictly parses and freezes Command and Snapshot boundaries", () => {
    const command = {
      schemaVersion: 1,
      tick: 5,
      fixedDeltaSeconds: 1 / 60,
      movementInputXZ: [0.5, -0.5],
      runRequested: true,
      jumpPressed: false,
      jumpHeld: true,
      viewYawRadians: 0.2,
      layeredMoves: [],
    } as const;
    const snapshot = {
      schemaVersion: 1,
      tick: 5,
      positionMetersXYZ: [0, 1, 0],
      facingYawRadians: 0,
      linearVelocityMetersPerSecondXYZ: [0, 0, -1],
      locomotion: activeLocomotion,
      transitionEvents: [],
      runtimeState: {
        schemaVersion: 1,
        coyoteTicksRemaining: 0,
        jumpBufferTicksRemaining: 0,
        variableJumpHoldTicksRemaining: 0,
        landingTicksRemaining: 0,
        apexCrossedInAirborneEpisode: false,
      },
      stateHash: `sha256:${"a".repeat(64)}`,
    } as const;
    expect(parseCharacterMovementCommandV1(command)).toEqual(command);
    expect(parseCharacterMovementSnapshotV1(snapshot)).toEqual(snapshot);
    expect(() => parseCharacterMovementCommandV1({ ...command, fixedDeltaSeconds: 0 }))
      .toThrow("closed CharacterMovementCommandV1 schema");
    expect(() => parseCharacterMovementCommandV1({ ...command, movementInputXZ: [1.1, 0] }))
      .toThrow("closed CharacterMovementCommandV1 schema");
    expect(() => parseCharacterMovementCommandV1({ ...command, movementInputXZ: [1, 1] }))
      .toThrow("closed CharacterMovementCommandV1 schema");
    expect(() => parseCharacterMovementCommandV1({ ...command, movementInputXZ: [1, 0.000_002] }))
      .toThrow("closed CharacterMovementCommandV1 schema");
    expect(parseCharacterMovementCommandV1({ ...command, movementInputXZ: [1, 0.000_001] }).movementInputXZ)
      .toEqual([1, 0.000_001]);
    expect(() => parseCharacterMovementCommandV1({
      ...command,
      layeredMoves: [{
        schemaVersion: 1,
        kind: "impulse",
        id: "future-impulse",
        priority: 1,
        startedTick: 6,
        velocityDeltaMetersPerSecondXYZ: [0, 1, 0],
      }],
    })).toThrow("closed CharacterMovementCommandV1 schema");
    expect(() => parseCharacterMovementSnapshotV1({ ...snapshot, stateHash: "sha256:bad" }))
      .toThrow("closed CharacterMovementSnapshotV1 schema");
    expect(Object.isFrozen(parseCharacterMovementCommandV1(command).layeredMoves)).toBe(true);
  });

  it("strictly parses a provider-neutral grounded surface response", () => {
    const response = {
      schemaVersion: 1,
      maximumSpeedRatio: 0.55,
      accelerationRatio: 0.6,
      decelerationRatio: 1.25,
    } as const;
    const parsed = parseGroundSurfaceMotionResponseV1(response);
    expect(parsed).toEqual(response);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(() => parseGroundSurfaceMotionResponseV1({
      ...response,
      surfaceProfileRef: "worldkit://block-surface-profile/mud@1",
    })).toThrow("closed GroundSurfaceMotionResponseV1 schema");
    expect(() => parseGroundSurfaceMotionResponseV1({
      ...response,
      accelerationRatio: 0,
    })).toThrow("closed GroundSurfaceMotionResponseV1 schema");
    expect(() => parseGroundSurfaceMotionResponseV1({
      ...response,
      decelerationRatio: -0,
    })).toThrow("closed GroundSurfaceMotionResponseV1 schema");
  });

  it("exports the stable closed 3C diagnostic vocabulary", () => {
    expect(CHARACTER_MOVEMENT_DIAGNOSTIC_CODES_V1).toEqual([
      "3C_INPUT_INVALID",
      "3C_TICK_TOKEN_STALE",
      "3C_SUPPORT_SAMPLE_DUPLICATE",
      "3C_BODY_RESOLUTION_DUPLICATE",
      "3C_LAYERED_MOVE_SOURCE_UNRESOLVED",
      "3C_ROOT_MOTION_HASH_MISMATCH",
      "3C_ROOT_MOTION_SAMPLE_INVALID",
      "3C_LOCOMOTION_TRANSITION_INVALID",
      "3C_CAMERA_CONTEXT_UNCOMMITTED",
      "3C_CAMERA_QUERY_UNAVAILABLE",
      "3C_RUNTIME_DISPOSED",
    ]);
    expect(Object.isFrozen(CHARACTER_MOVEMENT_DIAGNOSTIC_CODES_V1)).toBe(true);
  });
});
