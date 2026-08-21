import {
  normalizeAuthoringSpec,
  parseAuthoringSpecJson,
  type AuthoringDiagnostic,
  type AuthoringSpecV3,
} from "@whitebox-world/authoring";
import { compileWorld } from "@whitebox-world/compiler";
import { builtInSubjectResourceRegistry } from "@whitebox-world/subject-registry";
import type {
  CompileDiagnostic,
  ExecutionPlanV4,
} from "@whitebox-world/runtime-contracts";

type CapabilityDemoResourceBudgetV1 = Readonly<
  AuthoringSpecV3["world"]["resourceBudget"]
>;

type CapabilityDemoPositionMetersXYZV1 = readonly [number, number, number];

export type CapabilityDemoHostOverlayChangeV1 =
  | Readonly<{
      type: "subject-definition-replaced";
      subjectEntityId: string;
      beforeSubjectDefinitionRef: string;
      afterSubjectDefinitionRef: string;
    }>
  | Readonly<{
      type: "resource-budget-changed";
      beforeResourceBudget: CapabilityDemoResourceBudgetV1;
      afterResourceBudget: CapabilityDemoResourceBudgetV1;
    }>
  | Readonly<{
      type: "spawn-position-changed";
      spawnAnchorEntityId: string;
      beforePositionMetersXYZ: CapabilityDemoPositionMetersXYZV1;
      afterPositionMetersXYZ: CapabilityDemoPositionMetersXYZV1;
    }>;

export interface CapabilityDemoHostOverlayV1 {
  readonly schemaVersion: 1;
  readonly kind: "capability-demo";
  readonly id: "capability-demo";
  readonly subjectDefinitionRef: string;
  readonly changes: readonly CapabilityDemoHostOverlayChangeV1[];
}

export interface AuthoringSceneLoadResult {
  ok: boolean;
  executionPlan?: ExecutionPlanV4;
  normalizedWorldIrHash?: string;
  executionPlanHash?: string;
  diagnostics: readonly (AuthoringDiagnostic | CompileDiagnostic)[];
  hostOverlay?: CapabilityDemoHostOverlayV1;
}

export type AuthoringSourceFetcher = () => Promise<Response>;

export interface AuthoringSceneLoadOptionsV1 {
  subjectDefinitionRef?: string;
}

const CAPABILITY_PLAYGROUND_MINIMUM_RESOURCE_BUDGET = Object.freeze({
  maxVertices: 200_000,
  maxTriangles: 300_000,
  maxColliders: 128,
});

function frozenResourceBudget(
  resourceBudget: AuthoringSpecV3["world"]["resourceBudget"],
): CapabilityDemoResourceBudgetV1 {
  return Object.freeze({ ...resourceBudget });
}

function frozenPositionMetersXYZ(
  positionMetersXYZ: CapabilityDemoPositionMetersXYZV1,
): CapabilityDemoPositionMetersXYZV1 {
  return Object.freeze([
    ...positionMetersXYZ,
  ]) as CapabilityDemoPositionMetersXYZV1;
}

function sourceDiagnostic(message: string, details?: Readonly<Record<string, unknown>>): AuthoringSceneLoadResult {
  return {
    ok: false,
    diagnostics: [
      {
        severity: "error",
        code: "AUTHORING_SOURCE_UNAVAILABLE",
        instancePath: "",
        message,
        ...(details === undefined ? {} : { details }),
      },
    ],
  };
}

