import type {
  AppearanceBinding,
  Diagnostic,
  FeatureId,
  ResourceBudget,
  ResourceId,
  Vec2Tuple,
} from "@whitebox-world/contracts";

import {
  createCompoundLandmark,
  createPrimitiveLandmark,
  measureLandmark,
  type CompoundLandmarkSpec,
  type LandmarkPrimitiveSpec,
} from "./landmarks";
import { hashString, SeededNoise2D, SeededRandom, type Seed } from "./random";
import { validateParameters, type ParameterSchema } from "./schema";
import { shape, type Shape2D } from "./shapes";
import { createWaterSurface, type SemanticBindingDescriptor, type WaterSurfaceSpec } from "./surfaces";
import {
  Heightfield,
  HeightfieldGrid,
  type HeightfieldSpec,
  type HeightfieldGridSpec,
  type ShapedTerrainOperation,
  type TerrainAmountOperation,
  type TerrainBasinOperation,
  type TerrainFlattenOperation,
  type TerrainNoiseOptions,
  type RasterWorldBounds,
  type ScalarRasterField,
  type TerrainRasterOperation,
  type TerrainSurface,
  type TerrainSmoothOperation,
  validateScalarRasterField,
  isTerrainSurface,
} from "./terrain";

export type WorldResourceKind = "terrain" | "terrainPatch" | "surface" | "landmark" | "semantic" | "custom";

export interface ResourceMetrics {
  vertices: number;
  triangles: number;
  colliders: number;
}

export interface FeatureUsage extends ResourceMetrics {
  buildTimeMs: number;
}

export interface TrackedWorldResource<T = unknown> {
  id: ResourceId;
  kind: WorldResourceKind;
  ownerFeatureId: FeatureId;
  value: T;
  metrics: ResourceMetrics;
}

export interface TerrainPatchDescriptor {
  targetResourceId: ResourceId;
  operation: "noise" | "raster" | "raise" | "lower" | "flatten" | "basin" | "smooth";
}

export interface TerrainSemanticLayerDescriptor {
  kind: "terrain-semantic-layer";
  targetResourceId: ResourceId;
  id: string;
  semantic: string;
  color: `#${string}`;
  field: ScalarRasterField;
  bounds: RasterWorldBounds;
  priority: number;
}

export function isTerrainSemanticLayerDescriptor(
  value: unknown,
): value is TerrainSemanticLayerDescriptor {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "terrain-semantic-layer"
  );
}

export interface BuildContext {
  readonly featureId: FeatureId;
  readonly seed: number;
  readonly random: SeededRandom;
  readonly noise: SeededNoise2D;
  readonly shape: typeof shape;
  readonly terrain: {
    create(spec: HeightfieldSpec): ResourceId;
    createGrid(spec: HeightfieldGridSpec): ResourceId;
    noise(target: ResourceId, options: Omit<TerrainNoiseOptions, "seed"> & { seed?: Seed }): ResourceId;
    raster(target: ResourceId, options: TerrainRasterOperation): ResourceId;
    raise(target: ResourceId, options: TerrainAmountOperation): ResourceId;
    lower(target: ResourceId, options: TerrainAmountOperation): ResourceId;
    flatten(target: ResourceId, options: TerrainFlattenOperation): ResourceId;
    basin(target: ResourceId, options: TerrainBasinOperation): ResourceId;
    smooth(target: ResourceId, options?: TerrainSmoothOperation): ResourceId;
    sample(target: ResourceId, point: Vec2Tuple): number | undefined;
  };
  readonly surface: {
    water(spec: WaterSurfaceSpec): ResourceId;
  };
  readonly landmark: {
    primitive(spec: LandmarkPrimitiveSpec): ResourceId;
    compound(spec: CompoundLandmarkSpec): ResourceId;
  };
  readonly semantic: {
    bind(target: ResourceId, appearance: AppearanceBinding): ResourceId;
    terrainLayer(
      target: ResourceId,
      layer: Omit<TerrainSemanticLayerDescriptor, "kind" | "targetResourceId">,
    ): ResourceId;
  };
  readonly resources: {
    create<T>(kind: WorldResourceKind, value: T, metrics?: Partial<ResourceMetrics>): ResourceId;
    inspect(id: ResourceId): Omit<TrackedWorldResource, "value">;
  };
  readonly diagnostics: {
    add(diagnostic: Omit<Diagnostic, "featureId">): void;
  };
}

