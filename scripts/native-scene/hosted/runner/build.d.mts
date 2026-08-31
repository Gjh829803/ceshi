export interface BuildHostedNativeRunnerDistributionInputV1 {
  readonly repositoryRoot: string;
  readonly outputRoot: string;
}

export interface HostedNativeRunnerDistributionReportV1 {
  readonly runnerSourceModulePaths: readonly string[];
  readonly runnerExternalImportSpecifiers: readonly string[];
  readonly runnerExternalImportSpecifiersExact: readonly string[];
  readonly nativeRootSourceModulePaths: readonly string[];
  readonly nativeHostSourceModulePaths: readonly string[];
  readonly blockProfileSourceModulePaths: readonly string[];
}

export function buildHostedNativeRunnerDistributionV1(
  input: BuildHostedNativeRunnerDistributionInputV1,
): Promise<HostedNativeRunnerDistributionReportV1>;
