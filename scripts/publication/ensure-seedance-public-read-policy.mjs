import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_BUCKET = "leap-world-us-east-2";
const DEFAULT_PREFIX = "world-model/sft/worldkit_seedance_review";
const STATEMENT_ID = "AllowPublicReadWorldKitSeedanceReview20260831";

function awsEnvironment() {
  return {
    ...process.env,
    AWS_ACCESS_KEY_ID: undefined,
    AWS_SECRET_ACCESS_KEY: undefined,
    AWS_SESSION_TOKEN: undefined,
    AWS_PROFILE: undefined,
    AWS_DEFAULT_PROFILE: undefined,
    HTTP_PROXY: undefined,
    HTTPS_PROXY: undefined,
    ALL_PROXY: undefined,
    http_proxy: undefined,
    https_proxy: undefined,
    all_proxy: undefined,
    AWS_SHARED_CREDENTIALS_FILE: resolve(
      PROJECT_ROOT,
      ".codex-tmp/runtime-config/aws-credentials",
    ),
    AWS_CONFIG_FILE: resolve(PROJECT_ROOT, ".codex-tmp/runtime-config/aws-config"),
    AWS_SDK_LOAD_CONFIG: "1",
  };
}

function runAws(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("aws", args, {
      cwd: PROJECT_ROOT,
      env: awsEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`AWS CLI exited ${code}: ${stderr.trim()}`));
    });
  });
}

export function ensurePublicReadStatement(policy, bucket, prefix) {
  if (policy === null || typeof policy !== "object" || !Array.isArray(policy.Statement)) {
    throw new Error("Bucket policy has an invalid shape.");
  }
  const expected = {
    Sid: STATEMENT_ID,
    Effect: "Allow",
    Principal: "*",
    Action: "s3:GetObject",
    Resource: `arn:aws:s3:::${bucket}/${prefix.replace(/^\/+|\/+$/g, "")}/*`,
  };
  const previous = policy.Statement.find((statement) => statement.Sid === STATEMENT_ID);
  if (previous !== undefined) {
    if (JSON.stringify(previous) !== JSON.stringify(expected)) {
      throw new Error(`${STATEMENT_ID} already exists with a different scope.`);
    }
    return { policy, changed: false, statement: expected };
  }
  return {
    policy: {
      ...policy,
      Statement: [...policy.Statement, expected],
    },
    changed: true,
    statement: expected,
  };
}

export async function ensureSeedancePublicReadPolicy(options = {}) {
  const bucket = options.bucket ?? DEFAULT_BUCKET;
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const response = JSON.parse(await runAws([
    "s3api",
    "get-bucket-policy",
    "--bucket",
    bucket,
    "--output",
    "json",
  ]));
  const current = JSON.parse(response.Policy);
  const result = ensurePublicReadStatement(current, bucket, prefix);
  if (result.changed) {
    await runAws([
      "s3api",
      "put-bucket-policy",
      "--bucket",
      bucket,
      "--policy",
      JSON.stringify(result.policy),
    ]);
  }
  return {
    bucket,
    prefix,
    changed: result.changed,
    statement: result.statement,
  };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await ensureSeedancePublicReadPolicy(), null, 2)}\n`);
}
