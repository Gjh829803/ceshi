import type {
  GameplayCommandV1,
  GameplayDiagnosticV1,
} from "@whitebox-world/gameplay-contracts";

import type { GameplayPlanningStateV1 } from "./gameplay-state";

export type GameplayModeCommandDecisionV1 =
  | Readonly<{ status: "accepted" }>
  | Readonly<{ status: "rejected"; diagnostic: GameplayDiagnosticV1 }>;

export interface GameplayModeEvaluationContextV1 {
  readonly command: GameplayCommandV1;
  readonly state: GameplayPlanningStateV1;
  readonly simulationTick: number;
}

export interface GameplayModeV1 {
  readonly gameplayModeRef: string;
  evaluateCommand(
    context: GameplayModeEvaluationContextV1,
  ): GameplayModeCommandDecisionV1;
}
