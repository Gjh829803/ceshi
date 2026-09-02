#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  PLAYTHROUGH_HOST_EVENT_SLOTS,
  PLAYTHROUGH_PROMPT_WINDOWS,
  VISUAL_EVENT_ACTION_INDEPENDENCE,
  executionSegmentStartSeconds,
  renderSeedancePromptEvent,
  validateVisualEventPlan,
  writeJsonAtomic,
} from "../lib/playthrough-dataset.mjs";
import { buildEpisodeVisualEventInputIdentity } from "../lib/episode-input-identity.mjs";

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}.`);
  return args[index + 1];
};
const sceneId = value("--scene-id");
const episodeId = value("--episode-id");
const model = value("--model");
const inputPath = path.resolve(value("--input"));
const tracePath = path.resolve(value("--trace"));
const outputPath = path.resolve(value("--output"));
const episodeRoot = args.includes("--episode-root")
  ? path.resolve(value("--episode-root"))
  : null;
const styleRoot = args.includes("--style-root")
  ? path.resolve(value("--style-root"))
  : episodeRoot;
const configPath = args.includes("--config")
  ? path.resolve(value("--config"))
  : null;
const promptTemplatePath = args.includes("--prompt-template")
  ? path.resolve(value("--prompt-template"))
  : null;
const selectedCaptureIndices = args.includes("--selected-capture-indices")
  ? value("--selected-capture-indices").split(",").map(Number)
  : null;
const styleVariantId = args.includes("--style-variant-id")
  ? value("--style-variant-id")
  : null;
const styleVariantInput = styleVariantId === null
  ? null
  : {
      styleVariantHash: value("--style-variant-hash"),
      visualReviewHash: value("--visual-review-hash"),
      visualReviewReportHash: value("--visual-review-report-hash"),
    };

const raw = JSON.parse(await readFile(inputPath, "utf8"));
const trace = JSON.parse(await readFile(tracePath, "utf8"));
if (!Array.isArray(raw.events) || raw.events.length !== PLAYTHROUGH_HOST_EVENT_SLOTS.length) {
  throw new Error("Gemini must return exactly five visual events across the three selected captures.");
}
const markers = new Map((trace.events ?? [])
  .filter((event) => event?.kind === "prompt-marker" && typeof event.id === "string")
  .map((event) => [event.id, event]));
const allowedGeminiEventFields = new Set([
  "targetNames", "eventClass", "magnitude", "frameImpact", "dominantChange",
  "targetContext", "beforeState", "transitionDescription", "afterState",
  "spatialContinuity", "audioDescription", "negativeConstraints", "timing",
]);
const events = raw.events.map((content, index) => {
  const slot = PLAYTHROUGH_HOST_EVENT_SLOTS[index];
  const marker = markers.get(slot.id);
  if (!marker || !Number.isFinite(marker.actualSeconds)) {
    throw new Error(`Executed Host Event marker is missing: ${slot.id}`);
  }
  const globalSeconds = Number(marker.actualSeconds);
  const window = PLAYTHROUGH_PROMPT_WINDOWS[index];
  if (globalSeconds < window.startSeconds || globalSeconds >= window.endSeconds) {
    throw new Error(`Host Event marker left its Segment window: ${slot.id}`);
  }
  const unknownFields = Object.keys(content ?? {}).filter((key) =>
    !allowedGeminiEventFields.has(key));
  if (unknownFields.length > 0) {
    throw new Error(`Gemini visual event added unsupported fields: ${unknownFields.join(",")}`);
  }
  const event = {
    ...content,
    id: slot.id,
    windowIndex: index,
    globalSeconds,
    segmentId: slot.segmentId,
    segmentRelativeSeconds: globalSeconds -
      executionSegmentStartSeconds(window.segmentIndex),
    actionCoupling: VISUAL_EVENT_ACTION_INDEPENDENCE,
  };
  return { ...event, eventPrompt: renderSeedancePromptEvent(event) };
});

const inputIdentity = episodeRoot && styleRoot && configPath && promptTemplatePath &&
    Array.isArray(selectedCaptureIndices)
  ? await buildEpisodeVisualEventInputIdentity({
      configPath,
      promptTemplatePath,
      episodeRoot,
      styleRoot,
      selectedCaptureIndices,
    })
  : null;
const eventPlan = {
  kind: "worldkit-episode-visual-events",
  schemaVersion: 1,
  sceneId,
  episodeId,
  ...(styleVariantId === null ? {} : { styleVariantId }),
  ...(styleVariantInput === null ? {} : { styleVariantInput }),
  model,
  ...(inputIdentity === null ? {} : { inputIdentity }),
  events,
};
const validation = validateVisualEventPlan(eventPlan, { sceneId, episodeId });
if (!validation.ok) {
  throw new Error(`Gemini Visual Event Plan is invalid: ${JSON.stringify(validation.diagnostics)}`);
}
await writeJsonAtomic(outputPath, eventPlan);
process.stdout.write(`WORLDKIT_GEMINI_VISUAL_EVENTS_OK model=${model} events=5\n`);
