type RuntimeFailureObservation = Readonly<{
  readonly actions?: readonly string[];
  readonly controlledSubject?: Readonly<{
    readonly positionMetersXYZ?: readonly number[];
  }>;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly stage?: string;
  readonly tick?: number;
}>;

const repairableCollision =
  /native collision resolution amplified (?:horizontal proposal (?:progress|magnitude)|vertical proposal beyond max step height)/;

function parseRuntimeFailure(message: string): RuntimeFailureObservation | null {
  const marker = "WORLDKIT_RUNTIME_FIXED_INPUT_FAILED ";
  const line = message.split("\n").find((candidate) => candidate.includes(marker));
  if (!line) return null;
  try {
    const value = JSON.parse(line.slice(line.indexOf(marker) + marker.length));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function isRepairablePlaythroughRuntimeFailure(message: string): boolean {
  return message.includes("WORLDKIT_RUNTIME_FIXED_INPUT_FAILED") &&
    repairableCollision.test(message);
}

export function buildPlaythroughRuntimeRepairArtifacts(input: Readonly<{
  readonly sceneId: string;
  readonly planHash: string;
  readonly segmentId: string;
  readonly errorMessage: string;
  readonly policy?: unknown;
}>): Readonly<{
  readonly qualityReport: Record<string, unknown>;
  readonly repairEvidence: Record<string, unknown>;
}> {
  const observation = parseRuntimeFailure(input.errorMessage);
  const position = observation?.controlledSubject?.positionMetersXYZ;
  const runtimePositionMetersXYZ = Array.isArray(position) &&
      position.length === 3 && position.every(Number.isFinite)
    ? [...position]
    : null;
  const activeActions = Array.isArray(observation?.actions)
    ? observation.actions.filter((value): value is string => typeof value === "string")
    : [];
  const diagnostic = {
    code: "CAPTURE_RUNTIME_COLLISION_REPAIR_REQUIRED",
    path: `/segments/${input.segmentId}`,
    message: "The deterministic route reached a native collision state that cannot publish a stable movement Tick.",
    segmentId: input.segmentId,
  };
  return Object.freeze({
    qualityReport: {
      kind: "worldkit-executed-playthrough-quality-report",
      schemaVersion: 3,
      sceneId: input.sceneId,
      planHash: input.planHash,
      ...(input.policy === undefined ? {} : { policy: input.policy }),
      passed: false,
      diagnostics: [diagnostic],
      segments: [{
        segmentId: input.segmentId,
        passed: false,
        diagnostics: [diagnostic],
        metrics: null,
      }],
    },
    repairEvidence: {
      kind: "worldkit-playthrough-capture-repair-evidence",
      schemaVersion: 1,
      sceneId: input.sceneId,
      planHash: input.planHash,
      failedSegments: [{
        segmentId: input.segmentId,
        diagnostics: [diagnostic],
        runtimeStage: observation?.stage ?? null,
        runtimeTick: Number.isFinite(observation?.tick) ? observation?.tick : null,
        runtimeErrorCode: observation?.errorCode ?? null,
        runtimeErrorMessage: observation?.errorMessage ??
          input.errorMessage.slice(0, 8_000),
        runtimePositionMetersXYZ,
        activeActions,
        evidenceSamples: [],
      }],
    },
  });
}
