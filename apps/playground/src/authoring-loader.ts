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

export interface AuthoringSceneLoadResult {
  ok: boolean;
  executionPlan?: ExecutionPlanV4;
  normalizedWorldIrHash?: string;
  executionPlanHash?: string;
  diagnostics: readonly (AuthoringDiagnostic | CompileDiagnostic)[];
}

export type AuthoringSourceFetcher = () => Promise<Response>;

export interface AuthoringSceneLoadOptionsV1 {
  subjectDefinitionRef?: string;
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
): AuthoringSpecV3 {
  const controlledEntityId = source.startup.controlledEntityId;
  const controlledSubject = source.nodes.find(
    (node) => node.kind === "subject" && node.id === controlledEntityId,
  );
  if (controlledSubject === undefined || controlledSubject.kind !== "subject") {
    return source;
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

  return {
    ...source,
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
      const current = node.placement.transform.positionMetersXYZ;
      if (
        motionProfile?.motionKernelRef ===
          "worldkit://motion-kernel/water-surface@1" &&
        water?.kind === "water" &&
        water.components.water.boundary.kind === "ellipse"
      ) {
        const [x, z] = water.components.water.boundary.centerMetersXZ;
        return {
          ...node,
          placement: {
            ...node.placement,
            transform: {
              ...node.placement.transform,
              positionMetersXYZ: [x, current[1], z],
            },
          },
        };
      }
      if (
        motionProfile?.motionKernelRef ===
        "worldkit://motion-kernel/unpowered-glide@1"
      ) {
        return {
          ...node,
          placement: {
            ...node.placement,
            transform: {
              ...node.placement.transform,
              positionMetersXYZ: [current[0], Math.max(12, current[1]), current[2]],
            },
          },
        };
      }
      return node;
    }),
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
  const source = options.subjectDefinitionRef === undefined
    ? parsed.value
    : applyCapabilityDemoContext(
        parsed.value as AuthoringSpecV3,
        options.subjectDefinitionRef,
      );
  const normalized = normalizeAuthoringSpec(source);
  if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
    return { ok: false, diagnostics: normalized.diagnostics };
  }
  const compiled = compileWorld({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (!compiled.ok || compiled.executionPlan === undefined || compiled.executionPlanHash === undefined) {
    return { ok: false, diagnostics: compiled.diagnostics };
  }
  return {
    ok: true,
    executionPlan: compiled.executionPlan,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    executionPlanHash: compiled.executionPlanHash,
    diagnostics: [],
  };
}
