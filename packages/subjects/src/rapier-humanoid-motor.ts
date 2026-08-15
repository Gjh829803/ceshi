import { MathUtils, Vector3 } from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import type {
  MovementIntent,
  Vec3Tuple,
} from "../../contracts/src/index.js";
import { DEFAULT_HUMANOID_TRAVERSAL } from "../../contracts/src/index.js";
import type { CameraMovementBasis } from "../../camera/src/index.js";

export type { MovementIntent } from "../../contracts/src/index.js";

export interface RapierVectorLike {
  x: number;
  y: number;
  z: number;
}

export interface RapierKinematicBodyLike {
  translation(): RapierVectorLike;
  setTranslation?(translation: RapierVectorLike, wakeUp?: boolean): void;
  setNextKinematicTranslation(translation: RapierVectorLike): void;
}

export interface RapierCharacterControllerLike<TCollider> {
  computeColliderMovement(collider: TCollider, desiredTranslationDelta: RapierVectorLike): void;
  computedMovement(): RapierVectorLike;
  computedGrounded(): boolean;
  enableAutostep?(maxHeight: number, minWidth: number, includeDynamicBodies: boolean): void;
  enableSnapToGround?(distance: number): void;
  setMaxSlopeClimbAngle?(angle: number): void;
  setMinSlopeSlideAngle?(angle: number): void;
  setApplyImpulsesToDynamicBodies?(enabled: boolean): void;
  free?(): void;
}

export interface HumanoidMotorConfig {
  walkSpeed?: number;
  runSpeed?: number;
  acceleration?: number;
  deceleration?: number;
  gravity?: number;
  jumpSpeed?: number;
  turnSpeed?: number;
  autostepHeight?: number;
  autostepMinWidth?: number;
  snapToGroundDistance?: number;
  maxSlopeClimbAngle?: number;
  minSlopeSlideAngle?: number;
  initialGrounded?: boolean;
}

export interface HumanoidMotorStep {
  position: Vec3Tuple;
  velocity: Vec3Tuple;
  horizontalSpeed: number;
  facingRadians: number;
  grounded: boolean;
  jumped: boolean;
}

