import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createSceneId,
  createKeyedSerialExecutor,
  createStudio,
  decodeImagePayload,
  deriveReliabilityMetrics,
  deriveWorkflowMetrics,
  deriveWorkflowTrajectory,
  isAllowedSceneAsset,
  isAuthorizedHeader,
  normalizePrompt,
  normalizeTestSetName,
  parseStageTokenUsage,
  workflowPolicyVersion,
  writeJsonAtomic,
} from "./server.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const temporaryRoots = [];

async function temporaryRoot(prefix) {
  const root = await mkdtemp(path.join(repoRoot, "apps/studio", prefix));
  temporaryRoots.push(root);
  return root;
}

async function listen(studio) {
  await studio.initialize();
  await new Promise((resolve, reject) => {
    studio.server.once("error", reject);
    studio.server.listen(0, "127.0.0.1", resolve);
  });
  const address = studio.server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

async function writeTrustedWhiteboxArtifacts(
  fakeRepoRoot,
  sceneId,
  { requiresRouteValidation = false, routeReportMode = "exact" } = {},
) {
  const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", sceneId);
  const triViewRoot = path.join(artifactRoot, "triviews", "player-subject");
  await mkdir(triViewRoot, { recursive: true });
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const brief = "# WorldKit Scene Brief\n\n## 场景\n可信导入场景\n";
  const authoring = `${JSON.stringify({
    kind: "worldkit-authoring-spec",
    schemaVersion: 4,
    id: sceneId,
  })}\n`;
  const mapDraft = `${JSON.stringify({
    kind: "worldkit-scene-brief-implementation-map-draft",
    schemaVersion: 1,
    sceneId,
    authoringSpecId: sceneId,
    visualTargetMappings: [{ visualTargetId: "player-subject", runtimeEntityIds: ["player"] }],
  })}\n`;
  const hash = (source) => `sha256:${createHash("sha256").update(source).digest("hex")}`;
  const resourceLockHash = `sha256:${"e".repeat(64)}`;
  const layoutSolveReportHash = `sha256:${"f".repeat(64)}`;
  const sceneBriefHash = `sha256:${"b".repeat(64)}`;
  const authoringSpecHash = hash(authoring);
  const normalizedWorldIr = {
    kind: "normalized-world-ir",
    schemaVersion: 4,
  };
  const normalizedWorldIrHash = hash(canonicalJson(normalizedWorldIr));
  const visualTarget = {
    visualTargetId: "player-subject",
    runtimeEntityIds: ["player"],
    role: "primary-subject",
    semanticClassId: "subject.player",
    identityColor: "#E85D5D",
  };
  const implementationMap = {
    kind: "worldkit-scene-brief-implementation-map",
    schemaVersion: 1,
    sceneId,
    sceneBriefHash,
    authoringSpecId: sceneId,
    authoringSpecHash,
    visualTargetMappings: [{ visualTargetId: "player-subject", runtimeEntityIds: ["player"] }],
    visualCaptureGroups: [visualTarget],
  };
  const requiredRoutes = requiresRouteValidation
    ? [{
        constraintId: "player-to-goal",
        routeId: "main-route",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn",
        destinationAnchorEntityId: "goal",
      }]
    : [];
  const executionPlan = {
    kind: "worldkit-execution-plan",
    schemaVersion: 5,
    authoringSpecHash,
    normalizedWorldIrHash,
    resourceLockHash,
    layout: { layoutSolveReportHash },
    traversal: {
      connectivityRequirements: requiredRoutes.map((route) => ({
        ...route,
        kind: "connected-by-route",
      })),
    },
  };
  const executionPlanHash = hash(canonicalJson(executionPlan));
  const captureTargets = {
    kind: "worldkit-whitebox-triview-manifest",
    schemaVersion: 1,
    executionPlanHash,
    whiteboxTriviews: [{
      ...visualTarget,
      views: ["front", "right", "back"],
      imageUri: "player-subject/whitebox-triview.png",
    }],
  };
  await Promise.all([
    writeFile(path.join(artifactRoot, "scene-brief.md"), brief),
    writeFile(path.join(artifactRoot, "planner-self-check.json"), JSON.stringify({
      kind: "worldkit-planner-self-check",
      schemaVersion: 1,
      validatorVersion: "worldkit-planner-self-check-v2",
      sceneId,
      status: "passed",
      inputs: { sceneBriefHash: hash(brief) },
    })),
    writeFile(path.join(artifactRoot, "visual-identity-palette.json"), JSON.stringify({
      kind: "worldkit-visual-identity-palette",
      schemaVersion: 1,
      sceneId,
      sceneBriefHash,
      targets: [{ id: "player-subject" }],
    })),
    writeFile(path.join(artifactRoot, "authoring.json"), authoring),
    writeFile(path.join(artifactRoot, "implementation-map.draft.json"), mapDraft),
    writeFile(path.join(artifactRoot, "builder-self-check.json"), JSON.stringify({
      kind: "worldkit-builder-self-check",
      schemaVersion: 1,
      validatorVersion: "worldkit-builder-self-check-v5",
      sceneId,
      status: "passed",
      requiresTrustedRouteValidation: requiresRouteValidation,
      inputs: {
        sceneBriefHash: hash(brief),
        authoringSpecHash: hash(authoring),
        implementationMapDraftHash: hash(mapDraft),
      },
    })),
    writeFile(path.join(artifactRoot, "scene-implementation-map.json"), JSON.stringify(implementationMap)),
    writeFile(path.join(artifactRoot, "world.build.json"), JSON.stringify({
      kind: "worldkit-build-artifact",
      schemaVersion: 4,
      normalizedWorldIrHash,
      executionPlanHash,
      normalizedWorldIr,
      executionPlan,
    })),
    writeFile(path.join(artifactRoot, "opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "runtime-snapshot.json"), JSON.stringify({
      kind: "worldkit-runtime-snapshot",
      schemaVersion: 4,
    })),
    writeFile(path.join(artifactRoot, "triviews/whitebox-triview-manifest.json"), JSON.stringify(captureTargets)),
    writeFile(path.join(triViewRoot, "whitebox-triview.png"), png),
  ]);
  if (requiresRouteValidation && routeReportMode !== "missing") {
    const reportFileName = "route-validation.20260825-120000-123.json";
    const requiredRouteSetHash = `sha256:${createHash("sha256").update(
      canonicalJson({
        kind: "route-validation-required-route-set",
        schemaVersion: 1,
        executionPlanHash,
        requiredRoutes,
      }),
    ).digest("hex")}`;
    const report = {
      kind: "worldkit-validation-report",
      schemaVersion: 2,
      id: `${sceneId}.route-validation`,
      status: routeReportMode === "failed" ? "failed" : "passed",
      subject: {
        kind: "world-package",
        authoringSpecHash,
        normalizedWorldIrHash,
        executionPlanHash: routeReportMode === "mismatched" ? resourceLockHash : executionPlanHash,
        resourceLockHash,
        layoutSolveReportHash,
      },
      routeValidationSetReceipt: {
        kind: "route-validation-set-receipt",
        schemaVersion: 1,
        authoringSpecHash,
        normalizedWorldIrHash,
        executionPlanHash,
        resourceLockHash,
        layoutSolveReportHash,
        requiredRouteCount: requiredRoutes.length,
        requiredRouteSetHash,
        requiredRoutes,
        rows: requiredRoutes.map((route) => ({
          ...route,
          resolvedTraversalLockHash: `sha256:${"9".repeat(64)}`,
          connectivityStatus: "complete",
          runtimeStatus: "complete",
          evidenceArtifactRefs: [],
        })),
      },
      gateResultsById: {
        "route-connectivity": { status: "passed" },
        "route-runtime-conformance": { status: "passed" },
      },
      evidenceArtifactsById: {},
      diagnostics: [],
    };
    const reportBytes = Buffer.from(`${canonicalJson(report)}\n`);
    await Promise.all([
      writeFile(path.join(artifactRoot, reportFileName), reportBytes),
      writeFile(path.join(artifactRoot, "route-validation-manifest.json"), JSON.stringify({
        kind: "worldkit-route-validation-manifest",
        schemaVersion: 1,
        sceneId,
        reportFileName,
        reportContentHash:
          `sha256:${createHash("sha256").update(reportBytes).digest("hex")}`,
      })),
    ]);
  }
  return { artifactRoot, captureTargets, png };
}

