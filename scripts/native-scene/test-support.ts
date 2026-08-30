import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const VALID_NATIVE_SCENE_BOOTSTRAP_FIXTURE_V1 = Object.freeze({
  kind: "babylon-native-scene-bootstrap",
  schemaVersion: 1,
  id: "native-source-test",
  sceneModuleRef: "worldkit://native-scene/native-source-test@1",
  nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
  nativeSceneProfileRef:
    "worldkit://native-scene-profile/whitebox.standard@1",
  gameplayBootstrapRef: "worldkit://gameplay-bootstrap/g-bot@1",
  initialControlledEntityId: "player",
  gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
  initialCamera: {
    mode: "third-person",
    pitchRadians: 0.1,
    distanceMeters: 5,
    fovDegrees: 55,
    targetHeightMeters: 1.2,
  },
  seed: 7301,
  spawnMarkerId: "player-spawn",
} as const);

export const MINIMAL_NATIVE_SCENE_SOURCE_V1 = `
import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";

export default defineBabylonNativeScene({
  kind: "babylon-native-scene-module",
  id: "native-source-test",
  build() {},
});
`;

export interface NativeSceneWorkspaceFixtureOptionsV1 {
  readonly bootstrap?: unknown;
  readonly omitBootstrap?: boolean;
  readonly files?: Readonly<Record<string, string | Uint8Array>>;
}

export async function createNativeSceneWorkspaceFixtureV1(
  options: NativeSceneWorkspaceFixtureOptionsV1 = {},
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "worldkit-native-source-"));
  if (!options.omitBootstrap) {
    await writeFile(
      path.join(root, "native-scene.bootstrap.json"),
      `${JSON.stringify(
        options.bootstrap ?? VALID_NATIVE_SCENE_BOOTSTRAP_FIXTURE_V1,
      )}\n`,
      "utf8",
    );
  }
  const files = options.files ?? { "scene.ts": MINIMAL_NATIVE_SCENE_SOURCE_V1 };
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }
  return root;
}

export async function removeNativeSceneWorkspaceFixtureV1(
  root: string,
): Promise<void> {
  await rm(root, { force: true, recursive: true });
}
