import type { SubjectDefinitionSummaryV1 } from "@whitebox-world/runtime-contracts";

export function subjectFriendlyNameV1(definition: SubjectDefinitionSummaryV1): string {
  if (definition.resourceRef ===
      "worldkit://subject-definition/humanoid.g-bot@2") return "G Bot 人形角色";
  if (definition.resourceRef ===
      "worldkit://subject-definition/humanoid.rigged-golden@2") return "Rigged Golden 人形角色";
  if (definition.resourceRef ===
      "worldkit://subject-definition/humanoid.third-person@1") return "人形胶囊测试代理";
  if (definition.semanticClassId.includes("quadruped")) return "四足角色白膜";
  if (definition.semanticClassId.includes("four-wheel")) return "四轮载具白膜";
  if (definition.semanticClassId.includes("ice-skimmer")) return "冰面滑行器白膜";
  if (definition.semanticClassId.includes("kayak")) return "皮划艇白膜";
  if (definition.semanticClassId.includes("paraglider")) return "滑翔伞白膜";
  return definition.displayName;
}
