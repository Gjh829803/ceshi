import type {
  BlockCameraPackIdV1,
  BlockMotionPackIdV1,
} from "./types.js";

export interface BlockMotionPackDefinitionV1 {
  readonly id: BlockMotionPackIdV1;
  readonly displayName: string;
  readonly description: string;
  readonly movementModes: readonly ("ground-walk" | "ground-drive" | "flight")[];
  readonly capabilityRefs: readonly string[];
  readonly physicsBodyProfileRef: string;
  readonly locomotionProfileRef: string;
  readonly controlFeelProfileRef: string;
  readonly allowedControlFeelProfileRefs: readonly string[];
  readonly defaultMotionProfileRef: string;
  readonly optionalMotionProfileRefs: readonly string[];
  readonly fallbackMotionProfileRef: string;
  readonly controlProfileRef: string;
  readonly mediumProfileRef: string;
}

export interface BlockCameraPackDefinitionV1 {
  readonly id: BlockCameraPackIdV1;
  readonly displayName: string;
  readonly description: string;
  readonly mode: "first-person" | "third-person";
  readonly cameraContextProfileRef: string;
  readonly cameraRigProfileRef: string;
  readonly defaults: Readonly<{
    distanceMeters: number;
    pitchRadians: number;
    fovDegrees: number;
  }>;
}

export const BLOCK_MOTION_PACKS_V1: Readonly<
  Record<BlockMotionPackIdV1, BlockMotionPackDefinitionV1>
> = Object.freeze({
  "ground.character-standard": Object.freeze({
    id: "ground.character-standard",
    displayName: "Standard character ground movement",
    description: "Camera-relative walking, running and jumping for a character body.",
    movementModes: Object.freeze(["ground-walk"] as const),
    capabilityRefs: Object.freeze(["worldkit://capability/locomotion.ground@1"]),
    physicsBodyProfileRef:
      "worldkit://physics-body-profile/character.capability-medium@1",
    locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    controlFeelProfileRef:
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
    allowedControlFeelProfileRefs: Object.freeze([
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
      "worldkit://control-feel-profile/humanoid.heavy-ground@1",
    ]),
    defaultMotionProfileRef:
      "worldkit://motion-profile/free-ground.humanoid-medium@1",
    optionalMotionProfileRefs: Object.freeze([
      "worldkit://motion-profile/safe-ground@1",
    ]),
    fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
  }),
  "ground.root-standard": Object.freeze({
    id: "ground.root-standard",
    displayName: "Standard rigid ground movement",
    description: "The standard ground controller for an unrigged rigid Subject Assembly.",
    movementModes: Object.freeze(["ground-walk"] as const),
    capabilityRefs: Object.freeze(["worldkit://capability/locomotion.ground@1"]),
    physicsBodyProfileRef:
      "worldkit://physics-body-profile/character.capability-medium@1",
    locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    controlFeelProfileRef:
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
    allowedControlFeelProfileRefs: Object.freeze([
      "worldkit://control-feel-profile/humanoid.medium-ground@1",
      "worldkit://control-feel-profile/humanoid.heavy-ground@1",
    ]),
    defaultMotionProfileRef:
      "worldkit://motion-profile/free-ground.humanoid-medium@1",
    optionalMotionProfileRefs: Object.freeze([
      "worldkit://motion-profile/safe-ground@1",
    ]),
    fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
    controlProfileRef: "worldkit://control-profile/planar.camera-relative@1",
    mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
  }),
  "flight.powered-standard": Object.freeze({
    id: "flight.powered-standard",
    displayName: "Standard powered flight",
    description: "Hover-capable powered flight for the complete Subject Assembly.",
    movementModes: Object.freeze(["flight"] as const),
    capabilityRefs: Object.freeze([
      "worldkit://capability/locomotion.powered-flight@1",
    ]),
    physicsBodyProfileRef:
      "worldkit://physics-body-profile/character.capability-medium@1",
    locomotionProfileRef: "worldkit://locomotion-profile/flight.powered@1",
    controlFeelProfileRef:
      "worldkit://control-feel-profile/flight.powered-standard@1",
    allowedControlFeelProfileRefs: Object.freeze([
      "worldkit://control-feel-profile/flight.powered-standard@1",
    ]),
    defaultMotionProfileRef:
      "worldkit://motion-profile/powered-flight.standard@1",
    optionalMotionProfileRefs: Object.freeze([]),
    fallbackMotionProfileRef:
      "worldkit://motion-profile/powered-flight.safe-hover@1",
    controlProfileRef: "worldkit://control-profile/flight.camera-relative@1",
    mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
  }),
  "vehicle.stk-kart.arcade": Object.freeze({
    id: "vehicle.stk-kart.arcade",
    displayName: "STK arcade kart driving",
    description:
      "25 m/s kart driving with speed-radius steering, locked drift and release boost.",
    movementModes: Object.freeze(["ground-drive"] as const),
    capabilityRefs: Object.freeze([
      "worldkit://capability/locomotion.forward-steer@1",
      "worldkit://capability/locomotion.wheeled@1",
    ]),
    physicsBodyProfileRef:
      "worldkit://physics-body-profile/character.capability-medium@1",
    locomotionProfileRef:
      "worldkit://locomotion-profile/ground.kart-control-lab-stk@1",
    controlFeelProfileRef:
      "worldkit://control-feel-profile/kart-control-lab.stk-kart@1",
    allowedControlFeelProfileRefs: Object.freeze([
      "worldkit://control-feel-profile/kart-control-lab.stk-kart@1",
    ]),
    defaultMotionProfileRef:
      "worldkit://motion-profile/wheeled-arcade.medium@1",
    optionalMotionProfileRefs: Object.freeze([]),
    fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
    controlProfileRef:
      "worldkit://control-profile/throttle-steer.subject-local@1",
    mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
  }),
});

