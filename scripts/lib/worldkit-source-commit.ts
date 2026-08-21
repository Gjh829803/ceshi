import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { isNil } from "lodash-es";

const execFile = promisify(execFileCallback);

export const FORGED_ZERO_SOURCE_COMMIT = "0".repeat(40);
export const SOURCE_COMMIT_ENDPOINT = "/__worldkit/source-commit";
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;

export function parseTrustedSourceCommit(
  value: string | undefined,
): string | undefined {
  if (isNil(value) || value.length === 0) return undefined;
  const commit = value.trim().toLowerCase();
  if (!COMMIT_PATTERN.test(commit) || commit === FORGED_ZERO_SOURCE_COMMIT) {
    return undefined;
  }
  return commit;
}

export async function resolveTrustedSourceCommit(options: {
  envCommit?: string | undefined;
  gitCommit?: () => Promise<string>;
  repositoryRoot?: string;
} = {}): Promise<string> {
  const fromEnv = parseTrustedSourceCommit(options.envCommit);
  if (fromEnv !== undefined) return fromEnv;
  const readGitCommit = options.gitCommit ?? (async () => {
    const { stdout } = await execFile("git", [
      "-C",
      options.repositoryRoot ?? process.cwd(),
      "rev-parse",
      "--verify",
      "HEAD",
    ]);
    return stdout.trim();
  });
  const fromGit = parseTrustedSourceCommit(await readGitCommit());
  if (fromGit !== undefined) return fromGit;
  throw new Error(
    "WORLDKIT_SOURCE_COMMIT_UNTRUSTED: host did not inject a real commit id.",
  );
}
