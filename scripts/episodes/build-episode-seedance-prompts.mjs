#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  executionSegmentStartSeconds,
  PLAYTHROUGH_EVENT_SEGMENT_INDICES,
  PLAYTHROUGH_PROMPT_WINDOWS,
  PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES,
  renderSeedancePromptEvent,
  sha256Canonical,
  validateVisualEventPlan,
  writeJsonAtomic,
} from "../lib/playthrough-dataset.mjs";
import { validatePlaythroughPlanStructure } from "../lib/playthrough-plan-structure.mjs";
import {
  buildEpisodeSeedancePrompt,
  EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION,
} from "../lib/episode-seedance-prompt.mjs";

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}.`);
  return args[index + 1];
};
const sceneId = value("--scene-id");
const episodeId = value("--episode-id");
const sceneRoot = path.resolve(value("--scene-root"));
const episodeRoot = path.resolve(value("--episode-root"));
const styleRoot = args.includes("--style-root")
  ? path.resolve(value("--style-root"))
  : episodeRoot;
const styleVariantId = args.includes("--style-variant-id")
  ? value("--style-variant-id")
  : null;
const plan = JSON.parse(await readFile(path.join(episodeRoot, "planning/playthrough-plan.json"), "utf8"));
const validation = validatePlaythroughPlanStructure(plan, { sceneId });
if (!validation.ok) throw new Error(`Invalid Playthrough Plan: ${JSON.stringify(validation.diagnostics)}`);
const eventPlan = JSON.parse(await readFile(path.join(styleRoot, "prompts/visual-events.json"), "utf8"));
const eventValidation = validateVisualEventPlan(eventPlan, { sceneId, episodeId });
if (!eventValidation.ok) throw new Error(`Invalid Gemini Visual Event Plan: ${JSON.stringify(eventValidation.diagnostics)}`);
if (styleVariantId !== null && eventPlan.styleVariantId !== styleVariantId) {
  throw new Error("Gemini Visual Event Plan Style Variant identity mismatch.");
}
const sceneBrief = (await readFile(path.join(sceneRoot, "scene-brief.md"), "utf8")).trim();
const executedTrace = JSON.parse(await readFile(path.join(episodeRoot, "whitebox/executed-playthrough-trace.json"), "utf8"));
const visualManifest = JSON.parse(await readFile(
  path.join(styleRoot, "visual", styleVariantId === null
    ? "episode-visual-manifest.json"
    : "visual-manifest.json"),
  "utf8",
));
const episodeVisualPrompts = JSON.parse(await readFile(
  path.join(styleRoot, "visual", styleVariantId === null
    ? "episode-visual-prompts.json"
    : "visual-prompts.json"),
  "utf8",
));
const segmentVisualPrompts = new Map(
  (episodeVisualPrompts.segmentOpeningFrames ?? []).map((entry) => [
    entry.segmentId,
    entry.prompt,
  ]),
);
const whiteboxTriviewManifest = JSON.parse(await readFile(
  path.join(sceneRoot, "triviews/whitebox-triview-manifest.json"),
  "utf8",
));
const targetMetadata = new Map((whiteboxTriviewManifest.whiteboxTriviews ?? []).map(
  (target) => [target.visualTargetId, target],
));
const visualReferenceLines = (visualManifest.targets ?? []).map((target) => {
  const metadata = targetMetadata.get(target.visualTargetId) ?? {};
  return `${metadata.name ?? target.visualTargetId}（${metadata.targetKind ?? "complete-target"}）完整三视图`;
});
const executedMarkers = new Map((executedTrace.events ?? [])
  .filter((event) => event.kind === "prompt-marker")
  .map((event) => [event.id, event]));
const promptRoot = path.join(styleRoot, "prompts");

for (const index of PLAYTHROUGH_SEEDANCE_SEGMENT_INDICES) {
  const segmentId = `segment-0${index}`;
  const segmentEvents = eventPlan.events.filter((event) =>
    event.segmentId === segmentId);
  const expectedEventCount = PLAYTHROUGH_EVENT_SEGMENT_INDICES.includes(index)
    ? index === 4 ? 1 : 2
    : 0;
  if (segmentEvents.length !== expectedEventCount) {
    throw new Error(`Expected ${expectedEventCount} Prompt Events for ${segmentId}.`);
  }
  const executedEvents = segmentEvents.map((event) => {
    const plannedCanonicalEvent = renderSeedancePromptEvent(event);
    if (plannedCanonicalEvent !== event.eventPrompt) {
      throw new Error(`Prompt Event drift: ${event.id}`);
    }
    const marker = executedMarkers.get(event.id);
    if (!marker || !Number.isFinite(marker.actualSeconds)) {
      throw new Error(`Executed Prompt marker missing: ${event.id}`);
    }
    const window = PLAYTHROUGH_PROMPT_WINDOWS[event.windowIndex];
    if (marker.actualSeconds < window.startSeconds ||
        marker.actualSeconds >= window.endSeconds) {
      throw new Error(`Executed Prompt marker left its Seedance window: ${event.id}`);
    }
    return {
      ...event,
      globalSeconds: marker.actualSeconds,
      segmentRelativeSeconds: marker.actualSeconds -
        executionSegmentStartSeconds(index),
    };
  });
  const canonicalEvents = executedEvents.map(renderSeedancePromptEvent);
  const prompt = buildEpisodeSeedancePrompt({
    sceneBrief,
    motionRenderingGuidance: plan.motionRenderingGuidance,
    events: executedEvents,
    segmentVisualPrompt: segmentVisualPrompts.get(segmentId),
    visualReferenceLines,
  });
  await writeJsonAtomic(path.join(promptRoot, `${segmentId}.json`), {
    kind: "worldkit-episode-seedance-segment-prompt",
    schemaVersion: 1,
    promptTemplateVersion: EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION,
    sceneId,
    episodeId,
    ...(styleVariantId === null ? {} : { styleVariantId }),
    segmentId,
    planHash: sha256Canonical(plan),
    visualEventPlanHash: sha256Canonical(eventPlan),
    visualManifestHash: sha256Canonical(visualManifest),
    visualPromptBundleHash: sha256Canonical(episodeVisualPrompts),
    visualEventModel: eventPlan.model,
    eventIds: segmentEvents.map((event) => event.id),
    plannedEventSeconds: segmentEvents.map((event) => event.globalSeconds),
    executedEventSeconds: executedEvents.map((event) => event.globalSeconds),
    plannedEventPromptHashes: segmentEvents.map((event) =>
      sha256Canonical(event.eventPrompt)),
    eventPromptHashes: canonicalEvents.map(sha256Canonical),
    referenceRoles: [
      "whitebox-segment-video",
      "styled-segment-opening-frame",
      ...(visualManifest.targets ?? []).map((target) =>
        `styled-triview:${target.visualTargetId}`),
    ],
    prompt,
  });
}
process.stdout.write("WORLDKIT_EPISODE_PROMPTS_OK segments=6 eventSegments=3 events=5\n");
