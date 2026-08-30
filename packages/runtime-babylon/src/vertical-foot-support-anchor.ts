import type { JumpEpisodeStateV1 } from "@whitebox-world/character-movement";
import type { SemanticPresentationKeyV1 } from "@whitebox-world/subject-actions";

export interface VerticalFootSupportProjectionV1 {
  readonly committedTick: number;
  readonly presentationKey: SemanticPresentationKeyV1;
  readonly jumpEpisode?: JumpEpisodeStateV1;
}

export interface VerticalFootSupportAnchorOptionsV1 {
  /** Reads only the presentation adjustment node below the committed visual root. */
  readonly readAdjustmentOffsetY: () => number;
  /** Writes only the presentation adjustment node below the committed visual root. */
  readonly writeAdjustmentOffsetY: (value: number) => void;
  /** Samples the current posed feet in committed visual-root local space. */
  readonly sampleMinimumFootHeightFromVisualRoot: () => number;
}

type VerticalFootSupportModeV1 =
  | "disabled"
  | "anchor"
  | "hold"
  | "reacquire"
  | "release";

const MAX_CONTINUOUS_CORRECTION_METERS_PER_TICK = 0.03;

function invalid(detail: string): never {
  throw new Error(`VERTICAL_FOOT_SUPPORT_PROJECTION_INVALID: ${detail}`);
}

function modeForProjection(
  projection: VerticalFootSupportProjectionV1,
  previousMode: VerticalFootSupportModeV1,
  authoredOffsetY: number,
  currentOffsetY: number,
): VerticalFootSupportModeV1 {
  const episode = projection.jumpEpisode;
  if (episode?.phase === "anticipating") return "anchor";
  if (episode?.phase === "airborne") return "hold";
  if (previousMode === "anchor" || previousMode === "hold") return "reacquire";
  if (currentOffsetY !== authoredOffsetY) return "release";
  return "disabled";
}

function limitedDelta(delta: number, maximum: number): number {
  return Math.max(-maximum, Math.min(maximum, delta));
}

/**
 * Presentation-only foot stabilization. The callbacks intentionally expose no
 * Body, Subject-origin, Camera, input, or movement handle, so the anchor cannot
 * become another gameplay authority.
 */
export class VerticalFootSupportAnchorV1 {
  readonly #authoredOffsetY: number;
  #projection: VerticalFootSupportProjectionV1 | undefined;
  #mode: VerticalFootSupportModeV1 = "disabled";
  #calibratedFootHeightY: number | undefined;
  #lastAppliedTick: number | undefined;
  #disposed = false;

  constructor(readonly options: VerticalFootSupportAnchorOptionsV1) {
    const authoredOffsetY = options.readAdjustmentOffsetY();
    if (!Number.isFinite(authoredOffsetY)) {
      invalid("authored adjustment offset must be finite.");
    }
    this.#authoredOffsetY = authoredOffsetY;
  }

  updateCommittedProjection(projection: VerticalFootSupportProjectionV1): void {
    this.#assertLive();
    if (!Number.isSafeInteger(projection.committedTick) ||
      projection.committedTick < 0 || Object.is(projection.committedTick, -0)) {
      invalid("committedTick must be a non-negative safe integer.");
    }
    if (projection.jumpEpisode !== undefined &&
      projection.jumpEpisode.committedTick !== projection.committedTick) {
      invalid("Jump Episode and presentation Tick must match.");
    }
    const currentOffsetY = this.options.readAdjustmentOffsetY();
    if (!Number.isFinite(currentOffsetY)) {
      invalid("current adjustment offset must be finite.");
    }
    this.#mode = modeForProjection(
      projection,
      this.#mode,
      this.#authoredOffsetY,
      currentOffsetY,
    );
    this.#projection = Object.freeze({
      committedTick: projection.committedTick,
      presentationKey: projection.presentationKey,
      ...(projection.jumpEpisode === undefined
        ? {}
        : { jumpEpisode: projection.jumpEpisode }),
    });
  }

  applyAfterPose(): void {
    this.#assertLive();
    const projection = this.#projection;
    if (projection === undefined ||
      this.#lastAppliedTick === projection.committedTick) return;
    const previousAppliedTick = this.#lastAppliedTick;
    this.#lastAppliedTick = projection.committedTick;
    const currentOffsetY = this.options.readAdjustmentOffsetY();
    if (!Number.isFinite(currentOffsetY)) return;
    const elapsedTicks = previousAppliedTick === undefined
      ? 1
      : Math.max(1, projection.committedTick - previousAppliedTick);
    const maximumContinuousCorrection =
      MAX_CONTINUOUS_CORRECTION_METERS_PER_TICK * elapsedTicks;

    if (this.#mode === "disabled" || this.#mode === "hold") return;
    if (this.#mode === "release") {
      const releasedOffsetY = currentOffsetY + limitedDelta(
        this.#authoredOffsetY - currentOffsetY,
        maximumContinuousCorrection,
      );
      if (Number.isFinite(releasedOffsetY)) {
        this.options.writeAdjustmentOffsetY(releasedOffsetY);
      }
      return;
    }

    const footHeightY = this.options.sampleMinimumFootHeightFromVisualRoot();
    if (!Number.isFinite(footHeightY)) return;
    if (this.#calibratedFootHeightY === undefined) {
      this.#calibratedFootHeightY = footHeightY;
      return;
    }
    const targetOffsetY = currentOffsetY +
      (this.#calibratedFootHeightY - footHeightY);
    const correction = this.#mode === "reacquire"
      ? limitedDelta(
          targetOffsetY - currentOffsetY,
          maximumContinuousCorrection,
        )
      : targetOffsetY - currentOffsetY;
    const correctedOffsetY = currentOffsetY + correction;
    if (Number.isFinite(correctedOffsetY)) {
      this.options.writeAdjustmentOffsetY(correctedOffsetY);
    }
  }

  reset(): void {
    this.#assertLive();
    this.options.writeAdjustmentOffsetY(this.#authoredOffsetY);
    this.#projection = undefined;
    this.#mode = "disabled";
    this.#calibratedFootHeightY = undefined;
    this.#lastAppliedTick = undefined;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.options.writeAdjustmentOffsetY(this.#authoredOffsetY);
    this.#projection = undefined;
    this.#mode = "disabled";
    this.#calibratedFootHeightY = undefined;
    this.#lastAppliedTick = undefined;
    this.#disposed = true;
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error("VERTICAL_FOOT_SUPPORT_ANCHOR_DISPOSED");
  }
}
