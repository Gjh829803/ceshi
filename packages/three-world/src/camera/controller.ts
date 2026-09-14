import {cameraSubjectHeading} from './strategies/heading';
import {createOpeningReference} from './strategies/third-person';
import {cameraDisplayAnchor} from './display-anchor';
import {cameraFramesCompatible} from './state';
import {
  resolve,
  adoptAuthoredOpening,
  initialIntent,
  openingReferences,
  validateHotIntent,
  needsHistoryReset,
  sameOpeningBasis,
  sameDeclaredOpeningAnchor,
  sameCameraData as equal,
} from "./configuration-state";
import { Matrix4, Quaternion, Vector3 } from "three";
import {
  hashCameraDocument,
  parseCameraDocument,
  type CameraDocument,
  type CameraOpeningConfiguration,
  type ResolvedCameraConfiguration,
} from "../config/camera/index";
import { failure, runtimeError } from "../control-support";

import { CameraConstraints, type CameraProjectedProposal } from "./constraints";
import {
  clampCameraIntent,
  rebaseCameraIntent,
  sameCameraSubject,
  relocateCameraProposal,
  type CameraLifecycleEvent,
} from "./lifecycle";
import {
  blendCameraProposals,
  sampleCameraPresentation,
  validateCameraProposal,
} from "./presentation";
import type { CameraFixedFrame, PresentationSampleContext } from "./state";
import { cameraPositionAnchor, subjectHeading, type CameraSubjectFacts } from "./subject";
import { prepareCameraIntent, evaluateStrategy } from "./strategies/evaluation";
import { evaluateFirstPerson } from "./strategies/first-person";
import type {
  CameraIntent,
  CameraOpeningReference,
  CameraProposal,
  CameraStrategyHistory,
} from "./strategies/types";

import type {
  CameraControllerFrame,
  CameraControllerBindings,
  CameraControllerInput,
  CameraControlBasis,
  CameraTransition,
  ViewState,
  ControllerState,
  CameraInspection,
  CameraCheckpoint,
  CameraBaseline,
  SavedState,
  PreparedInput,
} from "./state";
export type {
  CameraControllerFrame,
  CameraControllerBindings,
  CameraControllerInput,
  CameraControlBasis,
  CameraTransition,
  CameraInspection,
  CameraCheckpoint,
  CameraBaseline,
} from "./state";
const clone = <T>(value: T): T => structuredClone(value);
function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) immutable(item);
    Object.freeze(value);
  }
  return value;
}
const none = (): CameraTransition => ({
  kind: "none",
  configuredDurationSeconds: 0,
  effectiveDurationSeconds: 0,
});

