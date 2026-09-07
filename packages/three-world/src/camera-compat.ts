import type { PhysicsPort as EnginePhysicsPort } from './engine-contracts.js';

export type { Vec3 } from './contracts.js';

/** Type-only seam for pinned camera kernels; no movement or physics ownership. */
export type PhysicsPort = Pick<EnginePhysicsPort, 'castCameraArm'>;
