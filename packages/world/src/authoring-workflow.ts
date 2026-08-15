export type WorldAuthoringStage =
  | "draft"
  | "frozen"
  | "implemented"
  | "verified"
  | "visualized";

export interface WorldPlanChangeRequest {
  kind: "world-plan-change-request";
  version: 1;
  sceneId: string;
  requestedBy: "world-builder" | "visual-bible";
  reason: string;
  affectedIds: readonly string[];
  proposal: string;
}

const nextStages: Readonly<Record<WorldAuthoringStage, readonly WorldAuthoringStage[]>> = {
  draft: ["frozen"],
  frozen: ["implemented"],
  implemented: ["verified"],
  verified: ["visualized"],
  visualized: [],
};

export function canTransitionWorldAuthoringStage(
  from: WorldAuthoringStage,
  to: WorldAuthoringStage,
): boolean {
  return nextStages[from].includes(to);
}

export function assertWorldAuthoringTransition(
  from: WorldAuthoringStage,
  to: WorldAuthoringStage,
): void {
  if (!canTransitionWorldAuthoringStage(from, to)) {
    throw new Error(`World authoring cannot transition from ${from} to ${to}.`);
  }
}

export function defineWorldPlanChangeRequest(
  request: WorldPlanChangeRequest,
): WorldPlanChangeRequest {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(request.sceneId)) {
    throw new Error("World plan change request requires a valid sceneId.");
  }
  if (!request.reason.trim() || !request.proposal.trim() || request.affectedIds.length === 0) {
    throw new Error("World plan change request requires a reason, proposal, and affected IDs.");
  }
  return Object.freeze(request);
}