test.afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("uses one current switchable Codex backend workflow contract", () => {
  assert.equal(workflowPolicyVersion, 3);
});

test("passes the frozen backend to world jobs and records local Codex markers without provider details", async () => {
  const source = await readFile(path.join(repoRoot, "apps/studio/server.mjs"), "utf8");
  assert.match(source, /WORLDKIT_CODEX_BACKEND: codexBackend/);
  assert.match(source, /WORLDKIT_LOCAL_CODEX_JOB \(\[a-z-\]\+\) \(\[a-zA-Z0-9\._:-\]\+\)/);
  assert.match(source, /kind: "local-job", taskId: localCodexJob\[2\]/);
  assert.doesNotMatch(source, /kind: "local-job"[^\n]+(?:credential|token|CODEX_HOME)/i);
});

test("keeps concurrent atomic writes isolated and serializes same-record mutations", async () => {
  const root = await temporaryRoot(".atomic-write-");
  const outputPath = path.join(root, "record.json");
  await Promise.all(Array.from({ length: 64 }, (_, index) =>
    writeJsonAtomic(outputPath, { index, payload: "x".repeat(256) })));
  const persisted = JSON.parse(await readFile(outputPath, "utf8"));
  assert.ok(Number.isInteger(persisted.index));
  assert.equal(persisted.payload.length, 256);
  assert.deepEqual(
    (await readdir(root)).filter((name) => name.endsWith(".tmp")),
    [],
  );

  const runSerially = createKeyedSerialExecutor();
  let activeForRecord = 0;
  let maximumActiveForRecord = 0;
  const completionOrder = [];
  await Promise.all(Array.from({ length: 32 }, (_, index) =>
    runSerially("same-record", async () => {
      activeForRecord += 1;
      maximumActiveForRecord = Math.max(maximumActiveForRecord, activeForRecord);
      await new Promise((resolve) => setImmediate(resolve));
      completionOrder.push(index);
      activeForRecord -= 1;
    })));
  assert.equal(maximumActiveForRecord, 1);
  assert.deepEqual(completionOrder, Array.from({ length: 32 }, (_, index) => index));

  let activeAcrossRecords = 0;
  let maximumActiveAcrossRecords = 0;
  await Promise.all(["record-a", "record-b"].map((key) =>
    runSerially(key, async () => {
      activeAcrossRecords += 1;
      maximumActiveAcrossRecords = Math.max(maximumActiveAcrossRecords, activeAcrossRecords);
      await new Promise((resolve) => setImmediate(resolve));
      activeAcrossRecords -= 1;
    })));
  assert.equal(maximumActiveAcrossRecords, 2);
});

 test("assembles the new agent pipeline without executing prompt text", () => {
  const result = spawnSync(
    "bash",
    [path.join(repoRoot, "scripts/run-spatial-world-agent.sh"), "--", "--scene-id", "prompt-smoke", "$(touch should-not-run)"],
    { cwd: repoRoot, env: { ...process.env, WORLDKIT_PROMPT_SMOKE: "1" }, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /WORLDKIT_PROMPT_SMOKE_OK planner coding-agent canonical-build runtime-capture visual-prompt-synthesis visual-imagegen/);
});

test("routes Planner and Builder through the selected Codex backend while keeping post-whitebox visuals on Gemini", async () => {
  const [scripts, codexRouter] = await Promise.all([Promise.all([
    "run-spatial-world-agent.sh",
    "run-styled-opening-frame-agent.sh",
    "run-styled-triviews-agent.sh",
    "run-visual-reconstruction-agent.sh",
  ].map((name) => readFile(path.join(repoRoot, "scripts", name), "utf8"))),
  readFile(path.join(repoRoot, "scripts/run-codex-task.mjs"), "utf8")]);
  for (const source of scripts) {
    assert.doesNotMatch(source, /command -v codex|CODEX_HOME=|codex exec/);
  }
  assert.match(scripts[0], /codex_backend="\$\{WORLDKIT_CODEX_BACKEND:-cloud\}"/);
  assert.match(scripts[0], /run-codex-task\.mjs --backend "\$codex_backend"[^\n]*--execution-profile formal/);
  assert.match(codexRouter, /backend === "cloud"/);
  assert.match(codexRouter, /run-lwdp-codex-task\.mjs/);
  assert.match(codexRouter, /run-local-codex-task\.mjs/);
  assert.match(scripts[1], /run-gemini-visual-pipeline\.py/);
  assert.match(scripts[2], /run-gemini-visual-pipeline\.py/);
  assert.doesNotMatch(scripts[1], /run-lwdp-(?:codex-task|t2i-job)\.mjs/);
  assert.doesNotMatch(scripts[2], /run-lwdp-(?:codex-task|t2i-job)\.mjs/);
  assert.match(scripts[3], /run-codex-task\.mjs --backend "\$codex_backend"/);
  assert.equal((scripts[3].match(/--execution-profile formal/g) ?? []).length, 2);
});

test("keeps lightweight Planner prose and Builder implementation authority separate", async () => {
  const [launcher, plannerSkill, plannerTemplate, builderSkill, resourceCatalog, controlledSubjects, terrainStructures] = await Promise.all([
    readFile(path.join(repoRoot, "scripts/run-spatial-world-agent.sh"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-spatial-planner/SKILL.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-spatial-planner/references/scene-brief-template.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-canonical-builder/SKILL.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-canonical-builder/references/resource-catalog.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-canonical-builder/references/controlled-subjects.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-canonical-builder/references/terrain-and-structures.md"), "utf8"),
  ]);
  assert.match(launcher, /worldkit brief validate/);
  assert.match(launcher, /worldkit-spatial-planner\/scripts\/self-check\.mjs/);
  assert.match(launcher, /worldkit-canonical-builder\/scripts\/self-check\.mjs/);
  assert.match(launcher, /non-authoritative composition intent/);
  assert.match(launcher, /\.codex\/skills\/worldkit-spatial-planner\/SKILL\.md/);
  assert.match(plannerSkill, /optional hosted preview-planning stage/);
  assert.match(plannerSkill, /does not replace the formal World Planner's WorldSpec/);
  assert.match(plannerSkill, /Name exactly one movement mode/);
  assert.match(plannerSkill, /not a closed list/);
  assert.match(plannerSkill, /custom movement label/);
  assert.match(plannerSkill, /Write 1-5 entries total/);
  assert.match(plannerSkill, /no landmark merely to fill the list/);
  assert.match(plannerSkill, /several complete instances intentionally share the same appearance/);
  assert.match(plannerTemplate, /## 运动模式/);
  assert.match(plannerTemplate, /重复标志物/);
  assert.doesNotMatch(launcher, /Use packages\/authoring\/src\/spatial-world-plan-v1\.ts as the contract/);
  assert.match(launcher, /Canonical AuthoringSpec V4/);
  assert.match(launcher, /worldkit verify route/);
  assert.match(launcher, /Implement the complete world rather than only the opening view/);
  assert.match(launcher, /Define 1-5 visual targets as whole targets/);
  assert.match(launcher, /absence of a same-named preset is never a reason to omit the world/);
  assert.match(launcher, /documented current ground closure as an explicitly disclosed playable approximation/);
  assert.match(launcher, /never add or modify SDK motion bases/);
  assert.match(launcher, /maxVertices, maxTriangles, and maxColliders are all blocking compiler budgets/);
  assert.doesNotMatch(launcher, /humanoid\.board\.surface-slide|humanoid\.wingsuit\.unpowered-glide/);
  assert.doesNotMatch(launcher, /triangle-count overruns do not block/);
  assert.match(launcher, /implementation-map\.draft\.json/);
  assert.match(launcher, /finalize-spatial-build\.ts/);
  assert.match(launcher, /--triview-output/);
  assert.doesNotMatch(launcher, /WORLDKIT_PLANNER_REPAIR_LIMIT/);
  assert.doesNotMatch(launcher, /WORLDKIT_BUILDER_REPAIR_LIMIT/);
  assert.doesNotMatch(launcher, /WORLDKIT_PLANNER_REPAIR/);
  assert.doesNotMatch(launcher, /WORLDKIT_BUILDER_REPAIR/);
  assert.match(launcher, /planner-self-check\.json/);
  assert.match(launcher, /builder-self-check\.json/);
  assert.match(launcher, /\.codex\/skills\/worldkit-canonical-builder\/SKILL\.md/);
  assert.doesNotMatch(launcher, /Read packages\/authoring\/src\/authoring-spec-v3\.schema\.json/);
  assert.match(builderSkill, /sole authoring guide/);
  assert.match(resourceCatalog, /humanoid\.g-bot@2/);
  assert.match(resourceCatalog, /red static capsule proxy|red column/);
  assert.match(builderSkill, /complete described world/);
  assert.match(builderSkill, /strict centered rear view/);
  assert.match(builderSkill, /connected exploration/);
  assert.match(controlledSubjects, /one controlled Subject/);
  assert.match(controlledSubjects, /Appearance-only items never become Prototypes/);
  assert.match(terrainStructures, /minimum few major masses/);
  assert.doesNotMatch(launcher, /plan:freeze/);
});

test("synthesizes prompts then directly generates the opening and tri-views concurrently", async () => {
  const result = spawnSync(
    "bash",
    [path.join(repoRoot, "scripts/run-styled-opening-frame-agent.sh"), "--", "--scene-id", "prompt-smoke"],
    { cwd: repoRoot, env: { ...process.env, WORLDKIT_PROMPT_SMOKE: "1" }, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /WORLDKIT_FIRST_FRAME_SMOKE_OK gemini-prompt-synthesis direct-parallel-imagegen whitebox-opening user-first-frame runtime-triviews/);
  const triViewSmoke = spawnSync(
    "bash",
    [path.join(repoRoot, "scripts/run-styled-triviews-agent.sh"), "--", "--scene-id", "prompt-smoke"],
    { cwd: repoRoot, env: { ...process.env, WORLDKIT_PROMPT_SMOKE: "1" }, encoding: "utf8" },
  );
  assert.equal(triViewSmoke.status, 0, triViewSmoke.stderr || triViewSmoke.stdout);
  assert.match(triViewSmoke.stdout, /WORLDKIT_STYLED_TRIVIEWS_SMOKE_OK styled-opening-frame whitebox-triviews no-playtest/);
  const [worldRunner, firstFrameRunner, styledTriviewRunner, visualPipeline, server] = await Promise.all([
    readFile(path.join(repoRoot, "scripts/run-spatial-world-agent.sh"), "utf8"),
    readFile(path.join(repoRoot, "scripts/run-styled-opening-frame-agent.sh"), "utf8"),
    readFile(path.join(repoRoot, "scripts/run-styled-triviews-agent.sh"), "utf8"),
    readFile(path.join(repoRoot, "scripts/run-gemini-visual-pipeline.py"), "utf8"),
    readFile(path.join(repoRoot, "apps/studio/server.mjs"), "utf8"),
  ]);
  assert.match(worldRunner, /run-styled-opening-frame-agent\.sh/);
  assert.match(firstFrameRunner, /WORLDKIT_STAGE visual-prompt-synthesis/);
  assert.match(firstFrameRunner, /--prompt-only/);
  assert.match(firstFrameRunner, /--generate-only/);
  assert.match(firstFrameRunner, /--only all/);
  assert.doesNotMatch(firstFrameRunner, /run-styled-triviews-agent\.sh/);
  assert.match(styledTriviewRunner, /--only triviews/);
  assert.match(visualPipeline, /The actual Babylon opening whitebox image fixes the complete visible projection/);
  assert.match(visualPipeline, /full back faces the camera/);
  assert.match(visualPipeline, /50% image-width vertical centerline/);
  assert.match(visualPipeline, /ThreadPoolExecutor/);
  assert.match(visualPipeline, /visual-generation-prompts\.json/);
  assert.match(visualPipeline, /gemini-3-flash-preview/);
  assert.match(visualPipeline, /gemini-3\.1-flash-image/);
  assert.doesNotMatch(visualPipeline, /leap_flow/);
  assert.doesNotMatch(styledTriviewRunner, /whitebox-video|contact-sheet|video-prompt/);
  assert.doesNotMatch(firstFrameRunner, /validate-visual-alignment-report|WORLDKIT_STAGE visual-alignment/);
  assert.doesNotMatch(server, /whiteboxVideoMatch|enqueueVisual|runVisualJob/);
});

test("renders current Babylon capture state without a legacy composition path", async () => {
  const app = await readFile(path.join(repoRoot, "apps/studio/public/app.js"), "utf8");
  assert.match(app, /Babylon Runtime/);
  assert.doesNotMatch(app, /hasLegacyGuide|capture-start|verify-entry/);
});

test("normalizes input and validates image payloads", () => {
  const prompt = normalizePrompt("  一片围绕蓝色湖泊的多层山地  ");
  assert.equal(prompt, "一片围绕蓝色湖泊的多层山地");
  assert.equal(normalizeTestSetName("  复杂空间测试集  "), "复杂空间测试集");
  assert.match(createSceneId("Layered World", new Set()), /^layered-world-[a-f0-9]{4}$/);
  assert.throws(() => normalizePrompt(" "), /至少/);

  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const decoded = decodeImagePayload({ name: "reference.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` });
  assert.equal(decoded.extension, "png");
  assert.match(decoded.contentSha256, /^[a-f0-9]{64}$/);
  assert.throws(() => decodeImagePayload({ dataUrl: `data:image/png;base64,${Buffer.from("bad").toString("base64")}` }), /不匹配/);
});

test("allows only declared planning assets", () => {
  assert.equal(isAllowedSceneAsset("world-plan.png"), true);
  assert.equal(isAllowedSceneAsset("entry-whitebox-target.png"), true);
  assert.equal(isAllowedSceneAsset("reference-0.webp"), true);
  assert.equal(isAllowedSceneAsset("prototypes/tower/whitebox-triview.png"), true);
  assert.equal(isAllowedSceneAsset("../../package.json"), false);
});

test("proxies Playground subject assets through the Studio origin", async () => {
  const requestedUrls = [];
  const upstream = createServer((request, response) => {
    requestedUrls.push(request.url);
    response.writeHead(200, { "content-type": "model/gltf-binary" });
    response.end(Buffer.from("glb-through-playground"));
  });
  await new Promise((resolve, reject) => {
    upstream.once("error", reject);
    upstream.listen(0, "127.0.0.1", resolve);
  });
  const upstreamAddress = upstream.address();
  assert.ok(upstreamAddress && typeof upstreamAddress === "object");
  const playgroundInternalOrigin = `http://127.0.0.1:${upstreamAddress.port}`;
  const dataRoot = await temporaryRoot(".test-data-");
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    playgroundOrigin: playgroundInternalOrigin,
    playgroundInternalOrigin,
  });
  const origin = await listen(studio);
  try {
    for (const assetPath of [
      "/subject-assets/humanoid/g-bot/v2/g-bot.glb?worldkit-content-hash=test",
      "/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
    ]) {
      const response = await fetch(`${origin}${assetPath}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "model/gltf-binary");
      assert.equal(await response.text(), "glb-through-playground");
    }
    assert.deepEqual(requestedUrls, [
      "/subject-assets/humanoid/g-bot/v2/g-bot.glb?worldkit-content-hash=test",
      "/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
    ]);
  } finally {
    await studio.shutdown();
    await new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
  }
});

test("protects public Studio instances with Basic access", () => {
  const valid = `Basic ${Buffer.from("worldkit:secret").toString("base64")}`;
  assert.equal(isAuthorizedHeader(undefined, ""), true);
  assert.equal(isAuthorizedHeader(undefined, "secret"), false);
  assert.equal(isAuthorizedHeader(valid, "secret"), true);
});

test("proves private readiness only to the parent that holds the child nonce", async () => {
  const dataRoot = await temporaryRoot(".readiness-nonce-");
  const readinessNonce = "0123456789abcdef0123456789abcdef";
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    readinessNonce,
  });
  const origin = await listen(studio);
  try {
    const missing = await fetch(`${origin}/__worldkit/studio-ready`);
    assert.equal(missing.status, 404);

    const wrong = await fetch(`${origin}/__worldkit/studio-ready`, {
      headers: { "x-worldkit-readiness-nonce": "fedcba9876543210fedcba9876543210" },
    });
    assert.equal(wrong.status, 404);

    const ready = await fetch(`${origin}/__worldkit/studio-ready`, {
      headers: { "x-worldkit-readiness-nonce": readinessNonce },
    });
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), {
      status: "ready",
      nonce: readinessNonce,
      pid: process.pid,
    });
  } finally {
    await studio.shutdown();
  }
});

test("publishes bounded concurrent cloud-case capacity without starting queued work", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    maxConcurrentJobs: 6,
    lwdpConfigured: true,
  });
  const origin = await listen(studio);
  try {
    const health = await (await fetch(`${origin}/api/health`)).json();
    assert.equal(health.activeJob, null);
    assert.deepEqual(health.activeJobs, []);
    assert.equal(health.maxConcurrentJobs, 6);
    assert.deepEqual(health.maxConcurrentJobsByBackend, { cloud: 6, local: 1 });
    assert.equal(health.lwdpConfigured, true);
    assert.equal(health.codexBackend, "cloud");
    assert.equal(health.codexAvailable, true);
    assert.equal(health.codexBackends.cloud.available, true);
    assert.equal(typeof health.codexBackends.local.available, "boolean");
    assert.equal(typeof health.geminiConfigured, "boolean");
    assert.equal(health.geminiPromptModel, "gemini-3-flash-preview");
    assert.equal(health.geminiImageModel, "gemini-3.1-flash-image");
    assert.deepEqual(health.codexExecutionProfile, {
      name: "formal",
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
    });
    assert.equal(health.queued, 0);
  } finally {
    await studio.shutdown();
  }
});

test("defaults to cloud and atomically persists an available one-click Codex backend switch", async () => {
  const dataRoot = await temporaryRoot(".codex-backend-persistence-");
  const codexSpawnSync = (_command, args) => ({
    status: args[0] === "--version" || (args[0] === "login" && args[1] === "status") ? 0 : 1,
  });
  let studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    codexSpawnSync,
  });
  let origin = await listen(studio);
  try {
    const initialHealth = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.equal(initialHealth.codexBackend, "cloud");
    assert.deepEqual(initialHealth.codexBackends, {
      cloud: { available: true },
      local: { available: true },
    });

    const switched = await fetch(`${origin}/api/settings/codex-backend`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "local" }),
    });
    assert.equal(switched.status, 200);
    assert.equal((await switched.json()).codexBackend, "local");
    const persisted = JSON.parse(await readFile(path.join(dataRoot, "runtime-settings.json"), "utf8"));
    assert.deepEqual(
      { kind: persisted.kind, schemaVersion: persisted.schemaVersion, codexBackend: persisted.codexBackend },
      { kind: "worldkit-studio-runtime-settings", schemaVersion: 1, codexBackend: "local" },
    );
    assert.deepEqual(
      (await readdir(dataRoot)).filter((name) => name.endsWith(".tmp")),
      [],
    );
  } finally {
    await studio.shutdown();
  }

  studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    initialCodexBackend: "cloud",
    lwdpConfigured: true,
    codexSpawnSync,
  });
  origin = await listen(studio);
  try {
    const health = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.equal(health.codexBackend, "local");
    assert.equal(health.codexAvailable, true);
  } finally {
    await studio.shutdown();
  }
});

test("rejects an unavailable backend without changing the selected or persisted backend", async () => {
  const dataRoot = await temporaryRoot(".codex-backend-unavailable-");
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    codexSpawnSync: (_command, args) => ({ status: args[0] === "--version" ? 0 : 1 }),
  });
  const origin = await listen(studio);
  try {
    const response = await fetch(`${origin}/api/settings/codex-backend`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "local" }),
    });
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.codexBackend, "cloud");
    assert.equal(payload.codexBackends.local.available, false);
    const health = await fetch(`${origin}/api/health`).then((result) => result.json());
    assert.equal(health.codexBackend, "cloud");
    assert.equal(health.codexAvailable, true);
    const persisted = JSON.parse(await readFile(path.join(dataRoot, "runtime-settings.json"), "utf8"));
    assert.equal(persisted.codexBackend, "cloud");
  } finally {
    await studio.shutdown();
  }
});

test("defaults legacy records without a frozen backend to cloud", async () => {
  const dataRoot = await temporaryRoot(".codex-backend-legacy-");
  const legacyId = "legacy-queued-world";
  const legacyRoot = path.join(dataRoot, "worlds", legacyId);
  await mkdir(legacyRoot, { recursive: true });
  await writeFile(path.join(legacyRoot, "record.json"), JSON.stringify({
    id: legacyId,
    sceneId: legacyId,
    title: "Legacy queued world",
    prompt: "Build the legacy queued world.",
    referenceImage: null,
    status: "queued",
    stage: "queued",
    attempt: 0,
    origin: "creator-studio",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    workflowPolicyVersion: 23,
  }));
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    initialCodexBackend: "local",
    lwdpConfigured: true,
    codexSpawnSync: () => ({ status: 0 }),
  });
  const origin = await listen(studio);
  try {
    const world = await fetch(`${origin}/api/worlds/${legacyId}`).then((response) => response.json());
    assert.equal(world.world.codexBackend, "cloud");
    const health = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.equal(health.codexBackend, "local");
  } finally {
    await studio.shutdown();
  }
});

test("freezes each backend and gives cloud and local independent execution slots", async () => {
  const dataRoot = await temporaryRoot(".codex-backend-binding-");
  const pendingById = new Map();
  const started = [];
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    maxConcurrentJobs: 1,
    lwdpConfigured: true,
    codexSpawnSync: () => ({ status: 0 }),
    jobRunner: (id) => new Promise((resolve) => {
      started.push(id);
      pendingById.set(id, resolve);
    }),
  });
  const origin = await listen(studio);
  try {
    const firstResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Cloud-bound", prompt: "Create the first backend-bound world." }),
    });
    const first = (await firstResponse.json()).world;
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id]);
    assert.equal(first.codexBackend, "cloud");

    const switchResponse = await fetch(`${origin}/api/settings/codex-backend`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "local" }),
    });
    assert.equal(switchResponse.status, 200);
    const firstAfterSwitch = await fetch(`${origin}/api/worlds/${first.id}`).then((response) => response.json());
    assert.equal(firstAfterSwitch.world.codexBackend, "cloud");

    const secondResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Local-bound", prompt: "Create the second backend-bound world." }),
    });
    const second = (await secondResponse.json()).world;
    assert.equal(second.codexBackend, "local");
    assert.equal((await fetch(`${origin}/api/worlds/${first.id}`).then((response) => response.json())).world.codexBackend, "cloud");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id, second.id]);
    assert.equal(studio.activeJobs.length, 2);

    const thirdResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Local queued", prompt: "Create the queued local world." }),
    });
    const third = (await thirdResponse.json()).world;
    assert.equal(third.codexBackend, "local");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id, second.id]);
    const health = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.deepEqual(health.maxConcurrentJobsByBackend, { cloud: 1, local: 1 });
    assert.deepEqual(health.queuedByBackend, { cloud: 0, local: 1 });

    pendingById.get(first.id)();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id, second.id]);
    pendingById.get(second.id)();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id, second.id, third.id]);
    pendingById.get(third.id)();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    for (const resolve of pendingById.values()) resolve();
    await studio.shutdown();
  }
});

test("stops both queued and running worlds without counting user cancellation as failure", async () => {
  const dataRoot = await temporaryRoot(".world-stop-");
  const pendingById = new Map();
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    maxConcurrentJobs: 1,
    jobRunner: (id) => new Promise((resolve) => pendingById.set(id, resolve)),
  });
  const origin = await listen(studio);
  try {
    const create = async (title) => (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, prompt: `Build ${title}` }),
    })).json()).world;
    const running = await create("Running stop case");
    const queued = await create("Queued stop case");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(studio.activeJobs.length, 1);

    const queuedStop = await fetch(`${origin}/api/worlds/${queued.id}/stop`, { method: "POST" });
    assert.equal(queuedStop.status, 200);
    assert.equal((await queuedStop.json()).world.status, "interrupted");
    assert.equal((await fetch(`${origin}/api/health`).then((response) => response.json())).queued, 0);

    const runningStop = await fetch(`${origin}/api/worlds/${running.id}/stop`, { method: "POST" });
    assert.equal(runningStop.status, 200);
    const stopped = (await runningStop.json()).world;
    assert.equal(stopped.status, "interrupted");
    assert.equal(stopped.outcome, "cancelled");
    assert.match(stopped.error, /用户已停止/);
    pendingById.get(running.id)?.();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(studio.activeJobs.length, 0);

    const reliability = deriveReliabilityMetrics([
      { status: "interrupted", outcome: "cancelled", error: "用户已停止任务" },
    ]);
    assert.equal(reliability.terminalCount, 0);
    assert.equal(reliability.failureCount, 0);
  } finally {
    for (const resolve of pendingById.values()) resolve();
    await studio.shutdown();
  }
});

test("stops an active world before child registration without spawning the pipeline", async () => {
  const dataRoot = await temporaryRoot(".world-stop-before-spawn-");
  let markSpawnBoundaryReached;
  let releaseSpawnBoundary;
  const spawnBoundaryReached = new Promise((resolve) => { markSpawnBoundaryReached = resolve; });
  const spawnBoundaryRelease = new Promise((resolve) => { releaseSpawnBoundary = resolve; });
  let spawnCalls = 0;
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    beforeWorldSpawn: async () => {
      markSpawnBoundaryReached();
      await spawnBoundaryRelease;
    },
    worldSpawnImplementation: () => {
      spawnCalls += 1;
      throw new Error("world pipeline must not spawn after cancellation");
    },
  });
  const origin = await listen(studio);
  let created;
  try {
    created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Stop before spawn", prompt: "Build a cancellable world." }),
    })).json()).world;
    await spawnBoundaryReached;
    assert.deepEqual(studio.activeJobs, [created.id]);
    assert.equal(spawnCalls, 0);

    const response = await fetch(`${origin}/api/worlds/${created.id}/stop`, { method: "POST" });
    const responseBody = await response.text();
    assert.equal(response.status, 200, responseBody);
    const stopped = JSON.parse(responseBody).world;
    assert.equal(stopped.status, "interrupted");
    assert.equal(stopped.outcome, "cancelled");

    releaseSpawnBoundary();
    for (let attempt = 0; attempt < 20 && studio.activeJobs.length > 0; attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(spawnCalls, 0);
    assert.deepEqual(studio.activeJobs, []);
    const persisted = await fetch(`${origin}/api/worlds/${created.id}`).then((result) => result.json());
    assert.equal(persisted.world.status, "interrupted");
    assert.equal(persisted.world.outcome, "cancelled");
  } finally {
    releaseSpawnBoundary?.();
    await studio.shutdown();
    if (created?.sceneId) {
      await rm(path.join(repoRoot, "artifacts/scenes", created.sceneId), {
        recursive: true,
        force: true,
      });
    }
  }
});

test("snapshots one selected Codex backend across every world in a test-set batch", async () => {
  const dataRoot = await temporaryRoot(".codex-backend-batch-");
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    codexSpawnSync: () => ({ status: 0 }),
  });
  const origin = await listen(studio);
  try {
    assert.equal((await fetch(`${origin}/api/settings/codex-backend`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "local" }),
    })).status, 200);
    const testSet = (await (await fetch(`${origin}/api/test-sets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Backend batch", prompt: "Build each complete reference world." }),
    })).json()).testSet;
    for (const suffix of [1, 2]) {
      const bytes = Buffer.from(`89504e470d0a1a0a0000000${suffix}`, "hex");
      const upload = await fetch(`${origin}/api/test-sets/${testSet.id}/images`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: {
            name: `case-${suffix}.png`,
            dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
          },
        }),
      });
      assert.equal(upload.status, 201);
    }
    const run = await fetch(`${origin}/api/test-sets/${testSet.id}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(run.status, 202);
    const worlds = (await run.json()).worlds;
    assert.equal(worlds.length, 2);
    assert.ok(worlds.every(({ codexBackend }) => codexBackend === "local"));
    assert.equal(new Set(worlds.map(({ batchId }) => batchId)).size, 1);
  } finally {
    await studio.shutdown();
  }
});

test("dispatches queued cloud cases up to the configured concurrency without sharing slots", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const pendingById = new Map();
  const started = [];
  let maximumActive = 0;
  let studio;
  const jobRunner = (id) => new Promise((resolve) => {
    started.push(id);
    pendingById.set(id, resolve);
    maximumActive = Math.max(maximumActive, studio.activeJobs.length);
  });
  studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    maxConcurrentJobs: 2,
    jobRunner,
  });
  const origin = await listen(studio);
  try {
    for (const title of ["Cloud A", "Cloud B", "Cloud C"]) {
      const response = await fetch(`${origin}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, prompt: `Build ${title}` }),
      });
      assert.equal(response.status, 202);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(started.length, 2);
    assert.equal(studio.activeJobs.length, 2);
    assert.equal(maximumActive, 2);

    pendingById.get(started[0])();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(started.length, 3);
    assert.equal(studio.activeJobs.length, 2);
    assert.equal(new Set(started).size, 3);

    for (const resolve of pendingById.values()) resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(studio.activeJobs.length, 0);
  } finally {
    for (const resolve of pendingById.values()) resolve();
    await studio.shutdown();
  }
});