export interface WorldFeatureDefinition<P extends object = Record<string, unknown>, O = unknown> {
  type: string;
  version: number;
  schema: ParameterSchema;
  source?: string;
  sourceHash?: string;
  budget?: ResourceBudget;
  build(context: BuildContext, params: P): O;
}

export interface FeatureInstanceOptions<P extends object> {
  id: FeatureId;
  params: P;
  seed?: Seed;
  dependsOn?: readonly FeatureId[];
  source?: string;
  sourceHash?: string;
  budget?: ResourceBudget;
}

interface StoredFeatureInstance {
  id: FeatureId;
  definition: WorldFeatureDefinition<any, unknown>;
  params: object;
  seed: Seed;
  dependsOn: readonly FeatureId[];
  source?: string;
  sourceHash?: string;
  budget?: ResourceBudget;
}

export interface FeatureInspection<O = unknown> {
  id: FeatureId;
  type: string;
  version: number;
  status: "built" | "failed";
  params: object;
  seed: number;
  source?: string;
  sourceHash: string;
  dependsOn: readonly FeatureId[];
  resourceIds: readonly ResourceId[];
  usage: FeatureUsage;
  budget: ResourceBudget;
  diagnostics: readonly Diagnostic[];
  output?: O;
}

export interface FeatureRegistryOptions {
  budget?: ResourceBudget;
}

class BudgetExceededError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

function emptyUsage(): FeatureUsage {
  return { vertices: 0, triangles: 0, colliders: 0, buildTimeMs: 0 };
}

function mergeBudgets(...budgets: readonly (ResourceBudget | undefined)[]): ResourceBudget {
  const result: ResourceBudget = {};
  const keys = ["maxVertices", "maxTriangles", "maxColliders", "maxBuildTimeMs"] as const;
  for (const key of keys) {
    const values = budgets
      .map((budget) => budget?.[key])
      .filter((value): value is number => value !== undefined);
    if (values.length > 0) result[key] = Math.min(...values);
  }
  return result;
}

function sourceHashFor(instance: StoredFeatureInstance): string {
  if (instance.sourceHash) return instance.sourceHash;
  if (instance.definition.sourceHash) return instance.definition.sourceHash;
  const source = instance.source ?? instance.definition.source ?? "";
  const fingerprint = `${instance.definition.type}:${instance.definition.version}:${source}:${instance.definition.build.toString()}`;
  return hashString(fingerprint).toString(16).padStart(8, "0");
}

function attachFeature(diagnostic: Diagnostic, featureId: FeatureId): Diagnostic {
  return { ...diagnostic, featureId };
}

class InternalBuildContext implements BuildContext {
  readonly random: SeededRandom;
  readonly noise: SeededNoise2D;
  readonly shape = shape;
  readonly terrain: BuildContext["terrain"];
  readonly surface: BuildContext["surface"];
  readonly landmark: BuildContext["landmark"];
  readonly semantic: BuildContext["semantic"];
  readonly resources: BuildContext["resources"];
  readonly diagnostics: BuildContext["diagnostics"];

  private readonly counters = new Map<WorldResourceKind, number>();
  private readonly snapshots = new Map<ResourceId, TerrainSurface>();

