import { execFile } from "node:child_process";
import path from "node:path";

import { assertS3Uri } from "./lwdp-generation-client.mjs";

export function projectAwsEnvironment(repoRoot, environment = process.env) {
  const runtimeRoot = path.join(repoRoot, ".codex-tmp", "runtime-config");
  const next = { ...environment };
  const workloadIdentity = environment.WORLDKIT_CLOUD_CONTROL_PLANE === "1";
  for (const key of [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_PROFILE",
    "AWS_DEFAULT_PROFILE",
    ...(workloadIdentity ? ["AWS_SHARED_CREDENTIALS_FILE", "AWS_CONFIG_FILE"] : [
      "AWS_WEB_IDENTITY_TOKEN_FILE",
      "AWS_ROLE_ARN",
    ]),
  ]) delete next[key];
  if (!workloadIdentity) {
    next.AWS_SHARED_CREDENTIALS_FILE = path.join(runtimeRoot, "aws-credentials");
    next.AWS_CONFIG_FILE = path.join(runtimeRoot, "aws-config");
  }
  next.AWS_REGION = "us-east-2";
  next.AWS_DEFAULT_REGION = "us-east-2";
  return next;
}

function execFileBuffer(command, arguments_, options) {
  return new Promise((resolvePromise, reject) => {
    execFile(command, arguments_, {
      ...options,
      encoding: "buffer",
      maxBuffer: options.maxBuffer,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(
          `${command} failed: ${Buffer.from(stderr ?? "").toString("utf8").trim() || error.message}`,
        ));
        return;
      }
      resolvePromise(Buffer.from(stdout));
    });
  });
}

export async function readRemoteS3Artifact(s3Uri, {
  repoRoot,
  maximumBytes = 16 * 1024 * 1024,
  execFileImplementation = execFileBuffer,
} = {}) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error("maximumBytes must be a positive safe integer.");
  }
  const bytes = await execFileImplementation(
    "aws",
    ["s3", "cp", "--only-show-errors", assertS3Uri(s3Uri), "-"],
    {
      env: projectAwsEnvironment(repoRoot),
      maxBuffer: maximumBytes,
    },
  );
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > maximumBytes) {
    throw new Error(`Remote S3 artifact is empty or exceeds ${maximumBytes} bytes.`);
  }
  return bytes;
}