test("adapts the main Registry subject catalog for the Studio UI", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const studio = createStudio({ repoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const response = await fetch(`${origin}/api/subject-catalog`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.presets.length >= 5);
    assert.ok(payload.presets.every(({ ref }) => ref.startsWith("worldkit://subject-definition/")));
    assert.ok(payload.productionRefs.includes("worldkit://subject-definition/animal.quadruped.forward-steer@1"));
  } finally {
    await studio.shutdown();
  }
});

test("derives the single current Scene Brief workflow", () => {
  const stages = deriveWorkflowTrajectory({
    record: {
      stage: "canonical-build", status: "running", captureStatus: "pending",
      styledOpeningFrameRequired: true, styledTriviewsRequired: true,
    },
    availableIds: [
      "scene-brief", "planner-self-check", "visual-identity-palette", "world-plan",
      "entry-whitebox-target", "authoring-spec", "implementation-map-draft",
      "builder-self-check",
    ],
  });
  assert.equal(stages.find(({ id }) => id === "planner")?.status, "complete");
  assert.equal(stages.find(({ id }) => id === "coding-agent")?.status, "complete");
  assert.equal(stages.find(({ id }) => id === "canonical-build")?.status, "active");
  assert.equal(stages.find(({ id }) => id === "runtime-capture")?.status, "pending");
  assert.equal(stages.find(({ id }) => id === "entry-alignment-validation")?.status, "pending");
  assert.equal(stages.some(({ id }) => ["spatial-planner", "image-planner", "styled-triviews"].includes(id)), false);
});

