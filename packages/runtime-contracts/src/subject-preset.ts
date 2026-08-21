/**
 * Numeric tuning against one exact, content-addressed Registry profile.
 * Consumers must validate the closed value map against the locked profile.
 */
export interface NumericProfileOverrideV1 {
  baseResourceRef: string;
  baseContentHash: string;
  values: Readonly<Record<string, number>>;
}

export interface SubjectPresetResourceLockEntryV1 {
  resourceRef: string;
  resourceKind: string;
  version: number;
  contentHash: string;
}

export interface SubjectPresetClosureV1 {
  subjectDefinitionId: string;
  subjectDefinitionRef: string;
  subjectDefinitionContentHash: string;
  entries: readonly SubjectPresetResourceLockEntryV1[];
  contentHash: string;
}

export interface SubjectPublicDefaultV1 {
  subjectDefinitionId: string;
  subjectDefinitionRef: string;
  subjectDefinitionContentHash: string;
}

export interface SubjectPresetBaselineV1 {
  closure: SubjectPresetClosureV1;
  defaultCameraRigProfileRef: string;
  firstPersonCameraRigProfileRef?: string;
  publicDefault?: SubjectPublicDefaultV1;
}
