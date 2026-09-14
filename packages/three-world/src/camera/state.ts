import type {
  CameraProposal,
  CameraIntent,
  CameraOpeningReference,
  CameraStrategyHistory,
} from "./strategies/types";
import type {
  CameraDocument,
  ResolvedCameraConfiguration,
} from "../config/camera/index";
import type { RuntimeError } from "../contracts";
import type {
  CameraConstraints,
  CameraCollisionQuerySamples,
  CameraConstraintDiagnostics,
  CameraGeometryProvider,
} from "./constraints";
import type { CameraQuaternion, CameraSubjectFacts } from "./subject";

/** Determined once by World presentation, shared by actors and camera. */
export interface PresentationSampleContext {
  readonly epoch: number;
  readonly previousTick: number;
  readonly currentTick: number;
  readonly alpha: number;
  readonly cut: boolean;
}
export interface CameraFrameIdentity {
  readonly lifecycleGeneration: number;
  readonly simulationTick: number;
  readonly configurationRevision: number;
  readonly logicalTargetId: string;
  readonly resolvedSubjectId: string;
  readonly subjectGeneration: number;
  readonly viewId: string;
  readonly cameraCommitRevision: number;
}
/** Position is the final constrained position; nominal distance remains author intent. */
export interface CameraFixedFrame extends CameraProposal, CameraFrameIdentity {
 /** Physical sample associated with this commit, for read-only display anchor correction. */
 readonly subject?:CameraSubjectFacts;
 readonly subjectAnchorWorldMetersXYZ?:readonly [number,number,number];
}

export function cameraFramesCompatible(
  previous: CameraFixedFrame,
  current: CameraFixedFrame,
): boolean {
  return (
    previous.lifecycleGeneration === current.lifecycleGeneration &&
    previous.resolvedSubjectId === current.resolvedSubjectId &&
    previous.subjectGeneration === current.subjectGeneration &&
    previous.viewId === current.viewId &&
    previous.configurationRevision === current.configurationRevision
  );
}

export interface CameraControllerFrame {
  readonly lifecycleGeneration: number;
  readonly simulationTick: number;
  readonly aspect: number;
}
export interface CameraControllerBindings {
  readonly entityGeneration?: (entityId:string)=>number|undefined;
  readonly sampleSubject: (
    binding: CameraDocument["binding"],
    frame: CameraControllerFrame,
  ) => CameraSubjectFacts | undefined;
  readonly geometry: CameraGeometryProvider;
}
export interface CameraControllerInput {
  readonly orbitDeltaRadiansXY?: readonly [number, number] | undefined;
  readonly orbitRatioXY?: readonly [number, number] | undefined;
  readonly zoomDeltaMeters?: number | undefined;
  readonly movement?: boolean | undefined;
}
export interface CameraControlBasis {
  readonly quaternionWorldXYZW: CameraQuaternion;
  readonly viewId: string;
  readonly resolvedSubjectId: string;
  readonly subjectGeneration: number;
}
export type CameraTransition =
  | {
      readonly kind: "none";
      readonly configuredDurationSeconds: number;
      readonly effectiveDurationSeconds: 0;
      readonly reason?:
        | "first-person-cut"
        | "lifecycle-cut"
        | "requested-cut"
        | "opening-change";
    }
  | {
      readonly kind: "blend";
      readonly source: CameraProposal;
      readonly sourceSubject: CameraSubjectFacts;
      readonly targetViewId: string;
      readonly elapsedSeconds: number;
      readonly durationSeconds: number;
      readonly configuredDurationSeconds: number;
      readonly effectiveDurationSeconds: number;
    };
export interface ViewState {
  readonly configuration: ResolvedCameraConfiguration;
  readonly subject: CameraSubjectFacts;
  readonly intent: CameraIntent;
}
export interface ControllerState {
  readonly mode: "authored" | "follow-pending" | "follow";
  readonly document?: CameraDocument | undefined;
  readonly hash?: string | undefined;
  readonly configurationRevision: number;
  readonly cameraCommitRevision: number;
  readonly authoredPose?: CameraProposal | undefined;
  readonly pendingPose?: CameraProposal | undefined;
  readonly initialSubject?: CameraSubjectFacts | undefined;
  readonly initialReferenceIdentity?: {readonly lifecycleGeneration:number;readonly subjectGeneration:number;readonly targetEntityId:string;readonly targetGeneration:number|undefined} | undefined;
  readonly subject?: CameraSubjectFacts | undefined;
  readonly resolved?: ResolvedCameraConfiguration | undefined;
  readonly initialOpenings: ReadonlyMap<string, CameraOpeningReference>;
  readonly openings: ReadonlyMap<string, CameraOpeningReference>;
  readonly views: ReadonlyMap<string, ViewState>;
  readonly intent?: CameraIntent | undefined;
  readonly history?: CameraStrategyHistory | undefined;
  readonly base?: CameraProposal | undefined;
  readonly previous?: CameraFixedFrame | undefined;
  readonly current?: CameraFixedFrame | undefined;
  readonly transition: CameraTransition;
  readonly diagnostics?: CameraConstraintDiagnostics | undefined;
  readonly adaptations: readonly {
    viewId: string;
    old: CameraIntent;
    next: CameraIntent;
    reason: string;
  }[];
  readonly operations: ReadonlySet<string>;
}
export interface CameraInspection {
  readonly collisionQueries?: CameraCollisionQuerySamples | undefined;
  readonly mode: ControllerState["mode"];
  readonly document?: CameraDocument | undefined;
  readonly documentHash?: string | undefined;
  readonly configurationRevision: number;
  readonly cameraCommitRevision: number;
  readonly resolved?: ResolvedCameraConfiguration | undefined;
  readonly intent?: CameraIntent | undefined;
  /** Last committed unconstrained proposal, including pending activation and blends. */
  readonly desired?: CameraProposal | undefined;
  readonly previous?: CameraFixedFrame | undefined;
  readonly current?: CameraFixedFrame | undefined;
  readonly transition: CameraTransition;
  readonly diagnostics?: CameraConstraintDiagnostics | undefined;
  readonly adaptations: ControllerState["adaptations"];
  readonly failure?:
    | (RuntimeError & { readonly controlBasis?: CameraControlBasis })
    | undefined;
}
export interface CameraCheckpoint {
  readonly inspection: CameraInspection;
}
export type CameraBaseline =
  | {
      readonly mode: "follow";
      readonly document: CameraDocument;
      readonly initialSubject: CameraSubjectFacts;
    }
  | { readonly mode: "authored"; readonly authoredPose: CameraProposal };
export interface SavedState {
  readonly state: ControllerState;
  readonly solver: ReturnType<CameraConstraints["capture"]>;
}
export interface PreparedInput {
  readonly state: ControllerState;
  readonly frame: CameraControllerFrame;
  readonly deltaSeconds: number;
  readonly basis: CameraControlBasis;
}