test("separates whitebox capture from Snapshot V4 entry-alignment validation", () => {
  const availableIds = [
    "scene-brief", "planner-self-check", "visual-identity-palette", "world-plan", "entry-whitebox-target",
    "authoring-spec", "implementation-map-draft", "builder-self-check", "implementation-map", "execution-plan",
    "opening-frame", "runtime-snapshot", "whitebox-triview-manifest",
  ];
  const failedStages = deriveWorkflowTrajectory({
    record: {
      stage: "failed",
      failedStage: "entry-alignment-validation",
      status: "failed",
      captureStatus: "passed",
      workflowPolicyVersion,
      styledOpeningFrameRequired: true,
      styledTriviewsRequired: true,
    },
    availableIds,
  });
  assert.equal(failedStages.find(({ id }) => id === "runtime-capture")?.status, "complete");
  assert.equal(failedStages.find(({ id }) => id === "entry-alignment-validation")?.status, "failed");

  const passedStages = deriveWorkflowTrajectory({
    record: {
      stage: "visual-prompt-synthesis",
      status: "running",
      captureStatus: "passed",
      workflowPolicyVersion,
      styledOpeningFrameRequired: true,
      styledTriviewsRequired: true,
    },
    availableIds: [...availableIds, "entry-third-person-validation"],
  });
  assert.equal(passedStages.find(({ id }) => id === "entry-alignment-validation")?.status, "complete");
  assert.equal(passedStages.find(({ id }) => id === "visual-prompt-synthesis")?.status, "active");
});

