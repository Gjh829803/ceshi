/** Identity of the latest completed solver evaluation. Vehicle pose/velocity are
 * subsequently integrated; forces and contacts are not recomputed by observers.
 * Sequence belongs to the current EnvironmentQueries instance, not a global clock. */
export interface SolverSample {
  physicsStepSequence:number;
  phase:'pre-integration';
  deltaSeconds:number;
}
