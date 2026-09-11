import type {WorldCommand, ThreeWorld} from '@worldkit/three';

// Use the existing world and a request supported by its actual scene conditions.
declare const world: ThreeWorld;
declare const request: Extract<WorldCommand, {type:'humanoid.perform-action'}>['request'];
const receipt = await world.execute({type:'humanoid.perform-action', request});
if (receipt.status === 'rejected') throw receipt.error;
if (receipt.status === 'accepted') {
  const result = await world.operations.wait(receipt.operationId);
  // Check result.status and the actor/target state; accepted is not completion.
}