test("records tokens per new agent stage and elapsed time", () => {
  const rawLog = [
    "WORLDKIT_STAGE planner",
    "WORLDKIT_STAGE_USAGE planner 2000",
    "WORLDKIT_STAGE coding-agent",
    "WORLDKIT_STAGE_USAGE coding-agent 2100",
  ].join("\n");
  assert.deepEqual(parseStageTokenUsage(rawLog), {
    planner: 2_000,
    "coding-agent": 2_100,
  });
  const record = {
    stage: "ready", status: "ready", outcome: "passed",
    workflowPolicyVersion,
    styledOpeningFrameRequired: false,
    createdAt: "2026-08-21T00:00:00.000Z",
    startedAt: "2026-08-21T00:00:00.000Z",
    finishedAt: "2026-08-21T00:03:00.000Z",
  };
  const stages = deriveWorkflowTrajectory({
    record,
    availableIds: [
      "scene-brief", "visual-identity-palette", "world-plan", "entry-whitebox-target", "authoring-spec",
      "implementation-map-draft", "implementation-map", "execution-plan",
      "opening-frame", "runtime-snapshot", "whitebox-triview-manifest",
    ],
  });
  const metrics = deriveWorkflowMetrics({ record, stages, rawLog, events: [] });
  assert.equal(metrics.summary.tokenCount, 4_100);
  assert.equal(metrics.summary.durationMs, 180_000);
});