function applyCapabilityDemoContext(
  source: AuthoringSpecV3,
  subjectDefinitionRef: string,
): Readonly<{
  source: AuthoringSpecV3;
  hostOverlay?: CapabilityDemoHostOverlayV1;
}> {
  const controlledEntityId = source.startup.controlledEntityId;
  const controlledSubject = source.nodes.find(
    (node) => node.kind === "subject" && node.id === controlledEntityId,
  );
  if (controlledSubject === undefined || controlledSubject.kind !== "subject") {
    return { source };
  }
  const definition = builtInSubjectResourceRegistry.resolveSubjectDefinition(
    subjectDefinitionRef,
  );
  const motionProfile =
    definition !== undefined && "schemaVersion" in definition
      ? builtInSubjectResourceRegistry.resolveMotionProfile(
          definition.profiles.motion.defaultMotionProfileRef,
        )
      : undefined;
  const spawnAnchorId = controlledSubject.spawnAnchorEntityId;
  const water = source.nodes.find((node) => node.kind === "water");
  const spawnAnchor = source.nodes.find(
    (node) => node.kind === "anchor" && node.id === spawnAnchorId,
  );
  const beforeResourceBudget = source.world.resourceBudget;
  const afterResourceBudget = {
    maxVertices: Math.max(
      beforeResourceBudget.maxVertices,
      CAPABILITY_PLAYGROUND_MINIMUM_RESOURCE_BUDGET.maxVertices,
    ),
    maxTriangles: Math.max(
      beforeResourceBudget.maxTriangles,
      CAPABILITY_PLAYGROUND_MINIMUM_RESOURCE_BUDGET.maxTriangles,
    ),
    maxColliders: Math.max(
      beforeResourceBudget.maxColliders,
      CAPABILITY_PLAYGROUND_MINIMUM_RESOURCE_BUDGET.maxColliders,
    ),
  };
  const beforePositionMetersXYZ =
    spawnAnchor?.kind === "anchor" && spawnAnchor.placement.kind === "fixed"
    ? spawnAnchor.placement.transform.positionMetersXYZ
    : undefined;
  let afterPositionMetersXYZ: CapabilityDemoPositionMetersXYZV1 | undefined;
  if (
    beforePositionMetersXYZ !== undefined &&
    motionProfile?.motionKernelRef ===
      "worldkit://motion-kernel/water-surface@1" &&
    water?.kind === "water" &&
    water.components.water.boundary.kind === "ellipse"
  ) {
    const [x, z] = water.components.water.boundary.centerMetersXZ;
    afterPositionMetersXYZ = [x, beforePositionMetersXYZ[1], z];
  } else if (
    beforePositionMetersXYZ !== undefined &&
    motionProfile?.motionKernelRef ===
      "worldkit://motion-kernel/unpowered-glide@1"
  ) {
    afterPositionMetersXYZ = [
      beforePositionMetersXYZ[0],
      Math.max(12, beforePositionMetersXYZ[1]),
      beforePositionMetersXYZ[2],
    ];
  }

  const changes: CapabilityDemoHostOverlayChangeV1[] = [
    Object.freeze({
      type: "subject-definition-replaced",
      subjectEntityId: controlledEntityId,
      beforeSubjectDefinitionRef: controlledSubject.subjectDefinitionRef,
      afterSubjectDefinitionRef: subjectDefinitionRef,
    }),
  ];
  if (
    beforeResourceBudget.maxVertices !== afterResourceBudget.maxVertices ||
    beforeResourceBudget.maxTriangles !== afterResourceBudget.maxTriangles ||
    beforeResourceBudget.maxColliders !== afterResourceBudget.maxColliders
  ) {
    changes.push(
      Object.freeze({
        type: "resource-budget-changed",
        beforeResourceBudget: frozenResourceBudget(beforeResourceBudget),
        afterResourceBudget: frozenResourceBudget(afterResourceBudget),
      }),
    );
  }
  if (
    beforePositionMetersXYZ !== undefined &&
    afterPositionMetersXYZ !== undefined &&
    spawnAnchor?.kind === "anchor" &&
    spawnAnchor.placement.kind === "fixed" &&
    beforePositionMetersXYZ.some(
      (coordinate, index) => coordinate !== afterPositionMetersXYZ[index],
    )
  ) {
    changes.push(
      Object.freeze({
        type: "spawn-position-changed",
        spawnAnchorEntityId: spawnAnchor.id,
        beforePositionMetersXYZ: frozenPositionMetersXYZ(
          beforePositionMetersXYZ,
        ),
        afterPositionMetersXYZ: frozenPositionMetersXYZ(
          afterPositionMetersXYZ,
        ),
      }),
    );
  }
  const hostOverlay = Object.freeze({
    schemaVersion: 1,
    kind: "capability-demo",
    id: "capability-demo",
    subjectDefinitionRef,
    changes: Object.freeze(changes),
  } satisfies CapabilityDemoHostOverlayV1);

  return {
    hostOverlay,
    source: {
      ...source,
      // Subject Package selection is an explicit Playground demo overlay. Its
      // host world must be large enough for every registered Phase-1 package;
      // otherwise a valid art asset (notably the 49,112-triangle G Bot) is
      // rejected by an unrelated small-world example budget before Runtime.
      world: {
        ...source.world,
        resourceBudget: afterResourceBudget,
      },
      nodes: source.nodes.map((node) => {
        if (node.kind === "subject" && node.id === controlledEntityId) {
          return { ...node, subjectDefinitionRef };
        }
        if (
          node.kind !== "anchor" ||
          node.id !== spawnAnchorId ||
          node.placement.kind !== "fixed"
        ) {
          return node;
        }
        if (afterPositionMetersXYZ !== undefined) {
          return {
            ...node,
            placement: {
              ...node.placement,
              transform: {
                ...node.placement.transform,
                positionMetersXYZ: afterPositionMetersXYZ,
              },
            },
          };
        }
        return node;
      }),
    },
  };
}

export async function loadAuthoringScene(
  fetchSource: AuthoringSourceFetcher = () => fetch("/__worldkit/authoring-spec", { cache: "no-store" }),
  options: AuthoringSceneLoadOptionsV1 = {},
): Promise<AuthoringSceneLoadResult> {
  let response: Response;
  try {
    response = await fetchSource();
  } catch (error) {
    return sourceDiagnostic("Unable to fetch the configured AuthoringSpec.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!response.ok) {
    return sourceDiagnostic(`AuthoringSpec source returned HTTP ${response.status}.`, {
      status: response.status,
    });
  }

  let sourceText: string;
  try {
    sourceText = await response.text();
  } catch (error) {
    return sourceDiagnostic("Unable to read the configured AuthoringSpec response.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const parsed = parseAuthoringSpecJson(sourceText);
  if (!parsed.ok || parsed.value === undefined) return { ok: false, diagnostics: parsed.diagnostics };
  const overlayResult = options.subjectDefinitionRef === undefined
    ? { source: parsed.value }
    : applyCapabilityDemoContext(
        parsed.value as AuthoringSpecV3,
        options.subjectDefinitionRef,
      );
  const { source, hostOverlay } = overlayResult;
  const normalized = normalizeAuthoringSpec(source);
  if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
    return {
      ok: false,
      diagnostics: normalized.diagnostics,
      ...(hostOverlay === undefined ? {} : { hostOverlay }),
    };
  }
  const compiled = compileWorld({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (!compiled.ok || compiled.executionPlan === undefined || compiled.executionPlanHash === undefined) {
    return {
      ok: false,
      diagnostics: compiled.diagnostics,
      ...(hostOverlay === undefined ? {} : { hostOverlay }),
    };
  }
  return {
    ok: true,
    executionPlan: compiled.executionPlan,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    executionPlanHash: compiled.executionPlanHash,
    diagnostics: [],
    ...(hostOverlay === undefined ? {} : { hostOverlay }),
  };
}