const DEFAULTS = {
  walkSpeed: 2.5,
  runSpeed: 5.5,
  acceleration: 18,
  deceleration: 24,
  gravity: -24,
  jumpSpeed: 7,
  turnSpeed: 12,
  autostepHeight: DEFAULT_HUMANOID_TRAVERSAL.autostepHeight,
  autostepMinWidth: 0.2,
  snapToGroundDistance: DEFAULT_HUMANOID_TRAVERSAL.snapToGroundDistance,
  maxSlopeClimbAngle:
    MathUtils.degToRad(DEFAULT_HUMANOID_TRAVERSAL.maxSlopeClimbDegrees),
  minSlopeSlideAngle:
    MathUtils.degToRad(DEFAULT_HUMANOID_TRAVERSAL.minSlopeSlideDegrees),
} as const;

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function approachAngle(current: number, target: number, maxDelta: number): number {
  const delta = MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

/** Thin, injectable wrapper around Rapier's kinematic character controller. */
export class RapierHumanoidMotor<TCollider> {
  private readonly horizontalVelocity = new Vector3();
  private verticalVelocity = 0;
  private grounded: boolean;
  private jumpHeld = false;
  private facingRadians = 0;
  private disposed = false;
  private readonly config: Required<HumanoidMotorConfig>;

  constructor(
    private readonly controller: RapierCharacterControllerLike<TCollider>,
    private readonly collider: TCollider,
    private readonly body: RapierKinematicBodyLike,
    config: HumanoidMotorConfig = {},
  ) {
    this.config = {
      ...DEFAULTS,
      initialGrounded: config.initialGrounded ?? false,
      ...config,
    };
    this.grounded = this.config.initialGrounded;
    controller.enableAutostep?.(
      this.config.autostepHeight,
      this.config.autostepMinWidth,
      true,
    );
    controller.enableSnapToGround?.(this.config.snapToGroundDistance);
    controller.setMaxSlopeClimbAngle?.(this.config.maxSlopeClimbAngle);
    controller.setMinSlopeSlideAngle?.(this.config.minSlopeSlideAngle);
    controller.setApplyImpulsesToDynamicBodies?.(true);
  }

  step(
    intent: MovementIntent,
    basis: CameraMovementBasis,
    deltaSeconds: number,
  ): HumanoidMotorStep {
    if (this.disposed) throw new Error("RapierHumanoidMotor has been disposed.");
    const dt = Number.isFinite(deltaSeconds) ? MathUtils.clamp(deltaSeconds, 0, 0.1) : 0;
    const forward = new Vector3(...basis.forward).setY(0).normalize();
    const right = new Vector3(...basis.right).setY(0).normalize();
    const direction = forward.multiplyScalar(intent.forward).add(right.multiplyScalar(intent.right));
    if (direction.lengthSq() > 1) direction.normalize();

    const targetSpeed = direction.lengthSq() === 0
      ? 0
      : intent.run
        ? this.config.runSpeed
        : this.config.walkSpeed;
    if (direction.lengthSq() > 0) direction.normalize().multiplyScalar(targetSpeed);
    const acceleration = targetSpeed === 0 ? this.config.deceleration : this.config.acceleration;
    this.horizontalVelocity.x = moveTowards(
      this.horizontalVelocity.x,
      direction.x,
      acceleration * dt,
    );
    this.horizontalVelocity.z = moveTowards(
      this.horizontalVelocity.z,
      direction.z,
      acceleration * dt,
    );

    let jumped = false;
    if (intent.jump && !this.jumpHeld && this.grounded) {
      this.verticalVelocity = this.config.jumpSpeed;
      this.grounded = false;
      jumped = true;
    } else if (!this.grounded || this.verticalVelocity > 0) {
      this.verticalVelocity += this.config.gravity * dt;
    } else {
      this.verticalVelocity = 0;
    }
    this.jumpHeld = intent.jump;

    const desiredMovement = {
      x: this.horizontalVelocity.x * dt,
      y: this.verticalVelocity * dt,
      z: this.horizontalVelocity.z * dt,
    };
    this.controller.computeColliderMovement(this.collider, desiredMovement);
    const movement = this.controller.computedMovement();
    const current = this.body.translation();
    const next = {
      x: current.x + movement.x,
      y: current.y + movement.y,
      z: current.z + movement.z,
    };
    this.body.setNextKinematicTranslation(next);
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.verticalVelocity < 0) this.verticalVelocity = 0;

    if (this.horizontalVelocity.lengthSq() > 1e-6) {
      const targetFacing = Math.atan2(-this.horizontalVelocity.x, -this.horizontalVelocity.z);
      this.facingRadians = approachAngle(
        this.facingRadians,
        targetFacing,
        this.config.turnSpeed * dt,
      );
    }

    return {
      position: [next.x, next.y, next.z],
      velocity: [this.horizontalVelocity.x, this.verticalVelocity, this.horizontalVelocity.z],
      horizontalSpeed: this.horizontalVelocity.length(),
      facingRadians: this.facingRadians,
      grounded: this.grounded,
      jumped,
    };
  }

  reset(
    position: Vec3Tuple,
    options: { facingRadians?: number; grounded?: boolean } = {},
  ): HumanoidMotorStep {
    if (this.disposed) throw new Error("RapierHumanoidMotor has been disposed.");
    const next = { x: position[0], y: position[1], z: position[2] };
    this.horizontalVelocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.jumpHeld = false;
    this.facingRadians = options.facingRadians ?? 0;
    this.grounded = options.grounded ?? false;
    this.body.setTranslation?.(next, true);
    this.body.setNextKinematicTranslation(next);
    return {
      position,
      velocity: [0, 0, 0],
      horizontalSpeed: 0,
      facingRadians: this.facingRadians,
      grounded: this.grounded,
      jumped: false,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.controller.free?.();
    this.disposed = true;
  }
}

/** Convenience bridge for PhysicsSystem.rawWorld/body.raw/collider.raw. */
export function createRapierHumanoidMotorFromWorld(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  collider: RAPIER.Collider,
  config: HumanoidMotorConfig = {},
  controllerOffset = 0.02,
): RapierHumanoidMotor<RAPIER.Collider> {
  const controller = world.createCharacterController(controllerOffset);
  return new RapierHumanoidMotor(controller, collider, body, config);
}
