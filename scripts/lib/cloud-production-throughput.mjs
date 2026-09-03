import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PROFILE_ID = /^[a-z0-9][a-z0-9-]{2,79}@[1-9][0-9]*$/;

function integer(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be an integer in [${minimum}, ${maximum}].`);
  }
  return number;
}

function ratio(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be in [${minimum}, ${maximum}].`);
  }
  return number;
}

export function parseCloudProductionThroughputConfig(value) {
  if (value?.kind !== "worldkit-cloud-production-throughput-profile" ||
      value?.schemaVersion !== 1 || !PROFILE_ID.test(String(value?.profileId ?? ""))) {
    throw new Error("Cloud production throughput profile identity is invalid.");
  }
  const submission = Object.freeze({
    maxConcurrentCreates: integer(
      value.submission?.maxConcurrentCreates,
      "submission.maxConcurrentCreates",
      1,
      32,
    ),
    maxNonTerminalLwdpBatches: integer(
      value.submission?.maxNonTerminalLwdpBatches,
      "submission.maxNonTerminalLwdpBatches",
      1,
      128,
    ),
    pollIntervalSeconds: integer(
      value.submission?.pollIntervalSeconds,
      "submission.pollIntervalSeconds",
      5,
      10,
    ),
  });
  const batching = Object.freeze({
    codexMaxTasksPerBatch: integer(
      value.batching?.codexMaxTasksPerBatch,
      "batching.codexMaxTasksPerBatch",
      1,
      1_000,
    ),
    codexAccountConcurrency: integer(
      value.batching?.codexAccountConcurrency,
      "batching.codexAccountConcurrency",
      1,
      100,
    ),
    codexPodConcurrency: integer(
      value.batching?.codexPodConcurrency,
      "batching.codexPodConcurrency",
      1,
      128,
    ),
    codexMaxPods: integer(
      value.batching?.codexMaxPods,
      "batching.codexMaxPods",
      1,
      100,
    ),
  });
  const pools = Object.freeze({
    sceneCases: integer(value.pools?.sceneCases, "pools.sceneCases", 1, 100),
    whiteboxCaptureCases: integer(
      value.pools?.whiteboxCaptureCases,
      "pools.whiteboxCaptureCases",
      1,
      32,
    ),
    gemini: integer(value.pools?.gemini, "pools.gemini", 1, 100),
    seedancePerCase: integer(
      value.pools?.seedancePerCase,
      "pools.seedancePerCase",
      1,
      20,
    ),
    seedanceGlobal: integer(value.pools?.seedanceGlobal, "pools.seedanceGlobal", 1, 128),
    mediaConformance: integer(
      value.pools?.mediaConformance,
      "pools.mediaConformance",
      1,
      100,
    ),
  });
  if (pools.seedancePerCase > pools.seedanceGlobal) {
    throw new Error("Per-Case Seedance concurrency cannot exceed the global pool.");
  }
  const ramp = Object.freeze({
    lwdpBatches: Object.freeze((value.ramp?.lwdpBatches ?? []).map((item) =>
      integer(
        item,
        "ramp.lwdpBatches[]",
        1,
        submission.maxNonTerminalLwdpBatches,
      ))),
    seedance: Object.freeze((value.ramp?.seedance ?? []).map((item) =>
      integer(item, "ramp.seedance[]", 1, pools.seedanceGlobal))),
    minimumObservationSeconds: integer(
      value.ramp?.minimumObservationSeconds,
      "ramp.minimumObservationSeconds",
      60,
      86_400,
    ),
    maximumTerminalFailureRatio: ratio(
      value.ramp?.maximumTerminalFailureRatio,
      "ramp.maximumTerminalFailureRatio",
      0,
      0.5,
    ),
  });
  if (ramp.lwdpBatches.at(-1) !== submission.maxNonTerminalLwdpBatches ||
      ramp.seedance.at(-1) !== pools.seedanceGlobal) {
    throw new Error("Cloud production ramp must terminate at each configured pool limit.");
  }
  const circuitBreaker = Object.freeze({
    minimumSamples: integer(
      value.circuitBreaker?.minimumSamples,
      "circuitBreaker.minimumSamples",
      1,
      10_000,
    ),
    openFailureRatio: ratio(
      value.circuitBreaker?.openFailureRatio,
      "circuitBreaker.openFailureRatio",
      0.1,
      1,
    ),
    cooldownSeconds: integer(
      value.circuitBreaker?.cooldownSeconds,
      "circuitBreaker.cooldownSeconds",
      30,
      3_600,
    ),
    halfOpenProbeCount: integer(
      value.circuitBreaker?.halfOpenProbeCount,
      "circuitBreaker.halfOpenProbeCount",
      1,
      32,
    ),
  });
  return Object.freeze({
    kind: value.kind,
    schemaVersion: value.schemaVersion,
    profileId: value.profileId,
    targetCaseCount: integer(value.targetCaseCount, "targetCaseCount", 1, 10_000),
    targetCompletionHours: integer(
      value.targetCompletionHours,
      "targetCompletionHours",
      1,
      24 * 30,
    ),
    submission,
    batching,
    pools,
    ramp,
    circuitBreaker,
  });
}

export async function loadCloudProductionThroughputConfig(repoRoot, {
  configPath = path.join(repoRoot, "config", "cloud-production-throughput.json"),
} = {}) {
  return parseCloudProductionThroughputConfig(
    JSON.parse(await readFile(configPath, "utf8")),
  );
}

export function loadCloudProductionThroughputConfigSync(repoRoot, {
  configPath = path.join(repoRoot, "config", "cloud-production-throughput.json"),
} = {}) {
  return parseCloudProductionThroughputConfig(
    JSON.parse(readFileSync(configPath, "utf8")),
  );
}
