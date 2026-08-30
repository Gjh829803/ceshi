#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  renderSeedancePromptEvent,
  sha256Canonical,
  validatePlaythroughPlan,
  writeJsonAtomic,
} from "../lib/playthrough-dataset.mjs";
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
const plan = JSON.parse(await readFile(path.join(episodeRoot, "planning/playthrough-plan.json"), "utf8"));
const validation = validatePlaythroughPlan(plan, { sceneId });
if (!validation.ok) throw new Error(`Invalid Playthrough Plan: ${JSON.stringify(validation.diagnostics)}`);
const sceneBrief = (await readFile(path.join(sceneRoot, "scene-brief.md"), "utf8")).trim();
const executedTrace = JSON.parse(await readFile(path.join(episodeRoot, "whitebox/executed-playthrough-trace.json"), "utf8"));
const executedMarkers = new Map((executedTrace.events ?? [])
  .filter((event) => event.kind === "prompt-marker")
  .map((event) => [event.id, event]));
const promptRoot = path.join(episodeRoot, "prompts");

for (let index = 0; index < 3; index += 1) {
  const segmentId = `segment-0${index}`;
  const event = plan.seedancePromptEvents[index];
  const plannedCanonicalEvent = renderSeedancePromptEvent(event);
  if (plannedCanonicalEvent !== event.eventPrompt) throw new Error(`Prompt Event drift: ${event.id}`);
  const marker = executedMarkers.get(event.id);
  if (!marker || !Number.isFinite(marker.actualSeconds)) throw new Error(`Executed Prompt marker missing: ${event.id}`);
  const executedRelativeSeconds = marker.actualSeconds - index * 30;
  if (executedRelativeSeconds < 10 || executedRelativeSeconds >= 20) {
    throw new Error(`Executed Prompt marker left its Seedance window: ${event.id} ${executedRelativeSeconds}`);
  }
  const executedEvent = {
    ...event,
    globalSeconds: marker.actualSeconds,
    segmentRelativeSeconds: executedRelativeSeconds,
  };
  const canonicalEvent = renderSeedancePromptEvent(executedEvent);
  const prompt = buildEpisodeSeedancePrompt({
    sceneBrief,
    motionRenderingGuidance: plan.motionRenderingGuidance,
    event: executedEvent,
    executedRelativeSeconds,
  });
  await writeJsonAtomic(path.join(promptRoot, `${segmentId}.json`), {
    kind: "worldkit-episode-seedance-segment-prompt",
    schemaVersion: 1,
    promptTemplateVersion: EPISODE_SEEDANCE_PROMPT_TEMPLATE_VERSION,
    sceneId,
    episodeId,
    segmentId,
    planHash: sha256Canonical(plan),
    eventId: event.id,
    plannedEventSeconds: event.globalSeconds,
    executedEventSeconds: marker.actualSeconds,
    plannedEventPromptHash: sha256Canonical(event.eventPrompt),
    eventPromptHash: sha256Canonical(canonicalEvent),
    referenceRoles: ["whitebox-segment-video", "subject-styled-triview", "styled-segment-opening-frame"],
    prompt,
  });
}
process.stdout.write("WORLDKIT_EPISODE_PROMPTS_OK segments=3\n");
