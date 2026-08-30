import type { AuthoringSpecV4 } from "@whitebox-world/authoring";
import type {
  BlockWorldCheckReportV2,
  BlockWorldDiagnosticV2,
  CheckBlockWorldInputV2,
} from "@whitebox-world/block-world";
import type {
  CanonicalSceneExecutionPlanV1,
  SceneBriefImplementationMapDraftV1,
  WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import type { CompileDiagnostic } from "@whitebox-world/compiler";
import type { GameplayBootstrapV1 } from "@whitebox-world/gameplay-contracts";

export type BlockWorldCompilerDiagnosticV2 =
  | BlockWorldDiagnosticV2
  | Readonly<{
      severity: "error";
      code: "BLOCK_WORLD_VISUAL_TARGET_CONFLICT" | "BLOCK_WORLD_INTERNAL_COMPILE_FAILED";
      instancePath: string;
      message: string;
      details?: Readonly<Record<string, unknown>>;
    }>
  | CompileDiagnostic;

export interface CompileBlockWorldInputV2 extends CheckBlockWorldInputV2 {}

export type CompileBlockWorldResultV2 =
  | Readonly<{
      ok: false;
      diagnostics: readonly BlockWorldCompilerDiagnosticV2[];
      checkReport: BlockWorldCheckReportV2;
    }>
  | Readonly<{
      ok: true;
      diagnostics: readonly [];
      checkReport: BlockWorldCheckReportV2;
      authoringSpec: AuthoringSpecV4;
      gameplayBootstrap: GameplayBootstrapV1;
      implementationMapDraft: SceneBriefImplementationMapDraftV1;
      canonicalSceneExecutionPlan: CanonicalSceneExecutionPlanV1;
      worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
    }>;
