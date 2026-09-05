declare module "virtual:creator-scene" {
  const creatorModule: import("@whitebox-world/native-babylon").BabylonNativeSceneModuleV1;
  export default creatorModule;
}

declare module "virtual:creator-config" {
  export const runtimeBootstrap: import("@whitebox-world/runtime-contracts").WorldRuntimeBootstrapV1;
  export const gameplayBootstrap: import("@whitebox-world/gameplay-contracts").GameplayBootstrapV1;
  export const nativeBootstrap: import("@whitebox-world/runtime-contracts").BabylonNativeSceneBootstrapV1;
  export const assetUrls: Readonly<Record<string, string>>;
  export const creatorConfig: import("./browser-contract.js").CreatorHarnessConfigV1;
}