  constructor(
    readonly featureId: FeatureId,
    readonly seed: number,
    private readonly store: Map<ResourceId, TrackedWorldResource>,
    private readonly usage: FeatureUsage,
    private readonly budget: ResourceBudget,
    private readonly diagnosticList: Diagnostic[],
  ) {
    this.random = new SeededRandom(seed);
    this.noise = new SeededNoise2D(seed);

    this.resources = {
      create: <T>(kind: WorldResourceKind, value: T, metrics: Partial<ResourceMetrics> = {}) =>
        this.createResource(kind, value, metrics),
      inspect: (id: ResourceId) => {
        const { value: _value, ...metadata } = this.assertResource(id);
        return metadata;
      },
    };

    this.terrain = {
      create: (spec) => {
        const heightfield = new Heightfield(spec);
        return this.createResource("terrain", heightfield, {
          vertices: heightfield.vertexCount,
          triangles: heightfield.triangleCount,
          colliders: 1,
        });
      },
      createGrid: (spec) => {
        const grid = new HeightfieldGrid(spec);
        return this.createResource("terrain", grid, {
          vertices: grid.vertexCount,
          triangles: grid.triangleCount,
          colliders: grid.tiles.length,
        });
      },
      noise: (target, options) => {
        const terrain = this.writableTerrain(target);
        const resolved: TerrainNoiseOptions = { ...options, seed: options.seed ?? this.seed };
        terrain.applyNoise(resolved);
        return this.trackTerrainPatch(target, "noise");
      },
      raster: (target, options) => {
        this.writableTerrain(target).applyRaster(options);
        return this.trackTerrainPatch(target, "raster");
      },
      raise: (target, options) => {
        this.writableTerrain(target).raise(options);
        return this.trackTerrainPatch(target, "raise");
      },
      lower: (target, options) => {
        this.writableTerrain(target).lower(options);
        return this.trackTerrainPatch(target, "lower");
      },
      flatten: (target, options) => {
        this.writableTerrain(target).flatten(options);
        return this.trackTerrainPatch(target, "flatten");
      },
      basin: (target, options) => {
        this.writableTerrain(target).carveBasin(options);
        return this.trackTerrainPatch(target, "basin");
      },
      smooth: (target, options = {}) => {
        this.writableTerrain(target).smooth(options);
        return this.trackTerrainPatch(target, "smooth");
      },
      sample: (target, point) => this.readTerrain(target).sampleHeight(point[0], point[1]),
    };

    this.surface = {
      water: (spec) => this.createResource("surface", createWaterSurface(spec), { vertices: 4, triangles: 2 }),
    };

    this.landmark = {
      primitive: (spec) => {
        const descriptor = createPrimitiveLandmark(spec);
        return this.createResource("landmark", descriptor, measureLandmark(descriptor));
      },
      compound: (spec) => {
        const descriptor = createCompoundLandmark(spec);
        return this.createResource("landmark", descriptor, measureLandmark(descriptor));
      },
    };

    this.semantic = {
      bind: (target, appearance) => {
        this.assertResource(target);
        const binding: SemanticBindingDescriptor = {
          targetResourceId: target,
          appearance: { ...appearance },
        };
        return this.createResource("semantic", binding);
      },
      terrainLayer: (target, layer) => {
        this.readTerrain(target);
        validateScalarRasterField(layer.field);
        const descriptor: TerrainSemanticLayerDescriptor = {
          kind: "terrain-semantic-layer",
          targetResourceId: target,
          ...layer,
        };
        if (!descriptor.id.trim() || !descriptor.semantic.trim()) {
          throw new Error("Terrain semantic layers require non-empty id and semantic values.");
        }
        if (!/^#[0-9a-f]{6}$/i.test(descriptor.color)) {
          throw new Error("Terrain semantic layer color must be a six-digit hex color.");
        }
        if (
          descriptor.bounds.center.some((value) => !Number.isFinite(value)) ||
          descriptor.bounds.size.some((value) => !Number.isFinite(value) || value <= 0) ||
          !Number.isFinite(descriptor.priority)
        ) {
          throw new Error("Terrain semantic layer requires finite world bounds, positive size, and priority.");
        }
        return this.createResource("semantic", descriptor);
      },
    };

    this.diagnostics = {
      add: (diagnostic) => this.diagnosticList.push({ ...diagnostic, featureId: this.featureId }),
    };
  }

