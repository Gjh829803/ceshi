import { captureCameraComposition, composeCameraAtPosition } from "./composition";
import {subjectAnchor} from './subject';
import {
  CameraCollisionSolver,
  type CameraCollisionProbe,
  type CameraCollisionRequest,
  type CameraCollisionSolution,
} from "@worldkit/camera-collision";
import type {
  CameraLens,
  CameraVector3,
  ResolvedCameraConfiguration,
} from "../config/camera/index";
import { failure } from "../control-support";
import type { CameraSubjectFacts } from "./subject";
import type { CameraProposal } from "./strategies/types";

/** Provider supplies target-specific exclusions and live world-space queries (sphere for positive radius, ray for zero).
 * Distances are unpadded; the kernel adds the configured clearance exactly once. */
export type CameraGeometryProvider = (context: {
  readonly subject: CameraSubjectFacts;
  readonly lens: CameraLens;
  readonly aspect: number;
}) => { readonly probe: CameraCollisionProbe };
export type CameraConstraintResult =
  | { readonly status: "disabled" }
  | {
      readonly status: "measured";
      readonly phase: CameraCollisionSolution["phase"];
      readonly limited: boolean;
      readonly safeDistanceMeters: number;
      readonly effectiveDistanceMeters: number;
      readonly colliderEntityId?: string;
      readonly visibility?: CameraCollisionSolution["visibility"];
    };
