import { orderBy } from "lodash-es";

import type {
  FeatureInspection as RegistryFeatureInspection,
  FeatureRegistry,
  WorldResourceKind,
} from "@whitebox-world/world";

import type { FeatureInspection } from "./playground-world.js";

function toPlaygroundResourceKind(
  kind: WorldResourceKind,
): FeatureInspection["resources"][number]["kind"] {
  if (kind === "terrain" || kind === "landmark") return "mesh";
  if (kind === "terrainPatch") return "collider";
  if (kind === "custom") return "semantic";
  return kind;
}

export function toPlaygroundFeatureInspection(
  registry: FeatureRegistry,
  inspection: RegistryFeatureInspection,
): FeatureInspection {
  const resources = orderBy(
    registry.listResources(inspection.id),
    [(resource) => resource.id],
    ["asc"],
  ).map((resource) => ({
    id: resource.id,
    kind: toPlaygroundResourceKind(resource.kind),
    ...(resource.metrics.vertices > 0
      ? { vertices: resource.metrics.vertices }
      : {}),
  }));
  const diagnostics = orderBy(
    inspection.diagnostics,
    [
      (diagnostic) => diagnostic.code,
      (diagnostic) => diagnostic.message,
      (diagnostic) => diagnostic.severity,
    ],
    ["asc", "asc", "asc"],
  ).map(({ severity, code, message }) => ({ severity, code, message }));

  return {
    id: inspection.id,
    type: inspection.type,
    version: inspection.version,
    seed: inspection.seed,
    status: inspection.status === "built" ? "ready" : "error",
    parameters: inspection.params as Readonly<Record<string, unknown>>,
    resources,
    diagnostics,
  };
}

export function inspectPlaygroundFeatures(
  registry: FeatureRegistry,
): readonly FeatureInspection[] {
  return orderBy(
    registry.list(),
    [(inspection) => inspection.id],
    ["asc"],
  ).map((inspection) => toPlaygroundFeatureInspection(registry, inspection));
}