/** Sole camera transaction owner. No DOM, Three camera, actor controller or world clock. */
export class CameraController {
  private state: ControllerState = {
    mode: "authored",
    configurationRevision: 0,
    cameraCommitRevision: 0,
    initialOpenings: new Map(),
    openings: new Map(),
    views: new Map(),
    transition: none(),
    adaptations: [],
    operations: new Set(),
  };
  private readonly constraints: CameraConstraints;
  private checkpoints = new WeakMap<CameraCheckpoint, SavedState>();
  private readonly baselines = new WeakMap<CameraBaseline, SavedState>();
  private baseline: CameraBaseline | undefined;
  private pending: PreparedInput | undefined;
  private busy = false;
  private disposed = false;
  private failureState: CameraInspection["failure"];
  constructor(private readonly bindings: CameraControllerBindings) {
    this.constraints = new CameraConstraints(bindings.geometry);
  }
  private admit(frame?: CameraControllerFrame, recovery = false): void {
    if (this.disposed) throw failure("WORLD_DISPOSED");
    if (this.busy || this.pending) throw failure("CAMERA_TRANSACTION_REENTRY");
    if (this.failureState && !recovery)
      throw failure("CAMERA_RECOVERY_REQUIRED");
    if (
      frame &&
      (!Number.isSafeInteger(frame.lifecycleGeneration) ||
        frame.lifecycleGeneration < 0 ||
        !Number.isSafeInteger(frame.simulationTick) ||
        frame.simulationTick < 0 ||
        !Number.isFinite(frame.aspect) ||
        frame.aspect <= 0)
    )
      throw failure("CAMERA_FRAME_INVALID");
  }
  private transaction<T>(run: () => T): T {
    const before = this.constraints.capture();
    this.busy = true;
    try {
      return run();
    } catch (error) {
      this.constraints.restore(before);
      throw runtimeError(error, "camera");
    } finally {
      this.busy = false;
    }
  }
  private sample(
    document: CameraDocument,
    frame: CameraControllerFrame,
  ): CameraSubjectFacts {
    const subject = this.bindings.sampleSubject(document.binding, frame);
    if (!subject)
      throw failure(
        "CAMERA_TARGET_UNAVAILABLE",
        `Target ${document.binding.targetEntityId} unavailable`,
      );
    const vectors = [
      subject.positionWorldMetersXYZ,
      subject.geometryScaleXYZ,
      ...(subject.eyeWorldMetersXYZ ? [subject.eyeWorldMetersXYZ] : []),
      ...(subject.seatWorldMetersXYZ ? [subject.seatWorldMetersXYZ] : []),
    ];
    const rotations = [
      subject.geometryQuaternionWorldXYZW,
      ...(subject.semanticQuaternionWorldXYZW
        ? [subject.semanticQuaternionWorldXYZW]
        : []),
    ];
    if (
      !subject.id ||
      !Number.isSafeInteger(subject.generation) ||
      subject.generation < 0 ||
      !Number.isFinite(subject.speedMetersPerSecond) ||
      (subject.continuousHeadingSeedRadians !== undefined && !Number.isFinite(subject.continuousHeadingSeedRadians)) ||
      vectors.some(
        (value) => value.length !== 3 || !value.every(Number.isFinite),
      ) ||
      rotations.some(
        (value) =>
          value.length !== 4 ||
          !value.every(Number.isFinite) ||
          Math.abs(new Quaternion(...value).lengthSq() - 1) > 1e-7,
      )
    )
      throw failure("CAMERA_SUBJECT_FACTS_INVALID");
    return clone(subject);
  }
  private rebaseIntent(
    intent: CameraIntent,
    previous: CameraSubjectFacts,
    next: CameraSubjectFacts,
    oldConfiguration: ResolvedCameraConfiguration,
    configuration: ResolvedCameraConfiguration,
    relocate: boolean,
    rangePolicy: "clamp" | "reject" = "clamp",
  ): CameraIntent {
    const oldFrame = oldConfiguration.values.orientation.referenceFrame,
      newFrame = configuration.values.orientation.referenceFrame;
    const unstable =
      (oldFrame === "subject-up" && !previous.semanticQuaternionWorldXYZW) ||
      (newFrame === "subject-up" && !next.semanticQuaternionWorldXYZW) ||
      (relocate &&
        newFrame === "world-up" &&
        (subjectHeading(previous) === undefined ||
          subjectHeading(next) === undefined));
    if(unstable&&rangePolicy==='reject')throw failure("CAMERA_INTENT_OUT_OF_RANGE");
    return unstable
      ? initialIntent(
          configuration,
          next,
          this.state.openings.get(configuration.viewId),
        )
      : rebaseCameraIntent(
          intent,
          previous,
          next,
          oldConfiguration,
          configuration,
          relocate,
          rangePolicy,
        );
  }
  private pose(
    state: ControllerState,
    subject: CameraSubjectFacts,
    dt: number,
    headingHistory?: CameraStrategyHistory,
  ) {
    const input = {
      subject,
      configuration: state.resolved!,
      intent: state.intent!,
      history: state.history,
      headingHistory: state.history ?? headingHistory,
      opening: state.openings.get(state.resolved!.viewId),
      deltaSeconds: dt,
    };
    return input.configuration.kind === "first-person"
      ? evaluateFirstPerson({
          ...input,
          configuration: input.configuration,
          history: input.history as
            | CameraStrategyHistory<"first-person">
            | undefined,
        })
      : evaluateStrategy(input);
  }
  private desiredPose(candidate: ControllerState, base: CameraProposal): CameraProposal {
    return candidate.mode === "follow-pending"
      ? (candidate.pendingPose ?? (candidate.resolved?.kind === "third-person" && candidate.resolved.opening ? base : (candidate.authoredPose ?? base)))
      : base;
  }
  private intentAtOpening(reference: CameraOpeningReference, configuration: ResolvedCameraConfiguration,
    subject: CameraSubjectFacts, previous: CameraIntent): CameraIntent {
    const measured = {...previous, yawRadians: reference.yawRadians,
      pitchRadians: reference.pitchRadians, distanceMeters: reference.distanceMeters};
    // A measured nominal arm already includes speed pullback. The new strategy
    // history initializes that effect once, so retain only the commanded radius.
    const effect = evaluateStrategy({configuration, subject, intent: measured, opening: reference, deltaSeconds: 0}).history.speedDistanceMeters;
    const intent = {...measured, distanceMeters: measured.distanceMeters - effect};
    if (!equal(clampCameraIntent(intent, configuration), intent)) throw failure("CAMERA_INTENT_OUT_OF_RANGE");
    return intent;
  }
  private commitCandidate(
    candidate: ControllerState,
    frame: CameraControllerFrame,
    dt: number,
    cut: boolean,
    headingHistory?: CameraStrategyHistory,
  ): void {
    const result = this.pose(candidate, candidate.subject!, dt, headingHistory);
    let base = result.proposal;
    let transition = candidate.transition;
    if (transition.kind === "blend") {
      if (dt === 0)
        this.constraints.project(
          base,
          candidate.resolved!,
          candidate.subject!,
          frame.aspect,
          base,
          frame.simulationTick,
          "fixed",
        );
      const elapsed = Math.min(
        transition.durationSeconds,
        transition.elapsedSeconds + dt,
      );
      base = blendCameraProposals(
        transition.source,
        base,
        elapsed / transition.durationSeconds,
      );
      transition =
        elapsed >= transition.durationSeconds
          ? {
              kind: "none",
              configuredDurationSeconds: transition.configuredDurationSeconds,
              effectiveDurationSeconds: 0,
            }
          : { ...transition, elapsedSeconds: elapsed };
    }
    const desired = this.desiredPose(candidate, base);
    validateCameraProposal(desired, frame.aspect);
    const solved = this.constraints.solve(
      desired,
      candidate.resolved!,
      candidate.subject!,
      { ...frame, deltaSeconds: dt, cut, previous: candidate.current },
    );
    const revision = this.state.cameraCommitRevision + 1;
    const current: CameraFixedFrame = {
      ...solved.proposal,
      subject:clone(candidate.subject!),
      subjectAnchorWorldMetersXYZ:cameraDisplayAnchor(candidate.subject!,candidate.resolved!,result.history.headingRadians).toArray(),
      lifecycleGeneration: frame.lifecycleGeneration,
      simulationTick: frame.simulationTick,
      configurationRevision: candidate.configurationRevision,
      logicalTargetId: candidate.document!.binding.targetEntityId,
      resolvedSubjectId: candidate.subject!.id,
      subjectGeneration: candidate.subject!.generation,
      viewId: candidate.resolved!.viewId,
      cameraCommitRevision: revision,
    };
    const views = new Map(candidate.views);
    views.set(candidate.resolved!.viewId, {
      configuration: candidate.resolved!,
      subject: candidate.subject!,
      intent: candidate.intent!,
    });
    this.state = {
      ...candidate,
      views,
      history: result.history,
      pendingPose: candidate.mode === "follow-pending" ? desired : undefined,
      base,
      transition,
      diagnostics: solved.diagnostics,
      previous: cut || !candidate.current ? current : candidate.current,
      current,
      cameraCommitRevision: revision,
    };
  }
  install(
    value: unknown,
    frame: CameraControllerFrame,
    options: { readonly authoredPose?: CameraProposal } = {},
  ): void {
    this.installCandidate(value,frame,options);
  }
  /** Explicit capture operation: canonical initial opening and current reference commit together. */
  captureAuthoredPose(value:unknown,pose:CameraProposal,frame:CameraControllerFrame):void {
    this.installCandidate(value,frame,{},pose);
  }
  private referenceIdentity(document: CameraDocument, subject: CameraSubjectFacts, frame: CameraControllerFrame): NonNullable<ControllerState['initialReferenceIdentity']> {
      return { lifecycleGeneration: frame.lifecycleGeneration, subjectGeneration: subject.generation, targetEntityId: document.binding.targetEntityId, targetGeneration: this.bindings.entityGeneration?.(document.binding.targetEntityId) ?? subject.generation };
  }
  private validateInitialReference(document: CameraDocument, subject: CameraSubjectFacts, frame: CameraControllerFrame): CameraSubjectFacts {
      const initial = this.state.initialSubject, identity = this.state.initialReferenceIdentity;
      const generation = this.bindings.entityGeneration;
      if (!initial || !identity || identity.lifecycleGeneration !== frame.lifecycleGeneration || identity.targetEntityId !== document.binding.targetEntityId || identity.subjectGeneration !== (generation ? generation(initial.id) : subject.generation) || identity.targetGeneration !== (generation ? generation(identity.targetEntityId) : subject.generation))
          throw failure('CAMERA_CAPTURE_REFERENCE_UNAVAILABLE');
      return initial;
  }
  validateBaselineReference(frame: CameraControllerFrame): void {
      this.admit(frame);
      if (this.state.mode === 'authored')
          return;
      const document = this.state.document;
      if (!document)
          throw failure('CAMERA_FOLLOW_REQUIRED');
      const initial = this.validateInitialReference(document, this.sample(document, frame), frame);
      const opening = this.state.initialOpenings.get(document.defaultViewId), configuration = resolve(document, document.defaultViewId, initial, opening);
      initialIntent(configuration, initial, opening);
  }
  private captureReference(document: CameraDocument, viewId: string, pose: CameraProposal, frame: CameraControllerFrame, subject: CameraSubjectFacts): {
      document: CameraDocument;
      reference: CameraOpeningReference;
  } {
      const previous = this.state, initialSubject = this.validateInitialReference(document, subject, frame), fixed = previous.current;
      if (!initialSubject || !fixed?.subject || !sameCameraSubject(fixed.subject, subject) || fixed.lifecycleGeneration !== frame.lifecycleGeneration || initialSubject.id !== subject.id || initialSubject.kind !== subject.kind || previous.document?.binding.targetEntityId !== document.binding.targetEntityId)
          throw failure('CAMERA_CAPTURE_REFERENCE_UNAVAILABLE');
      validateCameraProposal(pose, frame.aspect);
      const runtimeDocument = adoptAuthoredOpening(document, viewId, subject, pose);
      const configuration = resolve(runtimeDocument, viewId, subject);
      if (configuration.kind !== 'third-person' || configuration.values.framing.kind !== 'preserve-opening')
          throw failure('CAMERA_CAPTURE_VIEW_UNSUPPORTED');
      const referenceFrame = configuration.values.orientation.referenceFrame;
      if (referenceFrame === 'world-up' ? (subjectHeading(subject) === undefined || subjectHeading(initialSubject) === undefined) : (!subject.semanticQuaternionWorldXYZW || !initialSubject.semanticQuaternionWorldXYZW))
          throw failure('CAMERA_CAPTURE_REFERENCE_UNAVAILABLE');
      const initialConfiguration = resolve(runtimeDocument, viewId, initialSubject);
      return { reference: createOpeningReference(subject, configuration), document: adoptAuthoredOpening(runtimeDocument, viewId, initialSubject, relocateCameraProposal(pose, subject, initialSubject, referenceFrame, true,
        cameraPositionAnchor(subject, configuration.values.position).toArray(),
        cameraPositionAnchor(initialSubject, initialConfiguration.values.position).toArray())) };
  }
  /** Pure explicit draft adoption; all subject references remain owned by this controller. */
  createOpeningDraft(value: CameraDocument, options: {
      readonly viewId: string;
      readonly opening?: CameraOpeningConfiguration;
  }, frame: CameraControllerFrame): CameraDocument {
      this.admit(frame);
      const current = this.state.current;
      if (!current)
          throw failure('CAMERA_CAPTURE_REFERENCE_UNAVAILABLE');
      const opening = options.opening ?? { positionWorldMetersXYZ: current.positionWorldMetersXYZ, lookAtWorldMetersXYZ: current.lookAtWorldMetersXYZ, upWorldXYZ: current.upWorldXYZ, fovDegrees: current.lens.verticalFovDegrees };
      // Supply the explicit opening before validating a draft that newly selects preserve-opening.
      const document = parseCameraDocument({ ...value, views: { ...value.views, [options.viewId]: { ...value.views[options.viewId], opening } } });
      if (document.views[options.viewId]?.kind !== 'third-person')
          throw failure('CAMERA_CAPTURE_VIEW_UNSUPPORTED');
      const position = new Vector3(...opening.positionWorldMetersXYZ), lookAt = new Vector3(...opening.lookAtWorldMetersXYZ), up = new Vector3(...(opening.upWorldXYZ ?? [0, 1, 0]));
      const pose: CameraProposal = { ...current, positionWorldMetersXYZ: position.toArray(), lookAtWorldMetersXYZ: lookAt.toArray(), upWorldXYZ: up.toArray(), quaternionWorldXYZW: new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(position, lookAt, up)).toArray(), lens: { ...current.lens, verticalFovDegrees: opening.fovDegrees } };
      return immutable(this.captureReference(document, options.viewId, pose, frame, this.sample(document, frame)).document);
  }
  /** Configuration-only undo preserves later valid player intent. */
  restoreConfiguration(value: CameraDocument, frame: CameraControllerFrame): void {
      this.installCandidate(value, frame, {}, undefined, true);
  }
  baselineIdentity(): CameraBaseline | undefined { return this.baseline; }
  /** Episode plans against the reset declaration, never an uncommitted draft. */
  episodeBaseline(): {mode:ControllerState['mode'];document:CameraDocument|undefined;documentHash:string|undefined} {
    const saved=this.baseline?this.baselines.get(this.baseline)?.state:undefined;
    if(!saved)throw failure('CAMERA_BASELINE_REQUIRED');
    return immutable({mode:saved.mode,document:saved.document,documentHash:saved.hash});
  }
  /** One cut candidate after physical start placement, using the retained initial reference. */
  prepareEpisodeView(viewId:string,frame:CameraControllerFrame):void {
    this.admit(frame);
    this.transaction(()=>{
      const old=this.state,document=old.document;
      if(!document)throw failure('CAMERA_FOLLOW_REQUIRED');
      const subject=this.sample(document,frame),initial=this.validateInitialReference(document,subject,frame);
      const originalOpening=old.initialOpenings.get(viewId);
      const resolved=resolve(document,viewId,subject,originalOpening);
      // Resolve against the actual start subject: a seat-only view need not exist on the initial person.
      const seed=initialIntent(resolved,initial,originalOpening);
      const intent=this.rebaseIntent(seed,initial,subject,resolved,resolved,true);
      const openings=new Map(old.initialOpenings);
      // Only preserve-opening references are present here. Their dormant views
      // do not require eye/seat admission, unlike unrelated inactive strategies.
      for(const [id,opening] of old.initialOpenings){
        const configuration=resolve(document,id,subject,opening);
        const rebased=this.rebaseIntent(initialIntent(configuration,initial,opening),initial,subject,configuration,configuration,true);
        openings.set(id,{...opening,yawRadians:rebased.yawRadians,pitchRadians:rebased.pitchRadians});
      }
      this.commitCandidate({...old,subject,resolved:resolve(document,viewId,subject,openings.get(viewId)),intent,openings,views:new Map(),mode:'follow',history:undefined,pendingPose:undefined,previous:undefined,current:undefined,operations:new Set(),transition:{kind:'none',configuredDurationSeconds:resolved.transition.durationSeconds,effectiveDurationSeconds:0,reason:'requested-cut'},adaptations:[]},frame,0,true);
    });
  }

  private installCandidate(value:unknown,frame:CameraControllerFrame,options:{readonly authoredPose?:CameraProposal},capture?:CameraProposal,preserveIntent=false):void {
    this.admit(frame);
    this.transaction(() => {
      let document = parseCameraDocument(value);
      const previous = this.state;
      const subject = this.sample(document, frame),
        initialSubject = previous.initialSubject ?? subject;
      const viewId = previous.resolved?.viewId ?? document.defaultViewId;
      if (
        previous.resolved &&
        document.views[viewId]?.kind !== previous.resolved.kind
      )
        throw failure("CAMERA_ACTIVE_VIEW_CHANGED");
      let capturedReference:CameraOpeningReference|undefined;
      if(capture){
        if(previous.mode!=='authored')throw failure('CAMERA_CAPTURE_REFERENCE_UNAVAILABLE');
        const captured=this.captureReference(document,viewId,capture,frame,subject);
        capturedReference=captured.reference;document=captured.document;
      }
      const suppliedView = document.views[viewId];
      if (options.authoredPose) {
        if (
          previous.document ||
          (suppliedView?.kind === "third-person" && suppliedView.opening)
        )
          throw failure("CAMERA_AUTHORED_ADOPTION_NOT_ALLOWED");
        validateCameraProposal(options.authoredPose, frame.aspect);
        document = adoptAuthoredOpening(
          document,
          viewId,
          initialSubject,
          options.authoredPose,
        );
      }
      const openings = openingReferences(document, initialSubject, previous);
      if(capturedReference)openings.set(viewId,capturedReference);
      let resolved = resolve(document, viewId, subject, openings.get(viewId));
      if (
        options.authoredPose &&
        resolved.activation !== "on-input" && !(resolved.kind === "third-person" && resolved.values.framing.kind === "preserve-opening")
      )
        throw failure("CAMERA_AUTHORED_ADOPTION_NOT_ALLOWED");
      const authoredPose = options.authoredPose
        ? clone(options.authoredPose)
        : previous.authoredPose;
      const hash = hashCameraDocument(document);
      const changedSubject =
        previous.subject && !sameCameraSubject(previous.subject, subject);
      const openingChanged = !!capturedReference || !equal(
        previous.document?.views[viewId]?.kind === "third-person"
          ? previous.document.views[viewId].opening
          : undefined,
        document.views[viewId]?.kind === "third-person"
          ? document.views[viewId].opening
          : undefined,
      );
      const reanchor = !openingChanged && !changedSubject && previous.resolved?.kind === "third-person" &&
        previous.resolved.values.framing.kind === "preserve-opening" && resolved.kind === "third-person" &&
        resolved.values.framing.kind === "preserve-opening" && !sameOpeningBasis(previous.resolved, resolved);
      let reanchoredReference: CameraOpeningReference | undefined;
      if (reanchor && resolved.kind === "third-person") {
        // A configuration edit changes the orbit basis, never its current nominal
        // world pose. Re-measure the unconstrained intent, including later input
        // during a config-only undo; a shortened collision eye is not authored data.
        const pose = previous.pendingPose ?? previous.base;
        if (pose) {
          reanchoredReference = createOpeningReference(subject, {...resolved, opening: {
            positionWorldMetersXYZ: pose.positionWorldMetersXYZ,
            lookAtWorldMetersXYZ: pose.lookAtWorldMetersXYZ,
            upWorldXYZ: pose.upWorldXYZ,
            fovDegrees: pose.lens.verticalFovDegrees,
          }});
          openings.set(viewId, reanchoredReference);
          resolved = resolve(document, viewId, subject, reanchoredReference);
        }
      }
      let intent =
        previous.intent ??
        initialIntent(resolved, subject, openings.get(viewId));
      if (reanchoredReference) intent = this.intentAtOpening(reanchoredReference, resolved, subject, intent);
      if (previous.resolved && previous.subject) {
        if (!reanchoredReference && (
          changedSubject ||
          !equal(previous.document?.binding, document.binding)
        ))
          intent = this.rebaseIntent(
            intent,
            previous.subject,
            subject,
            previous.resolved,
            resolved,
            false,
            preserveIntent?"reject":"clamp",
          );
        else {
          if (!reanchoredReference &&
            previous.resolved.values.orientation.referenceFrame !==
            resolved.values.orientation.referenceFrame
          )
            intent = this.rebaseIntent(
              intent,
              previous.subject,
              subject,
              previous.resolved,
              resolved,
              false,
              preserveIntent?"reject":"clamp",
            );
          if(preserveIntent){
            if(!equal(clampCameraIntent(intent,resolved),intent))throw failure("CAMERA_INTENT_OUT_OF_RANGE");
          }else intent = validateHotIntent(previous.resolved, resolved, intent);
        }
      }
      if (openingChanged && !preserveIntent)
        intent = initialIntent(resolved, subject, openings.get(viewId));
      const reset =
        !previous.resolved ||
        openingChanged ||
        !!changedSubject ||
        needsHistoryReset(previous.resolved, resolved);
      const views = new Map(previous.views);
      for (const [id, cached] of views) {
        if (id !== viewId && openings.has(id) && previous.document &&
            previous.document.views[id]?.kind === document.views[id]?.kind &&
            !sameDeclaredOpeningAnchor(previous.document, document, id, cached.subject)) {
          // An explicit inactive-anchor edit resets this view to the new document's
          // baseline. Its old orbit history belongs to another basis; unrelated
          // fields such as FOV still retain the dormant intent/cache.
          const configuration = resolve(document, id, initialSubject);
          if (configuration.kind === "third-person")
            openings.set(id, createOpeningReference(initialSubject, configuration));
          views.delete(id);
          continue;
        }
        if (
          document.views[id]?.kind !== cached.configuration.kind ||
          !equal(previous.openings.get(id), openings.get(id)) ||
          (openings.has(id) && previous.document && !sameOpeningBasis(
            resolve(previous.document, id, initialSubject, previous.initialOpenings.get(id)),
            resolve(document, id, initialSubject, openings.get(id))))
        )
          views.delete(id);
      }
      // Opening references are always captured against the initial subject. Dormant
      // anchor admission is deferred until selection, except actual opening geometry.
      for (const [id, opening] of openings) {
        if (!views.has(id)) {
          const config = resolve(document, id, initialSubject, opening);
          views.set(id, {
            configuration: config,
            subject: initialSubject,
            intent: initialIntent(config, initialSubject, opening),
          });
        }
      }
      const candidate: ControllerState = {
        ...previous,
        document,
        hash,
        initialSubject,
        initialReferenceIdentity:previous.initialSubject?previous.initialReferenceIdentity:this.referenceIdentity(document,subject,frame),
        authoredPose,
        pendingPose: openingChanged || reanchoredReference ? undefined : previous.pendingPose,
        subject,
        resolved,
        initialOpenings: openingReferences(document, initialSubject, {
          ...previous,
          openings: previous.initialOpenings,
        }),
        openings,
        views,
        intent,
        // Configuration edits preserve orbit history, but an old FOV effect
        // must fit the newly admitted envelope before the zero-time commit.
        history: reset || !previous.history ? undefined : {
          ...previous.history,
          speedFovDegrees: Math.min(previous.history.speedFovDegrees,
            resolved.values.effects.speedFov.enabled ? resolved.values.effects.speedFov.maximumOffsetDegrees : 0),
        },
        mode: previous.resolved
          ? previous.mode
          : resolved.activation === "immediate"
            ? "follow"
            : "follow-pending",
        configurationRevision:
          previous.configurationRevision + (hash !== previous.hash ? 1 : 0),
        transition: reset
          ? {
              kind: "none",
              configuredDurationSeconds: resolved.transition.durationSeconds,
              effectiveDurationSeconds: 0,
              ...(openingChanged ? { reason: "opening-change" as const } : {}),
            }
          : previous.transition,
      };
      this.commitCandidate(candidate, frame, 0, reset, changedSubject ? undefined : previous.history);
    });
  }
  /** Activating a pending view rebases its held desired opening once.
   * Other views are admitted independently of this view's pending limits. */
  private activatePendingFollow(old: ControllerState, subject: CameraSubjectFacts): ControllerState {
    if (old.mode !== "follow-pending") return old;
    let resolved = old.resolved!, openings = old.openings, history = old.history;
    let intent = old.intent!;
    if (old.pendingPose && resolved.kind === "third-person" && resolved.values.framing.kind === "preserve-opening") {
      const pose = old.pendingPose;
      const reference = createOpeningReference(subject, {
        ...resolved,
        opening: {
          positionWorldMetersXYZ: pose.positionWorldMetersXYZ,
          lookAtWorldMetersXYZ: pose.lookAtWorldMetersXYZ,
          upWorldXYZ: pose.upWorldXYZ,
          fovDegrees: pose.lens.verticalFovDegrees,
        },
      });
      resolved = resolve(old.document!, resolved.viewId, subject, reference);
      intent = this.intentAtOpening(reference, resolved, subject, intent);
      openings = new Map(openings).set(resolved.viewId, reference);
      history = undefined;
    }
    const views = new Map(old.views).set(resolved.viewId, {configuration: resolved, subject, intent});
    return {...old, resolved, openings, history, intent, views, mode: "follow"};
  }
  setView(
    viewId: string,
    frame: CameraControllerFrame,
    options: { readonly cut?: boolean } = {},
  ): void {
    this.admit(frame);
    if (this.state.resolved?.viewId === viewId && this.state.mode === "follow")
      return;
    this.transaction(() => {
      const old = this.state;
      if (!old.document || !old.resolved || !old.subject)
        throw failure("CAMERA_FOLLOW_REQUIRED");
      const subject = this.sample(old.document, frame);
      if (!sameCameraSubject(subject, old.subject))
        throw failure("CAMERA_LIFECYCLE_EVENT_REQUIRED");
      const activated = old.resolved.viewId === viewId ? this.activatePendingFollow(old, subject) : old;
      const resolved = resolve(
        old.document,
        viewId,
        subject,
        activated.openings.get(viewId),
      );
      const cached = activated.views.get(viewId);
      let intent = initialIntent(resolved, subject, activated.openings.get(viewId));
      if(subject.continuousHeadingSeedRadians !== undefined && resolved.values.orientation.referenceFrame === 'world-up' && !activated.openings.has(viewId))
        intent = clampCameraIntent({...intent, yawRadians: cameraSubjectHeading(subject, old.history) ?? intent.yawRadians}, resolved);
      if (cached && cached.configuration.kind === resolved.kind) {
        const changedReference =
          cached.configuration.values.orientation.referenceFrame !==
          resolved.values.orientation.referenceFrame;
        const handedOff =
          cached.configuration.subjectId !== resolved.subjectId ||
          cached.configuration.subjectGeneration !== resolved.subjectGeneration;
        intent =
          !sameCameraSubject(cached.subject, subject) || changedReference
            ? this.rebaseIntent(
                cached.intent,
                cached.subject,
                subject,
                cached.configuration,
                resolved,
                false,
              )
            : cached.intent;
        intent = handedOff
          ? clampCameraIntent(intent, resolved)
          : validateHotIntent(cached.configuration, resolved, intent);
      }
      const firstPerson =
        old.resolved.kind === "first-person" ||
        resolved.kind === "first-person";
      const incompatible =
        old.resolved.values.orientation.referenceFrame !==
        resolved.values.orientation.referenceFrame;
      const duration =
        firstPerson || options.cut || incompatible
          ? 0
          : resolved.transition.durationSeconds;
      const transition: CameraTransition =
        duration > 0 && old.current
          ? {
              kind: "blend",
              source: old.current,
              sourceSubject: old.subject,
              targetViewId: viewId,
              elapsedSeconds: 0,
              durationSeconds: duration,
              configuredDurationSeconds: resolved.transition.durationSeconds,
              effectiveDurationSeconds: duration,
            }
          : {
              kind: "none",
              configuredDurationSeconds: resolved.transition.durationSeconds,
              effectiveDurationSeconds: 0,
              ...(firstPerson
                ? { reason: "first-person-cut" as const }
                : options.cut
                  ? { reason: "requested-cut" as const }
                  : {}),
            };
      this.commitCandidate(
        {
          ...activated,
          resolved,
          subject,
          intent,
          history: undefined,
          mode: "follow",
          adaptations:
            cached && !equal(cached.intent, intent)
              ? [
                  ...old.adaptations,
                  {
                    viewId,
                    old: cached.intent,
                    next: intent,
                    reason: "view-reactivation-adaptation",
                  },
                ]
              : old.adaptations,
          transition,
        },
        frame,
        0,
        duration === 0,
        old.history,
      );
    });
  }
  prepareInput(
    input: CameraControllerInput,
    deltaSeconds: number,
    frame: CameraControllerFrame,
  ): CameraControlBasis {
    this.admit(frame);
    const old = this.state;
    if (!old.resolved || !old.document || !old.intent || !old.subject)
      throw failure("CAMERA_FOLLOW_REQUIRED");
    return this.transaction(() => {
      const subject = this.sample(old.document!, frame);
      if (!sameCameraSubject(subject, old.subject!))
        throw failure("CAMERA_LIFECYCLE_EVENT_REQUIRED");
      const delta = input.orbitDeltaRadiansXY ?? [0, 0],
        ratio = input.orbitRatioXY ?? [0, 0];
      if (
        ![...delta, ...ratio, input.zoomDeltaMeters ?? 0, deltaSeconds].every(
          Number.isFinite,
        ) ||
        deltaSeconds < 0 ||
        ratio.some((value) => Math.abs(value) > 1)
      )
        throw failure("CAMERA_INPUT_INVALID");
      const yaw =
        delta[0] +
        ratio[0] * old.resolved!.input.orbitRateRadiansPerSecond * deltaSeconds;
      const pitch =
        delta[1] +
        ratio[1] * old.resolved!.input.orbitRateRadiansPerSecond * deltaSeconds;
      const active = !!input.movement || yaw !== 0 || pitch !== 0 || (input.zoomDeltaMeters ?? 0) !== 0;
      const activated = active ? this.activatePendingFollow(old, subject) : old;
      const resolved = activated.resolved!, openings = activated.openings, history = activated.history;
      const seed = activated.intent!;
      const intent = prepareCameraIntent({
        subject,
        configuration: resolved,
        intent: {
          ...seed,
          yawRadians: seed.yawRadians + yaw,
          pitchRadians: seed.pitchRadians + pitch,
          distanceMeters: seed.distanceMeters + (input.zoomDeltaMeters ?? 0),
          secondsSinceOrbit: yaw !== 0 || pitch !== 0 ? 0 : seed.secondsSinceOrbit,
        },
        history,
        headingHistory: old.history,
        opening: openings.get(resolved.viewId),
        deltaSeconds,
      });
      const state: ControllerState = {
        ...activated,
        subject,
        resolved,
        openings,
        history,
        intent,
        mode: active ? "follow" : old.mode,
      };
      // Predict the same base pose from prepared intent, including current blend time.
      let base = this.pose(state, subject, deltaSeconds, old.history).proposal;
      if (old.transition.kind === "blend")
        base = blendCameraProposals(
          old.transition.source,
          base,
          Math.min(
            1,
            (old.transition.elapsedSeconds + deltaSeconds) /
              old.transition.durationSeconds,
          ),
        );
      const predicted = this.constraints.predict(this.desiredPose(state, base), resolved, subject,
        {...frame, deltaSeconds, cut: false, previous: old.current});
      const basis: CameraControlBasis = {
        quaternionWorldXYZW: predicted.quaternionWorldXYZW,
        viewId: old.resolved!.viewId,
        resolvedSubjectId: subject.id,
        subjectGeneration: subject.generation,
      };
      this.pending = { state, frame: clone(frame), deltaSeconds, basis };
      return immutable(clone(basis));
    });
  }
  /** World failure boundary only: discard uncommitted input, never committed state. */
  abortPreparedInput(): void {
    if (this.busy) throw failure("CAMERA_TRANSACTION_REENTRY");
    this.pending = undefined;
  }
  evaluateAndCommit(
    frame: CameraControllerFrame,
    event?: CameraLifecycleEvent,
  ): CameraFixedFrame {
    if (this.disposed) throw failure("WORLD_DISPOSED");
    const pending = this.pending;
    if (!pending || !equal(pending.frame, frame))
      throw failure("CAMERA_INPUT_CANDIDATE_REQUIRED");
    this.pending = undefined;
    try {
      return this.transaction(() => {
        const lifecycle = event
          ? this.lifecycleCandidate(pending.state, event, frame)
          : undefined;
        let candidate = lifecycle?.state ?? pending.state;
        const subject = this.sample(candidate.document!, frame);
        if (lifecycle?.kind === "applied") this.constraints.reset();
        if (!sameCameraSubject(subject, candidate.subject!))
          throw failure("CAMERA_LIFECYCLE_EVENT_REQUIRED");
        const capabilities = (value: CameraSubjectFacts) => ({
          kind: value.kind,
          body: value.body,
          eye: !!value.eyeWorldMetersXYZ,
          seat: !!value.seatWorldMetersXYZ,
          heading: !!value.semanticQuaternionWorldXYZW,
        });
        if (!equal(capabilities(candidate.subject!), capabilities(subject))) {
          const resolved = resolve(
            candidate.document!,
            candidate.resolved!.viewId,
            subject,
            candidate.openings.get(candidate.resolved!.viewId),
          );
          candidate = {
            ...candidate,
            resolved,
            history: undefined,
            intent: clampCameraIntent(candidate.intent!, resolved),
          };
        }
        candidate = { ...candidate, subject };
        this.commitCandidate(
          candidate,
          frame,
          pending.deltaSeconds,
          lifecycle?.kind === "applied" && lifecycle.continuity === "cut",
          lifecycle?.kind === "applied" ? undefined : this.state.history,
        );
        return clone(this.state.current!);
      });
    } catch (error) {
      this.failureState = {
        ...runtimeError(error, "camera"),
        controlBasis: pending.basis,
      };
      throw this.failureState;
    }
  }
  private lifecycleCandidate(
    old: ControllerState,
    event: CameraLifecycleEvent,
    frame: CameraControllerFrame,
  ):
    | { readonly kind: "duplicate"; readonly state: ControllerState }
    | {
        readonly kind: "applied";
        readonly state: ControllerState;
        readonly continuity: "cut" | "continuous";
      } {
    const key = `${frame.lifecycleGeneration}:${event.subject.id}:${event.subject.generation}:${event.operationId}`;
    if (old.operations.has(key)) return { kind: "duplicate", state: old };
    if (
      !old.document ||
      !old.resolved ||
      !old.subject ||
      !sameCameraSubject(old.subject, event.previousSubject)
    )
      throw failure("CAMERA_LIFECYCLE_IDENTITY_MISMATCH");
    const actual = this.sample(old.document, frame);
    if (!sameCameraSubject(actual, event.subject))
      throw failure("CAMERA_LIFECYCLE_IDENTITY_MISMATCH");
    const openings = new Map(old.openings),
      views = new Map(old.views),
      adaptations: {
        viewId: string;
        old: CameraIntent;
        next: CameraIntent;
        reason: string;
      }[] = [];
    const relocate = event.kind === "relocate";
    for (const [id, cached] of views) {
      // Dormant views retain intent/reference only. Capability admission belongs to
      // activation; a vehicle without eye must not invalidate an inactive eye view.
      const resolved =
        id === old.resolved.viewId
          ? resolve(old.document, id, event.subject, openings.get(id))
          : cached.configuration;
      const beforeRelocation =
        relocate && !sameCameraSubject(cached.subject, event.previousSubject)
          ? this.rebaseIntent(
              cached.intent,
              cached.subject,
              event.previousSubject,
              cached.configuration,
              cached.configuration,
              false,
            )
          : cached.intent;
      const intent = this.rebaseIntent(
        beforeRelocation,
        relocate ? event.previousSubject : cached.subject,
        event.subject,
        cached.configuration,
        resolved,
        relocate,
      );
      views.set(id, {
        configuration: resolved,
        subject: event.subject,
        intent,
      });
      adaptations.push({
        viewId: id,
        old: cached.intent,
        next: intent,
        reason:
          !cached.subject.semanticQuaternionWorldXYZW ||
          !event.subject.semanticQuaternionWorldXYZW
            ? "initial-reference-unavailable"
            : relocate
              ? "relocation-reference"
              : "subject-handoff",
      });
      const opening = openings.get(id);
      if (opening && relocate) {
        const rebased = this.rebaseIntent(
          {
            ...cached.intent,
            yawRadians: opening.yawRadians,
            pitchRadians: opening.pitchRadians,
            distanceMeters: opening.distanceMeters,
          },
          event.previousSubject,
          event.subject,
          cached.configuration,
          resolved,
          true,
        );
        openings.set(id, {
          ...opening,
          yawRadians: rebased.yawRadians,
          pitchRadians: rebased.pitchRadians,
        });
      }
    }
    const resolved = resolve(
      old.document,
      old.resolved.viewId,
      event.subject,
      openings.get(old.resolved.viewId),
    );
    const intent = this.rebaseIntent(
      old.intent!,
      relocate ? event.previousSubject : old.subject,
      event.subject,
      old.resolved,
      resolved,
      relocate,
    );
    const incompatible =
      old.resolved.values.orientation.referenceFrame !==
      resolved.values.orientation.referenceFrame;
    let transition: CameraTransition = {
      kind: "none",
      configuredDurationSeconds: resolved.transition.durationSeconds,
      effectiveDurationSeconds: 0,
      reason: "lifecycle-cut",
    };
    if (
      !relocate &&
      !incompatible &&
      old.transition.kind === "blend" &&
      old.current
    ) {
      const remaining =
        old.transition.durationSeconds - old.transition.elapsedSeconds;
      transition = {
        ...old.transition,
        source: old.current,
        sourceSubject: event.subject,
        elapsedSeconds: 0,
        durationSeconds: remaining,
        effectiveDurationSeconds: remaining,
      };
    }
    return {
      kind: "applied",
      continuity: relocate || transition.kind === "none" ? "cut" : "continuous",
      state: {
        ...old,
        subject: event.subject,
        pendingPose:
          old.mode === "follow-pending" && old.pendingPose
            ? relocateCameraProposal(
                old.pendingPose,
                event.previousSubject,
                event.subject,
                resolved.values.orientation.referenceFrame,
                relocate,
                cameraPositionAnchor(event.previousSubject, resolve(old.document, old.resolved.viewId, event.previousSubject, old.openings.get(old.resolved.viewId)).values.position).toArray(),
                cameraPositionAnchor(event.subject, resolved.values.position).toArray(),
              )
            : old.pendingPose,
        resolved,
        intent,
        views,
        openings,
        history: undefined,
        transition,
        adaptations,
        operations: new Set([...old.operations, key]),
      },
    };
  }
  applyLifecycle(
    event: CameraLifecycleEvent,
    frame: CameraControllerFrame,
  ): void {
    this.admit(frame);
    try {
      this.transaction(() => {
        const lifecycle = this.lifecycleCandidate(this.state, event, frame);
        if (lifecycle.kind === "duplicate") return;
        this.constraints.reset();
        this.commitCandidate(
          lifecycle.state,
          frame,
          0,
          lifecycle.continuity === "cut",
        );
      });
    } catch (error) {
      this.failureState = runtimeError(error, "camera");
      throw this.failureState;
    }
  }
  commitAuthoredPose(pose:CameraProposal,frame:CameraControllerFrame):void {
    this.admit(frame);
    if(this.state.mode!=='authored')throw failure('CAMERA_AUTHORED_REQUIRED');
    this.transaction(()=>{this.state=this.authoredState(pose,frame,this.state);});
  }
  useAuthored(): CameraProposal | undefined {
    this.admit();
    const pose = this.state.current;
    this.constraints.reset();
    const current = pose
      ? { ...pose, cameraCommitRevision: this.state.cameraCommitRevision + 1 }
      : undefined;
    this.state = {
      ...this.state,
      current,
      previous: current,
      diagnostics: undefined,
      mode: "authored",
      subject: undefined,
      resolved: undefined,
      intent: undefined,
      history: undefined,
      views: new Map(),
      openings: new Map(),
      transition: none(),
      cameraCommitRevision: this.state.cameraCommitRevision + 1,
    };
    return pose ? clone(pose) : undefined;
  }
  targetRemoved(
    identity: { readonly id: string; readonly generation: number },
    frame: CameraControllerFrame,
  ): void {
    if (this.disposed) throw failure("WORLD_DISPOSED");
    if (
      this.state.subject?.id !== identity.id ||
      this.state.subject.generation !== identity.generation
    )
      return;
    if (this.pending) {
      if (!equal(this.pending.frame, frame))
        throw failure("CAMERA_FRAME_INVALID");
      this.pending = undefined;
    }
    this.admit(frame, true);
    this.failureState = undefined;
    this.checkpoints = new WeakMap();
    this.useAuthored();
    if (this.state.current) {
      const current = {
        ...this.state.current,
        lifecycleGeneration: frame.lifecycleGeneration,
        simulationTick: frame.simulationTick,
      };
      this.state = { ...this.state, current, previous: current };
    }
  }
  setCollisionDiagnosticsEnabled(enabled:boolean):void {
    this.admit();
    this.constraints.setDiagnosticsEnabled(enabled);
  }
  private inspectionCache:{diagnosticsRevision:number;state:ControllerState;failure:CameraInspection["failure"];value:CameraInspection}|undefined;
  inspect(): CameraInspection {
    const s = this.state;
    if(this.inspectionCache?.diagnosticsRevision===this.constraints.diagnosticsRevision&&this.inspectionCache?.state===s&&this.inspectionCache.failure===this.failureState)return this.inspectionCache.value;
    const value=immutable(
      clone({
        collisionQueries: this.constraints.inspectQueries(),
        mode: s.mode,
        document: s.document,
        documentHash: s.hash,
        configurationRevision: s.configurationRevision,
        cameraCommitRevision: s.cameraCommitRevision,
        resolved: s.resolved,
        intent: s.intent,
        desired: s.mode === "authored" ? undefined : (s.pendingPose ?? s.base),
        previous: s.previous,
        current: s.current,
        transition: s.transition,
        diagnostics: s.diagnostics,
        adaptations: s.adaptations,
        ...(this.failureState ? { failure: this.failureState } : {}),
      }),
    );
    this.inspectionCache={diagnosticsRevision:this.constraints.diagnosticsRevision,state:s,failure:this.failureState,value};
    return value;
  }
  sampleProjection(
    context: PresentationSampleContext,
    aspect: number,
    displaySubject?: CameraSubjectFacts,
  ): CameraProjectedProposal | undefined {
    this.admit();
    const s = this.state;
    if (!s.current || !s.previous)
      return s.authoredPose ? clone(s.authoredPose) : undefined;
    if (!s.resolved || !s.subject) return clone(s.current);
    const subject = displaySubject ?? s.subject;
    if (!sameCameraSubject(subject, s.subject))
      throw failure("CAMERA_PRESENTATION_IDENTITY_MISMATCH");
    let proposal = sampleCameraPresentation(s.previous, s.current, context);
    if(displaySubject&&s.previous.subjectAnchorWorldMetersXYZ&&s.current.subjectAnchorWorldMetersXYZ){
      const alpha=context.cut||!cameraFramesCompatible(s.previous,s.current)?1:context.alpha;
      const fixedAnchor=new Vector3(...s.previous.subjectAnchorWorldMetersXYZ).lerp(new Vector3(...s.current.subjectAnchorWorldMetersXYZ),alpha);
      // Re-express the committed continuous heading at this display pose. This
      // pure delta evaluation neither advances nor replaces strategy history.
      const displayHeading=cameraSubjectHeading(displaySubject,s.history) ?? s.history?.headingRadians;
      const correction=cameraDisplayAnchor(displaySubject,s.resolved,displayHeading).sub(fixedAnchor);
      const shift=(point:readonly [number,number,number])=>new Vector3(...point).add(correction).toArray();
      proposal={...proposal,positionWorldMetersXYZ:shift(proposal.positionWorldMetersXYZ),pivotWorldMetersXYZ:shift(proposal.pivotWorldMetersXYZ),lookAtWorldMetersXYZ:shift(proposal.lookAtWorldMetersXYZ),...(proposal.visibilityTargetWorldMetersXYZ?{visibilityTargetWorldMetersXYZ:shift(proposal.visibilityTargetWorldMetersXYZ)}:{})};
    }
    this.busy = true;
    try {
      return this.constraints.project(
        proposal,
        s.resolved,
        subject,
        aspect,
        s.current,
        context.currentTick,
      );
    } finally {
      this.busy = false;
    }
  }
  hasCheckpoint(checkpoint:CameraCheckpoint):boolean {return this.checkpoints.has(checkpoint);}
  captureCheckpoint(): CameraCheckpoint {
    this.admit();
    const checkpoint = immutable({ inspection: this.inspect() });
    this.checkpoints.set(checkpoint, {
      state: clone(this.state),
      solver: this.constraints.capture(),
    });
    return checkpoint;
  }
  restoreCheckpoint(
    checkpoint: CameraCheckpoint,
    expectedCameraCommitRevision: number,
  ): void {
    this.admit();
    const saved = this.checkpoints.get(checkpoint);
    if (
      !saved ||
      this.state.cameraCommitRevision !== expectedCameraCommitRevision ||
      saved.state.current?.lifecycleGeneration !==
        this.state.current?.lifecycleGeneration ||
      (saved.state.subject &&
        (!this.state.subject || !sameCameraSubject(saved.state.subject, this.state.subject)))
    )
      throw failure("CAMERA_CHECKPOINT_CONFLICT");
    const restored = clone(saved.state);
    const configurationRevision =
      this.state.configurationRevision +
      (this.state.hash === restored.hash ? 0 : 1);
    const cameraCommitRevision = this.state.cameraCommitRevision + 1;
    const stamp = (value: CameraFixedFrame | undefined) =>
      value
        ? { ...value, configurationRevision, cameraCommitRevision }
        : undefined;
    this.state = {
      ...restored,
      configurationRevision,
      cameraCommitRevision,
      previous: stamp(restored.previous),
      current: stamp(restored.current),
    };
    this.constraints.restore(saved.solver);
  }
  private authoredState(
    pose: CameraProposal,
    frame: CameraControllerFrame,
    source: ControllerState,
  ): ControllerState {
    validateCameraProposal(pose, frame.aspect);
    const revision = this.state.cameraCommitRevision + 1;
    const current: CameraFixedFrame = {
      ...clone(pose),
      lifecycleGeneration: frame.lifecycleGeneration,
      simulationTick: frame.simulationTick,
      configurationRevision: source.configurationRevision,
      cameraCommitRevision: revision,
      logicalTargetId: "",
      resolvedSubjectId: "",
      subjectGeneration: 0,
      viewId: "",
    };
    return {
      ...source,
      mode: "authored",
      authoredPose: clone(pose),
      subject: undefined,
      resolved: undefined,
      intent: undefined,
      history: undefined,
      pendingPose: undefined,
      previous: current,
      current,
      cameraCommitRevision: revision,
      views: new Map(),
      openings: new Map(),
      transition: none(),
      diagnostics: undefined,
      operations: new Set(),
      adaptations: [],
    };
  }
  commitBaseline(options?: {
    readonly authoredPose: CameraProposal;
    readonly frame: CameraControllerFrame;
  }): CameraBaseline {
    this.admit(options?.frame);
    let s = this.state;
    let baseline: CameraBaseline;
    if (s.mode === "authored") {
      if (!options) throw failure("CAMERA_AUTHORED_POSE_REQUIRED");
      s = this.authoredState(options.authoredPose, options.frame, s);
      baseline = immutable({
        mode: "authored",
        authoredPose: clone(options.authoredPose),
      });
    } else {
      if (options) throw failure("CAMERA_AUTHORED_ADOPTION_NOT_ALLOWED");
      if (!s.document || !s.initialSubject)
        throw failure("CAMERA_FOLLOW_REQUIRED");
      baseline = immutable({
        mode: "follow",
        document: clone(s.document),
        initialSubject: clone(s.initialSubject),
      });
    }
    this.baselines.set(baseline, {
      state: clone(s),
      solver: this.constraints.capture(),
    });
    this.state = s;
    this.baseline = baseline;
    return baseline;
  }
  reset(
    frame: CameraControllerFrame,
    baseline: CameraBaseline | undefined = this.baseline,
  ): void {
    this.admit(frame, true);
    const saved = baseline ? this.baselines.get(baseline) : undefined;
    if (!saved) throw failure("CAMERA_BASELINE_REQUIRED");
    if (baseline?.mode === "authored") {
      const initial=saved.state.initialSubject,document=saved.state.document,identity=saved.state.initialReferenceIdentity;
      const generation=initial?this.bindings.entityGeneration?.(initial.id):undefined;
      const targetGeneration=identity?this.bindings.entityGeneration?.(identity.targetEntityId):undefined;
      // Reset renews an existing association; a retargeted document cannot give
      // its logical target authority over another subject's retained initial pose.
      const reference=initial&&document&&identity&&identity.targetEntityId===document.binding.targetEntityId&&identity.lifecycleGeneration===saved.state.current?.lifecycleGeneration&&generation!==undefined&&targetGeneration!==undefined
        ?{...identity,lifecycleGeneration:frame.lifecycleGeneration,subjectGeneration:generation,targetGeneration}
        :undefined;
      this.state = this.authoredState(baseline.authoredPose, frame, {
        ...saved.state,
        initialReferenceIdentity:reference,
        configurationRevision:
          this.state.configurationRevision +
          (saved.state.hash === this.state.hash ? 0 : 1),
      });
      this.constraints.reset();
      this.failureState = undefined;
      this.checkpoints = new WeakMap();
      return;
    }
    if (!saved.state.document) throw failure("CAMERA_BASELINE_REQUIRED");
    this.transaction(() => {
      const subject = this.sample(saved.state.document!, frame),
        old = this.state;
      const s = saved.state,
        resolved = resolve(
          s.document!,
          s.document!.defaultViewId,
          subject,
          s.initialOpenings.get(s.document!.defaultViewId),
        );
      const intent = initialIntent(
        resolved,
        subject,
        s.initialOpenings.get(resolved.viewId),
      );
      const views = new Map<string, ViewState>();
      for (const [id, opening] of s.initialOpenings) {
        const configuration = resolve(s.document!, id, subject, opening);
        views.set(id, {
          configuration,
          subject,
          intent: initialIntent(configuration, subject, opening),
        });
      }
      this.commitCandidate(
        {
          ...s,
          initialReferenceIdentity:this.referenceIdentity(s.document!,subject,frame),
          openings: s.initialOpenings,
          views,
          subject,
          resolved,
          intent,
          history: undefined,
          previous: undefined,
          current: undefined,
          pendingPose: undefined,
          mode:
            resolved.activation === "immediate" ? "follow" : "follow-pending",
          configurationRevision:
            old.configurationRevision + (s.hash === old.hash ? 0 : 1),
          transition: none(),
          operations: new Set(),
          adaptations: [],
        },
        frame,
        0,
        true,
      );
      this.failureState = undefined;
      this.checkpoints = new WeakMap();
    });
  }
  dispose(): void {
    if (this.busy) throw failure("CAMERA_TRANSACTION_REENTRY");
    this.pending = undefined;
    this.constraints.reset();
    this.state = {
      ...this.state,
      subject: undefined,
      resolved: undefined,
      views: new Map(),
      openings: new Map(),
    };
    this.disposed = true;
  }
}