export const BLOCK_CAMERA_PACKS_V1: Readonly<
  Record<BlockCameraPackIdV1, BlockCameraPackDefinitionV1>
> = Object.freeze({
  "third-person.standard": Object.freeze({
    id: "third-person.standard",
    displayName: "Standard third person",
    description: "Centered orbit-follow framing with Spring Arm collision.",
    mode: "third-person",
    cameraContextProfileRef: "worldkit://camera-context/agent.third-person@1",
    cameraRigProfileRef: "worldkit://camera-profile/orbit.medium@1",
    defaults: Object.freeze({ distanceMeters: 5, pitchRadians: 0.22, fovDegrees: 58 }),
  }),
  "third-person.over-shoulder": Object.freeze({
    id: "third-person.over-shoulder",
    displayName: "Over shoulder",
    description: "Closer offset third-person composition with Spring Arm collision.",
    mode: "third-person",
    cameraContextProfileRef:
      "worldkit://camera-context/agent.over-shoulder@1",
    cameraRigProfileRef: "worldkit://camera-profile/orbit.medium@1",
    defaults: Object.freeze({ distanceMeters: 3.2, pitchRadians: 0.12, fovDegrees: 56 }),
  }),
  "third-person.giant": Object.freeze({
    id: "third-person.giant",
    displayName: "Giant scale third person",
    description: "Long-arm wide framing for very large Subject Assemblies.",
    mode: "third-person",
    cameraContextProfileRef: "worldkit://camera-context/agent.giant@1",
    cameraRigProfileRef: "worldkit://camera-profile/orbit.medium@1",
    defaults: Object.freeze({ distanceMeters: 14, pitchRadians: 0.3, fovDegrees: 62 }),
  }),
  "first-person.standard": Object.freeze({
    id: "first-person.standard",
    displayName: "Standard first person",
    description: "Socket or explicit local-point first-person view.",
    mode: "first-person",
    cameraContextProfileRef: "worldkit://camera-context/agent.first-person@1",
    cameraRigProfileRef: "worldkit://camera-profile/first-person.standard@1",
    defaults: Object.freeze({ distanceMeters: 0, pitchRadians: 0, fovDegrees: 70 }),
  }),
  "third-person.kart-chase": Object.freeze({
    id: "third-person.kart-chase",
    displayName: "Kart chase",
    description:
      "Longer speed-sensitive kart view with forward-motion recentering and Spring Arm collision.",
    mode: "third-person",
    cameraContextProfileRef: "worldkit://camera-context/agent.kart-chase@1",
    cameraRigProfileRef:
      "worldkit://camera-profile/chase.kart-control-lab-stk@1",
    defaults: Object.freeze({
      distanceMeters: 9.3,
      pitchRadians: 0.42,
      fovDegrees: 56,
    }),
  }),
});

export function resolveBlockMotionPackV1(
  id: string,
): BlockMotionPackDefinitionV1 | undefined {
  return BLOCK_MOTION_PACKS_V1[id as BlockMotionPackIdV1];
}

export function resolveBlockCameraPackV1(
  id: string,
): BlockCameraPackDefinitionV1 | undefined {
  return BLOCK_CAMERA_PACKS_V1[id as BlockCameraPackIdV1];
}
