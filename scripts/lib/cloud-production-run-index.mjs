import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import {
  assertS3Uri,
  joinS3Uri,
  uploadS3File,
} from "./lwdp-generation-client.mjs";
import {
  projectAwsEnvironment,
  readRemoteS3Artifact,
} from "./cloud-s3-runtime.mjs";

const execFilePromise = promisify(execFile);
const ID = /^[a-z0-9][a-z0-9-]{2,119}$/;

function splitS3Uri(value) {
  const url = new URL(assertS3Uri(value));
  return { bucket: url.hostname, key: url.pathname.replace(/^\//, "").replace(/\/$/, "") };
}

export function cloudEpisodeRunIndexS3Uri(outputS3Root, episodeId) {
  if (!ID.test(episodeId ?? "")) throw new Error("Cloud Episode run-index ID is invalid.");
  return joinS3Uri(
    assertS3Uri(outputS3Root),
    "control",
    "run-index",
    "episodes",
    episodeId,
    "record.json",
  );
}

export function cloudSceneRunIndexS3Uri(outputS3Root, sceneId) {
  if (!ID.test(sceneId ?? "")) throw new Error("Cloud Scene run-index ID is invalid.");
  return joinS3Uri(
    assertS3Uri(outputS3Root),
    "control",
    "run-index",
    "scenes",
    sceneId,
    "record.json",
  );
}

export function parseCloudEpisodeRunIndexRecord(value) {
  const record = typeof value === "string" ? JSON.parse(value) : value;
  if (
    record?.kind !== "worldkit-episode-workflow-record" ||
    record?.schemaVersion !== 1 ||
    record?.backend !== "cloud" ||
    !ID.test(record?.episodeId ?? "") ||
    !ID.test(record?.sceneId ?? "") ||
    !Number.isSafeInteger(record?.recordRevision) ||
    record.recordRevision < 1
  ) throw new Error("Cloud Episode run-index record is invalid.");
  return Object.freeze(record);
}

export function parseCloudSceneRunIndexRecord(value) {
  const record = typeof value === "string" ? JSON.parse(value) : value;
  if (
    !ID.test(record?.id ?? "") ||
    record?.sceneId !== record.id ||
    record?.codexBackend !== "cloud" ||
    !Number.isSafeInteger(record?.recordRevision) ||
    record.recordRevision < 1
  ) throw new Error("Cloud Scene run-index record is invalid.");
  return Object.freeze(record);
}

export async function writeCloudEpisodeRunIndexRecord(record, {
  repoRoot,
  outputS3Root,
  uploadImplementation = null,
} = {}) {
  const admitted = parseCloudEpisodeRunIndexRecord(record);
  const serialized = `${JSON.stringify(admitted, null, 2)}\n`;
  const temporaryRoot = await mkdtemp(join(tmpdir(), "worldkit-cloud-run-index-"));
  try {
    const localPath = join(temporaryRoot, "record.json");
    await writeFile(localPath, serialized, { mode: 0o600 });
    const s3Uri = cloudEpisodeRunIndexS3Uri(outputS3Root, admitted.episodeId);
    const uploader = uploadImplementation ?? ((source, destination) =>
      uploadS3File(source, destination, { env: projectAwsEnvironment(repoRoot) }));
    await uploader(localPath, s3Uri);
    return Object.freeze({
      s3Uri,
      sha256: `sha256:${createHash("sha256").update(serialized).digest("hex")}`,
      recordRevision: admitted.recordRevision,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function writeCloudSceneRunIndexRecord(record, {
  repoRoot,
  outputS3Root,
  uploadImplementation = null,
} = {}) {
  const admitted = parseCloudSceneRunIndexRecord(record);
  const serialized = `${JSON.stringify(admitted, null, 2)}\n`;
  const temporaryRoot = await mkdtemp(join(tmpdir(), "worldkit-cloud-scene-index-"));
  try {
    const localPath = join(temporaryRoot, "record.json");
    await writeFile(localPath, serialized, { mode: 0o600 });
    const s3Uri = cloudSceneRunIndexS3Uri(outputS3Root, admitted.sceneId);
    const uploader = uploadImplementation ?? ((source, destination) =>
      uploadS3File(source, destination, { env: projectAwsEnvironment(repoRoot) }));
    await uploader(localPath, s3Uri);
    return Object.freeze({
      s3Uri,
      sha256: `sha256:${createHash("sha256").update(serialized).digest("hex")}`,
      recordRevision: admitted.recordRevision,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function readCloudEpisodeRunIndexRecord(episodeId, {
  repoRoot,
  outputS3Root,
  readImplementation = readRemoteS3Artifact,
} = {}) {
  try {
    const bytes = await readImplementation(
      cloudEpisodeRunIndexS3Uri(outputS3Root, episodeId),
      { repoRoot, maximumBytes: 2 * 1024 * 1024 },
    );
    return parseCloudEpisodeRunIndexRecord(bytes.toString("utf8"));
  } catch {
    return null;
  }
}

export async function readCloudSceneRunIndexRecord(sceneId, {
  repoRoot,
  outputS3Root,
  readImplementation = readRemoteS3Artifact,
} = {}) {
  try {
    const bytes = await readImplementation(
      cloudSceneRunIndexS3Uri(outputS3Root, sceneId),
      { repoRoot, maximumBytes: 2 * 1024 * 1024 },
    );
    return parseCloudSceneRunIndexRecord(bytes.toString("utf8"));
  } catch {
    return null;
  }
}

async function listRunIndexRecords({
  repoRoot,
  outputS3Root,
  namespace,
  parseRecord,
  execFileImplementation,
  readImplementation,
}) {
  const prefixUri = joinS3Uri(
    assertS3Uri(outputS3Root),
    "control",
    "run-index",
    namespace,
  );
  const { bucket, key } = splitS3Uri(prefixUri);
  const result = await execFileImplementation("aws", [
    "s3api", "list-objects-v2",
    "--bucket", bucket,
    "--prefix", `${key}/`,
    "--output", "json",
  ], {
    env: projectAwsEnvironment(repoRoot),
    maxBuffer: 16 * 1024 * 1024,
  });
  const stdout = typeof result === "string" ? result : result.stdout;
  const payload = JSON.parse(String(stdout ?? "{}"));
  const uris = (payload.Contents ?? [])
    .map((item) => String(item?.Key ?? ""))
    .filter((item) => item.endsWith("/record.json"))
    .map((item) => `s3://${bucket}/${item}`);
  const records = [];
  for (let offset = 0; offset < uris.length; offset += 16) {
    const page = await Promise.all(uris.slice(offset, offset + 16).map(async (s3Uri) => {
      try {
        const bytes = await readImplementation(s3Uri, {
          repoRoot,
          maximumBytes: 2 * 1024 * 1024,
        });
        return parseRecord(bytes.toString("utf8"));
      } catch {
        return null;
      }
    }));
    records.push(...page.filter(Boolean));
  }
  return records.sort((left, right) =>
    String(right.updatedAt ?? right.createdAt).localeCompare(
      String(left.updatedAt ?? left.createdAt),
    ));
}

export async function listCloudEpisodeRunIndexRecords({
  repoRoot,
  outputS3Root,
  execFileImplementation = execFilePromise,
  readImplementation = readRemoteS3Artifact,
} = {}) {
  return listRunIndexRecords({
    repoRoot,
    outputS3Root,
    namespace: "episodes",
    parseRecord: parseCloudEpisodeRunIndexRecord,
    execFileImplementation,
    readImplementation,
  });
}

export async function listCloudSceneRunIndexRecords({
  repoRoot,
  outputS3Root,
  execFileImplementation = execFilePromise,
  readImplementation = readRemoteS3Artifact,
} = {}) {
  return listRunIndexRecords({
    repoRoot,
    outputS3Root,
    namespace: "scenes",
    parseRecord: parseCloudSceneRunIndexRecord,
    execFileImplementation,
    readImplementation,
  });
}
