declare const WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_BRAND_V1: unique symbol;

export type WorldReconstructionCaseArtifactRefV1 = string & Readonly<{
  [WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_BRAND_V1]: true;
}>;

const WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_PATTERN =
  /^artifact:\/\/world-reconstruction-case\/([a-z0-9]+(?:[.-][a-z0-9]+)*)\/case\.json$/;

function invalidCaseArtifactRef(): never {
  throw new TypeError(
    "WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_INVALID: expected artifact://world-reconstruction-case/<case-id>/case.json",
  );
}

export function parseWorldReconstructionCaseArtifactRefV1(
  value: unknown,
): WorldReconstructionCaseArtifactRefV1 {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    !WORLD_RECONSTRUCTION_CASE_ARTIFACT_REF_PATTERN.test(value)
  ) {
    return invalidCaseArtifactRef();
  }
  return value as WorldReconstructionCaseArtifactRefV1;
}