  rollback(): void {
    for (const [resourceId, snapshot] of this.snapshots) {
      const current = this.store.get(resourceId);
      if (isTerrainSurface(current?.value)) current.value.copyFrom(snapshot);
    }
    for (const [resourceId, resource] of this.store) {
      if (resource.ownerFeatureId === this.featureId) this.store.delete(resourceId);
    }
  }

  private createResource<T>(
    kind: WorldResourceKind,
    value: T,
    metrics: Partial<ResourceMetrics> = {},
  ): ResourceId {
    const ordinal = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, ordinal);
    const id = `${this.featureId}:${kind}:${ordinal}`;
    const normalizedMetrics: ResourceMetrics = {
      vertices: metrics.vertices ?? 0,
      triangles: metrics.triangles ?? 0,
      colliders: metrics.colliders ?? 0,
    };
    this.usage.vertices += normalizedMetrics.vertices;
    this.usage.triangles += normalizedMetrics.triangles;
    this.usage.colliders += normalizedMetrics.colliders;
    this.assertBudget();
    this.store.set(id, {
      id,
      kind,
      ownerFeatureId: this.featureId,
      value,
      metrics: normalizedMetrics,
    });
    return id;
  }

  private assertBudget(): void {
    const checks = [
      ["maxVertices", this.usage.vertices, "vertices"],
      ["maxTriangles", this.usage.triangles, "triangles"],
      ["maxColliders", this.usage.colliders, "colliders"],
    ] as const;
    for (const [budgetKey, actual, label] of checks) {
      const maximum = this.budget[budgetKey];
      if (maximum !== undefined && actual > maximum) {
        throw new BudgetExceededError(
          `FEATURE_BUDGET_${label.toUpperCase()}`,
          `Feature ${this.featureId} created ${actual} ${label}; the budget allows ${maximum}.`,
        );
      }
    }
  }

  private assertResource(id: ResourceId): TrackedWorldResource {
    const resource = this.store.get(id);
    if (!resource) throw new Error(`World resource \"${id}\" does not exist.`);
    return resource;
  }

  private readTerrain(id: ResourceId): TerrainSurface {
    const resource = this.assertResource(id);
    if (resource.kind !== "terrain" || !isTerrainSurface(resource.value)) {
      throw new TypeError(`World resource \"${id}\" is not a heightfield terrain.`);
    }
    return resource.value;
  }

  private writableTerrain(id: ResourceId): TerrainSurface {
    const terrain = this.readTerrain(id);
    if (!this.snapshots.has(id)) this.snapshots.set(id, terrain.clone());
    return terrain;
  }

  private trackTerrainPatch(targetResourceId: ResourceId, operation: TerrainPatchDescriptor["operation"]): ResourceId {
    return this.createResource<TerrainPatchDescriptor>("terrainPatch", { targetResourceId, operation });
  }
}

export function defineWorldFeature<P extends object, O>(
  definition: WorldFeatureDefinition<P, O>,
): WorldFeatureDefinition<P, O> {
  if (!definition.type.trim()) throw new Error("World feature type cannot be empty.");
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new RangeError("World feature version must be a positive integer.");
  }
  return Object.freeze({ ...definition });
}

export class FeatureRegistry {
  private readonly definitions = new Map<string, WorldFeatureDefinition<any, unknown>>();
  private readonly instances = new Map<FeatureId, StoredFeatureInstance>();
  private resources = new Map<ResourceId, TrackedWorldResource>();
  private inspections = new Map<FeatureId, FeatureInspection>();
  private readonly hardBudget: ResourceBudget | undefined;

  constructor(options: FeatureRegistryOptions = {}) {
    this.hardBudget = options.budget;
  }

  register<P extends object, O>(definition: WorldFeatureDefinition<P, O>): this {
    const existing = this.definitions.get(definition.type);
    if (existing && existing.version !== definition.version) {
      throw new Error(
        `World feature type \"${definition.type}\" is already registered at version ${existing.version}.`,
      );
    }
    this.definitions.set(definition.type, definition as WorldFeatureDefinition<any, unknown>);
    return this;
  }

