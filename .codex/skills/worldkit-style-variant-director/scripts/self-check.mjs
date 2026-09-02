#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, minimum) => typeof value === "string" && value.trim().length >= minimum;

export function validateStyleVariantDirectorOutput(input, plan) {
  const diagnostics = [];
  const targetIds = (input?.targets ?? []).map((target) => target?.visualTargetId);
  if (!object(input) || !object(plan) || plan.sceneId !== input.sceneId ||
      plan.episodeId !== input.episodeId ||
      plan.kind !== "worldkit-episode-style-variant-plan" || plan.schemaVersion !== 1) {
    diagnostics.push({ code: "IDENTITY_INVALID", path: "", message: "Plan identity must match the input." });
    return diagnostics;
  }
  if (!isDeepStrictEqual(plan.sourceWhiteboxIdentity, input.sourceWhiteboxIdentity)) {
    diagnostics.push({ code: "WHITEBOX_IDENTITY_STALE", path: "/sourceWhiteboxIdentity", message: "Copy sourceWhiteboxIdentity exactly." });
  }
  if (!Array.isArray(plan.variants) || plan.variants.length !== 10) {
    diagnostics.push({ code: "VARIANT_COUNT_INVALID", path: "/variants", message: "Write exactly ten variants." });
    return diagnostics;
  }
  for (const [index, variant] of plan.variants.entries()) {
    const base = `/variants/${index}`;
    const expectedId = `style-${String(index).padStart(2, "0")}`;
    if (!object(variant) || variant.id !== expectedId || !text(variant.name, 4) ||
        !text(variant.concept, 80) || !text(variant.visualPrompt, 300) ||
        !text(variant.geminiEventPrompt, 200) || !text(variant.negativeConstraints, 120)) {
      diagnostics.push({ code: "VARIANT_DEFINITION_INVALID", path: base, message: `${expectedId} is incomplete.` });
      continue;
    }
    const interpretations = variant.targetInterpretations;
    if (!Array.isArray(interpretations) || interpretations.length !== targetIds.length) {
      diagnostics.push({ code: "TARGET_COUNT_INVALID", path: `${base}/targetInterpretations`, message: `Expected ${targetIds.length} target interpretations in input order.` });
      continue;
    }
    for (const [targetIndex, targetId] of targetIds.entries()) {
      const interpretation = interpretations[targetIndex];
      if (interpretation?.visualTargetId !== targetId ||
          !text(interpretation?.finalIdentity, 24) || !text(interpretation?.appearance, 60)) {
        diagnostics.push({ code: "TARGET_INTERPRETATION_INVALID", path: `${base}/targetInterpretations/${targetIndex}`, message: `Provide complete interpretation for ${targetId}.` });
      }
    }
  }
  const concepts = plan.variants.map((variant) => String(variant?.concept ?? "").trim().toLowerCase());
  if (new Set(concepts).size !== concepts.length) {
    diagnostics.push({ code: "CONCEPTS_DUPLICATED", path: "/variants", message: "Every concept must be independently authored." });
  }
  return diagnostics;
}

async function main(arguments_ = process.argv.slice(2)) {
  const value = (name) => {
    const index = arguments_.indexOf(name);
    if (index < 0 || !arguments_[index + 1]) throw new Error(`Missing ${name}.`);
    return arguments_[index + 1];
  };
  const [input, plan] = await Promise.all([
    readFile(path.resolve(value("--input")), "utf8").then(JSON.parse),
    readFile(path.resolve(value("--plan")), "utf8").then(JSON.parse),
  ]);
  const diagnostics = validateStyleVariantDirectorOutput(input, plan);
  process.stdout.write(`${JSON.stringify({ ok: diagnostics.length === 0, diagnostics }, null, 2)}\n`);
  if (diagnostics.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
