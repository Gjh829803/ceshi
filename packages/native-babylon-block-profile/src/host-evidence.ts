import type { Scene } from "@babylonjs/core/scene.js";

import type { BabylonNativeBlockProfileCheckResultV1 } from "./check.js";
import type { BabylonNativeBlockLayoutV1 } from "./layout.js";

export interface BabylonNativeBlockCheckedEpochEvidenceV1 {
  readonly kind: "babylon-native-block-checked-epoch-evidence";
  readonly schemaVersion: 1;
  readonly checkedLayout: Readonly<{
    readonly kind: "babylon-native-block-checked-layout";
    readonly schemaVersion: 1;
    readonly layout: BabylonNativeBlockLayoutV1;
    readonly checkResult: BabylonNativeBlockProfileCheckResultV1;
  }>;
  readonly profileInventoryHash: `sha256:${string}`;
}

const EVIDENCE_BY_SCENE = new WeakMap<
  Scene,
  BabylonNativeBlockCheckedEpochEvidenceV1[]
>();

function deepFreezePlainData<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => deepFreezePlainData(entry))) as T;
  }
  if (typeof value !== "object" || value === null) return value;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = deepFreezePlainData(entry);
  }
  return Object.freeze(output) as T;
}

export function recordBabylonNativeBlockCheckedEpochEvidenceV1(
  scene: Scene,
  input: BabylonNativeBlockCheckedEpochEvidenceV1,
): void {
  const evidence = deepFreezePlainData(structuredClone(input));
  const entries = EVIDENCE_BY_SCENE.get(scene) ?? [];
  entries.push(evidence);
  EVIDENCE_BY_SCENE.set(scene, entries);
}

export function takeBabylonNativeBlockCheckedEpochEvidenceV1(
  scene: Scene,
): readonly BabylonNativeBlockCheckedEpochEvidenceV1[] {
  const evidence = EVIDENCE_BY_SCENE.get(scene) ?? [];
  EVIDENCE_BY_SCENE.delete(scene);
  return Object.freeze([...evidence]);
}
