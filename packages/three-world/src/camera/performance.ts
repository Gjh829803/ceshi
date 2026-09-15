export type CameraPerformanceStage = 'input' | 'fixed' | 'presentation';
export interface CameraPerformanceSample {
  readonly sampleId: number;
  readonly stage: CameraPerformanceStage;
  readonly simulationTick: number;
  readonly configurationRevision: number;
  readonly lifecycleGeneration: number;
  readonly durationMilliseconds: number;
  /** Geometry-provider probe time is included in stage time, never an additional total.
   * One probe may issue multiple underlying physics queries. */
  readonly queryMilliseconds: number;
  readonly queryCount: number;
}
export interface CameraPerformanceReading {
  readonly status: 'measured' | 'unavailable';
  readonly reason?: 'clock-unavailable';
  readonly capacityPerStage: number;
  readonly samples: readonly CameraPerformanceSample[];
  readonly stages: Partial<Record<CameraPerformanceStage, {
    readonly count: number;
    readonly meanMilliseconds: number;
    readonly p95Milliseconds: number;
    readonly maximumMilliseconds: number;
    readonly queryMilliseconds: number;
    readonly queryCount: number;
  }>>;
}
interface ActiveSample {
  sampleId: number;
  stage: CameraPerformanceStage;
  simulationTick: number;
  configurationRevision: number;
  lifecycleGeneration: number;
  started: number;
  queryMilliseconds: number;
  queryCount: number;
}
const CAPACITY = 240;
/** Opt-in CPU timings. No simulation state, callbacks, observers or timers.
 * Only inspection sorts/copies samples; disabled execution never reads the clock. */
export class CameraPerformance {
  private enabled = false;
  private unavailable = false;
  private active: ActiveSample | undefined;
  private sequence = 0;
  private revisionValue = 0;
  private readonly rings = new Map<CameraPerformanceStage, {samples: CameraPerformanceSample[]; next: number}>();
  private cached: CameraPerformanceReading | undefined;
  constructor(private readonly now = () => performance.now()) {}
  get revision(): number { return this.revisionValue; }
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled && !this.unavailable) return;
    this.enabled = enabled;
    this.unavailable = false;
    this.active = undefined;
    this.rings.clear();
    this.changed();
  }
  private changed(): void { this.revisionValue++; this.cached = undefined; }
  private time(): number | undefined {
    try { const value = this.now(); if (Number.isFinite(value)) return value; }
    catch { /* Auxiliary measurement failure must not interrupt the World. */ }
    this.enabled = false;
    this.unavailable = true;
    this.active = undefined;
    this.rings.clear();
    this.changed();
    return undefined;
  }
  begin(stage: CameraPerformanceStage, simulationTick: number, configurationRevision: number, lifecycleGeneration: number): ActiveSample | undefined {
    if (!this.enabled || this.active) return undefined;
    const started = this.time();
    if (started === undefined) return undefined;
    const sample = {sampleId: ++this.sequence, stage, simulationTick, configurationRevision, lifecycleGeneration, started, queryMilliseconds: 0, queryCount: 0};
    this.active = sample;
    return sample;
  }
  end(sample: ActiveSample | undefined): void {
    if (!sample || !this.enabled) return;
    const ended = this.time();
    this.active = undefined;
    if (ended === undefined) return;
    const {started, ...values} = sample;
    const measured = {...values, durationMilliseconds: Math.max(0, ended - started)};
    let ring = this.rings.get(sample.stage);
    if (!ring) { ring = {samples: [], next: 0}; this.rings.set(sample.stage, ring); }
    if (ring.samples.length < CAPACITY) ring.samples.push(measured);
    else ring.samples[ring.next] = measured;
    ring.next = (ring.next + 1) % CAPACITY;
    this.changed();
  }
  beginQuery(): number | undefined {
    if (!this.active || !this.enabled) return undefined;
    this.active.queryCount++;
    return this.time();
  }
  endQuery(started: number | undefined): void {
    if (started === undefined || !this.active || !this.enabled) return;
    const ended = this.time();
    if (ended !== undefined && this.active) this.active.queryMilliseconds += Math.max(0, ended - started);
  }
  inspect(): CameraPerformanceReading | undefined {
    if (!this.enabled && !this.unavailable) return undefined;
    if (this.cached) return this.cached;
    const stages: Partial<Record<CameraPerformanceStage, NonNullable<CameraPerformanceReading['stages']['input']>>> = {};
    const samples: CameraPerformanceSample[] = [];
    for (const [stage, ring] of this.rings) {
      const sorted = ring.samples.map(sample => sample.durationMilliseconds).sort((a,b) => a-b);
      stages[stage] = {
        count: sorted.length,
        meanMilliseconds: sorted.reduce((sum,value) => sum+value,0)/sorted.length,
        p95Milliseconds: sorted[Math.ceil(sorted.length*.95)-1]!,
        maximumMilliseconds: sorted[sorted.length-1]!,
        queryCount: ring.samples.reduce((sum,sample) => sum+sample.queryCount,0),
        queryMilliseconds: ring.samples.reduce((sum,sample) => sum+sample.queryMilliseconds,0),
      };
      samples.push(...ring.samples);
    }
    this.cached = {status: this.unavailable ? 'unavailable' : 'measured', ...(this.unavailable ? {reason: 'clock-unavailable' as const} : {}), capacityPerStage: CAPACITY, stages, samples: samples.sort((a,b) => a.sampleId-b.sampleId)};
    return this.cached;
  }
}
