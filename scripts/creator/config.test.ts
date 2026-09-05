import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { BabylonNativeSceneBuildContextV1 } from "@whitebox-world/native-babylon";
import { BLOCK_MOTION_PACKS_V1 } from "@whitebox-world/block-world";
import { parseGameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";
import { parseWorldRuntimeBootstrapV1, validateCameraTuningV1 } from "@whitebox-world/runtime-contracts";
import { BabylonWorldRuntime } from "@whitebox-world/runtime-babylon";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";
import { bindRuntimeTestPossession } from "../../packages/runtime-babylon/src/runtime-test-possession.js";
import { describe, expect, it, vi } from "vitest";
import { registerEntity } from "./authoring.js";
import { createCreatorBootstraps, parseCreatorSceneConfig, type CreatorSceneConfigV1 } from "./config.js";

const inputHash = `sha256:${"b".repeat(64)}`;
function fixture(): CreatorSceneConfigV1 {
  return {
    schemaVersion: 1, id: "creator-asymmetric", seed: 42,
    subject: { kind: "pack", subjectPackId: "humanoid.g-bot" },
    spawn: { positionMetersXYZ: [3, 2, -4], facingRadians: 0.61 },
    camera: { pitchRadians: 0.3, distanceMeters: 9, fovDegrees: 64, targetHeightMeters: 1.2 },
    worldBounds: { centerMetersXZ: [10, -20], sizeMetersXZ: [100, 120], heightRangeMeters: [-10, 50] },
    visualTargets: [{ id: "player", name: "Traveler", appearancePrompt: "Red cloaked traveler", frontYawRadians: 0.7 }],
    exploration: { targets: [{ id: "gate", positionMetersXYZ: [14, 2, -12] }], steps: [{ actions: ["move-forward"], axes: { moveXRatio: 0.2 }, ticks: 120 }] },
  };
}

describe("experimental Creator Host configuration", () => {
  it("snapshots closed JSON and rejects nonfinite, hidden, duplicate, out-of-bounds, and unknown data", () => {
    const original = fixture();
    const config = parseCreatorSceneConfig(original);
    expect(config).toEqual(original);
    expect(config).not.toBe(original);
    expect(Object.isFrozen(config.spawn.positionMetersXYZ)).toBe(true);
    for (const candidate of [
      { ...original, legacyPlanner: true },
      { ...original, camera: { ...original.camera, fovDegrees: Infinity } },
      { ...original, camera: { ...original.camera, distanceMeters: 0 } },
      { ...original, camera: { ...original.camera, pitchRadians: -0 } },
      { ...original, spawn: { ...original.spawn, positionMetersXYZ: [1000, 0, 0] } },
      { ...original, worldBounds: { ...original.worldBounds, heightRangeMeters: [3, -2] } },
      { ...original, visualTargets: [...original.visualTargets!, ...original.visualTargets!] },
      { ...original, subject: { ...original.subject, sourceUri: "https://unselected.example/model.glb" } },
      Object.defineProperty({ ...original }, "hidden", { value: 1 }),
    ]) expect(() => parseCreatorSceneConfig(candidate)).toThrow(/CREATOR_SCENE_CONFIG_INVALID/);
  });

  it("uses the real SDK input parser and caps the complete exploration", () => {
    for (const steps of [
      [{ actions: ["teleport"], ticks: 1 }],
      [{ actions: [], ticks: 1, fakeDelta: 5 }],
      [{ actions: [], ticks: 1, axes: { moveXRatio: 3 } }],
      [{ actions: [], ticks: 36_000 }, { actions: [], ticks: 1 }],
    ]) expect(() => parseCreatorSceneConfig({ ...fixture(), exploration: { targets: fixture().exploration!.targets, steps } })).toThrow();
  });

  it("admits the full published camera range against the actual SDK opening-tuning validator", () => {
    const config = { ...fixture(), camera: { pitchRadians: 1.35, distanceMeters: 30, fovDegrees: 100, targetHeightMeters: 10 } };
    const result = createCreatorBootstraps(config, inputHash);
    const cameraContext = result.runtimeBootstrap.subjectRuntimeDescriptors[0]!.capabilityAssembly.cameraContext;
    const profile = cameraContext.cameraRigProfiles.find(({ resourceRef }) => resourceRef === result.runtimeBootstrap.initialCamera.cameraRigProfileRef)!;
    expect(validateCameraTuningV1(profile, { distanceMeters: 30, pitchRadians: 1.35, baseFovDegrees: 100, targetHeightMeters: 10 })).toMatchObject({ ok: true });
    expect(profile.parameters.maximumDistanceMeters).toBe(30);
    expect(profile.parameters.minimumPitchRadians).toBe(-1.4);
    expect(profile.parameters.maximumPitchRadians).toBe(1.4);
    expect(profile.resourceRef).not.toBe("worldkit://camera-profile/orbit.medium@1");
    expect(result.runtimeBootstrap.runtimeResourceLockEntries.find(({ resourceRef }) => resourceRef === profile.resourceRef)?.contentHash).toBe(profile.contentHash);
    expect(parseWorldRuntimeBootstrapV1(result.runtimeBootstrap)).toEqual(result.runtimeBootstrap);
    expect(result.nativeBootstrap.initialCamera).toMatchObject(config.camera);
    expect(builtInSubjectResourceRegistry.resolveCameraRigProfile("worldkit://camera-profile/orbit.medium@1")!.parameters.maximumDistanceMeters).toBe(20);
    for (const camera of [
      { ...config.camera, distanceMeters: 30.01 }, { ...config.camera, pitchRadians: 1.401 },
      { ...config.camera, pitchRadians: -1.401 }, { ...config.camera, fovDegrees: 34.9 },
      { ...config.camera, fovDegrees: 100.1 }, { ...config.camera, targetHeightMeters: -0.1 },
      { ...config.camera, targetHeightMeters: 10.1 },
    ]) expect(() => parseCreatorSceneConfig({ ...config, camera })).toThrow(/CREATOR_SCENE_CONFIG_INVALID/);
  });

  it("starts the real Native camera at 30 meters and follows asymmetric spawn facing without another yaw controller", async () => {
    const dependencyRequire = createRequire(new URL("../../packages/runtime-babylon/package.json", import.meta.url));
    const bytes = readFileSync(dependencyRequire.resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"));
    const havokWasmBinary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    for (const facingRadians of [0.73, -1.21]) {
      const config: CreatorSceneConfigV1 = { ...fixture(), spawn: { positionMetersXYZ: [3, 0, -4], facingRadians },
        camera: { pitchRadians: 1.35, distanceMeters: 30, fovDegrees: 100, targetHeightMeters: 10 },
        subject: { kind: "custom-rigid", parts: [{ id: "body", kind: "primitive", shape: { kind: "box", sizeMetersXYZ: [0.5, 1.2, 0.5] }, positionMetersXYZ: [0, 0.6, 0], colliderContribution: "include", semanticTags: ["body"] }] } };
      const input = createCreatorBootstraps(config, inputHash);
      const runtime = await BabylonWorldRuntime.create({
        worldRuntimeBootstrap: input.runtimeBootstrap, gameplayBootstrap: input.gameplayBootstrap, havokWasmBinary,
        engineFactory: () => new NullEngine(),
        sceneSource: { kind: "babylon-native-scene", bootstrap: input.nativeBootstrap,
          assets: { async resolve() { throw new Error("NO_ASSETS_IN_CAMERA_TEST"); } },
          module: { kind: "babylon-native-scene-module", id: config.id, build(context) {
            const floor = MeshBuilder.CreateBox("floor", { width: 150, height: 1, depth: 150 }, context.scene);
            floor.position.y = -0.5;
            registerEntity(context, floor, { id: "floor", physics: "solid", traversable: true });
            context.registration.registerSpawnMarker({ id: "player-spawn", ...config.spawn });
          } }, budget: { maximumStaticColliderCount: 1, maximumStaticColliderVertexCount: 64, maximumStaticColliderTriangleCount: 24 } },
      });
      try {
        await bindRuntimeTestPossession(runtime, "player");
        const actual = await runtime.runFixedInput({ actions: [], ticks: 60 });
        expect(actual.camera.resolvedParameters).toMatchObject({ distanceMeters: 30, maximumDistanceMeters: 30, pitchRadians: 1.35, baseFovDegrees: 100, targetHeightMeters: 10 });
        expect(actual.camera.requestedArmLengthMeters).toBeCloseTo(30, 4);
        expect(actual.camera.controlForwardXYZ![0]).toBeCloseTo(-Math.sin(facingRadians), 5);
        expect(actual.camera.controlForwardXYZ![2]).toBeCloseTo(-Math.cos(facingRadians), 5);
        const target = actual.camera.actualTargetPositionMetersXYZ!;
        const position = actual.camera.actualPositionMetersXYZ!;
        const horizontalLength = Math.hypot(target[0] - position[0], target[2] - position[2]);
        expect((target[0] - position[0]) / horizontalLength).toBeCloseTo(-Math.sin(facingRadians), 5);
        expect((target[2] - position[2]) / horizontalLength).toBeCloseTo(-Math.cos(facingRadians), 5);
      } finally { await runtime.dispose(); }
    }
  }, 30_000);

  it("resolves all 25 G-bot actions and the actual same-origin GLB while preserving camera and bootstrap hashes", () => {
    const config = fixture();
    const output = createCreatorBootstraps(config, inputHash);
    expect(output.runtimeBootstrap.animationSets[0]!.animationBindings).toHaveLength(25);
    expect(output.runtimeBootstrap.initialCamera).toMatchObject(config.camera);
    expect(output.nativeBootstrap.initialCamera).toEqual({ mode: "third-person", ...config.camera });
    expect(output.nativeBootstrap.initialControlledEntityId).toBe(output.runtimeBootstrap.initialControlledEntityId);
    expect(output.nativeBootstrap.gravityMetersPerSecondSquaredXYZ).toEqual(output.runtimeBootstrap.gravityMetersPerSecondSquaredXYZ);
    expect(output.runtimeBootstrap.gameplayBootstrapHash).toBe(output.gameplayBootstrap.contentHash);
    expect(parseGameplayBootstrapV1(output.gameplayBootstrap)).toEqual(output.gameplayBootstrap);
    expect(parseWorldRuntimeBootstrapV1(output.runtimeBootstrap)).toEqual(output.runtimeBootstrap);
    expect(output.gameplayBootstrap.entityDescriptors.map(({ id }) => id)).toEqual(["player"]);
    expect(Object.keys(output)).toEqual(["runtimeBootstrap", "gameplayBootstrap", "nativeBootstrap", "assetUrls", "creatorConfig"]);
    expect(output.creatorConfig).toEqual({ sceneId: config.id, inputHash, worldBounds: config.worldBounds });
    const asset = output.runtimeBootstrap.subjectAssets[0]!;
    const assetUri = output.assetUrls[asset.subjectAssetRef]!;
    expect(assetUri).toBe("/subject-assets/humanoid/g-bot/v2/g-bot.glb");
    const bytes = readFileSync(new URL(`../../apps/playground/public${assetUri}`, import.meta.url));
    expect(bytes.byteLength).toBe(asset.byteLength);
    expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(asset.artifactContentHash);
    expect(() => parseWorldRuntimeBootstrapV1({ ...output.runtimeBootstrap, initialCamera: { ...output.runtimeBootstrap.initialCamera, distanceMeters: 15 } })).toThrow();
    const changed = createCreatorBootstraps({ ...config, camera: { ...config.camera, distanceMeters: 15 } }, inputHash);
    expect(changed.runtimeBootstrap.contentHash).not.toBe(output.runtimeBootstrap.contentHash);
  }, 30_000);

  it("admits a 48-part rigid subject without replacing it with a humanoid", () => {
    const config: CreatorSceneConfigV1 = { ...fixture(), subject: {
      kind: "custom-rigid", parts: Array.from({ length: 48 }, (_, index) => ({
        id: `fox-part-${index}`, kind: "primitive", shape: { kind: "box", sizeMetersXYZ: [0.3, 0.4, 0.3] },
        positionMetersXYZ: [(index % 6) * 0.25, 0.2 + Math.floor(index / 6) * 0.05, -0.3],
        colliderContribution: index === 0 ? "include" : "exclude", semanticTags: [index === 0 ? "body" : "tail"],
      })),
    } };
    const output = createCreatorBootstraps(config, inputHash);
    const actor = output.runtimeBootstrap.subjectRuntimeDescriptors[0]!;
    expect(output.runtimeBootstrap.subjectAssets).toEqual([]);
    expect(output.assetUrls).toEqual({});
    expect(actor.visualParts).toHaveLength(48);
    expect(actor.visualBinding.mode).toBe("static");
    expect(actor.semanticClassId).toBe("subject.creator.custom");
    expect(actor.locomotion).toEqual({ allowWalk: true, allowRun: true, allowJump: true });
    expect(actor.capabilityAssembly.defaultMotionProfile.resourceRef).toBe(BLOCK_MOTION_PACKS_V1["ground.root-standard"].defaultMotionProfileRef);
    expect(actor.visualParts.some(({ kind }) => kind === "asset")).toBe(false);
    const parts = config.subject.kind === "custom-rigid" ? config.subject.parts : [];
    expect(() => parseCreatorSceneConfig({ ...config, subject: { kind: "custom-rigid", parts: [...parts, parts[0]] } })).toThrow();
    expect(() => parseCreatorSceneConfig({ ...config, subject: { kind: "custom-rigid", parts: parts.map((part) => ({ ...part, colliderContribution: "exclude" })) } })).toThrow();
  });

  it("preserves published fixed actions and rejects invented packs/actions", () => {
    const fixed = createCreatorBootstraps({ ...fixture(), subject: { kind: "pack", subjectPackId: "humanoid.g-bot", presentation: { kind: "fixed-action", actionId: "emote.salute" } } }, inputHash);
    expect(fixed.runtimeBootstrap.subjectRuntimeDescriptors[0]!.presentationPolicy).toEqual({ kind: "fixed-action", actionId: "emote.salute" });
    expect(() => createCreatorBootstraps({ ...fixture(), subject: { kind: "pack", subjectPackId: "invented" } }, inputHash)).toThrow(/subjectPackId/);
    expect(() => createCreatorBootstraps({ ...fixture(), subject: { kind: "pack", subjectPackId: "humanoid.g-bot", presentation: { kind: "fixed-action", actionId: "invented" } } }, inputHash)).toThrow(/subject resolution failed/);
    expect(() => createCreatorBootstraps(fixture(), "not-a-hash")).toThrow(/inputHash/);
  });
});

describe("Creator browser registration", () => {
  it("uses the visible mesh itself for physics and keeps decoration free of colliders", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const registerStaticCollider = vi.fn();
      const context = { scene, registration: { registerStaticCollider } } as unknown as BabylonNativeSceneBuildContextV1;
      const mesh = MeshBuilder.CreateBox("slope", {}, scene);
      registerEntity(context, mesh, { id: "slope", physics: "solid" });
      expect(mesh.metadata.worldkitEntityId).toBe("slope");
      expect(registerStaticCollider).toHaveBeenCalledExactlyOnceWith({ id: "slope", mesh, traversalBinding: { kind: "static-surface", surfaceEntityId: "slope", logicalSubshapeId: "primary", traversalSurfaceProfileRef: "worldkit://traversal-surface-profile/ground.static@1" } });
      const decoration = MeshBuilder.CreateBox("cloud", {}, scene);
      registerEntity(context, decoration, { id: "cloud", physics: "none" });
      expect(registerStaticCollider).toHaveBeenCalledTimes(1);
      expect(() => registerEntity(context, decoration, { id: "cloud-again", physics: "none" })).toThrow(/ALREADY_REGISTERED/);
      const duplicate = MeshBuilder.CreateBox("duplicate", {}, scene);
      expect(() => registerEntity(context, duplicate, { id: "slope", physics: "solid" })).toThrow(/ALREADY_REGISTERED/);
      const hidden = MeshBuilder.CreateBox("hidden", {}, scene);
      hidden.isVisible = false;
      expect(() => registerEntity(context, hidden, { id: "hidden", physics: "solid" })).toThrow(/MUST_BE_VISIBLE/);
      expect(() => registerEntity(context, hidden, { id: "invalid", physics: "none", traversable: true })).toThrow(/CREATOR_ENTITY_INVALID/);
    } finally { scene.dispose(); engine.dispose(); }
  });
});
