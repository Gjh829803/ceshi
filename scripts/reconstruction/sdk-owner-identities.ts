import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import {
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1,
  type FormalWorldCaptureSdkOwnerIdV1,
  type FormalWorldCaptureSdkOwnerIdentityV1,
} from "@whitebox-world/runtime-contracts";
import { isEmpty, isNil } from "lodash-es";

import { WORLDKIT_SDK_VERSION_V1 } from "../lib/world-package-cli";
import { resolveTrustedSourceCommit } from "../lib/worldkit-source-commit";

const execFile = promisify(execFileCallback);

const SDK_OWNER_IMPLEMENTATION_REF_BY_ID = Object.freeze({
  action: "worldkit://sdk-owner/subject-actions@1",
  camera: "worldkit://sdk-owner/camera@1",
  input: "worldkit://sdk-owner/control-capture@1",
  physics: "worldkit://sdk-owner/character-movement@1",
  subject: "worldkit://sdk-owner/subject-contracts@1",
} satisfies Readonly<Record<FormalWorldCaptureSdkOwnerIdV1, string>>);

export interface ResolveFormalWorldCaptureSdkOwnerIdentitiesOptionsV1 {
  readonly repositoryRoot?: string;
  readonly envCommit?: string;
  readonly gitCommit?: () => Promise<string>;
  readonly readRepositoryStatus?: () => Promise<string>;
}

async function readRepositoryStatus(repositoryRoot: string): Promise<string> {
  const { stdout } = await execFile("git", [
    "-C",
    repositoryRoot,
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  return stdout;
}

export async function resolveFormalWorldCaptureSdkOwnerIdentitiesV1(
  options: ResolveFormalWorldCaptureSdkOwnerIdentitiesOptionsV1 = {},
): Promise<readonly FormalWorldCaptureSdkOwnerIdentityV1[]> {
  const repositoryRoot = options.repositoryRoot ?? process.cwd();
  let repositoryStatus: string;
  try {
    repositoryStatus = await (options.readRepositoryStatus ??
      (() => readRepositoryStatus(repositoryRoot)))();
  } catch {
    throw new Error(
      "WORLDKIT_SDK_OWNER_IDENTITY_SOURCE_STATE_UNAVAILABLE: Host could not verify the repository state.",
    );
  }
  if (!isEmpty(repositoryStatus.trim())) {
    throw new Error(
      "WORLDKIT_SDK_OWNER_IDENTITY_SOURCE_DIRTY: repository contents differ from the trusted commit.",
    );
  }

  const sourceCommit = await resolveTrustedSourceCommit({
    ...(isNil(options.envCommit) ? {} : { envCommit: options.envCommit }),
    ...(isNil(options.gitCommit) ? {} : { gitCommit: options.gitCommit }),
    repositoryRoot,
  });

  return Object.freeze(FORMAL_WORLD_CAPTURE_SDK_OWNER_IDS_V1.map((ownerId) => {
    const implementationRef = SDK_OWNER_IMPLEMENTATION_REF_BY_ID[ownerId];
    return Object.freeze({
      ownerId,
      implementationRef,
      implementationHash: sha256CanonicalJson({
        kind: "formal-world-capture-sdk-owner-implementation",
        schemaVersion: 1,
        ownerId,
        implementationRef,
        sdkVersion: WORLDKIT_SDK_VERSION_V1,
        sourceCommit,
      }) as Sha256HashV1,
    });
  }));
}
