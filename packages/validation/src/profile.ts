import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { sha256CanonicalJson } from "@whitebox-world/protocol";

import type { ValidationProfileV1 } from "./types";

export const OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1 = {
  kind: "worldkit-validation-profile",
  schemaVersion: 1,
  id: "outdoor-control-video-dev",
  resourceRef:
    "worldkit://validation-profile/outdoor-control-video-dev@1",
  version: "1.0.0",
  subjectKind: "control-capture-bundle",
  gateDefinitionsById: {
    "capture-bundle-integrity": {
      id: "capture-bundle-integrity",
      requirement: "blocking",
      metricDefinitionsById: {
        "capture-bundle-integrity-valid": {
          id: "capture-bundle-integrity-valid",
          kind: "boolean-assertion",
          isRequired: true,
          expectedValue: true,
          evaluatorProfileRef:
            "worldkit://validation-evaluator/control-capture-bundle-integrity@1",
        },
      },
    },
    "capture-completeness": {
      id: "capture-completeness",
      requirement: "blocking",
      metricDefinitionsById: {
        "capture-required-passes-valid": {
          id: "capture-required-passes-valid",
          kind: "boolean-assertion",
          isRequired: true,
          expectedValue: true,
          evaluatorProfileRef:
            "worldkit://validation-evaluator/control-capture-required-passes@1",
        },
        "capture-linear-depth-valid": {
          id: "capture-linear-depth-valid",
          kind: "boolean-assertion",
          isRequired: true,
          expectedValue: true,
          evaluatorProfileRef:
            "worldkit://validation-evaluator/control-capture-linear-depth@1",
        },
      },
    },
    "capture-ownership": {
      id: "capture-ownership",
      requirement: "blocking",
      metricDefinitionsById: {
        "capture-ownership-valid": {
          id: "capture-ownership-valid",
          kind: "boolean-assertion",
          isRequired: true,
          expectedValue: true,
          evaluatorProfileRef:
            "worldkit://validation-evaluator/control-capture-ownership@1",
        },
      },
    },
  },
} as const satisfies ValidationProfileV1;

export function hashValidationProfileV1(
  profile: ValidationProfileV1,
): Sha256HashV1 {
  return sha256CanonicalJson(profile) as Sha256HashV1;
}

export const OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_HASH_V1 =
  hashValidationProfileV1(
    OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
  );
