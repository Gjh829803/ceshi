export interface LateCodexOutput {
  relativePath: string;
  s3Uri: string;
}

export interface LateCodexRecoveryResult {
  jobId: string;
  taskId: string;
  sceneId: string;
  stage: "planner" | "builder" | "visual";
  status: "recovered";
  outputs: Array<{ localPath: string; s3Uri: string; size: number }>;
}

export function expectedLateCodexOutputPaths(
  sceneId: string,
  stage: "planner" | "builder" | "visual",
  options?: { visualTargetIds?: string[] },
): string[];

export function resolveLateCodexOutputUris(options: {
  sceneId: string;
  stage: "planner" | "builder" | "visual";
  taskId: string;
  outputUris: string[];
  visualTargetIds?: string[];
}): LateCodexOutput[];

export function recoverSucceededCodexJobOutputs(options: {
  jobId: string;
  repoRoot: string;
  sceneId: string;
  stage: "planner" | "builder" | "visual";
  visualTargetIds?: string[];
  config?: { baseUrl: string; token: string; userId: string };
  requestImplementation?: (...args: any[]) => Promise<any>;
  itemsImplementation?: (...args: any[]) => Promise<any>;
  downloadImplementation?: (
    s3Uri: string,
    localPath: string,
  ) => Promise<{ s3Uri: string; localPath: string; size: number }>;
}): Promise<LateCodexRecoveryResult>;
