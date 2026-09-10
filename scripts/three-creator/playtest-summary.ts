export type PlaytestTraceQuery = {fromSeconds?: number; toSeconds?: number; maxSamples?: number};
const object = (value: unknown): Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const text = (value: unknown, limit = 160): string | null => typeof value === 'string' ? value.length > limit ? value.slice(0, limit - 1) + '…' : value : null;
const vector = (value: unknown): [number, number, number] | null => Array.isArray(value) && value.length === 3 && value.every(n => finite(n) !== null) ? [...value] as [number, number, number] : null;

export function validatePlaytestTraceQuery(query: PlaytestTraceQuery) {
  const {fromSeconds = 0, toSeconds, maxSamples = 12} = query;
  if (finite(fromSeconds) === null || fromSeconds < 0 ||
      (toSeconds !== undefined && (finite(toSeconds) === null || toSeconds < fromSeconds)) ||
      !Number.isInteger(maxSamples) || maxSamples < 2 || maxSamples > 32) {
    throw new Error('THREE_PLAYTEST_QUERY_INVALID: use 0 <= fromSeconds <= toSeconds and 2 <= maxSamples <= 32');
  }
  return {fromSeconds, toSeconds, maxSamples};
}

/** Select recorded samples only. No interpolation, simulation, route planning or success gate. */
export function summarizePlaytestTrace(value: unknown, query: PlaytestTraceQuery = {}) {
  const {fromSeconds, toSeconds, maxSamples} = validatePlaytestTraceQuery(query);
  const trace = object(value), rawSamples: unknown[] = Array.isArray(trace.samples) ? trace.samples : [];
  const timed = rawSamples.flatMap((value, traceSampleIndex) => {
    const sample = object(value), wallSeconds = finite(sample.wallSeconds);
    return wallSeconds === null || wallSeconds < 0 ? [] : [{sample, wallSeconds, traceSampleIndex}];
  }).sort((a, b) => a.wallSeconds - b.wallSeconds || a.traceSampleIndex - b.traceSampleIndex);
  const end = toSeconds ?? timed.at(-1)?.wallSeconds ?? fromSeconds;
  const matching = timed.filter(row => row.wallSeconds >= fromSeconds && row.wallSeconds <= end);
  const compact = ({sample, wallSeconds, traceSampleIndex}: typeof timed[number]) => {
    const velocityMetersPerSecondXYZ = vector(sample.velocityMetersPerSecondXYZ);
    const humanoid = object(sample.humanoid), mounted = humanoid.mountedInstanceId;
    const mountObserved = mounted === null || typeof mounted === 'string';
    return {
      traceSampleIndex, wallSeconds, simulationTick: finite(sample.simulationTick),
      simulationSeconds: finite(sample.simulationSeconds), worldRevision: finite(sample.worldRevision),
      positionMetersXYZ: vector(sample.positionMetersXYZ), velocityMetersPerSecondXYZ,
      speedMetersPerSecond: velocityMetersPerSecondXYZ ? finite(Math.hypot(...velocityMetersPerSecondXYZ)) : null,
      isGrounded: typeof sample.isGrounded === 'boolean' ? sample.isGrounded : null,
      actionId: text(sample.actionId), cameraMode: text(object(sample.camera).mode),
      mount: {status: mountObserved ? 'observed' : 'unavailable', instanceId: text(mounted)},
      observationError: text(sample.observationError, 300),
    };
  };
  const rows = matching.map(compact);
  const selected = rows.length <= maxSamples ? rows : Array.from({length: maxSamples}, (_, i) => rows[Math.round(i * (rows.length - 1) / (maxSamples - 1))]!);
  const speeds = rows.flatMap(row => row.speedMetersPerSecond === null ? [] : [row.speedMetersPerSecond]);
  const mounts = [...new Set(rows.flatMap(row => row.mount.instanceId === null ? [] : [row.mount.instanceId]))];
  const events = (Array.isArray(trace.keyboardEvents) ? trace.keyboardEvents : []).flatMap((value: unknown, keyboardEventIndex: number) => {
    const event = object(value), wallSeconds = finite(event.timeSeconds);
    if (wallSeconds === null || wallSeconds < fromSeconds || wallSeconds > end) return [];
    return [{keyboardEventIndex, wallSeconds, type: text(event.type), code: text(event.code),
      repeat: typeof event.repeat === 'boolean' ? event.repeat : null,
      isTrusted: typeof event.isTrusted === 'boolean' ? event.isTrusted : null}];
  }).sort((a: {wallSeconds: number}, b: {wallSeconds: number}) => a.wallSeconds - b.wallSeconds);
  return {
    status: rows.length ? 'observed' : 'empty', scope: 'recorded-controlled-subject',
    clock: 'seconds-since-browser-trace-start',
    requestedRange: {fromSeconds, toSeconds: toSeconds ?? null},
    recordedRange: timed.length ? {fromSeconds: timed[0]!.wallSeconds, toSeconds: timed.at(-1)!.wallSeconds} : null,
    selectedRange: rows.length ? {fromSeconds: rows[0]!.wallSeconds, toSeconds: rows.at(-1)!.wallSeconds} : null,
    summary: {
      sampleCount: rows.length, invalidTimestampSamples: rawSamples.length - timed.length,
      speedSampleCount: speeds.length, observedMaximumSpeedMetersPerSecond: speeds.length ? speeds.reduce((maximum, speed) => Math.max(maximum, speed), 0) : null,
      firstSpeedMetersPerSecond: rows[0]?.speedMetersPerSecond ?? null,
      lastSpeedMetersPerSecond: rows.at(-1)?.speedMetersPerSecond ?? null,
      mountObservationCount: rows.filter(row => row.mount.status === 'observed').length,
      mountedInstanceIds: mounts.slice(0, 8), omittedMountedInstanceIds: Math.max(0, mounts.length - 8),
    },
    samples: selected, sampleSelection: {method: 'uniform-recorded-samples-including-endpoints', returned: selected.length, omitted: rows.length - selected.length},
    keyboardEvents: events.slice(0, 32), omittedKeyboardEvents: Math.max(0, events.length - 32),
    qualification: 'Recorded observations, not current state or task acceptance. Null means unavailable. Uniform samples may omit brief transitions; narrow the time range. Speed is sampled vector magnitude, not signed vehicle speed. No interpolation across resets or mount transitions.',
  };
}
