declare module "virtual:worldkit-native-scene" {
  import type { BabylonNativeSceneModuleV1 } from
    "@whitebox-world/native-babylon";
  import type { Sha256HashV1 } from "@whitebox-world/protocol";

  const module: BabylonNativeSceneModuleV1;
  export default module;
  export const moduleBundleContentHash: Sha256HashV1;
}