test("never counts a failed runtime capture as evaluation success", () => {
  const metrics = deriveReliabilityMetrics([
    { workflowPolicyVersion, status: "ready", outcome: "passed", attempt: 1 },
    { workflowPolicyVersion, status: "failed", outcome: "failed", failedStage: "runtime-capture", captureStatus: "failed" },
    { workflowPolicyVersion, status: "ready", outcome: null, captureStatus: "failed", captureRequired: false },
  ], { minimumSampleSize: 1 });
  assert.equal(metrics.successCount, 1);
  assert.equal(metrics.failureCount, 1);
  assert.equal(metrics.terminalCount, 2);
  assert.equal(metrics.failureRate, 0.5);
});

test("persists image test sets, rejects duplicate bytes, and queues selected cases", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const createResponse = await fetch(`${origin}/api/test-sets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "复杂山地", prompt: "依据每张图建立多层可行进白膜世界。" }),
    });
    assert.equal(createResponse.status, 201);
    const testSet = (await createResponse.json()).testSet;
    const png = Buffer.from("89504e470d0a1a0a0000000001", "hex");
    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
    const upload = await fetch(`${origin}/api/test-sets/${testSet.id}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: { name: "mountain.png", dataUrl } }),
    });
    assert.equal(upload.status, 201);
    const duplicate = await fetch(`${origin}/api/test-sets/${testSet.id}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: { name: "duplicate.png", dataUrl } }),
    });
    assert.equal(duplicate.status, 400);
    const listed = (await (await fetch(`${origin}/api/test-sets`)).json()).testSets[0];
    assert.equal(listed.validation.runnableCount, 1);
    const run = await fetch(`${origin}/api/test-sets/${testSet.id}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageIds: [listed.images[0].id] }),
    });
    assert.equal(run.status, 202);
    const payload = await run.json();
    assert.equal(payload.worlds.length, 1);
    assert.equal(payload.worlds[0].workflowPolicyVersion, workflowPolicyVersion);
    assert.equal(payload.worlds[0].captureStatus, "pending");
    assert.equal(payload.worlds[0].styledOpeningFrameRequired, true);
    assert.equal(payload.worlds[0].styledOpeningFrameStatus, "pending");
    assert.equal(payload.worlds[0].styledTriviewsRequired, true);
    assert.equal(payload.worlds[0].styledTriviewsStatus, "pending");
  } finally {
    await studio.shutdown();
  }
});

test("imports versioned built-in test sets with humanoid walking labels", async () => {
  const fakeRepoRoot = await temporaryRoot(".builtin-repo-");
  const dataRoot = await temporaryRoot(".builtin-data-");
  const builtinRoot = path.join(
    fakeRepoRoot,
    "apps/studio/builtin-test-sets/sample-v1",
  );
  const imageBytes = Buffer.from("builtin-test-image");
  const contentSha256 = createHash("sha256").update(imageBytes).digest("hex");
  await mkdir(path.join(builtinRoot, "images"), { recursive: true });
  await writeFile(path.join(builtinRoot, "images", "walker.png"), imageBytes);
  await writeFile(path.join(builtinRoot, "manifest.json"), JSON.stringify({
    kind: "worldkit-builtin-test-set",
    schemaVersion: 1,
    id: "test-set-sample-v1",
    name: "Sample Built-in",
    prompt: "Build the reference.",
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    review: { matchingCount: 1 },
    images: [{
      id: "image-001-abcd",
      sourceFile: "images/walker.png",
      extension: "png",
      mimeType: "image/png",
      contentSha256,
      originalName: "walker.png",
      size: imageBytes.length,
      labels: { humanoidWalking: true, primaryLocomotion: "walking" },
      tags: ["humanoid-walking"],
    }],
  }));
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: true,
  });
  const origin = await listen(studio);
  try {
    const payload = await fetch(`${origin}/api/test-sets`).then((response) => response.json());
    assert.equal(payload.testSets.length, 1);
    assert.equal(payload.testSets[0].builtin, true);
    assert.equal(payload.testSets[0].validation.humanoidWalkingCount, 1);
    assert.equal(payload.testSets[0].images[0].labels.humanoidWalking, true);
    assert.deepEqual(payload.testSets[0].images[0].tags, ["humanoid-walking"]);
  } finally {
    await studio.shutdown();
  }
});

test("does not expose manual whitebox video upload in the automatic Studio workflow", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
    const createResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Manual Capture",
        prompt: "Create a world for a manually recorded whitebox take.",
        image: { name: "first-frame.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
      }),
    });
    const created = (await createResponse.json()).world;
    const upload = await fetch(`${origin}/api/worlds/${created.id}/whitebox-video`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from("manual video is outside the automatic flow"),
    });
    assert.equal(upload.status, 405);
  } finally {
    await studio.shutdown();
  }
});

