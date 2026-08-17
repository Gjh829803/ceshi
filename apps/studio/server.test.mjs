import assert from "node:assert/strict";
import test from "node:test";

import {
  createSceneId,
  decodeImagePayload,
  isAllowedSceneAsset,
  isAuthorizedHeader,
  normalizePrompt,
  normalizeTitle,
} from "./server.mjs";

test("normalizes world input and creates safe scene ids", () => {
  const prompt = normalizePrompt("  一片围绕蓝色湖泊的开阔丘陵  ");
  assert.equal(prompt, "一片围绕蓝色湖泊的开阔丘陵");
  assert.equal(normalizeTitle("", prompt), prompt);
  const id = createSceneId("Sunlit Lake", new Set(), new Date("2026-08-17T08:09:00Z"));
  assert.match(id, /^sunlit-lake-[a-f0-9]{4}$/);
});

test("rejects unsafe or oversized prompts", () => {
  assert.throws(() => normalizePrompt("  "), /至少/);
  assert.throws(() => normalizePrompt("a".repeat(8_001)), /8,000/);
});

test("accepts real PNG payloads and rejects mislabeled bytes", () => {
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const decoded = decodeImagePayload({
    name: "reference.png",
    dataUrl: `data:image/png;base64,${png.toString("base64")}`,
  });
  assert.equal(decoded.extension, "png");
  assert.equal(decoded.originalName, "reference.png");
  assert.throws(
    () => decodeImagePayload({ dataUrl: `data:image/png;base64,${Buffer.from("not png").toString("base64")}` }),
    /不匹配/,
  );
});

test("allows only declared scene planning image paths", () => {
  assert.equal(isAllowedSceneAsset("world-plan.png"), true);
  assert.equal(isAllowedSceneAsset("reference-0.jpg"), true);
  assert.equal(isAllowedSceneAsset("prototypes/cape-lighthouse/whitebox-triview.png"), true);
  assert.equal(isAllowedSceneAsset("prototypes/cape-lighthouse/styled-triview.png"), true);
  assert.equal(isAllowedSceneAsset("prototypes/../world-plan.png"), false);
  assert.equal(isAllowedSceneAsset("../../package.json"), false);
  assert.equal(isAllowedSceneAsset("prototypes/cape-lighthouse/source.glb"), false);
});

test("protects public Studio instances with HTTP Basic access", () => {
  const valid = `Basic ${Buffer.from("worldkit:correct horse battery staple").toString("base64")}`;
  const wrongUser = `Basic ${Buffer.from("admin:correct horse battery staple").toString("base64")}`;
  const wrongKey = `Basic ${Buffer.from("worldkit:nope").toString("base64")}`;
  assert.equal(isAuthorizedHeader(undefined, ""), true);
  assert.equal(isAuthorizedHeader(undefined, "correct horse battery staple"), false);
  assert.equal(isAuthorizedHeader(valid, "correct horse battery staple"), true);
  assert.equal(isAuthorizedHeader(wrongUser, "correct horse battery staple"), false);
  assert.equal(isAuthorizedHeader(wrongKey, "correct horse battery staple"), false);
});
