import HavokPhysics from "@babylonjs/havok";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import type { Scene } from "@babylonjs/core/scene.pure.js";
import "@babylonjs/core/Physics/joinedPhysicsEngineComponent.js";

import type { Vec3 } from "@whitebox-world/runtime-contracts";

let browserHavokPromise: ReturnType<typeof HavokPhysics> | undefined;
let injectedHavokPromise: ReturnType<typeof HavokPhysics> | undefined;

async function createBrowserHavok(): ReturnType<typeof HavokPhysics> {
  const { default: havokWasmUrl } = await import(
    "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url"
  );
  return HavokPhysics({ locateFile: () => havokWasmUrl });
}

export const FIXED_TIME_STEP_SECONDS = 1 / 60;

export async function enableHavokPhysics(
  scene: Scene,
  gravity: Vec3,
  wasmBinary?: ArrayBuffer,
): Promise<HavokPlugin> {
  const havokPromise = wasmBinary === undefined
    ? (browserHavokPromise ??= createBrowserHavok())
    : (injectedHavokPromise ??= HavokPhysics({ wasmBinary }));
  const havok = await havokPromise;
  const plugin = new HavokPlugin(true, havok);
  const enabled = scene.enablePhysics(new Vector3(...gravity), plugin);
  if (!enabled) throw new Error("WORLDKIT_HAVOK_INITIALIZATION_FAILED");
  const physicsEngine = scene.getPhysicsEngine();
  if (physicsEngine === null) throw new Error("WORLDKIT_HAVOK_ENGINE_MISSING");
  physicsEngine.setTimeStep(FIXED_TIME_STEP_SECONDS);
  // Fixed input owns simulation ticks. Rendering must never advance gameplay.
  scene.physicsEnabled = false;
  return plugin;
}