  instantiate<P extends object, O>(
    definition: WorldFeatureDefinition<P, O>,
    options: FeatureInstanceOptions<P>,
  ): FeatureInspection<O> {
    this.register(definition);
    return this.add<P, O>(definition.type, options);
  }

  add<P extends object, O = unknown>(type: string, options: FeatureInstanceOptions<P>): FeatureInspection<O> {
    const definition = this.definitions.get(type);
    if (!definition) throw new Error(`World feature type \"${type}\" is not registered.`);
    if (this.instances.has(options.id)) throw new Error(`Feature instance \"${options.id}\" already exists.`);
    const instance: StoredFeatureInstance = {
      id: options.id,
      definition,
      params: structuredClone(options.params),
      seed: options.seed ?? hashString(options.id),
      dependsOn: options.dependsOn ? [...options.dependsOn] : [],
    };
    if (options.source !== undefined) instance.source = options.source;
    if (options.sourceHash !== undefined) instance.sourceHash = options.sourceHash;
    if (options.budget !== undefined) instance.budget = { ...options.budget };
    this.instances.set(instance.id, instance);
    this.rebuildAll();
    return this.inspect<O>(instance.id);
  }

  update<P extends object>(
    id: FeatureId,
    patch: { params?: Partial<P>; seed?: Seed; dependsOn?: readonly FeatureId[] },
  ): FeatureInspection {
    const instance = this.instances.get(id);
    if (!instance) throw new Error(`Feature instance \"${id}\" does not exist.`);
    if (patch.params) instance.params = { ...instance.params, ...structuredClone(patch.params) };
    if (patch.seed !== undefined) instance.seed = patch.seed;
    if (patch.dependsOn !== undefined) instance.dependsOn = [...patch.dependsOn];
    this.rebuildAll();
    return this.inspect(id);
  }

  rebuild(id: FeatureId): FeatureInspection {
    if (!this.instances.has(id)) throw new Error(`Feature instance \"${id}\" does not exist.`);
    this.rebuildAll();
    return this.inspect(id);
  }

  remove(id: FeatureId): boolean {
    const removed = this.instances.delete(id);
    if (removed) this.rebuildAll();
    return removed;
  }

  inspect<O = unknown>(id: FeatureId): FeatureInspection<O> {
    const inspection = this.inspections.get(id);
    if (!inspection) throw new Error(`Feature instance \"${id}\" does not exist.`);
    return inspection as FeatureInspection<O>;
  }

  list(): readonly FeatureInspection[] {
    return [...this.inspections.values()];
  }

  getResource<T = unknown>(id: ResourceId): TrackedWorldResource<T> | undefined {
    return this.resources.get(id) as TrackedWorldResource<T> | undefined;
  }

  listResources(ownerFeatureId?: FeatureId): readonly TrackedWorldResource[] {
    const values = [...this.resources.values()];
    return ownerFeatureId ? values.filter((resource) => resource.ownerFeatureId === ownerFeatureId) : values;
  }

