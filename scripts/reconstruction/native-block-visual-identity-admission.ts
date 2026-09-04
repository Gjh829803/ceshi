import {
  parseNativeBlockAuthoringManifestV1,
  type NativeBlockAuthoringManifestV1,
} from "@whitebox-world/native-babylon-block-profile";
import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  parseVisualIdentityPaletteV1,
} from "../scenes/visual-identity-palette.js";

export const NATIVE_BLOCK_VISUAL_IDENTITY_BINDING_DIAGNOSTIC_CODE_V1 =
  "WORLDKIT_NATIVE_BLOCK_VISUAL_IDENTITY_BINDING_INVALID" as const;

export type NativeBlockVisualIdentityBindingFailureReasonV1 =
  | "case-targets-invalid"
  | "manifest-invalid"
  | "manifest-case-bijection-mismatch"
  | "target-group-mismatch"
  | "case-visual-target-ref-invalid"
  | "palette-invalid"
  | "palette-target-missing"
  | "semantic-class-mismatch"
  | "identity-color-mismatch";

export interface NativeBlockVisualIdentityBindingDiagnosticV1 {
  readonly code:
    typeof NATIVE_BLOCK_VISUAL_IDENTITY_BINDING_DIAGNOSTIC_CODE_V1;
  readonly reason: NativeBlockVisualIdentityBindingFailureReasonV1;
  readonly message: string;
  readonly acceptanceTargetRef?: string;
  readonly visualTargetId?: string;
  readonly visualGroupId?: string;
  readonly expectedSemanticClassId?: string;
  readonly actualSemanticClassId?: string;
  readonly expectedIdentityColorHex?: `#${string}`;
  readonly actualIdentityColorHex?: `#${string}`;
}

export interface NativeBlockVisualIdentityBindingV1 {
  readonly acceptanceTargetRef: string;
  readonly visualTargetId: string;
  readonly visualGroupId: string;
  readonly semanticClassId: string;
  readonly identityColorHex: `#${string}`;
}

export type NativeBlockVisualIdentityAdmissionResultV1 =
  | Readonly<{
      kind: "native-block-visual-identity-admission";
      schemaVersion: 1;
      outcome: "passed";
      bindings: readonly NativeBlockVisualIdentityBindingV1[];
      diagnostics: readonly [];
    }>
  | NativeBlockVisualIdentityAdmissionRejectionV1;

export interface NativeBlockVisualIdentityAdmissionRejectionV1 {
  readonly kind: "native-block-visual-identity-admission";
  readonly schemaVersion: 1;
  readonly outcome: "rejected";
  readonly bindings: readonly [];
  readonly diagnostics: readonly NativeBlockVisualIdentityBindingDiagnosticV1[];
}

interface CaseSemanticSilhouetteTargetV1 {
  readonly acceptanceTargetRef: string;
  readonly visualGroupId: string;
}

const VISUAL_TARGET_ACCEPTANCE_REF =
  /^worldkit:\/\/acceptance-target\/(visual-target-[1-5])@1$/;
const VISUAL_TARGET_ACCEPTANCE_REF_PREFIX =
  "worldkit://acceptance-target/visual-target-";

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rejected(
  reason: NativeBlockVisualIdentityBindingFailureReasonV1,
  message: string,
  details: Omit<
    NativeBlockVisualIdentityBindingDiagnosticV1,
    "code" | "reason" | "message"
  > = {},
): NativeBlockVisualIdentityAdmissionRejectionV1 {
  return Object.freeze({
    kind: "native-block-visual-identity-admission",
    schemaVersion: 1,
    outcome: "rejected",
    bindings: Object.freeze([] as const),
    diagnostics: Object.freeze([Object.freeze({
      code: NATIVE_BLOCK_VISUAL_IDENTITY_BINDING_DIAGNOSTIC_CODE_V1,
      reason,
      message,
      ...details,
    })]),
  });
}

