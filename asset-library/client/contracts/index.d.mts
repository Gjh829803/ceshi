export const CONTRACT_VERSION: '1.0.0';
export type Digest = string;
export type AssetRef = {asset_id:string;version:string};
export type AssemblyRef = {assembly_id:string;version:string};
export type AssetRequest = {asset_id:string;version:string};
export type Artifact = {artifact_id:string;sha256:Digest;byte_length:number;mime_type:string;format:string;role:'runtime'|'preview';storage_path:string};
export type Resource = Artifact & {resource_id:string;logical_paths:string[]};
export type ManifestRef = AssetRef & {manifest_digest:Digest;manifest_path:string};
export interface RuntimeContext {
 runtime_id:string;runtime_version:string;adapter_id:string;adapter_version:string;
 preset_digest:Digest;overrides_digest:Digest|null;
 supported_contracts:{contract_id:string;version:string}[];
 runtime_digest?:Digest;
 preset_refs?:{preset_id:string;version:string;digest:Digest}[];
}
export interface AssetManifest {
 kind:'asset-manifest';contract_version:string;asset_id:string;version:string;taxonomy_version:string;
 display_name:string;description:string;group:string;placeholder:boolean;
 model_resource_id:string|null;preview_resource_id:string|null;resources:Resource[];
 dependencies:AssetRef[];
 runtime_requirements:{contract_id:string;version:string}[];
 sections:{asset:Record<string,unknown>;capabilities:Record<string,unknown>;bindings:Record<string,unknown>;facts:Record<string,unknown>;animations:unknown[];provenance:Record<string,unknown>;validation:RuntimeValidation;assembly:Record<string,unknown>};
 extensions:{whitebox?:Record<string,unknown>};
}
export interface RuntimeEvidence extends AssetRef {
 status:'verified';evidence_id:string;
 runtime_id:string;runtime_version:string;runtime_digest:Digest;
 adapter_id:string;adapter_version:string;preset_digest:Digest;overrides_digest:Digest|null;
 supported_contracts?:RuntimeContext['supported_contracts'];preset_refs?:RuntimeContext['preset_refs'];
}
export interface RuntimeValidation {
 runtime:'not_run'|'failed'|'verified'|'incompatible';
 evidence:(string|RuntimeEvidence)[];
 [key:string]:unknown;
}
export interface AssetSummary extends ManifestRef {
 display_name:string;description:string;group:string;stage:string;license_status:string;license_id:string|null;placeholder:boolean;preview:Artifact|null;
 morphology:string[];movement:string[];capabilities:string[];
 readiness:{previewable:boolean;runtime:'unknown'|'verified'|'incompatible'|'adapter_required'};
 requirements:{contract_id:string;version:string}[];
}
export interface RegistryDescriptor {
 kind:'asset-registry';contract_version:string;registry_id:string;snapshot_id:string;taxonomy_version:string;
 audience:'internal'|'public';index_path:string;index_digest:Digest;
 endpoints:{search:string;describe:string;compatibility:string;resolve:string;artifacts:string;resource_scope?:string};
}
export interface SearchRequest {
 query?:string;asset_ids?:string[];group?:string;morphology?:string[];movement?:string[];capabilities?:string[];
 stage?:string;previewable?:boolean;runtime_ready?:boolean;
 limit?:number;cursor?:string;snapshot_id?:string;runtime?:RuntimeContext;
}
export interface SearchResponse {
 contract_version:string;registry_id:string;snapshot_id:string;items:AssetSummary[];
 next_cursor:string|null;total?:number;
}
export interface ResourceScopeRequest {allowed_asset_ids:string[];snapshot_id?:string;}
export interface ResourceScope {contract_version:string;registry_id:string;snapshot_id:string;denied_resource_sha256:Digest[];scope_digest:Digest;}
export interface CompatibilityRequest {assets:AssetRef[];runtime:RuntimeContext|null;snapshot_id?:string;}
export interface CompatibilityResult {
 contract_version:string;status:'compatible'|'incompatible'|'unknown'|'adapter_required';
 assets:AssetRef[];runtime:RuntimeContext|null;
 reasons:{code:string;message:string;asset_id?:string}[];
 evidence:{asset_id:string;version:string;manifest_digest:Digest;evidence_id:string;runtime_digest:Digest;adapter_version:string;preset_digest:Digest}[];
}
export interface ResolveRequest {
 assets:AssetRequest[];purpose:'runtime'|'preview';runtime:RuntimeContext|null;snapshot_id?:string;
 assemblies?:AssemblyRef[];
}
export interface ProjectLock {
 kind:'asset-lock';contract_version:string;registry_id:string;snapshot_id:string;taxonomy_version:string;
 purpose:'runtime'|'preview';roots:AssetRef[];assets:ManifestRef[];artifacts:Artifact[];
 assemblies:{assembly_id:string;version:string;manifest_digest:Digest}[];
 runtime:RuntimeContext|null;compatibility:CompatibilityResult;lock_digest:Digest;
}
export interface ArtifactLocation {contract_version:string;artifact_id:string;url:string;expires_at:string|null;}
export interface RegistryErrorData {code:string;message:string;retryable:boolean;details:Record<string,unknown>;}
export function canonicalJson(value:unknown):string;
export function assertSafePath(value:unknown):asserts value is string;
export function assertContractVersion(value:unknown):void;
export function isVersion(value:unknown):value is string;
export function satisfiesVersion(version:string,selector:string):boolean;
export function compareVersions(a:string,b:string):number;
export function protocolError(code:string,message?:string,status?:number,details?:Record<string,unknown>):Error & {code:string;status:number;retryable:boolean;details:Record<string,unknown>};
export const schemas:Record<string,unknown>;
