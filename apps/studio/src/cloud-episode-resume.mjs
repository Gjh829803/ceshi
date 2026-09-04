import { joinS3Uri } from "../../../scripts/lib/lwdp-generation-client.mjs";

const resumableStageParts = Object.freeze([
  ["episode-style-prompts", "style-prompts"],
  ["episode-style-events", "style-events"],
  ["episode-style-diversity", "style-diversity"],
  ["episode-style-visuals", "style-visuals"],
  ["episode-style-openings", "style-openings"],
  ["episode-style-plan", "style-plan"],
  ["whitebox-capture", "capture"],
]);

export async function resolveLatestCompatibleCloudEpisodeManifest({
  record,
  readManifest,
  maximumStageAttempts = 3,
}) {
  if (typeof readManifest !== "function") {
    throw new Error("Cloud Episode resume requires a manifest reader.");
  }
  if (typeof record?.remoteOutputS3Prefix !== "string" ||
      record.remoteOutputS3Prefix.length === 0) {
    throw new Error("Cloud Episode has no remote output prefix.");
  }
  const stageCandidates = resumableStageParts.flatMap(([stageId, executionPart]) =>
    Array.from({ length: maximumStageAttempts }, (_, index) => ({
      stageId,
      executionPart,
      s3Uri: joinS3Uri(
        record.remoteOutputS3Prefix,
        "stages",
        stageId,
        `attempt-${maximumStageAttempts - index}`,
        "cloud-artifact-manifest.json",
      ),
    })));
  const inherited = typeof record.resumedFromEpisodeManifestS3Uri === "string"
    ? [{ stageId: null, executionPart: null, s3Uri: record.resumedFromEpisodeManifestS3Uri }]
    : [];

  for (const candidate of [...stageCandidates, ...inherited]) {
    const manifest = await readManifest(candidate.s3Uri, {
      expectedSceneId: record.sceneId,
      expectedEpisodeId: record.episodeId,
    }).catch(() => null);
    if (
      manifest?.kind === "worldkit-cloud-artifact-manifest" &&
      typeof manifest.executionId === "string" &&
      typeof manifest.workerImage === "string" &&
      (candidate.stageId === null ||
        (manifest.stageId === candidate.stageId &&
          manifest.executionPart === candidate.executionPart))
    ) {
      return {
        executionId: manifest.executionId,
        s3Uri: candidate.s3Uri,
        workerImage: manifest.workerImage,
        stageId: manifest.stageId,
        executionPart: manifest.executionPart,
      };
    }
  }
  throw new Error("Cloud Episode has no compatible resumable artifact manifest.");
}