test("does not recover an explicitly failed visual run from leftover output files", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const firstStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const firstOrigin = await listen(firstStudio);
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const created = (await (await fetch(`${firstOrigin}/api/worlds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Recover Styled Frame",
      prompt: "Create a playable third-person world.",
      image: { name: "reference.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
    }),
  })).json()).world;
  await firstStudio.shutdown();

  const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", created.sceneId);
  await mkdir(path.join(artifactRoot, "triviews", "player-subject"), { recursive: true });
  await Promise.all([
    ...[
      "scene-brief.md", "visual-identity-palette.json", "authoring.json", "scene-implementation-map.json", "world.build.json",
      "runtime-snapshot.json", "evaluation-run.json", "planner-self-check.json", "builder-self-check.json",
    ].map((fileName) => writeFile(path.join(artifactRoot, fileName), "{}")),
    writeFile(path.join(artifactRoot, "triviews/whitebox-triview-manifest.json"), JSON.stringify({
      whiteboxTriviews: [{ visualTargetId: "player-subject" }],
    })),
    writeFile(path.join(artifactRoot, "opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "visual-generation-prompts.json"), "{}"),
    writeFile(path.join(artifactRoot, "styled-opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "triviews/player-subject/styled-triview.png"), png),
    writeFile(path.join(artifactRoot, "styled-triviews-manifest.json"), "{}"),
    writeFile(path.join(artifactRoot, "styled-triviews-report.json"), "{}"),
  ]);
  const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  await writeFile(recordPath, JSON.stringify({
    ...record,
    status: "failed",
    stage: "failed",
    failedStage: "visual-imagegen",
    captureStatus: "passed",
    outcome: "failed",
    error: "Legacy image alignment failed.",
  }));

  const recoveredStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const recoveredOrigin = await listen(recoveredStudio);
  try {
    const detail = await (await fetch(`${recoveredOrigin}/api/worlds/${created.id}`)).json();
    assert.equal(detail.world.status, "failed");
    assert.equal(detail.world.outcome, "failed");
    assert.equal(detail.world.error, "Legacy image alignment failed.");
    assert.equal(detail.world.previewUrl, `/play?authoring=1&world=${created.id}`);
    await assert.rejects(
      readFile(path.join(artifactRoot, "evaluation-report.json"), "utf8"),
      { code: "ENOENT" },
    );
  } finally {
    await recoveredStudio.shutdown();
  }
});

test("does not recover stale placeholder outputs left before the current visual attempt", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const firstStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const firstOrigin = await listen(firstStudio);
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const created = (await (await fetch(`${firstOrigin}/api/worlds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Stale Visual Outputs",
      prompt: "Create a playable third-person world.",
      image: { name: "reference.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
    }),
  })).json()).world;
  await firstStudio.shutdown();

  const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", created.sceneId);
  await mkdir(path.join(artifactRoot, "triviews", "player-subject"), { recursive: true });
  await Promise.all([
    ...[
      "scene-brief.md", "visual-identity-palette.json", "authoring.json", "scene-implementation-map.json", "world.build.json",
      "runtime-snapshot.json", "evaluation-run.json", "planner-self-check.json", "builder-self-check.json",
    ].map((fileName) => writeFile(path.join(artifactRoot, fileName), "{}")),
    writeFile(path.join(artifactRoot, "triviews/whitebox-triview-manifest.json"), JSON.stringify({
      whiteboxTriviews: [{ visualTargetId: "player-subject" }],
    })),
    writeFile(path.join(artifactRoot, "opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "visual-generation-prompts.json"), "{}"),
    writeFile(path.join(artifactRoot, "styled-opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "triviews/player-subject/styled-triview.png"), png),
    writeFile(path.join(artifactRoot, "styled-triviews-manifest.json"), "{}"),
    writeFile(path.join(artifactRoot, "styled-triviews-report.json"), "{}"),
  ]);
  const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  await writeFile(recordPath, JSON.stringify({
    ...record,
    status: "running",
    stage: "visual-imagegen",
    failedStage: null,
    attempt: 1,
    startedAt: new Date(Date.now() + 60_000).toISOString(),
    captureStatus: "passed",
    outcome: null,
    error: null,
  }));

  const recoveredStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const recoveredOrigin = await listen(recoveredStudio);
  try {
    const detail = await (await fetch(`${recoveredOrigin}/api/worlds/${created.id}`)).json();
    assert.equal(detail.world.status, "interrupted");
    assert.notEqual(detail.world.outcome, "passed");
  } finally {
    await recoveredStudio.shutdown();
  }
});

test("does not import a three-file artifact fragment as a passed world", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const sceneId = "partial-import-world";
  const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", sceneId);
  await mkdir(path.join(artifactRoot, "triviews"), { recursive: true });
  await Promise.all([
    writeFile(path.join(artifactRoot, "scene-brief.md"), "# WorldKit Scene Brief\n"),
    writeFile(path.join(artifactRoot, "authoring.json"), JSON.stringify({
      kind: "worldkit-authoring-spec",
      schemaVersion: 4,
      id: sceneId,
    })),
    writeFile(path.join(artifactRoot, "triviews/whitebox-triview-manifest.json"), JSON.stringify({
      kind: "worldkit-whitebox-triview-manifest",
      schemaVersion: 1,
      executionPlanHash: `sha256:${"a".repeat(64)}`,
      whiteboxTriviews: [],
    })),
  ]);

  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const payload = await (await fetch(`${origin}/api/worlds`)).json();
    assert.deepEqual(payload.worlds, []);
  } finally {
    await studio.shutdown();
  }
});

test("imports a complete current whitebox chain with passed trusted receipts", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const sceneId = "trusted-import-world";
  await writeTrustedWhiteboxArtifacts(fakeRepoRoot, sceneId);

  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const payload = await (await fetch(`${origin}/api/worlds`)).json();
    assert.equal(payload.worlds.length, 1);
    assert.equal(payload.worlds[0].sceneId, sceneId);
    assert.equal(payload.worlds[0].status, "ready");
    assert.equal(payload.worlds[0].outcome, "passed");
  } finally {
    await studio.shutdown();
  }
});

test("requires an exact same-world passed Route report when Builder declares Required Routes", async () => {
  for (const [routeReportMode, shouldImport] of [
    ["missing", false],
    ["mismatched", false],
    ["failed", false],
    ["exact", true],
  ]) {
    const dataRoot = await temporaryRoot(`.test-data-route-${routeReportMode}-`);
    const fakeRepoRoot = await temporaryRoot(`.test-repo-route-${routeReportMode}-`);
    const sceneId = `route-${routeReportMode}-world`;
    await writeTrustedWhiteboxArtifacts(fakeRepoRoot, sceneId, {
      requiresRouteValidation: true,
      routeReportMode,
    });

    const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
    const origin = await listen(studio);
    try {
      const payload = await (await fetch(`${origin}/api/worlds`)).json();
      assert.equal(payload.worlds.some((world) => world.sceneId === sceneId), shouldImport);
    } finally {
      await studio.shutdown();
    }
  }
});

