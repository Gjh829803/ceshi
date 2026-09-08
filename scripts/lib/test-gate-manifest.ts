export type TestLaneV1 = "contract" | "resource-heavy";

export type ResourceHeavyReasonCodeV1 =
  | "browser-or-server-process"
  | "native-recast"
  | "native-rapier"
  | "measured-duration"
  | "measured-memory"
  | "measured-contention";

export interface TestGateManifestEntryV1 {
  readonly path: string;
  readonly lane: TestLaneV1;
  readonly reasonCodes?: readonly ResourceHeavyReasonCodeV1[];
}

export const TEST_GATE_MANIFEST_V1: readonly TestGateManifestEntryV1[] = Object.freeze([
  { path: "packages/camera-collision/src/camera-collision-solver.test.ts", lane: "contract" },
  { path: "packages/three-world/src/assets-library.test.ts", lane: "contract" },
  { path: "packages/three-world/src/assets-locomotion.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/assets.test.ts", lane: "contract" },
  { path: "packages/three-world/src/camera.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/capture-selection-integration.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/capture-selection.test.ts", lane: "contract" },
  { path: "packages/three-world/src/episode-locomotion.integration.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/episode.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/humanoid-asset.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/humanoid.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/input.test.ts", lane: "resource-heavy", reasonCodes: ["browser-or-server-process"] },
  { path: "packages/three-world/src/locomotion-animation.integration.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/locomotion-animation.test.ts", lane: "contract" },
  { path: "packages/three-world/src/navigation.test.ts", lane: "resource-heavy", reasonCodes: ["native-recast"] },
  { path: "packages/three-world/src/physics-continuity.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/physics.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/presentation.test.ts", lane: "resource-heavy", reasonCodes: ["browser-or-server-process", "native-rapier"] },
  { path: "packages/three-world/src/training/environment/mounted-queries.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/training/horse.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/training/mounted-interaction.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/training/mounted-lifecycle.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/training/mounted-presentation.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/training/runtime.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/training/water-feedback.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/world-integration.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/world-v2.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "packages/three-world/src/world.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier", "native-recast"] },
  { path: "scripts/lib/independent-test-gate.test.ts", lane: "contract" },
  { path: "scripts/lib/playwright-browser-launch.test.ts", lane: "contract" },
  { path: "scripts/lib/test-gate-census.test.ts", lane: "contract" },
  { path: "scripts/lib/three-workspace-boundary.test.ts", lane: "contract" },
  { path: "scripts/testing/repository-layout.test.ts", lane: "contract" },
  { path: "scripts/testing/workspace-boundary.test.ts", lane: "contract" },
  { path: "scripts/three-creator/asset-policy.test.ts", lane: "resource-heavy", reasonCodes: ["measured-duration"] },
  { path: "scripts/three-creator/asset-resources.test.ts", lane: "contract" },
  { path: "scripts/three-creator/authoring-schema.test.ts", lane: "contract" },
  { path: "scripts/three-creator/capture-plan.test.ts", lane: "contract" },
  { path: "scripts/three-creator/capture.test.ts", lane: "resource-heavy", reasonCodes: ["browser-or-server-process"] },
  { path: "scripts/three-creator/character-guidance.test.ts", lane: "resource-heavy", reasonCodes: ["measured-duration"] },
  { path: "scripts/three-creator/compiler.test.ts", lane: "resource-heavy", reasonCodes: ["browser-or-server-process"] },
  { path: "scripts/three-creator/example-files.test.ts", lane: "contract" },
  { path: "scripts/three-creator/mount-guidance.test.ts", lane: "resource-heavy", reasonCodes: ["measured-duration"] },
  { path: "scripts/three-creator/tool-usability.test.ts", lane: "resource-heavy", reasonCodes: ["browser-or-server-process"] },
  { path: "scripts/three-creator/tools.test.ts", lane: "resource-heavy", reasonCodes: ["browser-or-server-process"] },
  { path: "scripts/three-creator/training-families.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "scripts/three-creator/training-import-catalog.test.ts", lane: "contract" },
  { path: "scripts/three-creator/training-inspector.test.ts", lane: "resource-heavy", reasonCodes: ["browser-or-server-process"] },
  { path: "scripts/three-creator/training-workspace.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "scripts/three-creator/water-feedback.test.ts", lane: "contract" },
  { path: "scripts/three-creator/workspace-runtime.test.ts", lane: "resource-heavy", reasonCodes: ["measured-duration"] },
  { path: "scripts/three-episode/action-controller.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "scripts/three-episode/adapter.test.ts", lane: "resource-heavy", reasonCodes: ["browser-or-server-process", "native-rapier"] },
  { path: "scripts/three-episode/capture.test.ts", lane: "contract" },
  { path: "scripts/three-episode/contracts.test.ts", lane: "contract" },
  { path: "scripts/three-episode/mcp.test.ts", lane: "resource-heavy", reasonCodes: ["browser-or-server-process"] },
  { path: "scripts/three-episode/route-controller.test.ts", lane: "contract" },
  { path: "scripts/three-episode/source-asset-policy.test.ts", lane: "contract" },
  { path: "scripts/three-episode/source-export.test.ts", lane: "contract" },
  { path: "scripts/three-episode/training-route.test.ts", lane: "resource-heavy", reasonCodes: ["native-rapier"] },
  { path: "scripts/three-episode/workflow.test.ts", lane: "contract" },
]);
