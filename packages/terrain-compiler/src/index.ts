export {
  compileTerrainHeightIntent,
  TERRAIN_HEIGHT_INTENT_COMPILER_VERSION,
  TERRAIN_HEIGHT_INTENT_NORMALIZATION_PROFILE,
  type CompileTerrainHeightIntentInput,
  type CompileTerrainHeightIntentResult,
  type TerrainHeightIntentCompileReport,
} from "./compile-terrain-height-intent";
export type { TerrainIntentDiagnostic } from "./constraints/terrain-constraint-types";
export type { TerrainConstraintDelta } from "./constraints/apply-terrain-constraints";
