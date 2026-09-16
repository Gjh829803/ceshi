/** Identity and persistence are supplied by the host, never inferred from the browser URL. */
export interface DebugSourceIdentity {
 readonly sourceHash:string;
 readonly head?:string;
 readonly serverId?:string;
 readonly revision?:number;
 readonly authorSourceHash?:string;
 readonly runtimeHash?:string;
 readonly worldBuildHash?:string;
}
export interface DebugBundleFiles {
 readonly id:string;
 readonly directory?:string;
 readonly files:Record<string,{path:string;sha256:string;bytes:number}>;
}
export interface DebugArtifactStore {
 identity():Promise<DebugSourceIdentity>;
 save(bundle:{metadata:unknown;screenshotDataUrl?:string;recording?:unknown}):Promise<DebugBundleFiles>;
 load(id:string):Promise<unknown>;
}