test("recovers fresh visual outputs only when current trusted receipts are passed", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const firstStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const firstOrigin = await listen(firstStudio);
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const created = (await (await fetch(`${firstOrigin}/api/worlds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Recover Fresh Visuals",
      prompt: "Create a playable third-person world.",
      image: { name: "reference.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
    }),
  })).json()).world;
  await firstStudio.shutdown();

  const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  const startedAt = new Date().toISOString();
  const currentRecord = {
    ...record,
    status: "running",
    stage: "visual-imagegen",
    failedStage: null,
    attempt: 1,
    startedAt,
    captureStatus: "passed",
    outcome: null,
    error: null,
  };
  await writeFile(recordPath, JSON.stringify(currentRecord));
  const { artifactRoot, captureTargets } = await writeTrustedWhiteboxArtifacts(fakeRepoRoot, created.sceneId);
  await Promise.all([
    writeFile(path.join(artifactRoot, "evaluation-run.json"), JSON.stringify({
      kind: "worldkit-evaluation-run",
      schemaVersion: 1,
      caseId: created.id,
      sceneId: created.sceneId,
      workflowPolicyVersion,
      attempt: 1,
      startedAt,
    })),
    writeFile(path.join(artifactRoot, "visual-generation-prompts.json"), "{}"),
    writeFile(path.join(artifactRoot, "styled-opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "styled-opening-frame-manifest.json"), JSON.stringify({
      kind: "worldkit-styled-opening-frame-manifest",
      schemaVersion: 1,
      sceneId: created.sceneId,
      status: "passed",
    })),
    writeFile(path.join(artifactRoot, "styled-opening-frame-report.json"), JSON.stringify({
      kind: "worldkit-styled-opening-frame-report",
      schemaVersion: 1,
      sceneId: created.sceneId,
      status: "passed",
    })),
    writeFile(path.join(artifactRoot, "styled-triviews-manifest.json"), JSON.stringify({
      kind: "worldkit-styled-triview-manifest",
      schemaVersion: 1,
      sceneId: created.sceneId,
      status: "passed",
    })),
    writeFile(path.join(artifactRoot, "styled-triviews-report.json"), JSON.stringify({
      kind: "worldkit-styled-triview-report",
      schemaVersion: 1,
      sceneId: created.sceneId,
      status: "passed",
    })),
    ...captureTargets.whiteboxTriviews.map((target) =>
      writeFile(path.join(artifactRoot, "triviews", target.visualTargetId, "styled-triview.png"), png)),
  ]);

  const recoveredStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const recoveredOrigin = await listen(recoveredStudio);
  try {
    const detail = await (await fetch(`${recoveredOrigin}/api/worlds/${created.id}`)).json();
    assert.equal(detail.world.status, "ready");
    assert.equal(detail.world.outcome, "passed");
    assert.equal(detail.world.error, null);
  } finally {
    await recoveredStudio.shutdown();
  }
});

test("serves Scene Brief deliverables and runtime tri-views", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const createResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Layered City", prompt: "Create bridges, towers, terrain and a continuous route." }),
    });
    const created = (await createResponse.json()).world;
    const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", created.sceneId);
    const planRoot = path.join(fakeRepoRoot, "apps/playground/public/scene-plans", created.sceneId);
    await mkdir(path.join(artifactRoot, "triviews", "player-subject"), { recursive: true });
    await mkdir(planRoot, { recursive: true });
    await Promise.all([
      writeFile(path.join(artifactRoot, "scene-brief.md"), "# WorldKit Scene Brief\n\n## 场景\n分层城市\n"),
      writeFile(path.join(artifactRoot, "visual-identity-palette.json"), "{}"),
      writeFile(path.join(artifactRoot, "authoring.json"), "{}"),
      writeFile(path.join(artifactRoot, "scene-implementation-map.json"), JSON.stringify({
        visualCaptureGroups: [{
          visualTargetId: "player-subject",
          runtimeEntityIds: ["player", "player-accessory"],
          role: "primary-subject",
          semanticClassId: "subject.player",
          identityColor: "#E85D5D",
        }],
      })),
      writeFile(path.join(artifactRoot, "world.build.json"), "{}"),
      writeFile(path.join(artifactRoot, "opening-frame.png"), Buffer.from("89504e470d0a1a0a", "hex")),
      writeFile(path.join(artifactRoot, "runtime-snapshot.json"), "{}"),
      writeFile(path.join(artifactRoot, "triviews", "whitebox-triview-manifest.json"), JSON.stringify({
        whiteboxTriviews: [{
          visualTargetId: "player-subject",
          runtimeEntityIds: ["player", "player-accessory"],
          role: "primary-subject",
          semanticClassId: "subject.player",
          identityColor: "#E85D5D",
        }],
      })),
      writeFile(path.join(artifactRoot, "triviews", "player-subject", "whitebox-triview.png"), Buffer.from("89504e470d0a1a0a", "hex")),
      writeFile(path.join(artifactRoot, "triviews", "player-subject", "styled-triview.png"), Buffer.from("89504e470d0a1a0a", "hex")),
      writeFile(path.join(planRoot, "world-plan.png"), Buffer.from("89504e470d0a1a0a", "hex")),
      writeFile(path.join(planRoot, "entry-whitebox-target.png"), Buffer.from("89504e470d0a1a0a", "hex")),
    ]);
    const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    await writeFile(recordPath, JSON.stringify({
      ...record, status: "ready", stage: "ready", outcome: "passed",
      captureRequired: false, captureStatus: "passed", workflowPolicyVersion,
      styledOpeningFrameRequired: false,
      styledTriviewsRequired: false,
    }));

    const detail = await (await fetch(`${origin}/api/worlds/${created.id}`)).json();
    assert.equal(detail.world.previewUrl, `/play?authoring=1&world=${created.id}`);
    assert.equal(detail.media.prototypes[0].id, "player-subject");
    assert.equal(detail.media.prototypes[0].memberCount, 2);
    assert.equal(detail.media.prototypes[0].role, "primary-subject");
    assert.equal(detail.media.prototypes[0].styledUrl, `/api/worlds/${created.id}/styled-triviews/player-subject`);
    assert.equal(detail.media.trajectory.stages.find(({ id }) => id === "runtime-capture").status, "complete");
    assert.ok(detail.media.deliverables.some(({ id, status }) => id === "scene-brief" && status === "available"));
    const triView = await fetch(`${origin}/api/worlds/${created.id}/triviews/player-subject`);
    assert.equal(triView.status, 200);
    assert.equal(triView.headers.get("content-type"), "image/png");
    const styledTriView = await fetch(`${origin}/api/worlds/${created.id}/styled-triviews/player-subject`);
    assert.equal(styledTriView.status, 200);
    assert.equal(styledTriView.headers.get("content-type"), "image/png");
  } finally {
    await studio.shutdown();
  }
});

test("serves one atomic Preview bootstrap and removes split Preview authority routes", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Atomic Preview", prompt: "Create one closed Preview world." }),
    })).json()).world;
    const startedAt = "2026-08-25T09:00:00.000Z";
    const authoringSpec = {
      kind: "worldkit-authoring-spec",
      schemaVersion: 4,
      id: created.sceneId,
      seed: 25,
    };
    const authoringSpecHash = `sha256:${createHash("sha256")
      .update(canonicalJson(authoringSpec))
      .digest("hex")}`;
    const implementationMap = {
      kind: "worldkit-scene-brief-implementation-map",
      schemaVersion: 1,
      sceneId: created.sceneId,
      sceneBriefHash: `sha256:${"b".repeat(64)}`,
      authoringSpecId: created.sceneId,
      authoringSpecHash,
      visualTargetMappings: [{ visualTargetId: "player-subject", runtimeEntityIds: ["player"] }],
      visualCaptureGroups: [{
        visualTargetId: "player-subject",
        runtimeEntityIds: ["player"],
        role: "primary-subject",
        semanticClassId: "subject.player",
        identityColor: "#E85D5D",
      }],
    };
    const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", created.sceneId);
    const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    await mkdir(artifactRoot, { recursive: true });
    await Promise.all([
      writeFile(path.join(artifactRoot, "authoring.json"), JSON.stringify(authoringSpec)),
      writeFile(
        path.join(artifactRoot, "scene-implementation-map.json"),
        JSON.stringify(implementationMap),
      ),
      writeFile(path.join(artifactRoot, "evaluation-run.json"), JSON.stringify({
        kind: "worldkit-evaluation-run",
        schemaVersion: 1,
        caseId: created.id,
        sceneId: created.sceneId,
        workflowPolicyVersion,
        attempt: 1,
        startedAt,
      })),
      writeFile(recordPath, JSON.stringify({
        ...record,
        status: "ready",
        stage: "ready",
        outcome: "passed",
        captureStatus: "passed",
        attempt: 1,
        startedAt,
        workflowPolicyVersion,
      })),
    ]);

    const bootstrapResponse = await fetch(
      `${origin}/api/worlds/${created.id}/preview-bootstrap`,
    );
    assert.equal(
      bootstrapResponse.status,
      200,
      JSON.stringify(await bootstrapResponse.clone().json()),
    );
    assert.equal(bootstrapResponse.headers.get("cache-control"), "no-store");
    assert.deepEqual(await bootstrapResponse.json(), {
      kind: "worldkit-studio-preview-bootstrap",
      schemaVersion: 1,
      worldId: created.id,
      sceneId: created.sceneId,
      attempt: 1,
      attemptStartedAt: startedAt,
      authoringSpecHash,
      authoringSpec,
      implementationMap,
    });

    await writeFile(path.join(artifactRoot, "evaluation-run.json"), JSON.stringify({
      kind: "worldkit-evaluation-run",
      schemaVersion: 1,
      caseId: created.id,
      sceneId: created.sceneId,
      workflowPolicyVersion,
      attempt: 2,
      startedAt,
    }));
    const staleResponse = await fetch(`${origin}/api/worlds/${created.id}/preview-bootstrap`);
    assert.equal(staleResponse.status, 409);
    assert.equal((await staleResponse.json()).code, "STUDIO_PREVIEW_ATTEMPT_DRIFT");

    await rm(path.join(artifactRoot, "scene-implementation-map.json"));
    const missingResponse = await fetch(`${origin}/api/worlds/${created.id}/preview-bootstrap`);
    assert.equal(missingResponse.status, 404);
    assert.equal((await missingResponse.json()).code, "STUDIO_PREVIEW_NOT_FOUND");

    assert.equal((await fetch(`${origin}/api/worlds/${created.id}/authoring-spec`)).status, 404);
    assert.equal(
      (await fetch(`${origin}/api/worlds/${created.id}/visual-capture-targets`)).status,
      404,
    );
  } finally {
    await studio.shutdown();
  }
});
