import {
  Group,
  MathUtils,
  PerspectiveCamera,
  Vector3,
} from "three";
import type {
  ActionManifest,
  FrameContext,
  MovementIntent,
  RuntimeSystem,
  Vec3Tuple,
} from "../../contracts/src/index.js";
import {
  ActionRegistry,
  HumanoidActionStateMachine,
} from "../../animation/src/index.js";
import {
  ThirdPersonCameraRig,
} from "../../camera/src/index.js";
import type {
  ThirdPersonCameraRigOptions,
} from "../../camera/src/index.js";
import type { HumanoidVisual } from "./humanoid-visual.js";
import { createPlaceholderHumanoidVisual } from "./humanoid-visual.js";
import type {
  HumanoidMotorStep,
  RapierHumanoidMotor,
} from "./rapier-humanoid-motor.js";

export interface HumanoidThirdPersonSubjectKitOptions<TCollider> {
  id: string;
  camera: PerspectiveCamera;
  motor: RapierHumanoidMotor<TCollider>;
  visual?: HumanoidVisual;
  /** Yaw correction from the asset's authored forward axis to runtime -Z forward. */
  visualYawOffset?: number;
  actionManifest?: ActionManifest;
  cameraOptions?: Omit<
    ThirdPersonCameraRigOptions,
    "camera" | "target" | "targetEntityId"
  >;
  /** Visual-only vertical smoothing for grounded movement over heightfields. */
  renderVerticalDamping?: number;
}

function interpolateAngle(from: number, to: number, alpha: number): number {
  const delta = MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
  return from + delta * alpha;
}

export class HumanoidThirdPersonSubjectKit<TCollider> implements RuntimeSystem {
  readonly id: string;
  readonly preset = "humanoid.third_person" as const;
  readonly root = new Group();
  readonly visualMount = new Group();
  readonly visual: HumanoidVisual;
  readonly cameraRig: ThirdPersonCameraRig;
  readonly actionRegistry: ActionRegistry | null;
  readonly actionStateMachine: HumanoidActionStateMachine | null;
  private lastStep: HumanoidMotorStep | null = null;
  private readonly previousPosition = new Vector3();
  private readonly currentPosition = new Vector3();
  private previousFacingRadians = 0;
  private currentFacingRadians = 0;
  private renderInitialized = false;
  private readonly renderVerticalDamping: number;

  private intent: MovementIntent = {
    forward: 0,
    right: 0,
    run: false,
    jump: false,
  };

  constructor(private readonly options: HumanoidThirdPersonSubjectKitOptions<TCollider>) {
    this.id = `subject:${options.id}`;
    this.root.name = options.id;
    this.renderVerticalDamping = Math.max(0, options.renderVerticalDamping ?? 30);
    this.visual = options.visual ?? createPlaceholderHumanoidVisual();
    this.visualMount.name = `${options.id}:visual-mount`;
    this.visualMount.rotation.y =
      options.visualYawOffset ?? (this.visual.status === "rigged" ? Math.PI : 0);
    this.visualMount.add(this.visual.root);
    this.root.add(this.visualMount);
    this.cameraRig = new ThirdPersonCameraRig({
      ...options.cameraOptions,
      camera: options.camera,
      target: this.root,
      targetEntityId: options.id,
    });

    if (
      this.visual.status === "rigged" &&
      options.actionManifest !== undefined
    ) {
      this.actionRegistry = new ActionRegistry({
        root: this.visual.root,
        clips: this.visual.clips,
        manifest: options.actionManifest,
      });
      this.actionStateMachine = new HumanoidActionStateMachine(this.actionRegistry);
    } else {
      this.actionRegistry = null;
      this.actionStateMachine = null;
    }
  }

  setMovementIntent(intent: MovementIntent): void {
    this.intent = {
      forward: Math.max(-1, Math.min(1, intent.forward)),
      right: Math.max(-1, Math.min(1, intent.right)),
      run: intent.run,
      jump: intent.jump,
    };
  }

  fixedUpdate(context: FrameContext): void {
    const result = this.options.motor.step(
      this.intent,
      this.cameraRig.getMovementBasis(),
      context.deltaSeconds,
    );
    if (this.lastStep === null) {
      this.previousPosition.set(...result.position);
      this.currentPosition.set(...result.position);
      this.previousFacingRadians = result.facingRadians;
      this.currentFacingRadians = result.facingRadians;
    } else {
      this.previousPosition.copy(this.currentPosition);
      this.currentPosition.set(...result.position);
      this.previousFacingRadians = this.currentFacingRadians;
      this.currentFacingRadians = result.facingRadians;
    }
    this.lastStep = result;
    this.actionStateMachine?.update({
      grounded: result.grounded,
      horizontalSpeed: result.horizontalSpeed,
      runRequested: this.intent.run,
    });
  }

  update(context: FrameContext): void {
    if (this.lastStep !== null) {
      const alpha = MathUtils.clamp(context.interpolationAlpha ?? 1, 0, 1);
      const target = new Vector3().lerpVectors(
        this.previousPosition,
        this.currentPosition,
        alpha,
      );
      if (!this.renderInitialized || !this.lastStep.grounded || this.lastStep.jumped) {
        this.root.position.copy(target);
        this.renderInitialized = true;
      } else {
        this.root.position.x = target.x;
        this.root.position.z = target.z;
        const verticalAlpha = this.renderVerticalDamping === 0
          ? 1
          : 1 - Math.exp(-this.renderVerticalDamping * Math.max(0, context.deltaSeconds));
        this.root.position.y += (target.y - this.root.position.y) * verticalAlpha;
      }
      this.root.rotation.y = interpolateAngle(
        this.previousFacingRadians,
        this.currentFacingRadians,
        alpha,
      );
    }
    this.cameraRig.update(context.deltaSeconds);
    this.actionRegistry?.update(context.deltaSeconds);
  }

  /** Standalone helper for tests or hosts that do not use Core.World. */
  advance(deltaSeconds: number): HumanoidMotorStep {
    const context: FrameContext = {
      deltaSeconds,
      elapsedSeconds: deltaSeconds,
      tick: 1,
    };
    this.fixedUpdate(context);
    this.update(context);
    if (this.lastStep === null) throw new Error("Subject motor did not produce a step.");
    return this.lastStep;
  }

  reset(
    position: Vec3Tuple,
    options: { facingRadians?: number; grounded?: boolean } = {},
  ): HumanoidMotorStep {
    this.intent = { forward: 0, right: 0, run: false, jump: false };
    const result = this.options.motor.reset(position, options);
    this.lastStep = result;
    this.previousPosition.set(...result.position);
    this.currentPosition.set(...result.position);
    this.previousFacingRadians = result.facingRadians;
    this.currentFacingRadians = result.facingRadians;
    this.renderInitialized = true;
    this.root.position.set(...result.position);
    this.root.rotation.y = result.facingRadians;
    this.actionStateMachine?.update({
      grounded: result.grounded,
      horizontalSpeed: 0,
      runRequested: false,
    });
    return result;
  }

  dispose(): void {
    this.actionRegistry?.dispose();
    this.options.motor.dispose();
    this.visual.dispose();
    this.root.removeFromParent();
  }
}

export function createHumanoidThirdPersonSubjectKit<TCollider>(
  options: HumanoidThirdPersonSubjectKitOptions<TCollider>,
): HumanoidThirdPersonSubjectKit<TCollider> {
  return new HumanoidThirdPersonSubjectKit(options);
}