  private rebuildAll(): void {
    this.resources = new Map();
    this.inspections = new Map();
    const order: FeatureId[] = [];
    const states = new Map<FeatureId, "visiting" | "visited">();
    const graphDiagnostics = new Map<FeatureId, Diagnostic[]>();

    const addGraphDiagnostic = (id: FeatureId, diagnostic: Diagnostic): void => {
      const diagnostics = graphDiagnostics.get(id) ?? [];
      diagnostics.push(attachFeature(diagnostic, id));
      graphDiagnostics.set(id, diagnostics);
    };

    const visit = (id: FeatureId): void => {
      const state = states.get(id);
      if (state === "visited") return;
      if (state === "visiting") {
        addGraphDiagnostic(id, {
          severity: "error",
          code: "FEATURE_DEPENDENCY_CYCLE",
          message: `Feature dependency cycle includes \"${id}\".`,
        });
        return;
      }
      const instance = this.instances.get(id);
      if (!instance) return;
      states.set(id, "visiting");
      for (const dependencyId of instance.dependsOn) {
        if (!this.instances.has(dependencyId)) {
          addGraphDiagnostic(id, {
            severity: "error",
            code: "FEATURE_DEPENDENCY_MISSING",
            message: `Feature dependency \"${dependencyId}\" does not exist.`,
          });
          continue;
        }
        if (states.get(dependencyId) === "visiting") {
          addGraphDiagnostic(id, {
            severity: "error",
            code: "FEATURE_DEPENDENCY_CYCLE",
            message: `Feature dependency cycle connects \"${id}\" and \"${dependencyId}\".`,
          });
        } else {
          visit(dependencyId);
        }
      }
      states.set(id, "visited");
      order.push(id);
    };

    for (const id of this.instances.keys()) visit(id);

    for (const id of order) {
      const instance = this.instances.get(id);
      if (!instance) continue;
      const diagnostics = [...(graphDiagnostics.get(id) ?? [])];
      const failedDependency = instance.dependsOn.find(
        (dependencyId) => this.inspections.get(dependencyId)?.status !== "built",
      );
      if (failedDependency) {
        diagnostics.push({
          severity: "error",
          code: "FEATURE_DEPENDENCY_FAILED",
          message: `Feature dependency \"${failedDependency}\" did not build successfully.`,
          featureId: id,
        });
      }
      const validated = validateParameters(instance.definition.schema, instance.params);
      diagnostics.push(...validated.diagnostics.map((diagnostic) => attachFeature(diagnostic, id)));
      const seed = typeof instance.seed === "number" ? instance.seed >>> 0 : hashString(instance.seed);
      const budget = mergeBudgets(this.hardBudget, instance.definition.budget, instance.budget);
      const usage = emptyUsage();
      const source = instance.source ?? instance.definition.source;
      const sourceHash = sourceHashFor(instance);

      if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        const failed: FeatureInspection = {
          id,
          type: instance.definition.type,
          version: instance.definition.version,
          status: "failed",
          params: validated.value,
          seed,
          sourceHash,
          dependsOn: [...instance.dependsOn],
          resourceIds: [],
          usage,
          budget,
          diagnostics,
        };
        if (source !== undefined) failed.source = source;
        this.inspections.set(id, failed);
        continue;
      }

      const context = new InternalBuildContext(id, seed, this.resources, usage, budget, diagnostics);
      const startedAt = performance.now();
      let output: unknown;
      try {
        output = instance.definition.build(context, validated.value);
        usage.buildTimeMs = performance.now() - startedAt;
        if (budget.maxBuildTimeMs !== undefined && usage.buildTimeMs > budget.maxBuildTimeMs) {
          throw new BudgetExceededError(
            "FEATURE_BUDGET_BUILD_TIME",
            `Feature ${id} took ${usage.buildTimeMs.toFixed(2)}ms; the budget allows ${budget.maxBuildTimeMs}ms.`,
          );
        }
      } catch (error) {
        usage.buildTimeMs = performance.now() - startedAt;
        context.rollback();
        diagnostics.push({
          severity: "error",
          code: error instanceof BudgetExceededError ? error.code : "FEATURE_BUILD_FAILED",
          message: error instanceof Error ? error.message : String(error),
          featureId: id,
          suggestions:
            error instanceof BudgetExceededError
              ? ["Reduce terrain resolution or landmark count.", "Use lower-detail compound geometry."]
              : ["Inspect the feature parameters and build function."],
        });
      }

      const resourceIds = [...this.resources.values()]
        .filter((resource) => resource.ownerFeatureId === id)
        .map((resource) => resource.id);
      const inspection: FeatureInspection = {
        id,
        type: instance.definition.type,
        version: instance.definition.version,
        status: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "failed" : "built",
        params: validated.value,
        seed,
        sourceHash,
        dependsOn: [...instance.dependsOn],
        resourceIds,
        usage,
        budget,
        diagnostics,
      };
      if (source !== undefined) inspection.source = source;
      if (output !== undefined && inspection.status === "built") inspection.output = output;
      this.inspections.set(id, inspection);
    }
  }
}