export type CameraConstraintDiagnostics = CameraConstraintResult & {readonly simulationTick:number};
/** Display measurements belong to this sample and never replace fixed diagnostics. */
export interface CameraProjectedProposal extends CameraProposal {
  readonly constraintDiagnostics?: CameraConstraintResult;
}
export interface CameraConstraintStep {
  readonly simulationTick: number;
  readonly deltaSeconds: number;
  readonly aspect: number;
  readonly cut: boolean;
  readonly previous?: CameraProposal | undefined;
}
/** One bounded recording of queries that the camera solver actually executed. */
export interface CameraCollisionProbeSample {
  readonly sampleId: number;
  readonly source: 'fixed' | 'prediction' | 'presentation';
  readonly simulationTick: number;
  readonly probes: readonly {
    readonly from: CameraVector3;
    readonly to: CameraVector3;
    readonly radius: number;
    readonly hit: ReturnType<CameraCollisionProbe>;
  }[];
  readonly droppedProbes: number;
}
export type CameraCollisionQuerySamples = Partial<Record<CameraCollisionProbeSample['source'], CameraCollisionProbeSample>>;
const MAX_CAPTURED_PROBES = 256;
export class CameraConstraints {
  private probe: CameraCollisionProbe | undefined;
  private captureEnabled = false;
  private sampleId = 0;
  private samples: CameraCollisionQuerySamples = {};
  private activeSample: {sampleId:number;source:CameraCollisionProbeSample['source'];simulationTick:number;probes:CameraCollisionProbeSample['probes'][number][];droppedProbes:number} | undefined;
  get diagnosticsRevision(): number { return this.sampleId; }
  setDiagnosticsEnabled(enabled: boolean): void {
    if (enabled === this.captureEnabled) return;
    this.captureEnabled = enabled;
    this.samples = {};
    this.sampleId++;
  }
  inspectQueries(): CameraCollisionQuerySamples | undefined {
    return this.captureEnabled ? structuredClone(this.samples) : undefined;
  }
  private recordQueries<T>(source: CameraCollisionProbeSample['source'], simulationTick: number, run: () => T): T {
    if (!this.captureEnabled) return run();
    const sample = {sampleId: ++this.sampleId, source, simulationTick, probes: [] as CameraCollisionProbeSample['probes'][number][], droppedProbes: 0};
    if(source === 'fixed') { const {presentation: _presentation, ...remaining} = this.samples; this.samples = remaining; }
    this.activeSample = sample;
    try { return run(); }
    finally { this.samples = {...this.samples, [source]: sample}; this.activeSample = undefined; }
  }
  private readonly solver = new CameraCollisionSolver((...args) => {
    if (!this.probe) throw failure("CAMERA_QUERY_UNAVAILABLE");
    const hit = this.probe(...args);
    const sample = this.activeSample;
    if (sample) {
      if (sample.probes.length < MAX_CAPTURED_PROBES) sample.probes.push(structuredClone({from: args[0], to: args[1], radius: args[2], hit}));
      else sample.droppedProbes++;
    }
    return hit;
  });
  constructor(private readonly geometry: CameraGeometryProvider) {}
  capture() {
    return this.solver.captureTransactionState();
  }
  restore(state: ReturnType<CameraConstraints["capture"]>): void {
    this.solver.restoreTransactionState(state);
  }
  reset(): void {
    this.solver.reset();
  }
  private request(
    proposal: CameraProposal,
    configuration: ResolvedCameraConfiguration,
    subject: CameraSubjectFacts,
    current: CameraProposal | undefined,
    sweep: boolean,
  ): CameraCollisionRequest {
    const collision = configuration.values.constraints.collision;
    return {
      target: proposal.pivotWorldMetersXYZ,
      ...(proposal.visibility === "require-line-of-sight" && proposal.visibilityTargetWorldMetersXYZ
        ? {visibilityTarget: proposal.visibilityTargetWorldMetersXYZ} : {}),
      eye: proposal.positionWorldMetersXYZ,
      current:
        current?.positionWorldMetersXYZ ?? proposal.positionWorldMetersXYZ,
      radius: collision.radiusMeters,
      pivotOrigin: subject.body?subjectAnchor(subject,{kind:'body',heightRatio:.5}).toArray():subject.positionWorldMetersXYZ,
      armClearance: collision.armClearanceMeters,
      pivotClearance: collision.pivotClearanceMeters,
      ...(sweep && current
        ? { sweepFrom: current.positionWorldMetersXYZ }
        : {}),
    };
  }
  private withGeometry<T>(
    subject: CameraSubjectFacts,
    proposal: CameraProposal,
    aspect: number,
    run: () => T,
  ): T {
    if (!Number.isFinite(aspect) || aspect <= 0)
      throw failure("CAMERA_VIEWPORT_INVALID");
    if (this.probe) throw failure("CAMERA_TRANSACTION_REENTRY");
    try {
      this.probe = this.geometry({
        subject,
        lens: proposal.lens,
        aspect,
      }).probe;
      return run();
    } catch (error) {
      throw failure(
        "CAMERA_CONSTRAINT_EXECUTION_FAILED",
        error instanceof Error ? error.message : String(error),
        "runtime",
      );
    } finally {
      this.probe = undefined;
    }
  }
  private measured(result:CameraCollisionSolution):CameraConstraintResult {
    return {status:'measured',phase:result.phase,limited:result.limited,safeDistanceMeters:result.safeDistance,effectiveDistanceMeters:result.effectiveDistance,
      ...(result.entityId?{colliderEntityId:result.entityId}:{}),...(result.visibility?{visibility:result.visibility}:{})};
  }
  private corrected(
    proposal: CameraProposal,
    position: CameraVector3,
    configuration: ResolvedCameraConfiguration,
    subject: CameraSubjectFacts,
  ): CameraProposal {
    const { composition: _composition, ...sightPose } = proposal;
    const intended = configuration.kind === "first-person" ? sightPose : captureCameraComposition(proposal,
      configuration.values.orientation.referenceFrame === "subject-up" ? subject.semanticQuaternionWorldXYZW ?? [0,0,0,1] : [0,0,0,1]);
    // Do not perturb an unchanged authored endpoint (including a vertical pole).
    if (position.every((value, index) => value === proposal.positionWorldMetersXYZ[index])) return intended;
    return composeCameraAtPosition(intended, position);
  }
  solve(
    proposal: CameraProposal,
    configuration: ResolvedCameraConfiguration,
    subject: CameraSubjectFacts,
    step: CameraConstraintStep,
    source: CameraCollisionProbeSample['source'] = 'fixed',
  ): { proposal: CameraProposal; diagnostics: CameraConstraintDiagnostics } {
    return this.recordQueries(source, step.simulationTick, () => {
    if (!configuration.values.constraints.collision.enabled)
      return {
        proposal,
        diagnostics: {
          status: "disabled",
          simulationTick: step.simulationTick,
        },
      };
    const before = this.capture();
    try {
      return this.withGeometry(subject, proposal, step.aspect, () => {
        if (step.cut) this.reset();
        const recovery = configuration.values.constraints.recovery;
        const result = this.solver.solve(
          this.request(
            proposal,
            configuration,
            subject,
            step.cut ? undefined : step.previous,
            !step.cut,
          ),
          {
            retractionHalfLifeSeconds: configuration.values.constraints.retraction.halfLifeSeconds,
            maximumRetractionMetersPerSecond: configuration.values.constraints.retraction.speedLimit.kind === "unlimited"
              ? "unlimited" : configuration.values.constraints.retraction.speedLimit.maximumSpeedMetersPerSecond,
            authorityTick: step.simulationTick,
            deltaSeconds: step.deltaSeconds,
            clearHoldSeconds: recovery.clearHoldSeconds,
            recoveryHalfLifeSeconds: recovery.halfLifeSeconds,
            maximumRecoveryMetersPerSecond:
              recovery.speedLimit.kind === "unlimited"
                ? "unlimited"
                : recovery.speedLimit.maximumSpeedMetersPerSecond,
            releaseDeadbandMeters: recovery.releaseDeadbandMeters,
          },
        );
        return {
          proposal: this.corrected(proposal, result.position, configuration, subject),
          diagnostics: {...this.measured(result),simulationTick:step.simulationTick},
        };
      });
    } catch (error) {
      this.restore(before);
      throw error;
    }
    });
  }
  /** Pre-physics input prediction shares the solver without committing recovery
   * time. An unsolved pre-movement pose must not prevent movement out of it;
   * keep the last committed sight and let the actual fixed commit diagnose it. */
  predict(proposal: CameraProposal, configuration: ResolvedCameraConfiguration, subject: CameraSubjectFacts, step: CameraConstraintStep): CameraProposal {
    const before = this.capture();
    try {
      return this.solve(proposal, configuration, subject, step, 'prediction').proposal;
    } catch {
      return step.previous ?? proposal;
    } finally {
      this.restore(before);
    }
  }
  project(
    proposal: CameraProposal,
    configuration: ResolvedCameraConfiguration,
    subject: CameraSubjectFacts,
    aspect: number,
    current: CameraProposal,
    simulationTick = 0,
    source: CameraCollisionProbeSample['source'] = 'presentation',
  ): CameraProjectedProposal {
    return this.recordQueries(source, simulationTick, () => {
    if (!configuration.values.constraints.collision.enabled) return {...proposal,constraintDiagnostics:{status:'disabled'}};
    return this.withGeometry(subject, proposal, aspect, () => {
      const result=this.solver.project(this.request(proposal,configuration,subject,current,false));
      return {...this.corrected(proposal,result.position,configuration,subject),constraintDiagnostics:this.measured(result)};
    });
    });
  }
}
