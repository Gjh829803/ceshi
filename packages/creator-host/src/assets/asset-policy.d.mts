export interface AssetPolicy {
 schemaVersion: 1;
 allowedAssetIds: string[];
 defaultHumanoidAssetId: string;
 allowCustomAssets: boolean;
}
export interface AssetPolicySnapshot {
 kind: 'three-creator-asset-policy-snapshot';
 schemaVersion: 1;
 policy: AssetPolicy;
 allowedAssets: Record<string, any>[];
 deniedResourceSha256: string[];
}
export function createAssetPolicySnapshot(policy: unknown, catalog: Record<string, any>[], additionalDeniedHashes?:string[]): AssetPolicySnapshot;
export function validateAssetPolicySnapshot(snapshot: unknown): AssetPolicySnapshot;
export function assetPolicyHash(snapshot: AssetPolicySnapshot): string;
export function verifyAssetPolicySources(snapshot: AssetPolicySnapshot, files: Record<string, Uint8Array>): void;
export function verifyAssetPolicyBundle(input: {
 snapshot: AssetPolicySnapshot; expectedHash: string;
 sourceFiles: Record<string, Uint8Array>; playableFiles: Record<string, Uint8Array>;
 assetDefinitions: {schemaVersion:1;assets:Record<string, any>[]};
}): void;