export function admitNativeBlockVisualIdentityBindingsV1(input: Readonly<{
  sceneId: string;
  sceneBriefSemanticHash: Sha256HashV1;
  semanticSilhouetteTargets: readonly CaseSemanticSilhouetteTargetV1[];
  visualIdentityPalette: unknown;
  authoringManifest: unknown;
}>): NativeBlockVisualIdentityAdmissionResultV1 {
  const caseTargetRefs = input.semanticSilhouetteTargets.map(
    ({ acceptanceTargetRef }) => acceptanceTargetRef,
  );
  const caseGroupIds = input.semanticSilhouetteTargets.map(
    ({ visualGroupId }) => visualGroupId,
  );
  if (
    input.semanticSilhouetteTargets.length === 0 ||
    caseTargetRefs.some((value) => typeof value !== "string" || value.length === 0) ||
    caseGroupIds.some((value) => typeof value !== "string" || value.length === 0) ||
    new Set(caseTargetRefs).size !== caseTargetRefs.length ||
    new Set(caseGroupIds).size !== caseGroupIds.length
  ) {
    return rejected(
      "case-targets-invalid",
      "Case semantic silhouette target identities must be non-empty and unique.",
    );
  }
  let authoringManifest: NativeBlockAuthoringManifestV1;
  try {
    authoringManifest = parseNativeBlockAuthoringManifestV1(
      input.authoringManifest,
    );
  } catch (error) {
    return rejected(
      "manifest-invalid",
      error instanceof Error ? error.message : String(error),
    );
  }
  let palette;
  try {
    palette = parseVisualIdentityPaletteV1(input.visualIdentityPalette, {
      sceneSourceKind: "babylon-native",
      sceneId: input.sceneId,
      sceneBriefHash: input.sceneBriefSemanticHash,
    });
  } catch (error) {
    return rejected(
      "palette-invalid",
      error instanceof Error ? error.message : String(error),
    );
  }
  const sortedCaseTargetRefs = [...caseTargetRefs].sort(stableCompare);
  const sortedManifestTargetRefs = authoringManifest.visualGroups
    .map(({ acceptanceTargetRef }) => acceptanceTargetRef)
    .sort(stableCompare);
  if (
    sortedCaseTargetRefs.length !== sortedManifestTargetRefs.length ||
    sortedCaseTargetRefs.some((targetRef, index) =>
      targetRef !== sortedManifestTargetRefs[index]
    )
  ) {
    return rejected(
      "manifest-case-bijection-mismatch",
      "Manifest must bind every Case semantic silhouette target exactly once.",
    );
  }
  const manifestByTargetRef = new Map(
    authoringManifest.visualGroups.map((group) =>
      [group.acceptanceTargetRef, group] as const),
  );
  const paletteByVisualTargetId = new Map(
    palette.targets.map((target) => [target.visualTargetId, target] as const),
  );
  const bindings: NativeBlockVisualIdentityBindingV1[] = [];
  for (const caseTarget of input.semanticSilhouetteTargets) {
    const manifestGroup = manifestByTargetRef.get(
      caseTarget.acceptanceTargetRef,
    )!;
    if (manifestGroup.visualGroupId !== caseTarget.visualGroupId) {
      return rejected(
        "target-group-mismatch",
        "Manifest target-to-group mapping must match the Case semantic silhouette mapping.",
        {
          acceptanceTargetRef: caseTarget.acceptanceTargetRef,
          visualGroupId: manifestGroup.visualGroupId,
        },
      );
    }
    const match = VISUAL_TARGET_ACCEPTANCE_REF.exec(
      caseTarget.acceptanceTargetRef,
    );
    if (match === null) {
      if (caseTarget.acceptanceTargetRef.startsWith(
        VISUAL_TARGET_ACCEPTANCE_REF_PREFIX,
      )) {
        return rejected(
          "case-visual-target-ref-invalid",
          "Case visual-target acceptance ref must identify visual-target-1 through visual-target-5 at version 1.",
          { acceptanceTargetRef: caseTarget.acceptanceTargetRef },
        );
      }
      continue;
    }
    const visualTargetId = match[1]!;
    const paletteTarget = paletteByVisualTargetId.get(visualTargetId);
    if (paletteTarget === undefined) {
      return rejected(
        "palette-target-missing",
        `Frozen palette does not contain Case target '${visualTargetId}'.`,
        {
          acceptanceTargetRef: caseTarget.acceptanceTargetRef,
          visualTargetId,
          visualGroupId: manifestGroup.visualGroupId,
        },
      );
    }
    if (manifestGroup.semanticClassId !== paletteTarget.semanticClassId) {
      return rejected(
        "semantic-class-mismatch",
        `Manifest semantic class for '${visualTargetId}' differs from the frozen palette.`,
        {
          acceptanceTargetRef: caseTarget.acceptanceTargetRef,
          visualTargetId,
          visualGroupId: manifestGroup.visualGroupId,
          expectedSemanticClassId: paletteTarget.semanticClassId,
          actualSemanticClassId: manifestGroup.semanticClassId,
        },
      );
    }
    if (manifestGroup.identityColorHex !== paletteTarget.identityColor) {
      return rejected(
        "identity-color-mismatch",
        `Manifest identity color for '${visualTargetId}' differs from the frozen palette.`,
        {
          acceptanceTargetRef: caseTarget.acceptanceTargetRef,
          visualTargetId,
          visualGroupId: manifestGroup.visualGroupId,
          expectedIdentityColorHex: paletteTarget.identityColor,
          actualIdentityColorHex: manifestGroup.identityColorHex,
        },
      );
    }
    bindings.push(Object.freeze({
      acceptanceTargetRef: caseTarget.acceptanceTargetRef,
      visualTargetId,
      visualGroupId: manifestGroup.visualGroupId,
      semanticClassId: manifestGroup.semanticClassId,
      identityColorHex: manifestGroup.identityColorHex,
    }));
  }
  return Object.freeze({
    kind: "native-block-visual-identity-admission",
    schemaVersion: 1,
    outcome: "passed",
    bindings: Object.freeze(bindings.sort((left, right) =>
      stableCompare(left.visualTargetId, right.visualTargetId))),
    diagnostics: Object.freeze([] as const),
  });
}
