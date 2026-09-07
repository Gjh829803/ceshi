export function hashLocalTaskArguments(args: readonly string[]): string;
export function retainLocalTaskDelivery(input: {
  readonly stagingRoot: string;
  readonly evidenceRoot: string;
  readonly childExitCode: 0;
  readonly requestId: string;
  readonly taskId: string;
  readonly argumentsHash: string;
  readonly outputs: readonly { readonly remotePath: string }[];
}): Promise<void>;
export function readLocalTaskDelivery(input: {
  readonly evidenceRoot: string;
  readonly requestId: string;
  readonly taskId: string;
  readonly argumentsHash: string;
  readonly outputPaths: readonly string[];
}): Promise<readonly { readonly path: string; readonly bytes: Buffer }[] | null>;
